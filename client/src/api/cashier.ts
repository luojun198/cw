import request from './request'

export interface CashierAccount {
  code: string
  name: string
  is_cash: number
  is_bank: number
}

export interface JournalRow {
  id: string
  account_code: string
  currency: string
  biz_date: string
  seq: number
  summary: string | null
  debit: number
  credit: number
  settle_type: string | null
  bill_no: string | null
  counter_unit: string | null
  counter_account: string | null
  bank_name: string | null
  bank_account: string | null
  counter_aux_item_id: string | null
  reconciled: number
  voucher_year: number | null
  voucher_month: number | null
  voucher_type: number | null
  voucher_no: number | null
  balance?: number
}

export interface JournalResult {
  opening: number
  rows: JournalRow[]
  closing: number
  totalDebit: number
  totalCredit: number
}

export interface BankStatement {
  id: string
  account_code: string
  biz_date: string
  debit: number
  credit: number
  settle_type: string | null
  bill_no: string | null
  matched: number
  match_batch: number | null
  source: string
}

export interface SettleType {
  code: string
  name: string
}

export const cashierApi = {
  getAccounts: () =>
    request.get<CashierAccount[]>('/cashier/accounts'),

  getInitBalances: () =>
    request.get<any[]>('/cashier/init-balance'),

  upsertInitBalance: (data: { account_code: string; currency?: string; balance: number; init_date?: string }) =>
    request.put('/cashier/init-balance', data),

  getJournal: (params: {
    account_code: string
    currency?: string
    start_date?: string
    end_date?: string
  }) => request.get<JournalResult>('/cashier/journal', { params }),

  createJournal: (data: Partial<JournalRow>) =>
    request.post<{ id: string }>('/cashier/journal', data),

  updateJournal: (id: string, data: Partial<JournalRow>) =>
    request.put(`/cashier/journal/${id}`, data),

  deleteJournal: (id: string) =>
    request.delete(`/cashier/journal/${id}`),

  getBankStatements: (params: {
    account_code?: string
    start_date?: string
    end_date?: string
    matched?: number
  }) => request.get<BankStatement[]>('/cashier/bank-statement', { params }),

  createBankStatement: (data: Partial<BankStatement>) =>
    request.post<{ id: string }>('/cashier/bank-statement', data),

  autoReconcile: (data: { account_code: string; start_date?: string; end_date?: string }) =>
    request.post<{ matched: number; batch: number }>('/cashier/reconcile/auto', data),

  getSettleTypes: () =>
    request.get<SettleType[]>('/cashier/settle-types'),

  // 银行余额调节表
  getReconciliation: (params: { account_code: string; end_date: string }) =>
    request.get<ReconciliationData>('/cashier/reconciliation', { params }),

  // 银行对账单导入
  uploadStatement: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request.post<{ preview_id: string; filename: string; total_rows: number; sample_rows: any[][] }>(
      '/cashier/bank-statement/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } as any }
    )
  },
  confirmImport: (data: { preview_id: string; account_code: string; mapping: Record<string, number>; skip_rows?: number; header_row?: number }) =>
    request.post<{ inserted: number }>('/cashier/bank-statement/import/confirm', data),
  getImportProfiles: () =>
    request.get<Record<string, any>>('/cashier/bank-statement/import/profiles'),

  // 出纳 → 凭证
  generateVoucher: (data: { account_code: string; start_date?: string; end_date?: string }) =>
    request.post<{ voucherId: string; voucherNo: string; syncedCount: number }>('/cashier/generate-voucher', data),

  // 出纳日报
  getDailyReport: (date: string) =>
    request.get<{ rows: DailyReportRow[]; total_income: number; total_expense: number }>('/cashier/daily-report', { params: { date } }),

  // 出纳初始化
  reset: () => request.post('/cashier/reset', {}),
}

export interface DailyReportRow {
  account_code: string
  account_name: string
  opening: number
  income: number
  expense: number
  closing: number
}

export interface ReconciliationData {
  account_code: string
  end_date: string
  enterprise_balance: number
  bank_balance: number
  enterprise_recorded: { biz_date: string; summary: string | null; debit: number; credit: number; settle_type: string | null; bill_no: string | null }[]
  bank_recorded: { biz_date: string; debit: number; credit: number; settle_type: string | null; bill_no: string | null }[]
  adjusted_enterprise: number
  adjusted_bank: number
  difference: number
}
