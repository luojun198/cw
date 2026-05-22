import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import { buildBatchVoucherQuery } from './voucherQuery.js'
import { yuanToCents } from '../utils/amountUtils.js'
import {
  accountHasAuxAccounting,
  extractEntryAuxSelections,
  parseAccountAuxCategoryIds,
} from '../utils/auxItemId.js'
import { AUX_LEGACY_COLUMNS } from '../utils/auxLedgerQuery.js'
import {
  getAccountRealtimeBalance,
  getAccountRealtimeAuxBalance,
} from './accountRealtimeBalance.js'

export interface VoucherEntryInput {
  account_id: string
  account_code: string
  account_name: string
  direction: 'debit' | 'credit'
  amount: number
  summary?: string
  cash_flow_code?: string | null
  cash_flow_name?: string | null
  dept_id?: string | null
  dept_name?: string | null
  project_id?: string | null
  project_name?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  person_id?: string | null
  person_name?: string | null
  func_class_id?: string | null
  func_class_name?: string | null
  [key: string]: unknown
}

/** 分录 INSERT 列数（须与 buildVoucherEntryPayloads 返回值长度一致） */
export const VOUCHER_ENTRY_INSERT_PARAM_COUNT = 24

export const VOUCHER_ENTRY_INSERT_SQL = `
  INSERT INTO voucher_entries (
    id, account_set_id, voucher_id, seq, account_id, account_code, account_name,
    direction, amount, amount_cents, summary,
    dept_id, dept_name, project_id, project_name,
    supplier_id, supplier_name, person_id, person_name,
    func_class_id, func_class_name, aux_data,
    cash_flow_code, cash_flow_name
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export interface AuxCategoryLike {
  id: string
  code: string
}

export interface AuxItemLike {
  id: string
  name?: string | null
}

export function validateVoucherEntryCount(entries: unknown) {
  if (!Array.isArray(entries) || entries.length < 2) {
    return '凭证日期和分录不能为空'
  }
  return null
}

export function getVoucherBalanceError(entries: VoucherEntryInput[]) {
  const { debitTotal, creditTotal } = calculateVoucherTotals(entries)
  if (Math.abs(debitTotal - creditTotal) > 0.001) {
    return `借贷不平衡: 借方${debitTotal} != 贷方${creditTotal}`
  }
  return null
}

export function getVoucherUpdateBalanceError(entries: VoucherEntryInput[]) {
  if (!isVoucherBalanced(entries)) {
    return '借贷不平衡'
  }
  return null
}

export function calculateVoucherTotals(entries: VoucherEntryInput[]) {
  let debitTotal = 0
  let creditTotal = 0

  for (const entry of entries) {
    if (entry.direction === 'debit') debitTotal += entry.amount
    else creditTotal += entry.amount
  }

  return { debitTotal, creditTotal }
}

export function isVoucherBalanced(entries: VoucherEntryInput[]) {
  const { debitTotal, creditTotal } = calculateVoucherTotals(entries)
  return Math.abs(debitTotal - creditTotal) <= 0.001
}

function resolveCashFlowFields(
  db: Database,
  accountSetId: string,
  entry: VoucherEntryInput
): { code: string | null; name: string | null } {
  const code = (entry.cash_flow_code || '').trim() || null
  if (!code) return { code: null, name: null }
  const nameFromClient = (entry.cash_flow_name || '').trim()
  if (nameFromClient) return { code, name: nameFromClient }
  const row = db
    .prepare(
      `SELECT name FROM cash_flow_items WHERE account_set_id = ? AND code = ? AND is_active = 1 LIMIT 1`
    )
    .get(accountSetId, code) as { name?: string } | undefined
  return { code, name: row?.name || code }
}

export function buildVoucherEntryPayloads(params: {
  db?: Database
  accountSetId: string
  voucherId: string
  entries: VoucherEntryInput[]
  categories: AuxCategoryLike[]
  itemMap: Record<string, AuxItemLike>
}) {
  return params.entries.map((entry, index) => {
    const auxData: Record<string, { id: string; name: string; field_values?: Record<string, string> }> = {}
    for (const category of params.categories) {
      const dynamicFieldKey = `_${category.code}_id`
      const itemId = entry[dynamicFieldKey]
      if (typeof itemId === 'string' && itemId) {
        const item = params.itemMap[itemId]
        auxData[category.code] = { id: itemId, name: item?.name || '' }
        // 收集自定义字段值
        const fields = (category as any).fields || []
        const voucherFieldValues: Record<string, string> = {}
        for (const field of fields) {
          if (!field.show_in_voucher || field.is_enabled === 0) continue
          const fvKey = `_${category.code}_fv_${field.field_key}`
          const fvValue = entry[fvKey]
          if (fvValue !== undefined && fvValue !== null && fvValue !== '') {
            voucherFieldValues[field.field_key] = String(fvValue)
          }
        }
        if (Object.keys(voucherFieldValues).length > 0) {
          auxData[category.code].field_values = voucherFieldValues
        }
      }
    }

    const fixedFields: Record<string, string | null> = {}
    for (const category of params.categories) {
      const dynamicFieldKey = `_${category.code}_id`
      const fixedFieldKey = `${category.code}_id`
      const itemId = entry[dynamicFieldKey] || entry[fixedFieldKey]
      const legacy = AUX_LEGACY_COLUMNS[category.code]
      const storageIdKey = legacy?.id ?? fixedFieldKey
      const storageNameKey = legacy?.name ?? `${category.code}_name`
      if (typeof itemId === 'string' && itemId) {
        const item = params.itemMap[itemId]
        fixedFields[storageIdKey] = itemId
        fixedFields[storageNameKey] = item?.name || ''
      } else {
        fixedFields[storageIdKey] = null
        fixedFields[storageNameKey] = null
      }
    }

    const cashFlow =
      params.db != null
        ? resolveCashFlowFields(params.db, params.accountSetId, entry)
        : {
            code: (entry.cash_flow_code || '').trim() || null,
            name: (entry.cash_flow_name || '').trim() || null,
          }

    return [
      uuidv4(),
      params.accountSetId,
      params.voucherId,
      index + 1,
      entry.account_id,
      entry.account_code,
      entry.account_name,
      entry.direction,
      entry.amount,
      yuanToCents(entry.amount),
      entry.summary || null,
      fixedFields.dept_id || entry.dept_id || null,
      fixedFields.dept_name || entry.dept_name || null,
      fixedFields.project_id || entry.project_id || null,
      fixedFields.project_name || entry.project_name || null,
      fixedFields.supplier_id || entry.supplier_id || null,
      fixedFields.supplier_name || entry.supplier_name || null,
      fixedFields.person_id || entry.person_id || null,
      fixedFields.person_name || entry.person_name || null,
      fixedFields.func_class_id || entry.func_class_id || null,
      fixedFields.func_class_name || entry.func_class_name || null,
      Object.keys(auxData).length > 0 ? JSON.stringify(auxData) : null,
      cashFlow.code,
      cashFlow.name,
    ]
  })
}

export function isCashFlowEnabledForAccountSet(db: Database, accountSetId: string): boolean {
  const row = db
    .prepare(
      `SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = 'enable_cash_flow' LIMIT 1`
    )
    .get(accountSetId) as { param_value?: string } | undefined
  return row?.param_value === 'true'
}

export function accountRequiresCashFlowItem(account: {
  require_cash_flow?: number | null
  is_cash?: number | null
  is_bank?: number | null
} | null | undefined): boolean {
  if (!account) return false
  return Number(account.is_cash) === 1 || Number(account.is_bank) === 1
}

/** 启用现金流核算时，校验必填现金流量项目 */
export function validateVoucherEntriesCashFlow(
  db: Database,
  accountSetId: string,
  entries: VoucherEntryInput[]
): string | null {
  if (!isCashFlowEnabledForAccountSet(db, accountSetId)) return null

  const accountStmt = db.prepare(
    `SELECT name, require_cash_flow, is_cash, is_bank FROM accounts WHERE id = ? AND account_set_id = ?`
  )
  const cfStmt = db.prepare(
    `SELECT code FROM cash_flow_items WHERE account_set_id = ? AND code = ? AND is_active = 1 LIMIT 1`
  )

  for (const entry of entries) {
    if (!entry.account_id || !entry.amount) continue
    const account = accountStmt.get(entry.account_id, accountSetId) as {
      name: string
      require_cash_flow: number
      is_cash: number
      is_bank: number
    } | undefined
    if (!account) continue

    const code = (entry.cash_flow_code || '').trim()
    if (accountRequiresCashFlowItem(account) && !code) {
      return `科目【${account.name}】须指定现金流量项目`
    }
    if (code && !cfStmt.get(accountSetId, code)) {
      return `现金流量项目编码「${code}」不存在或已停用`
    }
  }
  return null
}

export interface AiConfigLike {
  enabled?: number | boolean | null
  api_key?: string | null
  api_url?: string | null
  model?: string | null
}

export interface AiSummaryEntryLike {
  account_name?: string | null
  direction?: string | null
  amount?: number | null
}

export function isAiSummaryEnabled(aiConfig: AiConfigLike | null | undefined) {
  return Boolean(aiConfig?.enabled && aiConfig?.api_key)
}

export function buildAiSummaryEntryText(entries: AiSummaryEntryLike[]) {
  return entries
    .map(entry => `${entry.account_name || ''}: ${entry.direction === 'debit' ? '借' : '贷'} ${entry.amount ?? ''}`)
    .join('\n')
}

export function buildAiSummaryRequestBody(params: {
  model?: string | null
  entryText: string
}) {
  return {
    model: params.model || 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: '你是一个财务助手，根据凭证分录生成简洁的中文业务摘要（10个字以内）。',
      },
      { role: 'user', content: `根据以下凭证分录生成摘要：\n${params.entryText}` },
    ],
    max_tokens: 50,
    temperature: 0.3,
  }
}

export function getAiSummaryApiUrl(aiConfig: AiConfigLike | null | undefined) {
  return aiConfig?.api_url || 'https://api.openai.com/v1/chat/completions'
}

export function extractAiSummary(data: any) {
  return data?.choices?.[0]?.message?.content?.trim() || '业务发生'
}

export function getEffectiveVoucherTypeId(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  year: number
  period: number
  voucherTypeId?: string | null
}) {
  if (params.voucherTypeId) {
    return params.voucherTypeId
  }

  const lastVoucher = params.db
    .prepare(
      `SELECT voucher_type_id
       FROM vouchers
       WHERE account_set_id=? AND year=? AND period=? AND voucher_type_id IS NOT NULL
       ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, voucher_date DESC, voucher_no DESC
       LIMIT 1`
    )
    .get(params.accountSetId, params.year, params.period) as any
  if (lastVoucher?.voucher_type_id) {
    return lastVoucher.voucher_type_id
  }

  const firstType = params.db
    .prepare(
      `SELECT id
       FROM voucher_types
       WHERE account_set_id=? OR account_set_id IS NULL
       ORDER BY
         CASE WHEN account_set_id=? THEN 0 ELSE 1 END,
         CASE WHEN code IS NOT NULL AND code != '' AND code NOT GLOB '*[^0-9]*' THEN 0 ELSE 1 END,
         CASE WHEN code IS NOT NULL AND code != '' AND code NOT GLOB '*[^0-9]*' THEN CAST(code AS INTEGER) END,
         code COLLATE NOCASE ASC,
         sort_order ASC
       LIMIT 1`
    )
    .get(params.accountSetId, params.accountSetId) as any
  return firstType?.id || null
}

export function buildVoucherNo(params: {
  year: number
  period: number
  maxNo?: number | null
  typeName?: string
}) {
  if (params.typeName) {
    // 取类型名称的第一个字作为简称，如"记账凭证"→"记"
    const shortName = params.typeName.charAt(0)
    return `${shortName}-${String((params.maxNo || 0) + 1).padStart(3, '0')}`
  }
  return `${params.year}${String(params.period).padStart(2, '0')}-${String((params.maxNo || 0) + 1).padStart(4, '0')}`
}

export function getNextVoucherNo(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  year: number
  period: number
  voucherTypeId?: string | null
}) {
  const effectiveTypeId = getEffectiveVoucherTypeId({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
    voucherTypeId: params.voucherTypeId,
  })

  // 获取凭证类型名称
  let typeName: string | null = null
  if (effectiveTypeId) {
    const type = params.db
      .prepare('SELECT name FROM voucher_types WHERE id=?')
      .get(effectiveTypeId) as any
    typeName = type?.name || null
  }

  // 提取序号：统一取横线后的数字部分（新旧格式均适用）
  // 注意：按年度+期间查询，避免跨期间编号重复
  const row = params.db
    .prepare(
      `SELECT MAX(
        CAST(
          CASE
            WHEN INSTR(voucher_no, '-') > 0
            THEN SUBSTR(voucher_no, INSTR(voucher_no, '-') + 1)
            ELSE voucher_no
          END
          AS INTEGER
        )
      ) as max_no
      FROM vouchers
      WHERE account_set_id=? AND year=? AND period=? 
        AND (voucher_type_id=? OR (voucher_type_id IS NULL AND ? IS NULL))`
    )
    .get(params.accountSetId, params.year, params.period, effectiveTypeId, effectiveTypeId) as any

  return {
    effectiveTypeId,
    typeName,
    voucherNo: buildVoucherNo({
      year: params.year,
      period: params.period,
      maxNo: row?.max_no,
      typeName: typeName || undefined,
    }),
  }
}

export function getVoucherWithTypeById(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  voucherId: string
}) {
  return params.db
    .prepare(
      'SELECT v.*, vt.name as voucher_type_name FROM vouchers v LEFT JOIN voucher_types vt ON v.voucher_type_id=vt.id WHERE v.id=?'
    )
    .get(params.voucherId) as any
}

export function getVoucherEntries(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  voucherId: string
}) {
  return params.db.prepare('SELECT * FROM voucher_entries WHERE voucher_id=? ORDER BY seq').all(params.voucherId) as any[]
}

export function getVoucherDetail(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] }
  }
  voucherId: string
}) {
  const voucher = getVoucherWithTypeById({
    db: params.db,
    voucherId: params.voucherId,
  })
  if (!voucher) {
    return null
  }

  return {
    ...(voucher as any),
    entries: getVoucherEntries({
      db: params.db,
      voucherId: params.voucherId,
    }),
  }
}

export function getVoucherById(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  voucherId: string
}) {
  return params.db.prepare('SELECT * FROM vouchers WHERE id=?').get(params.voucherId) as any
}

export function isPostedVoucher(voucher: { status?: string } | null | undefined) {
  return voucher?.status === 'posted'
}

export function replaceVoucherEntries(params: {
  db: Database
  accountSetId: string
  voucherId: string
  entries: VoucherEntryInput[]
  categories: AuxCategoryLike[]
  itemMap: Record<string, AuxItemLike>
}) {
  params.db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(params.voucherId)
  const insertEntry = params.db.prepare(VOUCHER_ENTRY_INSERT_SQL)
  const entryPayloads = buildVoucherEntryPayloads({
    db: params.db,
    accountSetId: params.accountSetId,
    voucherId: params.voucherId,
    entries: params.entries,
    categories: params.categories,
    itemMap: params.itemMap,
  })

  entryPayloads.forEach(payload => {
    insertEntry.run(...payload)
  })
}

export function buildVoucherEntriesMap(entries: Array<{ voucher_id: string } & Record<string, any>>) {
  const entriesMap: Record<string, any[]> = {}
  for (const entry of entries) {
    if (!entriesMap[entry.voucher_id]) entriesMap[entry.voucher_id] = []
    entriesMap[entry.voucher_id].push(entry)
  }
  return entriesMap
}

export function attachVoucherEntries<T extends { id: string }>(vouchers: T[], entriesMap: Record<string, any[]>) {
  return vouchers.map(voucher => ({
    ...voucher,
    entries: entriesMap[voucher.id] || [],
  }))
}

export function calculateNewBalance(params: {
  currentBalance: number
  amount: number
  entryDirection: 'debit' | 'credit'
  accountDirection?: string | null
}) {
  const isSameDirection = params.accountDirection === params.entryDirection
  return params.currentBalance + (isSameDirection ? params.amount : -params.amount)
}

export interface NoNegativeAccountLike {
  id?: string
  no_negative?: number
  direction?: string | null
  parent_id?: string | null
  name?: string | null
}

export interface NoNegativeAuxCategoryLike {
  id: string
  code: string
  name?: string
}

export interface NoNegativeBalanceViolation {
  accountName: string
  auxCategoryName?: string
  auxItemName?: string
  projectedBalance: number
  /** 受上级科目约束时，上级科目名称 */
  constraintAccountName?: string
}

export interface NoNegativeBalanceCheckResult {
  message: string
  violations: NoNegativeBalanceViolation[]
}

export function buildNoNegativeBalanceSummaryMessage(
  violations: NoNegativeBalanceViolation[]
): string {
  if (violations.length === 0) return ''
  if (violations.length === 1) {
    const v = violations[0]
    const auxPart =
      v.auxCategoryName && v.auxItemName
        ? `核算项目【${v.auxCategoryName}：${v.auxItemName}】`
        : ''
    const hint = v.constraintAccountName
      ? `（受上级科目【${v.constraintAccountName}】约束）`
      : ''
    return `科目【${v.accountName}】${auxPart}${hint}余额不允许为负数，保存后余额将为 ${v.projectedBalance.toFixed(2)}`
  }
  return `共 ${violations.length} 项核算余额保存后将变为负数，无法保存凭证`
}

export function createRealtimeNoNegativeBalanceGetters(
  db: Database,
  params: {
    accountSetId: string
    year: number
    period: number
    categories: NoNegativeAuxCategoryLike[]
    excludeVoucherId?: string
  }
) {
  const categoryCodeById = new Map(params.categories.map(c => [c.id, c.code]))
  const categoryNameByCode = new Map(
    params.categories.map(c => [c.code, c.name?.trim() || c.code])
  )
  const itemNameStmt = db.prepare(
    'SELECT name FROM aux_items WHERE id=? AND account_set_id=?'
  )

  return {
    getBalanceByAccountId(accountId: string) {
      const row = getAccountRealtimeBalance(db, {
        accountId,
        accountSetId: params.accountSetId,
        year: params.year,
        period: params.period,
        excludeVoucherId: params.excludeVoucherId,
      })
      return row?.end_balance ?? 0
    },
    getAuxBalanceByCategory(accountId: string, categoryCode: string, itemId: string) {
      const acc = db.prepare('SELECT direction FROM accounts WHERE id=?').get(accountId) as
        | { direction: 'debit' | 'credit' }
        | undefined
      if (!acc) return 0
      const row = getAccountRealtimeAuxBalance(db, {
        accountId,
        accountSetId: params.accountSetId,
        year: params.year,
        period: params.period,
        categoryCode,
        itemId,
        accountDirection: acc.direction,
        excludeVoucherId: params.excludeVoucherId,
      })
      return row.end_balance
    },
    getAuxCategoryName(categoryCode: string) {
      return categoryNameByCode.get(categoryCode) || categoryCode
    },
    getAuxItemName(_categoryCode: string, itemId: string) {
      const row = itemNameStmt.get(itemId, params.accountSetId) as { name: string } | undefined
      return row?.name?.trim() || itemId
    },
    getEnabledCategoryCodesForAccount(account: { aux_types?: unknown }) {
      const enabledIds = parseAccountAuxCategoryIds(account.aux_types)
      return enabledIds
        .map(id => categoryCodeById.get(id))
        .filter((code): code is string => Boolean(code))
    },
  }
}

export function validateVoucherEntriesNoNegativeBalance(params: {
  entries: VoucherEntryInput[]
  getAccountById: (accountId: string) => NoNegativeAccountLike | null | undefined
  getBalanceByAccountId: (accountId: string) => number
  /** 按辅助类目 + 项目取实时余额（期初 + 全部凭证，与录入页展示一致） */
  getAuxBalanceByCategory?: (accountId: string, categoryCode: string, itemId: string) => number
  getAuxCategoryName?: (categoryCode: string) => string
  getAuxItemName?: (categoryCode: string, itemId: string) => string
  getEnabledCategoryCodesForAccount?: (account: NoNegativeAccountLike & { aux_types?: unknown }) => string[]
}): NoNegativeBalanceCheckResult | null {
  // 缓存"约束源"：科目自身或最近的祖先中 no_negative=1 的科目；找不到返回 null
  const constraintCache = new Map<string, NoNegativeAccountLike | null>()
  function findConstraintSource(accountId: string): NoNegativeAccountLike | null {
    if (constraintCache.has(accountId)) return constraintCache.get(accountId) || null
    const visitedIds: string[] = []
    let cur: NoNegativeAccountLike | null | undefined = params.getAccountById(accountId)
    let found: NoNegativeAccountLike | null = null
    const seen = new Set<string>()
    while (cur) {
      const cid = cur.id || ''
      if (cid) {
        if (seen.has(cid)) break // 防环
        seen.add(cid)
        visitedIds.push(cid)
      }
      if (cur.no_negative === 1) {
        found = cur
        break
      }
      if (!cur.parent_id) break
      cur = params.getAccountById(cur.parent_id)
    }
    for (const vid of visitedIds) {
      if (!constraintCache.has(vid)) constraintCache.set(vid, found)
    }
    return found
  }

  type AccBucket = {
    account: NoNegativeAccountLike
    entryName: string
    balance: number
    constraint: NoNegativeAccountLike
  }
  type AuxBucket = AccBucket & { auxCategoryName: string; auxItemName: string }

  const balanceByAccount = new Map<string, AccBucket>()
  const balanceByAux = new Map<string, AuxBucket>()

  for (const entry of params.entries) {
    const account = params.getAccountById(entry.account_id)
    if (!account) continue
    const constraint = findConstraintSource(entry.account_id)
    if (!constraint) continue

    const useAuxDimension =
      accountHasAuxAccounting(account as any) &&
      params.getAuxBalanceByCategory &&
      params.getEnabledCategoryCodesForAccount

    if (useAuxDimension) {
      const categoryCodes = params.getEnabledCategoryCodesForAccount!(account as any)
      const selections = extractEntryAuxSelections(entry, categoryCodes)
      for (const sel of selections) {
        const auxKey = `${entry.account_id}|${sel.categoryCode}|${sel.itemId}`
        const auxCategoryName =
          params.getAuxCategoryName?.(sel.categoryCode) || sel.categoryCode
        const auxItemName =
          params.getAuxItemName?.(sel.categoryCode, sel.itemId) || sel.itemId
        if (!balanceByAux.has(auxKey)) {
          balanceByAux.set(auxKey, {
            account,
            entryName: entry.account_name,
            auxCategoryName,
            auxItemName,
            constraint,
            balance: params.getAuxBalanceByCategory!(
              entry.account_id,
              sel.categoryCode,
              sel.itemId
            ),
          })
        }
        const auxBucket = balanceByAux.get(auxKey)!
        auxBucket.balance = calculateNewBalance({
          currentBalance: auxBucket.balance,
          amount: entry.amount,
          entryDirection: entry.direction,
          accountDirection: account.direction,
        })
      }
      continue
    }

    // 未启用辅助核算：按科目总余额校验
    if (!balanceByAccount.has(entry.account_id)) {
      balanceByAccount.set(entry.account_id, {
        account,
        entryName: entry.account_name,
        constraint,
        balance: params.getBalanceByAccountId(entry.account_id),
      })
    }
    const acctBucket = balanceByAccount.get(entry.account_id)!
    acctBucket.balance = calculateNewBalance({
      currentBalance: acctBucket.balance,
      amount: entry.amount,
      entryDirection: entry.direction,
      accountDirection: account.direction,
    })
  }

  function getConstraintAccountName(
    constraint: NoNegativeAccountLike,
    accountId?: string
  ): string | undefined {
    if (constraint?.id && accountId && constraint.id !== accountId) {
      return constraint.name || undefined
    }
    return undefined
  }

  const violations: NoNegativeBalanceViolation[] = []

  for (const { entryName, balance, constraint, account } of balanceByAccount.values()) {
    if (balance < -0.005) {
      violations.push({
        accountName: entryName,
        projectedBalance: balance,
        constraintAccountName: getConstraintAccountName(constraint, account.id),
      })
    }
  }

  for (const {
    entryName,
    auxCategoryName,
    auxItemName,
    balance,
    constraint,
    account,
  } of balanceByAux.values()) {
    if (balance < -0.005) {
      violations.push({
        accountName: entryName,
        auxCategoryName,
        auxItemName,
        projectedBalance: balance,
        constraintAccountName: getConstraintAccountName(constraint, account.id),
      })
    }
  }

  if (violations.length === 0) return null

  violations.sort((a, b) => {
    const accountCmp = a.accountName.localeCompare(b.accountName, 'zh-CN')
    if (accountCmp !== 0) return accountCmp
    const catCmp = (a.auxCategoryName || '').localeCompare(b.auxCategoryName || '', 'zh-CN')
    if (catCmp !== 0) return catCmp
    return (a.auxItemName || '').localeCompare(b.auxItemName || '', 'zh-CN')
  })

  return {
    message: buildNoNegativeBalanceSummaryMessage(violations),
    violations,
  }
}

export function buildAuxItemMap(items: AuxItemLike[]) {
  const itemMap: Record<string, AuxItemLike> = {}
  for (const item of items) {
    itemMap[item.id] = item
  }
  return itemMap
}

export function loadVoucherAuxiliaryData(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
}) {
  const categories = params.db
    .prepare('SELECT id, code, name FROM aux_categories WHERE account_set_id=?')
    .all(params.accountSetId) as AuxCategoryLike[]
  // 为每个类别加载字段配置
  const fieldsStmt = params.db.prepare('SELECT * FROM aux_category_fields WHERE category_id=? AND is_enabled=1 ORDER BY sort_order')
  for (const cat of categories) {
    (cat as any).fields = fieldsStmt.all(cat.id)
  }
  const items = params.db
    .prepare('SELECT id, type, name FROM aux_items WHERE account_set_id=?')
    .all(params.accountSetId) as AuxItemLike[]

  return {
    categories,
    itemMap: buildAuxItemMap(items),
  }
}

export function getPeriodClosingRecord(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  year: string | number
  period: string | number
}) {
  return params.db
    .prepare(`SELECT * FROM period_closing WHERE account_set_id=? AND year=? AND period=?`)
    .get(params.accountSetId, params.year, params.period) as any
}

export function isPeriodClosed(record: { status?: string } | null | undefined) {
  return record?.status === 'closed'
}

export function closePeriod(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  id: string
  accountSetId: string
  year: string | number
  period: string | number
  userId?: string | null
}) {
  params.db
    .prepare(
      `INSERT OR REPLACE INTO period_closing (id, account_set_id, year, period, status, closed_by, closed_at) VALUES (?, ?, ?, ?, 'closed', ?, datetime('now'))`
    )
    .run(params.id, params.accountSetId, params.year, params.period, params.userId)
}

export function openPeriod(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  accountSetId: string
  year: string | number
  period: string | number
}) {
  params.db
    .prepare(`UPDATE period_closing SET status='open' WHERE account_set_id=? AND year=? AND period=?`)
    .run(params.accountSetId, params.year, params.period)
}

export function listPeriodClosingStatus(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
  year: string | number
}) {
  return params.db
    .prepare(`SELECT * FROM period_closing WHERE account_set_id=? AND year=? ORDER BY period`)
    .all(params.accountSetId, params.year) as any[]
}

export function validateVoucherForAudit(
  voucher: { status?: string; maker_id?: string | null } | null | undefined,
  userId?: string | null
) {
  if (!voucher) {
    return '凭证不存在'
  }
  if (voucher.status !== 'draft') {
    return '只能审核草稿状态的凭证'
  }
  if (voucher.maker_id === userId) {
    return '制单人和审核人不能为同一人'
  }
  return null
}

export function applyVoucherAudit(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  voucherId: string
  userId?: string | null
  userName?: string | null
}) {
  params.db
    .prepare("UPDATE vouchers SET status=?, auditor_id=?, auditor_name=?, updated_at=datetime('now') WHERE id=?")
    .run('audited', params.userId, params.userName, params.voucherId)
}

export function validateVoucherForUnAudit(voucher: { status?: string } | null | undefined) {
  if (voucher?.status === 'posted') {
    return '已记账凭证无法反审核'
  }
  return null
}

export function applyVoucherUnAudit(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  voucherId: string
}) {
  params.db
    .prepare("UPDATE vouchers SET status=?, auditor_id=NULL, auditor_name=NULL, updated_at=datetime('now') WHERE id=?")
    .run('draft', params.voucherId)
}

export function getBatchVoucherQuery(params: {
  accountSetId: string
  voucherTypeIds: string[]
  startDate?: string
  endDate?: string
  startNo?: string
  endNo?: string
}) {
  return buildBatchVoucherQuery({
    voucherTypeIds: params.voucherTypeIds,
    accountSetId: params.accountSetId,
    startDate: params.startDate || '',
    endDate: params.endDate || '',
    startNo: params.startNo,
    endNo: params.endNo,
  })
}

export function loadBatchDraftVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
  filters: {
    voucherTypeIds: string[]
    startDate?: string
    endDate?: string
    startNo?: string
    endNo?: string
  }
}) {
  const query = getBatchVoucherQuery({
    accountSetId: params.accountSetId,
    voucherTypeIds: params.filters.voucherTypeIds,
    startDate: params.filters.startDate,
    endDate: params.filters.endDate,
    startNo: params.filters.startNo,
    endNo: params.filters.endNo,
  })
  return getBatchDraftVouchers({
    db: params.db,
    sql: query.sql,
    params: query.params,
  })
}

export function loadBatchFilteredVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
  filters: {
    voucherTypeIds: string[]
    startDate?: string
    endDate?: string
    startNo?: string
    endNo?: string
  }
}) {
  const query = getBatchVoucherQuery({
    accountSetId: params.accountSetId,
    voucherTypeIds: params.filters.voucherTypeIds,
    startDate: params.filters.startDate,
    endDate: params.filters.endDate,
    startNo: params.filters.startNo,
    endNo: params.filters.endNo,
  })
  return loadBatchVouchers({
    db: params.db,
    query,
  })
}

export function getBatchVoucherFilters(body: {
  voucher_type_ids?: string[]
  start_date?: string
  end_date?: string
  start_no?: string
  end_no?: string
}) {
  return {
    voucherTypeIds: Array.isArray(body.voucher_type_ids) ? body.voucher_type_ids : [],
    startDate: body.start_date,
    endDate: body.end_date,
    startNo: body.start_no,
    endNo: body.end_no,
  }
}

export function validateBatchVoucherFilters(filters: {
  voucherTypeIds: string[]
  startDate?: string
  endDate?: string
}) {
  return Boolean(filters.startDate && filters.endDate && filters.voucherTypeIds.length > 0)
}

export function loadBatchVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  query: {
    sql: string
    params: any[]
  }
}) {
  return params.db.prepare(params.query.sql).all(...params.query.params) as any[]
}

export function getBatchDraftVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  sql: string
  params: any[]
}) {
  return (params.db.prepare(params.sql).all(...params.params) as any[]).filter(
    voucher => voucher.status === 'draft'
  )
}

export function findSelfMadeVoucher(
  vouchers: Array<{ maker_id?: string | null; voucher_no?: string | null }>,
  userId?: string | null
) {
  return vouchers.find(v => v.maker_id === userId)
}

export function buildBatchAuditPreviewData(
  vouchers: Array<{ maker_id?: string | null; voucher_no?: string | null }>,
  userId?: string | null
) {
  const selfMadeVoucher = findSelfMadeVoucher(vouchers, userId)
  return {
    count: vouchers.length,
    blocked: Boolean(selfMadeVoucher),
    blockedVoucherNo: selfMadeVoucher?.voucher_no || null,
    firstVoucherNo: vouchers[0]?.voucher_no || null,
    lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
  }
}

export function auditBatchVouchers(params: {
  db: Database
  vouchers: Array<{ id: string }>
  userId?: string | null
  userName?: string | null
}) {
  const auditBatch = params.db.transaction(() => {
    for (const voucher of params.vouchers) {
      params.db
        .prepare("UPDATE vouchers SET status=?, auditor_id=?, auditor_name=?, updated_at=datetime('now') WHERE id=?")
        .run('audited', params.userId, params.userName, voucher.id)
    }
  })
  auditBatch()
}

export function findPostedVoucher(vouchers: Array<{ status?: string; voucher_no?: string | null }>) {
  return vouchers.find(v => v.status === 'posted')
}

export function buildBatchDeletePreviewData(vouchers: Array<{ status?: string; voucher_no?: string | null }>) {
  const postedVoucher = findPostedVoucher(vouchers)
  return {
    count: vouchers.length,
    blocked: Boolean(postedVoucher),
    blockedVoucherNo: postedVoucher?.voucher_no || null,
    firstVoucherNo: vouchers[0]?.voucher_no || null,
    lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
  }
}

export function deleteBatchVouchers(params: {
  db: Database
  vouchers: Array<{ id: string }>
}) {
  const removeBatch = params.db.transaction(() => {
    for (const voucher of params.vouchers) {
      deleteVoucherRecords(params.db, voucher.id)
    }
  })
  removeBatch()
}

export function deleteVoucherRecords(db: Database, voucherId: string) {
  // 获取凭证信息
  const voucher = db.prepare('SELECT * FROM vouchers WHERE id=?').get(voucherId) as any
  if (!voucher) {
    return // 凭证不存在，直接返回
  }

  // 如果是已记账凭证，不允许直接删除
  if (voucher.status === 'posted') {
    throw new Error('已记账凭证不能删除，请先反记账')
  }

  const transaction = db.transaction(() => {
    // 删除凭证附件
    db.prepare('DELETE FROM voucher_attachments WHERE voucher_id=?').run(voucherId)
    // 删除关联的自动结转运行记录
    db.prepare('DELETE FROM auto_transfer_runs WHERE voucher_id=?').run(voucherId)
    // 删除凭证分录
    db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(voucherId)
    // 删除凭证主表
    db.prepare('DELETE FROM vouchers WHERE id=?').run(voucherId)
  })

  transaction()
}
