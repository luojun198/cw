import { v4 as uuidv4 } from 'uuid'
import { getDb, ensureAccountSetSecurityBootstrap } from '../db/index.js'
import { importAcdToAccountSet, type ImportStats } from '../scripts/importAcdToCurrentAccountSet.js'

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

  // Create default roles and admin user for the new account set
  ensureAccountSetSecurityBootstrap(accountSetId)

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
