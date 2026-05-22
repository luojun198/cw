import { formatAmount } from './format'

export function formatBalanceDirection(netBalance: number): string {
  if (Math.abs(netBalance) < 0.005) return '平'
  return netBalance > 0 ? '借' : '贷'
}

export function formatInitBalanceDirection(row: {
  init_balance: number
  direction: string
}): string {
  if (row.init_balance === 0) return ''
  if (row.init_balance > 0) return row.direction === 'debit' ? '借' : '贷'
  return row.direction === 'debit' ? '贷' : '借'
}

export function formatEndBalanceDirection(row: {
  end_balance: number
  direction: string
}): string {
  if (row.end_balance === 0) return ''
  if (row.end_balance > 0) return row.direction === 'debit' ? '借' : '贷'
  return row.direction === 'debit' ? '贷' : '借'
}

export function formatSignedBalanceAmount(
  balance: number,
  hideZero = false
): number | '' {
  if (balance === 0) return hideZero ? '' : 0
  return Math.abs(balance)
}

export function formatPositiveAmount(
  amount: number | null | undefined,
  hideZero = false
): number | '' {
  const value = amount || 0
  if (value <= 0) return hideZero ? '' : 0
  return value
}

export function splitBalanceToDebitCredit(balance: number, direction: string) {
  const amount = Math.abs(balance || 0)
  const onDebitSide =
    balance === 0 ? direction === 'debit' : balance > 0 ? direction === 'debit' : direction !== 'debit'
  return onDebitSide ? { debit: amount, credit: 0 } : { debit: 0, credit: amount }
}

export function sumBalanceSides(
  rows: Array<{ init_balance?: number; end_balance?: number; direction: string }>,
  field: 'init_balance' | 'end_balance'
) {
  return rows.reduce(
    (acc, row) => {
      const { debit, credit } = splitBalanceToDebitCredit(row[field] || 0, row.direction)
      acc.debit += debit
      acc.credit += credit
      return acc
    },
    { debit: 0, credit: 0 }
  )
}

/** 合计行应参与的科目：有限定级次时取顶层，否则取叶节点 */
export function getSummaryAccountRows<T extends { level: number; account_code: string }>(
  data: T[],
  accountLevel?: number | null
): T[] {
  if (!data.length) return []
  if (accountLevel) {
    const topLevel = Math.min(...data.map(r => r.level))
    return data.filter(row => row.level === topLevel)
  }
  return data.filter(
    row =>
      !data.some(
        r => r.account_code !== row.account_code && r.account_code.startsWith(row.account_code)
      )
  )
}

export function formatAmountForExport(value: number | string | null | undefined): number | '' {
  if (value === '' || value === null || value === undefined) return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return ''
  return num
}

export { formatAmount }
