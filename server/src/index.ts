// 首先加载环境变量
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// 兼容开发模式（__dirname = server/src/）和部署模式（__dirname = deploy-final/server/）
const envPath = existsSync(join(__dirname, '.env'))
  ? join(__dirname, '.env')
  : join(__dirname, '..', '.env')
dotenv.config({ path: envPath })

// JWT_SECRET 弱值告警（仅提示，不阻断）：若仍是 .env.example 中的占位值，提示运维替换
const DEFAULT_JWT_SECRETS = new Set([
  'your-secret-key-change-this-in-production',
  'change-me',
  'changeme',
  'secret',
  '',
])
const _jwtSecretCheck = (process.env.JWT_SECRET || '').trim()
if (!_jwtSecretCheck || DEFAULT_JWT_SECRETS.has(_jwtSecretCheck)) {
  console.warn(
    '[SECURITY WARN] JWT_SECRET 当前为默认/弱值。生产环境请在 server/.env 中设置为足够长的随机字符串，' +
      '否则任何知晓默认值的人都能伪造登录 token。'
  )
}

import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { basename, resolve } from 'path'
import { initDatabase } from './db/index.js'
import { runMigrations } from './db/migrations.js'
import { migrations } from './db/migrationList.js'
import { initDefaultAccountSet } from './scripts/seedAccounts.js'
import { initDefaultPrintTemplate } from './scripts/initPrintTemplate.js'
import { log } from './utils/logger.js'

// 路由
import authRoutes from './routes/auth.js'
import systemRoutes from './routes/system.js'
import baseRoutes from './routes/base.js'
import baseAccountRoutes from './routes/baseAccount.js'
import baseVoucherTypeRoutes from './routes/baseVoucherType.js'
import baseProjectRoutes from './routes/baseProject.js'
import baseInitBalanceRoutes from './routes/baseInitBalance.js'
import basePrintTemplateRoutes from './routes/basePrintTemplate.js'
import baseKeyboardShortcutsRoutes from './routes/baseKeyboardShortcuts.js'
import baseCashFlowRoutes from './routes/baseCashFlow.js'
import voucherRoutes from './routes/voucher.js'
import voucherAuditRoutes from './routes/voucherAudit.js'
import voucherPostingRoutes from './routes/voucherPosting.js'
import voucherBatchRoutes from './routes/voucherBatch.js'
import voucherPeriodRoutes from './routes/voucherPeriod.js'
import voucherAiRoutes from './routes/voucherAi.js'
import voucherAutoTransferRoutes from './routes/voucherAutoTransfer.js'
import voucherTemplateRoutes from './routes/voucherTemplate.js'
import taskRoutes from './routes/task.js'
import ledgerRoutes from './routes/ledger.js'
import reportRoutes from './routes/report.js'
import reportBalanceSheetRoutes from './routes/reportBalanceSheet.js'
import reportIncomeStatementRoutes from './routes/reportIncomeStatement.js'
import reportEquityRoutes from './routes/reportEquity.js'
import reportAuxRoutes from './routes/reportAux.js'
import reportAiRoutes from './routes/reportAi.js'
import reportTemplateRoutes from './routes/reportTemplate.js'
import dashboardRoutes from './routes/dashboard.js'
import backupRoutes from './routes/backup.js'

// 便携部署：process.execPath = deploy/node/node.exe，client/dist 在 deploy/client/dist/
// pkg 部署：process.pkg 标识，client/dist 在 exe 同目录/client/dist/
// 开发环境：client/dist 在项目根目录 client/dist/
function getExeDir(): string {
  if ((process as any).pkg) {
    // pkg exe: deploy/cw-finance.exe → deploy/
    return dirname(process.execPath)
  }
  // 便携 Node.js: execPath = deploy/node/node.exe
  // 系统安装的 Node.js: execPath = C:\Program Files\nodejs\node.exe
  // 区分方式：execPath 的父目录名是 "node" 则为便携式
  const execPath = process.execPath || ''
  const execDir = dirname(execPath)
  if (execPath.endsWith('node.exe') && basename(execDir).toLowerCase() === 'node') {
    return dirname(execDir)
  }
  // 开发：arg = server/src/index.ts
  const arg = process.argv[1]
  if (arg) {
    // tsx dev: arg = server/src/index.ts → server/src → server → cw/
    // bundle:  arg = server/dist/bundle.cjs → server/dist → server → cw/
    const scriptDir = dirname(arg)
    const serverDir = dirname(scriptDir)
    return dirname(serverDir)
  }
  return process.cwd()
}

const EXE_DIR = getExeDir()

const app = express()
const PORT = process.env.PORT || 3005

// 文件上传中间件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // 接受所有文件类型
    cb(null, true)
  },
})

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 请求日志
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    log.http(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// API路由
app.use('/api/auth', authRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/base', baseRoutes)
app.use('/api/base/keyboard-shortcuts', baseKeyboardShortcutsRoutes)
app.use('/api/base/cash-flow-items', baseCashFlowRoutes)
app.use('/api/base', baseAccountRoutes)
app.use('/api/base', baseVoucherTypeRoutes)
app.use('/api/base', baseProjectRoutes)
app.use('/api/base', baseInitBalanceRoutes)
app.use('/api/base', basePrintTemplateRoutes)
app.use('/api/voucher', voucherRoutes)
app.use('/api/voucher', voucherAuditRoutes)
app.use('/api/voucher', voucherPostingRoutes)
app.use('/api/voucher', voucherBatchRoutes)
app.use('/api/voucher', voucherPeriodRoutes)
app.use('/api/voucher', voucherAiRoutes)
app.use('/api/voucher', voucherAutoTransferRoutes)
app.use('/api/voucher', taskRoutes)
app.use('/api/voucher-templates', voucherTemplateRoutes)
app.use('/api/ledger', ledgerRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/report', reportBalanceSheetRoutes)
app.use('/api/report', reportIncomeStatementRoutes)
app.use('/api/report', reportEquityRoutes)
app.use('/api/report', reportAuxRoutes)
app.use('/api/report', reportAiRoutes)
app.use('/api/report', reportTemplateRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/security', backupRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, status: 'ok', timestamp: new Date().toISOString() })
})

// 静态文件服务（前端页面）
const clientDist = resolve(EXE_DIR, 'client', 'dist')
app.use('/uploads', express.static(resolve(process.cwd(), 'uploads')))
app.use(express.static(clientDist))

// 初始化数据库
initDatabase()
log.info('数据库初始化完成')

// 执行数据库迁移
try {
  runMigrations(migrations)
  log.info('数据库迁移完成')
} catch (error) {
  log.error('数据库迁移失败:', error)
}

// SPA fallback: 所有非API路由返回 index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(resolve(clientDist, 'index.html'))
})

// 初始化默认数据
if (process.env.SEED_DEFAULT_ACCOUNT_SET !== 'false') {
  initDefaultAccountSet('行政事业单位财务账套')
  log.info('默认账套初始化完成')
} else {
  log.info('已跳过默认账套初始化')
}

// 初始化默认打印模版
try {
  initDefaultPrintTemplate()
  log.info('默认打印模版初始化完成')
} catch (error) {
  log.error('默认打印模版初始化失败:', error)
}

// 404 处理（必须在所有路由之后）
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
app.use(notFoundHandler)

// 全局错误处理中间件（必须在最后）
app.use(errorHandler)

const server = app.listen(PORT, () => {
  log.info(`财务记账系统服务已启动: http://localhost:${PORT}`)
  log.info(`API地址: http://localhost:${PORT}/api`)
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    log.error(`端口 ${PORT} 已被占用，后端服务可能已经在运行。请关闭重复启动的服务后再重试。`)
    process.exit(0)
  }
  throw error
})
