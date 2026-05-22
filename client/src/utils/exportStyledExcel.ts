import ExcelJS from 'exceljs'

export type ExportAlign = 'left' | 'center' | 'right'
export type ExportValueType = 'text' | 'amount' | 'number' | 'integer'

export type ExportColumnDef<T = Record<string, unknown>> = {
  label: string
  width?: number
  align?: ExportAlign
  type?: ExportValueType
  children?: ExportColumnDef<T>[]
  value?: (row: T, index: number) => string | number | null | undefined
  indent?: (row: T) => number
  bold?: (row: T) => boolean
}

export type ExportStyledTableOptions<T = Record<string, unknown>> = {
  fileName: string
  sheetName?: string
  title?: string
  subtitle?: string
  columns: ExportColumnDef<T>[]
  rows: T[]
  /** 与叶子列一一对应的合计值；首列会自动写入「合计」 */
  summaryValues?: (string | number | null | undefined)[]
  stripe?: boolean
}

export type ExportStyledAoaOptions = {
  fileName: string
  sheetName?: string
  rows: (string | number | null | undefined)[][]
  columnWidths?: number[]
  /** 0-based 行号：标题行（加粗、合并） */
  titleRowIndexes?: number[]
  /** 0-based 行号：小节标题（加粗） */
  sectionRowIndexes?: number[]
  /** 0-based 行号：合计/强调行（加粗） */
  emphasisRowIndexes?: number[]
  /** 1-based 列号：金额列 */
  amountColumns?: number[]
}

type LeafColumn<T> = Required<Pick<ExportColumnDef<T>, 'label'>> &
  Pick<ExportColumnDef<T>, 'width' | 'align' | 'type' | 'value' | 'indent' | 'bold'>

type HeaderMerge = {
  top: number
  left: number
  bottom: number
  right: number
}

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFDCDFE6' } },
  left: { style: 'thin', color: { argb: 'FFDCDFE6' } },
  bottom: { style: 'thin', color: { argb: 'FFDCDFE6' } },
  right: { style: 'thin', color: { argb: 'FFDCDFE6' } },
}

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF5F7FA' },
}

const STRIPE_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFAFAFA' },
}

const TITLE_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFFFF' },
}

function ensureXlsxFileName(fileName: string) {
  return fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
}

function getLeafColumns<T>(columns: ExportColumnDef<T>[]): LeafColumn<T>[] {
  const leaves: LeafColumn<T>[] = []
  for (const column of columns) {
    if (column.children?.length) {
      leaves.push(...getLeafColumns(column.children))
      continue
    }
    leaves.push({
      label: column.label,
      width: column.width,
      align: column.align ?? 'left',
      type: column.type ?? 'text',
      value: column.value ?? (() => ''),
      indent: column.indent,
      bold: column.bold,
    })
  }
  return leaves
}

function getHeaderDepth<T>(columns: ExportColumnDef<T>[]): number {
  let depth = 1
  for (const column of columns) {
    if (column.children?.length) {
      depth = Math.max(depth, 1 + getHeaderDepth(column.children))
    }
  }
  return depth
}

function countLeaves<T>(column: ExportColumnDef<T>): number {
  if (!column.children?.length) return 1
  return column.children.reduce((sum, child) => sum + countLeaves(child), 0)
}

function buildHeaderLayout<T>(
  columns: ExportColumnDef<T>[],
  depth: number
): { matrix: string[][]; merges: HeaderMerge[] } {
  const leafCount = columns.reduce((sum, column) => sum + countLeaves(column), 0)
  const matrix = Array.from({ length: depth }, () => Array(leafCount).fill(''))
  const merges: HeaderMerge[] = []

  function fill(columnsToFill: ExportColumnDef<T>[], row: number, colStart: number): number {
    let col = colStart
    for (const column of columnsToFill) {
      const span = countLeaves(column)
      matrix[row][col] = column.label
      if (column.children?.length) {
        merges.push({ top: row + 1, left: col + 1, bottom: row + 1, right: col + span })
        fill(column.children, row + 1, col)
      } else if (row < depth - 1) {
        merges.push({ top: row + 1, left: col + 1, bottom: depth, right: col + 1 })
      }
      col += span
    }
    return col
  }

  fill(columns, 0, 0)
  return { matrix, merges }
}

function applyCellStyle(
  cell: ExcelJS.Cell,
  options: {
    align?: ExportAlign
    type?: ExportValueType
    bold?: boolean
    header?: boolean
    stripe?: boolean
    title?: boolean
    indent?: number
  }
) {
  const bold = options.bold || options.header || options.title
  cell.font = {
    name: '宋体',
    size: options.title ? 14 : 11,
    bold,
  }
  cell.border = BORDER
  cell.alignment = {
    vertical: 'middle',
    horizontal: options.align ?? 'left',
    wrapText: false,
    indent: options.indent ?? 0,
  }

  if (options.header) {
    cell.fill = HEADER_FILL
    cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle' }
  } else if (options.stripe) {
    cell.fill = STRIPE_FILL
  } else if (options.title) {
    cell.fill = TITLE_FILL
  }

  if (options.type === 'amount' || options.type === 'number' || options.type === 'integer') {
    if (typeof cell.value === 'number') {
      cell.numFmt = options.type === 'integer' ? '#,##0' : '#,##0.00'
    }
  }
}

function normalizeCellValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  return value
}

export async function downloadExcelWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = ensureXlsxFileName(fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export type ExportStyledWorkbookSheet<T = Record<string, unknown>> = Omit<
  ExportStyledTableOptions<T>,
  'fileName'
>

function appendStyledSheet<T>(
  workbook: ExcelJS.Workbook,
  options: ExportStyledWorkbookSheet<T>
) {
  const {
    sheetName = 'Sheet1',
    title,
    subtitle,
    columns,
    rows,
    summaryValues,
    stripe = true,
  } = options

  const leafColumns = getLeafColumns(columns)
  const headerDepth = getHeaderDepth(columns)
  const { matrix, merges } = buildHeaderLayout(columns, headerDepth)

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: (title ? 1 : 0) + (subtitle ? 1 : 0) + headerDepth }],
  })

  let currentRow = 1

  if (title) {
    const row = worksheet.getRow(currentRow)
    row.height = 24
    const cell = row.getCell(1)
    cell.value = title
    applyCellStyle(cell, { title: true, align: 'center', bold: true })
    if (leafColumns.length > 1) {
      worksheet.mergeCells(currentRow, 1, currentRow, leafColumns.length)
    }
    currentRow += 1
  }

  if (subtitle) {
    const row = worksheet.getRow(currentRow)
    row.height = 18
    const cell = row.getCell(1)
    cell.value = subtitle
    applyCellStyle(cell, { align: 'center' })
    if (leafColumns.length > 1) {
      worksheet.mergeCells(currentRow, 1, currentRow, leafColumns.length)
    }
    currentRow += 1
  }

  const headerStartRow = currentRow
  for (let r = 0; r < matrix.length; r += 1) {
    const row = worksheet.getRow(currentRow)
    row.height = 20
    matrix[r].forEach((label, index) => {
      const cell = row.getCell(index + 1)
      cell.value = label
      applyCellStyle(cell, { header: true })
    })
    currentRow += 1
  }

  for (const merge of merges) {
    worksheet.mergeCells(
      headerStartRow + merge.top - 1,
      merge.left,
      headerStartRow + merge.bottom - 1,
      merge.right
    )
  }

  leafColumns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = Math.max(8, Math.round((column.width || 96) / 8))
  })

  rows.forEach((rowData, rowIndex) => {
    const row = worksheet.getRow(currentRow)
    row.height = 18
    leafColumns.forEach((column, colIndex) => {
      const rawValue = column.value?.(rowData, rowIndex)
      const cell = row.getCell(colIndex + 1)
      cell.value = normalizeCellValue(rawValue)
      applyCellStyle(cell, {
        align: column.align,
        type: column.type,
        bold: column.bold?.(rowData),
        stripe: stripe && rowIndex % 2 === 1,
        indent: column.indent?.(rowData) ?? 0,
      })
    })
    currentRow += 1
  })

  if (summaryValues?.length) {
    const row = worksheet.getRow(currentRow)
    row.height = 20
    leafColumns.forEach((column, colIndex) => {
      const cell = row.getCell(colIndex + 1)
      cell.value =
        colIndex === 0 ? '合计' : normalizeCellValue(summaryValues[colIndex] ?? '')
      applyCellStyle(cell, {
        align: column.align,
        type: column.type,
        bold: true,
      })
    })
  }
}

export async function exportStyledWorkbook<T>(
  fileName: string,
  sheets: ExportStyledWorkbookSheet<T>[]
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CW Finance'
  for (const sheet of sheets) {
    appendStyledSheet(workbook, sheet)
  }
  await downloadExcelWorkbook(workbook, fileName)
}

export async function exportStyledTable<T>(options: ExportStyledTableOptions<T>) {
  const { fileName, ...sheetOptions } = options
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CW Finance'
  appendStyledSheet(workbook, sheetOptions)
  await downloadExcelWorkbook(workbook, fileName)
}

export async function exportStyledAoa(options: ExportStyledAoaOptions) {
  const {
    fileName,
    sheetName = 'Sheet1',
    rows,
    columnWidths,
    titleRowIndexes = [],
    sectionRowIndexes = [],
    emphasisRowIndexes = [],
    amountColumns = [],
  } = options

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)
  const titleSet = new Set(titleRowIndexes)
  const sectionSet = new Set(sectionRowIndexes)
  const emphasisSet = new Set(emphasisRowIndexes)
  const amountSet = new Set(amountColumns)

  let maxCols = 0
  rows.forEach((rowValues, rowIndex) => {
    maxCols = Math.max(maxCols, rowValues.length)
    const row = worksheet.getRow(rowIndex + 1)
    row.height = titleSet.has(rowIndex) ? 24 : 18
    rowValues.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1)
      cell.value = normalizeCellValue(value)
      const isAmount = amountSet.has(colIndex + 1) && typeof cell.value === 'number'
      applyCellStyle(cell, {
        align: isAmount || amountSet.has(colIndex + 1) ? 'right' : colIndex === 0 ? 'left' : 'right',
        type: isAmount ? 'amount' : 'text',
        bold: titleSet.has(rowIndex) || sectionSet.has(rowIndex) || emphasisSet.has(rowIndex),
        title: titleSet.has(rowIndex),
        header: false,
      })
    })
    if (titleSet.has(rowIndex) && rowValues.length > 1) {
      worksheet.mergeCells(rowIndex + 1, 1, rowIndex + 1, Math.max(rowValues.length, maxCols))
    }
  })

  const widthCount = columnWidths?.length || maxCols
  for (let i = 0; i < widthCount; i += 1) {
    worksheet.getColumn(i + 1).width = columnWidths?.[i] ?? (i === 0 ? 42 : 16)
  }

  await downloadExcelWorkbook(workbook, fileName)
}
