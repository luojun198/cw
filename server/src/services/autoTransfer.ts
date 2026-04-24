import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import {
  buildVoucherEntryPayloads,
  calculateVoucherTotals,
  getNextVoucherNo,
  getPeriodClosingRecord,
  isPeriodClosed,
  loadVoucherAuxiliaryData,
  type VoucherEntryInput,
} from './voucherEntry.ts'
import {
  applyVoucherPosting,
  type VoucherEntryLike,
  type VoucherLike,
  type PostingContext,
} from './voucherPosting.ts'

export const AUTO_TRANSFER_TYPE = 'income-expense'

export interface AutoTransferPreviewEntry extends VoucherEntryInput {}

export function validateAutoTransferPeriod(year: number, period: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return '年度必须为 2000-2100 之间的整数'
  }
  if (!Number.isInteger(period) || period < 1 || period > 12) {
    return '期间必须为 1-12 月'
  }
  return null
}

export function getAutoTransferVoucherDate(year: number, period: number) {
  return dayjs(`${year}-${String(period).padStart(2, '0')}-01`)
    .endOf('month')
    .format('YYYY-MM-DD')
}

export function buildAutoTransferRemark(year: number, period: number) {
  return `${year}年${period}期自动结转`
}

export function getAutoTransferSummary(period: number, type: 'income' | 'expense' | 'balance') {
  if (type === 'income') return `${period}月收入结转`
  if (type === 'expense') return `${period}月费用结转`
  return `${period}月结转平衡`
}

export function getIncomeExpenseTransferAccounts(
  accounts: Array<{ id: string; code: string; name: string; direction: string }>,
  preferredTargetCodes: string[] = []
) {
  const incomeAccounts = accounts.filter(account => /^4/.test(account.code))
  const expenseAccounts = accounts.filter(account => /^5/.test(account.code))
  const configuredBalanceAccount = preferredTargetCodes
    .map(code => accounts.find(account => account.code === code.trim()))
    .find(Boolean)
  const balanceAccount =
    configuredBalanceAccount ||
    accounts.find(account => /^3001/.test(account.code)) ||
    accounts.find(account => account.code === '3101') ||
    accounts.find(account => /^3/.test(account.code)) ||
    null

  return { incomeAccounts, expenseAccounts, balanceAccount }
}

export function getAutoTransferTargetAccountCodes(params: {
  db: { prepare: (sql: string) => { all: (...args: any[]) => any[] } }
  accountSetId: string
}) {
  const rows = params.db
    .prepare(
      `SELECT param_key, param_value
       FROM system_params
       WHERE account_set_id=?
         AND param_key IN ('auto_transfer:balance_account_code', 'auto_transfer:surplus_account_code')
       ORDER BY CASE param_key
         WHEN 'auto_transfer:balance_account_code' THEN 1
         WHEN 'auto_transfer:surplus_account_code' THEN 2
         ELSE 99
       END`
    )
    .all(params.accountSetId) as Array<{ param_key?: string | null; param_value?: string | null }>

  return rows.map(row => String(row?.param_value || '').trim()).filter(code => Boolean(code))
}

export function buildAutoTransferEntries(params: {
  period: number
  incomeBalances: Array<{
    account_id: string
    account_code: string
    account_name: string
    end_balance?: number | null
  }>
  expenseBalances: Array<{
    account_id: string
    account_code: string
    account_name: string
    end_balance?: number | null
  }>
  balanceAccount: { id: string; code: string; name: string } | null
}) {
  const entries: AutoTransferPreviewEntry[] = []
  let totalIncome = 0
  let totalExpense = 0

  for (const balance of params.incomeBalances) {
    const amount = Math.abs(Number(balance.end_balance || 0))
    if (amount <= 0.001) continue
    totalIncome += amount
    entries.push({
      account_id: balance.account_id,
      account_code: balance.account_code,
      account_name: balance.account_name,
      direction: 'debit',
      amount,
      summary: getAutoTransferSummary(params.period, 'income'),
    })
  }

  for (const balance of params.expenseBalances) {
    const amount = Math.abs(Number(balance.end_balance || 0))
    if (amount <= 0.001) continue
    totalExpense += amount
    entries.push({
      account_id: balance.account_id,
      account_code: balance.account_code,
      account_name: balance.account_name,
      direction: 'credit',
      amount,
      summary: getAutoTransferSummary(params.period, 'expense'),
    })
  }

  const diff = Math.abs(totalIncome - totalExpense)
  if (diff > 0.001 && params.balanceAccount) {
    entries.push({
      account_id: params.balanceAccount.id,
      account_code: params.balanceAccount.code,
      account_name: params.balanceAccount.name,
      direction: totalIncome > totalExpense ? 'credit' : 'debit',
      amount: diff,
      summary: getAutoTransferSummary(params.period, 'balance'),
    })
  }

  return {
    entries,
    totalIncome,
    totalExpense,
    difference: diff,
  }
}

type TransferItemConfig = {
  id: string
  type_code: string
  summary: string | null
  from_code: string | null
  from_name: string | null
  to_code: string | null
  to_name: string | null
  transfer_type: 'all' | 'partial'
  ratio: number | null
  sort_order: number | null
}

export function listTransferConfigItems(params: {
  db: { prepare: (sql: string) => { all: (...args: any[]) => any[] } }
  accountSetId: string
}) {
  return params.db
    .prepare(
      `SELECT id, type_code, summary, from_code, from_name, to_code, to_name, transfer_type, ratio, sort_order
       FROM transfer_items
       WHERE account_set_id=?
       ORDER BY type_code ASC, sort_order ASC, id ASC`
    )
    .all(params.accountSetId) as TransferItemConfig[]
}

/**
 * 检查科目是否为父科目（有子科目）
 */
function isParentAccount(params: {
  db: { prepare: (sql: string) => { get: (...args: any[]) => any } }
  accountSetId: string
  accountId: string
}) {
  const result = params.db
    .prepare(
      `SELECT COUNT(*) as child_count FROM accounts
       WHERE account_set_id=? AND parent_id=? AND is_enabled=1`
    )
    .get(params.accountSetId, params.accountId) as { child_count: number } | null
  return (result?.child_count || 0) > 0
}

/**
 * 获取父科目的所有子科目余额（不包括父科目本身）
 */
function getChildrenBalances(params: {
  db: { prepare: (sql: string) => { all: (...args: any[]) => any[] } }
  accountSetId: string
  year: number
  period: number
  accountId: string
}) {
  return params.db
    .prepare(
      `SELECT account_id, account_code, account_name,
              SUM(COALESCE(init_balance, 0) + current_debit - current_credit) as end_balance
       FROM account_balances
       WHERE account_set_id=? AND year=? AND period=?
         AND account_id IN (
           SELECT id FROM accounts WHERE account_set_id=? AND parent_id=? AND is_enabled=1
         )
       GROUP BY account_id, account_code, account_name
       ORDER BY account_code ASC`
    )
    .all(
      params.accountSetId,
      params.year,
      params.period,
      params.accountSetId,
      params.accountId
    ) as Array<{
    account_id: string
    account_code: string
    account_name: string
    end_balance?: number | null
  }>
}

export function getPeriodEndBalanceByCode(params: {
  db: { prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] } }
  accountSetId: string
  year: number
  period: number
  accountCode: string
}):
  | { account_id: string; account_code: string; account_name: string; end_balance?: number | null }
  | null
  | Array<{
      account_id: string
      account_code: string
      account_name: string
      end_balance?: number | null
    }> {
  // 先查询科目信息
  const account = params.db
    .prepare(
      `SELECT id, code, name FROM accounts
       WHERE account_set_id=? AND code=? AND is_enabled=1`
    )
    .get(params.accountSetId, params.accountCode) as {
    id: string
    code: string
    name: string
  } | null

  if (!account) {
    return null
  }

  // 检查是否为父科目
  const hasChildren = isParentAccount({
    db: params.db,
    accountSetId: params.accountSetId,
    accountId: account.id,
  })

  if (hasChildren) {
    // 如果是父科目，返回所有子科目的余额数组
    return getChildrenBalances({
      db: params.db,
      accountSetId: params.accountSetId,
      year: params.year,
      period: params.period,
      accountId: account.id,
    })
  } else {
    // 如果是明细科目，只查询该科目的余额（按account_id聚合，因为aux_item_id可能产生多行）
    return params.db
      .prepare(
        `SELECT account_id, account_code, account_name,
                SUM(COALESCE(init_balance, 0) + current_debit - current_credit) as end_balance
         FROM account_balances
         WHERE account_set_id=? AND year=? AND period=? AND account_code=?
         GROUP BY account_id, account_code, account_name
         LIMIT 1`
      )
      .get(params.accountSetId, params.year, params.period, params.accountCode) as {
      account_id: string
      account_code: string
      account_name: string
      end_balance?: number | null
    } | null
  }
}

function getTransferAmount(item: TransferItemConfig, endBalance: number) {
  const base = Math.abs(endBalance)
  if (base <= 0.001) return 0
  if (item.transfer_type !== 'partial') return base
  const rawRatio = Number(item.ratio ?? 100)
  const ratio = Number.isFinite(rawRatio) ? Math.max(0, Math.min(100, rawRatio)) : 100
  return Number(((base * ratio) / 100).toFixed(2))
}

export function buildEntriesFromTransferItems(params: {
  period: number
  items: TransferItemConfig[]
  accounts: Array<{ id: string; code: string; name: string; direction: string }>
  getBalanceByCode: (code: string) =>
    | { end_balance?: number | null }
    | null
    | Array<{
        account_id: string
        account_code: string
        account_name: string
        end_balance?: number | null
      }>
}) {
  const entries: AutoTransferPreviewEntry[] = []
  let transferredOutTotal = 0
  let transferredInTotal = 0

  const accountByCode = new Map(params.accounts.map(account => [account.code, account]))
  const accountById = new Map(params.accounts.map(account => [account.id, account]))

  // 分离转入目标和转出源
  const targetItems = params.items.filter(item => {
    const toCode = String(item.to_code || '').trim()
    const fromCode = String(item.from_code || '').trim()
    return Boolean(toCode) && !fromCode // 只有 to_code，没有 from_code
  })

  const sourceItems = params.items.filter(item => {
    const fromCode = String(item.from_code || '').trim()
    return Boolean(fromCode)
  })

  const pairItems = params.items.filter(item => {
    const fromCode = String(item.from_code || '').trim()
    const toCode = String(item.to_code || '').trim()
    return Boolean(fromCode) && Boolean(toCode) // 同时有 from_code 和 to_code
  })

  // 处理汇总结转模式：多个转出源 -> 一个转入目标
  if (targetItems.length > 0 && sourceItems.length > 0) {
    for (const targetItem of targetItems) {
      const toCode = String(targetItem.to_code || '').trim()
      const toAccount = accountByCode.get(toCode)
      if (!toAccount) continue

      let targetTotalAmount = 0
      const targetSummary = String(targetItem.summary || '').trim() || `${params.period}月结转`

      // 为每个转出源生成分录
      for (const sourceItem of sourceItems) {
        const fromCode = String(sourceItem.from_code || '').trim()
        const fromAccount = accountByCode.get(fromCode)
        if (!fromAccount) continue

        const balanceResult = params.getBalanceByCode(fromCode)

        // 处理返回数组的情况（父科目）
        if (Array.isArray(balanceResult)) {
          for (const childBalance of balanceResult) {
            const endBalance = Number(childBalance.end_balance || 0)
            const amount = getTransferAmount(sourceItem, endBalance)
            if (amount <= 0.001) continue

            const summary = String(sourceItem.summary || '').trim() || `${params.period}月结转`
            const childAccount = accountById.get(childBalance.account_id)
            if (!childAccount) continue
            const fromDirection = childAccount.direction === 'credit' ? 'debit' : 'credit'

            entries.push({
              account_id: childBalance.account_id,
              account_code: childBalance.account_code,
              account_name: childBalance.account_name,
              direction: fromDirection,
              amount,
              summary,
            })

            targetTotalAmount += amount
            transferredOutTotal += amount
          }
        } else {
          // 处理返回单个对象的情况（明细科目）
          const endBalance = Number(balanceResult?.end_balance || 0)
          const amount = getTransferAmount(sourceItem, endBalance)
          if (amount > 0.001) {
            const summary = String(sourceItem.summary || '').trim() || `${params.period}月结转`
            const fromDirection = fromAccount.direction === 'credit' ? 'debit' : 'credit'

            entries.push({
              account_id: fromAccount.id,
              account_code: fromAccount.code,
              account_name: fromAccount.name,
              direction: fromDirection,
              amount,
              summary,
            })

            targetTotalAmount += amount
            transferredOutTotal += amount
          }
        }
      }

      // 生成转入目标的汇总分录
      if (targetTotalAmount > 0.001) {
        const toDirection = toAccount.direction === 'credit' ? 'credit' : 'debit'
        entries.push({
          account_id: toAccount.id,
          account_code: toAccount.code,
          account_name: toAccount.name,
          direction: toDirection,
          amount: targetTotalAmount,
          summary: targetSummary,
        })
        transferredInTotal += targetTotalAmount
      }
    }
  }

  // 处理一对一结转模式
  for (const item of pairItems) {
    const fromCode = String(item.from_code || '').trim()
    const toCode = String(item.to_code || '').trim()

    const fromAccount = accountByCode.get(fromCode)
    const toAccount = accountByCode.get(toCode)
    if (!fromAccount || !toAccount) continue

    const balanceResult = params.getBalanceByCode(fromCode)
    const summary = String(item.summary || '').trim() || `${params.period}月结转`

    // 处理返回数组的情况（父科目）
    if (Array.isArray(balanceResult)) {
      let totalAmount = 0

      // 为每个子科目生成转出分录
      for (const childBalance of balanceResult) {
        const endBalance = Number(childBalance.end_balance || 0)
        const amount = getTransferAmount(item, endBalance)
        if (amount <= 0.001) continue

        const childAccount = accountById.get(childBalance.account_id)
        if (!childAccount) continue
        const fromDirection = childAccount.direction === 'credit' ? 'debit' : 'credit'

        entries.push({
          account_id: childBalance.account_id,
          account_code: childBalance.account_code,
          account_name: childBalance.account_name,
          direction: fromDirection,
          amount,
          summary,
        })

        totalAmount += amount
        transferredOutTotal += amount
      }

      // 生成转入分录（汇总金额）
      if (totalAmount > 0.001) {
        const toDirection = toAccount.direction === 'credit' ? 'credit' : 'debit'
        entries.push({
          account_id: toAccount.id,
          account_code: toAccount.code,
          account_name: toAccount.name,
          direction: toDirection,
          amount: totalAmount,
          summary,
        })
        transferredInTotal += totalAmount
      }
    } else {
      // 处理返回单个对象的情况（明细科目）
      const endBalance = Number(balanceResult?.end_balance || 0)
      const amount = getTransferAmount(item, endBalance)
      if (amount > 0.001) {
        const fromDirection = fromAccount.direction === 'credit' ? 'debit' : 'credit'
        const toDirection = fromDirection === 'debit' ? 'credit' : 'debit'

        entries.push({
          account_id: fromAccount.id,
          account_code: fromAccount.code,
          account_name: fromAccount.name,
          direction: fromDirection,
          amount,
          summary,
        })
        entries.push({
          account_id: toAccount.id,
          account_code: toAccount.code,
          account_name: toAccount.name,
          direction: toDirection,
          amount,
          summary,
        })

        transferredOutTotal += amount
        transferredInTotal += amount
      }
    }
  }

  return {
    entries,
    transferredOutTotal,
    transferredInTotal,
  }
}

export function getAutoTransferRun(params: {
  db: { prepare: (sql: string) => { get: (...args: any[]) => any } }
  accountSetId: string
  year: number
  period: number
  transferType?: string
}) {
  return params.db
    .prepare(
      `SELECT atr.*, v.voucher_no, v.status, v.voucher_date
       FROM auto_transfer_runs atr
       LEFT JOIN vouchers v ON v.id = atr.voucher_id
       WHERE atr.account_set_id=? AND atr.year=? AND atr.period=? AND atr.transfer_type=?`
    )
    .get(
      params.accountSetId,
      params.year,
      params.period,
      params.transferType || AUTO_TRANSFER_TYPE
    ) as any
}

export function listAutoTransferCandidateBalances(params: {
  db: { prepare: (sql: string) => { all: (...args: any[]) => any[] } }
  accountSetId: string
  year: number
  period: number
  codePrefix: string
}) {
  return params.db
    .prepare(
      `SELECT account_id, account_code, account_name,
              SUM(COALESCE(init_balance, 0) + current_debit - current_credit) as end_balance
       FROM account_balances ab
       WHERE ab.account_set_id=? AND ab.year=? AND ab.period=? AND ab.account_code LIKE ?
       GROUP BY ab.account_id, ab.account_code, ab.account_name
       ORDER BY ab.account_code ASC`
    )
    .all(params.accountSetId, params.year, params.period, `${params.codePrefix}%`) as any[]
}

export function getAutoTransferStatus(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] }
  }
  accountSetId: string
  year: number
  period: number
}) {
  const closingRecord = getPeriodClosingRecord({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })
  const existingRun = getAutoTransferRun({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })
  const closed = isPeriodClosed(closingRecord)
  const alreadyGenerated = Boolean(existingRun)
  // 结转凭证已自动过账，允许撤销（撤销时会自动反过账）
  const canRevoke = Boolean(existingRun) && !closed

  return {
    closed,
    existingRun,
    alreadyGenerated,
    canRevoke,
  }
}

function normalizeTransferItems(items: TransferItemConfig[]) {
  const normalized: TransferItemConfig[] = []

  const directItems = items.filter(item => {
    const fromCode = String(item.from_code || '').trim()
    const toCode = String(item.to_code || '').trim()
    return Boolean(fromCode && toCode)
  })
  normalized.push(...directItems)

  const grouped = new Map<string, TransferItemConfig[]>()
  for (const item of items) {
    const typeCode = String(item.type_code || '').trim()
    if (!typeCode) continue
    if (!grouped.has(typeCode)) grouped.set(typeCode, [])
    grouped.get(typeCode)!.push(item)
  }

  for (const [typeCode, groupItems] of grouped.entries()) {
    const hasDirect = groupItems.some(item => {
      const fromCode = String(item.from_code || '').trim()
      const toCode = String(item.to_code || '').trim()
      return Boolean(fromCode && toCode)
    })
    if (hasDirect) continue

    const fromItems = groupItems.filter(item => {
      const fromCode = String(item.from_code || '').trim()
      const toCode = String(item.to_code || '').trim()
      return Boolean(fromCode) && !toCode
    })
    const toItems = groupItems.filter(item => {
      const fromCode = String(item.from_code || '').trim()
      const toCode = String(item.to_code || '').trim()
      return !fromCode && Boolean(toCode)
    })

    if (fromItems.length === 0 || toItems.length === 0) continue

    const target = toItems[0]
    for (const fromItem of fromItems) {
      normalized.push({
        ...fromItem,
        type_code: typeCode,
        summary: fromItem.summary || target.summary,
        to_code: target.to_code,
        to_name: target.to_name,
      })
    }
  }

  return normalized
}

export function buildAutoTransferPreview(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] }
  }
  accountSetId: string
  year: number
  period: number
}) {
  const { closed, existingRun, alreadyGenerated, canRevoke } = getAutoTransferStatus(params)
  if (closed) {
    return {
      alreadyGenerated,
      canRevoke,
      blockedReason: '该期间已结账，不能生成自动结转凭证',
      voucherDate: getAutoTransferVoucherDate(params.year, params.period),
      remark: buildAutoTransferRemark(params.year, params.period),
      entries: [],
      existingRun: existingRun || null,
      totals: { debitTotal: 0, creditTotal: 0, incomeTotal: 0, expenseTotal: 0 },
    }
  }

  if (existingRun) {
    return {
      alreadyGenerated,
      canRevoke,
      blockedReason: '本期自动结转凭证已生成',
      voucherDate:
        existingRun.voucher_date || getAutoTransferVoucherDate(params.year, params.period),
      remark: buildAutoTransferRemark(params.year, params.period),
      entries: [],
      existingRun,
      totals: { debitTotal: 0, creditTotal: 0, incomeTotal: 0, expenseTotal: 0 },
    }
  }

  const accounts = params.db
    .prepare(
      'SELECT id, code, name, direction FROM accounts WHERE account_set_id=? AND is_enabled=1 ORDER BY code ASC'
    )
    .all(params.accountSetId) as any[]

  const transferItems = listTransferConfigItems({
    db: params.db,
    accountSetId: params.accountSetId,
  })

  const normalizedItems = normalizeTransferItems(transferItems)

  const executableItems = normalizedItems.filter(item => {
    const fromCode = String(item.from_code || '').trim()
    const toCode = String(item.to_code || '').trim()
    return Boolean(fromCode && toCode)
  })

  if (executableItems.length === 0) {
    return {
      alreadyGenerated: false,
      canRevoke: false,
      blockedReason: '未配置可执行的结转规则（请在结转类型维护中设置转出/转入科目）',
      voucherDate: getAutoTransferVoucherDate(params.year, params.period),
      remark: buildAutoTransferRemark(params.year, params.period),
      entries: [],
      existingRun: null,
      totals: { debitTotal: 0, creditTotal: 0, incomeTotal: 0, expenseTotal: 0 },
    }
  }

  const balanceCache = new Map<
    string,
    | { end_balance?: number | null }
    | null
    | Array<{
        account_id: string
        account_code: string
        account_name: string
        end_balance?: number | null
      }>
  >()
  const getBalanceByCode = (code: string) => {
    if (balanceCache.has(code)) return balanceCache.get(code) || null
    const balance = getPeriodEndBalanceByCode({
      db: params.db,
      accountSetId: params.accountSetId,
      year: params.year,
      period: params.period,
      accountCode: code,
    })
    balanceCache.set(code, balance)
    return balance
  }

  const preview = buildEntriesFromTransferItems({
    period: params.period,
    items: executableItems,
    accounts,
    getBalanceByCode,
  })
  const totals = calculateVoucherTotals(preview.entries)

  return {
    alreadyGenerated: false,
    canRevoke: false,
    blockedReason: preview.entries.length === 0 ? '当前期间没有可结转的数据' : null,
    voucherDate: getAutoTransferVoucherDate(params.year, params.period),
    remark: buildAutoTransferRemark(params.year, params.period),
    entries: preview.entries,
    existingRun: null,
    totals: {
      debitTotal: totals.debitTotal,
      creditTotal: totals.creditTotal,
      incomeTotal: preview.transferredOutTotal,
      expenseTotal: preview.transferredInTotal,
    },
  }
}

/**
 * 按结转类型构建预览（单个类型）
 */
export function buildTransferPreviewByType(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] }
  }
  accountSetId: string
  year: number
  period: number
  transferTypeCode: string
}) {
  const accounts = params.db
    .prepare(
      'SELECT id, code, name, direction FROM accounts WHERE account_set_id=? AND is_enabled=1 ORDER BY code ASC'
    )
    .all(params.accountSetId) as any[]

  // 只获取指定类型的结转配置项
  const transferItems = listTransferConfigItems({
    db: params.db,
    accountSetId: params.accountSetId,
  }).filter(item => item.type_code === params.transferTypeCode)

  const normalizedItems = normalizeTransferItems(transferItems)

  const executableItems = normalizedItems.filter(item => {
    const fromCode = String(item.from_code || '').trim()
    const toCode = String(item.to_code || '').trim()
    return Boolean(fromCode && toCode)
  })

  if (executableItems.length === 0) {
    return {
      entries: [],
      transferredOutTotal: 0,
      transferredInTotal: 0,
    }
  }

  const balanceCache = new Map<
    string,
    | { end_balance?: number | null }
    | null
    | Array<{
        account_id: string
        account_code: string
        account_name: string
        end_balance?: number | null
      }>
  >()
  const getBalanceByCode = (code: string) => {
    if (balanceCache.has(code)) return balanceCache.get(code) || null
    const balance = getPeriodEndBalanceByCode({
      db: params.db,
      accountSetId: params.accountSetId,
      year: params.year,
      period: params.period,
      accountCode: code,
    })
    balanceCache.set(code, balance)
    return balance
  }

  return buildEntriesFromTransferItems({
    period: params.period,
    items: executableItems,
    accounts,
    getBalanceByCode,
  })
}

/**
 * 构建所有结转类型的预览
 */
export function buildAllTransferPreviews(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] }
  }
  accountSetId: string
  year: number
  period: number
}) {
  const { closed } = getAutoTransferStatus(params)
  if (closed) {
    return {
      closed: true,
      blockedReason: '该期间已结账，不能生成自动结转凭证',
      previews: [],
    }
  }

  // 获取所有结转类型
  const transferTypes = params.db
    .prepare(
      'SELECT code, name, voucher_type FROM transfer_types WHERE account_set_id=? ORDER BY code'
    )
    .all(params.accountSetId) as Array<{ code: string; name: string; voucher_type: string }>

  if (transferTypes.length === 0) {
    return {
      closed: false,
      blockedReason: '未配置结转类型',
      previews: [],
    }
  }

  const previews = []

  for (const type of transferTypes) {
    // 检查该类型是否已生成凭证
    const existingRun = params.db
      .prepare(
        `SELECT atr.*, v.voucher_no, v.status, v.voucher_date
         FROM auto_transfer_runs atr
         LEFT JOIN vouchers v ON v.id = atr.voucher_id
         WHERE atr.account_set_id=? AND atr.year=? AND atr.period=? AND atr.transfer_type_code=?`
      )
      .get(params.accountSetId, params.year, params.period, type.code) as any

    if (existingRun) {
      previews.push({
        transferTypeCode: type.code,
        transferTypeName: type.name,
        voucherType: type.voucher_type,
        alreadyGenerated: true,
        existingRun,
        entries: [],
        totals: { debitTotal: 0, creditTotal: 0 },
      })
      continue
    }

    // 构建该类型的预览
    const preview = buildTransferPreviewByType({
      db: params.db,
      accountSetId: params.accountSetId,
      year: params.year,
      period: params.period,
      transferTypeCode: type.code,
    })

    const totals = calculateVoucherTotals(preview.entries)

    previews.push({
      transferTypeCode: type.code,
      transferTypeName: type.name,
      voucherType: type.voucher_type,
      alreadyGenerated: false,
      existingRun: null,
      entries: preview.entries,
      totals: {
        debitTotal: totals.debitTotal,
        creditTotal: totals.creditTotal,
      },
    })
  }

  return {
    closed: false,
    blockedReason: null,
    previews,
  }
}

/**
 * 根据结转类型获取对应的凭证类型ID
 * 从 transfer_types.voucher_type 字段查找对应的凭证类型
 */
export function getVoucherTypeIdForTransferType(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  transferTypeCode: string
}) {
  // 1. 获取结转类型配置
  const transferType = params.db
    .prepare('SELECT voucher_type FROM transfer_types WHERE account_set_id=? AND code=?')
    .get(params.accountSetId, params.transferTypeCode) as any

  const voucherTypeName = transferType?.voucher_type || '结转'

  // 2. 根据凭证类型名称查找凭证类型ID
  const voucherType = params.db
    .prepare(
      'SELECT id FROM voucher_types WHERE (account_set_id=? OR account_set_id IS NULL) AND name=? ORDER BY account_set_id DESC LIMIT 1'
    )
    .get(params.accountSetId, voucherTypeName) as any

  if (voucherType?.id) {
    return voucherType.id
  }

  // 3. 如果找不到，回退到第一个可用的凭证类型
  const firstType = params.db
    .prepare(
      'SELECT id FROM voucher_types WHERE account_set_id=? OR account_set_id IS NULL ORDER BY account_set_id DESC, sort_order ASC LIMIT 1'
    )
    .get(params.accountSetId) as any

  return firstType?.id || null
}

export function getAutoTransferVoucherTypeId(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
}) {
  const configured = params.db
    .prepare(
      `SELECT param_value
       FROM system_params
       WHERE account_set_id=? AND param_key='auto_transfer:voucher_type_id'`
    )
    .get(params.accountSetId) as any

  const configuredTypeId = configured?.param_value || null
  if (configuredTypeId) {
    const exists = params.db
      .prepare(
        'SELECT id FROM voucher_types WHERE id=? AND (account_set_id=? OR account_set_id IS NULL)'
      )
      .get(configuredTypeId, params.accountSetId) as any
    if (exists?.id) {
      return configuredTypeId
    }
  }

  const firstType = params.db
    .prepare(
      'SELECT id FROM voucher_types WHERE account_set_id=? OR account_set_id IS NULL ORDER BY account_set_id DESC, sort_order ASC LIMIT 1'
    )
    .get(params.accountSetId) as any

  return firstType?.id || null
}

function isSqliteConstraintError(error: any) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code.startsWith('SQLITE_CONSTRAINT') || message.includes('SQLITE_CONSTRAINT')
}

export function createAutoTransferVoucher(params: {
  db: {
    prepare: (sql: string) => {
      run: (...args: any[]) => void
      get: (...args: any[]) => any
      all: (...args: any[]) => any[]
    }
    transaction: <T extends (...args: any[]) => any>(
      fn: T
    ) => (...args: Parameters<T>) => ReturnType<T>
  }
  accountSetId: string
  userId?: string | null
  userName?: string | null
  year: number
  period: number
}) {
  const preview = buildAutoTransferPreview({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })

  if (preview.blockedReason) {
    return {
      error: preview.blockedReason,
      preview,
    }
  }

  const voucherTypeId = getAutoTransferVoucherTypeId({
    db: params.db,
    accountSetId: params.accountSetId,
  })
  const { effectiveTypeId, voucherNo } = getNextVoucherNo({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
    voucherTypeId,
  })

  const voucherId = uuidv4()
  const runId = uuidv4()
  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db: params.db,
    accountSetId: params.accountSetId,
  })

  const insertVoucher = params.db.prepare(`
    INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period, total_amount, maker_id, maker_name, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEntry = params.db.prepare(`
    INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, summary, dept_id, dept_name, project_id, project_name, supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name, aux_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertRun = params.db.prepare(`
    INSERT INTO auto_transfer_runs (id, account_set_id, year, period, transfer_type, voucher_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const createTransaction = params.db.transaction(() => {
    // 创建凭证（状态直接设为已审核）
    insertVoucher.run(
      voucherId,
      params.accountSetId,
      voucherNo,
      effectiveTypeId,
      preview.voucherDate,
      params.year,
      params.period,
      preview.totals.debitTotal,
      params.userId,
      params.userName,
      preview.remark
    )

    // 自动审核（当前 schema 无 audit_time 字段）
    params.db
      .prepare("UPDATE vouchers SET status='audited', auditor_id=?, auditor_name=? WHERE id=?")
      .run(params.userId, params.userName, voucherId)

    const entryPayloads = buildVoucherEntryPayloads({
      accountSetId: params.accountSetId,
      voucherId,
      entries: preview.entries,
      categories,
      itemMap,
    })
    entryPayloads.forEach(payload => insertEntry.run(...payload))
    insertRun.run(
      runId,
      params.accountSetId,
      params.year,
      params.period,
      AUTO_TRANSFER_TYPE,
      voucherId,
      params.userId || null
    )

    // 自动过账
    const voucher: VoucherLike = {
      id: voucherId,
      year: params.year,
      period: params.period,
      status: 'audited',
    }
    const entries: VoucherEntryLike[] = preview.entries.map((e, i) => ({
      account_id: e.account_id,
      account_code: e.account_code,
      account_name: e.account_name,
      direction: e.direction,
      amount: e.amount,
      dept_id: (e as any).dept_id || null,
    }))
    applyVoucherPosting(params.db, voucher, entries, {
      accountSetId: params.accountSetId,
      userId: params.userId,
      userName: params.userName,
      requireAudit: true,
      allowDirectPost: false,
    })
  })

  try {
    createTransaction()
  } catch (error: any) {
    const existingRun = getAutoTransferRun({
      db: params.db,
      accountSetId: params.accountSetId,
      year: params.year,
      period: params.period,
    })
    if (existingRun && isSqliteConstraintError(error)) {
      return {
        error: '本期自动结转凭证已生成',
        preview: {
          ...preview,
          alreadyGenerated: true,
          blockedReason: '本期自动结转凭证已生成',
          existingRun,
          entries: [],
          totals: { debitTotal: 0, creditTotal: 0, incomeTotal: 0, expenseTotal: 0 },
        },
      }
    }
    throw error
  }

  return {
    error: null,
    preview,
    voucherId,
    voucherNo,
    autoPosted: true,
  }
}

/**
 * 为单个结转类型创建凭证
 */
export function createTransferVoucherForType(params: {
  db: {
    prepare: (sql: string) => {
      run: (...args: any[]) => void
      get: (...args: any[]) => any
      all: (...args: any[]) => any[]
    }
    transaction: <T extends (...args: any[]) => any>(
      fn: T
    ) => (...args: Parameters<T>) => ReturnType<T>
  }
  accountSetId: string
  userId?: string | null
  userName?: string | null
  year: number
  period: number
  transferTypeCode: string
}) {
  // 1. 构建该类型的预览
  const preview = buildTransferPreviewByType({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
    transferTypeCode: params.transferTypeCode,
  })

  // 2. 如果没有分录或金额为0，跳过
  if (preview.entries.length === 0) {
    return {
      skipped: true,
      reason: '该结转类型没有可结转的数据',
      voucherId: null,
      voucherNo: null,
    }
  }

  const totals = calculateVoucherTotals(preview.entries)
  if (totals.debitTotal === 0 && totals.creditTotal === 0) {
    return {
      skipped: true,
      reason: '该结转类型的结转金额为0',
      voucherId: null,
      voucherNo: null,
    }
  }

  // 3. 获取凭证类型ID
  const voucherTypeId = getVoucherTypeIdForTransferType({
    db: params.db,
    accountSetId: params.accountSetId,
    transferTypeCode: params.transferTypeCode,
  })

  // 4. 生成凭证号
  const { effectiveTypeId, voucherNo } = getNextVoucherNo({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
    voucherTypeId,
  })

  const voucherId = uuidv4()
  const runId = uuidv4()
  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db: params.db,
    accountSetId: params.accountSetId,
  })

  const insertVoucher = params.db.prepare(`
    INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period, total_amount, maker_id, maker_name, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEntry = params.db.prepare(`
    INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, summary, dept_id, dept_name, project_id, project_name, supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name, aux_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertRun = params.db.prepare(`
    INSERT INTO auto_transfer_runs (id, account_set_id, year, period, transfer_type, transfer_type_code, voucher_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const voucherDate = getAutoTransferVoucherDate(params.year, params.period)
  const remark = buildAutoTransferRemark(params.year, params.period)

  const createTransaction = params.db.transaction(() => {
    // 创建凭证（状态直接设为已审核）
    insertVoucher.run(
      voucherId,
      params.accountSetId,
      voucherNo,
      effectiveTypeId,
      voucherDate,
      params.year,
      params.period,
      totals.debitTotal,
      params.userId,
      params.userName,
      remark
    )

    // 自动审核
    params.db
      .prepare("UPDATE vouchers SET status='audited', auditor_id=?, auditor_name=? WHERE id=?")
      .run(params.userId, params.userName, voucherId)

    const entryPayloads = buildVoucherEntryPayloads({
      accountSetId: params.accountSetId,
      voucherId,
      entries: preview.entries,
      categories,
      itemMap,
    })
    entryPayloads.forEach(payload => insertEntry.run(...payload))

    // 记录结转运行（使用 transfer_type_code）
    insertRun.run(
      runId,
      params.accountSetId,
      params.year,
      params.period,
      AUTO_TRANSFER_TYPE, // 保留旧字段兼容性
      params.transferTypeCode, // 新字段
      voucherId,
      params.userId || null
    )

    // 自动过账 - 直接执行过账逻辑，不使用 applyVoucherPosting（避免嵌套事务）
    params.db
      .prepare(
        "UPDATE vouchers SET status='posted', poster_id=?, poster_name=?, posted_at=datetime('now') WHERE id=?"
      )
      .run(params.userId, params.userName, voucherId)

    // 更新余额表
    const upsertBalance = params.db.prepare(`
      INSERT INTO account_balances (id, account_set_id, account_id, account_code, account_name, direction, year, period, current_debit, current_credit, end_balance, end_debit, end_credit, aux_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_set_id, account_id, year, period, aux_item_id) DO UPDATE SET
        current_debit = current_debit + excluded.current_debit,
        current_credit = current_credit + excluded.current_credit
    `)

    for (const entry of preview.entries) {
      const isDebit = entry.direction === 'debit'
      upsertBalance.run(
        uuidv4(),
        params.accountSetId,
        entry.account_id,
        entry.account_code,
        entry.account_name,
        entry.direction,
        params.year,
        params.period,
        isDebit ? entry.amount : 0,
        isDebit ? 0 : entry.amount,
        0,
        0,
        0,
        ''
      )
    }
  })

  try {
    createTransaction()
  } catch (error: any) {
    if (isSqliteConstraintError(error)) {
      return {
        error: '凭证号冲突，请重试',
        skipped: false,
        voucherId: null,
        voucherNo: null,
      }
    }
    throw error
  }

  return {
    skipped: false,
    error: null,
    voucherId,
    voucherNo,
    entryCount: preview.entries.length,
  }
}

/**
 * 为所有结转类型创建凭证
 */
export function createAllTransferVouchers(params: {
  db: {
    prepare: (sql: string) => {
      run: (...args: any[]) => void
      get: (...args: any[]) => any
      all: (...args: any[]) => any[]
    }
    transaction: <T extends (...args: any[]) => any>(
      fn: T
    ) => (...args: Parameters<T>) => ReturnType<T>
  }
  accountSetId: string
  userId?: string | null
  userName?: string | null
  year: number
  period: number
}) {
  const { closed } = getAutoTransferStatus({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })

  if (closed) {
    return {
      error: '该期间已结账，不能生成自动结转凭证',
      results: [],
    }
  }

  // 获取所有结转类型
  const transferTypes = params.db
    .prepare('SELECT code, name FROM transfer_types WHERE account_set_id=? ORDER BY code')
    .all(params.accountSetId) as Array<{ code: string; name: string }>

  if (transferTypes.length === 0) {
    return {
      error: '未配置结转类型',
      results: [],
    }
  }

  const results = []

  for (const type of transferTypes) {
    // 检查该类型是否已生成凭证
    const existingRun = params.db
      .prepare(
        `SELECT id FROM auto_transfer_runs
         WHERE account_set_id=? AND year=? AND period=? AND transfer_type_code=?`
      )
      .get(params.accountSetId, params.year, params.period, type.code) as any

    if (existingRun) {
      results.push({
        transferTypeCode: type.code,
        transferTypeName: type.name,
        skipped: true,
        reason: '该结转类型已生成凭证',
        voucherId: null,
        voucherNo: null,
      })
      continue
    }

    // 为该类型创建凭证
    const result = createTransferVoucherForType({
      db: params.db,
      accountSetId: params.accountSetId,
      userId: params.userId,
      userName: params.userName,
      year: params.year,
      period: params.period,
      transferTypeCode: type.code,
    })

    results.push({
      transferTypeCode: type.code,
      transferTypeName: type.name,
      ...result,
    })
  }

  return {
    error: null,
    results,
  }
}

export function validateAutoTransferRevoke(params: { existingRun: any; closed: boolean }) {
  if (!params.existingRun) {
    return '本期未生成自动结转凭证，无需撤销'
  }
  if (params.closed) {
    return '该期间已结账，不能撤销自动结转凭证'
  }
  // 结转凭证已自动过账，撤销时会自动反过账，不再阻止
  return null
}

export function revokeAutoTransferVoucher(params: {
  db: {
    prepare: (sql: string) => {
      run: (...args: any[]) => any
      get: (...args: any[]) => any
      all: (...args: any[]) => any[]
    }
    exec: (sql: string) => void
  }
  accountSetId: string
  year: number
  period: number
}) {
  const { closed, existingRun } = getAutoTransferStatus({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })

  const validationError = validateAutoTransferRevoke({ existingRun, closed })
  if (validationError) {
    return { error: validationError }
  }

  const voucherId = existingRun.voucher_id
  const voucher = params.db.prepare('SELECT * FROM vouchers WHERE id=?').get(voucherId) as any
  const entries = params.db
    .prepare('SELECT * FROM voucher_entries WHERE voucher_id=?')
    .all(voucherId) as any[]

  try {
    params.db.exec('BEGIN')

    // 1. 如果已过账，先冲回余额（与已验证成功的脚本一致）
    if (voucher && voucher.status === 'posted') {
      const revertBalanceExact = params.db.prepare(`
        UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ?
        WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?
      `)
      const revertBalanceFallback = params.db.prepare(`
        UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ?
        WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND (aux_item_id IS NULL OR aux_item_id='')
      `)
      const cleanupZeroBalance = params.db.prepare(`
        DELETE FROM account_balances
        WHERE account_set_id=? AND year=? AND period=?
          AND current_debit = 0 AND current_credit = 0
          AND COALESCE(init_balance, 0) = 0
      `)
      for (const entry of entries) {
        const isDebit = entry.direction === 'debit'
        const debitAmount = isDebit ? entry.amount : 0
        const creditAmount = isDebit ? 0 : entry.amount
        const auxItemId = entry.dept_id || ''

        const result = revertBalanceExact.run(
          debitAmount,
          creditAmount,
          voucher.account_set_id,
          entry.account_id,
          voucher.year,
          voucher.period,
          auxItemId
        )

        if (!result.changes || result.changes === 0) {
          revertBalanceFallback.run(
            debitAmount,
            creditAmount,
            voucher.account_set_id,
            entry.account_id,
            voucher.year,
            voucher.period
          )
        }
      }
      cleanupZeroBalance.run(voucher.account_set_id, voucher.year, voucher.period)
    }

    // 2. 按已验证成功的顺序删除依赖与主记录
    params.db.prepare('DELETE FROM voucher_attachments WHERE voucher_id=?').run(voucherId)
    params.db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(voucherId)
    params.db.prepare('DELETE FROM auto_transfer_runs WHERE voucher_id=?').run(voucherId)
    params.db.prepare('DELETE FROM vouchers WHERE id=?').run(voucherId)

    params.db.exec('COMMIT')

    return {
      error: null,
      voucherId,
      voucherNo: existingRun.voucher_no,
    }
  } catch (error: any) {
    try {
      params.db.exec('ROLLBACK')
    } catch {}
    throw error
  }
}

/**
 * 撤销所有结转凭证（按期间）
 */
export function revokeAllTransferVouchers(params: {
  db: {
    prepare: (sql: string) => {
      run: (...args: any[]) => any
      get: (...args: any[]) => any
      all: (...args: any[]) => any[]
    }
    exec: (sql: string) => void
  }
  accountSetId: string
  year: number
  period: number
}) {
  const { closed } = getAutoTransferStatus({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })

  if (closed) {
    return {
      error: '该期间已结账，不能撤销自动结转凭证',
      results: [],
    }
  }

  // 获取该期间所有结转凭证
  const runs = params.db
    .prepare(
      `SELECT atr.*, v.voucher_no, v.status
       FROM auto_transfer_runs atr
       LEFT JOIN vouchers v ON v.id = atr.voucher_id
       WHERE atr.account_set_id=? AND atr.year=? AND atr.period=?`
    )
    .all(params.accountSetId, params.year, params.period) as any[]

  if (runs.length === 0) {
    return {
      error: '本期未生成自动结转凭证，无需撤销',
      results: [],
    }
  }

  const results = []

  for (const run of runs) {
    const voucherId = run.voucher_id
    const voucher = params.db.prepare('SELECT * FROM vouchers WHERE id=?').get(voucherId) as any
    const entries = params.db
      .prepare('SELECT * FROM voucher_entries WHERE voucher_id=?')
      .all(voucherId) as any[]

    try {
      params.db.exec('BEGIN')

      // 1. 如果已过账，先冲回余额
      if (voucher && voucher.status === 'posted') {
        const revertBalanceExact = params.db.prepare(`
          UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ?
          WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?
        `)
        const revertBalanceFallback = params.db.prepare(`
          UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ?
          WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND (aux_item_id IS NULL OR aux_item_id='')
        `)
        const cleanupZeroBalance = params.db.prepare(`
          DELETE FROM account_balances
          WHERE account_set_id=? AND year=? AND period=?
            AND current_debit = 0 AND current_credit = 0
            AND COALESCE(init_balance, 0) = 0
        `)
        for (const entry of entries) {
          const isDebit = entry.direction === 'debit'
          const debitAmount = isDebit ? entry.amount : 0
          const creditAmount = isDebit ? 0 : entry.amount
          const auxItemId = entry.dept_id || ''

          const result = revertBalanceExact.run(
            debitAmount,
            creditAmount,
            voucher.account_set_id,
            entry.account_id,
            voucher.year,
            voucher.period,
            auxItemId
          )

          if (!result.changes || result.changes === 0) {
            revertBalanceFallback.run(
              debitAmount,
              creditAmount,
              voucher.account_set_id,
              entry.account_id,
              voucher.year,
              voucher.period
            )
          }
        }
        cleanupZeroBalance.run(voucher.account_set_id, voucher.year, voucher.period)
      }

      // 2. 删除依赖与主记录
      params.db.prepare('DELETE FROM voucher_attachments WHERE voucher_id=?').run(voucherId)
      params.db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(voucherId)
      params.db.prepare('DELETE FROM auto_transfer_runs WHERE voucher_id=?').run(voucherId)
      params.db.prepare('DELETE FROM vouchers WHERE id=?').run(voucherId)

      params.db.exec('COMMIT')

      results.push({
        transferTypeCode: run.transfer_type_code,
        voucherId,
        voucherNo: run.voucher_no,
        success: true,
      })
    } catch (error: any) {
      try {
        params.db.exec('ROLLBACK')
      } catch {}
      results.push({
        transferTypeCode: run.transfer_type_code,
        voucherId,
        voucherNo: run.voucher_no,
        success: false,
        error: error.message,
      })
    }
  }

  return {
    error: null,
    results,
  }
}
