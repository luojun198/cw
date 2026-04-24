import { v4 as uuidv4 } from 'uuid'

export interface VoucherEntryLike {
  account_id: string
  account_code: string
  account_name: string
  direction: 'debit' | 'credit'
  amount: number
  dept_id?: string | null
}

export interface VoucherLike {
  id: string
  year: number
  period: number
  status: 'draft' | 'audited' | 'posted'
}

export interface PostingContext {
  accountSetId: string
  userId?: string
  userName?: string
  requireAudit: boolean
  allowDirectPost: boolean
}

export function validateVoucherForUnpost(voucher: VoucherLike | null | undefined) {
  if (!voucher || voucher.status !== 'posted') {
    return '只有已过账的凭证可以反过账'
  }
  return null
}

export function getRequireAuditEnabled(requireAuditParam: { param_value?: string } | null | undefined) {
  return requireAuditParam?.param_value === 'true'
}

export function getAllowDirectPost(allowDirectPostParam: { param_value?: string } | null | undefined) {
  return allowDirectPostParam?.param_value === 'true'
}

export function loadVoucherEntries(db: {
  prepare: (sql: string) => { all: (...args: any[]) => any[] }
}, voucherId: string) {
  return db.prepare('SELECT * FROM voucher_entries WHERE voucher_id=?').all(voucherId) as VoucherEntryLike[]
}

export function validateVoucherCanPost(voucher: VoucherLike, requireAudit: boolean, allowDirectPost: boolean) {
  if (requireAudit && voucher.status === 'draft') {
    // 如果不允许直接过账，则必须先审核
    if (!allowDirectPost) {
      return '该凭证尚未审核，不能过账'
    }
    // 如果允许直接过账，凭证可以从 draft 直接到 posted
  }

  if (voucher.status === 'posted') {
    return '该凭证已过账'
  }

  return null
}

export function getVoucherStatusAfterUnpost(requireAudit: boolean) {
  return requireAudit ? 'audited' : 'draft'
}

export function applyVoucherPosting(db: any, voucher: VoucherLike, entries: VoucherEntryLike[], ctx: PostingContext) {
  const postVoucher = db.prepare(
    "UPDATE vouchers SET status=?, poster_id=?, poster_name=?, posted_at=datetime('now'), updated_at=datetime('now') WHERE id=?"
  )

  const upsertBalance = db.prepare(`
    INSERT INTO account_balances (id, account_set_id, account_id, account_code, account_name, direction, year, period, current_debit, current_credit, end_balance, end_debit, end_credit, aux_item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_set_id, account_id, year, period, aux_item_id) DO UPDATE SET
      current_debit = current_debit + excluded.current_debit,
      current_credit = current_credit + excluded.current_credit
  `)

  const transaction = db.transaction(() => {
    postVoucher.run('posted', ctx.userId, ctx.userName, voucher.id)

    for (const entry of entries) {
      const isDebit = entry.direction === 'debit'
      const auxItemId = (entry as any).dept_id || ''
      upsertBalance.run(
        uuidv4(),
        ctx.accountSetId,
        entry.account_id,
        entry.account_code,
        entry.account_name,
        entry.direction,
        voucher.year,
        voucher.period,
        isDebit ? entry.amount : 0,
        isDebit ? 0 : entry.amount,
        0,
        0,
        0,
        auxItemId
      )
    }
  })

  transaction()
}

export function applyVoucherUnpost(db: any, voucher: VoucherLike, entries: VoucherEntryLike[], ctx: PostingContext) {
  const revertBalanceExact = db.prepare(`
    UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ?
    WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?
  `)

  const revertBalanceFallback = db.prepare(`
    UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ?
    WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND (aux_item_id IS NULL OR aux_item_id='')
  `)

  const cleanupZeroBalance = db.prepare(`
    DELETE FROM account_balances
    WHERE account_set_id=? AND year=? AND period=?
      AND current_debit = 0 AND current_credit = 0
      AND COALESCE(init_balance, 0) = 0
  `)

  const unpostVoucher = db.prepare(
    "UPDATE vouchers SET status=?, poster_id=NULL, poster_name=NULL, posted_at=NULL, updated_at=datetime('now') WHERE id=?"
  )

  const transaction = db.transaction(() => {
    for (const entry of entries) {
      const isDebit = entry.direction === 'debit'
      const debitAmount = isDebit ? entry.amount : 0
      const creditAmount = isDebit ? 0 : entry.amount
      const auxItemId = (entry as any).dept_id || ''

      const result = revertBalanceExact.run(
        debitAmount,
        creditAmount,
        ctx.accountSetId,
        entry.account_id,
        voucher.year,
        voucher.period,
        auxItemId
      )

      if (!result.changes || result.changes === 0) {
        revertBalanceFallback.run(
          debitAmount,
          creditAmount,
          ctx.accountSetId,
          entry.account_id,
          voucher.year,
          voucher.period
        )
      }
    }

    cleanupZeroBalance.run(ctx.accountSetId, voucher.year, voucher.period)
    unpostVoucher.run(getVoucherStatusAfterUnpost(ctx.requireAudit), voucher.id)
  })

  transaction()
}
