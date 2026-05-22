import { existsSync, readdirSync } from 'fs'
import { basename, join, resolve } from 'path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { Database } from 'better-sqlite3'
import { executeTemplateSheets } from './reportTemplateExecutor.js'
import { loadReportTemplateExcelSource } from './reportTemplatePersistence.js'

type ReportDefinitionRow = {
  id: string
  code: string
  name: string
  source_file: string | null
}

type ReportSheetRow = {
  id: string
  sheet_name: string
  sheet_index: number
}

type ReportCellRow = {
  id: string
  report_sheet_id: string
  row_index: number
  col_index: number
  cell_type: string
  text_value: string | null
  formula_text: string | null
  format_text: string | null
  style_key: string | null
  side: string | null
}

type ExecutedCell = {
  row_index: number
  col_index: number
  cell_type: string
  text_value: string | null
  formula_text: string | null
  format_text: string | null
  style_key: string | null
  side: string | null
  display_value: string
  numeric_value: number | null
  status: 'ok' | 'error'
  error: string | null
}

function getStandardTemplateDirs() {
  const cwd = process.cwd()
  return [join(cwd, '标准模版'), resolve(cwd, '..', '标准模版')]
}

/** 解析报表原始 Excel 模板路径（支持绝对路径、相对路径、按文件名在标准模版目录搜索） */
export function resolveTemplateFilePath(sourceFile: string | null | undefined): string | null {
  if (!sourceFile?.trim()) return null

  const normalized = sourceFile.trim().replace(/\//g, '\\')
  if (existsSync(normalized)) return normalized

  const cwd = process.cwd()
  const candidates = [
    resolve(cwd, normalized),
    resolve(cwd, '..', normalized),
    resolve(cwd, sourceFile),
    resolve(cwd, '..', sourceFile),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  const fileName = basename(normalized)
  if (!fileName) return null

  for (const dir of getStandardTemplateDirs()) {
    if (!existsSync(dir)) continue
    const found = findFileByName(dir, fileName)
    if (found) return found
  }

  return null
}

function findFileByName(dir: string, fileName: string): string | null {
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string
      isDirectory: () => boolean
    }>
  } catch {
    return null
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFileByName(fullPath, fileName)
      if (nested) return nested
      continue
    }
    if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath
    }
  }
  return null
}

function resolveUploadedTemplatePath(sourceFile: string | null | undefined): string | null {
  if (!sourceFile?.trim()) return null
  const fileName = basename(sourceFile.trim())
  if (!fileName) return null

  const cwd = process.cwd()
  const uploadRoots = [
    join(cwd, 'uploads', 'report-templates'),
    resolve(cwd, '..', 'uploads', 'report-templates'),
  ]

  for (const root of uploadRoots) {
    if (!existsSync(root)) continue
    const found = findFileByName(root, fileName)
    if (found) return found
  }

  return null
}

async function loadWorkbookForExport(
  templatePath: string | null,
  storedExcel: { buffer: Buffer } | null
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()

  // 导出优先使用磁盘原始模板，避免数据库中历史导入/导出副本污染版式范围
  if (templatePath && existsSync(templatePath)) {
    if (/\.xls$/i.test(templatePath) && !/\.xlsx$/i.test(templatePath)) {
      throw new Error('当前仅支持导出 .xlsx 格式模板，请将模板另存为 xlsx 后重新导入')
    }
    await workbook.xlsx.readFile(templatePath)
    return workbook
  }

  // 无磁盘模板时回退数据库保存的上传副本
  if (storedExcel?.buffer.length) {
    try {
      await workbook.xlsx.load(storedExcel.buffer as any)
      return workbook
    } catch {
      // 继续走下方错误
    }
  }

  throw new Error('未找到可用的 Excel 模板内容')
}

function pickWorksheet(workbook: ExcelJS.Workbook, sheetName: string, sheetIndex: number) {
  const trimmed = sheetName.replace(/\(定义\)$/g, '').trim()
  const byName =
    workbook.getWorksheet(trimmed) ||
    workbook.worksheets.find(ws => ws.name.replace(/\(定义\)$/g, '').trim() === trimmed)
  if (byName) return byName
  return workbook.worksheets[sheetIndex] || workbook.worksheets[0]
}

/** 读取 ExcelJS cell 的当前显示值（用于与 db.text_value 比较，避免无谓重写破坏样式） */
function readCellDisplayText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // ExcelJS 富文本 / 公式 / 共享公式 / 错误 / 合并主单元格等情形
  if (typeof value === 'object') {
    const v = value as any
    if (typeof v.text === 'string') return v.text // hyperlink / formula 结果
    if (typeof v.result === 'string' || typeof v.result === 'number') return String(v.result) // formula
    if (Array.isArray(v.richText)) return v.richText.map((seg: any) => seg.text || '').join('')
    if (v.formula != null) return '' // 公式 cell 但没缓存结果时不视为有显示值
  }
  return ''
}

function writeExecutedValue(cell: ExcelJS.Cell, executed: ExecutedCell) {
  if (executed.status === 'error') {
    cell.value = executed.error || '#ERROR'
    return
  }

  // 公式 cell：只更新计算结果，尽量保留模板原有数字格式
  if (executed.numeric_value !== null && Number.isFinite(executed.numeric_value)) {
    const numFmt = cell.numFmt
    cell.value = executed.numeric_value
    if (numFmt) cell.numFmt = numFmt
    return
  }

  const text = executed.display_value ?? ''
  if (text === '') return

  // text / empty cell：若 Excel 模板该 cell 已经是相同值（说明 db 中的 text 来自模板未修改），
  // 跳过写入以保留原模板的样式（边框、字体、合并状态、共享字符串索引等）。
  // 这样用户在系统里修改过的 text（display_value ≠ Excel 现值）仍会被正确导出。
  if (executed.cell_type !== 'formula') {
    const existing = readCellDisplayText(cell)
    if (existing === text) return
  }

  cell.value = text
}

type SheetBounds = {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

/** 模板中实际有内容/公式的单元格（不含仅带边框的空格） */
function isTemplateDataCell(cell: ExcelJS.Cell): boolean {
  const value = cell.value
  if (value == null || value === '') return false
  if (typeof value === 'object') {
    const v = value as {
      formula?: unknown
      sharedFormula?: unknown
      richText?: Array<{ text?: string }>
      text?: string
      result?: unknown
    }
    if (v.formula != null || v.sharedFormula != null) return true
    if (Array.isArray(v.richText) && v.richText.some(seg => seg.text?.trim())) return true
    if (v.text != null && String(v.text).trim() !== '') return true
    if (v.result != null && String(v.result).trim() !== '') return true
  }
  return true
}

function collectTemplateDataCellKeys(worksheet: ExcelJS.Worksheet): Set<string> {
  const keys = new Set<string>()
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (isTemplateDataCell(cell)) {
        keys.add(`${rowNumber - 1}:${colNumber - 1}`)
      }
    })
  })
  return keys
}

function computeExportBounds(templateKeys: Set<string>, cells: ExecutedCell[]): SheetBounds | null {
  let minRow = Infinity
  let maxRow = -1
  let minCol = Infinity
  let maxCol = -1

  const consider = (rowIndex: number, colIndex: number) => {
    minRow = Math.min(minRow, rowIndex)
    maxRow = Math.max(maxRow, rowIndex)
    minCol = Math.min(minCol, colIndex)
    maxCol = Math.max(maxCol, colIndex)
  }

  for (const key of templateKeys) {
    const [rowIndex, colIndex] = key.split(':').map(Number)
    consider(rowIndex, colIndex)
  }

  for (const cell of cells) {
    const key = `${cell.row_index}:${cell.col_index}`
    if (templateKeys.has(key)) {
      consider(cell.row_index, cell.col_index)
    }
  }

  if (maxRow < 0) return null
  return { minRow, maxRow, minCol, maxCol }
}

function columnIndexToLetters(colIndex: number): string {
  let n = colIndex + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function boundsToDimensionRef(bounds: SheetBounds): string {
  const start = `${columnIndexToLetters(bounds.minCol)}${bounds.minRow + 1}`
  const end = `${columnIndexToLetters(bounds.maxCol)}${bounds.maxRow + 1}`
  return `${start}:${end}`
}

function columnLettersToNumber(colLetters: string): number {
  let n = 0
  for (const ch of colLetters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n
}

function trimWorksheetXml(xml: string, bounds: SheetBounds): string {
  const maxRow1 = bounds.maxRow + 1
  const maxCol1 = bounds.maxCol + 1
  const ref = boundsToDimensionRef(bounds)

  let trimmed = xml

  if (/<dimension[^>]*\sref="/i.test(trimmed)) {
    trimmed = trimmed.replace(/(<dimension[^>]*\sref=")[^"]*(")/i, `$1${ref}$2`)
  } else {
    trimmed = trimmed.replace(/<sheetViews/i, `<dimension ref="${ref}"/>\n<sheetViews`)
  }

  trimmed = trimmed.replace(/<cols>[\s\S]*?<\/cols>/, full => {
    const colTags = [...full.matchAll(/<col[^>]*\/>/g)].map(match => match[0])
    const kept = colTags
      .filter(tag => {
        const min = Number(tag.match(/\bmin="(\d+)"/)?.[1] ?? 1)
        return min <= maxCol1
      })
      .map(tag =>
        tag.replace(/\bmax="(\d+)"/, (_, max) => `max="${Math.min(Number(max), maxCol1)}"`)
      )
    return kept.length > 0 ? `<cols>${kept.join('')}</cols>` : ''
  })

  trimmed = trimmed.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, block => {
    const items = [...block.matchAll(/<mergeCell ref="([^"]+)"/g)]
      .map(match => match[1])
      .filter(refValue => {
        const [startRef, endRef = startRef] = refValue.split(':')
        const startCol = columnLettersToNumber(startRef.replace(/\d+/g, ''))
        const endCol = columnLettersToNumber(endRef.replace(/\d+/g, ''))
        const startRow = Number(startRef.replace(/[A-Z]+/gi, ''))
        const endRow = Number(endRef.replace(/[A-Z]+/gi, ''))
        return startCol <= maxCol1 && endCol <= maxCol1 && startRow <= maxRow1 && endRow <= maxRow1
      })
    if (items.length === 0) return ''
    return `<mergeCells count="${items.length}">${items.map(refValue => `<mergeCell ref="${refValue}"/>`).join('')}</mergeCells>`
  })

  trimmed = trimmed.replace(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (rowXml, rowNumStr) => {
    const rowNum = Number(rowNumStr)
    if (rowNum > maxRow1) return ''

    let row = rowXml.replace(/\bspans="(\d+):(\d+)"/, (_, start, end) => {
      return `spans="${start}:${Math.min(Number(end), maxCol1)}"`
    })

    row = row.replace(/<c r="([A-Z]+)(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/gi, cellXml => {
      const refMatch = cellXml.match(/<c r="([A-Z]+)/i)
      if (!refMatch) return cellXml
      return columnLettersToNumber(refMatch[1]) > maxCol1 ? '' : cellXml
    })

    return row
  })

  return trimmed
}

/** 清除内容区外的单元格，避免 Excel 渲染多余网格，且不破坏区内样式 */
function clearWorksheetOutsideBounds(worksheet: ExcelJS.Worksheet, bounds: SheetBounds) {
  const maxRow1 = bounds.maxRow + 1
  const maxCol1 = bounds.maxCol + 1

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > maxRow1) {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.value = null
        cell.style = {}
      })
      return
    }

    for (let colNumber = maxCol1 + 1; colNumber <= worksheet.columnCount; colNumber++) {
      const cell = row.getCell(colNumber)
      cell.value = null
      cell.style = {}
    }
  })

  if (Array.isArray(worksheet.columns) && worksheet.columns.length > maxCol1) {
    worksheet.columns = worksheet.columns.slice(0, maxCol1)
  }

  const model = (
    worksheet as ExcelJS.Worksheet & {
      model?: { rows?: unknown[]; cols?: unknown[] }
    }
  ).model
  if (model?.rows && model.rows.length > maxRow1) {
    model.rows = model.rows.slice(0, maxRow1)
  }
  if (model?.cols && Array.isArray(model.cols) && model.cols.length > maxCol1) {
    model.cols = model.cols.slice(0, maxCol1)
  }
}

/** 修正 xlsx worksheet XML 的范围定义（dimension / cols / spans），保留单元格样式 */
async function patchXlsxWorksheetBounds(buffer: Buffer, boundsList: SheetBounds[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  const sheetFiles = Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()

  for (let i = 0; i < sheetFiles.length; i++) {
    const bounds = boundsList[i]
    if (!bounds || bounds.maxRow < 0) continue

    const sheetPath = sheetFiles[i]
    const file = zip.files[sheetPath]
    if (!file) continue

    const xml = await file.async('string')
    zip.file(sheetPath, trimWorksheetXml(xml, bounds))
  }

  return Buffer.from(
    await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
  )
}

/**
 * 基于原始 Excel 模板回填取数结果并导出（保留版式、合并、样式）
 */
export async function exportReportTemplateToBuffer(params: {
  db: Database
  accountSetId: string
  reportCode: string
  year: number
  period: number
}): Promise<{ buffer: Buffer; fileName: string }> {
  const { db, accountSetId, reportCode, year, period } = params

  const definition = db
    .prepare(
      `
      SELECT id, code, name, source_file
      FROM report_definitions
      WHERE account_set_id = ? AND code = ?
      LIMIT 1
      `
    )
    .get(accountSetId, reportCode) as ReportDefinitionRow | undefined

  if (!definition) {
    throw new Error('未找到对应报表模板')
  }

  const templatePath =
    resolveTemplateFilePath(definition.source_file) ||
    resolveUploadedTemplatePath(definition.source_file)
  const storedExcel = loadReportTemplateExcelSource(db, definition.id)

  if (!templatePath && !storedExcel) {
    throw new Error(
      `未找到原始 Excel 模板文件${definition.source_file ? `：${definition.source_file}` : ''}，请重新导入报表模板`
    )
  }

  const sheets = db
    .prepare(
      `
      SELECT id, sheet_name, sheet_index
      FROM report_sheets
      WHERE report_definition_id = ?
      ORDER BY sheet_index ASC
      `
    )
    .all(definition.id) as ReportSheetRow[]

  if (sheets.length === 0) {
    throw new Error('报表模板没有工作表数据')
  }

  const sheetIds = sheets.map(s => s.id)
  const cells = db
    .prepare(
      `
      SELECT id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, format_text, style_key, side
      FROM report_cells
      WHERE report_sheet_id IN (${sheetIds.map(() => '?').join(', ')})
      `
    )
    .all(...sheetIds) as ReportCellRow[]

  const cellsBySheetId = new Map<string, ReportCellRow[]>()
  for (const cell of cells) {
    const bucket = cellsBySheetId.get(cell.report_sheet_id)
    if (bucket) bucket.push(cell)
    else cellsBySheetId.set(cell.report_sheet_id, [cell])
  }

  const accountSet = db
    .prepare('SELECT name FROM account_sets WHERE id = ?')
    .get(accountSetId) as { name: string } | undefined

  const executedSheets = executeTemplateSheets(
    sheets.map(sheet => ({
      id: sheet.id,
      report_definition_id: definition.id,
      sheet_key: `sheet_${sheet.sheet_index + 1}`,
      sheet_name: sheet.sheet_name,
      sheet_index: sheet.sheet_index,
      cells: (cellsBySheetId.get(sheet.id) || []).map(cell => ({
        id: cell.id,
        report_sheet_id: cell.report_sheet_id,
        row_index: cell.row_index,
        col_index: cell.col_index,
        cell_type: cell.cell_type,
        text_value: cell.text_value,
        formula_text: cell.formula_text,
        format_text: cell.format_text,
        style_key: cell.style_key,
        side: cell.side,
      })),
    })),
    {
      db,
      accountSetId,
      year,
      period,
      unitName: accountSet?.name || '',
    }
  )

  const workbook = await loadWorkbookForExport(templatePath, storedExcel)
  const sheetBoundsList: SheetBounds[] = []

  for (const executedSheet of executedSheets) {
    const meta = sheets.find(s => s.id === executedSheet.id)
    if (!meta) continue

    const worksheet = pickWorksheet(workbook, meta.sheet_name, meta.sheet_index)
    if (!worksheet) continue

    const templateDataKeys = collectTemplateDataCellKeys(worksheet)
    const executedCells = executedSheet.cells as ExecutedCell[]

    for (const cell of executedCells) {
      const cellKey = `${cell.row_index}:${cell.col_index}`
      if (!templateDataKeys.has(cellKey)) continue

      const excelCell = worksheet.getRow(cell.row_index + 1).getCell(cell.col_index + 1)
      writeExecutedValue(excelCell, cell)
    }

    const bounds = computeExportBounds(templateDataKeys, executedCells)
    if (bounds) {
      clearWorksheetOutsideBounds(worksheet, bounds)
    }
    sheetBoundsList.push(
      bounds ?? { minRow: 0, maxRow: -1, minCol: 0, maxCol: -1 }
    )
  }

  let buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  if (sheetBoundsList.some(bounds => bounds.maxRow >= 0)) {
    buffer = await patchXlsxWorksheetBounds(buffer, sheetBoundsList)
  }
  const safeName = (definition.name || reportCode).replace(/[\\/:*?"<>|]/g, '_')
  const fileName = `${safeName}_${year}年${period}月.xlsx`

  return { buffer, fileName }
}
