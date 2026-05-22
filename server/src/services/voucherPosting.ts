import { v4 as uuidv4 } from 'uuid'
import { centsToYuan } from '../utils/amountUtils.js'
import { buildAuxItemId as buildAuxItemIdUtil } from '../utils/auxItemId.js'
import { checkPostingIntegrity } from './postingIntegrityCheck.js'

export interface VoucherEntryLike {
  account_id: string
  account_code: string
  account_name: string
  direction: 'debit' | 'credit'
  amount: number
  amount_cents?: number
  dept_id?: string | number | null
  project_id?: string | number | null
  supplier_id?: string | number | null
  person_id?: string | number | null
  func_class_id?: string | number | null
  aux_data?: string | null
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
    return '只有已记账的凭证可以反记账'
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
    if (!allowDirectPost) {
      return '该凭证尚未审核，不能记账'
    }
  }
  if (voucher.status === 'posted') {
    return '该凭证已记账'
  }
  return null
}

export function getVoucherStatusAfterUnpost(requireAudit: boolean) {
  return requireAudit ? 'audited' : 'draft'
}

/** @see utils/auxItemId.ts */
export function buildAuxItemId(entry: VoucherEntryLike): string {
  return buildAuxItemIdUtil(entry)
}

/** 过账/反过账始终优先使用数据库中的完整分录（避免调用方传入字段不全） */
function resolvePostingEntries(
  db: { prepare: (sql: string) => { all: (...args: any[]) => any[] } },
  voucherId: string,
  entries: VoucherEntryLike[]
): VoucherEntryLike[] {
  const dbEntries = loadVoucherEntries(db, voucherId)
  return dbEntries.length > 0 ? dbEntries : entries
}

export function applyVoucherPosting(db: any, voucher: VoucherLike, entries: VoucherEntryLike[], ctx: PostingContext) {
  const resolvedEntries = resolvePostingEntries(db, voucher.id, entries)

  const integrityCheck = checkPostingIntegrity(
    db,
    ctx.accountSetId,
    voucher.year,
    voucher.period,
    resolvedEntries,
    { entriesAlreadyPersisted: true }
  )
  if (!integrityCheck.isValid) {
    throw new Error(integrityCheck.errors.join('；'))
  }

  const postVoucher = db.prepare(
    "UPDATE vouchers SET status=?, poster_id=?, poster_name=?, posted_at=datetime('now'), updated_at=datetime('now') WHERE id=?"
  )

  const getInitBalance = db.prepare(`
    SELECT COALESCE(SUM(init_balance), 0) as init_balance
    FROM init_balances
    WHERE account_set_id=? AND account_id=? AND year=? AND aux_item_id=?
  `)

  const upsertBalance = db.prepare(`
    INSERT INTO account_balances (id, account_set_id, account_id, account_code, account_name, direction, year, period, init_balance, current_debit, current_credit, end_balance, end_debit, end_credit, aux_item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_set_id, account_id, year, period, aux_item_id) DO UPDATE SET
      init_balance = COALESCE(init_balance, excluded.init_balance),
      current_debit = current_debit + excluded.current_debit,
      current_credit = current_credit + excluded.current_credit,
      end_balance = CASE WHEN direction = 'debit'
        THEN COALESCE(init_balance, 0) + current_debit - current_credit
        ELSE COALESCE(init_balance, 0) + current_credit - current_debit
      END
  `)

  const transaction = db.transaction(() => {
    postVoucher.run('posted', ctx.userId, ctx.userName, voucher.id)

    for (const entry of resolvedEntries) {
      const isDebit = entry.direction === 'debit'
      const auxItemId = buildAuxItemId(entry)
      const initBalRow = getInitBalance.get(ctx.accountSetId, entry.account_id, voucher.year, auxItemId) as any
      const initBalance = initBalRow?.init_balance || 0

      // 优先使用整数字段计算，避免浮点误差
      const amountToUse = entry.amount_cents ? centsToYuan(entry.amount_cents) : entry.amount
      const currentDebit = isDebit ? amountToUse : 0
      const currentCredit = isDebit ? 0 : amountToUse

      // Compute end_balance for the INSERT case (first posting to this account/period)
      const endBalance = calcEndBalance(entry.direction, initBalance, currentDebit, currentCredit)

      upsertBalance.run(
        uuidv4(),
        ctx.accountSetId,
        entry.account_id,
        entry.account_code,
        entry.account_name,
        entry.direction,
        voucher.year,
        voucher.period,
        initBalance,
        currentDebit,
        currentCredit,
        endBalance,
        0,
        0,
        auxItemId
      )
    }
  })

  transaction()
}

/**
 * 计算期末余额
 * 借记科目: end_balance = init_balance + current_debit - current_credit
 * 贷记科目: end_balance = init_balance + current_credit - current_debit
 */
function calcEndBalance(direction: string, initBalance: number, currentDebit: number, currentCredit: number): number {
  if (direction === 'debit') {
    return initBalance + currentDebit - currentCredit
  }
  return initBalance + currentCredit - currentDebit
}

export function applyVoucherUnpost(db: any, voucher: VoucherLike, entries: VoucherEntryLike[], ctx: PostingContext) {
  const resolvedEntries = resolvePostingEntries(db, voucher.id, entries)

  const revertBalanceExact = db.prepare(`
    UPDATE account_balances SET
      current_debit = current_debit - ?,
      current_credit = current_credit - ?,
      end_balance = CASE WHEN direction = 'debit'
        THEN COALESCE(init_balance, 0) + current_debit - current_credit
        ELSE COALESCE(init_balance, 0) + current_credit - current_debit
      END
    WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?
  `)

  const revertBalanceFallback = db.prepare(`
    UPDATE account_balances SET
      current_debit = current_debit - ?,
      current_credit = current_credit - ?,
      end_balance = CASE WHEN direction = 'debit'
        THEN COALESCE(init_balance, 0) + current_debit - current_credit
        ELSE COALESCE(init_balance, 0) + current_credit - current_debit
      END
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
    for (const entry of resolvedEntries) {
      const isDebit = entry.direction === 'debit'

      // 优先使用整数字段计算，避免浮点误差
      const amountToUse = entry.amount_cents ? centsToYuan(entry.amount_cents) : entry.amount
      const debitAmount = isDebit ? amountToUse : 0
      const creditAmount = isDebit ? 0 : amountToUse

      const auxItemId = buildAuxItemId(entry)

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
