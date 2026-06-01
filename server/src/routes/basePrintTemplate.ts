import { Router } from 'express'
import { normalizePrintTemplateElements } from '../utils/printTemplateNormalize.js'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.js'
import { ensureDefaultPrintTemplateForAccountSet } from '../services/printTemplateDefaults.js'

const router = Router()
router.use(authMiddleware)

// ===================== 打印模版管理 =====================

// 获取打印模版列表
router.get('/print-templates', (req: AuthRequest, res) => {
  const db = getDb()
  const templates = db
    .prepare(
      `SELECT id, name, paper_size, paper_width, paper_height,
              margin_top, margin_bottom, margin_left, margin_right,
              elements, is_default, created_at, updated_at
       FROM print_templates
       WHERE account_set_id = ?
       ORDER BY is_default DESC, created_at DESC`
    )
    .all(req.accountSetId || '')

  res.json({
    code: 0,
    data: templates.map((t: any) => ({
      ...t,
      elements: normalizePrintTemplateElements(t.elements ? JSON.parse(t.elements) : [], t.paper_width, t.paper_height),
      is_default: Boolean(t.is_default),
    })),
  })
})

// 获取单个打印模版详情
router.get('/print-templates/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const template = db
    .prepare(
      `SELECT id, name, paper_size, paper_width, paper_height,
              margin_top, margin_bottom, margin_left, margin_right,
              elements, is_default, created_at, updated_at
       FROM print_templates
       WHERE id = ? AND account_set_id = ?`
    )
    .get(id, req.accountSetId || '') as any

  if (!template) {
    return res.status(404).json({ code: 404, message: '打印模版不存在' })
  }

  res.json({
    code: 0,
    data: {
      ...template,
      elements: normalizePrintTemplateElements(
        JSON.parse(template.elements || '[]'),
        template.paper_width,
        template.paper_height
      ),
      is_default: Boolean(template.is_default),
    },
  })
})

// 设置默认打印模版
router.post(
  '/print-templates/default/:id',
  operationLog('设置默认打印模版', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()

    // 检查模版是否存在
    const template = db
      .prepare('SELECT id FROM print_templates WHERE id = ? AND account_set_id = ?')
      .get(id, req.accountSetId || '')

    if (!template) {
      return res.status(404).json({ code: 404, message: '打印模版不存在' })
    }

    // 取消当前默认模版
    db.prepare('UPDATE print_templates SET is_default = 0 WHERE account_set_id = ?').run(
      req.accountSetId || ''
    )

    // 设置新的默认模版
    db.prepare('UPDATE print_templates SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?').run(
      id
    )

    res.json({ code: 0, message: '设置成功' })
  }
)

// 创建打印模版
router.post(
  '/print-templates',
  operationLog('创建打印模版', '基础设置'),
  (req: AuthRequest, res) => {
    const {
      name,
      paper_width,
      paper_height,
      margin_top,
      margin_bottom,
      margin_left,
      margin_right,
      elements,
    } = req.body

    // 验证必填字段
    if (!name || !paper_width || !paper_height) {
      return res.status(400).json({ code: 400, message: '缺少必填字段' })
    }

    const db = getDb()
    const id = uuidv4()

    try {
      db.prepare(
        `INSERT INTO print_templates
         (id, account_set_id, name, paper_width, paper_height,
          margin_top, margin_bottom, margin_left, margin_right, elements, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).run(
        id,
        req.accountSetId || '',
        name,
        paper_width,
        paper_height,
        margin_top || 15,
        margin_bottom || 15,
        margin_left || 10,
        margin_right || 10,
        JSON.stringify(elements || {})
      )

      res.json({ code: 0, message: '创建成功', data: { id } })
    } catch (error: any) {
      res.status(500).json({ code: 500, message: '创建失败：' + error.message })
    }
  }
)

// 更新打印模版
router.put(
  '/print-templates/:id',
  operationLog('更新打印模版', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const {
      name,
      paper_size,
      paper_width,
      paper_height,
      margin_top,
      margin_bottom,
      margin_left,
      margin_right,
      elements,
    } = req.body

    const db = getDb()

    // 检查模版是否存在
    const template = db
      .prepare('SELECT id FROM print_templates WHERE id = ? AND account_set_id = ?')
      .get(id, req.accountSetId || '')

    if (!template) {
      return res.status(404).json({ code: 404, message: '打印模版不存在' })
    }

    try {
      console.log('[DEBUG] 更新模版请求数据:', {
        id,
        name,
        paper_size,
        paper_width,
        paper_height,
        margin_top,
        margin_bottom,
        margin_left,
        margin_right,
        elements_type: typeof elements,
        elements_length: Array.isArray(elements) ? elements.length : 'not array',
        accountSetId: req.accountSetId
      })

      const elementsJson = JSON.stringify(elements || [])
      console.log('[DEBUG] elements JSON 长度:', elementsJson.length)

      db.prepare(
        `UPDATE print_templates
         SET name = ?, paper_size = ?, paper_width = ?, paper_height = ?,
             margin_top = ?, margin_bottom = ?, margin_left = ?, margin_right = ?,
             elements = ?, updated_at = datetime('now')
         WHERE id = ? AND account_set_id = ?`
      ).run(
        name,
        paper_size,
        paper_width,
        paper_height,
        margin_top,
        margin_bottom,
        margin_left,
        margin_right,
        elementsJson,
        id,
        req.accountSetId || ''
      )

      console.log('[DEBUG] 更新成功')
      res.json({ code: 0, message: '更新成功' })
    } catch (error: any) {
      console.error('[DEBUG PUT ERROR]', error.message, error.stack)
      res.status(500).json({ code: 500, message: '更新失败：' + error.message })
    }
  }
)

// 删除打印模版
router.delete(
  '/print-templates/:id',
  operationLog('删除打印模版', '基础设置'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()

    // 检查模版是否存在
    const template = db
      .prepare('SELECT id, is_default FROM print_templates WHERE id = ? AND account_set_id = ?')
      .get(id, req.accountSetId || '') as any

    if (!template) {
      return res.status(404).json({ code: 404, message: '打印模版不存在' })
    }

    // 不允许删除默认模版
    if (template.is_default) {
      return res.status(400).json({ code: 400, message: '不能删除默认模版' })
    }

    try {
      db.prepare('DELETE FROM print_templates WHERE id = ? AND account_set_id = ?').run(
        id,
        req.accountSetId || ''
      )

      res.json({ code: 0, message: '删除成功' })
    } catch (error: any) {
      res.status(500).json({ code: 500, message: '删除失败：' + error.message })
    }
  }
)

// 初始化默认打印模版（仅在没有默认模版时创建）
router.post(
  '/print-templates/init-default',
  operationLog('初始化默认打印模版', '基础设置'),
  (req: AuthRequest, res) => {
    const db = getDb()
    const accountSetId = req.accountSetId || ''

    const result = ensureDefaultPrintTemplateForAccountSet(db, accountSetId)

    if (!result.created) {
      return res.json({ code: 0, message: '已存在默认打印模版，无需初始化' })
    }

    res.json({ code: 0, message: '默认模版初始化成功', data: { id: result.id } })
  }
)

export default router
