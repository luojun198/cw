import { describe, expect, it } from 'vitest'
import {
  formatBalanceDirection,
  formatInitBalanceDirection,
  formatPositiveAmount,
  getSummaryAccountRows,
} from '@/utils/exportLedgerHelpers'
import {
  buildBalanceSheetSummaryValues,
  buildGeneralLedgerSummaryValues,
} from '@/utils/ledgerExportBuilders'

describe('exportLedgerHelpers', () => {
  it('formatBalanceDirection 应返回借/贷/平', () => {
    expect(formatBalanceDirection(100)).toBe('借')
    expect(formatBalanceDirection(-50)).toBe('贷')
    expect(formatBalanceDirection(0)).toBe('平')
  })

  it('formatInitBalanceDirection 应按科目方向解析', () => {
    expect(formatInitBalanceDirection({ init_balance: 100, direction: 'debit' })).toBe('借')
    expect(formatInitBalanceDirection({ init_balance: -100, direction: 'debit' })).toBe('贷')
    expect(formatInitBalanceDirection({ init_balance: 0, direction: 'debit' })).toBe('')
  })

  it('formatPositiveAmount 可隐藏零值', () => {
    expect(formatPositiveAmount(0, true)).toBe('')
    expect(formatPositiveAmount(0, false)).toBe(0)
    expect(formatPositiveAmount(12.5, true)).toBe(12.5)
  })

  it('getSummaryAccountRows 在限定级次时只取顶层', () => {
    const rows = [
      { level: 1, account_code: '1001' },
      { level: 2, account_code: '100101' },
    ]
    expect(getSummaryAccountRows(rows, 2)).toEqual([{ level: 1, account_code: '1001' }])
  })
})

describe('ledgerExportBuilders summary', () => {
  it('buildGeneralLedgerSummaryValues 应输出 10 列合计', () => {
    const summaryRows = [
      {
        init_balance: 100,
        end_balance: 120,
        direction: 'debit',
        current_debit: 20,
        current_credit: 0,
        year_debit: 20,
        year_credit: 0,
      },
    ]
    const values = buildGeneralLedgerSummaryValues(summaryRows, false)
    expect(values).toHaveLength(10)
    expect(values[0]).toBe('')
    expect(values[2]).toBe('借')
  })

  it('buildBalanceSheetSummaryValues 应包含期初与期末合计', () => {
    const values = buildBalanceSheetSummaryValues(
      [{ direction: 'debit', init_balance: 100, end_balance: 80, year_debit: 10, year_credit: 0 }],
      [1]
    )
    expect(values[2]).toBe(100)
    expect(values[3]).toBe('')
  })
})
