import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.js'

const router = Router()
router.use(authMiddleware)

// ── 供应链模块权限守卫（路径→权限，admin '*' 放行） ──────────────────────
const SCM_PERMISSION_RULES: Array<{ re: RegExp; perm: string }> = [
  { re: /^\/scm\/params/,      perm: 'scm:param' },
  { re: /^\/scm\/import/,      perm: 'scm:import' },
  { re: /^\/scm\/items/,       perm: 'scm:item' },
  { re: /^\/scm\/partners/,    perm: 'scm:partner' },
  { re: /^\/scm\/warehouses/,  perm: 'scm:warehouse' },
  { re: /^\/scm\/units/,       perm: 'scm:item' },    // 单位与物料共用权限
  { re: /^\/scm\/categories/,  perm: 'scm:category' },
  { re: /^\/scm\/stock/,       perm: 'scm:stock' },
]
router.use((req: AuthRequest, res, next) => {
  if (!req.path.startsWith('/scm/')) return next()
  if (req.permissions?.includes('*')) return next()
  const rule = SCM_PERMISSION_RULES.find(r => r.re.test(req.path))
  if (rule && !req.permissions?.includes(rule.perm)) {
    return res.status(403).json({ code: 403, message: '无此操作权限' })
  }
  next()
})

const asid = (req: AuthRequest) => req.accountSetId || ''

// ── 供应链参数（计价方式等） ────────────────────────────────────────────
const SCM_PARAM_KEYS = [
  'scm:costing_method',
  'scm:acc_ap', 'scm:acc_ar', 'scm:acc_revenue', 'scm:acc_cost',
  'scm:acc_production', 'scm:acc_other', 'scm:acc_tax_input', 'scm:acc_tax_output',
  'scm:item_levels', 'scm:item_code_lengths', 'scm:item_types',
]
router.get('/scm/params', (req: AuthRequest, res) => {
  const db = getDb()
  const rows = db.prepare(
    `SELECT param_key, param_value FROM system_params WHERE account_set_id=? AND param_key IN (${SCM_PARAM_KEYS.map(() => '?').join(',')})`
  ).all(asid(req), ...SCM_PARAM_KEYS)
  res.json({ code: 0, data: rows })
})
router.put('/scm/params', operationLog('保存供应链参数', '供应链'), (req: AuthRequest, res) => {
  const { params } = req.body
  if (!Array.isArray(params)) return res.status(400).json({ code: 400, message: '参数格式错误' })
  const db = getDb()
  const upsert = db.prepare('INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)')
  const VALID_COSTING = ['moving_avg', 'month_avg', 'fifo', 'lifo', 'specified']
  for (const p of params) {
    if (!SCM_PARAM_KEYS.includes(p.param_key)) continue
    const val = String(p.param_value ?? '')
    if (p.param_key === 'scm:costing_method' && val && !VALID_COSTING.includes(val)) {
      return res.status(400).json({ code: 400, message: '计价方式无效' })
    }
    const ex = db.prepare('SELECT id FROM system_params WHERE account_set_id=? AND param_key=?').get(asid(req), p.param_key) as any
    upsert.run(ex?.id || uuidv4(), asid(req), p.param_key, val)
  }
  res.json({ code: 0, message: '保存成功' })
})

// ── 通用：自动编号（前缀+数字，参照固定资产 next-no） ────────────────────
function nextCode(db: ReturnType<typeof getDb>, table: string, accountSetId: string, fallbackPrefix: string): string {
  const rows = db.prepare(`SELECT code FROM ${table} WHERE account_set_id=?`).all(accountSetId) as Array<{ code: string }>
  let maxNum = -1, width = 4, prefix = fallbackPrefix
  for (const r of rows) {
    const m = String(r.code || '').match(/^([A-Za-z\-_]*)(\d+)$/)
    if (m) {
      const n = parseInt(m[2], 10)
      if (n >= maxNum) { maxNum = n; width = m[2].length; prefix = m[1] }
    }
  }
  return maxNum < 0 ? `${fallbackPrefix}0001` : prefix + String(maxNum + 1).padStart(width, '0')
}

// ── 辅助：填充物料单位关联数据 ──────────────────────────────────────────
function appendItemUnits(db: ReturnType<typeof getDb>, aid: string, list: any[]) {
  if (!list.length) return
  const itemUnitQuery = db.prepare(
    `SELECT iu.item_code, iu.unit_code, iu.is_primary, iu.conversion_rate, u.name AS unit_name
     FROM scm_item_unit iu LEFT JOIN scm_unit u ON u.account_set_id=iu.account_set_id AND u.code=iu.unit_code
     WHERE iu.account_set_id=? AND iu.item_code IN (${list.map(() => '?').join(',')})`)
  const unitRows = itemUnitQuery.all(aid, ...list.map((i: any) => i.code)) as any[]
  for (const item of list) {
    const ur = unitRows.filter((r: any) => r.item_code === item.code)
    const prim = ur.find((r: any) => r.is_primary)
    if (prim) {
      item.primary_unit_code = prim.unit_code
      item.unit_name = prim.unit_name || item.unit
    }
    item.secondary_units = ur.filter((r: any) => !r.is_primary).map((r: any) => ({
      unit_code: r.unit_code, unit_name: r.unit_name, conversion_rate: r.conversion_rate,
    }))
  }
}

// ── 物料自定义字段定义 ────────────────────────────────────────────────────
router.get('/scm/item-fields', (req: AuthRequest, res) => {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM scm_item_field_defs WHERE account_set_id=? AND is_enabled=1 ORDER BY sort_order, created_at'
  ).all(asid(req))
  res.json({ code: 0, data: rows })
})

router.post('/scm/item-fields', operationLog('保存物料字段配置', '供应链'), (req: AuthRequest, res) => {
  const { fields } = req.body
  if (!Array.isArray(fields)) return res.status(400).json({ code: 400, message: 'fields 必须为数组' })
  const db = getDb()
  const aid = asid(req)

  const existing = db.prepare('SELECT id, field_key FROM scm_item_field_defs WHERE account_set_id=?').all(aid) as any[]
  const existingMap = new Map(existing.map((f: any) => [f.field_key, f.id]))
  const newKeys = new Set(fields.filter((f: any) => f.field_key).map((f: any) => f.field_key))

  db.transaction(() => {
    // 禁用不在新列表中的旧字段
    for (const ef of existing) {
      if (!newKeys.has(ef.field_key)) {
        db.prepare("UPDATE scm_item_field_defs SET is_enabled=0, updated_at=datetime('now') WHERE id=?").run(ef.id)
      }
    }
    // Upsert
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      if (!f.field_key || !f.field_name) continue
      const optJson = Array.isArray(f.options_json)
        ? JSON.stringify(f.options_json)
        : (f.options_json ?? null)
      if (existingMap.has(f.field_key)) {
        db.prepare(
          "UPDATE scm_item_field_defs SET field_name=?, field_type=?, options_json=?, sort_order=?, is_enabled=1, updated_at=datetime('now') WHERE id=?"
        ).run(f.field_name, f.field_type || 'text', optJson, f.sort_order ?? i, existingMap.get(f.field_key))
      } else {
        db.prepare(
          'INSERT INTO scm_item_field_defs (id, account_set_id, field_key, field_name, field_type, options_json, sort_order, is_enabled) VALUES (?,?,?,?,?,?,?,1)'
        ).run(uuidv4(), aid, f.field_key, f.field_name, f.field_type || 'text', optJson, f.sort_order ?? i)
      }
    }
  })()

  res.json({ code: 0, message: '保存成功' })
})

// ── 物料档案 ────────────────────────────────────────────────────────────
router.get('/scm/items/next-no', (req: AuthRequest, res) => {
  res.json({ code: 0, data: { next_no: nextCode(getDb(), 'scm_item', asid(req), 'WL') } })
})
router.get('/scm/items', (req: AuthRequest, res) => {
  const db = getDb()
  const { keyword, category_code, item_type, parent_id, all, page = '1', page_size = '50' } = req.query as any
  const conds = ['i.account_set_id=?']; const params: any[] = [asid(req)]
  if (keyword) { conds.push('(i.code LIKE ? OR i.name LIKE ? OR i.spec LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
  if (category_code) { conds.push('i.category_code=?'); params.push(category_code) }
  if (item_type) { conds.push('i.item_type=?'); params.push(item_type) }
  if (parent_id !== undefined) {
    if (parent_id === '' || parent_id === 'null') { conds.push('i.parent_id IS NULL') }
    else { conds.push('i.parent_id=?'); params.push(parent_id) }
  }
  const where = conds.join(' AND ')

  // hasChildren 子查询
  const selectCols = `i.*, (SELECT COUNT(*) FROM scm_item c WHERE c.parent_id=i.id AND c.account_set_id=i.account_set_id) > 0 AS hasChildren`

  // field_values 字符串转对象
  function parseFieldValues(list: any[]) {
    for (const item of list) {
      if (typeof item.field_values === 'string') {
        try { item.field_values = JSON.parse(item.field_values) } catch { item.field_values = {} }
      }
      item.field_values = item.field_values || {}
    }
  }

  // all=1 返回全量（树形模式，不分页）
  if (all === '1') {
    const list = db.prepare(`SELECT ${selectCols} FROM scm_item i WHERE ${where} ORDER BY i.code`).all(...params) as any[]
    appendItemUnits(db, asid(req), list)
    parseFieldValues(list)
    return res.json({ code: 0, data: { list, total: list.length } })
  }

  const total = (db.prepare(`SELECT COUNT(*) c FROM scm_item i WHERE ${where}`).get(...params) as any).c
  const offset = (parseInt(page) - 1) * parseInt(page_size)
  const list = db.prepare(`SELECT ${selectCols} FROM scm_item i WHERE ${where} ORDER BY i.code LIMIT ? OFFSET ?`).all(...params, parseInt(page_size), offset) as any[]
  appendItemUnits(db, asid(req), list)
  parseFieldValues(list)

  res.json({ code: 0, data: { list, total, page: parseInt(page), page_size: parseInt(page_size) } })
})
// ── 辅助：同步物料-单位关联 ────────────────────────────────────────────
function syncItemUnits(db: ReturnType<typeof getDb>, aid: string, itemCode: string, primaryUnitCode?: string, secondaryUnits?: Array<{ unit_code: string; conversion_rate: number }>) {
  db.prepare('DELETE FROM scm_item_unit WHERE account_set_id=? AND item_code=?').run(aid, itemCode)
  if (primaryUnitCode) {
    db.prepare('INSERT INTO scm_item_unit (id,account_set_id,item_code,unit_code,is_primary,conversion_rate) VALUES (?,?,?,?,1,1)').run(
      uuidv4(), aid, itemCode, primaryUnitCode
    )
  }
  if (Array.isArray(secondaryUnits)) {
    for (const su of secondaryUnits) {
      if (!su.unit_code || su.unit_code === primaryUnitCode) continue
      db.prepare('INSERT INTO scm_item_unit (id,account_set_id,item_code,unit_code,is_primary,conversion_rate) VALUES (?,?,?,?,0,?)').run(
        uuidv4(), aid, itemCode, su.unit_code, Number(su.conversion_rate) || 1
      )
    }
  }
}

router.post('/scm/items', operationLog('物料新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.name) return res.status(400).json({ code: 400, message: '编号和名称不能为空' })
  if (db.prepare('SELECT id FROM scm_item WHERE account_set_id=? AND code=?').get(asid(req), b.code)) {
    return res.status(409).json({ code: 409, message: '物料编号已存在' })
  }
  const aid = asid(req)
  // 向后兼容：若无 primary_unit_code 但传了旧 unit 文本，自动创建/匹配单位
  let primaryUnitCode = b.primary_unit_code
  if (!primaryUnitCode && b.unit) {
    const uname = String(b.unit).trim()
    if (uname) {
      let u = db.prepare('SELECT code FROM scm_unit WHERE account_set_id=? AND name=?').get(aid, uname) as any
      if (!u) {
        const uCode = nextCode(db, 'scm_unit', aid, 'UN')
        db.prepare('INSERT INTO scm_unit (id,account_set_id,code,name) VALUES (?,?,?,?)').run(uuidv4(), aid, uCode, uname)
        u = { code: uCode }
      }
      primaryUnitCode = u.code
    }
  }
  const unitName = primaryUnitCode
    ? (db.prepare('SELECT name FROM scm_unit WHERE account_set_id=? AND code=?').get(aid, primaryUnitCode) as any)?.name || b.unit || null
    : b.unit || null

  // 自动计算级次
  let level = 1
  let parentId = b.parent_id || null
  if (parentId) {
    const parent = db.prepare('SELECT id, level FROM scm_item WHERE id=? AND account_set_id=?').get(parentId, aid) as any
    if (!parent) return res.status(400).json({ code: 400, message: '上级物料不存在' })
    level = (parent.level || 0) + 1
  }

  const id = uuidv4()
  const fieldValuesJson = JSON.stringify(b.field_values && typeof b.field_values === 'object' ? b.field_values : {})
  db.prepare(`INSERT INTO scm_item
    (id,account_set_id,code,name,spec,barcode,short_code,unit,category_code,subcategory_code,item_type,
     purchase_price,sale_price,ref_cost,fixed_cost,inv_account,sale_account,batch_flag,is_asset,supplier_code,remark,enabled,parent_id,level,is_leaf,field_values)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, aid, b.code, b.name, b.spec ?? null, b.barcode ?? null, b.short_code ?? null, unitName,
    b.category_code ?? null, b.subcategory_code ?? null, b.item_type ?? null,
    Number(b.purchase_price) || 0, Number(b.sale_price) || 0, Number(b.ref_cost) || 0, Number(b.fixed_cost) || 0,
    b.inv_account ?? null, b.sale_account ?? null, b.batch_flag ? 1 : 0, b.is_asset ? 1 : 0,
    b.supplier_code ?? null, b.remark ?? null, b.enabled === 0 ? 0 : 1, parentId, level,
    b.is_leaf !== undefined ? (b.is_leaf ? 1 : 0) : 1, fieldValuesJson
  )
  // 同步主/副单位关联
  if (primaryUnitCode) syncItemUnits(db, aid, b.code, primaryUnitCode, b.secondary_units)
  res.json({ code: 0, data: { id } })
})
router.put('/scm/items/:id', operationLog('物料修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body; const aid = asid(req)
  const ex = db.prepare('SELECT id, code FROM scm_item WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!ex) return res.status(404).json({ code: 404, message: '物料不存在' })

  let primaryUnitCode = b.primary_unit_code
  if (!primaryUnitCode && b.unit) {
    const uname = String(b.unit).trim()
    if (uname) {
      let u = db.prepare('SELECT code FROM scm_unit WHERE account_set_id=? AND name=?').get(aid, uname) as any
      if (!u) {
        const uCode = nextCode(db, 'scm_unit', aid, 'UN')
        db.prepare('INSERT INTO scm_unit (id,account_set_id,code,name) VALUES (?,?,?,?)').run(uuidv4(), aid, uCode, uname)
        u = { code: uCode }
      }
      primaryUnitCode = u.code
    }
  }
  const unitName = primaryUnitCode
    ? (db.prepare('SELECT name FROM scm_unit WHERE account_set_id=? AND code=?').get(aid, primaryUnitCode) as any)?.name || b.unit || null
    : b.unit || null

  // 级次重算
  let level = 1
  let parentId = b.parent_id !== undefined ? (b.parent_id || null) : undefined
  if (parentId) {
    if (parentId === ex.id) return res.status(400).json({ code: 400, message: '上级不能选择自身' })
    const parent = db.prepare('SELECT id, level FROM scm_item WHERE id=? AND account_set_id=?').get(parentId, aid) as any
    if (!parent) return res.status(400).json({ code: 400, message: '上级物料不存在' })
    level = (parent.level || 0) + 1
  } else if (parentId === null) {
    level = 1
  }

  const fieldValuesJson = JSON.stringify(b.field_values && typeof b.field_values === 'object' ? b.field_values : {})
  const fields = `name=?,spec=?,barcode=?,short_code=?,unit=?,category_code=?,subcategory_code=?,item_type=?,
    purchase_price=?,sale_price=?,ref_cost=?,fixed_cost=?,inv_account=?,sale_account=?,batch_flag=?,is_asset=?,supplier_code=?,remark=?,enabled=?,is_leaf=?,field_values=?,updated_at=datetime('now')`
  const vals: any[] = [b.name, b.spec ?? null, b.barcode ?? null, b.short_code ?? null, unitName, b.category_code ?? null, b.subcategory_code ?? null, b.item_type ?? null,
    Number(b.purchase_price) || 0, Number(b.sale_price) || 0, Number(b.ref_cost) || 0, Number(b.fixed_cost) || 0,
    b.inv_account ?? null, b.sale_account ?? null, b.batch_flag ? 1 : 0, b.is_asset ? 1 : 0, b.supplier_code ?? null, b.remark ?? null,
    b.enabled === 0 ? 0 : 1, b.is_leaf !== undefined ? (b.is_leaf ? 1 : 0) : 1, fieldValuesJson]

  if (parentId !== undefined) {
    db.prepare(`UPDATE scm_item SET ${fields}, parent_id=?, level=? WHERE id=?`).run(...vals, parentId, level, req.params.id)
  } else {
    db.prepare(`UPDATE scm_item SET ${fields} WHERE id=?`).run(...vals, req.params.id)
  }
  if (primaryUnitCode) syncItemUnits(db, aid, ex.code, primaryUnitCode, b.secondary_units)
  res.json({ code: 0, data: { ok: true } })
})
router.delete('/scm/items/:id', operationLog('物料删除', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const ex = db.prepare('SELECT id FROM scm_item WHERE id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (!ex) return res.status(404).json({ code: 404, message: '物料不存在' })
  const children = db.prepare('SELECT COUNT(*) c FROM scm_item WHERE parent_id=? AND account_set_id=?').get(req.params.id, aid) as any
  if (children?.c > 0) return res.status(409).json({ code: 409, message: `该物料下有 ${children.c} 个子物料，请先删除子物料` })
  db.prepare('DELETE FROM scm_item WHERE id=? AND account_set_id=?').run(req.params.id, aid)
  res.json({ code: 0, data: { ok: true } })
})

// ── 往来单位档案 ────────────────────────────────────────────────────────
router.get('/scm/partners/next-no', (req: AuthRequest, res) => {
  const { partner_type } = req.query as any
  const prefix = partner_type === 'supplier' ? 'GYS' : partner_type === 'customer' ? 'KH' : 'WL'
  const rows = getDb().prepare("SELECT code FROM scm_partner WHERE account_set_id=? AND code LIKE ?").all(asid(req), `${prefix}%`) as Array<{ code: string }>
  let maxNum = -1; let width = 4
  for (const r of rows) {
    const m = String(r.code || '').match(new RegExp(`^${prefix}(\\d+)$`))
    if (m) { const n = parseInt(m[1], 10); if (n >= maxNum) { maxNum = n; width = m[1].length } }
  }
  const nextNo = maxNum < 0 ? `${prefix}0001` : prefix + String(maxNum + 1).padStart(width, '0')
  res.json({ code: 0, data: { next_no: nextNo } })
})
router.get('/scm/partners', (req: AuthRequest, res) => {
  const db = getDb()
  const { keyword, partner_type } = req.query as any
  const conds = ['account_set_id=?']; const params: any[] = [asid(req)]
  if (keyword) { conds.push('(code LIKE ? OR name LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`) }
  if (partner_type) { conds.push('(partner_type=? OR partner_type=?)'); params.push(partner_type, 'both') }
  const list = db.prepare(`SELECT * FROM scm_partner WHERE ${conds.join(' AND ')} ORDER BY code`).all(...params)
  res.json({ code: 0, data: list })
})
router.post('/scm/partners', operationLog('往来单位新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.name) return res.status(400).json({ code: 400, message: '编号和名称不能为空' })
  if (db.prepare('SELECT id FROM scm_partner WHERE account_set_id=? AND code=?').get(asid(req), b.code)) {
    return res.status(409).json({ code: 409, message: '往来单位编号已存在' })
  }
  const id = uuidv4()
  db.prepare(`INSERT INTO scm_partner
    (id,account_set_id,code,name,short_name,partner_type,ar_account,ap_account,credit_limit,tax_rate,region_code,
     contact,phone,address,bank_name,bank_account,tax_no,salesman,remark,enabled)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, asid(req), b.code, b.name, b.short_name ?? null, b.partner_type || 'both', b.ar_account ?? null, b.ap_account ?? null,
    Number(b.credit_limit) || 0, Number(b.tax_rate) || 0, b.region_code ?? null,
    b.contact ?? null, b.phone ?? null, b.address ?? null, b.bank_name ?? null, b.bank_account ?? null,
    b.tax_no ?? null, b.salesman ?? null, b.remark ?? null, b.enabled === 0 ? 0 : 1
  )
  res.json({ code: 0, data: { id } })
})
router.put('/scm/partners/:id', operationLog('往来单位修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  const ex = db.prepare('SELECT id FROM scm_partner WHERE id=? AND account_set_id=?').get(req.params.id, asid(req))
  if (!ex) return res.status(404).json({ code: 404, message: '往来单位不存在' })
  db.prepare(`UPDATE scm_partner SET name=?,short_name=?,partner_type=?,ar_account=?,ap_account=?,credit_limit=?,tax_rate=?,region_code=?,
    contact=?,phone=?,address=?,bank_name=?,bank_account=?,tax_no=?,salesman=?,remark=?,enabled=?,updated_at=datetime('now') WHERE id=?`).run(
    b.name, b.short_name ?? null, b.partner_type || 'both', b.ar_account ?? null, b.ap_account ?? null,
    Number(b.credit_limit) || 0, Number(b.tax_rate) || 0, b.region_code ?? null,
    b.contact ?? null, b.phone ?? null, b.address ?? null, b.bank_name ?? null, b.bank_account ?? null,
    b.tax_no ?? null, b.salesman ?? null, b.remark ?? null, b.enabled === 0 ? 0 : 1, req.params.id
  )
  res.json({ code: 0, data: { ok: true } })
})
router.delete('/scm/partners/:id', operationLog('往来单位删除', '供应链'), (req: AuthRequest, res) => {
  getDb().prepare('DELETE FROM scm_partner WHERE id=? AND account_set_id=?').run(req.params.id, asid(req))
  res.json({ code: 0, data: { ok: true } })
})

// ── 仓库档案 ────────────────────────────────────────────────────────────
router.get('/scm/warehouses/next-no', (req: AuthRequest, res) => {
  res.json({ code: 0, data: { next_no: nextCode(getDb(), 'scm_warehouse', asid(req), 'WH') } })
})
router.get('/scm/warehouses', (req: AuthRequest, res) => {
  const list = getDb().prepare('SELECT * FROM scm_warehouse WHERE account_set_id=? ORDER BY code').all(asid(req))
  res.json({ code: 0, data: list })
})
router.post('/scm/warehouses', operationLog('仓库新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.name) return res.status(400).json({ code: 400, message: '编号和名称不能为空' })
  if (db.prepare('SELECT id FROM scm_warehouse WHERE account_set_id=? AND code=?').get(asid(req), b.code)) {
    return res.status(409).json({ code: 409, message: '仓库编号已存在' })
  }
  const id = uuidv4()
  db.prepare('INSERT INTO scm_warehouse (id,account_set_id,code,name,attr,keeper,remark,enabled) VALUES (?,?,?,?,?,?,?,?)').run(
    id, asid(req), b.code, b.name, b.attr ?? null, b.keeper ?? null, b.remark ?? null, b.enabled === 0 ? 0 : 1
  )
  res.json({ code: 0, data: { id } })
})
router.put('/scm/warehouses/:id', operationLog('仓库修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!db.prepare('SELECT id FROM scm_warehouse WHERE id=? AND account_set_id=?').get(req.params.id, asid(req))) {
    return res.status(404).json({ code: 404, message: '仓库不存在' })
  }
  db.prepare('UPDATE scm_warehouse SET name=?,attr=?,keeper=?,remark=?,enabled=? WHERE id=?').run(
    b.name, b.attr ?? null, b.keeper ?? null, b.remark ?? null, b.enabled === 0 ? 0 : 1, req.params.id
  )
  res.json({ code: 0, data: { ok: true } })
})
router.delete('/scm/warehouses/:id', operationLog('仓库删除', '供应链'), (req: AuthRequest, res) => {
  getDb().prepare('DELETE FROM scm_warehouse WHERE id=? AND account_set_id=?').run(req.params.id, asid(req))
  res.json({ code: 0, data: { ok: true } })
})

// ── 计量单位档案 ────────────────────────────────────────────────────────
router.get('/scm/units/next-no', (req: AuthRequest, res) => {
  res.json({ code: 0, data: { next_no: nextCode(getDb(), 'scm_unit', asid(req), 'UN') } })
})
router.get('/scm/units', (req: AuthRequest, res) => {
  const list = getDb().prepare('SELECT * FROM scm_unit WHERE account_set_id=? ORDER BY code').all(asid(req))
  res.json({ code: 0, data: list })
})
router.post('/scm/units', operationLog('单位新增', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!b.code || !b.name) return res.status(400).json({ code: 400, message: '编号和名称不能为空' })
  if (db.prepare('SELECT id FROM scm_unit WHERE account_set_id=? AND code=?').get(asid(req), b.code)) {
    return res.status(409).json({ code: 409, message: '单位编号已存在' })
  }
  const id = uuidv4()
  db.prepare('INSERT INTO scm_unit (id,account_set_id,code,name,remark,enabled) VALUES (?,?,?,?,?,?)').run(
    id, asid(req), b.code, b.name, b.remark ?? null, b.enabled === 0 ? 0 : 1
  )
  res.json({ code: 0, data: { id } })
})
router.put('/scm/units/:id', operationLog('单位修改', '供应链'), (req: AuthRequest, res) => {
  const db = getDb(); const b = req.body
  if (!db.prepare('SELECT id FROM scm_unit WHERE id=? AND account_set_id=?').get(req.params.id, asid(req))) {
    return res.status(404).json({ code: 404, message: '单位不存在' })
  }
  db.prepare('UPDATE scm_unit SET name=?,remark=?,enabled=?,updated_at=datetime(\'now\') WHERE id=?').run(
    b.name, b.remark ?? null, b.enabled === 0 ? 0 : 1, req.params.id
  )
  res.json({ code: 0, data: { ok: true } })
})
router.delete('/scm/units/:id', operationLog('单位删除', '供应链'), (req: AuthRequest, res) => {
  const db = getDb()
  const unit = db.prepare('SELECT code FROM scm_unit WHERE id=? AND account_set_id=?').get(req.params.id, asid(req)) as any
  if (!unit) return res.status(404).json({ code: 404, message: '单位不存在' })
  const refs = db.prepare('SELECT COUNT(*) c FROM scm_item_unit WHERE account_set_id=? AND unit_code=?').get(asid(req), unit.code) as any
  if (refs?.c > 0) return res.status(409).json({ code: 409, message: `该单位被 ${refs.c} 个物料引用，无法删除` })
  db.prepare('DELETE FROM scm_unit WHERE id=?').run(req.params.id)
  res.json({ code: 0, data: { ok: true } })
})

// ── 物料分类 ────────────────────────────────────────────────────────────
router.get('/scm/categories', (req: AuthRequest, res) => {
  const list = getDb().prepare('SELECT * FROM scm_item_category WHERE account_set_id=? ORDER BY code').all(asid(req))
  res.json({ code: 0, data: list })
})

// ── 库存报表 ────────────────────────────────────────────────────────────
// 收发存汇总（按仓库+物料，含期初/本期入/本期出/期末）
router.get('/scm/stock/summary', (req: AuthRequest, res) => {
  const db = getDb(); const aid = asid(req)
  const { start_date, end_date, warehouse_code } = req.query as any
  const sd = start_date || '2000-01-01'; const ed = end_date || '2099-12-31'

  // 期初 = 当前库存 - 期间净变动（start_date 前库存）
  const currentStock = db.prepare(
    'SELECT warehouse_code, item_code, qty, amount FROM scm_stock WHERE account_set_id=?'
  ).all(aid) as any[]
  // 期间流水
  const moves = db.prepare(
    `SELECT m.warehouse_code, m.item_code, m.direction, m.qty, m.amount,
      i.name AS item_name, i.spec, i.unit, w.name AS warehouse_name
     FROM scm_stock_move m
     LEFT JOIN scm_item i ON i.account_set_id=m.account_set_id AND i.code=m.item_code
     LEFT JOIN scm_warehouse w ON w.account_set_id=m.account_set_id AND w.code=m.warehouse_code
     WHERE m.account_set_id=? AND m.move_date BETWEEN ? AND ?`
  ).all(aid, sd, ed) as any[]
  if (warehouse_code) { return res.json({ code: 0, data: { summary: [], moves: moves.filter(m => m.warehouse_code === warehouse_code) } }) }

  // 先累计期间变动
  const map = new Map<string, any>()
  for (const m of moves) {
    const k = `${m.warehouse_code}|${m.item_code}`
    if (!map.has(k)) map.set(k, { in_qty: 0, in_amt: 0, out_qty: 0, out_amt: 0 })
    const r = map.get(k)!
    if (m.direction === 'in') { r.in_qty += m.qty; r.in_amt += m.amount }
    else { r.out_qty += m.qty; r.out_amt += m.amount }
    r.item_name = m.item_name; r.spec = m.spec; r.unit = m.unit
    r.warehouse_name = m.warehouse_name; r.warehouse_code = m.warehouse_code; r.item_code = m.item_code
  }
  // 用当前库存计算期初：opening = closing - in + out
  for (const s of currentStock) {
    const k = `${s.warehouse_code}|${s.item_code}`
    if (!map.has(k)) map.set(k, { in_qty: 0, in_amt: 0, out_qty: 0, out_amt: 0, item_name: '', spec: '', unit: '', warehouse_name: '', warehouse_code: s.warehouse_code, item_code: s.item_code })
    const r = map.get(k)!
    r.opening_qty = Math.round((s.qty - (r.in_qty || 0) + (r.out_qty || 0)) * 10000) / 10000
    r.opening_amt = Math.round((s.amount - (r.in_amt || 0) + (r.out_amt || 0)) * 100) / 100
    r.warehouse_code = s.warehouse_code; r.item_code = s.item_code
  }
  const summary = [...map.values()].filter(r => r.opening_qty !== undefined).map(r => ({
    warehouse_code: r.warehouse_code, warehouse_name: r.warehouse_name,
    item_code: r.item_code, item_name: r.item_name, spec: r.spec, unit: r.unit,
    opening_qty: r.opening_qty || 0, opening_amt: r.opening_amt || 0,
    in_qty: r.in_qty || 0, in_amt: r.in_amt || 0,
    out_qty: r.out_qty || 0, out_amt: r.out_amt || 0,
    closing_qty: Math.round(((r.opening_qty || 0) + (r.in_qty || 0) - (r.out_qty || 0)) * 10000) / 10000,
    closing_amt: Math.round(((r.opening_amt || 0) + (r.in_amt || 0) - (r.out_amt || 0)) * 100) / 100,
  }))
  res.json({ code: 0, data: { summary } })
})

// 库存查询 ────────────────────────────────────────────────────────────
// 即时库存（join 物料名/仓库名）
router.get('/scm/stock', (req: AuthRequest, res) => {
  const db = getDb()
  const { keyword, warehouse_code } = req.query as any
  const conds = ['s.account_set_id=?']; const params: any[] = [asid(req)]
  if (warehouse_code) { conds.push('s.warehouse_code=?'); params.push(warehouse_code) }
  if (keyword) { conds.push('(s.item_code LIKE ? OR i.name LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`) }
  const list = db.prepare(`
    SELECT s.*, i.name AS item_name, i.spec, i.unit, w.name AS warehouse_name
    FROM scm_stock s
    LEFT JOIN scm_item i ON i.account_set_id=s.account_set_id AND i.code=s.item_code
    LEFT JOIN scm_warehouse w ON w.account_set_id=s.account_set_id AND w.code=s.warehouse_code
    WHERE ${conds.join(' AND ')}
    ORDER BY s.warehouse_code, s.item_code
  `).all(...params)
  res.json({ code: 0, data: list })
})

// 出入库流水（库存明细账）
router.get('/scm/stock/ledger', (req: AuthRequest, res) => {
  const db = getDb()
  const { item_code, warehouse_code, start_date, end_date } = req.query as any
  const conds = ['m.account_set_id=?']; const params: any[] = [asid(req)]
  if (item_code) { conds.push('m.item_code=?'); params.push(item_code) }
  if (warehouse_code) { conds.push('m.warehouse_code=?'); params.push(warehouse_code) }
  if (start_date) { conds.push('m.move_date>=?'); params.push(start_date) }
  if (end_date) { conds.push('m.move_date<=?'); params.push(end_date) }
  const list = db.prepare(`
    SELECT m.*, i.name AS item_name, w.name AS warehouse_name
    FROM scm_stock_move m
    LEFT JOIN scm_item i ON i.account_set_id=m.account_set_id AND i.code=m.item_code
    LEFT JOIN scm_warehouse w ON w.account_set_id=m.account_set_id AND w.code=m.warehouse_code
    WHERE ${conds.join(' AND ')}
    ORDER BY m.move_date, m.created_at
  `).all(...params)
  res.json({ code: 0, data: list })
})

export default router
