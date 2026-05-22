import { describe, expect, it } from 'vitest'
import {
  appendAuxItemMatchParams,
  buildAuxIdSelect,
  buildAuxItemLookup,
  buildAuxItemMatchCondition,
  enrichAuxLedgerEntry,
} from '../utils/auxLedgerQuery.js'

describe('auxLedgerQuery', () => {
  it('buildAuxItemMatchCondition 包含 json 与固定列', () => {
    const sql = buildAuxItemMatchCondition('dept', '?,?,?')
    expect(sql).toContain("json_extract(ve.aux_data, '$.dept.id')")
    expect(sql).toContain('ve.dept_id IN (?,?,?)')
  })

  it('appendAuxItemMatchParams 对固定列类别重复 itemIds', () => {
    const params: string[] = []
    appendAuxItemMatchParams(params, 'person', ['a', 'b'])
    expect(params).toEqual(['a', 'b', 'a', 'b'])
  })

  it('buildAuxIdSelect 对部门使用 COALESCE', () => {
    expect(buildAuxIdSelect('dept')).toContain('COALESCE')
    expect(buildAuxIdSelect('dept')).toContain('ve.dept_id')
  })

  it('enrichAuxLedgerEntry 从项目表补全名称', () => {
    const lookup = buildAuxItemLookup([
      { id: 'item-1', name: '行政部', category_code: 'dept', code: 'D01' },
    ])
    const entry: Record<string, any> = { aux_id: 'item-1', aux_name: null }
    enrichAuxLedgerEntry(entry, 'dept', new Map([['dept', '部门']]), lookup)
    expect(entry.category_name).toBe('部门')
    expect(entry.aux_name).toBe('行政部')
  })
})
