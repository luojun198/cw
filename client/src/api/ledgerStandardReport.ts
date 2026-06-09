import request from '@/api/request'

export interface RhStandardReportCell {
  id: string
  report_id: string
  row_index: number
  col_index: number
  text_value: string | null
  formula_text: string | null
}

export interface RhStandardReport {
  id: string
  account_set_id: string
  name: string
  code?: string
  created_at: string
}

export interface RhStandardReportDetail extends RhStandardReport {
  source_file?: string | null
  cells: RhStandardReportCell[]
}

export interface RhStandardReportComputedCell {
  row_index: number
  col_index: number
  display_value: string
  numeric_value: number | null
  status: 'ok' | 'error'
}

export interface RhStandardReportComputed {
  year: number
  period: number
  maxRow: number
  maxCol: number
  cells: RhStandardReportComputedCell[]
}

export function uploadAcdForStandardReports(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<{ id: string; name: string }[]>('/ledger/standard-reports/upload', formData, {
    timeout: 60000
  })
}

export function getStandardReports() {
  return request.get<RhStandardReport[]>('/ledger/standard-reports')
}

export function getStandardReportDetail(id: string) {
  return request.get<RhStandardReportDetail>(`/ledger/standard-reports/${id}`)
}

export function deleteStandardReport(id: string) {
  return request.delete<null>(`/ledger/standard-reports/${id}`)
}

export function computeStandardReport(id: string, params: { year: number; period: number }) {
  return request.get<RhStandardReportComputed>(`/ledger/standard-reports/${id}/compute`, { params })
}
