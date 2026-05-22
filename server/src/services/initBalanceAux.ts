import { v4 as uuidv4 } from 'uuid'
import {
  accountHasAuxAccounting,
  buildSingleCategoryAuxItemId,
  parseAccountAuxCategoryIds,
  parseAuxItemIdParts,
  resolveSingleCategorySelection,
} from '../utils/auxItemId.js'
import { assertOpeningDebitCreditExclusive } from '../utils/initBalanceOpening.js'

export interface InitBalanceAuxLineInput {
  selection: Record<string, string>
  /** 多辅助类目分标签录入时，标明当前行所属类目 */
  active_category_id?: string
  opening_debit?: number
  opening_credit?: number
  pre_book_debit?: number
  pre_book_credit?: number
}

export interface InitBalanceAuxLineRow {
  aux_item_id: string
  selection: Record<string, string>
  selection_labels: Record<string, string>
  opening_debit: number
  opening_credit: number
  pre_book_debit: number
  pre_book_credit: number
  init_debit: number
  init_credit: number
  init_balance: number
}

function normalizeAmount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function calcInitBalanceFromAmounts(
  direction: string,
  openingDebit: number,
  openingCredit: number,
  preBookDebit: number,
  preBookCredit: number
) {
  const initDebit = openingDebit + preBookDebit
  const initCredit = openingCredit + preBookCredit
  const initBalance =
    direction === 'credit' ? initCredit - initDebit : initDebit - initCredit
  return { initDebit, initCredit, initBalance }
}

function loadCategoryMaps(db: any, accountSetId: string) {
  const categories = db
    .prepare(
      `SELECT id, code, name FROM aux_categories WHERE account_set_id=? ORDER BY sort_order, code`
    )
    .all(accountSetId) as Array<{ id: string; code: string; name: string }>

  const codeById = new Map(categories.map(c => [c.id, c.code]))
  const nameById = new Map(categories.map(c => [c.id, c.name]))
  const idByCode = new Map(categories.map(c => [c.code, c.id]))

  return { categories, codeById, nameById, idByCode }
}

function parseFieldValues(raw: unknown): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v != null && String(v).trim() !== '') out[k] = String(v)
    }
    return out
  } catch {
    return {}
  }
}

function loadCategoryFields(db: any, categoryIds: string[]) {
  const map = new Map<string, Array<{ field_key: string; field_name: string }>>()
  if (categoryIds.length === 0) return map
  const placeholders = categoryIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT category_id, field_key, field_name FROM aux_category_fields
       WHERE category_id IN (${placeholders}) AND is_enabled=1
       ORDER BY sort_order, field_key`
    )
    .all(...categoryIds) as Array<{ category_id: string; field_key: string; field_name: string }>
  for (const row of rows) {
    if (!map.has(row.category_id)) map.set(row.category_id, [])
    map.get(row.category_id)!.push({ field_key: row.field_key, field_name: row.field_name })
  }
  return map
}

export type AuxItemForInitBalance = {
  id: string
  code: string
  name: string
  remark?: string
  field_values: Record<string, string>
}

function loadAuxItemsByCategory(db: any, accountSetId: string, categoryIds: string[]) {
  if (categoryIds.length === 0) return new Map<string, AuxItemForInitBalance[]>()
  const placeholders = categoryIds.map(() => '?').join(',')
  const items = db
    .prepare(
      `SELECT id, code, name, type, remark, field_values FROM aux_items
       WHERE account_set_id=? AND type IN (${placeholders}) AND status='active'
       ORDER BY code`
    )
    .all(accountSetId, ...categoryIds) as Array<{
    id: string
    code: string
    name: string
    type: string
    remark?: string
    field_values?: string
  }>

  const map = new Map<string, AuxItemForInitBalance[]>()
  for (const item of items) {
    if (!map.has(item.type)) map.set(item.type, [])
    map.get(item.type)!.push({
      id: item.id,
      code: item.code,
      name: item.name,
      remark: item.remark || '',
      field_values: parseFieldValues(item.field_values),
    })
  }
  return map
}

function resolveSelectionLabels(
  selection: Record<string, string>,
  codeById: Map<string, string>,
  nameById: Map<string, string>,
  itemsByCategory: Map<string, AuxItemForInitBalance[]>
): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const [catId, itemId] of Object.entries(selection)) {
    const catName = nameById.get(catId) || catId
    const item = itemsByCategory.get(catId)?.find(i => i.id === itemId)
    labels[catId] = item ? `${catName}:${item.name}` : catName
  }
  return labels
}

function selectionFromAuxItemId(
  auxItemId: string,
  enabledCategoryIds: string[],
  codeById: Map<string, string>,
  idByCode: Map<string, string>
): Record<string, string> {
  const parts = parseAuxItemIdParts(auxItemId)
  const selection: Record<string, string> = {}
  for (const catId of enabledCategoryIds) {
    const code = codeById.get(catId)
    if (code && parts[code]) {
      selection[catId] = parts[code]
    }
  }
  return selection
}

export function getInitBalanceAuxConfig(db: any, accountSetId: string) {
  const { categories, codeById, nameById } = loadCategoryMaps(db, accountSetId)

  const accounts = db
    .prepare(
      `SELECT a.id, a.code, a.name, a.direction, a.parent_id, a.is_aux, a.aux_types
       FROM accounts a
       WHERE a.account_set_id=? AND a.is_enabled=1
       ORDER BY a.code`
    )
    .all(accountSetId) as any[]

  const parentIds = new Set(
    accounts.filter((a: any) => a.parent_id).map((a: any) => a.parent_id)
  )

  const auxAccounts = accounts
    .filter((a: any) => !parentIds.has(a.id) && accountHasAuxAccounting(a))
    .map((a: any) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      direction: a.direction,
      aux_category_ids: parseAccountAuxCategoryIds(a.aux_types),
    }))

  return {
    categories: categories.map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
    })),
    aux_accounts: auxAccounts,
    code_by_category_id: Object.fromEntries(codeById),
    name_by_category_id: Object.fromEntries(nameById),
  }
}

export function getInitBalanceAuxDetails(
  db: any,
  accountSetId: string,
  accountId: string,
  year: number,
  period = 1
) {
  const account = db
    .prepare(`SELECT * FROM accounts WHERE id=? AND account_set_id=?`)
    .get(accountId, accountSetId) as any

  if (!account) {
    throw new Error('科目不存在')
  }
  if (!accountHasAuxAccounting(account)) {
    throw new Error('该科目未启用辅助核算')
  }

  const enabledCategoryIds = parseAccountAuxCategoryIds(account.aux_types)
  const { codeById, nameById, idByCode } = loadCategoryMaps(db, accountSetId)
  const itemsByCategory = loadAuxItemsByCategory(db, accountSetId, enabledCategoryIds)

  const rows = db
    .prepare(
      `SELECT * FROM init_balances
       WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id != ''`
    )
    .all(accountSetId, accountId, year, period) as any[]

  const lines: InitBalanceAuxLineRow[] = rows.map(row => {
    const selection = selectionFromAuxItemId(
      row.aux_item_id,
      enabledCategoryIds,
      codeById,
      idByCode
    )
    return {
      aux_item_id: row.aux_item_id,
      selection,
      selection_labels: resolveSelectionLabels(selection, codeById, nameById, itemsByCategory),
      opening_debit: row.opening_debit || 0,
      opening_credit: row.opening_credit || 0,
      pre_book_debit: row.pre_book_debit || 0,
      pre_book_credit: row.pre_book_credit || 0,
      init_debit: row.init_debit || 0,
      init_credit: row.init_credit || 0,
      init_balance: row.init_balance || 0,
    }
  })

  const items: Record<string, AuxItemForInitBalance[]> = {}
  for (const catId of enabledCategoryIds) {
    items[catId] = itemsByCategory.get(catId) || []
  }

  const categoryFieldsMap = loadCategoryFields(db, enabledCategoryIds)
  const category_fields: Record<string, Array<{ field_key: string; field_name: string }>> = {}
  for (const catId of enabledCategoryIds) {
    category_fields[catId] = categoryFieldsMap.get(catId) || []
  }

  const categories = enabledCategoryIds.map(catId => ({
    id: catId,
    code: codeById.get(catId) || '',
    name: nameById.get(catId) || '',
  }))

  const accountSet = db
    .prepare('SELECT start_date FROM account_sets WHERE id=?')
    .get(accountSetId) as { start_date?: string } | undefined
  const startDate = accountSet?.start_date ? new Date(accountSet.start_date) : null
  const startMonth = startDate ? startDate.getMonth() + 1 : 1
  const isMidYear = startMonth > 1

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      direction: account.direction,
      aux_category_ids: enabledCategoryIds,
    },
    categories,
    items,
    category_fields,
    code_by_category_id: Object.fromEntries(codeById),
    lines,
    isMidYear,
    startMonth,
  }
}

interface CategorySumBucket {
  opening_debit: number
  opening_credit: number
  pre_book_debit: number
  pre_book_credit: number
  hasAmount: boolean
}

function bucketHasAmount(b: CategorySumBucket) {
  return (
    b.hasAmount ||
    b.opening_debit !== 0 ||
    b.opening_credit !== 0 ||
    b.pre_book_debit !== 0 ||
    b.pre_book_credit !== 0
  )
}

function categoryInitBalanceFromBucket(direction: string, b: CategorySumBucket) {
  return calcInitBalanceFromAmounts(
    direction,
    b.opening_debit,
    b.opening_credit,
    b.pre_book_debit,
    b.pre_book_credit
  ).initBalance
}

/**
 * 4 个分项独立校验：期初借/期初贷/账前借/账前贷必须分别相等。
 * 不能只看 init_balance（净余额）—— 例如 类目 A: 期初借 100/账前贷 30 vs 类目 B: 期初借 0/账前借 100/账前贷 30
 * 净余额都是 70 但分项明显不一致。
 */
const AUX_BUCKET_AMOUNT_FIELDS: Array<{
  key: keyof CategorySumBucket
  label: string
}> = [
  { key: 'opening_debit', label: '期初借方' },
  { key: 'opening_credit', label: '期初贷方' },
  { key: 'pre_book_debit', label: '账前借方发生额' },
  { key: 'pre_book_credit', label: '账前贷方发生额' },
]

function amountsClose(a: CategorySumBucket, b: CategorySumBucket, eps = 0.02) {
  for (const { key } of AUX_BUCKET_AMOUNT_FIELDS) {
    const av = Number(a[key] || 0)
    const bv = Number(b[key] || 0)
    if (Math.abs(av - bv) >= eps) return false
  }
  return true
}

/** 返回 ref bucket 与目标 bucket 之间所有不一致的分项 */
function diffBucketFields(
  ref: CategorySumBucket,
  target: CategorySumBucket,
  eps = 0.02
): Array<{ key: keyof CategorySumBucket; label: string; refValue: number; targetValue: number }> {
  const diffs = []
  for (const { key, label } of AUX_BUCKET_AMOUNT_FIELDS) {
    const refValue = Number(ref[key] || 0)
    const targetValue = Number(target[key] || 0)
    if (Math.abs(refValue - targetValue) >= eps) {
      diffs.push({ key, label, refValue, targetValue })
    }
  }
  return diffs
}

export interface AuxCategoryBalanceSummary {
  category_id: string
  category_name: string
  opening_debit: number
  opening_credit: number
  pre_book_debit: number
  pre_book_credit: number
  init_balance: number
}

export interface InitBalanceAuxCategoryMismatch {
  account_id: string
  account_code: string
  account_name: string
  direction: string
  message: string
  categories: AuxCategoryBalanceSummary[]
  /** 不一致的分项字段：opening_debit/opening_credit/pre_book_debit/pre_book_credit */
  mismatched_fields: Array<{ key: string; label: string }>
}

function computeAccountAuxCategorySums(
  db: any,
  accountSetId: string,
  accountId: string,
  year: number,
  period: number
) {
  const account = db
    .prepare(`SELECT aux_types, direction FROM accounts WHERE id=? AND account_set_id=?`)
    .get(accountId, accountSetId) as { aux_types?: unknown; direction: string } | undefined
  if (!account) return null

  const enabledCategoryIds = parseAccountAuxCategoryIds(account.aux_types)
  if (enabledCategoryIds.length === 0) return null

  const { idByCode, nameById } = loadCategoryMaps(db, accountSetId)

  const detailRows = db
    .prepare(
      `SELECT aux_item_id, opening_debit, opening_credit, pre_book_debit, pre_book_credit
       FROM init_balances
       WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id != ''`
    )
    .all(accountSetId, accountId, year, period) as Array<{
    aux_item_id: string
    opening_debit: number
    opening_credit: number
    pre_book_debit: number
    pre_book_credit: number
  }>

  const sums = new Map<string, CategorySumBucket>()
  for (const catId of enabledCategoryIds) {
    sums.set(catId, {
      opening_debit: 0,
      opening_credit: 0,
      pre_book_debit: 0,
      pre_book_credit: 0,
      hasAmount: false,
    })
  }

  const addToCategory = (catId: string, row: (typeof detailRows)[0]) => {
    const b = sums.get(catId)
    if (!b) return
    const od = row.opening_debit || 0
    const oc = row.opening_credit || 0
    const pd = row.pre_book_debit || 0
    const pc = row.pre_book_credit || 0
    b.opening_debit += od
    b.opening_credit += oc
    b.pre_book_debit += pd
    b.pre_book_credit += pc
    if (od !== 0 || oc !== 0 || pd !== 0 || pc !== 0) b.hasAmount = true
  }

  for (const row of detailRows) {
    const parts = parseAuxItemIdParts(row.aux_item_id)
    const codes = Object.keys(parts)
    if (codes.length === 0) continue

    if (codes.length === 1) {
      const catId = idByCode.get(codes[0])
      if (catId) addToCategory(catId, row)
      continue
    }

    // 历史组合行：金额计入涉及的每个类目，便于分类目合计对齐
    for (const code of codes) {
      const catId = idByCode.get(code)
      if (catId) addToCategory(catId, row)
    }
  }

  return {
    enabledCategoryIds,
    sums,
    accountDirection: account.direction,
    nameById,
  }
}

function buildCategoryBalanceSummaries(
  direction: string,
  enabledCategoryIds: string[],
  sums: Map<string, CategorySumBucket>,
  nameById: Map<string, string>,
  onlyWithAmount = true
): AuxCategoryBalanceSummary[] {
  const ids = onlyWithAmount
    ? enabledCategoryIds.filter(id => bucketHasAmount(sums.get(id)!))
    : enabledCategoryIds
  return ids.map(catId => {
    const bucket = sums.get(catId)!
    return {
      category_id: catId,
      category_name: nameById.get(catId) || catId,
      opening_debit: bucket.opening_debit,
      opening_credit: bucket.opening_credit,
      pre_book_debit: bucket.pre_book_debit,
      pre_book_credit: bucket.pre_book_credit,
      init_balance: categoryInitBalanceFromBucket(direction, bucket),
    }
  })
}

function accountHasAnyCategoryAmount(
  enabledCategoryIds: string[],
  sums: Map<string, CategorySumBucket>
) {
  return enabledCategoryIds.some(id => bucketHasAmount(sums.get(id)!))
}

function isAccountAuxCategoryConsistent(
  enabledCategoryIds: string[],
  sums: Map<string, CategorySumBucket>
) {
  if (enabledCategoryIds.length <= 1) return true
  if (!accountHasAnyCategoryAmount(enabledCategoryIds, sums)) return true

  const ref = sums.get(enabledCategoryIds[0])!
  return enabledCategoryIds.slice(1).every(cid => amountsClose(ref, sums.get(cid)!))
}

/**
 * 找出所有"分项不一致"的字段（以第一个类目为基准）。
 * 用于错误消息：告诉用户具体哪个分项不一致、各类目的值。
 */
function collectMismatchedFields(
  enabledCategoryIds: string[],
  sums: Map<string, CategorySumBucket>
) {
  const mismatched: Array<{ key: keyof CategorySumBucket; label: string }> = []
  if (enabledCategoryIds.length <= 1) return mismatched
  const ref = sums.get(enabledCategoryIds[0])!
  const seen = new Set<string>()
  for (const cid of enabledCategoryIds.slice(1)) {
    const target = sums.get(cid)!
    for (const diff of diffBucketFields(ref, target)) {
      if (!seen.has(String(diff.key))) {
        seen.add(String(diff.key))
        mismatched.push({ key: diff.key, label: diff.label })
      }
    }
  }
  return mismatched
}

function buildAuxCategoryMismatchMessage(
  accountCode: string,
  accountName: string,
  categories: AuxCategoryBalanceSummary[],
  mismatchedFields: Array<{ key: keyof CategorySumBucket; label: string }>
) {
  // 如果只是 init_balance（净余额）层面差异，仍按原格式；
  // 4 个分项有差异时，按字段分别列出每个类目的值。
  if (mismatchedFields.length === 0) {
    const parts = categories.map(
      c => `「${c.category_name}」期初余额 ${formatInitBalanceAmount(c.init_balance)}`
    )
    return `${accountCode} ${accountName}：${parts.join(' ≠ ')}`
  }

  const fieldSegments = mismatchedFields.map(field => {
    const cells = categories.map(c => {
      const value = Number((c as any)[field.key] || 0)
      return `「${c.category_name}」${formatInitBalanceAmount(value)}`
    })
    return `${field.label}：${cells.join(' ≠ ')}`
  })

  return `${accountCode} ${accountName}：${fieldSegments.join('；')}`
}

function formatInitBalanceAmount(value: number) {
  const abs = Math.abs(value || 0)
  if (abs < 0.005) return '¥0'
  return `¥${abs.toFixed(2)}`
}

/** 校验全部辅助科目的各类目期初余额是否一致（如现金按部门合计 = 按人员合计） */
export function checkInitBalanceAuxCategoryConsistency(
  db: any,
  accountSetId: string,
  year: number,
  period = 1
) {
  const accounts = db
    .prepare(
      `SELECT id, code, name, direction, aux_types, is_aux
       FROM accounts
       WHERE account_set_id=? AND is_enabled=1`
    )
    .all(accountSetId) as Array<{
    id: string
    code: string
    name: string
    direction: string
    aux_types?: unknown
    is_aux?: number
  }>

  const mismatches: InitBalanceAuxCategoryMismatch[] = []

  for (const account of accounts) {
    if (!accountHasAuxAccounting(account)) continue
    const computed = computeAccountAuxCategorySums(db, accountSetId, account.id, year, period)
    if (!computed || computed.enabledCategoryIds.length <= 1) continue

    const { enabledCategoryIds, sums, accountDirection, nameById } = computed
    if (isAccountAuxCategoryConsistent(enabledCategoryIds, sums)) continue

    const categories = buildCategoryBalanceSummaries(
      accountDirection,
      enabledCategoryIds,
      sums,
      nameById,
      false
    )
    const mismatchedFields = collectMismatchedFields(enabledCategoryIds, sums)
    mismatches.push({
      account_id: account.id,
      account_code: account.code,
      account_name: account.name,
      direction: accountDirection,
      message: buildAuxCategoryMismatchMessage(account.code, account.name, categories, mismatchedFields),
      categories,
      mismatched_fields: mismatchedFields.map(f => ({ key: String(f.key), label: f.label })),
    })
  }

  return {
    consistent: mismatches.length === 0,
    mismatches,
  }
}

function recalcInitBalanceAuxSummary(
  db: any,
  accountSetId: string,
  accountId: string,
  accountDirection: string,
  year: number,
  period: number,
  options?: { activeCategoryId?: string; validateCategoryConsistency?: boolean }
) {
  const computed = computeAccountAuxCategorySums(db, accountSetId, accountId, year, period)
  if (!computed) throw new Error('科目不存在')
  const accountDirectionForCompare = computed.accountDirection || accountDirection
  const { enabledCategoryIds, sums } = computed

  const detailRows = db
    .prepare(
      `SELECT aux_item_id FROM init_balances
       WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id != ''`
    )
    .all(accountSetId, accountId, year, period) as Array<{ aux_item_id: string }>

  const catsWithAmount = enabledCategoryIds.filter(id => bucketHasAmount(sums.get(id)!))

  if (
    options?.validateCategoryConsistency &&
    !isAccountAuxCategoryConsistent(enabledCategoryIds, sums)
  ) {
    const accountInfo = db
      .prepare(`SELECT code, name FROM accounts WHERE id=? AND account_set_id=?`)
      .get(accountId, accountSetId) as { code: string; name: string } | undefined
    const categories = buildCategoryBalanceSummaries(
      accountDirectionForCompare,
      enabledCategoryIds,
      sums,
      computed.nameById,
      false
    )
    const mismatchedFields = collectMismatchedFields(enabledCategoryIds, sums)
    throw new Error(
      buildAuxCategoryMismatchMessage(
        accountInfo?.code || accountId,
        accountInfo?.name || '',
        categories,
        mismatchedFields
      )
    )
  }

  const pickId =
    options?.activeCategoryId && catsWithAmount.includes(options.activeCategoryId)
      ? options.activeCategoryId
      : catsWithAmount[0] || enabledCategoryIds[0]

  const picked = sums.get(pickId) || {
    opening_debit: 0,
    opening_credit: 0,
    pre_book_debit: 0,
    pre_book_credit: 0,
    hasAmount: false,
  }

  let sumOd = picked.opening_debit
  let sumOc = picked.opening_credit
  let sumPd = picked.pre_book_debit
  let sumPc = picked.pre_book_credit

  const summaryAmounts = calcInitBalanceFromAmounts(
    accountDirection,
    sumOd,
    sumOc,
    sumPd,
    sumPc
  )

  const findSummary = db.prepare(
    `SELECT id FROM init_balances
     WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=''`
  )
  const updateDetail = db.prepare(`
    UPDATE init_balances SET
      direction=?, init_balance=?, init_debit=?, init_credit=?,
      opening_debit=?, opening_credit=?, pre_book_debit=?, pre_book_credit=?
    WHERE id=?
  `)
  const insertDetail = db.prepare(`
    INSERT INTO init_balances
      (id, account_set_id, account_id, direction, year, period,
       init_balance, init_debit, init_credit, aux_item_id,
       opening_debit, opening_credit, pre_book_debit, pre_book_credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const deleteById = db.prepare(`DELETE FROM init_balances WHERE id=?`)

  const summaryExisting = findSummary.get(accountSetId, accountId, year, period) as
    | { id: string }
    | undefined

  const hasAmount = sumOd !== 0 || sumOc !== 0 || sumPd !== 0 || sumPc !== 0
  if (summaryExisting) {
    if (!hasAmount) {
      deleteById.run(summaryExisting.id)
    } else {
      updateDetail.run(
        accountDirection,
        summaryAmounts.initBalance,
        summaryAmounts.initDebit,
        summaryAmounts.initCredit,
        sumOd,
        sumOc,
        sumPd,
        sumPc,
        summaryExisting.id
      )
    }
  } else if (hasAmount) {
    insertDetail.run(
      uuidv4(),
      accountSetId,
      accountId,
      accountDirection,
      year,
      period,
      summaryAmounts.initBalance,
      summaryAmounts.initDebit,
      summaryAmounts.initCredit,
      '',
      sumOd,
      sumOc,
      sumPd,
      sumPc
    )
  }

  return {
    opening_debit: sumOd,
    opening_credit: sumOc,
    pre_book_debit: sumPd,
    pre_book_credit: sumPc,
    init_debit: summaryAmounts.initDebit,
    init_credit: summaryAmounts.initCredit,
    init_balance: summaryAmounts.initBalance,
    line_count: detailRows.length,
  }
}

/** 单行录入：失焦保存，不影响其他辅助组合行 */
export function upsertInitBalanceAuxLine(
  db: any,
  accountSetId: string,
  accountId: string,
  year: number,
  line: InitBalanceAuxLineInput,
  period = 1
) {
  const account = db
    .prepare(`SELECT * FROM accounts WHERE id=? AND account_set_id=?`)
    .get(accountId, accountSetId) as any

  if (!account) throw new Error('科目不存在')
  if (!accountHasAuxAccounting(account)) {
    throw new Error('该科目未启用辅助核算')
  }

  const enabledCategoryIds = parseAccountAuxCategoryIds(account.aux_types)
  const { codeById, nameById } = loadCategoryMaps(db, accountSetId)
  const itemsByCategory = loadAuxItemsByCategory(db, accountSetId, enabledCategoryIds)
  const selection = line.selection || {}

  let categoryId: string
  let itemId: string
  try {
    ;({ categoryId, itemId } = resolveSingleCategorySelection(
      selection,
      enabledCategoryIds,
      line.active_category_id
    ))
  } catch (e: any) {
    throw new Error(e.message || '请选择辅助项目')
  }

  const validItems = itemsByCategory.get(categoryId) || []
  if (!validItems.some(item => item.id === itemId)) {
    throw new Error(
      `「${nameById.get(categoryId) || codeById.get(categoryId) || categoryId}」辅助项目无效`
    )
  }

  const auxItemId = buildSingleCategoryAuxItemId(codeById, categoryId, itemId)
  if (!auxItemId) throw new Error('无法生成辅助核算标识')

  const openingDebit = normalizeAmount(line.opening_debit)
  const openingCredit = normalizeAmount(line.opening_credit)
  assertOpeningDebitCreditExclusive(openingDebit, openingCredit)
  const preBookDebit = normalizeAmount(line.pre_book_debit)
  const preBookCredit = normalizeAmount(line.pre_book_credit)
  const { initDebit, initCredit, initBalance } = calcInitBalanceFromAmounts(
    account.direction,
    openingDebit,
    openingCredit,
    preBookDebit,
    preBookCredit
  )

  const allZero =
    openingDebit === 0 &&
    openingCredit === 0 &&
    preBookDebit === 0 &&
    preBookCredit === 0

  const findDetail = db.prepare(
    `SELECT id FROM init_balances
     WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?`
  )
  const updateDetail = db.prepare(`
    UPDATE init_balances SET
      direction=?, init_balance=?, init_debit=?, init_credit=?,
      opening_debit=?, opening_credit=?, pre_book_debit=?, pre_book_credit=?
    WHERE id=?
  `)
  const insertDetail = db.prepare(`
    INSERT INTO init_balances
      (id, account_set_id, account_id, direction, year, period,
       init_balance, init_debit, init_credit, aux_item_id,
       opening_debit, opening_credit, pre_book_debit, pre_book_credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const deleteById = db.prepare(`DELETE FROM init_balances WHERE id=?`)

  const runTx = db.transaction(() => {
    const existing = findDetail.get(accountSetId, accountId, year, period, auxItemId) as
      | { id: string }
      | undefined

    if (allZero) {
      if (existing) deleteById.run(existing.id)
    } else if (existing) {
      updateDetail.run(
        account.direction,
        initBalance,
        initDebit,
        initCredit,
        openingDebit,
        openingCredit,
        preBookDebit,
        preBookCredit,
        existing.id
      )
    } else {
      insertDetail.run(
        uuidv4(),
        accountSetId,
        accountId,
        account.direction,
        year,
        period,
        initBalance,
        initDebit,
        initCredit,
        auxItemId,
        openingDebit,
        openingCredit,
        preBookDebit,
        preBookCredit
      )
    }

    return recalcInitBalanceAuxSummary(
      db,
      accountSetId,
      accountId,
      account.direction,
      year,
      period,
      { activeCategoryId: categoryId, validateCategoryConsistency: false }
    )
  })

  return runTx()
}

export function saveInitBalanceAuxDetails(
  db: any,
  accountSetId: string,
  accountId: string,
  year: number,
  lines: InitBalanceAuxLineInput[],
  period = 1
) {
  const account = db
    .prepare(`SELECT * FROM accounts WHERE id=? AND account_set_id=?`)
    .get(accountId, accountSetId) as any

  if (!account) {
    throw new Error('科目不存在')
  }
  if (!accountHasAuxAccounting(account)) {
    throw new Error('该科目未启用辅助核算，请直接在科目行录入期初')
  }

  const enabledCategoryIds = parseAccountAuxCategoryIds(account.aux_types)
  const { codeById, nameById } = loadCategoryMaps(db, accountSetId)
  const itemsByCategory = loadAuxItemsByCategory(db, accountSetId, enabledCategoryIds)

  const builtLines: Array<{
    aux_item_id: string
    opening_debit: number
    opening_credit: number
    pre_book_debit: number
    pre_book_credit: number
    init_debit: number
    init_credit: number
    init_balance: number
  }> = []

  const seenAuxIds = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const selection = line.selection || {}

    let categoryId: string
    let itemId: string
    try {
      ;({ categoryId, itemId } = resolveSingleCategorySelection(
        selection,
        enabledCategoryIds,
        line.active_category_id
      ))
    } catch (e: any) {
      throw new Error(`第 ${i + 1} 行：${e.message || '请选择辅助项目'}`)
    }

    const validItems = itemsByCategory.get(categoryId) || []
    if (!validItems.some(item => item.id === itemId)) {
      throw new Error(`第 ${i + 1} 行：辅助项目无效或不属于当前类别`)
    }

    const auxItemId = buildSingleCategoryAuxItemId(codeById, categoryId, itemId)
    if (!auxItemId) {
      throw new Error(`第 ${i + 1} 行：无法生成辅助核算标识`)
    }
    if (seenAuxIds.has(auxItemId)) {
      throw new Error(`第 ${i + 1} 行：同一辅助项目重复`)
    }
    seenAuxIds.add(auxItemId)

    const openingDebit = normalizeAmount(line.opening_debit)
    const openingCredit = normalizeAmount(line.opening_credit)
    assertOpeningDebitCreditExclusive(openingDebit, openingCredit, `第 ${i + 1} 行`)
    const preBookDebit = normalizeAmount(line.pre_book_debit)
    const preBookCredit = normalizeAmount(line.pre_book_credit)
    const { initDebit, initCredit, initBalance } = calcInitBalanceFromAmounts(
      account.direction,
      openingDebit,
      openingCredit,
      preBookDebit,
      preBookCredit
    )

    const allZero =
      openingDebit === 0 &&
      openingCredit === 0 &&
      preBookDebit === 0 &&
      preBookCredit === 0
    if (allZero) continue

    builtLines.push({
      aux_item_id: auxItemId,
      opening_debit: openingDebit,
      opening_credit: openingCredit,
      pre_book_debit: preBookDebit,
      pre_book_credit: preBookCredit,
      init_debit: initDebit,
      init_credit: initCredit,
      init_balance: initBalance,
    })
  }

  const findExisting = db.prepare(
    `SELECT id, aux_item_id FROM init_balances
     WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id != ''`
  )
  const findSummary = db.prepare(
    `SELECT id FROM init_balances
     WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=''`
  )
  const updateDetail = db.prepare(`
    UPDATE init_balances SET
      direction=?, init_balance=?, init_debit=?, init_credit=?,
      opening_debit=?, opening_credit=?, pre_book_debit=?, pre_book_credit=?
    WHERE id=?
  `)
  const insertDetail = db.prepare(`
    INSERT INTO init_balances
      (id, account_set_id, account_id, direction, year, period,
       init_balance, init_debit, init_credit, aux_item_id,
       opening_debit, opening_credit, pre_book_debit, pre_book_credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const deleteById = db.prepare(`DELETE FROM init_balances WHERE id=?`)

  const runTx = db.transaction(() => {
    const existingRows = findExisting.all(accountSetId, accountId, year, period) as Array<{
      id: string
      aux_item_id: string
    }>
    const keepIds = new Set(builtLines.map(l => l.aux_item_id))

    for (const row of existingRows) {
      if (!keepIds.has(row.aux_item_id)) {
        deleteById.run(row.id)
      }
    }

    for (const line of builtLines) {
      const existing = existingRows.find(r => r.aux_item_id === line.aux_item_id)
      if (existing) {
        updateDetail.run(
          account.direction,
          line.init_balance,
          line.init_debit,
          line.init_credit,
          line.opening_debit,
          line.opening_credit,
          line.pre_book_debit,
          line.pre_book_credit,
          existing.id
        )
      } else {
        insertDetail.run(
          uuidv4(),
          accountSetId,
          accountId,
          account.direction,
          year,
          period,
          line.init_balance,
          line.init_debit,
          line.init_credit,
          line.aux_item_id,
          line.opening_debit,
          line.opening_credit,
          line.pre_book_debit,
          line.pre_book_credit
        )
      }
    }

    const activeHint = lines.find(l => l.active_category_id)?.active_category_id
    return recalcInitBalanceAuxSummary(
      db,
      accountSetId,
      accountId,
      account.direction,
      year,
      period,
      { activeCategoryId: activeHint, validateCategoryConsistency: true }
    )
  })

  return runTx()
}
