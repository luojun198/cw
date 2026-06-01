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

  upsertInitBalance: (data: { account_code: string; currency?: string; balance: number }) =>
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
}
