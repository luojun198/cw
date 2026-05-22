import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, unlinkSync, readFileSync, readdirSync } from 'fs'
import multer from 'multer'
import { join, resolve } from 'path'
import { getDb, ensureAccountSetSecurityBootstrap } from '../db/index.js'
import { generateToken, authMiddleware, requirePermission, AuthRequest, asyncHandler } from '../middleware/index.js'
import { operationLog } from '../middleware/index.js'
import { acdImportService } from '../services/acdImport.js'
import { importAcdTemplateToAccountSet } from '../scripts/importAcdToCurrentAccountSet.js'
import { importExcelReportsFromTemplate } from '../services/standardTemplateImport.js'
import { syncAcdReportFormulasToAccountSet } from '../services/acdReportFormulaSync.js'
import Database from 'better-sqlite3'
import { getRequestIp, toDisplayIp } from '../utils/requestIp.js'
import {
  expireSameIpActiveSessions,
  expireStaleLoginSessions,
  findOtherIpActiveSession,
  forceOtherIpActiveSessions,
  listActiveLoginSessions,
} from '../services/loginSession.js'
import { log } from '../utils/logger.js'
import { listActiveUsersForAccountSet } from '../services/loginUsers.js'
import { listImportableExcelFiles } from '../utils/reportTemplateFiles.js'

// 备份上传存储（uploads 目录在 deploy 根目录）
const uploadDir = join(process.cwd(), '../uploads')
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })

// 允许的文件类型
const ALLOWED_BACKUP_MIMES = ['application/x-sqlite3', 'application/octet-stream']
const ALLOWED_BACKUP_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.acd']

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 1, // 单次只允许上传一个文件
  },
  fileFilter: (req, file, cb) => {
    // 检查文件扩展名
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'))
    if (!ALLOWED_BACKUP_EXTENSIONS.includes(ext)) {
      return cb(new Error(`不支持的文件类型，仅允许: ${ALLOWED_BACKUP_EXTENSIONS.join(', ')}`))
    }
    cb(null, true)
  },
})

const router = Router()

function cleanupAccountSetCascade(db: Database.Database, accountSetId: string) {
  const statements = [
    'DELETE FROM user_login_sessions WHERE account_set_id = ?',
    'DELETE FROM print_templates WHERE account_set_id = ?',
    'DELETE FROM cash_flow_items WHERE account_set_id = ?',
    'DELETE FROM voucher_templates WHERE account_set_id = ?',
    'DELETE FROM voucher_entries WHERE account_set_id = ?',
    'DELETE FROM voucher_attachments WHERE account_set_id = ?',
    'DELETE FROM auto_transfer_runs WHERE account_set_id = ?',
    'DELETE FROM vouchers WHERE account_set_id = ?',
    'DELETE FROM account_balances WHERE account_set_id = ?',
    'DELETE FROM period_closing WHERE account_set_id = ?',
    'DELETE FROM init_balances WHERE account_set_id = ?',
    'DELETE FROM report_template_items WHERE template_id IN (SELECT id FROM report_templates WHERE account_set_id = ?)',
    'DELETE FROM report_cells WHERE report_sheet_id IN (SELECT id FROM report_sheets WHERE report_definition_id IN (SELECT id FROM report_definitions WHERE account_set_id = ?))',
    'DELETE FROM report_template_sources WHERE report_definition_id IN (SELECT id FROM report_definitions WHERE account_set_id = ?)',
    'DELETE FROM report_sheets WHERE report_definition_id IN (SELECT id FROM report_definitions WHERE account_set_id = ?)',
    'DELETE FROM report_definitions WHERE account_set_id = ?',
    'DELETE FROM report_templates WHERE account_set_id = ?',
    'DELETE FROM report_formula_functions WHERE account_set_id = ?',
    'DELETE FROM transfer_items WHERE account_set_id = ?',
    'DELETE FROM transfer_types WHERE account_set_id = ?',
    'DELETE FROM aux_items WHERE account_set_id = ?',
    'DELETE FROM aux_categories WHERE account_set_id = ?',
    'DELETE FROM voucher_types WHERE account_set_id = ?',
    'DELETE FROM system_params WHERE account_set_id = ?',
    'DELETE FROM ai_config WHERE account_set_id = ?',
    'DELETE FROM ai_logs WHERE account_set_id = ?',
    'DELETE FROM backups WHERE account_set_id = ?',
    'DELETE FROM operation_logs WHERE account_set_id = ?',
    'DELETE FROM accounts WHERE account_set_id = ?',
    'DELETE FROM roles WHERE account_set_id = ?',
    'DELETE FROM users WHERE account_set_id = ?',
    'DELETE FROM account_sets WHERE id = ?',
  ]

  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(row => row.name)
  )

  const cleanup = db.transaction(() => {
    for (const sql of statements) {
      const tableMatch = sql.match(/^DELETE FROM\s+([a-zA-Z_][\w]*)/i)
      if (tableMatch && !existingTables.has(tableMatch[1])) continue
      db.prepare(sql).run(accountSetId)
    }
  })
  cleanup()
}

// 获取账套列表（公开，无需认证）
router.get('/account-sets', (req, res) => {
  try {
    const db = getDb()
    const accountSetColumns = db.prepare('PRAGMA table_info(account_sets)').all() as Array<{ name: string }>
    const hasStatus = accountSetColumns.some(column => column.name === 'status')
    const hasCreatedAt = accountSetColumns.some(column => column.name === 'created_at')
    const orderBy = hasCreatedAt ? 'created_at DESC' : 'name ASC'
    const whereClause = hasStatus ? "WHERE status = 'active'" : ''
    const list = db
      .prepare(
        `SELECT id, name, code FROM account_sets ${whereClause} ORDER BY ${orderBy}`
      )
      .all()
    res.json({ code: 0, data: list })
  } catch (err) {
    log.error('account-sets list failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    res.status(500).json({ code: 500, message: '获取账套列表失败' })
  }
})

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

      // 查找 ACD 文件
      const acdFile = files.find(f => f.toLowerCase().endsWith('.acd'))
      if (!acdFile) continue

      // 去重：如果已扫描过同名子目录则跳过
      if (seen.has(subDir.name)) continue
      seen.add(subDir.name)

      // 查找所有 Excel 报表（排除 ~$ 临时锁文件）
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

// 获取标准模版列表（公开，无需认证）
router.get('/standard-account-set-templates', (req, res) => {
  try {
    const templates = scanStandardTemplates()
    res.json({ code: 0, data: templates })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 从标准模版创建账套（公开，无需认证）
router.post(
  '/account-sets/create-from-standard-template',
  asyncHandler(async (req, res) => {
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

    const templates = scanStandardTemplates()
    const template = templates.find(t => t.id === standard_template_id)
    if (!template) {
      return res.status(404).json({ code: 404, message: '标准模板不存在' })
    }

    const db = getDb()
    const id = uuidv4()

    const existingName = db.prepare('SELECT id FROM account_sets WHERE name = ?').get(name)
    if (existingName) {
      return res.status(400).json({ code: 400, message: '账套名称已存在' })
    }

    let finalCode = code
    if (!finalCode) {
      const count = (db.prepare('SELECT COUNT(*) as cnt FROM account_sets').get() as any).cnt
      finalCode = `ZT${String(count + 1).padStart(3, '0')}`
    }
    const existingCode = db.prepare('SELECT id FROM account_sets WHERE code = ?').get(finalCode)
    if (existingCode) {
      return res.status(400).json({ code: 400, message: '账套编码已存在' })
    }

    try {
      db.prepare(
        `INSERT INTO account_sets (id, name, code, credit_code, fiscal_year, start_date, unit_leader, chief_accountant)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
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

      ensureAccountSetSecurityBootstrap(id)

      const defaultParams = [
        { key: 'voucher_audit_required', value: 'false' },
        { key: 'voucher_direct_print', value: 'true' },
        { key: 'voucher_sequence_control', value: 'false' },
        { key: 'enable_cash_flow', value: 'false' },
      ]
      const insertParam = db.prepare(
        `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
      )
      for (const param of defaultParams) {
        insertParam.run(uuidv4(), id, param.key, param.value)
      }

      let acdStats: any = {}
      console.log('[标准模版] 开始导入 ACD 文件:', template.acdFile)
      const acdBuffer = readFileSync(template.acdFile)
      acdStats = importAcdTemplateToAccountSet(id, acdBuffer)
      console.log('[标准模版] ACD 导入成功:', acdStats)

      let reportStats: any = { total: 0, success: 0, failed: 0, results: [] }
      if (template.excelFiles?.length) {
        console.log('[标准模版] Excel文件数量:', template.excelFiles.length)
        try {
          reportStats = await importExcelReportsFromTemplate(db, id, template.excelFiles)
          syncAcdReportFormulasToAccountSet(db as any, id, acdBuffer)
          console.log('[标准模版] Excel 报表导入完成:', reportStats)
        } catch (err: any) {
          console.error('[标准模版] Excel 报表导入失败:', err)
          reportStats = {
            total: template.excelFiles.length,
            success: 0,
            failed: template.excelFiles.length,
            results: [],
            error: err?.message || '未知错误',
          }
        }
      }

      const accountsCount =
        (acdStats.accounts?.inserted || 0) + (acdStats.accounts?.updated || 0)
      const voucherTypesCount =
        (acdStats.voucherTypes?.inserted || 0) + (acdStats.voucherTypes?.updated || 0)

      res.json({
        code: 0,
        message: '从标准模板创建成功，已自动创建管理员账号 admin/admin123',
        data: {
          id,
          name,
          code: finalCode,
          acdStats: {
            accounts: accountsCount,
            transferTypes: acdStats.transferTypes?.types || 0,
            transferItems: acdStats.transferTypes?.items || 0,
            voucherTypes: voucherTypesCount,
            auxiliaryItems: acdStats.auxiliaryData?.totalItems || 0,
          },
          reportStats,
        },
      })
    } catch (err: any) {
      console.error('[标准模版] 创建账套失败:', err)
      try {
        cleanupAccountSetCascade(db, id)
      } catch (cleanupError) {
        console.error('[标准模版] cleanup account set failed:', cleanupError)
      }
      return res.status(500).json({
        code: 500,
        message: '创建账套失败: ' + (err?.message || '未知错误'),
      })
    }
  })
)

// 新增账套（公开，无需认证，用于登录页面）
router.post('/account-sets/create', (req, res) => {
  const { name, code, credit_code, fiscal_year, start_date, unit_leader, chief_accountant, account_levels, account_code_lengths } =
    req.body
  if (req.body?.use_template === true) {
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
  const finalLengths = Array.isArray(account_code_lengths) ? account_code_lengths : [4,2,2,2,2,2]
  db.prepare(
    `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
  ).run(uuidv4(), id, 'account_levels', String(finalLevels))
  db.prepare(
    `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
  ).run(uuidv4(), id, 'account_code_lengths', JSON.stringify(finalLengths.slice(0, finalLevels)))

  // 初始化默认系统参数
  const defaultParams = [
    { key: 'voucher_audit_required', value: 'false' },      // 凭证审核：关闭
    { key: 'voucher_direct_print', value: 'true' },         // 直接打印：开启
    { key: 'voucher_sequence_control', value: 'false' },    // 凭证时序控制：关闭
    { key: 'enable_cash_flow', value: 'false' },            // 启用现金流核算：关闭
  ]
  const insertParam = db.prepare(
    `INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)`
  )
  for (const param of defaultParams) {
    insertParam.run(uuidv4(), id, param.key, param.value)
  }

  // 自动创建超级管理员 admin/admin123
  ensureAccountSetSecurityBootstrap(id)

  res.json({ code: 0, message: '创建成功，已自动创建管理员账号 admin/admin123', data: { id, name, code: finalCode } })
})


// 获取指定账套的用户列表（公开，用于登录页面显示用户名建议）
router.get('/users-by-account-set/:accountSetId', (req, res) => {
  const { accountSetId } = req.params
  if (!/^[0-9a-f-]{36}$/i.test(accountSetId)) {
    return res.status(400).json({ code: 400, message: '无效的账套ID' })
  }

  try {
    const users = listActiveUsersForAccountSet(accountSetId)
    res.json({ code: 0, data: users })
  } catch (err) {
    log.error('users-by-account-set failed', {
      accountSetId,
      error: err instanceof Error ? err.message : String(err),
    })
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
})

// 验证码
router.get('/captcha', (req, res) => {
  const captchaId = uuidv4()
  // 生成简单数学运算验证码
  const num1 = Math.floor(Math.random() * 10) + 1
  const num2 = Math.floor(Math.random() * 10) + 1
  const captchaText = `${num1}+${num2}=?`
  const captchaAnswer = String(num1 + num2)
  // 存储验证码答案（生产环境用Redis）
  const db = getDb()
  db.prepare(
    'INSERT OR REPLACE INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, NULL, ?, ?)'
  ).run(uuidv4(), `captcha:${captchaId}`, captchaAnswer)
  // 返回SVG格式简单验证码
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect fill="#f0f0f0" width="120" height="40" rx="5"/><text x="10" y="28" font-family="Arial" font-size="18" fill="#333">${num1} + ${num2} = ?</text></svg>`
  res.json({
    captchaId,
    captchaUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  })
})

// 登录
router.post('/login', async (req, res) => {
  const { username, password, targetAccountSetId, forceLogin } = req.body
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
  }
  if (!targetAccountSetId) {
    return res.status(400).json({ code: 400, message: '请选择账套' })
  }

  const db = getDb()

  const targetSet = db
    .prepare('SELECT * FROM account_sets WHERE id = ?')
    .get(targetAccountSetId) as any
  if (!targetSet) {
    return res.status(400).json({ code: 400, message: '账套不存在' })
  }
  if (targetSet.status === 'inactive') {
    return res.status(400).json({ code: 400, message: '该账套已停用，无法登录' })
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND account_set_id = ?')
    .get(username, targetAccountSetId) as any

  if (!user) {
    return res.status(401).json({ code: 401, message: '用户名或密码错误' })
  }

  // 检查账号锁定
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(403).json({ code: 403, message: '账号已被锁定，请稍后再试' })
  }

  // 检查是否禁用
  if (user.status === 'disabled') {
    return res.status(403).json({ code: 403, message: '账号已被禁用' })
  }

  // 验证密码
  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) {
    const attempts = (user.failed_attempts || 0) + 1
    if (attempts >= 5) {
      db.prepare(
        "UPDATE users SET failed_attempts = ?, locked_until = datetime('now', '+30 minute') WHERE id = ?"
      ).run(attempts, user.id)
    } else {
      db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id)
    }
    return res.status(401).json({ code: 401, message: '用户名或密码错误' })
  }

  // 切换账套校验：用户必须属于该账套
  const effectiveAccountSetId = user.account_set_id
  if (user.account_set_id !== targetAccountSetId) {
    return res.status(403).json({ code: 403, message: '您没有权限登录该账套' })
  }

  // 获取角色权限
  const role = db
    .prepare('SELECT * FROM roles WHERE id = ? AND account_set_id = ?')
    .get(user.role_id, effectiveAccountSetId) as any
  if (!user.role_id) {
    return res.status(403).json({ code: 403, message: '该用户未分配角色，无法登录，请联系管理员' })
  }
  if (!role) {
    return res.status(403).json({ code: 403, message: '用户角色配置异常，请联系管理员' })
  }
  const permissions = role?.permissions ? JSON.parse(role.permissions) : []

  // 获取账套信息
  const accountSet = targetSet
  const currentLoginIp = getRequestIp(req)
  const userAgent = req.get('user-agent') || ''
  const lastLoginTime = user.last_login_at || null
  const lastLoginIp = user.last_login_ip ? toDisplayIp(user.last_login_ip) : null

  expireStaleLoginSessions(db, user.id, effectiveAccountSetId)
  const activeSessions = listActiveLoginSessions(db, user.id, effectiveAccountSetId)
  const otherIpSession = findOtherIpActiveSession(activeSessions, currentLoginIp)

  if (otherIpSession && !forceLogin) {
    const activeLoginIp = otherIpSession.login_ip ? toDisplayIp(otherIpSession.login_ip) : 'unknown'
    return res.status(409).json({
      code: 40901,
      message: `该账号已在 IP ${activeLoginIp} 登录，是否强制登录？`,
      data: {
        activeLoginIp,
        activeLoginAt: otherIpSession.login_at,
        activeLastSeenAt: otherIpSession.last_seen_at,
        lastLoginTime,
        lastLoginIp,
        currentLoginIp,
      },
    })
  }

  expireSameIpActiveSessions(db, activeSessions, currentLoginIp)

  let forcedOldLoginIp: string | null = null
  if (forceLogin) {
    forcedOldLoginIp = forceOtherIpActiveSessions(
      db,
      activeSessions,
      currentLoginIp,
      currentLoginIp
    )
  }

  const sessionId = uuidv4()
  db.prepare(
    `INSERT INTO user_login_sessions (
      id, account_set_id, user_id, username, login_ip, user_agent, login_at, last_seen_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'active')`
  ).run(sessionId, effectiveAccountSetId, user.id, user.username, currentLoginIp, userAgent)

  // 更新登录信息
  db.prepare(
    "UPDATE users SET last_login_at = datetime('now'), last_login_ip = ?, failed_attempts = 0 WHERE id = ?"
  ).run(currentLoginIp, user.id)

  const token = generateToken({
    userId: user.id,
    userName: user.nickname || user.username,
    accountSetId: effectiveAccountSetId,
    roleId: user.role_id,
    sessionId,
    permissions,
  })

  res.json({
    code: 0,
    message: '登录成功',
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: role?.code,
      roleName: role?.name,
      permissions,
    },
    accountSetId: accountSet?.id,
    accountSetName: accountSet?.name,
    lastLoginTime,
    lastLoginIp,
    currentLoginIp,
    forcedLogin: !!forceLogin,
    forcedOldLoginIp,
  })
})

// 获取用户信息
router.get('/userinfo', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb()
  const user = db
    .prepare(
      'SELECT u.*, r.name as role_name, r.code as role_code, r.permissions as role_permissions FROM users u LEFT JOIN roles r ON u.role_id = r.id AND r.account_set_id = u.account_set_id WHERE u.id = ? AND u.account_set_id = ?'
    )
    .get(req.userId, req.accountSetId) as any
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' })
  }
  const permissions = user.role_permissions ? JSON.parse(user.role_permissions) : []
  res.json({
    code: 0,
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role_code,
    roleName: user.role_name,
    accountSetId: user.account_set_id,
    permissions,
  })
})

// 登出
router.post('/logout', authMiddleware, (req: AuthRequest, res) => {
  if (req.sessionId) {
    const db = getDb()
    db.prepare(
      `UPDATE user_login_sessions
       SET status = 'logout', last_seen_at = datetime('now')
       WHERE id = ? AND status = 'active'`
    ).run(req.sessionId)
  }
  res.json({ code: 0, message: '已退出登录' })
})

// 切换操作员：固定当前账套，只重新认证当前账套下的其他用户
router.post('/switch-operator', authMiddleware, (req: AuthRequest, res) => {
  const { username, password, forceLogin } = req.body
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '请选择操作员并输入密码' })
  }
  if (!req.accountSetId) {
    return res.status(400).json({ code: 400, message: '当前账套无效，请重新登录' })
  }

  const db = getDb()
  const accountSet = db
    .prepare('SELECT * FROM account_sets WHERE id = ?')
    .get(req.accountSetId) as any
  if (!accountSet) {
    return res.status(404).json({ code: 404, message: '账套不存在' })
  }
  if (accountSet.status === 'inactive') {
    return res.status(400).json({ code: 400, message: '该账套已停用，无法切换操作员' })
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND account_set_id = ?')
    .get(username, req.accountSetId) as any
  if (!user) {
    return res.status(401).json({ code: 401, message: '操作员或密码错误' })
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(403).json({ code: 403, message: '账号已被锁定，请稍后再试' })
  }
  if (user.status === 'disabled') {
    return res.status(403).json({ code: 403, message: '账号已被禁用' })
  }

  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) {
    const attempts = (user.failed_attempts || 0) + 1
    if (attempts >= 5) {
      db.prepare(
        "UPDATE users SET failed_attempts = ?, locked_until = datetime('now', '+30 minute') WHERE id = ?"
      ).run(attempts, user.id)
    } else {
      db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id)
    }
    return res.status(401).json({ code: 401, message: '操作员或密码错误' })
  }

  if (!user.role_id) {
    return res.status(403).json({ code: 403, message: '该用户未分配角色，无法登录，请联系管理员' })
  }
  const role = db
    .prepare('SELECT * FROM roles WHERE id = ? AND account_set_id = ?')
    .get(user.role_id, req.accountSetId) as any
  if (!role) {
    return res.status(403).json({ code: 403, message: '用户角色配置异常，请联系管理员' })
  }

  const permissions = role.permissions ? JSON.parse(role.permissions) : []
  const currentLoginIp = getRequestIp(req)
  const userAgent = req.get('user-agent') || ''
  const lastLoginTime = user.last_login_at || null
  const lastLoginIp = user.last_login_ip ? toDisplayIp(user.last_login_ip) : null

  expireStaleLoginSessions(db, user.id, req.accountSetId)
  const activeSessions = listActiveLoginSessions(
    db,
    user.id,
    req.accountSetId,
    req.sessionId || undefined
  )
  const otherIpSession = findOtherIpActiveSession(activeSessions, currentLoginIp)

  if (otherIpSession && !forceLogin) {
    const activeLoginIp = otherIpSession.login_ip ? toDisplayIp(otherIpSession.login_ip) : 'unknown'
    return res.status(409).json({
      code: 40901,
      message: `该操作员已在 IP ${activeLoginIp} 登录，是否强制登录？`,
      data: {
        activeLoginIp,
        activeLoginAt: otherIpSession.login_at,
        activeLastSeenAt: otherIpSession.last_seen_at,
        lastLoginTime,
        lastLoginIp,
        currentLoginIp,
      },
    })
  }

  expireSameIpActiveSessions(db, activeSessions, currentLoginIp)

  let forcedOldLoginIp: string | null = null
  if (forceLogin) {
    forcedOldLoginIp = forceOtherIpActiveSessions(
      db,
      activeSessions,
      currentLoginIp,
      currentLoginIp
    )
  }

  if (req.sessionId) {
    db.prepare(
      `UPDATE user_login_sessions
       SET status = 'logout', last_seen_at = datetime('now')
       WHERE id = ? AND status = 'active'`
    ).run(req.sessionId)
  }

  const sessionId = uuidv4()
  db.prepare(
    `INSERT INTO user_login_sessions (
      id, account_set_id, user_id, username, login_ip, user_agent, login_at, last_seen_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'active')`
  ).run(sessionId, req.accountSetId, user.id, user.username, currentLoginIp, userAgent)

  db.prepare(
    "UPDATE users SET last_login_at = datetime('now'), last_login_ip = ?, failed_attempts = 0 WHERE id = ?"
  ).run(currentLoginIp, user.id)

  const token = generateToken({
    userId: user.id,
    userName: user.nickname || user.username,
    accountSetId: req.accountSetId,
    roleId: user.role_id,
    sessionId,
    permissions,
  })

  res.json({
    code: 0,
    message: '切换操作员成功',
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: role.code,
      roleName: role.name,
      permissions,
    },
    accountSetId: accountSet.id,
    accountSetName: accountSet.name,
    lastLoginTime,
    lastLoginIp,
    currentLoginIp,
    forcedLogin: !!forceLogin,
    forcedOldLoginIp,
  })
})

// 切换账套
router.post('/switch-account-set', authMiddleware, (req: AuthRequest, res) => {
  const { account_set_id } = req.body
  if (!account_set_id) {
    return res.status(400).json({ code: 400, message: '账套ID不能为空' })
  }
  const db = getDb()

  // 校验当前用户是否属于目标账套
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' })
  }
  if (user.account_set_id !== account_set_id) {
    return res.status(403).json({ code: 403, message: '您没有权限访问该账套' })
  }

  // 校验目标账套是否存在且可用
  const accountSet = db
    .prepare('SELECT * FROM account_sets WHERE id = ?')
    .get(account_set_id) as any
  if (!accountSet) {
    return res.status(404).json({ code: 404, message: '账套不存在' })
  }
  if (accountSet.status === 'inactive') {
    return res.status(400).json({ code: 400, message: '该账套已停用，无法切换' })
  }

  // 返回切换账套信息，前端跳转到登录页重新认证
  res.json({
    code: 0,
    message: '切换成功，请重新登录',
    username: user.username,
    accountSetId: accountSet.id,
    accountSetName: accountSet.name,
  })
})

// ===================== 备份导入 =====================
// 上传备份文件并导入为新账套（需要认证 + 账套管理权限）
router.post('/backup-import', authMiddleware, requirePermission('system:account'), upload.single('file'), (req: AuthRequest, res) => {
  const db = getDb()
  const { name, fiscal_year, start_date } = req.body as any

  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传备份文件' })
  }
  if (!name) {
    return res.status(400).json({ code: 400, message: '账套名称不能为空' })
  }

  // 自动生成账套编码（使用时间戳）
  const code = `AS${Date.now()}`

  const backupPath = req.file.path

  try {
    // 打开备份文件验证格式
    let backupDb: Database.Database
    try {
      backupDb = new Database(backupPath, (Database as any).OPEN_READONLY)
    } catch (err: any) {
      return res.status(400).json({ code: 400, message: '无效的备份文件: ' + err.message })
    }

    // 验证备份文件是否包含必要表
    const tables = backupDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as any[]
    const tableNames = tables.map(t => t.name)
    const requiredTables = ['account_sets', 'accounts', 'vouchers']
    const missing = requiredTables.filter(t => !tableNames.includes(t))
    if (missing.length > 0) {
      backupDb.close()
      return res
        .status(400)
        .json({ code: 400, message: `备份文件格式无效，缺少表: ${missing.join(', ')}` })
    }

    // 获取备份中的账套信息（如果有的话）
    let backupAccountSet: any = null
    try {
      const accountSets = backupDb.prepare('SELECT * FROM account_sets LIMIT 1').all() as any[]
      if (accountSets.length > 0) backupAccountSet = accountSets[0]
    } catch {
      /* ignore */
    }

    // 创建新账套
    const newAccountSetId = uuidv4()
    const fiscalYear = fiscal_year || new Date().getFullYear()
    const startDate = start_date || `${fiscalYear}-01-01`

    // 在事务外部定义变量，以便在事务外部访问
    const accountsMap = new Map<string, string>()
    const vouchersMap = new Map<string, string>()
    let entryCount = 0

    // 使用事务包装整个导入过程，确保数据一致性
    const importTransaction = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO account_sets (id, name, code, fiscal_year, start_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
      `
      ).run(newAccountSetId, name, code, fiscalYear, startDate)
      ensureAccountSetSecurityBootstrap(newAccountSetId)

    // 导入账簿科目（accounts）- 映射旧ID -> 新ID
    try {
      const accounts = backupDb.prepare('SELECT * FROM accounts').all() as any[]
      const insertAccount = db.prepare(`
        INSERT INTO accounts (id, account_set_id, code, name, direction, level, parent_id,
          is_aux, aux_type, balance, is_cash, is_bank, is_enabled, allow_delete, created_at, updated_at, aux_types)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
      `)
      for (const a of accounts) {
        const newId = uuidv4()
        accountsMap.set(a.id, newId)
        const newParentId = a.parent_id ? accountsMap.get(a.parent_id) || null : null
        insertAccount.run(
          newId,
          newAccountSetId,
          a.code,
          a.name,
          a.direction || 'debit',
          a.level || 1,
          newParentId,
          a.is_aux || 0,
          a.aux_type || null,
          a.balance || null,
          a.is_cash || 0,
          a.is_bank || 0,
          a.is_enabled !== 0 ? 1 : 0,
          a.allow_delete !== 0 ? 1 : 0,
          a.aux_types || null
        )
      }
    } catch (err: any) {
      console.error('accounts import error:', err.message)
    }

    // 导入辅助核算类别（backup 的 aux_categories -> 当前 aux_items）
    const auxItemsMap = new Map<string, string>()
    try {
      const auxCats = backupDb.prepare('SELECT * FROM aux_categories').all() as any[]
      const insertAux = db.prepare(`
        INSERT INTO aux_items (id, account_set_id, type, code, name, status, remark, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', NULL, datetime('now'), datetime('now'))
      `)
      for (const a of auxCats) {
        const newId = uuidv4()
        auxItemsMap.set(a.id, newId)
        // type: 根据辅助核算类别名称推断
        let auxType = a.type || a.name || 'department'
        if (/部[门]?/.test(auxType)) auxType = 'department'
        else if (/项[目]?/.test(auxType)) auxType = 'project'
        else if (/供[应商商]?/.test(auxType)) auxType = 'supplier'
        else if (/人[员]?/.test(auxType)) auxType = 'person'
        else if (/功[能]?/.test(auxType)) auxType = 'func_class'
        else auxType = 'department'
        insertAux.run(newId, newAccountSetId, auxType, a.code, a.name)
      }
    } catch (err: any) {
      console.error('aux_categories import error:', err.message)
    }

    // 导入凭证
    try {
      const vouchers = backupDb.prepare('SELECT * FROM vouchers').all() as any[]
      const insertVoucher = db.prepare(`
        INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period,
          status, total_amount, maker_id, maker_name, attachments, remark, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      for (const v of vouchers) {
        const newId = uuidv4()
        vouchersMap.set(v.id, newId)
        insertVoucher.run(
          newId,
          newAccountSetId,
          v.voucher_no,
          v.voucher_type_id || null,
          v.voucher_date,
          v.year || fiscalYear,
          v.period || 1,
          v.status || 'draft',
          v.total_amount || 0,
          v.maker_id || null,
          v.maker_name || null,
          v.attachments || 0,
          v.remark || null
        )
      }
    } catch (err: any) {
      console.error('vouchers import error:', err.message)
    }

    // 导入凭证分录
    try {
      const entries = backupDb.prepare('SELECT * FROM voucher_entries').all() as any[]
      const insertEntry = db.prepare(`
        INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name,
          direction, amount, summary, dept_id, dept_name, project_id, project_name,
          supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      for (const e of entries) {
        const newVoucherId = vouchersMap.get(e.voucher_id)
        const newAccountId = accountsMap.get(e.account_id)
        if (newVoucherId) {
          insertEntry.run(
            uuidv4(),
            newAccountSetId,
            newVoucherId,
            e.seq || 1,
            newAccountId || null,
            e.account_code || null,
            e.account_name || null,
            e.direction || 'debit',
            e.amount || 0,
            e.summary || null,
            e.dept_id || null,
            e.dept_name || null,
            e.project_id || null,
            e.project_name || null,
            e.supplier_id || null,
            e.supplier_name || null,
            e.person_id || null,
            e.person_name || null,
            e.func_class_id || null,
            e.func_class_name || null
          )
          entryCount++
        }
      }
    } catch (err: any) {
      console.error('voucher_entries import error:', err.message)
    }

    // 导入初始化余额
    try {
      const initBalances = backupDb.prepare('SELECT * FROM init_balances').all() as any[]
      const insertInit = db.prepare(`
        INSERT INTO init_balances (id, account_set_id, account_id, direction, year, period,
          init_balance, init_debit, init_credit, aux_item_id, opening_debit, opening_credit, pre_book_debit, pre_book_credit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      for (const b of initBalances) {
        const newAccountId = accountsMap.get(b.account_id)
        if (newAccountId) {
          insertInit.run(
            uuidv4(),
            newAccountSetId,
            newAccountId,
            b.direction || 'debit',
            b.year || fiscalYear,
            b.period || 1,
            b.init_balance || 0,
            b.init_debit || 0,
            b.init_credit || 0,
            b.aux_item_id || '',
            b.opening_debit || 0,
            b.opening_credit || 0,
            b.pre_book_debit || 0,
            b.pre_book_credit || 0
          )
        }
      }
    } catch (err: any) {
      console.error('init_balances import error:', err.message)
    }

    // 导入科目余额
    try {
      const balances = backupDb.prepare('SELECT * FROM account_balances').all() as any[]
      const insertBalance = db.prepare(`
        INSERT INTO account_balances (id, account_set_id, account_id, account_code, account_name, direction, year, period,
          init_balance, init_debit, init_credit, current_debit, current_credit,
          end_balance, end_debit, end_credit, aux_item_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      for (const b of balances) {
        const newAccountId = accountsMap.get(b.account_id)
        if (newAccountId) {
          insertBalance.run(
            uuidv4(),
            newAccountSetId,
            newAccountId,
            b.account_code || null,
            b.account_name || null,
            b.direction || 'debit',
            b.year || fiscalYear,
            b.period || 1,
            b.init_balance || 0,
            b.init_debit || 0,
            b.init_credit || 0,
            b.current_debit || 0,
            b.current_credit || 0,
            b.end_balance || 0,
            b.end_debit || 0,
            b.end_credit || 0,
            b.aux_item_id || null
          )
        }
      }
    } catch (err: any) {
      console.error('account_balances import error:', err.message)
    }

    // 导入期间结账（period_close 表可能不存在，跳过）
    try {
      const periodCloseExists = tableNames.includes('period_closing')
      if (periodCloseExists) {
        // period_close 表不存在于当前 DB，只记录日志
        console.log('[BackupImport] period_close table not found, skipping period closing import')
      }
    } catch {
      /* ignore */
    }

    // 导入系统参数
    try {
      const params = backupDb
        .prepare('SELECT * FROM system_params WHERE account_set_id IS NOT NULL')
        .all() as any[]
      const insertParam = db.prepare(`
        INSERT OR IGNORE INTO system_params (id, account_set_id, param_key, param_value, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `)
      for (const p of params) {
        insertParam.run(uuidv4(), newAccountSetId, p.param_key, p.param_value)
      }
    } catch (err: any) {
      console.error('system_params import error:', err.message)
    }
    }) // 结束事务

    // 执行事务
    importTransaction()

    backupDb.close()

    // 删除临时上传文件
    try {
      unlinkSync(backupPath)
    } catch {
      /* ignore */
    }

    res.json({
      code: 0,
      message: '备份导入成功',
      data: {
        id: newAccountSetId,
        name,
        code,
        fiscal_year: fiscalYear,
        backupAccountSetName: backupAccountSet?.name || null,
        imported: {
          accounts: accountsMap.size,
          vouchers: vouchersMap.size,
          entries: entryCount,
        },
      },
    })
  } catch (err: any) {
    // 清理临时文件
    try {
      unlinkSync(backupPath)
    } catch {
      /* ignore */
    }
    console.error('Backup import error:', err)
    res.status(500).json({ code: 500, message: '导入失败: ' + err.message })
  }
})

// ===================== ACD 账套导入 =====================
// 上传润衡ACD备份文件并导入为新账套（需要认证 + 账套管理权限）
// ===================== ACD 导入（无需认证，用于登录页面导入）=====================
router.post('/acd-import', upload.single('file'), (req: AuthRequest, res) => {
  const { name } = req.body as any

  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传ACD文件' })
  }
  if (!name) {
    return res.status(400).json({ code: 400, message: '账套名称不能为空' })
  }

  // 自动生成账套编码（使用时间戳）
  const code = `AS${Date.now()}`

  const acdPath = req.file.path

  try {
    // Read the uploaded file as buffer
    const acdBuffer = readFileSync(acdPath)

    // Basic validation: ACD files should be zlib-compressed and contain 'rhsj' marker
    const marker = Buffer.from('rhsj\\')
    if (!acdBuffer.includes(marker)) {
      return res
        .status(400)
        .json({ code: 400, message: '无效的ACD文件格式，请确认是润衡财务软件导出的.acd文件' })
    }

    const fiscalYear = new Date().getFullYear()
    const startDate = `${fiscalYear}-01-01`

    const result = acdImportService({
      acdBuffer,
      name,
      code,
      fiscalYear,
      startDate,
    })

    // Clean up temp file
    try {
      unlinkSync(acdPath)
    } catch {
      /* ignore */
    }

    const { stats } = result
    res.json({
      code: 0,
      message: 'ACD账套导入成功',
      data: {
        id: result.accountSetId,
        name: result.name,
        code: result.code,
        fiscal_year: result.fiscalYear,
        imported: {
          accounts: stats.accounts.inserted + stats.accounts.updated,
          initBalances: stats.initBalances.inserted,
          transferTypes: stats.transferTypes.types,
          transferItems: stats.transferTypes.items,
          vouchers: stats.vouchers.vouchers,
          voucherEntries: stats.vouchers.entries,
          reportDefinitions: stats.reportTemplates.definitions,
        },
        warnings: stats.warnings,
      },
    })
  } catch (err: any) {
    // Clean up temp file
    try {
      unlinkSync(acdPath)
    } catch {
      /* ignore */
    }
    console.error('ACD import error:', err)
    res.status(500).json({ code: 500, message: 'ACD导入失败: ' + err.message })
  }
})

export default router
