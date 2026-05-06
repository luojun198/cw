import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import { buildWhereClause, normalizePunctuation, SqlParam } from '../services/baseValidation.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 辅助核算类别 =====================

router.get('/aux-categories', (req: AuthRequest, res) => {
  const db = getDb()
  const { keyword } = req.query
  const conditions = ['account_set_id = ?']
  const params: SqlParam[] = [req.accountSetId || '']

  if (typeof keyword === 'string' && keyword) {
    conditions.push('(name LIKE ? OR code LIKE ?)')
    const keywordPattern = `%${keyword}%`
    params.push(keywordPattern, keywordPattern)
  }

  const where = buildWhereClause(conditions)
  const sql = `SELECT * FROM aux_categories${where} ORDER BY sort_order, code`
  const list = db.prepare(sql).all(...params) as any[]

  // 附加每个类别的字段配置
  const fieldsStmt = db.prepare('SELECT * FROM aux_category_fields WHERE category_id=? AND is_enabled=1 ORDER BY sort_order')
  for (const cat of list) {
    cat.fields = fieldsStmt.all(cat.id)
  }

  res.json({ code: 0, data: list })
})

router.post(
  '/aux-categories',
  operationLog('新增核算类别', '基础设置'),
  (req: AuthRequest, res) => {
    const { code, name, default_item_id, sort_order, fields } = req.body
    if (!code || !name) {
      return res.status(400).json({ code: 400, message: '编码、名称不能为空' })
    }
    const db = getDb()
    const duplicated = db
      .prepare('SELECT id FROM aux_categories WHERE account_set_id=? AND name=?')
      .get(req.accountSetId, name)
    if (duplicated) {
      return res.status(400).json({ code: 400, message: '类别名称不能重复' })
    }
    const id = uuidv4()

    const insertCategory = db.transaction(() => {
      db.prepare(
        'INSERT INTO aux_categories (id, account_set_id, code, name, default_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, req.accountSetId, code, name, default_item_id || null, sort_order || 0)

      // 保存字段配置
      if (Array.isArray(fields)) {
        const insertField = db.prepare(
          `INSERT INTO aux_category_fields (id, category_id, field_key, field_name, field_type, options_json, show_in_voucher, required_in_voucher, required_in_archive, sort_order, is_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i]
          if (!f.field_key || !f.field_name) continue
          insertField.run(
            uuidv4(), id,
            f.field_key, f.field_name, f.field_type || 'text',
            f.options_json || null,
            f.show_in_voucher ? 1 : 0,
            f.required_in_voucher ? 1 : 0,
            f.required_in_archive ? 1 : 0,
            f.sort_order ?? i
          )
        }
      }
    })

    insertCategory()
    res.json({ code: 0, message: '创建成功', data: { id } })
  }
)

router.put(
  '/aux-categories/:id',
  operationLog('修改核算类别', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { name, default_item_id, sort_order, fields } = req.body
    const db = getDb()
    const duplicated = db
      .prepare('SELECT id FROM aux_categories WHERE account_set_id=? AND name=? AND id<>?')
      .get(req.accountSetId, name, id)
    if (duplicated) {
      return res.status(400).json({ code: 400, message: '类别名称不能重复' })
    }

    const updateCategory = db.transaction(() => {
      db.prepare(
        "UPDATE aux_categories SET name=?, default_item_id=?, sort_order=?, updated_at=datetime('now') WHERE id=?"
      ).run(name, default_item_id || null, sort_order || 0, id)

      // 更新字段配置：先禁用全部，再 upsert
      if (Array.isArray(fields)) {
        // 获取现有字段 key 集合
        const existingFields = db.prepare('SELECT id, field_key FROM aux_category_fields WHERE category_id=?').all(id) as any[]
        const existingMap = new Map(existingFields.map(f => [f.field_key, f.id]))

        const insertField = db.prepare(
          `INSERT INTO aux_category_fields (id, category_id, field_key, field_name, field_type, options_json, show_in_voucher, required_in_voucher, required_in_archive, sort_order, is_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        const updateField = db.prepare(
          `UPDATE aux_category_fields SET field_name=?, field_type=?, options_json=?, show_in_voucher=?, required_in_voucher=?, required_in_archive=?, sort_order=?, is_enabled=1, updated_at=datetime('now') WHERE id=?`
        )
        // 将不在新列表中的字段设为禁用
        const newKeys = new Set(fields.filter((f: any) => f.field_key).map((f: any) => f.field_key))
        for (const ef of existingFields) {
          if (!newKeys.has(ef.field_key)) {
            db.prepare("UPDATE aux_category_fields SET is_enabled=0, updated_at=datetime('now') WHERE id=?").run(ef.id)
          }
        }

        for (let i = 0; i < fields.length; i++) {
          const f = fields[i]
          if (!f.field_key || !f.field_name) continue
          const existingId = existingMap.get(f.field_key)
          if (existingId) {
            updateField.run(
              f.field_name, f.field_type || 'text', f.options_json || null,
              f.show_in_voucher ? 1 : 0, f.required_in_voucher ? 1 : 0, f.required_in_archive ? 1 : 0,
              f.sort_order ?? i, existingId
            )
          } else {
            insertField.run(
              uuidv4(), id,
              f.field_key, f.field_name, f.field_type || 'text',
              f.options_json || null,
              f.show_in_voucher ? 1 : 0, f.required_in_voucher ? 1 : 0, f.required_in_archive ? 1 : 0,
              f.sort_order ?? i
            )
          }
        }
      }
    })

    updateCategory()
    res.json({ code: 0, message: '更新成功' })
  }
)

router.delete(
  '/aux-categories/:id',
  operationLog('删除核算类别', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const used = db.prepare('SELECT COUNT(*) as count FROM aux_items WHERE type=?').get(id) as any
    if (used?.count > 0) {
      return res.status(400).json({ code: 400, message: '该类别下已有核算项目，无法删除' })
    }
    // ON DELETE CASCADE 会自动删除 aux_category_fields
    db.prepare('DELETE FROM aux_categories WHERE id=?').run(id)
    res.json({ code: 0, message: '删除成功' })
  }
)

// ===================== 字段配置独立接口 =====================

router.get('/aux-category-fields', (req: AuthRequest, res) => {
  const db = getDb()
  const { category_id } = req.query
  if (!category_id) {
    return res.status(400).json({ code: 400, message: 'category_id 不能为空' })
  }
  const list = db.prepare(
    'SELECT * FROM aux_category_fields WHERE category_id=? AND is_enabled=1 ORDER BY sort_order'
  ).all(category_id as string)
  res.json({ code: 0, data: list })
})

router.post(
  '/aux-category-fields',
  operationLog('新增类别字段', '基础设置'),
  (req: AuthRequest, res) => {
    const { category_id, field_key, field_name, field_type, options_json, show_in_voucher, required_in_voucher, required_in_archive, sort_order } = req.body
    if (!category_id || !field_key || !field_name) {
      return res.status(400).json({ code: 400, message: '类别、字段编码、字段名称不能为空' })
    }
    const db = getDb()
    const duplicated = db
      .prepare('SELECT id FROM aux_category_fields WHERE category_id=? AND field_key=?')
      .get(category_id, field_key)
    if (duplicated) {
      return res.status(400).json({ code: 400, message: '字段编码已存在' })
    }
    const id = uuidv4()
    db.prepare(
      `INSERT INTO aux_category_fields (id, category_id, field_key, field_name, field_type, options_json, show_in_voucher, required_in_voucher, required_in_archive, sort_order, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, category_id, field_key, field_name, field_type || 'text', options_json || null,
      show_in_voucher ? 1 : 0, required_in_voucher ? 1 : 0, required_in_archive ? 1 : 0, sort_order || 0)
    res.json({ code: 0, message: '创建成功', data: { id } })
  }
)

router.put(
  '/aux-category-fields/:id',
  operationLog('修改类别字段', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { field_name, field_type, options_json, show_in_voucher, required_in_voucher, required_in_archive, sort_order } = req.body
    const db = getDb()
    db.prepare(
      `UPDATE aux_category_fields SET field_name=?, field_type=?, options_json=?, show_in_voucher=?, required_in_voucher=?, required_in_archive=?, sort_order=?, updated_at=datetime('now') WHERE id=?`
    ).run(field_name, field_type || 'text', options_json || null,
      show_in_voucher ? 1 : 0, required_in_voucher ? 1 : 0, required_in_archive ? 1 : 0, sort_order || 0, id)
    res.json({ code: 0, message: '更新成功' })
  }
)

router.delete(
  '/aux-category-fields/:id',
  operationLog('删除类别字段', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    // 软删除：设为禁用
    db.prepare("UPDATE aux_category_fields SET is_enabled=0, updated_at=datetime('now') WHERE id=?").run(id)
    res.json({ code: 0, message: '删除成功' })
  }
)

// ===================== 辅助核算项目 =====================

router.get('/aux-items', (req: AuthRequest, res) => {
  const db = getDb()
  const { type, category_id, keyword, status } = req.query
  const conditions = ['ai.account_set_id = ?']
  const params: SqlParam[] = [req.accountSetId || '']

  // 支持 type 或 category_id 参数（两者等价）
  const categoryIdParam = category_id || type
  if (typeof categoryIdParam === 'string' && categoryIdParam) {
    conditions.push('ai.type = ?')
    params.push(categoryIdParam)
  }

  if (typeof keyword === 'string' && keyword) {
    conditions.push('(ai.name LIKE ? OR ai.code LIKE ?)')
    const keywordPattern = `%${keyword}%`
    params.push(keywordPattern, keywordPattern)
  }

  if (typeof status === 'string' && status) {
    conditions.push('ai.status = ?')
    params.push(status)
  }

  const where = buildWhereClause(conditions)
  const sql = `
    SELECT ai.*, ac.name as category_name, ac.code as category_code
    FROM aux_items ai
    LEFT JOIN aux_categories ac ON ac.id = ai.type${where}
    ORDER BY ai.code
  `
  const list = db.prepare(sql).all(...params)

  res.json({ code: 0, data: list })
})

router.post('/aux-items', operationLog('新增核算项目', '基础设置'), (req: AuthRequest, res) => {
  const { type, code, name, remark, field_values } = req.body
  const normalizedName = normalizePunctuation((name || '').trim())
  if (!type || !code || !normalizedName) {
    return res.status(400).json({ code: 400, message: '类别、编码、名称不能为空' })
  }
  const db = getDb()

  // 校验自定义字段必填
  const requiredFields = db.prepare(
    'SELECT field_key, field_name FROM aux_category_fields WHERE category_id=? AND is_enabled=1 AND required_in_archive=1'
  ).all(type) as any[]
  const fv = field_values || {}
  for (const rf of requiredFields) {
    if (!fv[rf.field_key] || String(fv[rf.field_key]).trim() === '') {
      return res.status(400).json({ code: 400, message: `"${rf.field_name}" 为必填字段` })
    }
  }

  const duplicatedCode = db
    .prepare('SELECT id, code, name FROM aux_items WHERE account_set_id=? AND type=? AND code=?')
    .get(req.accountSetId, type, code) as any
  if (duplicatedCode) {
    return res.status(400).json({
      code: 400,
      message: `项目编码已存在，不允许存盘。编码：${duplicatedCode.code}；名称：${duplicatedCode.name}`,
    })
  }
  const duplicated = db
    .prepare('SELECT id, code, name FROM aux_items WHERE account_set_id=? AND type=? AND name=?')
    .get(req.accountSetId, type, normalizedName) as any
  if (duplicated) {
    return res.status(400).json({
      code: 400,
      message: `项目名称已存在，不允许存盘。编码：${duplicated.code}；名称：${duplicated.name}`,
    })
  }
  const id = uuidv4()
  const fieldValuesJson = JSON.stringify(fv)
  db.prepare(
    'INSERT INTO aux_items (id, account_set_id, type, code, name, remark, field_values) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.accountSetId, type, code, normalizedName, remark || '', fieldValuesJson)
  res.json({ code: 0, message: '创建成功', data: { id } })
})

router.put('/aux-items/:id', operationLog('修改核算项目', '基础设置'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { code, name, status, remark, field_values } = req.body
  const normalizedName = normalizePunctuation((name || '').trim())
  const db = getDb()

  // 校验自定义字段必填
  const item = db.prepare('SELECT type FROM aux_items WHERE id=?').get(id) as any
  if (item) {
    const requiredFields = db.prepare(
      'SELECT field_key, field_name FROM aux_category_fields WHERE category_id=? AND is_enabled=1 AND required_in_archive=1'
    ).all(item.type) as any[]
    const fv = field_values || {}
    for (const rf of requiredFields) {
      if (!fv[rf.field_key] || String(fv[rf.field_key]).trim() === '') {
        return res.status(400).json({ code: 400, message: `"${rf.field_name}" 为必填字段` })
      }
    }
  }

  const duplicatedCode = db
    .prepare(
      'SELECT id, code, name FROM aux_items WHERE account_set_id=? AND type=(SELECT type FROM aux_items WHERE id=?) AND id<>? AND code=?'
    )
    .get(req.accountSetId, id, id, code) as any
  if (duplicatedCode) {
    return res.status(400).json({
      code: 400,
      message: `项目编码已存在，不允许存盘。编码：${duplicatedCode.code}；名称：${duplicatedCode.name}`,
    })
  }
  const duplicated = db
    .prepare(
      'SELECT id, code, name FROM aux_items WHERE account_set_id=? AND type=(SELECT type FROM aux_items WHERE id=?) AND id<>? AND name=?'
    )
    .get(req.accountSetId, id, id, normalizedName) as any
  if (duplicated) {
    return res.status(400).json({
      code: 400,
      message: `项目名称已存在，不允许存盘。编码：${duplicated.code}；名称：${duplicated.name}`,
    })
  }
  const fieldValuesJson = JSON.stringify(field_values || {})
  db.prepare(
    "UPDATE aux_items SET code=?, name=?, status=?, remark=?, field_values=?, updated_at=datetime('now') WHERE id=?"
  ).run(code, normalizedName, status, remark || '', fieldValuesJson, id)
  res.json({ code: 0, message: '更新成功' })
})

router.delete(
  '/aux-items/:id',
  operationLog('删除核算项目', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()

    // 检查是否被科目使用
    const rows = db
      .prepare('SELECT aux_types FROM accounts WHERE account_set_id=? AND aux_types IS NOT NULL')
      .all(req.accountSetId) as any[]
    for (const row of rows) {
      try {
        const data = JSON.parse(row.aux_types)
        if (Array.isArray(data) && data.includes(id)) {
          return res.status(400).json({ code: 400, message: '该核算项目已被科目使用，无法删除' })
        }
        if (typeof data === 'object' && Object.values(data).includes(id)) {
          return res.status(400).json({ code: 400, message: '该核算项目已被科目使用，无法删除' })
        }
      } catch {
        /* ignore */
      }
    }

    // 检查是否被凭证分录使用
    const usedEntry = db.prepare(`
      SELECT id FROM voucher_entries
      WHERE account_set_id=? AND (dept_id=? OR project_id=? OR supplier_id=? OR person_id=? OR func_class_id=?)
      LIMIT 1
    `).get(req.accountSetId, id, id, id, id, id) as any
    if (usedEntry) {
      return res.status(400).json({ code: 400, message: '该核算项目已被凭证使用，无法删除' })
    }

    db.prepare('DELETE FROM aux_items WHERE id=?').run(id)
    res.json({ code: 0, message: '删除成功' })
  }
)

export default router
