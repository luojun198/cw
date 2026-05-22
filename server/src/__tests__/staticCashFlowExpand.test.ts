import { describe, expect, it } from 'vitest'
import {
  expandFlowAccountCodes,
  sumPeriodFlowByPatterns,
} from '../services/staticCashFlowExpand.js'

function createMockDb(codes: string[]) {
  return {
    prepare: () => ({
      all: () => codes.map(code => ({ code })),
    }),
  } as any
}

describe('staticCashFlowExpand', () => {
  it('应按编码前缀展开子科目', () => {
    const db = createMockDb(['5001', '500101', '5002', '5401'])
    const expanded = expandFlowAccountCodes(db, 'as-1', ['5001'])
    expect(expanded).toEqual(['5001', '500101'])
  })

  it('应汇总前缀匹配科目的借贷发生额', () => {
    const db = createMockDb(['5001', '500101', '5401'])
    const periodSumMap = new Map([
      ['5001', { debit: 0, credit: 100 }],
      ['500101', { debit: 0, credit: 50 }],
      ['5401', { debit: 80, credit: 0 }],
    ])
    const inflow = sumPeriodFlowByPatterns(db, 'as-1', ['5001'], false, periodSumMap)
    const outflow = sumPeriodFlowByPatterns(db, 'as-1', ['5401'], true, periodSumMap)
    expect(inflow).toBe(150)
    expect(outflow).toBe(80)
  })
})
