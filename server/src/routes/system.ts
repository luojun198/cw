import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { getDb, ensureAccountSetSecurityBootstrap } from '../db/index.js'
import {
  authMiddleware,
  requirePermission,
  AuthRequest,
  operationLog,
} from '../middleware/index.js'
import { buildSystemLogsQuery, buildSystemUsersQuery } from '../services/systemQuery.js'
import {
  importAcdTemplateToAccountSet,
  type ImportStats,
} from '../scripts/importAcdToCurrentAccountSet.js'
import { importExcelReportsFromTemplate } from '../services/standardTemplateImport.js'
import { listImportableExcelFiles } from '../utils/reportTemplateFiles.js'
import { syncAcdReportFormulasToAccountSet } from '../services/acdReportFormulaSync.js'
import { PERMISSIONS, PERMISSION_MODULES } from '../db/permissions.js'

const router = Router()
router.use(authMiddleware)

// ===================== 账套管理 =====================

router.get('/account-sets', (req: AuthRequest, res) => {
  const db = getDb()
  const accountSetColumns = db.prepare('PRAGMA table_info(account_sets)').all() as Array<{
    name: string
  }>
  const hasCreatedAt = accountSetColumns.some(column => column.name === 'created_at')
  // 使用固定白名单，不拼接用户输入
  const orderBy = hasCreatedAt ? 'created_at DESC' : 'name ASC'
  const list = db
    .prepare(
      hasCreatedAt
        ? 'SELECT * FROM account_sets ORDER BY created_at DESC'
        : 'SELECT * FROM account_sets ORDER BY name ASC'
    )
    .all() as any[]
  // 附带每个账套的科目级数和科目长度
  const result = list.map(row => {
    const levels = db
      .prepare(
        `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='account_levels' LIMIT 1`
      )
      .get(row.id) as any
    const lengths = db
      .prepare(
        `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='account_code_lengths' LIMIT 1`
      )
      .get(row.id) as any
    return {
      ...row,
      account_levels: levels ? parseInt(levels.param_value) || 6 : 6,
      account_code_lengths: lengths
        ? (() => {
            try {
              return JSON.parse(lengths.param_value)
            } catch {
              return [4, 2, 2, 2, 2, 2]
            }
          })()
        : [4, 2, 2, 2, 2, 2],
    }
  })
  res.json({ code: 0, data: result })
})

router.post(
  '/account-sets',
  requirePermission('system:account'),
  operationLog('创建账套', '系统管理'),
  async (req: AuthRequest, res) => {
    const {
      name,
      code,
      credit_code,
      fiscal_year,
      start_date,
      unit_leader,
      chief_accountant,
      account_levels,
      account_code_lengths,
    } = req.body
    if (req.body?.template_type === 'standard') {
      return res.status(400).json({ code: 400, message: '请选择标准模板，不能创建空账套' })
    }
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

    // 写入科目级数和科目长度到 system_params
    const finalLevels = account_levels || 6
    const finalLengths = Array.isArray(account_code_lengths)
      ? account_code_lengths
      : [4, 2, 2, 2, 2, 2]
    db.prepare(
      `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
    ).run(uuidv4(), id, 'account_levels', String(finalLevels))
    db.prepare(
      `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
    ).run(uuidv4(), id, 'account_code_lengths', JSON.stringify(finalLengths.slice(0, finalLevels)))

    // 初始化默认系统参数
    const defaultParams = [
      { key: 'voucher_audit_required', value: 'false' }, // 凭证审核：关闭
      { key: 'voucher_direct_print', value: 'true' }, // 直接打印：开启
      { key: 'voucher_sequence_control', value: 'false' }, // 凭证时序控制：关闭
      { key: 'enable_cash_flow', value: 'false' }, // 启用现金流核算：关闭
    ]
    const insertParam = db.prepare(
      `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
    )
    for (const param of defaultParams) {
      insertParam.run(uuidv4(), id, param.key, param.value)
    }

    // 自动创建超级管理员 admin/admin123
    ensureAccountSetSecurityBootstrap(id)

    res.json({ code: 0, message: '创建成功，已自动创建管理员账号 admin/admin123', data: { id } })
  }
)

router.put(
  '/account-sets/:id',
  requirePermission('system:account'),
  operationLog('修改账套', '系统管理'),
  (req: AuthRequest, res) => {
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
    ).run(
      name,
      code,
      credit_code,
      fiscal_year,
      start_date,
      unit_leader,
      chief_accountant,
      status,
      id
    )
    res.json({ code: 0, message: '更新成功' })
  }
)

router.delete(
  '/account-sets/:id',
  requirePermission('system:account'),
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
    // 级联删除所有关联数据
    // 先临时关闭外键检查（在事务外执行，事务内PRAGMA foreign_keys=OFF是无效的）
    // 使用静态 SQL 语句，不拼接表名，避免 SQL 注入风险
    db.pragma('foreign_keys = OFF')
    const deleteAll = db.transaction(() => {
      db.prepare('DELETE FROM print_templates WHERE account_set_id = ?').run(id)
      try {
        db.prepare('DELETE FROM cash_flow_items WHERE account_set_id = ?').run(id)
      } catch {
        /* table may not exist */
      }
      db.prepare('DELETE FROM voucher_templates WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM voucher_entries WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM voucher_attachments WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM auto_transfer_runs WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM vouchers WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM account_balances WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM period_closing WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM init_balances WHERE account_set_id = ?').run(id)
      db.prepare(
        'DELETE FROM report_template_items WHERE template_id IN (SELECT id FROM report_templates WHERE account_set_id = ?)'
      ).run(id)
      db.prepare(
        'DELETE FROM report_cells WHERE report_sheet_id IN (SELECT id FROM report_sheets WHERE report_definition_id IN (SELECT id FROM report_definitions WHERE account_set_id = ?))'
      ).run(id)
      db.prepare(
        'DELETE FROM report_template_sources WHERE report_definition_id IN (SELECT id FROM report_definitions WHERE account_set_id = ?)'
      ).run(id)
      db.prepare(
        'DELETE FROM report_sheets WHERE report_definition_id IN (SELECT id FROM report_definitions WHERE account_set_id = ?)'
      ).run(id)
      db.prepare('DELETE FROM report_definitions WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM report_templates WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM report_formula_functions WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM transfer_items WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM transfer_types WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM aux_items WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM aux_categories WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM voucher_types WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM system_params WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM ai_config WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM ai_logs WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM backups WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM operation_logs WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM accounts WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM roles WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM users WHERE account_set_id = ?').run(id)
      db.prepare('DELETE FROM account_sets WHERE id = ?').run(id)
    })
    deleteAll()
    db.pragma('foreign_keys = ON')
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

// Helper: resolve standard template directories
function getStandardTemplateDirs(): string[] {
  const cwd = process.cwd()
  return [join(cwd, '标准模版'), resolve(cwd, '..', '标准模版')]
}

// Helper: scan standard templates (folders with ACD + Excel files)
function scanStandardTemplates(): Array<{
  id: string
  name: string
  description: string
  acdFile: string
  excelFiles: Array<{ name: string; path: string }>
}> {
  const dirs = getStandardTemplateDirs()
  const templates: Array<{
    id: string
    name: string
    description: string
    acdFile: string
    excelFiles: Array<{ name: string; path: string }>
  }> = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    if (!existsSync(dir)) continue

    const subDirs = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())

    for (const subDir of subDirs) {
      const subDirPath = join(dir, subDir.name)
      const files = readdirSync(subDirPath)

      const acdFile = files.find(f => f.toLowerCase().endsWith('.acd'))
      if (!acdFile) continue

      if (seen.has(subDir.name)) continue
      seen.add(subDir.name)

      const excelFiles = listImportableExcelFiles(subDirPath)

      templates.push({
        id: subDir.name,
        name: subDir.name,
        description: `包含 1 个 ACD 文件和 ${excelFiles.length} 个报表模板`,
        acdFile: join(subDirPath, acdFile),
        excelFiles,
      })
    }
  }

  return templates
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

// Helper: find Excel files in the same directory as a template file
function findExcelFilesInTemplateDir(
  templateFilePath: string
): Array<{ name: string; path: string }> {
  return listImportableExcelFiles(dirname(templateFilePath))
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

// 获取标准模板列表
router.get('/standard-account-set-templates', (req: AuthRequest, res) => {
  try {
    const templates = scanStandardTemplates()
    res.json({ code: 0, data: templates })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 从模板创建账套
router.post(
  '/account-sets/from-template',
  operationLog('从模板创建账套', '系统管理'),
  async (req: AuthRequest, res) => {
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
    ensureAccountSetSecurityBootstrap(id)

    // 初始化默认系统参数
    const defaultParams = [
      { key: 'voucher_audit_required', value: 'false' }, // 凭证审核：关闭
      { key: 'voucher_direct_print', value: 'true' }, // 直接打印：开启
      { key: 'voucher_sequence_control', value: 'false' }, // 凭证时序控制：关闭
      { key: 'enable_cash_flow', value: 'false' }, // 启用现金流核算：关闭
    ]
    const insertParam = db.prepare(
      `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
    )
    for (const param of defaultParams) {
      insertParam.run(uuidv4(), id, param.key, param.value)
    }

    // Read ACD template and import (no vouchers, no init balances)
    try {
      const acdBuffer = readFileSync(templateFilePath)
      const stats = importAcdTemplateToAccountSet(id, acdBuffer)

      // Import Excel files from the same template directory
      const excelFiles = findExcelFilesInTemplateDir(templateFilePath)
      let reportStats: any = { total: 0, success: 0, failed: 0, results: [] }
      let acdFormulaStats: any = null
      if (excelFiles.length > 0) {
        try {
          reportStats = await importExcelReportsFromTemplate(db, id, excelFiles)
          acdFormulaStats = syncAcdReportFormulasToAccountSet(db as any, id, acdBuffer)
          console.log('[模板] Excel 报表导入完成:', reportStats)
        } catch (err: any) {
          console.error('[模板] Excel 报表导入失败:', err.message)
          reportStats = {
            total: excelFiles.length,
            success: 0,
            failed: excelFiles.length,
            results: [],
            error: err.message,
          }
        }
      }

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
          reportStats,
          acdFormulaStats,
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

// 从标准模板创建账套
router.post(
  '/account-sets/from-standard-template',
  operationLog('从标准模板创建账套', '系统管理'),
  async (req: AuthRequest, res) => {
    const {
      name,
      code,
      credit_code,
      fiscal_year,
      start_date,
      unit_leader,
      chief_accountant,
      standard_template_id,
    } = req.body

    if (!name) {
      return res.status(400).json({ code: 400, message: '名称不能为空' })
    }
    if (!standard_template_id) {
      return res.status(400).json({ code: 400, message: '请选择标准模板' })
    }

    // 查找标准模板
    const templates = scanStandardTemplates()
    const template = templates.find(t => t.id === standard_template_id)
    if (!template) {
      return res.status(404).json({ code: 404, message: '标准模板不存在' })
    }

    const db = getDb()
    const id = uuidv4()
    const finalCode = code || `AS${Date.now()}`

    // 创建账套
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

    // 创建管理员账号
    ensureAccountSetSecurityBootstrap(id)

    // 初始化默认系统参数
    const defaultParams = [
      { key: 'voucher_audit_required', value: 'false' }, // 凭证审核：关闭
      { key: 'voucher_direct_print', value: 'true' }, // 直接打印：开启
      { key: 'voucher_sequence_control', value: 'false' }, // 凭证时序控制：关闭
      { key: 'enable_cash_flow', value: 'false' }, // 启用现金流核算：关闭
    ]
    const insertParam = db.prepare(
      `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
    )
    for (const param of defaultParams) {
      insertParam.run(uuidv4(), id, param.key, param.value)
    }

    // 导入 ACD 文件（会自动推断并设置科目编码长度）
    let acdStats: any = {}
    let acdBuffer: Buffer
    try {
      acdBuffer = readFileSync(template.acdFile)
      acdStats = importAcdTemplateToAccountSet(id, acdBuffer)
    } catch (err: any) {
      console.error('ACD import error:', err)
      // ACD 导入失败，删除账套
      db.prepare('DELETE FROM account_sets WHERE id = ?').run(id)
      return res.status(500).json({
        code: 500,
        message: 'ACD 导入失败: ' + (err.message || '未知错误'),
      })
    }

    // 批量导入 Excel 报表。报表导入失败不能让已创建账套返回 500。
    let reportStats: any = { total: 0, success: 0, failed: 0, results: [] }
    let acdFormulaStats: any = null
    try {
      reportStats = await importExcelReportsFromTemplate(db, id, template.excelFiles)
      acdFormulaStats = syncAcdReportFormulasToAccountSet(db as any, id, acdBuffer)
    } catch (err: any) {
      console.error('[标准模板] Excel 报表导入失败:', err)
      reportStats = {
        total: template.excelFiles.length,
        success: 0,
        failed: template.excelFiles.length,
        results: [],
        error: err.message || '未知错误',
      }
    }

    res.json({
      code: 0,
      message: reportStats.failed > 0
        ? '从标准模板创建成功，但报表导入部分失败'
        : '从标准模板创建成功',
      data: {
        accountSetId: id,
        acdStats: {
          accounts: acdStats.accounts?.inserted + acdStats.accounts?.updated || 0,
          transferTypes: acdStats.transferTypes?.types || 0,
          transferItems: acdStats.transferTypes?.items || 0,
          voucherTypes: acdStats.voucherTypes?.inserted + acdStats.voucherTypes?.updated || 0,
          auxiliaryItems: acdStats.auxiliaryData?.totalItems || 0,
        },
        reportStats,
        acdFormulaStats,
      },
    })
  }
)

// ===================== 用户管理 =====================

router.get('/users', (req: AuthRequest, res) => {
  const db = getDb()
  const query = buildSystemUsersQuery({
    currentAccountSetId: req.accountSetId || '',
  })
  const list = db.prepare(query.sql).all(...query.params)
  res.json({ code: 0, data: list })
})

router.post(
  '/users',
  requirePermission('system:user'),
  operationLog('创建用户', '系统管理'),
  (req: AuthRequest, res) => {
    const { username, password, nickname, role_id, email, phone } = req.body
    const accountSetId = req.accountSetId!
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
    }
    if (!role_id) {
      return res.status(400).json({ code: 400, message: '请选择角色' })
    }
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? AND account_set_id = ?')
      .get(username, accountSetId)
    if (existing) {
      return res.status(400).json({ code: 400, message: '用户名已存在' })
    }
    const role = db
      .prepare('SELECT id FROM roles WHERE id = ? AND account_set_id = ?')
      .get(role_id, accountSetId)
    if (!role) {
      return res.status(400).json({ code: 400, message: '角色不存在或不属于当前账套' })
    }
    const id = uuidv4()
    const hash = bcrypt.hashSync(password, 10)
    db.prepare(
      `
    INSERT INTO users (id, username, password, nickname, role_id, account_set_id, email, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    ).run(id, username, hash, nickname || username, role_id, accountSetId, email, phone)
    res.json({ code: 0, message: '创建成功', data: { id } })
  }
)

router.put(
  '/users/:id',
  requirePermission('system:user'),
  operationLog('修改用户', '系统管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { password, nickname, role_id, status, email, phone } = req.body
    const db = getDb()
    const accountSetId = req.accountSetId!
    const existingUser = db
      .prepare('SELECT id FROM users WHERE id = ? AND account_set_id = ?')
      .get(id, accountSetId)
    if (!existingUser) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }
    // 如果提供了 role_id，必须验证其有效性（不允许设置为空）
    if (role_id !== undefined) {
      if (!role_id) {
        return res.status(400).json({ code: 400, message: '请选择角色' })
      }
      const role = db
        .prepare('SELECT id FROM roles WHERE id = ? AND account_set_id = ?')
        .get(role_id, accountSetId)
      if (!role) {
        return res.status(400).json({ code: 400, message: '角色不存在或不属于当前账套' })
      }
    }
    if (password) {
      const hash = bcrypt.hashSync(password, 10)
      db.prepare(
        "UPDATE users SET password=?, nickname=?, role_id=?, status=?, email=?, phone=?, updated_at=datetime('now') WHERE id=? AND account_set_id=?"
      ).run(hash, nickname, role_id, status, email, phone, id, accountSetId)
    } else {
      db.prepare(
        "UPDATE users SET nickname=?, role_id=?, status=?, email=?, phone=?, updated_at=datetime('now') WHERE id=? AND account_set_id=?"
      ).run(nickname, role_id, status, email, phone, id, accountSetId)
    }
    res.json({ code: 0, message: '更新成功' })
  }
)

router.delete(
  '/users/:id',
  requirePermission('system:user'),
  operationLog('删除用户', '系统管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const result = db
      .prepare('DELETE FROM users WHERE id = ? AND account_set_id = ?')
      .run(id, req.accountSetId)
    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }
    res.json({ code: 0, message: '删除成功' })
  }
)

// ===================== 权限定义 =====================

router.get('/permissions', (req: AuthRequest, res) => {
  // 按模块分组返回完整权限列表
  const grouped = PERMISSION_MODULES.map(mod => ({
    module: mod.key,
    moduleName: mod.name,
    permissions: PERMISSIONS.filter(p => p.module === mod.key).map(p => ({
      code: p.code,
      name: p.name,
      acdCode: p.acdCode,
    })),
  })).filter(g => g.permissions.length > 0)
  res.json({ code: 0, data: grouped })
})

// 获取可用权限列表（根据账套来源过滤）
router.get('/permissions/available', (req: AuthRequest, res) => {
  const db = getDb()

  // 检查该账套是否从 ACD 导入
  const accountSet = db
    .prepare('SELECT import_source FROM account_sets WHERE id = ?')
    .get(req.accountSetId) as any

  let availablePermissions = PERMISSIONS

  // 如果是 ACD 导入的账套，只显示有 acdCode 的权限
  if (accountSet?.import_source === 'acd') {
    availablePermissions = PERMISSIONS.filter(p => p.acdCode)
  }

  // 按模块分组返回
  const grouped = PERMISSION_MODULES.map(mod => ({
    module: mod.key,
    moduleName: mod.name,
    permissions: availablePermissions
      .filter(p => p.module === mod.key)
      .map(p => ({
        code: p.code,
        name: p.name,
        acdCode: p.acdCode,
      })),
  })).filter(g => g.permissions.length > 0)

  res.json({ code: 0, data: grouped })
})

// ===================== 角色管理 =====================

router.get('/roles', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare('SELECT * FROM roles WHERE account_set_id = ? ORDER BY is_system DESC, created_at')
    .all(req.accountSetId)
  res.json({ code: 0, data: list })
})

router.post(
  '/roles',
  requirePermission('system:role'),
  operationLog('创建角色', '系统管理'),
  (req: AuthRequest, res) => {
    const { name, code, description, permissions } = req.body
    const accountSetId = req.accountSetId!
    if (!name || !code) {
      return res.status(400).json({ code: 400, message: '名称和编码不能为空' })
    }
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM roles WHERE account_set_id = ? AND code = ?')
      .get(accountSetId, code)
    if (existing) {
      return res.status(400).json({ code: 400, message: '角色编码已存在' })
    }
    const id = uuidv4()
    db.prepare(
      'INSERT INTO roles (id, account_set_id, name, code, description, permissions) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, accountSetId, name, code, description, JSON.stringify(permissions || []))
    res.json({ code: 0, message: '创建成功', data: { id } })
  }
)

router.put(
  '/roles/:id',
  requirePermission('system:role'),
  operationLog('修改角色', '系统管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { name, description, permissions } = req.body
    const db = getDb()
    const result = db
      .prepare(
        'UPDATE roles SET name=?, description=?, permissions=? WHERE id=? AND account_set_id=?'
      )
      .run(name, description, JSON.stringify(permissions || []), id, req.accountSetId)
    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '角色不存在' })
    }
    res.json({ code: 0, message: '更新成功' })
  }
)

router.delete(
  '/roles/:id',
  requirePermission('system:role'),
  operationLog('删除角色', '系统管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const role = db
      .prepare('SELECT * FROM roles WHERE id=? AND account_set_id=?')
      .get(id, req.accountSetId) as any
    if (!role) {
      return res.status(404).json({ code: 404, message: '角色不存在' })
    }
    if (role.is_system) {
      return res.status(400).json({ code: 400, message: '系统内置角色无法删除' })
    }
    const used = db
      .prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ? AND account_set_id = ?')
      .get(id, req.accountSetId) as any
    if (used?.count > 0) {
      return res.status(400).json({ code: 400, message: '该角色已被使用，无法删除' })
    }
    db.prepare('DELETE FROM roles WHERE id = ? AND account_set_id = ?').run(id, req.accountSetId)
    res.json({ code: 0, message: '删除成功' })
  }
)

// ===================== 系统参数 =====================

router.get('/params', (req: AuthRequest, res) => {
  const db = getDb()
  const { accountSetId } = req.query
  const asId = (accountSetId as string) || req.accountSetId
  const rawList = db
    .prepare(`SELECT * FROM system_params WHERE account_set_id IS NULL OR account_set_id = ?`)
    .all(asId)
  const paramMap = new Map<string, any>()
  for (const item of rawList as any[]) {
    const existing = paramMap.get(item.param_key)
    if (!existing || item.account_set_id === asId) {
      paramMap.set(item.param_key, item)
    }
  }
  const list = Array.from(paramMap.values())

  // 附带账套基本信息（建账日期）
  const accountSet = db
    .prepare('SELECT name, start_date FROM account_sets WHERE id = ?')
    .get(asId) as any

  // 当前会计区间：取最新凭证的 year/period，若无凭证则取 fiscal_year + 当前月
  const latestVoucher = db
    .prepare(
      'SELECT year, period FROM vouchers WHERE account_set_id = ? AND status = ? ORDER BY year DESC, period DESC LIMIT 1'
    )
    .get(asId, 'posted') as any
  let currentYear: number
  let currentPeriod: number
  if (latestVoucher) {
    currentYear = latestVoucher.year
    currentPeriod = latestVoucher.period
  } else {
    const as = db.prepare('SELECT fiscal_year FROM account_sets WHERE id = ?').get(asId) as any
    currentYear = as?.fiscal_year || new Date().getFullYear()
    currentPeriod = new Date().getMonth() + 1
  }

  // 使用单位名称：优先读 system_params 中的 unit_name，没有则回退到账套名称
  const unitNameParam = list.find((p: any) => p.param_key === 'unit_name') as any
  const unitName = unitNameParam?.param_value || accountSet?.name || ''

  res.json({
    code: 0,
    data: list,
    meta: {
      unit_name: unitName,
      start_date: accountSet?.start_date || '',
      current_year: currentYear,
      current_period: currentPeriod,
    },
  })
})

router.put(
  '/params',
  requirePermission('system:account'),
  operationLog('修改系统参数', '系统管理'),
  (req: AuthRequest, res) => {
    const { params } = req.body
    const db = getDb()
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)'
    )
    for (const p of params) {
      const targetAccountSetId = p.account_set_id || req.accountSetId
      const id = p.account_set_id === targetAccountSetId && p.id ? p.id : uuidv4()
      upsert.run(id, targetAccountSetId, p.param_key, p.param_value)
    }
    res.json({ code: 0, message: '保存成功' })
  }
)

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
    periodType: item.period_type || 'monthly',
  }))
  res.json({ code: 0, data: list })
})

router.put(
  '/transfer-types',
  requirePermission('base:transfer'),
  operationLog('修改结转类型', '系统管理'),
  (req: AuthRequest, res) => {
    const { types } = req.body
    const db = getDb()

    // 先删除当前账套旧的类型
    db.prepare('DELETE FROM transfer_types WHERE account_set_id = ?').run(req.accountSetId)

    // 插入新的类型
    const insert = db.prepare(
      'INSERT INTO transfer_types (id, code, name, voucher_type, period_type, account_set_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const t of types) {
      insert.run(
        t.id || uuidv4(),
        t.code,
        t.name,
        t.voucherType || '结转',
        t.periodType || 'monthly',
        req.accountSetId
      )
    }

    res.json({ code: 0, message: '保存成功' })
  }
)

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

router.put(
  '/transfer-items',
  requirePermission('base:transfer'),
  operationLog('修改结转配置', '系统管理'),
  (req: AuthRequest, res) => {
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
  }
)

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
