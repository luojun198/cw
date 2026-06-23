/**
 * 供应链统一单据路由 — 一期 P2 库存单据 + P3-P7 全链路
 *
 * scm_doc(头)+scm_doc_line(明细)+scm_doc_type(类型配置)，pjlb 区分类型。
 * 审核/反审核触发库存移动（scm_stock_move），计价引擎在 services/scmCosting。
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.js'
import { applyMovingAvgIn, applyMovingAvgOut, reverseDocMoves, getCostingMethod } from '../services/scmCosting.js'
import { applyPayment, reversePayment, getPartnerLedger, applyReceivableFromShipment, applyPayableFromReceipt, applyOutsourceFeePayable } from '../services/scmArAp.js'
import { assertAccountIdsInScope, type AccountScopeContext } from '../services/accountAuthorization.js'
import { maintainDocBatches, reverseDocBatches } from '../services/scmBatch.js'
import { maintainDocSerials, reverseDocSerials } from '../services/scmSerial.js'

const router = Router()
router.use(authMiddleware)

// ── 权限守卫（细化：业务域 + 操作权限，admin '*' 放行） ──────────────────
// 单据类型 → 业务域（与 seedDocTypes 的 category 保持一致）
const CODE_CATEGORY: Record<string, string> = {
  IS: 'inventory', OI: 'inventory', OO: 'inventory', TR: 'inventory', CK: 'inventory',
  PI: 'purchase', PR: 'purchase', PQ: 'purchase', PO: 'purchase', RP: 'purchase',
  SO: 'sale', SR: 'sale', SQ: 'sale', SOa: 'sale', RS: 'sale',
  PL: 'production', PF: 'production', PS: 'production', PB: 'production', PJ: 'production', AS: 'production', DS: 'production',
  WO: 'outsource', WI: 'outsource',
  PAY: 'finance', RCV: 'finance',
}
// 业务域 → 权限码
const CATEGORY_PERM: Record<string, string> = {
  inventory: 'scm:inventory', purchase: 'scm:purchase', sale: 'scm:sale',
  production: 'scm:production', outsource: 'scm:outsource', finance: 'scm:arap',
}
// 由单据 id 反查业务域（用于 /scm/docs/:id[/op]）
function docCategoryById(req: AuthRequest): string | undefined {
  const m = req.path.match(/^\/scm\/docs\/([0-9a-fA-F-]{8,})/)
  if (!m) return undefined
  try {
    const row = getDb().prepare('SELECT doc_type FROM scm_doc WHERE id=? AND account_set_id=?')
      .get(m[1], req.accountSetId || '') as { doc_type?: string } | undefined
    return row?.doc_type ? CODE_CATEGORY[row.doc_type] : undefined
  } catch { return undefined }
}
router.use((req: AuthRequest, res, next) => {
  const p = req.path
  if (!p.startsWith('/scm/')) return next()
  if (req.permissions?.includes('*')) return next()
  const has = (perm: string) => !!req.permissions?.includes(perm)
  const deny = () => res.status(403).json({ code: 403, message: '无此操作权限' })

  let needAny: string[] | null = null   // 业务域权限（任一即可）
  let needAction: string | null = null  // 审核/删除等操作权限

  if (p === '/scm/docs/types' || p === '/scm/docs/next-no' || p === '/scm/boms/next-no') {
    return next()                        // 读类型/取号：任意已登录放行
  } else if (p === '/scm/docs/seed') {
    needAny = ['scm:import']
  } else if (p.startsWith('/scm/docs')) {
    let cat: string | undefined
    if (req.method === 'POST' && p === '/scm/docs') {
      cat = CODE_CATEGORY[String(req.body?.doc_type || '')]
    } else if (/^\/scm\/docs\/[0-9a-fA-F-]{8,}/.test(p)) {
      cat = docCategoryById(req)
    } else {
      cat = CODE_CATEGORY[String(req.query?.doc_type || '')]  // 列表按筛选域
    }
    needAny = cat ? [CATEGORY_PERM[cat]] : null
    if (/\/(audit|unaudit)$/.test(p)) needAction = 'scm:audit'
    else if (req.method === 'DELETE') needAction = 'scm:delete'
  } else if (p.startsWith('/scm/boms') || p.startsWith('/scm/production-plans')) {
    needAny = ['scm:production', 'scm:outsource']  // BOM/工单为生产、委外共用
    if (req.method === 'DELETE') needAction = 'scm:delete'
  } else if (p.startsWith('/scm/arap')) {
    needAny = ['scm:arap']
  } else {
    return next()                        // 其余 /scm/* 由各自路由文件守卫
  }

  if (needAny && !needAny.some(has)) return deny()
  if (needAction && !has(needAction)) return deny()
  next()
})

const asid = (req: AuthRequest) => req.accountSetId || ''
const userName = (req: AuthRequest) => (req as any).userName || '系统'

// seed doc types from ACD dj_lx + extended types
function seedDocTypes(db: ReturnType<typeof getDb>, accountSetId: string) {
  const seeds = [
    // inventory
    { code: 'IS', name: '期初入库',     dir: 'in',  stock: 1, ar_ap: 0, cat: 'inventory' },
    { code: 'PI', name: '采购入库',     dir: 'in',  stock: 1, ar_ap: 0, cat: 'purchase' },
    { code: 'PR', name: '采购退货',     dir: 'out', stock: 1, ar_ap: 0, cat: 'purchase' },
    { code: 'SO', name: '销售出库',     dir: 'out', stock: 1, ar_ap: 0, cat: 'sale' },
    { code: 'SR', name: '销售退货',     dir: 'in',  stock: 1, ar_ap: 0, cat: 'sale' },
    { code: 'OI', name: '其他入库',     dir: 'in',  stock: 1, ar_ap: 0, cat: 'inventory' },
    { code: 'OO', name: '其他出库',     dir: 'out', stock: 1, ar_ap: 0, cat: 'inventory' },
    { code: 'TR', name: '调拨单',       dir: 'none', stock: 1, ar_ap: 0, cat: 'inventory' },
    { code: 'CK', name: '盘点单',       dir: 'none', stock: 1, ar_ap: 0, cat: 'inventory' },
    // production
    { code: 'PL', name: '生产领用',     dir: 'out', stock: 1, ar_ap: 0, cat: 'production' },
    { code: 'PF', name: '完工入库',     dir: 'in',  stock: 1, ar_ap: 0, cat: 'production' },
    { code: 'PS', name: '不良品入库',   dir: 'in',  stock: 1, ar_ap: 0, cat: 'production' },
    { code: 'PB', name: '补料单',       dir: 'out', stock: 1, ar_ap: 0, cat: 'production' },
    { code: 'PJ', name: '退料单',       dir: 'in',  stock: 1, ar_ap: 0, cat: 'production' },
    // outsourcing
    { code: 'WO', name: '委外发货',     dir: 'out', stock: 1, ar_ap: 0, cat: 'outsource' },
    { code: 'WI', name: '委外入库',     dir: 'in',  stock: 1, ar_ap: 0, cat: 'outsource' },
    // assembly
    { code: 'AS', name: '组装单',       dir: 'none', stock: 1, ar_ap: 0, cat: 'production' },
    { code: 'DS', name: '拆卸单',       dir: 'none', stock: 1, ar_ap: 0, cat: 'production' },
    // purchase/sale transactions (P3)
    { code: 'PQ', name: '采购询价单',   dir: 'none', stock: 0, ar_ap: 0, cat: 'purchase' },
    { code: 'PO', name: '采购订单',     dir: 'none', stock: 0, ar_ap: 0, cat: 'purchase' },
    { code: 'SQ', name: '销售报价单',   dir: 'none', stock: 0, ar_ap: 0, cat: 'sale' },
    { code: 'SOa',name: '销售订单',     dir: 'none', stock: 0, ar_ap: 0, cat: 'sale' },
    { code: 'RP', name: '采购发票',     dir: 'none', stock: 0, ar_ap: 1, cat: 'purchase' },
    { code: 'RS', name: '销售发票',     dir: 'none', stock: 0, ar_ap: 1, cat: 'sale' },
    { code: 'PAY',name: '付款单',       dir: 'none', stock: 0, ar_ap: 1, cat: 'finance' },
    { code: 'RCV',name: '收款单',       dir: 'none', stock: 0, ar_ap: 1, cat: 'finance' },
  ]
  const ins = db.prepare(
    'INSERT OR IGNORE INTO scm_doc_type (id, account_set_id, code, name, direction, affects_stock, affects_ar_ap, category) VALUES (?,?,?,?,?,?,?,?)'
  )
  for (const s of seeds) {
    ins.run(uuidv4(), accountSetId, s.code, s.name, s.dir, s.stock, s.ar_ap, s.cat)
  }
  return seeds.length
}

// auto-number: YYYYMM-code-001
// 单据编号：按参数 scm:doc_no_rule 模板生成，支持 {YYYY}{YY}{MM}{DD}{CODE}{SEQ:n}
// 默认 {YYYY}{MM}-{CODE}-{SEQ:3} 等价于历史 YYYYMM-CODE-001
function nextDocNo(db: ReturnType<typeof getDb>, accountSetId: string, docTypeCode: string): string {
  const now = new Date()
  const ruleRow = db.prepare("SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='scm:doc_no_rule'").get(accountSetId) as any
  let rule = String(ruleRow?.param_value || '').trim() || '{YYYY}{MM}-{CODE}-{SEQ:3}'
  if (!/\{SEQ(:\d+)?\}/.test(rule)) rule += '-{SEQ:3}'  // 规则缺序号则补在末尾
  const YYYY = String(now.getFullYear()); const YY = YYYY.slice(2)
  const MM = String(now.getMonth() + 1).padStart(2, '0'); const DD = String(now.getDate()).padStart(2, '0')
  const tmpl = rule.replace(/\{YYYY\}/g, YYYY).replace(/\{YY\}/g, YY).replace(/\{MM\}/g, MM).replace(/\{DD\}/g, DD).replace(/\{CODE\}/g, docTypeCode)
  const seqM = tmpl.match(/\{SEQ(?::(\d+))?\}/)!
  const seqWidth = seqM[1] ? parseInt(seqM[1]) : 3
  const prefix = tmpl.slice(0, tmpl.indexOf(seqM[0]))
  const rows = db.prepare(
    'SELECT doc_no FROM scm_doc WHERE account_set_id=? AND doc_type=? AND doc_no LIKE ?'
  ).all(accountSetId, docTypeCode, `${prefix}%`) as Array<{ doc_no: string }>
  let max = 0
  for (const r of rows) {
    const m = r.doc_no.slice(prefix.length).match(/^(\d+)/)
    if (m) max = Math.max(max, parseInt(m[1]))
  }
  return tmpl.replace(seqM[0], String(max + 1).padStart(seqWidth, '0'))
}

// helper: lookup item by code → { id, name, inv_account, sale_account, ... }
function getItem(db: ReturnType<typeof getDb>, accountSetId: string, code: string) {
  return db.prepare('SELECT * FROM scm_item WHERE account_set_id=? AND code=?').get(accountSetId, code) as any
}

// 折扣口径（中国式「折」）：折率 dr ∈ (0,10]，N折=价格×N/10；dr<=0 表示不折扣（原价）。
function discountFactor(dr: number): number {
  const n = Number(dr) || 0
  return n > 0 ? n / 10 : 1
}
function round2(n: number): number { return Math.round(n * 100) / 100 }
function r6(n: number): number { return Math.round(n * 1000000) / 1000000 }

/**
 * 完工入库成本结转（实际成本·按计划数分摊，末批吸收差异）。
 * @returns isLast 是否末批；unitCost 单位成本=已领成本/计划数；thisAmount 本次入库金额；perUnit 入库单位成本
 */
export function computeFinishCost(p: { issuedCost: number; planQty: number; wipBefore: number; finishedBefore: number; thisQty: number }) {
  const isLast = p.planQty > 0 && (p.finishedBefore + p.thisQty) >= p.planQty - 1e-6
  const unitCost = p.planQty > 0 ? round2(p.issuedCost / p.planQty) : 0
  let thisAmount = isLast ? p.wipBefore : Math.min(round2(p.thisQty * unitCost), p.wipBefore)
  if (thisAmount < 0) thisAmount = 0
  const perUnit = p.thisQty > 0 ? round2(thisAmount / p.thisQty) : 0
  return { isLast, unitCost, thisAmount, perUnit }
}
// 行金额=数量×单价×折率系数；折扣额=原价-折后金额
function lineAmountWithDiscount(qty: number, price: number, dr: number): { amount: number; discount_amount: number } {
  const gross = (Number(qty) || 0) * (Number(price) || 0)
  const amount = round2(gross * discountFactor(dr))
  return { amount, discount_amount: round2(gross - amount) }
}

// 明细行落库列（create/update 共用，确保扩展字段不丢失）
const DOC_LINE_COLUMNS = [
  'id', 'account_set_id', 'doc_id', 'seq', 'item_code', 'warehouse_code', 'qty', 'price', 'amount',
  'tax_rate', 'tax_amount', 'unit_cost', 'batch_no', 'source_line_id', 'remark',
  'discount_rate', 'discount_amount', 'price_with_tax', 'spec', 'unit', 'expire_date', 'produce_date',
  'gift_flag', 'ref_no', 'scrap_rate', 'process_fee', 'field_values', 'supplier_code', 'source_type', 'serial_nos', 'bin_no',
]
function prepareDocLineInsert(db: ReturnType<typeof getDb>) {
  return db.prepare(
    `INSERT INTO scm_doc_line (${DOC_LINE_COLUMNS.join(',')}) VALUES (${DOC_LINE_COLUMNS.map(() => '?').join(',')})`
  )
}
// 缺料单（MR）保存时：空的供应商/来源按物料档案默认值回填（仅补空，不覆盖已填）。
// 物料档案 supplier_code 同时承载采购供应商与委外外协厂，按 source_type 区分用途。
function fillMrLineDefaults(db: ReturnType<typeof getDb>, aid: string, docType: string, lines: any[]) {
  if (docType !== 'MR' || !Array.isArray(lines) || !lines.length) return
  const codes = Array.from(new Set(lines.map(l => l && l.item_code).filter(Boolean)))
  if (!codes.length) return
  const ph = codes.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT code, supplier_code, source_type FROM scm_item WHERE account_set_id=? AND code IN (${ph})`
  ).all(aid, ...codes) as any[]
  const byCode = new Map(rows.map(r => [r.code, r]))
  for (const l of lines) {
    const it = byCode.get(l.item_code)
    if (!it) continue
    if (!l.supplier_code) l.supplier_code = it.supplier_code || ''
    if (!l.source_type) l.source_type = it.source_type || 'purchase'
  }
}

// 组装一行明细的落库值（含按折扣口径算好的金额）；返回 { values, qty, amount } 供累计合计
function buildDocLineRow(aid: string, docId: string, seq: number, l: any, headerWh?: string | null) {
  const q = Number(l.qty) || 0
  const p = Number(l.price) || 0
  const dr = Number(l.discount_rate) || 0
  const { amount, discount_amount } = lineAmountWithDiscount(q, p, dr)
  const fv = l.field_values && typeof l.field_values === 'object'
    ? JSON.stringify(l.field_values)
    : (l.field_values ?? '{}')
  const values = [
    uuidv4(), aid, docId, seq, l.item_code, l.warehouse_code || headerWh || null, q, p, amount,
    l.tax_rate ?? null, l.tax_amount ?? 0, l.unit_cost ?? 0, l.batch_no ?? null, l.source_line_id ?? null, l.remark ?? null,
    dr, discount_amount, Number(l.price_with_tax) || 0, l.spec ?? null, l.unit ?? null, l.expire_date ?? null, l.produce_date ?? null,
    l.gift_flag ? 1 : 0, l.ref_no ?? null, Number(l.scrap_rate) || 0, Number(l.process_fee) || 0, fv, l.supplier_code ?? null, l.source_type ?? null,
    Array.isArray(l.serial_nos) ? JSON.stringify(l.serial_nos) : (l.serial_nos ?? null),
    l.bin_no ?? null,
  ]
  return { values, qty: q, amount }
}

// 单据表头扩展字段（scm_doc 已有列）：create/update 统一落库，避免漏写导致业务员等录入即丢
const DOC_HEADER_EXTRA_COLUMNS = [
  'biz_person', 'payment_type', 'settle_account', 'invoice_type', 'invoice_no', 'invoice_date',
  'contract_no', 'currency', 'exchange_rate', 'expect_date', 'credit_days', 'dest_warehouse_code', 'total_tax',
  'io_category', 'transport_method',
]
function docHeaderExtraValues(b: any) {
  return [
    b.biz_person ?? null, b.payment_type ?? null, b.settle_account ?? null,
    b.invoice_type ?? null, b.invoice_no ?? null, b.invoice_date ?? null,
    b.contract_no ?? null, b.currency || 'CNY', Number(b.exchange_rate) || 1,
    b.expect_date ?? null, Number(b.credit_days) || 0, b.dest_warehouse_code ?? null, Number(b.total_tax) || 0,
    b.io_category ?? null, b.transport_method ?? null,
  ]
}

// ── Doc type list ───────────────────────────────────────
router.get('/scm/docs/types', (req: AuthRequest, res) => {
  const db = getDb()
  let list = db.prepare('SELECT * FROM scm_doc_type WHERE account_set_id=? ORDER BY category, code').all(asid(req))
  if (!list.length) { seedDocTypes(db, asid(req)); list = db.prepare('SELECT * FROM scm_doc_type WHERE account_set_id=? ORDER BY category, code').all(asid(req)) }
  res.json({ code: 0, data: list })
})

router.post('/scm/docs/seed', (req: AuthRequest, res) => {
  res.json({ code: 0, data: { seeded: seedDocTypes(getDb(), asid(req)) } })
})

// ── Doc CRUD ────────────────────────────────────────────
router.get('/scm/docs/next-no', (req: AuthRequest, res) => {
  res.json({ code: 0, data: { next_no: nextDocNo(getDb(), asid(req), (req.query.doc_type as string) || 'PI') } })
})

// 列表富行查询（列表 + 上下游追溯共用）：带往来单位/仓库名、下推进度、各类关联计数。
// whereSql 用 d.* 别名；tail 可附 ORDER BY / LIMIT / OFFSET（其参数追加在 params 之后）。
function queryDocRows(db: ReturnType<typeof getDb>, whereSql: string, params: any[], tail = ''): any[] {
  const rows = db.prepare(`
    SELECT d.*, p.name AS partner_name, w.name AS warehouse_name,
           (SELECT COUNT(*) FROM scm_doc_line l WHERE l.doc_id = d.id) AS total_lines,
           (SELECT COUNT(*) FROM scm_doc_line l WHERE l.doc_id = d.id AND l.qty <= (SELECT COALESCE(SUM(l2.qty), 0) FROM scm_doc_line l2 WHERE l2.source_line_id = l.id)) AS fully_pushed_lines,
           (SELECT COUNT(*) FROM scm_doc_line l WHERE l.doc_id = d.id AND (SELECT COALESCE(SUM(l2.qty), 0) FROM scm_doc_line l2 WHERE l2.source_line_id = l.id) > 0) AS pushed_lines,
           (SELECT COALESCE(SUM(l2.qty), 0) FROM scm_doc_line l2 WHERE l2.source_line_id IN (SELECT id FROM scm_doc_line l WHERE l.doc_id = d.id)) AS pushed_qty,
           (SELECT COUNT(*) FROM scm_doc m WHERE m.account_set_id = d.account_set_id AND m.doc_type = 'MR' AND m.source_doc_id = d.id) AS shortage_doc_count,
           (SELECT m.id FROM scm_doc m WHERE m.account_set_id = d.account_set_id AND m.doc_type = 'MR' AND m.source_doc_id = d.id ORDER BY m.doc_no LIMIT 1) AS shortage_doc_id,
           (SELECT COUNT(*) FROM scm_doc x WHERE x.account_set_id = d.account_set_id AND x.source_doc_id = d.id) AS downstream_doc_count,
           (SELECT COUNT(*) FROM scm_production_plan pp WHERE pp.account_set_id = d.account_set_id AND pp.source_doc_id = d.id) AS downstream_plan_count,
           (SELECT COUNT(DISTINCT pl.doc_id) FROM scm_doc_line l JOIN scm_doc_line pl ON pl.id = l.source_line_id WHERE l.doc_id = d.id) AS upstream_doc_count,
           (SELECT COUNT(DISTINCT cl.doc_id) FROM scm_doc_line cl WHERE cl.source_line_id IN (SELECT id FROM scm_doc_line WHERE doc_id = d.id)) AS downstream_line_count
    FROM scm_doc d
    LEFT JOIN scm_partner p ON p.account_set_id=d.account_set_id AND p.code=d.partner_code
    LEFT JOIN scm_warehouse w ON w.account_set_id=d.account_set_id AND w.code=d.warehouse_code
    WHERE ${whereSql} ${tail}
  `).all(...params) as any[]
  for (const doc of rows) {
    let progress = 'none'
    if (doc.total_lines > 0) {
      if (doc.fully_pushed_lines === doc.total_lines) progress = 'full'
      else if (doc.pushed_lines > 0) progress = 'part'
    }
    doc.push_progress = progress
  }
  return rows
}

router.get('/scm/docs', (req: AuthRequest, res) => {
  const db = getDb(); const { doc_type, partner_code, warehouse_code, status, start_date, end_date, page = '1', page_size = '50' } = req.query as any
  const conds = ['d.account_set_id=?']; const ps: any[] = [asid(req)]
  if (doc_type) { conds.push('d.doc_type=?'); ps.push(doc_type) }
  if (partner_code) { conds.push('d.partner_code=?'); ps.push(partner_code) }
  if (warehouse_code) { conds.push('d.warehouse_code=?'); ps.push(warehouse_code) }
  if (status) { conds.push('d.status=?'); ps.push(status) }
  if (start_date) { conds.push('d.doc_date>=?'); ps.push(start_date) }
  if (end_date) { conds.push('d.doc_date<=?'); ps.push(end_date) }
  const where = conds.join(' AND ')
  const total = (db.prepare(`SELECT COUNT(*) c FROM scm_doc d WHERE ${where}`).get(...ps) as any).c
  const off = (parseInt(page) - 1) * parseInt(page_size)
  const list = queryDocRows(db, where, [...ps, parseInt(page_size), off], 'ORDER BY d.doc_date DESC, d.doc_no DESC LIMIT ? OFFSET ?')

  res.json({ code: 0, data: { list, total, page: parseInt(page), page_size: parseInt(page_size) } })
})

router.get('/scm/docs/:id', (req: AuthRequest, res) => {
  const db = getDb()
  const doc = db.prepare(`
    SELECT d.*, p.name AS partner_name, w.name AS warehouse_name, dw.name AS dest_warehouse_name
    FROM scm_doc d
    LEFT JOIN scm_partner p ON p.account_set_id=d.account_set_id AND p.code=d.partner_code
    LEFT JOIN scm_warehouse w ON w.account_set_id=d.account_set_id AND w.code=d.warehouse_code
    LEFT JOIN scm_warehouse dw ON dw.account_set_id=d.account_set_id AND dw.code=d.dest_warehouse_code
    WHERE d.id=? AND d.account_set_id=?`).get(req.params.id, asid(req)) as any
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })
  
  // 每一行加上 pushed_qty
  const lines = db.prepare(`
    SELECT l.*, i.name AS item_name, i.spec, i.unit,
           i.supplier_code AS item_supplier, i.source_type AS item_source_type,
           (SELECT COALESCE(SUM(l2.qty), 0) FROM scm_doc_line l2 WHERE l2.source_line_id = l.id) AS pushed_qty
    FROM scm_doc_line l
    LEFT JOIN scm_item i ON i.account_set_id=l.account_set_id AND i.code=l.item_code
    WHERE l.doc_id=? ORDER BY l.seq
  `).all(req.params.id) as any[]

  // 上游来源（行级，去重）：本单各行 source_line_id → 父行所属单据，支持多对一合并
  const source_docs = db.prepare(`
    SELECT DISTINCT d.id, d.doc_no, d.doc_type, d.status
    FROM scm_doc_line l
    JOIN scm_doc_line pl ON pl.id = l.source_line_id
    JOIN scm_doc d ON d.id = pl.doc_id
    WHERE l.doc_id=? AND l.source_line_id IS NOT NULL
    ORDER BY d.doc_no
  `).all(req.params.id) as any[]
  // 兼容旧字段：单一上游（仍取单据头 source_doc_id；否则取行级第一个）
  let source_doc: any = null
  if (doc.source_doc_id) {
    source_doc = db.prepare('SELECT id, doc_no, doc_type, status FROM scm_doc WHERE id=?').get(doc.source_doc_id)
  } else if (source_docs.length) {
    source_doc = source_docs[0]
  }

  // 下游关联（行级，去重）：引用了本单任一行的下游单据，支持一对多
  const target_docs = db.prepare(`
    SELECT DISTINCT d.id, d.doc_no, d.doc_type, d.status
    FROM scm_doc_line l
    JOIN scm_doc d ON d.id = l.doc_id
    WHERE l.source_line_id IN (SELECT id FROM scm_doc_line WHERE doc_id=?)
    ORDER BY d.doc_no
  `).all(req.params.id) as any[]

  res.json({
    code: 0,
    data: {
      ...doc,
      lines,
      source_doc,
      source_docs,
      target_docs
    }
  })
})


router.post('/scm/docs', operationLog('供应链单据新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.doc_type) return res.status(400).json({ code: 400, message: '单据类型不能为空' })

  // 下推安全网（逐行）：仅允许引用「已审核」上游单据的行；并校验超额下推（支持多源合并）
  if (Array.isArray(b.lines)) {
    for (const l of b.lines) {
      if (l.source_line_id) {
        const parentLine = db.prepare(`SELECT pl.qty, pl.item_code, d.doc_no AS src_no, d.status AS src_status
          FROM scm_doc_line pl JOIN scm_doc d ON d.id=pl.doc_id WHERE pl.id=?`).get(l.source_line_id) as any
        if (parentLine) {
          if (parentLine.src_status !== 'audited') {
            return res.status(400).json({ code: 400, message: `上游单据 ${parentLine.src_no} 未审核，不可下推` })
          }
          const otherPushed = db.prepare('SELECT SUM(qty) AS s FROM scm_doc_line WHERE source_line_id=?').get(l.source_line_id) as any
          const otherPushedQty = otherPushed?.s || 0
          const currentQty = Number(l.qty) || 0
          if (otherPushedQty + currentQty > parentLine.qty) {
            return res.status(400).json({ code: 400, message: `物料 ${parentLine.item_code} 的下推数量 (${currentQty}) 加上此前已下推数 (${otherPushedQty}) 超出了上游单据的最大数量 (${parentLine.qty})` })
          }
        }
      }
    }
  }

  const docNo = nextDocNo(db, asid(req), b.doc_type)
  const docId = uuidv4()
  db.transaction(() => {
    db.prepare(`INSERT INTO scm_doc (id,account_set_id,doc_type,doc_no,doc_date,partner_code,dept_code,warehouse_code,operator,maker,status,source_doc_id,bom_id,total_qty,total_amount,remark,discount_rate,plan_id,${DOC_HEADER_EXTRA_COLUMNS.join(',')})
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${DOC_HEADER_EXTRA_COLUMNS.map(() => '?').join(',')})`).run(
      docId, asid(req), b.doc_type, docNo, b.doc_date || new Date().toISOString().slice(0, 10),
      b.partner_code ?? null, b.dept_code ?? null, b.warehouse_code ?? null,
      b.operator || userName(req), userName(req), 'draft', b.source_doc_id ?? null, b.bom_id ?? null,
      Number(b.total_qty) || 0, Number(b.total_amount) || 0, b.remark ?? null, Number(b.discount_rate) || 0, b.plan_id ?? null,
      ...docHeaderExtraValues(b)
    )
    if (Array.isArray(b.lines)) {
      fillMrLineDefaults(db, asid(req), b.doc_type, b.lines)
      const ins = prepareDocLineInsert(db)
      let seq = 0; let tq = 0; let ta = 0
      for (const l of b.lines) {
        seq++
        const row = buildDocLineRow(asid(req), docId, seq, l, b.warehouse_code)
        ins.run(...row.values)
        tq += row.qty; ta += row.amount
      }
      // 整单折扣（折）作用于合计
      const total = round2(ta * discountFactor(Number(b.discount_rate) || 0))
      db.prepare('UPDATE scm_doc SET total_qty=?,total_amount=? WHERE id=?').run(tq, total, docId)
    }
  })()
  res.json({ code: 0, data: { id: docId, doc_no: docNo } })
})

router.put('/scm/docs/:id', operationLog('供应链单据修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  const ex = db.prepare('SELECT id, status FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, asid(req)) as any
  if (!ex) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (ex.status !== 'draft') return res.status(400).json({ code: 400, message: '仅草稿状态可修改' })

  // 检查是否已被下游引用
  const isReferenced = db.prepare(`
    SELECT COUNT(*) c FROM scm_doc_line WHERE source_line_id IN (SELECT id FROM scm_doc_line WHERE doc_id = ?)
  `).get(req.params.id) as any
  if (isReferenced && isReferenced.c > 0) {
    return res.status(400).json({ code: 400, message: '该单据已被下游单据引用，不可修改' })
  }

  // 下推安全网（逐行）+ 超额下推校验（支持多源合并）
  if (Array.isArray(b.lines)) {
    for (const l of b.lines) {
      if (l.source_line_id) {
        const parentLine = db.prepare(`SELECT pl.qty, pl.item_code, d.doc_no AS src_no, d.status AS src_status
          FROM scm_doc_line pl JOIN scm_doc d ON d.id=pl.doc_id WHERE pl.id=?`).get(l.source_line_id) as any
        if (parentLine) {
          if (parentLine.src_status !== 'audited') {
            return res.status(400).json({ code: 400, message: `上游单据 ${parentLine.src_no} 未审核，不可下推` })
          }
          const otherPushed = db.prepare('SELECT SUM(qty) AS s FROM scm_doc_line WHERE source_line_id=? AND doc_id != ?').get(l.source_line_id, req.params.id) as any
          const otherPushedQty = otherPushed?.s || 0
          const currentQty = Number(l.qty) || 0
          if (otherPushedQty + currentQty > parentLine.qty) {
            return res.status(400).json({ code: 400, message: `物料 ${parentLine.item_code} 的下推数量 (${currentQty}) 加上此前已下推数 (${otherPushedQty}) 超出了上游单据的最大数量 (${parentLine.qty})` })
          }
        }
      }
    }
  }

  db.transaction(() => {
    db.prepare(`UPDATE scm_doc SET doc_date=?,partner_code=?,dept_code=?,warehouse_code=?,operator=?,source_doc_id=?,bom_id=?,remark=?,discount_rate=?,plan_id=?,maker=COALESCE(maker,?),${DOC_HEADER_EXTRA_COLUMNS.map(c => `${c}=?`).join(',')},updated_at=datetime('now') WHERE id=?`).run(
      b.doc_date ?? null, b.partner_code ?? null, b.dept_code ?? null, b.warehouse_code ?? null, b.operator || userName(req),
      b.source_doc_id ?? null, b.bom_id ?? null, b.remark ?? null, Number(b.discount_rate) || 0, b.plan_id ?? null, userName(req),
      ...docHeaderExtraValues(b), req.params.id
    )
    if (Array.isArray(b.lines)) {
      fillMrLineDefaults(db, asid(req), b.doc_type, b.lines)
      db.prepare('DELETE FROM scm_doc_line WHERE doc_id=?').run(req.params.id)
      const ins = prepareDocLineInsert(db)
      let seq = 0; let tq = 0; let ta = 0
      for (const l of b.lines) {
        seq++
        const row = buildDocLineRow(asid(req), req.params.id, seq, l, b.warehouse_code)
        ins.run(...row.values)
        tq += row.qty; ta += row.amount
      }
      // 整单折扣（折）作用于合计
      const total = round2(ta * discountFactor(Number(b.discount_rate) || 0))
      db.prepare('UPDATE scm_doc SET total_qty=?,total_amount=? WHERE id=?').run(tq, total, req.params.id)
    }
  })()
  res.json({ code: 0, data: { ok: true } })
})

router.delete('/scm/docs/:id', operationLog('供应链单据删除', '供应链'), (req: AuthRequest, res) => {
  const db = getDb()
  const ex = db.prepare('SELECT id, status FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, asid(req)) as any
  if (!ex) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (ex.status !== 'draft') return res.status(400).json({ code: 400, message: '仅草稿状态可删除' })

  // 检查是否已被下游引用
  const isReferenced = db.prepare(`
    SELECT COUNT(*) c FROM scm_doc_line WHERE source_line_id IN (SELECT id FROM scm_doc_line WHERE doc_id = ?)
  `).get(req.params.id) as any
  if (isReferenced && isReferenced.c > 0) {
    return res.status(400).json({ code: 400, message: '该单据已被下游单据引用，不可删除' })
  }

  db.prepare('DELETE FROM scm_doc_line WHERE doc_id=?').run(req.params.id)
  db.prepare('DELETE FROM scm_doc WHERE id=?').run(req.params.id)
  res.json({ code: 0, data: { ok: true } })
})

// ── 审核/反审核（触发库存移动） ─────────────────────────
router.post('/scm/docs/:id/audit', operationLog('供应链单据审核', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (doc.status !== 'draft') return res.status(400).json({ code: 400, message: '仅草稿可审核' })

  const docType = db.prepare('SELECT * FROM scm_doc_type WHERE account_set_id=? AND code=?').get(aid, doc.doc_type) as any
  if (!docType) return res.status(400).json({ code: 400, message: '未知单据类型' })

  // 计价方式守卫：当前仅「移动加权平均」已实现，其余方式禁止过账，避免按错误口径计算成本
  if (docType.affects_stock) {
    const costing = getCostingMethod(db, aid)
    if (costing !== 'moving_avg') {
      const labels: Record<string, string> = { month_avg: '全月平均', fifo: '先进先出', lifo: '后进先出', specified: '指定成本' }
      return res.status(400).json({ code: 400, message: `当前计价方式『${labels[costing] || costing}』尚未实现，请在 系统参数→供应链 改为『移动加权平均』后再审核` })
    }
  }

  const lines = db.prepare('SELECT * FROM scm_doc_line WHERE doc_id=? ORDER BY seq').all(doc.id) as any[]

  // 销售发货单（销售出库 SO）：审核要扣库存、挂应收，故客户与仓库必填
  if (doc.doc_type === 'SO') {
    if (!doc.partner_code) return res.status(400).json({ code: 400, message: '销售出库单必须指定客户（往来单位），无法生成应收' })
    if (lines.some(l => Number(l.qty) > 0 && !l.warehouse_code)) {
      return res.status(400).json({ code: 400, message: '销售出库单每行必须指定仓库，无法扣减库存' })
    }
  }

  // stock check: outbound types need enough qty
  if (docType.direction === 'out' && docType.affects_stock) {
    for (const l of lines) {
      const s = db.prepare('SELECT qty FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?').get(aid, l.warehouse_code, l.item_code) as any
      if (!s || s.qty < l.qty) {
        const item = getItem(db, aid, l.item_code)
        return res.status(400).json({ code: 400, message: `${item?.name || l.item_code} 库存不足（当前 ${s?.qty || 0}，需 ${l.qty}）` })
      }
    }
  }

  // 组装/拆卸单：根据 BOM 审核，子件↔成品双向库存移动
  if (doc.doc_type === 'AS' || doc.doc_type === 'DS') {
    if (!doc.bom_id) return res.status(400).json({ code: 400, message: '组装/拆卸单必须指定BOM' })
    const bom = db.prepare('SELECT * FROM scm_bom WHERE id=? AND account_set_id=?').get(doc.bom_id, aid) as any
    if (!bom) return res.status(400).json({ code: 400, message: '指定的BOM不存在' })
    const bomLines = db.prepare('SELECT * FROM scm_bom_line WHERE bom_id=? ORDER BY seq').all(doc.bom_id) as any[]
    // 根据 BOM 用料比例推导成品数量
    let fpQty = 0
    for (const bl of bomLines) {
      const docLine = lines.find((l: any) => l.item_code === bl.item_code)
      if (docLine && Number(bl.qty) > 0) fpQty = Math.max(fpQty, Number(docLine.qty) / Number(bl.qty))
    }
    if (fpQty <= 0) return res.status(400).json({ code: 400, message: `无法从明细行推导成品数量，请确认BOM「${bom.code}」与行物料匹配` })
    if (doc.doc_type === 'AS') {
      // 组装：校验子件库存
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) continue
        const wh = l.warehouse_code || doc.warehouse_code
        if (!wh) return res.status(400).json({ code: 400, message: '组装单需指定仓库' })
        const s = db.prepare('SELECT qty FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?').get(aid, wh, l.item_code) as any
        if (!s || s.qty < l.qty) {
          const item = getItem(db, aid, l.item_code)
          return res.status(400).json({ code: 400, message: `子件「${item?.name || l.item_code}」库存不足（当前 ${s?.qty || 0}，需 ${l.qty}）` })
        }
      }
      if (!doc.warehouse_code) return res.status(400).json({ code: 400, message: '组装单需指定成品入库仓库' })
    } else {
      // 拆卸：校验成品库存
      const fpWh = doc.warehouse_code
      if (!fpWh) return res.status(400).json({ code: 400, message: '拆卸单需指定成品出库仓库' })
      const fpStock = db.prepare('SELECT qty FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?').get(aid, fpWh, bom.item_code) as any
      if (!fpStock || fpStock.qty < fpQty) {
        return res.status(400).json({ code: 400, message: `成品「${bom.item_code}」库存不足（当前 ${fpStock?.qty || 0}，需 ${fpQty}）` })
      }
    }
  }

  // 调拨单（TR）：约定 单据仓库=调出仓、明细行仓库=调入仓；校验调入仓与源仓库存
  if (doc.doc_type === 'TR') {
    const srcWh = doc.warehouse_code
    if (!srcWh) return res.status(400).json({ code: 400, message: '调拨单需指定调出仓（单据仓库）' })
    for (const l of lines) {
      if (!l.qty || l.qty <= 0) continue
      if (!l.warehouse_code) return res.status(400).json({ code: 400, message: '调拨单每行需指定调入仓' })
      if (l.warehouse_code === srcWh) return res.status(400).json({ code: 400, message: '调入仓与调出仓不能相同' })
      const s = db.prepare('SELECT qty FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?').get(aid, srcWh, l.item_code) as any
      if (!s || s.qty < l.qty) {
        const item = getItem(db, aid, l.item_code)
        return res.status(400).json({ code: 400, message: `${item?.name || l.item_code} 调出仓库存不足（当前 ${s?.qty || 0}，需 ${l.qty}）` })
      }
    }
  }

  // 完工入库(PF)/委外入库(WI) 关联工单：审核前校验已归集领料/发料成本（无成本不允许入库）
  if ((doc.doc_type === 'PF' || doc.doc_type === 'WI') && doc.plan_id) {
    const plan = db.prepare('SELECT plan_qty FROM scm_production_plan WHERE id=? AND account_set_id=?').get(doc.plan_id, aid) as any
    if (!plan) return res.status(400).json({ code: 400, message: '关联工单不存在' })
    const sum = getPlanCostSummary(db, aid, doc.plan_id, Number(plan.plan_qty) || 0)
    if (sum.issuedCost <= 0) return res.status(400).json({ code: 400, message: doc.doc_type === 'WI' ? '工单尚未委外发货归集成本，无法委外入库，请先审核委外发货单' : '工单尚未领料归集成本，无法完工入库，请先审核领料单' })
  }

  // 收付款单：生成往来台账 + 出纳日记账。
  // 往来款由「货物流转」驱动：销售发货(SO)→应收、采购入库(PI)→应付；发票(RP/RS)不参与往来。
  const isPayment = doc.doc_type === 'PAY' || doc.doc_type === 'RCV'

  const runAudit = db.transaction(() => {
    if (isPayment) {
      applyPayment(db, aid, doc, lines, userName(req))
    } else if (doc.doc_type === 'TR') {
      // 调拨：源仓出库取移动均价，按该成本入调入仓
      const srcWh = doc.warehouse_code
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) continue
        const docRef = { type: doc.doc_type, no: doc.doc_no, seq: l.seq, date: doc.doc_date }
        const { unitCost } = applyMovingAvgOut(db, aid, srcWh, l.item_code, l.qty, docRef)
        applyMovingAvgIn(db, aid, l.warehouse_code, l.item_code, l.qty, unitCost, docRef)
        db.prepare('UPDATE scm_doc_line SET unit_cost=? WHERE id=?').run(unitCost, l.id)
      }
    } else if (doc.doc_type === 'CK') {
      // 盘点：明细行 qty=实盘数，与账面比较，盘盈按账面均价入、盘亏出
      for (const l of lines) {
        const wh = l.warehouse_code || doc.warehouse_code
        const s = db.prepare('SELECT qty, avg_cost FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?').get(aid, wh, l.item_code) as any
        const bookQty = s?.qty || 0
        const cost = s?.avg_cost || l.unit_cost || l.price || 0
        const diff = Math.round((Number(l.qty) - bookQty) * 10000) / 10000
        const docRef = { type: doc.doc_type, no: doc.doc_no, seq: l.seq, date: doc.doc_date }
        if (diff > 0) applyMovingAvgIn(db, aid, wh, l.item_code, diff, cost, docRef)
        else if (diff < 0) applyMovingAvgOut(db, aid, wh, l.item_code, -diff, docRef)
        db.prepare('UPDATE scm_doc_line SET unit_cost=? WHERE id=?').run(cost, l.id)
      }
    } else if (doc.doc_type === 'AS') {
      // 组装：子件出库按移动均价，成品按总成本入库
      const bom = db.prepare('SELECT * FROM scm_bom WHERE id=? AND account_set_id=?').get(doc.bom_id, aid) as any
      const bomLines = db.prepare('SELECT * FROM scm_bom_line WHERE bom_id=? ORDER BY seq').all(doc.bom_id) as any[]
      let fpQty = 0
      for (const bl of bomLines) {
        const dl = lines.find((l: any) => l.item_code === bl.item_code)
        if (dl && Number(bl.qty) > 0) fpQty = Math.max(fpQty, Number(dl.qty) / Number(bl.qty))
      }
      let totalCost = 0
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) continue
        const wh = l.warehouse_code || doc.warehouse_code
        const docRef = { type: doc.doc_type, no: doc.doc_no, seq: l.seq, date: doc.doc_date }
        const { unitCost } = applyMovingAvgOut(db, aid, wh, l.item_code, l.qty, docRef)
        db.prepare('UPDATE scm_doc_line SET unit_cost=? WHERE id=?').run(unitCost, l.id)
        totalCost += unitCost * l.qty
      }
      const fpUnitCost = fpQty > 0 ? Math.round(totalCost / fpQty * 10000) / 10000 : 0
      const maxSeq = lines.reduce((max: number, l: any) => Math.max(max, l.seq || 0), 0)
      applyMovingAvgIn(db, aid, doc.warehouse_code, bom.item_code, fpQty, fpUnitCost,
        { type: doc.doc_type, no: doc.doc_no, seq: maxSeq + 1, date: doc.doc_date })
    } else if (doc.doc_type === 'DS') {
      // 拆卸：成品出库按移动均价，子件按加权比例分摊成本入库
      const bom = db.prepare('SELECT * FROM scm_bom WHERE id=? AND account_set_id=?').get(doc.bom_id, aid) as any
      const bomLines = db.prepare('SELECT * FROM scm_bom_line WHERE bom_id=? ORDER BY seq').all(doc.bom_id) as any[]
      let fpQty = 0
      for (const bl of bomLines) {
        const dl = lines.find((l: any) => l.item_code === bl.item_code)
        if (dl && Number(bl.qty) > 0) fpQty = Math.max(fpQty, Number(dl.qty) / Number(bl.qty))
      }
      const docRef0 = { type: doc.doc_type, no: doc.doc_no, seq: 0, date: doc.doc_date }
      const { unitCost: fpCost } = applyMovingAvgOut(db, aid, doc.warehouse_code, bom.item_code, fpQty, docRef0)
      const totalCost = fpCost * fpQty
      const totalBomQty = bomLines.reduce((s: number, bl: any) => s + Number(bl.qty), 0)
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) continue
        const bl = bomLines.find((x: any) => x.item_code === l.item_code)
        const ratio = bl && totalBomQty > 0 ? Number(bl.qty) / totalBomQty : 1 / Math.max(lines.length, 1)
        const allocatedUnitCost = totalCost > 0 && l.qty > 0 ? Math.round(totalCost * ratio / l.qty * 10000) / 10000 : 0
        const wh = l.warehouse_code || doc.warehouse_code
        applyMovingAvgIn(db, aid, wh, l.item_code, l.qty, allocatedUnitCost, docRef0)
        db.prepare('UPDATE scm_doc_line SET unit_cost=? WHERE id=?').run(allocatedUnitCost, l.id)
      }
    } else if ((doc.doc_type === 'PF' || doc.doc_type === 'WI') && doc.plan_id) {
      // 完工入库(PF)/委外入库(WI)：按工单归集成本结转。料单位成本=已领成本/计划数；末批吸收料WIP余额（在制归零）。
      // 委外入库另加「加工费」(行 process_fee 单价)：成品成本=料分摊+加工费；加工费生成委外厂应付。
      const plan = db.prepare('SELECT * FROM scm_production_plan WHERE id=? AND account_set_id=?').get(doc.plan_id, aid) as any
      const planQty = Number(plan?.plan_qty) || 0
      const sum = getPlanCostSummary(db, aid, doc.plan_id, planQty)  // 本次入库尚未过账
      const thisQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
      const finishedBefore = Number(plan?.finished_qty) || 0
      const { perUnit } = computeFinishCost({ issuedCost: sum.issuedCost, planQty, wipBefore: sum.wip, finishedBefore, thisQty })
      let inTotal = 0; let feeTotal = 0
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) continue
        const fee = doc.doc_type === 'WI' ? (Number(l.process_fee) || 0) : 0
        const inCost = round2(perUnit + fee)
        feeTotal = round2(feeTotal + fee * (Number(l.qty) || 0))
        inTotal = round2(inTotal + inCost * (Number(l.qty) || 0))
        const wh = l.warehouse_code || doc.warehouse_code
        applyMovingAvgIn(db, aid, wh, l.item_code, l.qty, inCost, { type: doc.doc_type, no: doc.doc_no, seq: l.seq, date: doc.doc_date })
        db.prepare('UPDATE scm_doc_line SET unit_cost=? WHERE id=?').run(inCost, l.id)
      }
      db.prepare('UPDATE scm_doc SET total_amount=? WHERE id=?').run(inTotal, doc.id)
      // 委外加工费 → 委外厂应付（doc.partner_code 已为委外厂）
      if (doc.doc_type === 'WI' && feeTotal > 0) applyOutsourceFeePayable(db, aid, doc, feeTotal)
      db.prepare('UPDATE scm_production_plan SET finished_qty=? WHERE id=? AND account_set_id=?').run(round2(finishedBefore + thisQty), doc.plan_id, aid)
    } else {
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) continue
        if (!docType.affects_stock) continue
        if (docType.direction === 'in') {
          const cost = l.unit_cost || l.price || 0
          applyMovingAvgIn(db, aid, l.warehouse_code, l.item_code, l.qty, cost, { type: doc.doc_type, no: doc.doc_no, seq: l.seq, date: doc.doc_date })
        } else if (docType.direction === 'out') {
          const { unitCost } = applyMovingAvgOut(db, aid, l.warehouse_code, l.item_code, l.qty, { type: doc.doc_type, no: doc.doc_no, seq: l.seq, date: doc.doc_date })
          db.prepare('UPDATE scm_doc_line SET unit_cost=? WHERE id=?').run(unitCost, l.id)
        }
      }
    }
    // 销售发货单（SO）→ 应收；采购入库单（PI）→ 应付（按货物金额，不含税；发票不参与往来）
    if (doc.doc_type === 'SO') {
      applyReceivableFromShipment(db, aid, doc, lines)
    } else if (doc.doc_type === 'PI') {
      applyPayableFromReceipt(db, aid, doc, lines)
    }
    // 批次/保质期追溯（启用批次的物料）：与移动平均成本并行维护，出库不足会抛错回滚
    if (docType.affects_stock) maintainDocBatches(db, aid, doc.id)
    // 序列号追溯（启用序列号的物料）：个数须等于数量，入库登记/出库核销，异常回滚
    if (docType.affects_stock) maintainDocSerials(db, aid, doc.id)
    db.prepare("UPDATE scm_doc SET status='audited', auditor=?, audited_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(userName(req), doc.id)
  })
  try {
    runAudit()
  } catch (e: any) {
    // 批次/序列号等业务校验失败：整单已回滚，返回 400 提示
    return res.status(400).json({ code: 400, message: e?.message || '审核失败' })
  }
  res.json({ code: 0, data: { ok: true } })
})

router.post('/scm/docs/:id/unaudit', operationLog('供应链单据反审核', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (doc.status !== 'audited') return res.status(400).json({ code: 400, message: '仅已审核可反审核' })

  // 检查是否已被下游引用
  const isReferenced = db.prepare(`
    SELECT COUNT(*) c FROM scm_doc_line WHERE source_line_id IN (SELECT id FROM scm_doc_line WHERE doc_id = ?)
  `).get(req.params.id) as any
  if (isReferenced && isReferenced.c > 0) {
    return res.status(400).json({ code: 400, message: '该单据已被下游单据引用，无法反审核' })
  }

  const docType = db.prepare('SELECT * FROM scm_doc_type WHERE account_set_id=? AND code=?').get(aid, doc.doc_type) as any
  if (doc.doc_type === 'PAY' || doc.doc_type === 'RCV' || doc.doc_type === 'RP' || doc.doc_type === 'RS') {
    reversePayment(db, aid, doc)
  } else {
    // 销售发货(SO)→回滚应收、采购入库(PI)→回滚应付（reversePayment 按 doc_no 删除往来台账，无出纳流水，安全）
    if (doc.doc_type === 'SO' || doc.doc_type === 'PI') reversePayment(db, aid, doc)
    // 委外入库(WI) 反审核：回退委外厂应付（reversePayment 按 doc_no 删除往来台账）
    if (doc.doc_type === 'WI') reversePayment(db, aid, doc)
    if (docType?.affects_stock) reverseDocMoves(db, aid, doc.id)
    // 批次台账回退（与库存移动回退并行）
    if (docType?.affects_stock) reverseDocBatches(db, aid, doc.id)
    // 序列号台账回退
    if (docType?.affects_stock) reverseDocSerials(db, aid, doc.id)
    // 完工入库(PF)/委外入库(WI) 反审核：回退工单完工数
    if ((doc.doc_type === 'PF' || doc.doc_type === 'WI') && doc.plan_id) {
      const pfQty = (db.prepare('SELECT COALESCE(SUM(qty),0) q FROM scm_doc_line WHERE doc_id=?').get(doc.id) as any)?.q || 0
      db.prepare("UPDATE scm_production_plan SET finished_qty = MAX(0, COALESCE(finished_qty,0) - ?) WHERE id=? AND account_set_id=?").run(pfQty, doc.plan_id, aid)
    }
  }
  db.prepare("UPDATE scm_doc SET status='draft', auditor=NULL, audited_at=NULL, updated_at=datetime('now') WHERE id=?").run(doc.id)
  res.json({ code: 0, data: { ok: true } })
})

// ── 采购资产入库：生成资产卡片（P5 凭证联动留 P5 完善） ──
router.post('/scm/docs/:id/gen-assets', operationLog('采购资产生成', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc || doc.status !== 'audited') return res.status(400).json({ code: 400, message: '单据未审核' })
  if (doc.doc_type !== 'PI') return res.status(400).json({ code: 400, message: '仅采购入库可生成资产' })

  const lines = db.prepare('SELECT * FROM scm_doc_line WHERE doc_id=?').all(doc.id) as any[]
  const assetLines = lines.filter(l => { const item = getItem(db, aid, l.item_code); return item?.is_asset === 1 })

  let created = 0
  for (const l of assetLines) {
    const item = getItem(db, aid, l.item_code)
    const assetNo = `CG-${doc.doc_no}-${l.seq}`
    if (db.prepare('SELECT id FROM fixed_asset WHERE account_set_id=? AND asset_no=?').get(aid, assetNo)) continue
    const assetId = uuidv4()
    const originalValue = Number(l.amount) || 0
    db.prepare(`INSERT INTO fixed_asset (id,account_set_id,asset_no,asset_name,category_code,status_code,original_value,salvage_rate,salvage_value,depr_method,use_months,accum_depr,depr_months_done,net_value,qty,unit,acquire_date,start_depr_date,remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)`).run(
      assetId, aid, assetNo, item?.name || l.item_code, item?.category_code || null, '01',
      originalValue, 5, Math.round(originalValue * 0.05 * 100) / 100,
      item?.use_months ? '1' : null, item?.use_months || 60,
      originalValue, 1, item?.unit || '个', doc.doc_date, doc.doc_date,
      `供应链采购入库${doc.doc_no}`
    )
    created++
  }
  res.json({ code: 0, data: { created, totalAssetLines: assetLines.length } })
})

// ── BOM（物料清单）CRUD ───────────────────────────────────────────────
// 缺料单下推生成，支持按下游类型选择。
router.post('/scm/docs/:id/gen-downstream', operationLog('缺料单生成下游单据', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const mr = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!mr) return res.status(404).json({ code: 404, message: '缺料单不存在' })
  if (mr.doc_type !== 'MR') return res.status(400).json({ code: 400, message: '仅缺料单可生成下游单据' })

  const validTargets = new Set(['purchase', 'outsource', 'self'])
  const bodyTargets = Array.isArray(req.body?.targets)
    ? req.body.targets.filter((target: any) => validTargets.has(String(target)))
    : []
  const targetSet = new Set<string>(bodyTargets.length ? bodyTargets : Array.from(validTargets))

  const lines = db.prepare(`
    SELECT l.*,
           COALESCE(NULLIF(l.source_type, ''), i.source_type, 'purchase') AS eff_source,
           COALESCE(NULLIF(l.supplier_code, ''), i.supplier_code) AS eff_supplier,
           COALESCE(i.purchase_price, 0) AS purchase_price,
           (SELECT COALESCE(SUM(l2.qty), 0) FROM scm_doc_line l2 WHERE l2.source_line_id = l.id) AS pushed_qty
    FROM scm_doc_line l
    LEFT JOIN scm_item i ON i.account_set_id = l.account_set_id AND i.code = l.item_code
    WHERE l.doc_id=?
    ORDER BY l.seq
  `).all(req.params.id) as any[]

  const r6 = (n: number) => Math.round(n * 1000000) / 1000000
  // 人工指定的每行下推数量（行id→数量）；允许大于剩余量（多买），缺省按剩余量
  const qtyOverride: Record<string, any> = (req.body && typeof req.body.quantities === 'object' && req.body.quantities) || {}
  const purchaseLines: any[] = []
  const outsourceLines: any[] = []
  const selfLines: any[] = []
  for (const line of lines) {
    const baseRemain = r6((Number(line.qty) || 0) - (Number(line.pushed_qty) || 0))
    const hasOverride = Object.prototype.hasOwnProperty.call(qtyOverride, line.id) && qtyOverride[line.id] != null && qtyOverride[line.id] !== ''
    const remain = hasOverride ? r6(Number(qtyOverride[line.id]) || 0) : baseRemain
    if (remain <= 0) continue   // 数量≤0 不生成；允许 remain > baseRemain（多买）
    if (line.eff_source === 'self') {
      if (targetSet.has('self')) selfLines.push({ ...line, remain })
    } else if (line.eff_source === 'outsource') {
      if (targetSet.has('outsource')) outsourceLines.push({ ...line, remain })
    } else if (targetSet.has('purchase')) {
      purchaseLines.push({ ...line, remain })
    }
  }

  if (!purchaseLines.length && !outsourceLines.length && !selfLines.length) {
    return res.status(400).json({ code: 400, message: '选中的类型没有可生成的缺料明细' })
  }

  // 供应商→业务员（salesman 名称）、业务员→所属部门（人员 aux_item.field_values.dept_code）：
  // 下推单据按供应商自动填「关联的业务员 + 部门」
  const partnerSalesman = new Map<string, string>()
  for (const p of db.prepare('SELECT code, salesman FROM scm_partner WHERE account_set_id=?').all(aid) as any[]) {
    if (p.code) partnerSalesman.set(p.code, p.salesman || '')
  }
  const personDept = new Map<string, string>()
  const personCat = db.prepare("SELECT id FROM aux_categories WHERE account_set_id=? AND code='person'").get(aid) as any
  if (personCat) {
    for (const it of db.prepare('SELECT name, field_values FROM aux_items WHERE account_set_id=? AND type=?').all(aid, personCat.id) as any[]) {
      let fv: any = {}
      try { fv = JSON.parse(it.field_values || '{}') } catch { /* ignore */ }
      if (it.name && fv && fv.dept_code) personDept.set(it.name, String(fv.dept_code))
    }
  }
  const staffOf = (supplierCode: string | null | undefined) => {
    const salesman = supplierCode ? (partnerSalesman.get(supplierCode) || '') : ''
    const dept_code = salesman ? (personDept.get(salesman) || '') : ''
    return { biz_person: salesman, dept_code }
  }

  const today = new Date().toISOString().slice(0, 10)
  const planCols = new Set((db.prepare('PRAGMA table_info(scm_production_plan)').all() as any[]).map(col => col.name))
  const nextPlanNo = (planType: 'outsource' | 'self') => {
    const now = new Date()
    const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${planType === 'outsource' ? 'OUT' : 'PP'}-`
    const rows = db.prepare('SELECT code FROM scm_production_plan WHERE account_set_id=? AND code LIKE ?').all(aid, `${prefix}%`) as any[]
    let max = 0
    for (const row of rows) {
      const matched = String(row.code || '').match(/-(\d+)$/)
      if (matched) max = Math.max(max, parseInt(matched[1], 10))
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }
  const insertPlan = (line: any, planType: 'outsource' | 'self') => {
    const data: Record<string, any> = {
      id: uuidv4(),
      account_set_id: aid,
      code: nextPlanNo(planType),
      item_code: line.item_code,
      plan_qty: Number(line.remain) || 0,
      start_date: null,
      end_date: null,
      status: 'draft',
      remark: `缺料单 ${mr.doc_no} ${planType === 'outsource' ? '委外' : '自制'}`,
      source_doc_id: mr.id,
      plan_type: planType,
      supplier_code: planType === 'outsource' ? (line.eff_supplier || null) : null,
      // 委外计划按供应商业务员的部门自动填部门（自制无供应商→空）
      dept_code: planType === 'outsource' ? (staffOf(line.eff_supplier).dept_code || null) : null,
    }
    const cols = Object.keys(data).filter(key => planCols.has(key))
    const marks = cols.map(() => '?').join(',')
    db.prepare(`INSERT INTO scm_production_plan (${cols.join(',')}) VALUES (${marks})`).run(...cols.map(key => data[key]))
  }

  let po = 0
  let outsource_plans = 0
  let self_plans = 0
  db.transaction(() => {
    const groups = new Map<string, any[]>()
    for (const line of purchaseLines) {
      const key = String(line.eff_supplier || '').trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(line)
    }
    for (const [supplier, groupLines] of groups) {
      const poId = uuidv4()
      const docNo = nextDocNo(db, aid, 'PO')
      const staff = staffOf(supplier)   // 按供应商业务员自动填业务员+部门
      let totalQty = 0
      let totalAmount = 0
      for (const line of groupLines) {
        totalQty += Number(line.remain) || 0
        totalAmount += (Number(line.remain) || 0) * (Number(line.purchase_price) || 0)
      }
      db.prepare(`INSERT INTO scm_doc (id,account_set_id,doc_type,doc_no,doc_date,partner_code,dept_code,biz_person,warehouse_code,operator,maker,status,source_doc_id,bom_id,total_qty,total_amount,remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        poId, aid, 'PO', docNo, today, supplier || null, staff.dept_code || null, staff.biz_person || null, null, userName(req), userName(req), 'draft', mr.id, null,
        r6(totalQty), Math.round(totalAmount * 100) / 100, `缺料单 ${mr.doc_no} 采购`
      )
      const insLine = db.prepare(`INSERT INTO scm_doc_line (id,account_set_id,doc_id,seq,item_code,warehouse_code,qty,price,amount,tax_rate,tax_amount,unit_cost,batch_no,source_line_id,remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      let seq = 0
      for (const line of groupLines) {
        seq++
        const qty = Number(line.remain) || 0
        const price = Number(line.purchase_price) || 0
        insLine.run(uuidv4(), aid, poId, seq, line.item_code, line.warehouse_code || null, qty, price, Math.round(qty * price * 100) / 100, null, 0, 0, null, line.id, null)
      }
      po++
    }
    for (const line of outsourceLines) {
      insertPlan(line, 'outsource')
      outsource_plans++
    }
    for (const line of selfLines) {
      insertPlan(line, 'self')
      self_plans++
    }
  })()

  res.json({ code: 0, data: { po, outsource_plans, self_plans } })
})

// ── 销售订单（SOa）缺货分析 ───────────────────────────────
// 可用库存 = 现存量 − 其它已审核未发货销售订单占用（不含本单）；
// 缺口 = 剩余 − 可发，且扣减「本单已生成缺料单」的数量，避免重复补货。
router.get('/scm/docs/:id/availability', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (doc.doc_type !== 'SOa') return res.status(400).json({ code: 400, message: '仅销售订单可做缺货分析' })
  if (doc.status !== 'audited') return res.status(400).json({ code: 400, message: '仅已审核的销售订单可做缺货分析' })

  const rows = db.prepare(`
    SELECT l.*, i.name AS item_name, i.spec, i.unit, w.name AS warehouse_name,
           COALESCE(s.qty, 0) AS on_hand,
           COALESCE(NULLIF(l.source_type, ''), i.source_type, 'purchase') AS source_type,
           COALESCE(NULLIF(l.supplier_code, ''), i.supplier_code) AS supplier_code,
           COALESCE(i.purchase_price, 0) AS purchase_price,
           (SELECT COALESCE(SUM(l2.qty), 0) FROM scm_doc_line l2 WHERE l2.source_line_id = l.id) AS pushed_qty,
           (
             SELECT COALESCE(SUM(
               ol.qty - (SELECT COALESCE(SUM(ol2.qty), 0) FROM scm_doc_line ol2 WHERE ol2.source_line_id = ol.id)
             ), 0)
             FROM scm_doc_line ol
             JOIN scm_doc od ON od.id = ol.doc_id
             WHERE od.account_set_id = l.account_set_id
               AND od.doc_type = 'SOa' AND od.status = 'audited'
               AND od.id <> ?
               AND ol.item_code = l.item_code
               AND IFNULL(ol.warehouse_code, '') = IFNULL(l.warehouse_code, '')
           ) AS other_reserved
    FROM scm_doc_line l
    LEFT JOIN scm_item i ON i.account_set_id = l.account_set_id AND i.code = l.item_code
    LEFT JOIN scm_stock s ON s.account_set_id = l.account_set_id AND s.item_code = l.item_code AND IFNULL(s.warehouse_code, '') = IFNULL(l.warehouse_code, '')
    LEFT JOIN scm_warehouse w ON w.account_set_id = l.account_set_id AND w.code = l.warehouse_code
    WHERE l.doc_id = ?
    ORDER BY l.seq
  `).all(req.params.id, req.params.id) as any[]

  const r6 = (n: number) => Math.round(n * 1000000) / 1000000

  // 本单已生成缺料单的数量池（按 物料+仓库 汇总），用于扣减重复缺口
  const mrRows = db.prepare(`
    SELECT ml.item_code AS item_code, IFNULL(ml.warehouse_code, '') AS wh, COALESCE(SUM(ml.qty), 0) AS qty
    FROM scm_doc_line ml
    JOIN scm_doc md ON md.id = ml.doc_id
    WHERE md.account_set_id = ? AND md.doc_type = 'MR' AND md.source_doc_id = ?
    GROUP BY ml.item_code, IFNULL(ml.warehouse_code, '')
  `).all(aid, req.params.id) as any[]
  const mrPool = new Map<string, number>()
  for (const m of mrRows) mrPool.set(`${m.item_code}|${m.wh}`, Number(m.qty) || 0)

  // 可用库存池（按 物料+仓库 汇总一次），多行同物料按序贪心分配，避免重复占用
  const availPool = new Map<string, number>()
  for (const l of rows) {
    const key = `${l.item_code}|${l.warehouse_code || ''}`
    if (!availPool.has(key)) availPool.set(key, r6((Number(l.on_hand) || 0) - (Number(l.other_reserved) || 0)))
  }

  const lines = rows.map(l => {
    const key = `${l.item_code}|${l.warehouse_code || ''}`
    const order_qty = Number(l.qty) || 0
    const pushed_qty = Number(l.pushed_qty) || 0
    const remain = r6(order_qty - pushed_qty)
    const on_hand = Number(l.on_hand) || 0
    const other_reserved = Number(l.other_reserved) || 0
    const available = r6(on_hand - other_reserved)
    // 从可用池分配可发量
    const poolLeft = availPool.get(key) || 0
    const ship_qty = Math.max(0, r6(Math.min(remain, poolLeft)))
    availPool.set(key, r6(poolLeft - ship_qty))
    // 毛缺口，再扣减已生成缺料量
    let short_qty = Math.max(0, r6(remain - ship_qty))
    const mrLeft = mrPool.get(key) || 0
    const deduct = Math.min(short_qty, mrLeft)
    short_qty = r6(short_qty - deduct)
    mrPool.set(key, r6(mrLeft - deduct))
    return {
      line_id: l.id, seq: l.seq, item_code: l.item_code, item_name: l.item_name, spec: l.spec, unit: l.unit,
      warehouse_code: l.warehouse_code, warehouse_name: l.warehouse_name,
      order_qty, pushed_qty, remain, on_hand, other_reserved, available, ship_qty, short_qty,
      price: Number(l.price) || 0, unit_cost: Number(l.unit_cost) || 0,
      supplier_code: l.supplier_code || '', purchase_price: Number(l.purchase_price) || 0,
      source_type: l.source_type || 'purchase',
    }
  })

  // 本单已生成的缺料单（供前端防重复确认/跳转）
  const shortage_docs = db.prepare(`
    SELECT id, doc_no, status FROM scm_doc
    WHERE account_set_id = ? AND doc_type = 'MR' AND source_doc_id = ?
    ORDER BY doc_no
  `).all(aid, req.params.id) as any[]

  // BOM 展开模式：把成品缺口按多级 BOM 净额展开为「需采购的原材料/外购件」缺口
  if (req.query.explode === '1' || req.query.explode === 'true') {
    const fgShorts = lines
      .filter(l => (Number(l.short_qty) || 0) > 0)
      .map(l => ({ item_code: l.item_code, short_qty: Number(l.short_qty) || 0 }))
    const matLines = explodeShortageMrp(db, aid, fgShorts)
    return res.json({ code: 0, data: { doc, lines: matLines, shortage_docs, explode: true } })
  }

  res.json({ code: 0, data: { doc, lines, shortage_docs } })
})

// 多级 BOM 净额展开（低层码 MRP）：成品缺口 → 需采购的原材料/外购件缺口。
// 成品本身已净库存（短缺即待生产数），故仅对下层子件逐级扣库存、只把净缺口继续往下展开。
function explodeShortageMrp(
  db: ReturnType<typeof getDb>,
  aid: string,
  fgShorts: Array<{ item_code: string; short_qty: number }>
) {
  const r6 = (n: number) => Math.round(n * 1000000) / 1000000

  // active BOM 子件（含损耗的单件用量），无 BOM 返回 null；带缓存
  const bomCache = new Map<string, Array<{ item_code: string; per: number }> | null>()
  const getBom = (code: string) => {
    if (bomCache.has(code)) return bomCache.get(code)!
    const bom = db.prepare(
      "SELECT id FROM scm_bom WHERE account_set_id=? AND item_code=? AND status='active' ORDER BY code LIMIT 1"
    ).get(aid, code) as any
    if (!bom) { bomCache.set(code, null); return null }
    const ls = db.prepare('SELECT item_code, qty, scrap_rate FROM scm_bom_line WHERE bom_id=? ORDER BY seq').all(bom.id) as any[]
    const comps = ls.map(l => ({ item_code: l.item_code, per: (Number(l.qty) || 0) * (1 + (Number(l.scrap_rate) || 0) / 100) }))
    bomCache.set(code, comps)
    return comps
  }

  // 物料现存量（全部仓库汇总），带缓存
  const stockCache = new Map<string, number>()
  const getStock = (code: string) => {
    if (stockCache.has(code)) return stockCache.get(code)!
    const row = db.prepare('SELECT COALESCE(SUM(qty),0) AS q FROM scm_stock WHERE account_set_id=? AND item_code=?').get(aid, code) as any
    const q = Number(row?.q) || 0
    stockCache.set(code, q)
    return q
  }

  // 低层码 LLC：item 在任意 BOM 中出现的最深层级（成品为 0），带防环
  const llc = new Map<string, number>()
  const visiting = new Set<string>()
  const computeDepth = (code: string, depth: number) => {
    const cur = llc.get(code)
    if (cur === undefined || depth > cur) llc.set(code, depth)
    if (visiting.has(code)) return // 防环
    const comps = getBom(code)
    if (!comps) return
    visiting.add(code)
    for (const c of comps) computeDepth(c.item_code, depth + 1)
    visiting.delete(code)
  }
  for (const f of fgShorts) computeDepth(f.item_code, 0)

  const grossReq = new Map<string, number>()
  const addReq = (code: string, q: number) => grossReq.set(code, r6((grossReq.get(code) || 0) + q))
  const result = new Map<string, { required: number; available: number; short_qty: number }>()

  let maxLevel = 0
  for (const v of llc.values()) if (v > maxLevel) maxLevel = v

  for (const f of fgShorts) {
    const comps = getBom(f.item_code)
    if (comps) {
      // 自制成品：展开直接子件（成品自身已净，不再净）
      for (const c of comps) addReq(c.item_code, c.per * f.short_qty)
    } else {
      // 外购成品（无 BOM）：本身即需采购的缺口（已净，直接计入结果）
      const avail = getStock(f.item_code)
      const prev = result.get(f.item_code) || { required: 0, available: avail, short_qty: 0 }
      prev.required = r6(prev.required + f.short_qty)
      prev.short_qty = r6(prev.short_qty + f.short_qty)
      result.set(f.item_code, prev)
    }
  }

  // 按低层码从浅到深处理：到某层时其所有父件需求已累加完，净额后再往下展开
  for (let level = 1; level <= maxLevel; level++) {
    for (const [code, lv] of llc) {
      if (lv !== level) continue
      const gross = grossReq.get(code) || 0
      if (gross <= 0) continue
      const avail = getStock(code)
      const netReq = Math.max(0, r6(gross - avail))
      if (netReq <= 0) continue
      const comps = getBom(code)
      if (comps) {
        // 自制半成品：净缺口继续往下展开
        for (const c of comps) addReq(c.item_code, c.per * netReq)
      } else {
        // 采购/外购叶子：计入材料缺口结果
        const prev = result.get(code) || { required: 0, available: avail, short_qty: 0 }
        prev.required = r6(prev.required + gross)
        prev.available = avail
        prev.short_qty = r6(prev.short_qty + netReq)
        result.set(code, prev)
      }
    }
  }

  // 补全物料档案信息，组装返回行（字段与成品模式兼容，前端 handleGenShortage 可直接拼缺料单）
  const out: any[] = []
  for (const [code, v] of result) {
    if (v.short_qty <= 0) continue
    const it = db.prepare(
      'SELECT name, spec, unit, COALESCE(source_type, \'purchase\') AS source_type, supplier_code, COALESCE(purchase_price,0) AS purchase_price FROM scm_item WHERE account_set_id=? AND code=?'
    ).get(aid, code) as any
    out.push({
      line_id: null, item_code: code, item_name: it?.name || '', spec: it?.spec || '', unit: it?.unit || '',
      warehouse_code: '', warehouse_name: '',
      required: v.required, available: v.available, short_qty: v.short_qty,
      price: 0, unit_cost: 0,
      supplier_code: it?.supplier_code || '', purchase_price: Number(it?.purchase_price) || 0,
      source_type: it?.source_type || 'purchase',
    })
  }
  out.sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)))
  return out
}

// ── 单据上下游关联追溯 ───────────────────────────────────
// 上游：表头 source_doc_id + 行级 source_line_id 的父单（去重）。
// 下游：表头 source_doc_id + 行级 source_line_id 的子单（去重）+ 委外/生产计划（scm_production_plan.source_doc_id）。
router.get('/scm/docs/:id/downstream', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })

  // 取关联单据 id 集合（表头 source_doc_id + 行级 source_line_id，去重），再用列表富行查询补全字段。
  const idSet = (rows: any[]) => [...new Set(rows.map(r => r.id).filter(Boolean))]
  // 上游：表头父单 + 行级父单
  const upIds = idSet([
    ...(doc.source_doc_id ? [{ id: doc.source_doc_id }] : []),
    ...db.prepare(`SELECT DISTINCT pl.doc_id AS id FROM scm_doc_line l JOIN scm_doc_line pl ON pl.id = l.source_line_id WHERE l.doc_id = ? AND l.source_line_id IS NOT NULL`).all(req.params.id) as any[],
  ])
  // 下游：表头子单 + 行级子单
  const downIds = idSet([
    ...db.prepare(`SELECT id FROM scm_doc WHERE account_set_id = ? AND source_doc_id = ?`).all(aid, req.params.id) as any[],
    ...db.prepare(`SELECT DISTINCT l.doc_id AS id FROM scm_doc_line l WHERE l.source_line_id IN (SELECT id FROM scm_doc_line WHERE doc_id = ?)`).all(req.params.id) as any[],
  ])
  const richByIds = (ids: string[]) => ids.length
    ? queryDocRows(db, `d.account_set_id=? AND d.id IN (${ids.map(() => '?').join(',')})`, [aid, ...ids],
        'ORDER BY d.doc_type, d.doc_no')
    : []
  const upstream_docs = richByIds(upIds)
  const downstream_docs = richByIds(downIds)

  const downstream_plans = db.prepare(`
    SELECT pp.id, pp.code, pp.plan_type, pp.item_code, i.name AS item_name, i.spec AS spec,
           pp.plan_qty, pp.supplier_code, pp.status, pp.start_date, pp.end_date, pp.remark
    FROM scm_production_plan pp
    LEFT JOIN scm_item i ON i.account_set_id = pp.account_set_id AND i.code = pp.item_code
    WHERE pp.account_set_id = ? AND pp.source_doc_id = ?
    ORDER BY pp.code
  `).all(aid, req.params.id) as any[]

  res.json({ code: 0, data: { doc, upstream_docs, downstream_docs, downstream_plans } })
})

router.get('/scm/boms/next-no', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const rows = db.prepare('SELECT code FROM scm_bom WHERE account_set_id=?').all(aid) as Array<{ code: string }>
  let maxNum = -1, width = 4, prefix = 'BOM'
  for (const r of rows) {
    const m = String(r.code || '').match(/^([A-Za-z\-_]*)(\d+)$/)
    if (m) {
      const n = parseInt(m[2], 10)
      if (n >= maxNum) { maxNum = n; width = m[2].length; prefix = m[1] }
    }
  }
  const nextNo = maxNum < 0 ? 'BOM0001' : prefix + String(maxNum + 1).padStart(width, '0')
  res.json({ code: 0, data: { next_no: nextNo } })
})
router.get('/scm/boms', (req: AuthRequest, res) => {
  const list = getDb().prepare('SELECT b.*, i.name AS item_name, i.spec AS spec FROM scm_bom b LEFT JOIN scm_item i ON i.account_set_id=b.account_set_id AND i.code=b.item_code WHERE b.account_set_id=? ORDER BY b.code').all(asid(req))
  res.json({ code: 0, data: list })
})
router.get('/scm/boms/:id', (req: AuthRequest, res) => {
  const db = getDb()
  const bom = db.prepare('SELECT * FROM scm_bom WHERE id=? AND account_set_id=?').get(req.params.id, asid(req))
  if (!bom) return res.status(404).json({ code: 404, message: 'BOM不存在' })
  const lines = db.prepare('SELECT l.*, i.name AS item_name, i.spec, i.unit FROM scm_bom_line l LEFT JOIN scm_item i ON i.account_set_id=l.account_set_id AND i.code=l.item_code WHERE l.bom_id=? ORDER BY l.seq').all(req.params.id)
  res.json({ code: 0, data: { ...(bom as any), lines } })
})
router.post('/scm/boms', operationLog('BOM新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.item_code) return res.status(400).json({ code: 400, message: '编号和成品物料不能为空' })
  const id = uuidv4()
  db.transaction(() => {
    db.prepare('INSERT INTO scm_bom (id,account_set_id,code,name,item_code,status) VALUES (?,?,?,?,?,?)').run(id, asid(req), b.code, b.name ?? null, b.item_code, b.status || 'active')
    if (Array.isArray(b.lines)) {
      const ins = db.prepare('INSERT INTO scm_bom_line (id,account_set_id,bom_id,seq,item_code,qty,unit,scrap_rate,remark) VALUES (?,?,?,?,?,?,?,?,?)')
      let seq = 0
      for (const l of b.lines) { seq++; ins.run(uuidv4(), asid(req), id, seq, l.item_code, Number(l.qty) || 0, l.unit ?? null, Number(l.scrap_rate) || 0, l.remark ?? null) }
    }
  })()
  res.json({ code: 0, data: { id } })
})
router.put('/scm/boms/:id', operationLog('BOM修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!db.prepare('SELECT id FROM scm_bom WHERE id=?').get(req.params.id)) return res.status(404).json({ code: 404, message: 'BOM不存在' })
  db.transaction(() => {
    db.prepare('UPDATE scm_bom SET name=?,item_code=?,status=? WHERE id=?').run(b.name ?? null, b.item_code, b.status || 'active', req.params.id)
    if (Array.isArray(b.lines)) {
      db.prepare('DELETE FROM scm_bom_line WHERE bom_id=?').run(req.params.id)
      const ins = db.prepare('INSERT INTO scm_bom_line (id,account_set_id,bom_id,seq,item_code,qty,unit,scrap_rate,remark) VALUES (?,?,?,?,?,?,?,?,?)')
      let seq = 0
      for (const l of b.lines) { seq++; ins.run(uuidv4(), asid(req), req.params.id, seq, l.item_code, Number(l.qty) || 0, l.unit ?? null, Number(l.scrap_rate) || 0, l.remark ?? null) }
    }
  })()
  res.json({ code: 0, data: { ok: true } })
})
router.delete('/scm/boms/:id', operationLog('BOM删除', '供应链'), (req: AuthRequest, res) => {
  getDb().prepare('DELETE FROM scm_bom WHERE id=? AND account_set_id=?').run(req.params.id, asid(req))
  res.json({ code: 0, data: { ok: true } })
})

// ── 生产计划 CRUD ──────────────────────────────────────────────────
router.get('/scm/production-plans', (req: AuthRequest, res) => {
  const list = getDb().prepare('SELECT p.*, i.name AS item_name, i.spec AS spec FROM scm_production_plan p LEFT JOIN scm_item i ON i.account_set_id=p.account_set_id AND i.code=p.item_code WHERE p.account_set_id=? ORDER BY p.code DESC').all(asid(req))
  res.json({ code: 0, data: list })
})
router.post('/scm/production-plans', operationLog('生产计划新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.item_code) return res.status(400).json({ code: 400, message: '计划号和成品不能为空' })
  const id = uuidv4()
  db.prepare(`INSERT INTO scm_production_plan
    (id,account_set_id,code,item_code,plan_qty,start_date,end_date,status,remark,bom_id,dept_code,priority,yl_warehouse,fp_warehouse,plan_type,supplier_code)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, asid(req), b.code, b.item_code, Number(b.plan_qty) || 0, b.start_date ?? null, b.end_date ?? null,
    b.status || 'draft', b.remark ?? null, b.bom_id ?? null, b.dept_code ?? null, Number(b.priority) || 0,
    b.yl_warehouse ?? null, b.fp_warehouse ?? null, b.plan_type || 'self', b.supplier_code ?? null
  )
  res.json({ code: 0, data: { id } })
})

// 工单成本归集（按 plan_id 汇总已审核单据的库存移动）：领料/补料(出) − 退料(入) = 已领成本；完工(入) = 已结转
function getPlanCostSummary(db: ReturnType<typeof getDb>, aid: string, planId: string, planQty: number) {
  const sumMove = (typesAndDir: string) => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(m.amount),0) AS amt, COALESCE(SUM(m.qty),0) AS qty
      FROM scm_stock_move m
      JOIN scm_doc d ON d.account_set_id=m.account_set_id AND d.doc_type=m.doc_type AND d.doc_no=m.doc_no
      WHERE d.account_set_id=? AND d.plan_id=? ${typesAndDir}
    `).get(aid, planId) as any
    return { amt: Number(row?.amt) || 0, qty: Number(row?.qty) || 0 }
  }
  // 领料/补料/委外发货(出) − 退料(入) = 已领（料）成本；完工/委外入库(入) = 已结转
  const issued = sumMove("AND d.doc_type IN ('PL','PB','WO') AND m.direction='out'")
  const returned = sumMove("AND d.doc_type='PJ' AND m.direction='in'")
  const finished = sumMove("AND d.doc_type IN ('PF','WI') AND m.direction='in'")
  const issuedCost = round2(issued.amt - returned.amt)
  const finishedCost = round2(finished.amt)
  const unitCost = planQty > 0 ? round2(issuedCost / planQty) : 0
  // WIP 按「料」口径：已领料 − 已完工数×料单位成本（避免委外入库含加工费时把在制算负；末批完工后归零）
  const wip = round2(issuedCost - finished.qty * unitCost)
  return { issuedCost, finishedCost, finishedQty: finished.qty, wip, unitCost }
}

// 工单详情：计划 + BOM 用料 + 已领/完工单据 + 成本归集
router.get('/scm/production-plans/:id', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const plan = db.prepare('SELECT p.*, i.name AS item_name, i.unit AS item_unit FROM scm_production_plan p LEFT JOIN scm_item i ON i.account_set_id=p.account_set_id AND i.code=p.item_code WHERE p.id=? AND p.account_set_id=?').get(req.params.id, aid) as any
  if (!plan) return res.status(404).json({ code: 404, message: '工单不存在' })
  const bomLines = plan.bom_id
    ? db.prepare('SELECT l.*, i.name AS item_name FROM scm_bom_line l LEFT JOIN scm_item i ON i.account_set_id=l.account_set_id AND i.code=l.item_code WHERE l.bom_id=? ORDER BY l.seq').all(plan.bom_id) as any[]
    : []
  const docs = db.prepare(`SELECT id, doc_no, doc_type, status, doc_date, total_qty, total_amount FROM scm_doc WHERE account_set_id=? AND plan_id=? ORDER BY doc_type, doc_no`).all(aid, req.params.id) as any[]
  const cost = getPlanCostSummary(db, aid, req.params.id, Number(plan.plan_qty) || 0)
  res.json({ code: 0, data: { plan, bom_lines: bomLines, docs, cost } })
})

// 下达：draft → released（之后才能领料/完工）
router.post('/scm/production-plans/:id/release', operationLog('工单下达', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const p = db.prepare('SELECT * FROM scm_production_plan WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!p) return res.status(404).json({ code: 404, message: '工单不存在' })
  if (p.status === 'closed') return res.status(400).json({ code: 400, message: '工单已关闭' })
  if (!p.bom_id) return res.status(400).json({ code: 400, message: '请先为工单指定 BOM 再下达' })
  if (!(Number(p.plan_qty) > 0)) return res.status(400).json({ code: 400, message: '计划数量需大于 0' })
  db.prepare("UPDATE scm_production_plan SET status='released' WHERE id=? AND account_set_id=?").run(req.params.id, aid)
  res.json({ code: 0, data: { ok: true } })
})

// 关闭：released → closed（结清在制；有未结清余额时提示）
router.post('/scm/production-plans/:id/close', operationLog('工单关闭', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const p = db.prepare('SELECT * FROM scm_production_plan WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!p) return res.status(404).json({ code: 404, message: '工单不存在' })
  if (p.status === 'closed') return res.json({ code: 0, data: { ok: true } })
  const cost = getPlanCostSummary(db, aid, req.params.id, Number(p.plan_qty) || 0)
  if (Math.abs(cost.wip) > 0.01 && req.body?.force !== true) {
    return res.status(400).json({ code: 409, message: `工单仍有在制余额 ${cost.wip}，请先做末批完工入库结清，或确认强制关闭`, data: { wip: cost.wip } })
  }
  db.prepare("UPDATE scm_production_plan SET status='closed' WHERE id=? AND account_set_id=?").run(req.params.id, aid)
  res.json({ code: 0, data: { ok: true, wip: cost.wip } })
})

// 计算工单领料建议：BOM 用量×计划数×(1+损耗率) − 已领（已审核 PL/PB 出 − PJ 入）
function computeIssueSuggestion(db: ReturnType<typeof getDb>, aid: string, plan: any) {
  if (!plan.bom_id) return []
  const bomLines = db.prepare('SELECT l.*, i.name AS item_name, i.unit AS item_unit, i.spec AS spec FROM scm_bom_line l LEFT JOIN scm_item i ON i.account_set_id=l.account_set_id AND i.code=l.item_code WHERE l.bom_id=? ORDER BY l.seq').all(plan.bom_id) as any[]
  const issuedRows = db.prepare(`
    SELECT m.item_code AS item_code, COALESCE(SUM(CASE WHEN m.direction='out' THEN m.qty ELSE -m.qty END),0) AS issued
    FROM scm_stock_move m JOIN scm_doc d ON d.account_set_id=m.account_set_id AND d.doc_type=m.doc_type AND d.doc_no=m.doc_no
    WHERE d.account_set_id=? AND d.plan_id=? AND d.doc_type IN ('PL','PB','PJ')
    GROUP BY m.item_code
  `).all(aid, plan.id) as any[]
  const issuedMap = new Map<string, number>(issuedRows.map(r => [r.item_code, Number(r.issued) || 0]))
  const planQty = Number(plan.plan_qty) || 0
  return bomLines.map(l => {
    const perUnit = (Number(l.qty) || 0) * (1 + (Number(l.scrap_rate) || 0) / 100)
    const need = r6(perUnit * planQty)
    const issued = issuedMap.get(l.item_code) || 0
    const suggest = r6(Math.max(0, need - issued))
    return { item_code: l.item_code, item_name: l.item_name, unit: l.item_unit, bom_qty: l.qty, scrap_rate: l.scrap_rate, need, issued, suggest }
  })
}

// 领料建议
router.get('/scm/production-plans/:id/issue-suggestion', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const plan = db.prepare('SELECT * FROM scm_production_plan WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!plan) return res.status(404).json({ code: 404, message: '工单不存在' })
  res.json({ code: 0, data: { plan_id: plan.id, yl_warehouse: plan.yl_warehouse, lines: computeIssueSuggestion(db, aid, plan) } })
})

// 一键生成领料单(PL) 草稿（带 plan_id + 原料仓 + 建议明细）
router.post('/scm/production-plans/:id/gen-issue', operationLog('工单生成领料单', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const plan = db.prepare('SELECT * FROM scm_production_plan WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!plan) return res.status(404).json({ code: 404, message: '工单不存在' })
  if (plan.status !== 'released') return res.status(400).json({ code: 400, message: '请先下达工单再生成领料单' })
  const rows = computeIssueSuggestion(db, aid, plan).filter(r => r.suggest > 0)
  if (!rows.length) return res.status(400).json({ code: 400, message: '没有需要领料的明细（可能已领齐）' })
  const isOut = plan.plan_type === 'outsource'
  const dt = isOut ? 'WO' : 'PL'      // 委外发货 / 生产领用
  const wh = plan.yl_warehouse || null
  const docNo = nextDocNo(db, aid, dt)
  const docId = uuidv4()
  db.transaction(() => {
    db.prepare(`INSERT INTO scm_doc (id,account_set_id,doc_type,doc_no,doc_date,partner_code,warehouse_code,operator,maker,status,bom_id,plan_id,total_qty,total_amount,remark,field_values)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, '{}')`).run(
      docId, aid, dt, docNo, new Date().toISOString().slice(0, 10), isOut ? (plan.supplier_code ?? null) : null, wh, userName(req), userName(req), 'draft', plan.bom_id ?? null, plan.id,
      r6(rows.reduce((s, r) => s + r.suggest, 0)), 0, `工单 ${plan.code} ${isOut ? '委外发货' : '领料'}`
    )
    const ins = prepareDocLineInsert(db)
    let seq = 0
    for (const r of rows) {
      seq++
      ins.run(...buildDocLineRow(aid, docId, seq, { item_code: r.item_code, warehouse_code: wh, qty: r.suggest, price: 0 }, wh).values)
    }
  })()
  res.json({ code: 0, data: { id: docId, doc_no: docNo } })
})

// 一键生成完工入库(PF)/委外入库(WI) 草稿（成品×完工数，带 plan_id + 成品仓；委外可带加工费单价）
router.post('/scm/production-plans/:id/gen-finish', operationLog('工单生成完工入库', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const plan = db.prepare('SELECT * FROM scm_production_plan WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!plan) return res.status(404).json({ code: 404, message: '工单不存在' })
  if (plan.status !== 'released') return res.status(400).json({ code: 400, message: '请先下达工单再生成完工入库' })
  const qty = Number(req.body?.qty) || 0
  if (qty <= 0) return res.status(400).json({ code: 400, message: '完工数量需大于 0' })
  const isOut = plan.plan_type === 'outsource'
  const dt = isOut ? 'WI' : 'PF'        // 委外入库 / 完工入库
  const processFee = isOut ? (Number(req.body?.process_fee) || 0) : 0  // 加工费单价（仅委外）
  const wh = plan.fp_warehouse || null
  const docNo = nextDocNo(db, aid, dt)
  const docId = uuidv4()
  db.transaction(() => {
    db.prepare(`INSERT INTO scm_doc (id,account_set_id,doc_type,doc_no,doc_date,partner_code,warehouse_code,operator,maker,status,bom_id,plan_id,total_qty,total_amount,remark,field_values)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, '{}')`).run(
      docId, aid, dt, docNo, new Date().toISOString().slice(0, 10), isOut ? (plan.supplier_code ?? null) : null, wh, userName(req), userName(req), 'draft', plan.bom_id ?? null, plan.id,
      qty, 0, `工单 ${plan.code} ${isOut ? '委外入库' : '完工入库'}`
    )
    const ins = prepareDocLineInsert(db)
    ins.run(...buildDocLineRow(aid, docId, 1, { item_code: plan.item_code, warehouse_code: wh, qty, price: 0, process_fee: processFee }, wh).values)
  })()
  res.json({ code: 0, data: { id: docId, doc_no: docNo } })
})
router.delete('/scm/production-plans/:id', operationLog('生产计划删除', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const p = db.prepare('SELECT id, status FROM scm_production_plan WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!p) return res.status(404).json({ code: 404, message: '计划不存在' })
  if (p.status === 'audited') return res.status(400).json({ code: 400, message: '已审核计划不可删除' })
  db.prepare('DELETE FROM scm_production_plan WHERE id=? AND account_set_id=?').run(req.params.id, aid)
  res.json({ code: 0, data: { ok: true } })
})

// ── 往来台账/对账查询 ───────────────────────────────────────────────
router.get('/scm/arap/:partnerCode', (req: AuthRequest, res) => {
  const { start_date, end_date } = req.query as any
  const result = getPartnerLedger(getDb(), asid(req), req.params.partnerCode, start_date, end_date)
  res.json({ code: 0, data: result })
})
// 应收应付账龄
router.get('/scm/arap-aging', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const { as_of_date } = req.query as any; const asOf = as_of_date || new Date().toISOString().slice(0, 10)
  const rows = db.prepare(
    "SELECT partner_code, p.name AS partner_name, p.partner_type, direction, doc_date, doc_no, amount FROM scm_ar_ap_log l LEFT JOIN scm_partner p ON p.account_set_id=l.account_set_id AND p.code=l.partner_code WHERE l.account_set_id=? ORDER BY p.code, l.doc_date"
  ).all(aid) as any[]
  const map = new Map<string, any>()
  for (const r of rows) {
    if (!map.has(r.partner_code)) map.set(r.partner_code, { partner_code: r.partner_code, partner_name: r.partner_name, partner_type: r.partner_type, balance: 0, current: 0, d30: 0, d60: 0, d90: 0, over90: 0 })
    const days = Math.floor((new Date(asOf).getTime() - new Date(r.doc_date).getTime()) / 86400000)
    const age = days <= 30 ? 'current' : days <= 60 ? 'd30' : days <= 90 ? 'd60' : 'over90'; const amt = r.direction === 'in' ? r.amount : -r.amount
    const e = map.get(r.partner_code)!; e.balance += amt; e[age] += amt
  }
  res.json({ code: 0, data: [...map.values()].filter(e => Math.abs(e.balance) > 0.01) })
})

// ── BOM 展开：返回按成品数量折算的子项用量列表 ─────────────────────
router.get('/scm/boms/:id/explode', (req: AuthRequest, res) => {
  const db = getDb(); const qty = Number(req.query.qty) || 1
  const lines = db.prepare('SELECT l.*, i.name AS item_name, i.spec, i.unit FROM scm_bom_line l LEFT JOIN scm_item i ON i.account_set_id=l.account_set_id AND i.code=l.item_code WHERE l.bom_id=? ORDER BY l.seq').all(req.params.id) as any[]
  const exploded = lines.map(l => ({
    item_code: l.item_code, item_name: l.item_name, spec: l.spec, unit: l.unit,
    qty_per_unit: l.qty, total_qty: Math.round(l.qty * qty * (1 + (l.scrap_rate || 0) / 100) * 10000) / 10000,
    scrap_rate: l.scrap_rate, remark: l.remark
  }))
  res.json({ code: 0, data: { bom_id: req.params.id, qty, lines: exploded } })
})

// ── 单据生成凭证（P5） ──────────────────────────────────────────────
router.post('/scm/docs/:id/gen-voucher', operationLog('单据生成凭证', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc || doc.status !== 'audited') return res.status(400).json({ code: 400, message: '单据未审核' })
  if (doc.voucher_id) return res.status(400).json({ code: 400, message: '已生成凭证' })
  const lines = db.prepare('SELECT * FROM scm_doc_line WHERE doc_id=?').all(doc.id) as any[]
  if (!lines.length) return res.status(400).json({ code: 400, message: '无明细行' })

  const docType = db.prepare('SELECT * FROM scm_doc_type WHERE account_set_id=? AND code=?').get(aid, doc.doc_type) as any
  if (!docType) return res.status(400).json({ code: 400, message: '未知单据类型' })

  // 往来单位（取应收/应付科目）
  const partner = doc.partner_code
    ? db.prepare('SELECT ar_account, ap_account FROM scm_partner WHERE account_set_id=? AND code=?').get(aid, doc.partner_code) as any
    : null

  // 供应链默认对方科目（系统参数可覆盖，否则用标准会计科目兜底）
  const scmAcc = (key: string, fb: string): string => {
    const r = db.prepare("SELECT param_value FROM system_params WHERE account_set_id=? AND param_key=?").get(aid, key) as any
    return (r?.param_value as string) || fb
  }
  const AP = partner?.ap_account || scmAcc('scm:acc_ap', '2202')          // 应付账款
  const AR = partner?.ar_account || scmAcc('scm:acc_ar', '1122')          // 应收账款
  const REV = scmAcc('scm:acc_revenue', '6001')                          // 主营业务收入
  const COST = scmAcc('scm:acc_cost', '6401')                            // 主营业务成本
  const OTHER = scmAcc('scm:acc_other', '1901')                          // 其他出入库对方（待处理财产损溢）
  const PROD = scmAcc('scm:acc_production', '5001')                       // 生产成本
  const TAX_IN = scmAcc('scm:acc_tax_input', '22210101')                 // 应交税费-进项税
  const TAX_OUT = scmAcc('scm:acc_tax_output', '22210105')               // 应交税费-销项税

  // 按科目汇总分录（借方/贷方）
  const lookupAcc = db.prepare('SELECT id, code, name FROM accounts WHERE account_set_id=? AND code=? LIMIT 1')
  const entries: Array<{ code: string; name: string; id: string; debit: number; credit: number; summary: string }> = []
  const missing = new Set<string>()
  const addEntry = (code: string, side: 'debit' | 'credit', amt: number, summary: string) => {
    if (!code || !(amt > 0)) return
    const acc = lookupAcc.get(aid, code) as any
    if (!acc) { missing.add(code); return }
    let e = entries.find(x => x.code === code && x.id === acc.id)
    if (!e) { e = { code, name: acc.name, id: acc.id, debit: 0, credit: 0, summary }; entries.push(e) }
    e[side] = Math.round((e[side] + amt) * 100) / 100
  }

  const cat = docType.category
  const dir = docType.direction
  for (const l of lines) {
    if (!l.qty || l.qty <= 0) continue
    const item = getItem(db, aid, l.item_code)
    const invCode = item?.inv_account || '1405'                          // 存货科目（默认 库存商品）
    const sumr = `${doc.doc_no} ${item?.name || l.item_code}`
    const amt = Math.round(Number(l.amount || l.qty * (l.price || l.unit_cost || 0)) * 100) / 100   // 业务金额(进价/售价，不含税)
    const tax = Math.round(Number(l.tax_amount || 0) * 100) / 100        // 税额
    const cost = Math.round(Number((l.unit_cost || 0) * l.qty) * 100) / 100  // 库存成本额(审核回写)
    if (amt <= 0 && cost <= 0) continue

    if (cat === 'purchase') {
      // 采购入库：借 存货 + 进项税 / 贷 应付；采购退货反向
      if (dir === 'in') { addEntry(invCode, 'debit', amt, sumr); addEntry(TAX_IN, 'debit', tax, sumr); addEntry(AP, 'credit', amt + tax, sumr) }
      else if (dir === 'out') { addEntry(invCode, 'credit', amt, sumr); addEntry(TAX_IN, 'credit', tax, sumr); addEntry(AP, 'debit', amt + tax, sumr) }
    } else if (cat === 'sale') {
      // 销售出库：确认收入(借应收/贷收入+销项) + 结转成本(借成本/贷存货)；销售退货反向
      if (dir === 'out') {
        addEntry(AR, 'debit', amt + tax, sumr); addEntry(REV, 'credit', amt, sumr); addEntry(TAX_OUT, 'credit', tax, sumr)
        addEntry(COST, 'debit', cost, sumr); addEntry(invCode, 'credit', cost, sumr)
      } else if (dir === 'in') {
        addEntry(AR, 'credit', amt + tax, sumr); addEntry(REV, 'debit', amt, sumr); addEntry(TAX_OUT, 'debit', tax, sumr)
        addEntry(COST, 'credit', cost, sumr); addEntry(invCode, 'debit', cost, sumr)
      }
    } else if (cat === 'production') {
      // 完工入库/生产领用/组装/拆卸
      const v = cost > 0 ? cost : amt
      if (dir === 'in') { addEntry(invCode, 'debit', v, sumr); addEntry(PROD, 'credit', v, sumr) }
      else if (dir === 'out') { addEntry(PROD, 'debit', v, sumr); addEntry(invCode, 'credit', v, sumr) }
      else if (doc.doc_type === 'AS') {
        // 组装子件消耗：贷存货 / 借生产成本（成品入库在循环外补充）
        addEntry(invCode, 'credit', v, sumr); addEntry(PROD, 'debit', v, sumr)
      } else if (doc.doc_type === 'DS') {
        // 拆卸子件产生：借存货 / 贷生产成本（成品出库在循环外补充）
        addEntry(invCode, 'debit', v, sumr); addEntry(PROD, 'credit', v, sumr)
      }
    } else if (cat === 'outsource') {
      // 委外发货(WO,出)：料投入在制 借生产成本/贷存货；委外入库(WI,入)：成品入库 借存货(全)/贷生产成本(料)/贷应付(加工费)
      const v = cost > 0 ? cost : amt
      if (dir === 'out') {
        addEntry(PROD, 'debit', v, sumr); addEntry(invCode, 'credit', v, sumr)
      } else {
        const fee = Math.round((Number(l.process_fee) || 0) * l.qty * 100) / 100
        const material = Math.round((v - fee) * 100) / 100
        addEntry(invCode, 'debit', v, sumr)
        addEntry(PROD, 'credit', material, sumr)
        if (fee > 0) addEntry(AP, 'credit', fee, sumr)
      }
    } else {
      // 其他出入库(inventory)：借/贷 存货 与 待处理科目对开；调拨/盘点 none 不生成
      const v = cost > 0 ? cost : amt
      if (dir === 'in') { addEntry(invCode, 'debit', v, sumr); addEntry(OTHER, 'credit', v, sumr) }
      else if (dir === 'out') { addEntry(invCode, 'credit', v, sumr); addEntry(OTHER, 'debit', v, sumr) }
    }
  }

  if (missing.size) return res.status(400).json({ code: 400, message: `科目不存在：${[...missing].join('、')}，请在科目表补建或在供应链参数中配置对方科目` })

  // AS/DS 成品分录（循环内处理了子件，此处补充成品）
  if (doc.doc_type === 'AS' || doc.doc_type === 'DS') {
    if (!doc.bom_id) return res.status(400).json({ code: 400, message: '组装/拆卸单必须指定BOM才能生成凭证' })
    const bom = db.prepare('SELECT * FROM scm_bom WHERE id=? AND account_set_id=?').get(doc.bom_id, aid) as any
    if (bom) {
      const fpItem = getItem(db, aid, bom.item_code)
      const fpInvCode = fpItem?.inv_account || '1405'
      const prodEntry = entries.find(e => e.code === PROD)
      const netProd = (prodEntry?.debit || 0) - (prodEntry?.credit || 0)  // +debit = 子件消耗（AS）；-credit = 子件产生（DS）
      if (Math.abs(netProd) > 0.005) {
        const fpSummary = `${doc.doc_no} 成品 ${fpItem?.name || bom.item_code}`
        if (doc.doc_type === 'AS') {
          // 组装成品入库：借存货(成品) / 贷生产成本 ← 消耗的 netProd
          addEntry(fpInvCode, 'debit', Math.abs(netProd), fpSummary)
          addEntry(PROD, 'credit', Math.abs(netProd), fpSummary)
        } else {
          // 拆卸成品出库：借生产成本 / 贷存货(成品)
          addEntry(PROD, 'debit', Math.abs(netProd), fpSummary)
          addEntry(fpInvCode, 'credit', Math.abs(netProd), fpSummary)
        }
      }
    }
  }

  if (!entries.length) return res.status(400).json({ code: 400, message: '无有效分录（该单据类型可能不生成凭证）' })

  // 生成凭证
  const totalDebit = Math.round(entries.reduce((s, e) => s + e.debit, 0) * 100) / 100
  const totalCredit = Math.round(entries.reduce((s, e) => s + e.credit, 0) * 100) / 100
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(400).json({ code: 400, message: `借贷不平衡（借 ${totalDebit} / 贷 ${totalCredit}），请检查单据成本与税额` })
  }
  const voucherId = uuidv4()
  const year = parseInt((doc.doc_date || '').split('-')[0]) || new Date().getFullYear()
  const month = parseInt((doc.doc_date || '').split('-')[1]) || new Date().getMonth() + 1
  const lastNo = (db.prepare('SELECT CAST(CASE WHEN INSTR(voucher_no,\'-\')>0 THEN SUBSTR(voucher_no,INSTR(voucher_no,\'-\')+1) ELSE voucher_no END AS INTEGER) no FROM vouchers WHERE account_set_id=? AND year=? AND period=? ORDER BY no DESC LIMIT 1').get(aid, year, month) as any)?.no ?? 0
  const voucherNo = String(lastNo + 1).padStart(3, '0')

  db.transaction(() => {
    db.prepare(`INSERT INTO vouchers (id,account_set_id,voucher_no,voucher_type_id,voucher_date,year,period,total_amount,maker_name,remark,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      voucherId, aid, voucherNo, null, doc.doc_date, year, month, totalDebit, userName(req),
      `供应链单据${doc.doc_no}`, `scm_${doc.doc_type.toLowerCase()}`
    )
    const insE = db.prepare('INSERT INTO voucher_entries (id,account_set_id,voucher_id,seq,account_id,account_code,account_name,direction,amount,amount_cents,summary) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    let seq = 1
    for (const e of entries) {
      if (e.debit > 0) insE.run(uuidv4(), aid, voucherId, seq++, e.id, e.code, e.name, 'debit', e.debit, Math.round(e.debit * 100), e.summary)
      if (e.credit > 0) insE.run(uuidv4(), aid, voucherId, seq++, e.id, e.code, e.name, 'credit', e.credit, Math.round(e.credit * 100), e.summary)
    }
    db.prepare('UPDATE scm_doc SET voucher_id=? WHERE id=?').run(voucherId, doc.id)
  })()
  res.json({ code: 0, data: { voucher_id: voucherId, voucher_no: voucherNo, entry_count: entries.length } })
})

export default router
