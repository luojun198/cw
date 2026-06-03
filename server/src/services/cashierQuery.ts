/**
 * 出纳查询服务：现金/银行日记账列表（含逐行余额）、银行对账自动勾对
 */
import { getDb } from '../db/index.js'
import { v4 as uuidv4 } from 'uuid'

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

// ── 银行余额调节表 ─────────────────────────────────────────

export interface ReconciliationData {
  account_code: string
  end_date: string
  /** 企业账面余额（期初 + 累计借 − 累计贷） */
  enterprise_balance: number
  /** 银行对账单余额（所有 statement 行借贷净额） */
  bank_balance: number
  /** 企业已记、银行未记（cashier_journal reconciled=0） */
  enterprise_recorded: { biz_date: string; summary: string | null; debit: number; credit: number; settle_type: string | null; bill_no: string | null }[]
  /** 银行已记、企业未记（bank_statement matched=0） */
  bank_recorded: { biz_date: string; debit: number; credit: number; settle_type: string | null; bill_no: string | null }[]
  /** 调节后企业余额 */
  adjusted_enterprise: number
  /** 调节后银行余额 */
  adjusted_bank: number
  /** 差额（应为 0） */
  difference: number
}

/**
 * 生成银行余额调节表
 * 调节后余额 = 企业账面余额 − 企业已记银行未记付方 + 银行已记企业未记收方
 *              = 银行账面余额 − 银行已记企业未记付方 + 企业已记银行未记收方
 */
export function getBankReconciliation(params: {
  accountSetId: string
  accountCode: string
  currency?: string
  endDate: string
}): ReconciliationData {
  const db = getDb()
  const { accountSetId, accountCode } = params
  const currency = params.currency || 'RMB'
  const endDate = params.endDate

  // 1. 企业账面余额 = 期初 + 累计借 − 累计贷（截至 endDate）
  const opening = getInitBalance(accountSetId, accountCode, currency)
  const entResult = db.prepare(`
    SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
    FROM cashier_journal
    WHERE account_set_id=? AND account_code=? AND currency=? AND biz_date <= ?
  `).get(accountSetId, accountCode, currency, endDate) as { d: number; c: number }
  const enterpriseBalance = opening + entResult.d - entResult.c

  // 2. 银行对账单余额（所有 statement 借贷净额）
  const bankResult = db.prepare(`
    SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
    FROM bank_statement
    WHERE account_set_id=? AND account_code=? AND biz_date <= ?
  `).get(accountSetId, accountCode, endDate) as { d: number; c: number }
  const bankBalance = bankResult.d - bankResult.c

  // 3. 企业已记银行未记（reconciled=0 的日记账）
  const enterpriseRecorded = db.prepare(`
    SELECT biz_date, summary, debit, credit, settle_type, bill_no
    FROM cashier_journal
    WHERE account_set_id=? AND account_code=? AND currency=? AND biz_date <= ? AND reconciled=0
    ORDER BY biz_date, seq
  `).all(accountSetId, accountCode, currency, endDate) as any[]

  // 4. 银行已记企业未记（matched=0 的对账单）
  const bankRecorded = db.prepare(`
    SELECT biz_date, debit, credit, settle_type, bill_no
    FROM bank_statement
    WHERE account_set_id=? AND account_code=? AND biz_date <= ? AND matched=0
    ORDER BY biz_date, id
  `).all(accountSetId, accountCode, endDate) as any[]

  // 5. 计算调节后余额
  const entUnrecTotal = enterpriseRecorded.reduce((s, r) => s + r.credit - r.debit, 0)
  const bankUnrecTotal = bankRecorded.reduce((s, r) => s + r.credit - r.debit, 0)

  // 调节后企业余额 = 企业账面余额 - 企业已记银行未记(付方) + 银行已记企业未记(收方)
  // 用未达项净影响：银行未达 = (贷-借) 净支出，企业未达 = (贷-借) 净支出
  // 简化：调节后 = 企业余额 − (企业未达支出 − 企业未达收入) + (银行未达收入 − 银行未达支出)
  const enterpriseUnrecDebit = enterpriseRecorded.reduce((s, r) => s + r.credit, 0)
  const enterpriseUnrecCredit = enterpriseRecorded.reduce((s, r) => s + r.debit, 0)
  const bankUnrecDebit = bankRecorded.reduce((s, r) => s + r.credit, 0)
  const bankUnrecCredit = bankRecorded.reduce((s, r) => s + r.debit, 0)

  // 调节后企业余额 = 企业账面余额 + 银行已收企业未收 - 银行已付企业未付
  const adjustedEnterprise = enterpriseBalance + bankUnrecCredit - bankUnrecDebit
  // 调节后银行余额 = 银行账面余额 + 企业已收银行未收 - 企业已付银行未付
  const adjustedBank = bankBalance + enterpriseUnrecCredit - enterpriseUnrecDebit

  return {
    account_code: accountCode,
    end_date: endDate,
    enterprise_balance: Math.round(enterpriseBalance * 100) / 100,
    bank_balance: Math.round(bankBalance * 100) / 100,
    enterprise_recorded: enterpriseRecorded,
    bank_recorded: bankRecorded,
    adjusted_enterprise: Math.round(adjustedEnterprise * 100) / 100,
    adjusted_bank: Math.round(adjustedBank * 100) / 100,
    difference: Math.round((adjustedEnterprise - adjustedBank) * 100) / 100,
  }
}

// ── 出纳对账 → 生成凭证 ─────────────────────────────────

export function generateCashierVoucher(params: {
  db: any
  accountSetId: string
  accountCode: string
  startDate?: string
  endDate?: string
  makerName: string
}): { voucherId: string; voucherNo: string; syncedCount: number } | { error: string } {
  const { db, accountSetId, accountCode, startDate, endDate, makerName } = params

  // 1. 查询已勾对且未生成凭证的出纳日记账
  const conds = ['j.account_set_id=?', 'j.account_code=?', 'j.reconciled=1', 'j.voucher_no IS NULL']
  const vals: any[] = [accountSetId, accountCode]
  if (startDate) { conds.push('j.biz_date >= ?'); vals.push(startDate) }
  if (endDate)   { conds.push('j.biz_date <= ?'); vals.push(endDate) }
  const rows = db.prepare(`
    SELECT j.* FROM cashier_journal j
    WHERE ${conds.join(' AND ')}
    ORDER BY j.biz_date, j.seq
  `).all(...vals) as any[]
  if (rows.length === 0) return { error: '所选范围内没有已对账且未生成凭证的记录' }

  // 2. 取凭证类型（首个可用类型）
  const vt = db.prepare(`
    SELECT id FROM voucher_types WHERE account_set_id=? OR account_set_id IS NULL
    ORDER BY sort_order, code LIMIT 1
  `).get(accountSetId) as any
  const voucherTypeId = vt?.id || null

  // 3. 取本期最大凭证号
  const bizDate = endDate || rows[rows.length - 1].biz_date
  const [year, month] = bizDate.split('-').map(Number)
  const lastNo = (db.prepare(`
    SELECT CAST(
      CASE WHEN INSTR(voucher_no,'-')>0 THEN SUBSTR(voucher_no,INSTR(voucher_no,'-')+1) ELSE voucher_no END
      AS INTEGER) no
    FROM vouchers WHERE account_set_id=? AND year=? AND period=?
    ORDER BY no DESC LIMIT 1
  `).get(accountSetId, year, month) as any)?.no ?? 0
  const voucherNo = String(lastNo + 1).padStart(3, '0')

  // 4. 汇总：流入(借) → 贷方是对手科目；流出(贷) → 借方是对手科目
  const counterMap = new Map<string, number>()
  let totalDebit = 0, totalCredit = 0
  for (const r of rows) {
    if (r.debit > 0) { totalDebit += r.debit }
    if (r.credit > 0) { totalCredit += r.credit }
    const acc = r.counter_account || '9999' // 未填对方科目归入"其他"
    counterMap.set(acc, (counterMap.get(acc) ?? 0) + (r.debit > 0 ? r.debit : -r.credit))
  }

  // 5. 取科目 id
  const lookup = db.prepare('SELECT id, name FROM accounts WHERE account_set_id=? AND code=? LIMIT 1')
  const cashAcc = lookup.get(accountSetId, accountCode) as any
  if (!cashAcc) return { error: `科目 ${accountCode} 在账套中不存在` }

  const missingCodes: string[] = []
  for (const [code] of counterMap) {
    if (code === '9999') continue
    if (!lookup.get(accountSetId, code)) missingCodes.push(code)
  }
  if (missingCodes.length > 0) return { error: `对方科目不存在：${missingCodes.join('、')}。请补全出纳记录中的对方科目。` }

  // 6. 生成凭证
  const voucherId = uuidv4()
  db.prepare(`
    INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period,
      total_amount, maker_name, remark, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cashier')
  `).run(voucherId, accountSetId, voucherNo, voucherTypeId, bizDate, year, month,
    Math.max(totalDebit, totalCredit), makerName, `出纳对账生成 — ${accountCode}`)

  const insEntry = db.prepare(`
    INSERT INTO voucher_entries
      (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, amount_cents, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let seq = 1

  for (const [counterCode, amt] of counterMap) {
    const cAcc = counterCode === '9999' ? { id: null, name: '其他' } : lookup.get(accountSetId, counterCode) as any
    const absAmt = Math.abs(amt)
    if (amt > 0) {
      // 对方科目在借方 → 现金科目在贷方（现金流出，如付款）
      insEntry.run(uuidv4(), accountSetId, voucherId, seq++, cAcc?.id || null, counterCode, cAcc?.name || counterCode, 'debit', absAmt, Math.round(absAmt * 100), '出纳对账生成')
      if (cashAcc) insEntry.run(uuidv4(), accountSetId, voucherId, seq++, cashAcc.id, accountCode, cashAcc.name, 'credit', absAmt, Math.round(absAmt * 100), '出纳对账生成')
    } else {
      // 对方科目在贷方 → 现金科目在借方（现金流入，如收款）
      if (cashAcc) insEntry.run(uuidv4(), accountSetId, voucherId, seq++, cashAcc.id, accountCode, cashAcc.name, 'debit', absAmt, Math.round(absAmt * 100), '出纳对账生成')
      insEntry.run(uuidv4(), accountSetId, voucherId, seq++, cAcc?.id || null, counterCode, cAcc?.name || counterCode, 'credit', absAmt, Math.round(absAmt * 100), '出纳对账生成')
    }
  }

  // 7. 回填出纳日记账凭证回链
  const updateJournal = db.prepare(`
    UPDATE cashier_journal SET voucher_year=?, voucher_month=?, voucher_type=?, voucher_no=?, updated_at=datetime('now')
    WHERE id=?
  `)
  let syncedCount = 0
  for (const r of rows) {
    updateJournal.run(year, month, voucherTypeId ? null : null, voucherNo, r.id)
    syncedCount++
  }

  return { voucherId, voucherNo, syncedCount }
}

// ── 出纳日报 ─────────────────────────────────────────────

export interface DailyReportRow {
  account_code: string
  account_name: string
  opening: number
  income: number   // 借方
  expense: number  // 贷方
  closing: number
}

export function getDailyReport(params: {
  accountSetId: string
  date: string
}): { rows: DailyReportRow[]; total_income: number; total_expense: number } {
  const db = getDb()
  const { accountSetId, date } = params

  // 现金+银行科目列表
  const accounts = db.prepare(`
    SELECT a.code, a.name FROM accounts a
    WHERE a.account_set_id=? AND (a.is_cash=1 OR a.is_bank=1)
      AND NOT EXISTS (SELECT 1 FROM accounts c WHERE c.parent_id=a.id)
    ORDER BY a.code
  `).all(accountSetId) as Array<{ code: string; name: string }>

  const rows: DailyReportRow[] = []
  let totalIncome = 0, totalExpense = 0

  for (const acc of accounts) {
    const opening = getInitBalance(accountSetId, acc.code, 'RMB')
    // 当天之前的累计净额
    const before = db.prepare(`
      SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
      FROM cashier_journal WHERE account_set_id=? AND account_code=? AND currency='RMB' AND biz_date < ?
    `).get(accountSetId, acc.code, date) as { d: number; c: number }
    const dayBefore = opening + before.d - before.c

    // 当天收支
    const today = db.prepare(`
      SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
      FROM cashier_journal WHERE account_set_id=? AND account_code=? AND currency='RMB' AND biz_date = ?
    `).get(accountSetId, acc.code, date) as { d: number; c: number }

    const closing = dayBefore + today.d - today.c
    totalIncome += today.d
    totalExpense += today.c
    rows.push({
      account_code: acc.code,
      account_name: acc.name,
      opening: Math.round(dayBefore * 100) / 100,
      income: Math.round(today.d * 100) / 100,
      expense: Math.round(today.c * 100) / 100,
      closing: Math.round(closing * 100) / 100,
    })
  }

  return { rows, total_income: Math.round(totalIncome * 100) / 100, total_expense: Math.round(totalExpense * 100) / 100 }
}

// ── 凭证自动同步到出纳日记账 ───────────────────────────────

/**
 * 凭证保存/修改后，检查是否涉及现金/银行科目，
 * 若启用自动同步（system_params cashier:auto_sync=1），则自动生成/更新出纳日记账。
 *
 * 幂等策略：按 (account_set_id, voucher_year, voucher_month, voucher_type, voucher_no, account_code, biz_date) 查重，
 * 存在则更新金额/摘要，不存在则插入。
 */
export function syncCashierFromVoucher(params: {
  db: any
  accountSetId: string
  voucherDate: string
  voucherYear: number
  voucherMonth: number
  voucherType: number | string | null
  voucherNo: string
  entries: Array<{ account_code: string; direction: 'debit' | 'credit'; amount: number; summary?: string }>
}): { synced: number } {
  const { db, accountSetId, voucherDate, voucherYear, voucherMonth, voucherType, voucherNo, entries } = params

  // 检查是否启用自动同步（默认不启用，按账套独立配置）
  const cfg = db.prepare(
    "SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='cashier:auto_sync'"
  ).get(accountSetId) as any
  if (!cfg || cfg.param_value !== '1') return { synced: 0 }

  // 取现金/银行科目列表
  const cashBankCodes = db.prepare(
    'SELECT code FROM accounts WHERE account_set_id=? AND (is_cash=1 OR is_bank=1)'
  ).all(accountSetId) as Array<{ code: string }>
  const codeSet = new Set(cashBankCodes.map(a => a.code))

  const find = db.prepare(`
    SELECT id FROM cashier_journal
    WHERE account_set_id=? AND account_code=? AND biz_date=?
      AND voucher_year=? AND voucher_month=? AND voucher_type=? AND voucher_no=?
    LIMIT 1
  `)
  const insert = db.prepare(`
    INSERT INTO cashier_journal
      (id, account_set_id, account_code, currency, biz_date, seq, summary, debit, credit,
       counter_account, voucher_year, voucher_month, voucher_type, voucher_no, created_by)
    VALUES (?, ?, ?, 'RMB', ?, 0, ?, ?, ?, NULL, ?, ?, ?, ?, '凭证同步')
  `)
  const update = db.prepare(`
    UPDATE cashier_journal SET debit=?, credit=?, summary=?, updated_at=datetime('now') WHERE id=?
  `)

  let synced = 0
  // voucher_type 列定义为 INTEGER（ACD 兼容），CW 内部用 UUID，取不到数字则存 null
  const vtNum = Number(voucherType)
  const vt = (voucherType != null && voucherType !== '' && !isNaN(vtNum)) ? vtNum : null
  for (const entry of entries) {
    if (!codeSet.has(entry.account_code)) continue
    const debit = entry.direction === 'debit' ? entry.amount : 0
    const credit = entry.direction === 'credit' ? entry.amount : 0
    const summary = entry.summary || '凭证'

    const existing = find.get(accountSetId, entry.account_code, voucherDate,
      voucherYear, voucherMonth, vt, voucherNo) as any
    if (existing) {
      update.run(debit, credit, summary, existing.id)
    } else {
      insert.run(uuidv4(), accountSetId, entry.account_code, voucherDate, summary, debit, credit,
        voucherYear, voucherMonth, vt, voucherNo)
    }
    synced++
  }
  return { synced }
}
