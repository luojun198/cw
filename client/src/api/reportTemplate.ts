import request from './request'

export type MergeInfo = {
  colSpan: number
  rowSpan: number
}

export type TemplateDefinition = {
  id: string
  code: string
  name: string
  source: string
  source_file: string | null
  sort_order: number
  is_enabled: boolean
}

export type TemplateSource = {
  source_file: string
  source_type: string
  content_encoding: string | null
  parse_version: string | null
  created_at: string
} | null

export type FormulaFunction = {
  function_name: string
  handler_key: string
  description: string | null
}

export type TemplateCell = {
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
  col_width: number | null
  row_height: number | null
  merge_info: string | null
}

export type TemplateSheet = {
  id: string
  report_definition_id: string
  sheet_key: string
  sheet_name: string
  sheet_index: number
  default_col_width: number | null
  default_row_height: number | null
  col_widths: string | null
  row_heights: string | null
  metrics: {
    cellCount: number
    rowCount: number
    colCount: number
    errorCount?: number
  }
  cells: TemplateCell[]
}

export type TemplateDetailData = {
  definition: TemplateDefinition
  source: TemplateSource
  formulaFunctions: FormulaFunction[]
  sheets: TemplateSheet[]
}

export type UpdateReportCellPayload = {
  id?: string
  row_index?: number
  col_index?: number
  text_value?: string | null
  formula_text?: string | null
  format_text?: string | null
  cell_type?: string
  col_width?: number | null
  row_height?: number | null
  merge_info?: string | MergeInfo | null
}

export type SaveTemplateCellsRequest = {
  sheetId: string
  cells: UpdateReportCellPayload[]
}

export function normalizeMergeInfoInput(
  input: string | MergeInfo | null | undefined
): string | null {
  if (input == null || input === '') return null

  const obj = typeof input === 'string' ? (JSON.parse(input) as Partial<MergeInfo>) : input
  const colSpan = Number(obj.colSpan ?? 1)
  const rowSpan = Number(obj.rowSpan ?? 1)

  if (!Number.isInteger(colSpan) || colSpan < 1) {
    throw new Error('merge_info.colSpan 必须是大于等于 1 的整数')
  }
  if (!Number.isInteger(rowSpan) || rowSpan < 1) {
    throw new Error('merge_info.rowSpan 必须是大于等于 1 的整数')
  }
  if (colSpan === 1 && rowSpan === 1) return null

  return JSON.stringify({ colSpan, rowSpan })
}

export async function getTemplateDetail(code: string): Promise<TemplateDetailData> {
  const res = await request.get<TemplateDetailData>(`/report/templates/${code}`)
  return res.data
}

export async function saveTemplateCells(
  code: string,
  payload: SaveTemplateCellsRequest
): Promise<void> {
  const normalized: SaveTemplateCellsRequest = {
    sheetId: payload.sheetId,
    cells: payload.cells.map(cell => ({
      ...cell,
      merge_info:
        cell.merge_info === undefined ? undefined : normalizeMergeInfoInput(cell.merge_info),
    })),
  }

  await request.put(`/report/templates/${code}/cells`, normalized)
}
