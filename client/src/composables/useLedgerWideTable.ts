import { computed, watch, type ComputedRef } from 'vue'
import {
  useListColumnWidth,
  sumColWidths,
  syncAuxTableBodyWidth,
} from '@/composables/useColumnWidthMemory'

export type LedgerColDef = { key: string; fallback: number }

/** 账簿列表：列宽合计定宽 + 表头/表体/合计行同步，外框贴列无右侧缝隙 */
export function useLedgerWideTable(
  tableKey: string,
  columnDefs: ComputedRef<LedgerColDef[]>
) {
  const { tableRef, onDragEnd, colWidth, relayoutTable } = useListColumnWidth(tableKey)

  const ledgerTableWidth = computed(() =>
    sumColWidths(colWidth, columnDefs.value, { includeGutter: false })
  )

  function syncTableWidth() {
    syncAuxTableBodyWidth(tableRef, ledgerTableWidth.value)
  }

  watch(ledgerTableWidth, syncTableWidth)

  function handleHeaderDragEnd(newWidth: number, oldWidth: number, column: any) {
    onDragEnd(newWidth, oldWidth, column)
  }

  async function afterTableLayout() {
    await relayoutTable()
    syncTableWidth()
  }

  return {
    tableRef,
    colWidth,
    onDragEnd,
    relayoutTable,
    ledgerTableWidth,
    handleHeaderDragEnd,
    syncTableWidth,
    afterTableLayout,
  }
}
