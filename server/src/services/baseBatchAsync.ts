import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import { createTask, updateTask } from './taskQueue.js'
import { saveInitBalanceBatchItems, type InitBalanceBatchItem } from './initBalanceBatch.js'
import {
  assertInitBalanceEditable,
  assertInitBalanceAuxEditable,
  clearAuxInitBalances,
  clearDirectInitBalances,
  type AuxInitClearScope,
  type InitBalanceClearMode,
} from './initBalanceClear.js'
import {
  formatAuxItemDisplayLabel,
  getAuxItemDeleteBlockReason,
  getAuxItemDisplayLabelById,
} from './auxDeleteGuard.js'
import { AccountService } from './accountService.js'
import { normalizeImportCode, normalizeImportText } from './baseValidation.js'
import {
  formatAccountDisplayLabel,
  formatRowLabel,
} from '../utils/displayLabel.js'
import {
  createThrottledReporter,
  shouldYieldEventLoop,
  yieldEventLoop,
} from '../utils/batchProgress.js'
import {
  saveInitBalanceAuxDetails,
  type InitBalanceAuxLineInput,
} from './initBalanceAux.js'
import {
  createAccountParentLookup,
  createAuxItemExistsCheckers,
  runInDbTransactionChunks,
} from '../utils/bulkImportHelpers.js'

function runProgressTask(
  type: Parameters<typeof createTask>[0],
  accountSetId: string,
  runner: (taskId: string, report: (processed: number, total: number, success: number, failed: number) => void) => Promise<{ message: string; result?: unknown }>
): string {
  const task = createTask(type, accountSetId)

  setImmediate(async () => {
    try {
      updateTask(task.id, { status: 'processing' })
      const report = (processed: number, total: number, success: number, failed: number) => {
        const progress = total > 0 ? Math.floor((processed / total) * 100) : 0
        updateTask(task.id, { processed, total, success, failed, progress })
      }
      const outcome = await runner(task.id, report)
      updateTask(task.id, {
        status: 'completed',
        progress: 100,
        message: outcome.message,
        result: outcome.result,
      })
    } catch (error: any) {
      updateTask(task.id, {
        status: 'failed',
        message: error.message || '批量操作失败',
      })
    }
  })

  return task.id
}

export function batchInitBalanceImportAsync(
  db: Database,
  accountSetId: string,
  year: number,
  items: InitBalanceBatchItem[]
) {
  assertInitBalanceEditable(db, accountSetId, year)
  return runProgressTask('init-balance-import', accountSetId, async (_taskId, report) => {
    const throttledReport = createThrottledReporter(report, items.length)
    throttledReport(0, 0, 0, true)
    const result = saveInitBalanceBatchItems(db, accountSetId, year, items, {
      onProgress: (processed, _total, success, failed) => {
        throttledReport(processed, success, failed)
      },
    })
    throttledReport(items.length, result.success, result.failed, true)
    return {
      message: `批量导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`,
      result: {
        ...result,
        errors: result.errors.slice(0, 10),
      },
    }
  })
}

export function batchInitBalanceClearAsync(
  db: Database,
  accountSetId: string,
  year: number,
  mode: InitBalanceClearMode,
  accountIds?: string[]
) {
  if (mode === 'aux') {
    assertInitBalanceAuxEditable(db, accountSetId, year)
  } else {
    assertInitBalanceEditable(db, accountSetId, year)
  }
  return runProgressTask('init-balance-clear', accountSetId, async (_taskId, report) => {
    report(0, 1, 0, 0)
    if (mode === 'aux') {
      const result = clearAuxInitBalances(db, accountSetId, year, 'all_accounts')
      report(1, 1, result.deletedCount, 0)
      return {
        message: `已清理 ${result.deletedCount} 条辅助期初明细，涉及 ${result.affectedAccounts} 个科目`,
        result,
      }
    }
    const result = clearDirectInitBalances(db, accountSetId, year, { accountIds })
    report(1, 1, result.deletedCount, 0)
    return {
      message: `已清理 ${result.deletedCount} 条科目期初记录`,
      result,
    }
  })
}

export function batchAuxInitClearAsync(
  db: Database,
  accountSetId: string,
  year: number,
  scope: AuxInitClearScope,
  options: { accountId: string; categoryCode?: string }
) {
  assertInitBalanceAuxEditable(db, accountSetId, year)
  return runProgressTask('aux-init-clear', accountSetId, async (_taskId, report) => {
    report(0, 1, 0, 0)
    const result = clearAuxInitBalances(db, accountSetId, year, scope, options)
    report(1, 1, result.deletedCount, 0)
    return {
      message:
        scope === 'category'
          ? `已清理当前类目 ${result.deletedCount} 条辅助期初明细`
          : `已清理当前科目 ${result.deletedCount} 条辅助期初明细`,
      result,
    }
  })
}

export function batchAuxItemsDeleteByCategoryAsync(
  db: Database,
  accountSetId: string,
  type: string,
  status?: string
) {
  return runProgressTask('aux-items-delete', accountSetId, async (_taskId, report) => {
    const conditions = ['account_set_id=?', 'type=?']
    const params: string[] = [accountSetId, type]
    if (status) {
      conditions.push('status=?')
      params.push(status)
    }
    const ids = (
      db.prepare(`SELECT id FROM aux_items WHERE ${conditions.join(' AND ')}`).all(...params) as Array<{
        id: string
      }>
    ).map(r => r.id)

    if (ids.length === 0) {
      report(1, 1, 0, 0)
      return {
        message: '没有可删除的项目',
        result: { successCount: 0, failCount: 0, failedItems: [] },
      }
    }

    const deleteStmt = db.prepare('DELETE FROM aux_items WHERE id=?')
    let success = 0
    let failed = 0
    const errors: Array<{
      id: string
      label: string
      error: string
      block?: ReturnType<typeof getAuxItemDeleteBlockReason>
    }> = []
    const total = ids.length
    const throttledReport = createThrottledReporter(report, total)
    throttledReport(0, 0, 0, true)

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const check = getAuxItemDeleteBlockReason(db, accountSetId, id)
      const label = check.item
        ? formatAuxItemDisplayLabel(check.item)
        : getAuxItemDisplayLabelById(db, id)
      if (check.blocked) {
        failed++
        if (errors.length < 100) {
          errors.push({ id, label, error: check.message || '无法删除', block: check })
        }
      } else {
        try {
          deleteStmt.run(id)
          success++
        } catch (error: any) {
          failed++
          if (errors.length < 100) {
            errors.push({ id, label, error: error.message || '删除失败' })
          }
        }
      }
      throttledReport(i + 1, success, failed)
      if (shouldYieldEventLoop(i + 1)) {
        await yieldEventLoop()
      }
    }
    throttledReport(total, success, failed, true)

    return {
      message: `批量删除完成：成功 ${success} 个，跳过 ${failed} 个`,
      result: { successCount: success, failCount: failed, failedItems: errors.slice(0, 10) },
    }
  })
}

export function batchAuxItemsDeleteAsync(db: Database, accountSetId: string, ids: string[]) {
  return runProgressTask('aux-items-delete', accountSetId, async (_taskId, report) => {
    const deleteStmt = db.prepare('DELETE FROM aux_items WHERE id=?')
    let success = 0
    let failed = 0
    const errors: Array<{
      id: string
      label: string
      error: string
      block?: ReturnType<typeof getAuxItemDeleteBlockReason>
    }> = []
    const total = ids.length
    const throttledReport = createThrottledReporter(report, total)
    throttledReport(0, 0, 0, true)

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const check = getAuxItemDeleteBlockReason(db, accountSetId, id)
      const label = check.item
        ? formatAuxItemDisplayLabel(check.item)
        : getAuxItemDisplayLabelById(db, id)
      if (check.blocked) {
        failed++
        if (errors.length < 100) {
          errors.push({ id, label, error: check.message || '无法删除', block: check })
        }
      } else {
        try {
          deleteStmt.run(id)
          success++
        } catch (error: any) {
          failed++
          if (errors.length < 100) {
            errors.push({ id, label, error: error.message || '删除失败' })
          }
        }
      }
      throttledReport(i + 1, success, failed)
      if (shouldYieldEventLoop(i + 1)) {
        await yieldEventLoop()
      }
    }
    throttledReport(total, success, failed, true)

    return {
      message: `批量删除完成：成功 ${success} 个，跳过 ${failed} 个`,
      result: { successCount: success, failCount: failed, failedItems: errors.slice(0, 10) },
    }
  })
}

export function batchAuxItemsImportAsync(
  db: Database,
  accountSetId: string,
  type: string,
  items: Array<Record<string, unknown>>
) {
  return runProgressTask('aux-items-import', accountSetId, async (_taskId, report) => {
    const category = db.prepare('SELECT * FROM aux_categories WHERE id=?').get(type) as
      | { id: string }
      | undefined
    if (!category) {
      throw new Error('项目类别不存在')
    }

    const fields = db
      .prepare('SELECT * FROM aux_category_fields WHERE category_id=? AND is_enabled=1')
      .all(type) as Array<{ field_key: string; field_name: string; required_in_archive: number }>

    const existsCheck = createAuxItemExistsCheckers(db, accountSetId, type)
    const batchCodes = new Set<string>()
    const batchNames = new Set<string>()

    const insertStmt = db.prepare(
      'INSERT INTO aux_items (id, account_set_id, type, code, name, remark, field_values, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )

    let success = 0
    let failed = 0
    const errors: Array<{ id: string; label: string; error: string }> = []
    const total = items.length
    const throttledReport = createThrottledReporter(report, total)
    throttledReport(0, 0, 0, true)

    const pendingInserts: Array<{
      index: number
      code: string
      name: string
      rowLabel: string
      remark: string
      fieldValuesJson: string
      status: string
    }> = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const code = normalizeImportCode(String(item.code || ''))
      const name = normalizeImportText(String(item.name || ''))
      const rowLabel = code
        ? formatAuxItemDisplayLabel({ code, name })
        : formatRowLabel(i + 1)
      try {
        if (!code || !name) {
          throw new Error('编码和名称不能为空')
        }
        const normalizedName = name
        if (existsCheck.codeExists(code) || batchCodes.has(code)) {
          throw new Error('项目编码已存在')
        }
        if (existsCheck.nameExists(normalizedName) || batchNames.has(normalizedName)) {
          throw new Error('项目名称已存在')
        }
        const fieldValues = (item.field_values as Record<string, unknown>) || {}
        for (const field of fields) {
          if (field.required_in_archive && !fieldValues[field.field_key]) {
            throw new Error(`字段「${field.field_name}」为必填项`)
          }
        }
        pendingInserts.push({
          index: i,
          code,
          name: normalizedName,
          rowLabel,
          remark: String(item.remark || ''),
          fieldValuesJson: JSON.stringify(fieldValues),
          status: String(item.status || 'active'),
        })
        batchCodes.add(code)
        batchNames.add(normalizedName)
      } catch (error: any) {
        failed++
        if (errors.length < 100) {
          errors.push({
            id: code || `row-${i + 1}`,
            label: rowLabel,
            error: error.message || '导入失败',
          })
        }
      }
      throttledReport(i + 1, success, failed)
      if (shouldYieldEventLoop(i + 1)) {
        await yieldEventLoop()
      }
    }

    await runInDbTransactionChunks(
      db,
      pendingInserts,
      500,
      row => {
        try {
          insertStmt.run(
            uuidv4(),
            accountSetId,
            type,
            row.code,
            row.name,
            row.remark,
            row.fieldValuesJson,
            row.status
          )
          success++
        } catch (error: any) {
          failed++
          if (errors.length < 100) {
            errors.push({
              id: row.code || `row-${row.index + 1}`,
              label: row.rowLabel,
              error: error.message || '导入失败',
            })
          }
        }
      },
      {
        onChunkDone: (processed, chunkTotal) => {
          throttledReport(Math.min(items.length, processed), success, failed)
          if (processed < chunkTotal) {
            void yieldEventLoop()
          }
        },
      }
    )
    throttledReport(total, success, failed, true)

    return {
      message: `批量导入完成：成功 ${success} 个，失败 ${failed} 个`,
      result: { successCount: success, failCount: failed, errors: errors.slice(0, 10) },
    }
  })
}

export function batchAccountsImportAsync(
  db: Database,
  accountSetId: string,
  accounts: Array<Record<string, unknown>>
) {
  return runProgressTask('accounts-import', accountSetId, async (_taskId, report) => {
    const service = new AccountService(db)
    const lookupParent = createAccountParentLookup(db, accountSetId)
    const importedByCode = new Map<string, { id: string; code: string; name: string; level: number; direction: string }>()

    const findParentId = (parentCode: string | null | undefined): string | null => {
      if (!parentCode) return null
      const fromBatch = importedByCode.get(parentCode)
      if (fromBatch) return fromBatch.id
      const fromDb = lookupParent(parentCode)
      return fromDb?.id || null
    }

    let success = 0
    let failed = 0
    const errors: Array<{ id: string; label: string; error: string }> = []
    const total = accounts.length
    const throttledReport = createThrottledReporter(report, total)
    throttledReport(0, 0, 0, true)

    for (let i = 0; i < accounts.length; i++) {
      const item = accounts[i]
      const code = String(item.code || '')
      const name = String(item.name || '')
      const rowLabel = code
        ? formatAccountDisplayLabel({ code, name })
        : formatRowLabel(i + 1)
      try {
        if (!code || !name || !item.direction) {
          throw new Error('编码、名称、方向不能为空')
        }
        if (service.isCodeExists(accountSetId, code)) {
          throw new Error('科目编码已存在')
        }
        if (importedByCode.has(code)) {
          throw new Error('科目编码在本批次中重复')
        }
        const parentCode = item.parent_code as string | undefined
        const parentId = findParentId(parentCode)
        if (parentCode && !parentId) {
          throw new Error(`未找到上级科目编码「${parentCode}」`)
        }
        const parentFromBatch = parentCode ? importedByCode.get(parentCode) : undefined
        const parentFromDb = parentId && !parentFromBatch ? lookupParent(parentCode) : undefined
        const parentLevel = parentFromBatch?.level ?? parentFromDb?.level
        const level = parentLevel != null ? parentLevel + 1 : 1
        const id = service.createAccount({
          account_set_id: accountSetId,
          code,
          name,
          direction: String(item.direction),
          level,
          parent_id: parentId,
          is_aux: Boolean(item.is_aux),
          aux_types: (item.aux_types as Record<string, string> | null) || null,
          is_enabled: item.is_enabled !== undefined ? Boolean(item.is_enabled) : true,
          is_cash: Boolean(item.is_cash),
          is_bank: Boolean(item.is_bank),
          no_negative: Boolean(item.no_negative),
        })
        importedByCode.set(code, { id, code, name, level, direction: String(item.direction) })
        success++
      } catch (error: any) {
        failed++
        if (errors.length < 100) {
          errors.push({
            id: code || `row-${i + 1}`,
            label: rowLabel,
            error: error.message || '导入失败',
          })
        }
      }
      throttledReport(i + 1, success, failed)
      if (shouldYieldEventLoop(i + 1)) {
        await yieldEventLoop()
      }
    }
    throttledReport(total, success, failed, true)

    return {
      message: `批量导入完成：成功 ${success} 条，失败 ${failed} 条`,
      result: { successCount: success, failCount: failed, errors: errors.slice(0, 10) },
    }
  })
}

export function batchInitBalanceAuxSaveAsync(
  db: Database,
  accountSetId: string,
  accountId: string,
  year: number,
  lines: InitBalanceAuxLineInput[],
  period = 1
) {
  assertInitBalanceAuxEditable(db, accountSetId, year)
  return runProgressTask('aux-init-save', accountSetId, async (_taskId, report) => {
    const total = lines.length
    const throttledReport = createThrottledReporter(report, total)
    throttledReport(0, 0, 0, true)
    await yieldEventLoop()

    try {
      const summary = saveInitBalanceAuxDetails(
        db,
        accountSetId,
        accountId,
        year,
        lines,
        period,
        {
          onBuildProgress: processed => {
            throttledReport(processed, processed, 0)
          },
        }
      )
      throttledReport(total, total, 0, true)
      return {
        message: '辅助期初保存成功',
        result: { summary, success: total, failed: 0 },
      }
    } catch (error: any) {
      throttledReport(total, 0, 0, 1, true)
      throw error
    }
  })
}
