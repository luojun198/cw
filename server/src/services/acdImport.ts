import { v4 as uuidv4 } from 'uuid'
import { getDb, ensureAccountSetSecurityBootstrap, assertDatabaseIntegrity, checkpointDatabase } from '../db/index.js'
import { importAcdToAccountSet, type ImportStats } from '../scripts/importAcdToCurrentAccountSet.js'
import { cleanupAccountSetCascade } from './accountSetCleanup.js'
import { syncAccountSetUserRoleLinks } from './userRoleLinks.js'

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

export async function acdImportService(params: AcdImportParams): Promise<AcdImportResult> {
  const db = getDb()
  assertDatabaseIntegrity(db)

  // Check code uniqueness
  const existing = db.prepare('SELECT id FROM account_sets WHERE code = ?').get(params.code)
  if (existing) {
    throw new Error('账套编码已存在: ' + params.code)
  }

  const accountSetId = uuidv4()

  try {
    db.prepare(`
      INSERT INTO account_sets (id, name, code, fiscal_year, start_date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(accountSetId, params.name, params.code, params.fiscalYear, params.startDate)

    ensureAccountSetSecurityBootstrap(accountSetId)

    const stats = await importAcdToAccountSet(accountSetId, params.acdBuffer)
    syncAccountSetUserRoleLinks(accountSetId, db)
    checkpointDatabase(db)

    return {
      accountSetId,
      name: params.name,
      code: params.code,
      fiscalYear: params.fiscalYear,
      stats,
    }
  } catch (error) {
    try {
      cleanupAccountSetCascade(db, accountSetId)
    } catch (cleanupError) {
      console.error('[ACD Import] 导入失败后清理账套出错:', cleanupError)
    }
    throw error
  }
}
