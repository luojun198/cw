
function buildSheetRows(sheet: TemplateSheet) {
  const existingCellMap = new Map(
    sheet.cells.map(cell => [`${cell.row_index}:${cell.col_index}`, cell])
  )

  // Build set of cells that are covered by a merge (should be hidden)
  const coveredCells = new Set<string>()
  const rowMaxRowSpan = new Map<number, number>() // track max rowSpan for each row
  for (const cell of sheet.cells) {
    if (!cell.merge_info) continue
    try {
      const merge = JSON.parse(cell.merge_info) as { colSpan?: number; rowSpan?: number }
      const cs = merge.colSpan || 1
      const rs = merge.rowSpan || 1
      for (let r = 0; r < rs; r++) {
        for (let c = 0; c < cs; c++) {
          if (r === 0 && c === 0) continue
          coveredCells.add(`${cell.row_index + r}:${cell.col_index + c}`)
        }
      }
      // Track max rowSpan for the merge origin row
      const currentMax = rowMaxRowSpan.get(cell.row_index) || 1
      if (rs > currentMax) {
        rowMaxRowSpan.set(cell.row_index, rs)
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  const rowCount = Math.max(sheet.metrics.rowCount, 1)
  const colCount = Math.max(sheet.metrics.colCount, 1)
  const result: Array<{
    rowIndex: number
    rowHeight: number
    rowSpan: number
    cells: SheetDisplayCell[]
  }> = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const maxRowSpan = rowMaxRowSpan.get(rowIndex) || 1
    const rowCells: SheetDisplayCell[] = []

    for (let colIndex = 0; colIndex < colCount; colIndex++) {
      const existingCell = existingCellMap.get(`${rowIndex}:${colIndex}`)
      const draft = draftCells.value[getDraftKey(sheet.id, rowIndex, colIndex)]
      const cell = draft ? { ...existingCell, ...draft } : existingCell
      const executionCell = cell?.id ? executionCells.value[cell.id] : undefined
      const isEditing =
        inlineEditingPosition.value?.rowIndex === rowIndex &&
        inlineEditingPosition.value?.colIndex === colIndex &&
        activeSheetName.value === sheet.id

      // Parse merge info
      let colSpan = 1
      let rowSpan = 1
      if (cell?.merge_info) {
        try {
          const merge = JSON.parse(cell.merge_info) as { colSpan?: number; rowSpan?: number }
          colSpan = merge.colSpan || 1
          rowSpan = merge.rowSpan || 1
        } catch {
          // Invalid JSON, use defaults
        }
      }

      rowCells.push({
        id: cell?.id || '',
        rowIndex,
        colIndex,
        cell_type: coveredCells.has(`${rowIndex}:${colIndex}`) ? 'merged' : (cell?.cell_type || 'empty'),
        displayValue: cell ? getDisplayCellValue(cell, sheet.id) : '',
        tooltip: executionCell?.error || cell?.formula_text || cell?.text_value || '',
        executionStatus: executionCell?.status || '',
        isSelected:
          selectedPosition.value?.rowIndex === rowIndex &&
          selectedPosition.value?.colIndex === colIndex &&
          activeSheetName.value === sheet.id,
        isEditing,
        editorValue: isEditing ? inlineEditorValue.value : '',
        textAlign: getCellTextAlign(cell),
        colSpan,
        rowSpan,
      })
    }

    result.push({
      rowIndex,
      rowHeight: getRowHeight(sheet.id, rowIndex),
      rowSpan: maxRowSpan,
      cells: rowCells.filter(cell => cell.cell_type !== 'merged'),
    })
  }

  return result
}
