import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { resolveTableColumnKey, bindTableColumnLayout, useColumnWidthMemory, useListColumnWidth } from '../useColumnWidthMemory'

describe('useColumnWidthMemory', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null
      },
      setItem(key: string, value: string) {
        this.store[key] = value
      },
      removeItem(key: string) {
        delete this.store[key]
      },
    })
  })

  it('resolveTableColumnKey 优先使用 property', () => {
    expect(resolveTableColumnKey({ property: 'voucher_no', label: '凭证号' })).toBe('voucher_no')
  })

  it('resolveTableColumnKey 跳过选择列', () => {
    expect(resolveTableColumnKey({ type: 'selection' })).toBeUndefined()
  })

  it('resolveTableColumnKey 无 property 时使用 label', () => {
    expect(resolveTableColumnKey({ label: '操作' })).toBe('操作')
  })

  it('创建时从 localStorage 同步加载列宽', () => {
    localStorage.setItem(
      'table_column_width_test_table',
      JSON.stringify({ voucher_no: 200 })
    )
    const { colWidth, widths } = useColumnWidthMemory('test_table')
    expect(widths.value.voucher_no).toBe(200)
    expect(colWidth('voucher_no', 80)).toBe(200)
  })

  it('表格挂载后触发布局', async () => {
    const widths = ref<Record<string, number>>({ voucher_no: 180 })
    const doLayout = vi.fn()
    const tableRef = ref<{ doLayout?: () => void } | undefined>(undefined)

    bindTableColumnLayout(widths, tableRef)
    tableRef.value = { doLayout }
    await nextTick()
    await nextTick()

    expect(doLayout).toHaveBeenCalled()
  })

  it('useListColumnWidth 返回 tableRef 与 colWidth', () => {
    const { tableRef, colWidth, onDragEnd, relayoutTable } = useListColumnWidth('list_demo')
    expect(tableRef.value).toBeUndefined()
    expect(colWidth('code', 100)).toBe(100)
    expect(typeof onDragEnd).toBe('function')
    expect(typeof relayoutTable).toBe('function')
  })
})
