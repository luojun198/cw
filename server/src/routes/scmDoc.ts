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
import { applyMovingAvgIn, applyMovingAvgOut, reverseDocMoves } from '../services/scmCosting.js'
import { applyPayment, applyInvoice, reversePayment, getPartnerLedger } from '../services/scmArAp.js'
import { assertAccountIdsInScope, type AccountScopeContext } from '../services/accountAuthorization.js'

const router = Router()
router.use(authMiddleware)

// 权限守卫（按路径，admin * 放行）
const DOC_PERM_RULES: Array<{ re: RegExp; perm: string }> = [
  { re: /^\/scm\/docs\/types/,           perm: 'scm:stock' },  // 读类型不需要高权限
  { re: /^\/scm\/docs\/next-no/,          perm: 'scm:stock' },
  { re: /^\/scm\/docs$/,                  perm: 'scm:stock' },  // 列表读
  { re: /^\/scm\/docs\//,                 perm: 'scm:stock' },  // CRUD
  { re: /^\/scm\/docs\/seed$/,            perm: 'scm:import' },
]
router.use((req: AuthRequest, res, next) => {
  if (!(req.path.startsWith('/scm/docs') || req.path.startsWith('/scm/doc/'))) return next()
  if (req.permissions?.includes('*')) return next()
  const rule = DOC_PERM_RULES.find(r => r.re.test(req.path))
  if (rule && !req.permissions?.includes(rule.perm)) {
    return res.status(403).json({ code: 403, message: '无此操作权限' })
  }
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
function nextDocNo(db: ReturnType<typeof getDb>, accountSetId: string, docTypeCode: string): string {
  const now = new Date()
  const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${docTypeCode}-`
  const rows = db.prepare(
    'SELECT doc_no FROM scm_doc WHERE account_set_id=? AND doc_type=? AND doc_no LIKE ?'
  ).all(accountSetId, docTypeCode, `${prefix}%`) as Array<{ doc_no: string }>
  let max = 0
  for (const r of rows) {
    const m = r.doc_no.match(/-(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

// helper: lookup item by code → { id, name, inv_account, sale_account, ... }
function getItem(db: ReturnType<typeof getDb>, accountSetId: string, code: string) {
  return db.prepare('SELECT * FROM scm_item WHERE account_set_id=? AND code=?').get(accountSetId, code) as any
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
  const list = db.prepare(`
    SELECT d.*, p.name AS partner_name, w.name AS warehouse_name
    FROM scm_doc d
    LEFT JOIN scm_partner p ON p.account_set_id=d.account_set_id AND p.code=d.partner_code
    LEFT JOIN scm_warehouse w ON w.account_set_id=d.account_set_id AND w.code=d.warehouse_code
    WHERE ${where} ORDER BY d.doc_date DESC, d.doc_no DESC LIMIT ? OFFSET ?
  `).all(...ps, parseInt(page_size), off)
  res.json({ code: 0, data: { list, total, page: parseInt(page), page_size: parseInt(page_size) } })
})

router.get('/scm/docs/:id', (req: AuthRequest, res) => {
  const db = getDb()
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, asid(req))
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })
  const lines = db.prepare('SELECT l.*, i.name AS item_name, i.spec, i.unit FROM scm_doc_line l LEFT JOIN scm_item i ON i.account_set_id=l.account_set_id AND i.code=l.item_code WHERE l.doc_id=? ORDER BY l.seq').all(req.params.id)
  res.json({ code: 0, data: { ...(doc as any), lines } })
})

router.post('/scm/docs', operationLog('供应链单据新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.doc_type) return res.status(400).json({ code: 400, message: '单据类型不能为空' })
  const docNo = nextDocNo(db, asid(req), b.doc_type)
  const docId = uuidv4()
  db.transaction(() => {
    db.prepare(`INSERT INTO scm_doc (id,account_set_id,doc_type,doc_no,doc_date,partner_code,dept_code,warehouse_code,operator,status,source_doc_id,bom_id,total_qty,total_amount,remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      docId, asid(req), b.doc_type, docNo, b.doc_date || new Date().toISOString().slice(0, 10),
      b.partner_code ?? null, b.dept_code ?? null, b.warehouse_code ?? null,
      b.operator || userName(req), 'draft', b.source_doc_id ?? null, b.bom_id ?? null,
      Number(b.total_qty) || 0, Number(b.total_amount) || 0, b.remark ?? null
    )
    if (Array.isArray(b.lines)) {
      const ins = db.prepare(`INSERT INTO scm_doc_line (id,account_set_id,doc_id,seq,item_code,warehouse_code,qty,price,amount,tax_rate,tax_amount,unit_cost,batch_no,source_line_id,remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      let seq = 0; let tq = 0; let ta = 0
      for (const l of b.lines) { seq++;
        const q = Number(l.qty) || 0; const p = Number(l.price) || 0; const a = Math.round(q * p * 100) / 100
        ins.run(uuidv4(), asid(req), docId, seq, l.item_code, l.warehouse_code || b.warehouse_code, q, p, a, l.tax_rate ?? null, l.tax_amount ?? 0, l.unit_cost ?? 0, l.batch_no ?? null, l.source_line_id ?? null, l.remark ?? null)
        tq += q; ta += a
      }
      db.prepare('UPDATE scm_doc SET total_qty=?,total_amount=? WHERE id=?').run(tq, ta, docId)
    }
  })()
  res.json({ code: 0, data: { id: docId, doc_no: docNo } })
})

router.put('/scm/docs/:id', operationLog('供应链单据修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  const ex = db.prepare('SELECT id, status FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, asid(req)) as any
  if (!ex) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (ex.status !== 'draft') return res.status(400).json({ code: 400, message: '仅草稿状态可修改' })
  db.transaction(() => {
    db.prepare(`UPDATE scm_doc SET doc_date=?,partner_code=?,dept_code=?,warehouse_code=?,operator=?,source_doc_id=?,bom_id=?,remark=?,updated_at=datetime('now') WHERE id=?`).run(
      b.doc_date ?? null, b.partner_code ?? null, b.dept_code ?? null, b.warehouse_code ?? null, b.operator || userName(req),
      b.source_doc_id ?? null, b.bom_id ?? null, b.remark ?? null, req.params.id
    )
    if (Array.isArray(b.lines)) {
      db.prepare('DELETE FROM scm_doc_line WHERE doc_id=?').run(req.params.id)
      const ins = db.prepare(`INSERT INTO scm_doc_line (id,account_set_id,doc_id,seq,item_code,warehouse_code,qty,price,amount,tax_rate,tax_amount,unit_cost,batch_no,source_line_id,remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      let seq = 0; let tq = 0; let ta = 0
      for (const l of b.lines) { seq++;
        const q = Number(l.qty) || 0; const p = Number(l.price) || 0; const a = Math.round(q * p * 100) / 100
        ins.run(uuidv4(), asid(req), req.params.id, seq, l.item_code, l.warehouse_code || b.warehouse_code, q, p, a, l.tax_rate ?? null, l.tax_amount ?? 0, l.unit_cost ?? 0, l.batch_no ?? null, l.source_line_id ?? null, l.remark ?? null)
        tq += q; ta += a
      }
      db.prepare('UPDATE scm_doc SET total_qty=?,total_amount=? WHERE id=?').run(tq, ta, req.params.id)
    }
  })()
  res.json({ code: 0, data: { ok: true } })
})

router.delete('/scm/docs/:id', operationLog('供应链单据删除', '供应链'), (req: AuthRequest, res) => {
  const db = getDb()
  const ex = db.prepare('SELECT id, status FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, asid(req)) as any
  if (!ex) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (ex.status !== 'draft') return res.status(400).json({ code: 400, message: '仅草稿状态可删除' })
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

  const lines = db.prepare('SELECT * FROM scm_doc_line WHERE doc_id=? ORDER BY seq').all(doc.id) as any[]

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

  // 收付款单：生成往来台账 + 出纳日记账；发票：仅生成往来台账
  const isPayment = doc.doc_type === 'PAY' || doc.doc_type === 'RCV'
  const isInvoice = doc.doc_type === 'RP' || doc.doc_type === 'RS'

  db.transaction(() => {
    if (isPayment) {
      applyPayment(db, aid, doc, lines, userName(req))
    } else if (isInvoice) {
      applyInvoice(db, aid, doc, lines)
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
    db.prepare("UPDATE scm_doc SET status='audited', updated_at=datetime('now') WHERE id=?").run(doc.id)
  })()
  res.json({ code: 0, data: { ok: true } })
})

router.post('/scm/docs/:id/unaudit', operationLog('供应链单据反审核', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const doc = db.prepare('SELECT * FROM scm_doc WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!doc) return res.status(404).json({ code: 404, message: '单据不存在' })
  if (doc.status !== 'audited') return res.status(400).json({ code: 400, message: '仅已审核可反审核' })
  const docType = db.prepare('SELECT * FROM scm_doc_type WHERE account_set_id=? AND code=?').get(aid, doc.doc_type) as any
  if (doc.doc_type === 'PAY' || doc.doc_type === 'RCV' || doc.doc_type === 'RP' || doc.doc_type === 'RS') reversePayment(db, aid, doc)
  else if (docType?.affects_stock) reverseDocMoves(db, aid, doc.id)
  db.prepare("UPDATE scm_doc SET status='draft', updated_at=datetime('now') WHERE id=?").run(doc.id)
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
router.get('/scm/boms', (req: AuthRequest, res) => {
  const list = getDb().prepare('SELECT b.*, i.name AS item_name FROM scm_bom b LEFT JOIN scm_item i ON i.account_set_id=b.account_set_id AND i.code=b.item_code WHERE b.account_set_id=? ORDER BY b.code').all(asid(req))
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
  const list = getDb().prepare('SELECT p.*, i.name AS item_name FROM scm_production_plan p LEFT JOIN scm_item i ON i.account_set_id=p.account_set_id AND i.code=p.item_code WHERE p.account_set_id=? ORDER BY p.code DESC').all(asid(req))
  res.json({ code: 0, data: list })
})
router.post('/scm/production-plans', operationLog('生产计划新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.item_code) return res.status(400).json({ code: 400, message: '计划号和成品不能为空' })
  const id = uuidv4()
  db.prepare('INSERT INTO scm_production_plan (id,account_set_id,code,item_code,plan_qty,start_date,end_date,status,remark) VALUES (?,?,?,?,?,?,?,?,?)').run(id, asid(req), b.code, b.item_code, Number(b.plan_qty) || 0, b.start_date ?? null, b.end_date ?? null, b.status || 'draft', b.remark ?? null)
  res.json({ code: 0, data: { id } })
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
