import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs'
import { resolve, join } from 'path'
import { getDb, DB_PATH, initDatabase } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 备份设置 =====================

// 备份设置默认值
const DEFAULT_SETTINGS = {
  enabled: false,
  schedule: 'daily', // daily / weekly / monthly
  time: '02:00', // HH:MM
  backupPath: '', // 空则使用默认路径
  retention: 30, // 保留天数
}

// 获取备份设置
router.get('/backups/settings', (req: AuthRequest, res) => {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT param_key, param_value FROM system_params WHERE account_set_id=? AND param_key LIKE 'backup:%'"
    )
    .all(req.accountSetId) as any[]

  const settings: any = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    const key = row.param_key.replace('backup:', '')
    try {
      settings[key] = JSON.parse(row.param_value)
    } catch {
      settings[key] = row.param_value
    }
  }
  res.json({ code: 0, data: settings })
})

// 保存备份设置
router.put(
  '/backups/settings',
  operationLog('保存备份设置', '数据安全'),
  (req: AuthRequest, res) => {
    const { enabled, schedule, time, backupPath, retention } = req.body
    const db = getDb()

    const params = [
      { key: 'backup:enabled', value: String(!!enabled) },
      { key: 'backup:schedule', value: String(schedule || 'daily') },
      { key: 'backup:time', value: String(time || '02:00') },
      { key: 'backup:backupPath', value: String(backupPath || '') },
      { key: 'backup:retention', value: String(Number(retention) || 30) },
    ]

    for (const p of params) {
      const existing = db
        .prepare('SELECT id FROM system_params WHERE account_set_id=? AND param_key=?')
        .get(req.accountSetId, p.key)
      if (existing) {
        db.prepare(
          'UPDATE system_params SET param_value=? WHERE account_set_id=? AND param_key=?'
        ).run(p.value, req.accountSetId, p.key)
      } else {
        db.prepare(
          'INSERT INTO system_params (id, account_set_id, param_key, param_value) VALUES (?, ?, ?, ?)'
        ).run(uuidv4(), req.accountSetId, p.key, p.value)
      }
    }

    // 重启调度器
    updateScheduler(db)

    res.json({ code: 0, message: '备份设置已保存' })
  }
)

// ===================== 备份记录 =====================

router.get('/backups', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare(
      `
    SELECT b.*, u.nickname as operator_name, u.username as operator_username
    FROM backups b
    LEFT JOIN users u ON b.created_by = u.id
    WHERE b.account_set_id=?
    ORDER BY b.created_at DESC
  `
    )
    .all(req.accountSetId)
  res.json({ code: 0, data: list })
})

// 备份统计
router.get('/backups/stats', (req: AuthRequest, res) => {
  const db = getDb()
  const total =
    (
      db
        .prepare('SELECT COUNT(*) as cnt FROM backups WHERE account_set_id=?')
        .get(req.accountSetId) as any
    )?.cnt || 0
  const totalSize =
    (
      db
        .prepare('SELECT COALESCE(SUM(size), 0) as total FROM backups WHERE account_set_id=?')
        .get(req.accountSetId) as any
    )?.total || 0
  const autoCount =
    (
      db
        .prepare("SELECT COUNT(*) as cnt FROM backups WHERE account_set_id=? AND type='auto'")
        .get(req.accountSetId) as any
    )?.cnt || 0
  const manualCount =
    (
      db
        .prepare("SELECT COUNT(*) as cnt FROM backups WHERE account_set_id=? AND type='manual'")
        .get(req.accountSetId) as any
    )?.cnt || 0
  const lastBackup = db
    .prepare(
      'SELECT created_at, filename FROM backups WHERE account_set_id=? ORDER BY created_at DESC LIMIT 1'
    )
    .get(req.accountSetId) as any

  res.json({
    code: 0,
    data: {
      total,
      totalSize,
      autoCount,
      manualCount,
      lastBackupTime: lastBackup?.created_at || null,
      lastBackupFilename: lastBackup?.filename || null,
    },
  })
})

// 格式化日期时间为 YYYYMMDD_HHMMSS
function formatBackupTime(d: Date): string {
  const yyyy = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}${MM}${dd}_${hh}${mm}${ss}`
}

// 执行备份（内部/定时调度调用）
async function doBackup(
  accountSetId: string,
  type: 'manual' | 'auto',
  userId?: string
): Promise<{ id: string; filename: string; size: number } | null> {
  const db = getDb()

  // 获取备份路径设置
  const backupPathSetting =
    (
      db
        .prepare(
          "SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='backup:backupPath'"
        )
        .get(accountSetId) as any
    )?.param_value || ''
  const baseDir = backupPathSetting ? resolve(backupPathSetting) : resolve(process.cwd(), 'backups')

  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })

  const id = uuidv4()
  const now = new Date()
  const timeStr = formatBackupTime(now)
  const filename = type === 'auto' ? `自动备份_${timeStr}.db` : `手动备份_${timeStr}.db`
  const filepath = join(baseDir, filename)

  return new Promise(resolve => {
    const currentDb = getDb()
    currentDb
      .backup(filepath)
      .then(() => {
        const stats = statSync(filepath)
        db.prepare(
          `
        INSERT INTO backups (id, account_set_id, filename, filepath, size, type, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'success')
      `
        ).run(id, accountSetId, filename, filepath, stats.size, type, userId || null)

        // 清理过期备份
        cleanupOldBackups(accountSetId)

        resolve({ id, filename, size: stats.size })
      })
      .catch((err: Error) => {
        db.prepare(
          `
        INSERT INTO backups (id, account_set_id, filename, filepath, size, type, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'failed')
      `
        ).run(id, accountSetId, filename, filepath, 0, type, userId || null)
        console.error('Auto backup failed:', err.message)
        resolve(null)
      })
  })
}

// 清理过期备份
function cleanupOldBackups(accountSetId: string) {
  const db = getDb()
  const retention = Number(
    (
      db
        .prepare(
          "SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='backup:retention'"
        )
        .get(accountSetId) as any
    )?.param_value || 30
  )

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retention)

  const oldBackups = db
    .prepare(
      "SELECT id, filepath FROM backups WHERE account_set_id=? AND type='auto' AND created_at < ?"
    )
    .all(accountSetId, cutoff.toISOString()) as any[]

  for (const b of oldBackups) {
    try {
      if (existsSync(b.filepath)) unlinkSync(b.filepath)
    } catch {
      /* ignore */
    }
  }
  if (oldBackups.length > 0) {
    db.prepare("DELETE FROM backups WHERE account_set_id=? AND type='auto' AND created_at < ?").run(
      accountSetId,
      cutoff.toISOString()
    )
  }
}

// 手动备份
router.post('/backups', operationLog('手动备份', '数据安全'), async (req: AuthRequest, res) => {
  try {
    const result = await doBackup(req.accountSetId, 'manual', req.userId)
    if (result) {
      res.json({ code: 0, message: '备份成功', data: result })
    } else {
      res.status(500).json({ code: 500, message: '备份失败' })
    }
  } catch (err: any) {
    res.status(500).json({ code: 500, message: '备份失败: ' + err.message })
  }
})

// 恢复备份
router.post(
  '/backups/:id/restore',
  operationLog('恢复备份', '数据安全'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const backup = db
      .prepare('SELECT * FROM backups WHERE id=? AND account_set_id=?')
      .get(id, req.accountSetId) as any
    if (!backup) {
      return res.status(404).json({ code: 404, message: '备份文件不存在' })
    }
    if (!existsSync(backup.filepath)) {
      return res.status(404).json({ code: 404, message: '备份文件已丢失' })
    }
    try {
      const currentDb = getDb()
      currentDb.close()
      const backupData = readFileSync(backup.filepath)
      writeFileSync(DB_PATH, backupData)
      initDatabase()
      res.json({ code: 0, message: '恢复成功，请刷新页面' })
    } catch (err: any) {
      res.status(500).json({ code: 500, message: '恢复失败: ' + err.message })
    }
  }
)

// 删除备份
router.delete('/backups/:id', operationLog('删除备份', '数据安全'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const backup = db
    .prepare('SELECT * FROM backups WHERE id=? AND account_set_id=?')
    .get(id, req.accountSetId) as any
  if (backup && existsSync(backup.filepath)) {
    try {
      unlinkSync(backup.filepath)
    } catch {
      /* ignore */
    }
  }
  db.prepare('DELETE FROM backups WHERE id=? AND account_set_id=?').run(id, req.accountSetId)
  res.json({ code: 0, message: '删除成功' })
})

// ===================== 定时备份调度器 =====================

// 各账套的下次执行时间
const scheduleCache: Map<string, { nextRun: Date; lastChecked: string }> = new Map()

function shouldRunToday(schedule: string, time: string, lastChecked: string): boolean {
  const now = new Date()
  const [targetHour, targetMin] = time.split(':').map(Number)

  if (schedule === 'daily') {
    return true
  }

  if (schedule === 'weekly') {
    // 每周一凌晨执行
    return now.getDay() === 1
  }

  if (schedule === 'monthly') {
    // 每月1号凌晨执行
    return now.getDate() === 1
  }

  return false
}

function parseTime(time: string): { hour: number; min: number } {
  const [h, m] = time.split(':').map(Number)
  return { hour: h || 2, min: m || 0 }
}

function updateScheduler(db: ReturnType<typeof getDb>) {
  // 遍历所有启用了自动备份的账套
  const rows = db
    .prepare(
      "SELECT DISTINCT account_set_id FROM system_params WHERE param_key='backup:enabled' AND param_value='true'"
    )
    .all() as any[]

  const accountSetIds = new Set<string>()
  for (const row of rows) {
    accountSetIds.add(row.account_set_id)
  }

  // 清理不在列表中的
  for (const [asid] of scheduleCache) {
    if (!accountSetIds.has(asid)) {
      scheduleCache.delete(asid)
    }
  }
}

// 每分钟检查一次
let schedulerInterval: ReturnType<typeof setInterval> | null = null

function startScheduler() {
  if (schedulerInterval) return

  schedulerInterval = setInterval(() => {
    const db = getDb()
    const rows = db
      .prepare(
        "SELECT account_set_id, param_key, param_value FROM system_params WHERE param_key IN ('backup:enabled','backup:schedule','backup:time')"
      )
      .all() as any[]

    // 按账套分组
    const configs: Map<string, any> = new Map()
    for (const row of rows) {
      if (!configs.has(row.account_set_id)) {
        configs.set(row.account_set_id, {})
      }
      const key = row.param_key.replace('backup:', '')
      configs.get(row.account_set_id)[key] = row.param_value
    }

    const now = new Date()
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    for (const [accountSetId, cfg] of configs) {
      if (cfg.enabled !== 'true') continue

      const schedule = cfg.schedule || 'daily'
      const time = cfg.time || '02:00'
      const lastChecked = scheduleCache.get(accountSetId)?.lastChecked || ''

      if (shouldRunToday(schedule, time, lastChecked) && currentTimeStr === time) {
        if (lastChecked !== currentTimeStr) {
          scheduleCache.set(accountSetId, { nextRun: now, lastChecked: currentTimeStr })
          doBackup(accountSetId, 'auto').then(result => {
            if (result) {
              console.log(
                `[AutoBackup] Success: ${result.filename} (${result.size} bytes) for account_set ${accountSetId}`
              )
            }
          })
        }
      }
    }
  }, 60000) // 每分钟检查
}

// 服务器启动时初始化调度器
startScheduler()

// 导出供 server/index.ts 调用（服务器重启时刷新调度器）
export { startScheduler, updateScheduler }

export default router
