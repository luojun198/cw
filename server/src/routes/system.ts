import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import { buildSystemLogsQuery, buildSystemUsersQuery } from '../services/systemQuery.ts'
import {
  importAcdTemplateToAccountSet,
  type ImportStats,
} from '../scripts/importAcdToCurrentAccountSet.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 账套管理 =====================

router.get('/account-sets', (req: AuthRequest, res) => {
  const db = getDb()
  const accountSetColumns = db.prepare('PRAGMA table_info(account_sets)').all() as Array<{
    name: string
  }>
  const hasCreatedAt = accountSetColumns.some(column => column.name === 'created_at')
  const orderBy = hasCreatedAt ? 'created_at DESC' : 'name ASC'
  const list = db.prepare(`SELECT * FROM account_sets ORDER BY ${orderBy}`).all()
  res.json({ code: 0, data: list })
})

router.post('/account-sets', operationLog('创建账套', '系统管理'), (req: AuthRequest, res) => {
  const { name, code, credit_code, fiscal_year, start_date, unit_leader, chief_accountant } =
    req.body
  if (!name) {
    return res.status(400).json({ code: 400, message: '名称不能为空' })
  }
  const db = getDb()
  // 名称重复校验
  const existingName = db.prepare('SELECT id FROM account_sets WHERE name = ?').get(name)
  if (existingName) {
    return res.status(400).json({ code: 400, message: '账套名称已存在' })
  }
  // 自动生成编码（如果未提供）
  let finalCode = code
  if (!finalCode) {
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM account_sets').get() as any).cnt
    finalCode = `ZT${String(count + 1).padStart(3, '0')}`
  }
  const existingCode = db.prepare('SELECT id FROM account_sets WHERE code = ?').get(finalCode)
  if (existingCode) {
    return res.status(400).json({ code: 400, message: '账套编码已存在' })
  }
  const id = uuidv4()
  db.prepare(
    `
    INSERT INTO account_sets (id, name, code, credit_code, fiscal_year, start_date, unit_leader, chief_accountant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    name,
    finalCode,
    credit_code,
    fiscal_year || new Date().getFullYear(),
    start_date,
    unit_leader,
    chief_accountant
  )

  // 自动创建超级管理员 admin/admin123
  const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin'").get() as any
  if (adminRole) {
    const existingAdmin = db
      .prepare('SELECT id FROM users WHERE username = ? AND account_set_id = ?')
      .get('admin', id)
    if (!existingAdmin) {
      const userId = uuidv4()
      const hash = bcrypt.hashSync('admin123', 10)
      db.prepare(
        'INSERT INTO users (id, username, password, nickname, role_id, account_set_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, 'admin', hash, '系统管理员', adminRole.id, id)
    }
  }

  res.json({ code: 0, message: '创建成功，已自动创建管理员账号 admin/admin123', data: { id } })
})

router.put('/account-sets/:id', operationLog('修改账套', '系统管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const {
    name,
    code,
    credit_code,
    fiscal_year,
    start_date,
    unit_leader,
    chief_accountant,
    status,
  } = req.body
  const db = getDb()
  // 名称重复校验（排除自身）
  if (name) {
    const existingName = db
      .prepare('SELECT id FROM account_sets WHERE name = ? AND id != ?')
      .get(name, id)
    if (existingName) {
      return res.status(400).json({ code: 400, message: '账套名称已存在' })
    }
  }
  // 编码重复校验（排除自身）
  if (code) {
    const existingCode = db
      .prepare('SELECT id FROM account_sets WHERE code = ? AND id != ?')
      .get(code, id)
    if (existingCode) {
      return res.status(400).json({ code: 400, message: '账套编码已存在' })
    }
  }
  db.prepare(
    `
    UPDATE account_sets SET name=?, code=?, credit_code=?, fiscal_year=?, start_date=?, unit_leader=?, chief_accountant=?, status=?, updated_at=datetime('now')
    WHERE id=?
  `
  ).run(name, code, credit_code, fiscal_year, start_date, unit_leader, chief_accountant, status, id)
  res.json({ code: 0, message: '更新成功' })
})

router.delete(
  '/account-sets/:id',
  operationLog('删除账套', '系统管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { password } = req.body || {}
    const db = getDb()
    // 校验admin密码
    const adminUser = db
      .prepare("SELECT password FROM users WHERE username = 'admin' AND account_set_id = ?")
      .get(id) as any
    if (!adminUser) {
      return res.status(400).json({ code: 400, message: '未找到该账套的管理员账号' })
    }
    if (!password || !bcrypt.compareSync(password, adminUser.password)) {
      return res.status(400).json({ code: 400, message: '管理员密码错误' })
    }
    // 级联删除所有关联数据（临时禁用外键检查避免顺序问题）
    const deleteAll = db.transaction(() => {
      db.pragma('foreign_keys = OFF')
      const tables = [
        'voucher_entries',
        'voucher_attachments',
        'vouchers',
        'auto_transfer_runs',
        'account_balances',
        'period_closing',
        'init_balances',
        'report_cells',
        'report_template_sources',
        'report_sheets',
        'report_definitions',
        'report_template_items',
        'report_templates',
        'report_formula_functions',
        'transfer_items',
        'transfer_types',
        'aux_items',
        'aux_categories',
        'voucher_types',
        'system_params',
        'ai_config',
        'ai_logs',
        'backups',
        'operation_logs',
        'accounts',
        'users',
      ]
      for (const table of tables) {
        try {
          db.prepare(`DELETE FROM ${table} WHERE account_set_id = ?`).run(id)
        } catch {
          // 表可能不存在，忽略
        }
      }
      db.prepare('DELETE FROM account_sets WHERE id = ?').run(id)
      db.pragma('foreign_keys = ON')
    })
    deleteAll()
    res.json({ code: 0, message: '删除成功' })
  }
)

// ===================== 账套模板 =====================

// Helper: resolve template directories based on runtime environment
function getTemplateDirs(): string[] {
  const cwd = process.cwd()
  // Deploy mode: cwd = deploy-final/, templates in deploy-final/模版/
  // Dev mode: cwd = project root or server/, templates in project 模版/
  return [join(cwd, '模版'), resolve(cwd, '..', '模版')]
}

// Helper: find template file path by template id (filename)
function findTemplateFile(templateId: string): string | null {
  const templateDirs = getTemplateDirs()
  for (const dir of templateDirs) {
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.acd'))
    for (const file of files) {
      if (file.toLowerCase() === templateId.toLowerCase()) {
        return join(dir, file)
      }
    }
  }
  return null
}

// 获取可用模板列表
router.get('/account-set-templates', (req: AuthRequest, res) => {
  const templates: Array<{ id: string; name: string; file: string; description: string }> = []

  const templateDirs = getTemplateDirs()
  const seen = new Set<string>()

  for (const dir of templateDirs) {
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.acd'))
    for (const file of files) {
      const filePath = join(dir, file)
      // Derive a readable template name from the filename
      const baseName = file
        .replace(/\.acd$/i, '')
        .replace(/^[a-zA-Z0-9]+/, '') // Remove leading ASCII like "zw60xx"
        .replace(/\d{6,8}$/, '') // Remove trailing date like 20260417
      const displayName = baseName.trim() || file
      const id = file.toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      templates.push({
        id,
        name: displayName,
        file: filePath,
        description: `预设${displayName}会计科目、结转关系及报表`,
      })
    }
  }

  res.json({ code: 0, data: templates })
})

// 从模板创建账套
router.post(
  '/account-sets/from-template',
  operationLog('从模板创建账套', '系统管理'),
  (req: AuthRequest, res) => {
    const {
      name,
      code,
      credit_code,
      fiscal_year,
      start_date,
      unit_leader,
      chief_accountant,
      template_id,
    } = req.body
    if (!name) {
      return res.status(400).json({ code: 400, message: '名称不能为空' })
    }
    if (!template_id) {
      return res.status(400).json({ code: 400, message: '请选择模板' })
    }

    const db = getDb()
    // 名称重复校验
    const existingName = db.prepare('SELECT id FROM account_sets WHERE name = ?').get(name)
    if (existingName) {
      return res.status(400).json({ code: 400, message: '账套名称已存在' })
    }
    // 自动生成编码（如果未提供）
    let finalCode = code
    if (!finalCode) {
      const count = (db.prepare('SELECT COUNT(*) as cnt FROM account_sets').get() as any).cnt
      finalCode = `ZT${String(count + 1).padStart(3, '0')}`
    }
    const existingCode = db.prepare('SELECT id FROM account_sets WHERE code = ?').get(finalCode)
    if (existingCode) {
      return res.status(400).json({ code: 400, message: '账套编码已存在' })
    }

    // Resolve template file path from template_id (filename)
    const templateFilePath = findTemplateFile(template_id)
    if (!templateFilePath) {
      return res.status(400).json({ code: 400, message: '模板文件不存在' })
    }

    const id = uuidv4()
    db.prepare(
      `
    INSERT INTO account_sets (id, name, code, credit_code, fiscal_year, start_date, unit_leader, chief_accountant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    ).run(
      id,
      name,
      finalCode,
      credit_code,
      fiscal_year || new Date().getFullYear(),
      start_date,
      unit_leader,
      chief_accountant
    )

    // 自动创建超级管理员 admin/admin123
    const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin'").get() as any
    if (adminRole) {
      const existingAdmin = db
        .prepare('SELECT id FROM users WHERE username = ? AND account_set_id = ?')
        .get('admin', id)
      if (!existingAdmin) {
        const userId = uuidv4()
        const hash = bcrypt.hashSync('admin123', 10)
        db.prepare(
          'INSERT INTO users (id, username, password, nickname, role_id, account_set_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(userId, 'admin', hash, '系统管理员', adminRole.id, id)
      }
    }

    // Read ACD template and import (no vouchers, no init balances)
    try {
      const acdBuffer = readFileSync(templateFilePath)
      const stats = importAcdTemplateToAccountSet(id, acdBuffer)

      res.json({
        code: 0,
        message: '从模板创建成功，已自动创建管理员账号 admin/admin123',
        data: {
          id,
          imported: {
            accounts: stats.accounts.inserted + stats.accounts.updated,
            transferTypes: stats.transferTypes.types,
            transferItems: stats.transferTypes.items,
            voucherTypes: stats.voucherTypes.inserted + stats.voucherTypes.updated,
            reportDefinitions: stats.reportTemplates.definitions,
          },
        },
      })
    } catch (err: any) {
      console.error('Template import error:', err)
      // Account set was created but template import failed — still return success with warning
      res.json({
        code: 0,
        message: '账套已创建，但模板导入部分失败: ' + (err.message || '未知错误'),
        data: { id },
      })
    }
  }
)

// ===================== 用户管理 =====================

router.get('/users', (req: AuthRequest, res) => {
  const db = getDb()
  const { accountSetId } = req.query
  const query = buildSystemUsersQuery({
    currentAccountSetId: req.accountSetId || '',
    accountSetId: accountSetId as string | undefined,
  })
  const list = db.prepare(query.sql).all(...query.params)
  res.json({ code: 0, data: list })
})

router.post('/users', operationLog('创建用户', '系统管理'), (req: AuthRequest, res) => {
  const { username, password, nickname, role_id, account_set_id, email, phone } = req.body
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
  }
  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return res.status(400).json({ code: 400, message: '用户名已存在' })
  }
  const id = uuidv4()
  const hash = bcrypt.hashSync(password, 10)
  db.prepare(
    `
    INSERT INTO users (id, username, password, nickname, role_id, account_set_id, email, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    username,
    hash,
    nickname || username,
    role_id,
    account_set_id || req.accountSetId,
    email,
    phone
  )
  res.json({ code: 0, message: '创建成功', data: { id } })
})

router.put('/users/:id', operationLog('修改用户', '系统管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { password, nickname, role_id, status, email, phone } = req.body
  const db = getDb()
  if (password) {
    const hash = bcrypt.hashSync(password, 10)
    db.prepare(
      "UPDATE users SET password=?, nickname=?, role_id=?, status=?, email=?, phone=?, updated_at=datetime('now') WHERE id=?"
    ).run(hash, nickname, role_id, status, email, phone, id)
  } else {
    db.prepare(
      "UPDATE users SET nickname=?, role_id=?, status=?, email=?, phone=?, updated_at=datetime('now') WHERE id=?"
    ).run(nickname, role_id, status, email, phone, id)
  }
  res.json({ code: 0, message: '更新成功' })
})

router.delete('/users/:id', operationLog('删除用户', '系统管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.json({ code: 0, message: '删除成功' })
})

// ===================== 角色管理 =====================

router.get('/roles', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db.prepare('SELECT * FROM roles ORDER BY is_system DESC, created_at').all()
  res.json({ code: 0, data: list })
})

router.post('/roles', operationLog('创建角色', '系统管理'), (req: AuthRequest, res) => {
  const { name, code, description, permissions } = req.body
  if (!name || !code) {
    return res.status(400).json({ code: 400, message: '名称和编码不能为空' })
  }
  const db = getDb()
  const id = uuidv4()
  db.prepare(
    'INSERT INTO roles (id, name, code, description, permissions) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, code, description, JSON.stringify(permissions || []))
  res.json({ code: 0, message: '创建成功', data: { id } })
})

router.put('/roles/:id', operationLog('修改角色', '系统管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { name, description, permissions } = req.body
  const db = getDb()
  db.prepare('UPDATE roles SET name=?, description=?, permissions=? WHERE id=?').run(
    name,
    description,
    JSON.stringify(permissions || []),
    id
  )
  res.json({ code: 0, message: '更新成功' })
})

router.delete('/roles/:id', operationLog('删除角色', '系统管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(id) as any
  if (role?.is_system) {
    return res.status(400).json({ code: 400, message: '系统内置角色无法删除' })
  }
  const used = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(id) as any
  if (used?.count > 0) {
    return res.status(400).json({ code: 400, message: '该角色已被使用，无法删除' })
  }
  db.prepare('DELETE FROM roles WHERE id = ?').run(id)
  res.json({ code: 0, message: '删除成功' })
})

// ===================== 系统参数 =====================

router.get('/params', (req: AuthRequest, res) => {
  const db = getDb()
  const { accountSetId } = req.query
  const list = db
    .prepare(`SELECT * FROM system_params WHERE account_set_id IS NULL OR account_set_id = ?`)
    .all(accountSetId || req.accountSetId)
  res.json({ code: 0, data: list })
})

router.put('/params', operationLog('修改系统参数', '系统管理'), (req: AuthRequest, res) => {
  const { params } = req.body
  const db = getDb()
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)'
  )
  for (const p of params) {
    upsert.run(p.id || uuidv4(), p.account_set_id || req.accountSetId, p.param_key, p.param_value)
  }
  res.json({ code: 0, message: '保存成功' })
})

// ===================== 结转类型管理 =====================

router.get('/transfer-types', (req: AuthRequest, res) => {
  const db = getDb()
  const rawList = db
    .prepare('SELECT * FROM transfer_types WHERE account_set_id = ? ORDER BY code')
    .all(req.accountSetId) as any[]
  // 转换字段名为驼峰格式
  const list = rawList.map(item => ({
    id: item.id,
    code: item.code,
    name: item.name,
    voucherType: item.voucher_type,
  }))
  res.json({ code: 0, data: list })
})

router.put('/transfer-types', operationLog('修改结转类型', '系统管理'), (req: AuthRequest, res) => {
  const { types } = req.body
  const db = getDb()

  // 先删除当前账套旧的类型
  db.prepare('DELETE FROM transfer_types WHERE account_set_id = ?').run(req.accountSetId)

  // 插入新的类型
  const insert = db.prepare(
    'INSERT INTO transfer_types (id, code, name, voucher_type, account_set_id) VALUES (?, ?, ?, ?, ?)'
  )

  for (const t of types) {
    insert.run(t.id || uuidv4(), t.code, t.name, t.voucherType || '结转', req.accountSetId)
  }

  res.json({ code: 0, message: '保存成功' })
})

// ===================== 结转配置项管理 =====================

router.get('/transfer-items', (req: AuthRequest, res) => {
  const db = getDb()
  const rawList = db
    .prepare('SELECT * FROM transfer_items WHERE account_set_id = ? ORDER BY type_code, sort_order')
    .all(req.accountSetId) as any[]
  // 转换字段名为驼峰格式
  const list = rawList.map(item => ({
    id: item.id,
    typeCode: item.type_code,
    summary: item.summary,
    fromCode: item.from_code,
    fromName: item.from_name,
    toCode: item.to_code,
    toName: item.to_name,
    transferType: item.transfer_type,
    ratio: item.ratio,
  }))
  res.json({ code: 0, data: list })
})

router.put('/transfer-items', operationLog('修改结转配置', '系统管理'), (req: AuthRequest, res) => {
  const { items } = req.body
  const db = getDb()

  // 先删除当前账套旧的配置项
  db.prepare('DELETE FROM transfer_items WHERE account_set_id = ?').run(req.accountSetId)

  // 插入新的配置项
  const insert = db.prepare(
    `INSERT INTO transfer_items
     (id, type_code, summary, from_code, from_name, to_code, to_name, transfer_type, ratio, sort_order, account_set_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  items.forEach((item: any, index: number) => {
    insert.run(
      item.id || uuidv4(),
      item.typeCode,
      item.summary,
      item.fromCode,
      item.fromName,
      item.toCode,
      item.toName,
      item.transferType || 'all',
      item.ratio || 100,
      index,
      req.accountSetId
    )
  })

  res.json({ code: 0, message: '保存成功' })
})

// ===================== 操作日志 =====================

router.get('/logs', (req: AuthRequest, res) => {
  const db = getDb()
  const { page = 1, pageSize = 50, user_id, action, module, start_date, end_date } = req.query
  const query = buildSystemLogsQuery({
    accountSetId: req.accountSetId || '',
    page: Number(page),
    pageSize: Number(pageSize),
    userId: user_id as string | undefined,
    action: action as string | undefined,
    module: module as string | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
  })

  const total = (db.prepare(query.countSql).get(...query.countParams) as any).count
  const list = db.prepare(query.listSql).all(...query.listParams)
  res.json({ code: 0, data: list, total })
})

router.post(
  '/cleanup-balances',
  operationLog('清理余额脏数据', '系统管理'),
  (req: AuthRequest, res) => {
    const db = getDb()
    const { year, period } = req.body
    const y = Number(year) || new Date().getFullYear()
    const p = Number(period) || new Date().getMonth() + 1

    const result = db.transaction(() => {
      const deleted = db
        .prepare(
          `
      DELETE FROM account_balances
      WHERE account_set_id=? AND year=? AND period=?
        AND current_debit = 0 AND current_credit = 0
        AND COALESCE(init_balance, 0) = 0
    `
        )
        .run(req.accountSetId, y, p)

      const fixed = db
        .prepare(
          `
      UPDATE account_balances
      SET current_debit = 0, current_credit = 0
      WHERE account_set_id=? AND year=? AND period=?
        AND (current_debit < 0 OR current_credit < 0)
    `
        )
        .run(req.accountSetId, y, p)

      return { deletedRows: deleted.changes, fixedRows: fixed.changes }
    })()

    res.json({
      code: 0,
      message: `清理完成：删除空行${result.deletedRows}条，修复负数行${result.fixedRows}条`,
      data: result,
    })
  }
)

export default router
