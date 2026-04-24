import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.ts'
import { importAcdToAccountSet, type ImportStats } from '../scripts/importAcdToCurrentAccountSet.ts'

export interface AcdImportParams {
  acdBuffer: Buffer
  name: string
  code: string
  fiscalYear: number
  startDate: string
}

export interface AcdImportResult {
  accountSetId: string
  name: string
  code: string
  fiscalYear: number
  stats: ImportStats
}

export function acdImportService(params: AcdImportParams): AcdImportResult {
  const db = getDb()

  // Check code uniqueness
  const existing = db.prepare('SELECT id FROM account_sets WHERE code = ?').get(params.code)
  if (existing) {
    throw new Error('账套编码已存在: ' + params.code)
  }

  // Create new account set
  const accountSetId = uuidv4()
  db.prepare(`
    INSERT INTO account_sets (id, name, code, fiscal_year, start_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
  `).run(accountSetId, params.name, params.code, params.fiscalYear, params.startDate)

  // Create default admin user for the new account set
  const userId = uuidv4()
  const adminRoleId = (db.prepare("SELECT id FROM roles WHERE code = 'admin' LIMIT 1").get() as any)?.id
  db.prepare(`
    INSERT INTO users (id, account_set_id, username, password, nickname, role_id, status, created_at, updated_at)
    VALUES (?, ?, 'admin', ?, '管理员', ?, 'active', datetime('now'), datetime('now'))
  `).run(
    userId,
    accountSetId,
    // Default password: admin123 (bcrypt hash)
    '$2a$10$Dj9DCcIGNtjYZmfcub6td.wly0mkJT.bLPc.yeFAStW77WqkQu5ie',
    adminRoleId || null,
  )

  // Execute ACD import into the new account set
  const stats = importAcdToAccountSet(accountSetId, params.acdBuffer)

  return {
    accountSetId,
    name: params.name,
    code: params.code,
    fiscalYear: params.fiscalYear,
    stats,
  }
}
