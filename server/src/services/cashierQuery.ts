/**
 * 出纳查询服务：现金/银行日记账列表（含逐行余额）、银行对账自动勾对
 */
import { getDb } from '../db/index.js'

export interface CashierAccount {
  code: string
  name: string
  is_cash: number
  is_bank: number
}

/** 现金/银行类末级科目（出纳日记账左侧科目树） */
export function listCashierAccounts(accountSetId: string): CashierAccount[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT a.code, a.name, a.is_cash, a.is_bank
       FROM accounts a
       WHERE a.account_set_id = ?
         AND (a.is_cash = 1 OR a.is_bank = 1)
         AND NOT EXISTS (SELECT 1 FROM accounts c WHERE c.parent_id = a.id)
       ORDER BY a.code`
    )
    .all(accountSetId) as CashierAccount[]
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
  reconciled: number
  voucher_year: number | null
  voucher_month: number | null
  voucher_type: number | null
  voucher_no: number | null
  balance?: number
}

/** 出纳期初余额（无记录返回 0） */
export function getInitBalance(accountSetId: string, accountCode: string, currency = 'RMB'): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT balance FROM cashier_init_balance
       WHERE account_set_id = ? AND account_code = ? AND currency = ?`
    )
    .get(accountSetId, accountCode, currency) as { balance: number } | undefined
  return row?.balance ?? 0
}

/**
 * 日记账列表（按科目+币别+日期区间），返回逐行余额。
 * 现金/银行为借方科目：余额 = 期初 + 借 - 贷。
 */
export function listJournal(params: {
  accountSetId: string
  accountCode: string
  currency?: string
  startDate?: string
  endDate?: string
}): { opening: number; rows: JournalRow[]; closing: number; totalDebit: number; totalCredit: number } {
  const db = getDb()
  const { accountSetId, accountCode } = params
  const currency = params.currency || 'RMB'

  const opening = getInitBalance(accountSetId, accountCode, currency)

  // 区间前的累计净额，用于得到区间期初
  const conds = ['account_set_id = ?', 'account_code = ?', 'currency = ?']
  const before: any[] = [accountSetId, accountCode, currency]
  if (params.startDate) {
    conds.push('biz_date < ?')
    before.push(params.startDate)
  }
  const beforeNet = db
    .prepare(
      `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
       FROM cashier_journal WHERE ${conds.join(' AND ')}`
    )
    .get(...before) as { d: number; c: number }
  let running = opening + beforeNet.d - beforeNet.c
  const periodOpening = running

  const rowConds = ['account_set_id = ?', 'account_code = ?', 'currency = ?']
  const rowParams: any[] = [accountSetId, accountCode, currency]
  if (params.startDate) {
    rowConds.push('biz_date >= ?')
    rowParams.push(params.startDate)
  }
  if (params.endDate) {
    rowConds.push('biz_date <= ?')
    rowParams.push(params.endDate)
  }
  const rows = db
    .prepare(
      `SELECT * FROM cashier_journal
       WHERE ${rowConds.join(' AND ')}
       ORDER BY biz_date, seq, created_at`
    )
    .all(...rowParams) as JournalRow[]

  let totalDebit = 0
  let totalCredit = 0
  for (const r of rows) {
    running += r.debit - r.credit
    r.balance = running
    totalDebit += r.debit
    totalCredit += r.credit
  }

  return { opening: periodOpening, rows, closing: running, totalDebit, totalCredit }
}

/**
 * 银行对账自动勾对：按 金额(借/贷) + 日期 匹配未达账。
 * 将匹配到的日记账与对账单标记 reconciled/matched 同一 batch。
 */
export function autoReconcile(params: {
  accountSetId: string
  accountCode: string
  startDate?: string
  endDate?: string
}): { matched: number; batch: number } {
  const db = getDb()
  const { accountSetId, accountCode } = params

  const dateCond = (col: string, ps: any[]) => {
    const c = [`account_set_id = ?`, `account_code = ?`]
    ps.push(accountSetId, accountCode)
    if (params.startDate) {
      c.push(`${col} >= ?`)
      ps.push(params.startDate)
    }
    if (params.endDate) {
      c.push(`${col} <= ?`)
      ps.push(params.endDate)
    }
    return c.join(' AND ')
  }

  const jp: any[] = []
  const journal = db
    .prepare(
      `SELECT id, biz_date, debit, credit FROM cashier_journal
       WHERE ${dateCond('biz_date', jp)} AND reconciled = 0`
    )
    .all(...jp) as Array<{ id: string; biz_date: string; debit: number; credit: number }>

  const sp: any[] = []
  const statements = db
    .prepare(
      `SELECT id, biz_date, debit, credit FROM bank_statement
       WHERE ${dateCond('biz_date', sp)} AND matched = 0`
    )
    .all(...sp) as Array<{ id: string; biz_date: string; debit: number; credit: number }>

  const batch = Date.now() % 2147483647
  const markJ = db.prepare('UPDATE cashier_journal SET reconciled = 1 WHERE id = ?')
  const markS = db.prepare('UPDATE bank_statement SET matched = 1, match_batch = ? WHERE id = ?')

  let matched = 0
  const usedJournal = new Set<string>()
  const tx = db.transaction(() => {
    for (const st of statements) {
      const hit = journal.find(
        j =>
          !usedJournal.has(j.id) &&
          j.biz_date === st.biz_date &&
          Math.abs(j.debit - st.debit) < 0.005 &&
          Math.abs(j.credit - st.credit) < 0.005
      )
      if (hit) {
        usedJournal.add(hit.id)
        markJ.run(hit.id)
        markS.run(batch, st.id)
        matched++
      }
    }
  })
  tx()
  return { matched, batch }
}
