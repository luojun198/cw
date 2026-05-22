import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import { buildAuxItemId, type VoucherEntryLike } from './voucherPosting.js'

type Direction = 'debit' | 'credit'

export interface ClosePeriodParams {
  db: Database
  accountSetId: string
  year: number
  period: number
  userId?: string | null
}

export interface YearEndBalanceRow {
  accountId: string
  accountCode: string
  accountName: string
  direction: Direction
  auxItemId: string
  initBalance: number
  initDebit: number
  initCredit: number
}

export interface ClosePeriodResult {
  closedYear: number
  closedPeriod: number
  nextYear?: number
  carriedCount: number
}

const MONEY_EPSILON = 0.005

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeAuxItemId(auxItemId: unknown) {
  return typeof auxItemId === 'string' ? auxItemId : ''
}

function toYearPeriod(value: number, label: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label}必须是整数`)
  }
}

export function getPeriodClosingRecord(params: {
  db: Database
  accountSetId: string
  year: number
  period: number
}) {
  return params.db
    .prepare('SELECT * FROM period_closing WHERE account_set_id=? AND year=? AND period=?')
    .get(params.accountSetId, params.year, params.period) as { id: string; status: string } | undefined
}

export function validateNoUnpostedVouchers(params: {
  db: Database
  accountSetId: string
  year: number
  period: number
}) {
  const row = params.db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM vouchers
      WHERE account_set_id = ?
        AND year = ?
        AND period = ?
        AND status <> 'posted'
    `
    )
    .get(params.accountSetId, params.year, params.period) as { count: number }

  if ((row?.count || 0) > 0) {
    throw new Error(`${params.year}年第${params.period}期存在未记账凭证，不能结账`)
  }
}

export function validatePreviousPeriodsClosed(params: {
  db: Database
  accountSetId: string
  year: number
}) {
  const accountSet = params.db
    .prepare('SELECT start_date FROM account_sets WHERE id=?')
    .get(params.accountSetId) as { start_date?: string | null } | undefined
  const startDate = accountSet?.start_date || ''
  const startYear = Number(startDate.slice(0, 4))
  const startMonth = Number(startDate.slice(5, 7))
  const firstPeriod = startYear === params.year && Number.isInteger(startMonth) && startMonth > 1 ? startMonth : 1

  const rows = params.db
    .prepare(
      `
      SELECT period
      FROM period_closing
      WHERE account_set_id = ?
        AND year = ?
        AND status = 'closed'
    `
    )
    .all(params.accountSetId, params.year) as Array<{ period: number }>
  const closedPeriods = new Set(rows.map(row => Number(row.period)))
  const missing: number[] = []
  for (let period = firstPeriod; period < 12; period += 1) {
    if (!closedPeriods.has(period)) {
      missing.push(period)
    }
  }

  if (missing.length > 0) {
    throw new Error(`年度结账前需先完成前序期间结账，未结账期间：${missing.join('、')}`)
  }
}

export function validateNextYearNotStarted(params: {
  db: Database
  accountSetId: string
  nextYear: number
}) {
  const row = params.db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM vouchers
      WHERE account_set_id = ?
        AND year = ?
    `
    )
    .get(params.accountSetId, params.nextYear) as { count: number }

  if ((row?.count || 0) > 0) {
    throw new Error(`${params.nextYear}年已存在凭证，不能覆盖生成该年度期初余额`)
  }
}

/** 年度反结账（12 月）前：下一年度若已有凭证，则不能撤销结转期初 */
export function validateNextYearHasNoVouchers(params: {
  db: Database
  accountSetId: string
  nextYear: number
}) {
  const row = params.db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM vouchers
      WHERE account_set_id = ?
        AND year = ?
    `
    )
    .get(params.accountSetId, params.nextYear) as { count: number }

  if ((row?.count || 0) > 0) {
    throw new Error(`${params.nextYear}年已存在凭证，不能反结账：请先处理下年凭证或联系管理员`)
  }
}

/** 反结账某月前：同年后续月份必须均为未结账 */
export function validateLaterPeriodsNotClosed(params: {
  db: Database
  accountSetId: string
  year: number
  period: number
}) {
  const row = params.db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM period_closing
      WHERE account_set_id = ?
        AND year = ?
        AND period > ?
        AND status = 'closed'
    `
    )
    .get(params.accountSetId, params.year, params.period) as { count: number }

  if ((row?.count || 0) > 0) {
    throw new Error('存在以后月份已结账，请先对较晚的会计期间执行反结账')
  }
}

/**
 * 撤销结账写入的下一年 1 月期初（与 writeNextYearInitBalances 作用域一致）
 */
export function deleteNextYearAutoOpeningBalances(params: {
  db: Database
  accountSetId: string
  nextYear: number
}) {
  params.db
    .prepare('DELETE FROM init_balances WHERE account_set_id=? AND year=? AND period=1')
    .run(params.accountSetId, params.nextYear)
}

function getInitBalanceRows(db: Database, accountSetId: string, year: number) {
  return db
    .prepare(
      `
      SELECT
        ib.account_id,
        a.code as account_code,
        a.name as account_name,
        a.direction,
        COALESCE(ib.aux_item_id, '') as aux_item_id,
        SUM(COALESCE(ib.init_balance, 0)) as init_balance
      FROM init_balances ib
      JOIN accounts a ON a.id = ib.account_id
      WHERE ib.account_set_id = ?
        AND ib.year = ?
        AND a.account_set_id = ?
        AND a.is_enabled = 1
      GROUP BY ib.account_id, aux_item_id
    `
    )
    .all(accountSetId, year, accountSetId) as Array<{
    account_id: string
    account_code: string
    account_name: string
    direction: Direction
    aux_item_id: string | null
    init_balance: number | null
  }>
}

function getPostedEntryRows(db: Database, accountSetId: string, year: number) {
  return db
    .prepare(
      `
      SELECT
        ve.*,
        a.direction as account_direction,
        a.code as account_code,
        a.name as account_name
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      JOIN accounts a ON a.id = ve.account_id
      WHERE ve.account_set_id = ?
        AND v.account_set_id = ?
        AND v.year = ?
        AND v.status = 'posted'
        AND a.is_enabled = 1
      ORDER BY v.voucher_date, v.voucher_no, ve.seq
    `
    )
    .all(accountSetId, accountSetId, year) as Array<
    VoucherEntryLike & {
      account_direction: Direction
    }
  >
}

function makeBalanceKey(accountId: string, auxItemId: string) {
  return `${accountId}\u0000${auxItemId}`
}

export function splitSignedBalance(direction: Direction, signedBalance: number) {
  const value = roundMoney(signedBalance)
  if (Math.abs(value) < MONEY_EPSILON) {
    return { initBalance: 0, initDebit: 0, initCredit: 0 }
  }

  if (direction === 'debit') {
    return value > 0
      ? { initBalance: value, initDebit: value, initCredit: 0 }
      : { initBalance: value, initDebit: 0, initCredit: Math.abs(value) }
  }

  return value > 0
    ? { initBalance: value, initDebit: 0, initCredit: value }
    : { initBalance: value, initDebit: Math.abs(value), initCredit: 0 }
}

export function buildYearEndBalances(db: Database, accountSetId: string, year: number): YearEndBalanceRow[] {
  const balances = new Map<string, YearEndBalanceRow>()

  for (const row of getInitBalanceRows(db, accountSetId, year)) {
    const auxItemId = normalizeAuxItemId(row.aux_item_id)
    const key = makeBalanceKey(row.account_id, auxItemId)
    balances.set(key, {
      accountId: row.account_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      direction: row.direction,
      auxItemId,
      initBalance: roundMoney(Number(row.init_balance || 0)),
      initDebit: 0,
      initCredit: 0,
    })
  }

  for (const entry of getPostedEntryRows(db, accountSetId, year)) {
    const auxItemId = buildAuxItemId(entry)
    const key = makeBalanceKey(entry.account_id, auxItemId)
    const current = balances.get(key) || {
      accountId: entry.account_id,
      accountCode: entry.account_code,
      accountName: entry.account_name,
      direction: entry.account_direction,
      auxItemId,
      initBalance: 0,
      initDebit: 0,
      initCredit: 0,
    }
    const amount = Number(entry.amount || 0)
    const sameDirection = entry.direction === current.direction
    current.initBalance = roundMoney(current.initBalance + (sameDirection ? amount : -amount))
    balances.set(key, current)
  }

  return [...balances.values()]
    .map(row => ({
      ...row,
      ...splitSignedBalance(row.direction, row.initBalance),
    }))
    .filter(row => Math.abs(row.initBalance) >= MONEY_EPSILON)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.auxItemId.localeCompare(b.auxItemId))
}

export function writeNextYearInitBalances(params: {
  db: Database
  accountSetId: string
  sourceYear: number
  rows: YearEndBalanceRow[]
}) {
  const nextYear = params.sourceYear + 1
  params.db
    .prepare('DELETE FROM init_balances WHERE account_set_id=? AND year=? AND period=1')
    .run(params.accountSetId, nextYear)

  const insert = params.db.prepare(
    `
    INSERT INTO init_balances (
      id, account_set_id, account_id, direction, year, period,
      init_balance, init_debit, init_credit, aux_item_id,
      opening_debit, opening_credit, pre_book_debit, pre_book_credit,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))
  `
  )

  for (const row of params.rows) {
    insert.run(
      uuidv4(),
      params.accountSetId,
      row.accountId,
      row.direction,
      nextYear,
      row.initBalance,
      row.initDebit,
      row.initCredit,
      row.auxItemId,
      row.initDebit,
      row.initCredit
    )
  }
}

export function closePeriodRecord(params: ClosePeriodParams) {
  const existing = getPeriodClosingRecord(params)
  if (existing?.status === 'closed') {
    throw new Error(`${params.year}年第${params.period}期已结账，不能重复结账`)
  }

  params.db
    .prepare(
      `
      INSERT INTO period_closing (id, account_set_id, year, period, status, closed_by, closed_at, created_at)
      VALUES (?, ?, ?, ?, 'closed', ?, datetime('now'), datetime('now'))
      ON CONFLICT(account_set_id, year, period) DO UPDATE SET
        status='closed',
        closed_by=excluded.closed_by,
        closed_at=excluded.closed_at
    `
    )
    .run(existing?.id || uuidv4(), params.accountSetId, params.year, params.period, params.userId || null)
}

export function closeAccountingPeriod(params: ClosePeriodParams): ClosePeriodResult {
  toYearPeriod(params.year, '会计年度')
  toYearPeriod(params.period, '会计期间')
  if (params.period < 1 || params.period > 12) {
    throw new Error('会计期间必须在1到12之间')
  }

  validateNoUnpostedVouchers(params)

  if (params.period !== 12) {
    const transaction = params.db.transaction(() => {
      closePeriodRecord(params)
    })
    transaction()
    return {
      closedYear: params.year,
      closedPeriod: params.period,
      carriedCount: 0,
    }
  }

  validatePreviousPeriodsClosed({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
  })
  validateNextYearNotStarted({
    db: params.db,
    accountSetId: params.accountSetId,
    nextYear: params.year + 1,
  })

  let carriedCount = 0
  const transaction = params.db.transaction(() => {
    const rows = buildYearEndBalances(params.db, params.accountSetId, params.year)
    writeNextYearInitBalances({
      db: params.db,
      accountSetId: params.accountSetId,
      sourceYear: params.year,
      rows,
    })
    closePeriodRecord(params)
    carriedCount = rows.length
  })

  transaction()
  return {
    closedYear: params.year,
    closedPeriod: params.period,
    nextYear: params.year + 1,
    carriedCount,
  }
}

export interface OpenPeriodResult {
  openedYear: number
  openedPeriod: number
  removedNextYearOpening?: boolean
  nextYear?: number
}

/**
 * 反结账：打开指定期间；若为 12 月年结，则同时删除下一年度由年结自动生成的 1 月期初余额。
 */
export function openAccountingPeriod(params: ClosePeriodParams): OpenPeriodResult {
  toYearPeriod(params.year, '会计年度')
  toYearPeriod(params.period, '会计期间')
  if (params.period < 1 || params.period > 12) {
    throw new Error('会计期间必须在1到12之间')
  }

  validateLaterPeriodsNotClosed({
    db: params.db,
    accountSetId: params.accountSetId,
    year: params.year,
    period: params.period,
  })

  const existing = getPeriodClosingRecord(params)
  if (existing?.status !== 'closed') {
    throw new Error(`${params.year}年第${params.period}期未结账或已反结账，无需反结账`)
  }

  if (params.period !== 12) {
    const transaction = params.db.transaction(() => {
      params.db
        .prepare(`UPDATE period_closing SET status='open' WHERE account_set_id=? AND year=? AND period=?`)
        .run(params.accountSetId, params.year, params.period)
    })
    transaction()
    return { openedYear: params.year, openedPeriod: params.period }
  }

  const nextYear = params.year + 1
  validateNextYearHasNoVouchers({
    db: params.db,
    accountSetId: params.accountSetId,
    nextYear,
  })

  const transaction = params.db.transaction(() => {
    deleteNextYearAutoOpeningBalances({
      db: params.db,
      accountSetId: params.accountSetId,
      nextYear,
    })
    params.db
      .prepare(`UPDATE period_closing SET status='open' WHERE account_set_id=? AND year=? AND period=?`)
      .run(params.accountSetId, params.year, params.period)
  })
  transaction()

  return {
    openedYear: params.year,
    openedPeriod: params.period,
    removedNextYearOpening: true,
    nextYear,
  }
}

/** 合并 12 个月显示状态（无记录视为未结账/open） */
export function buildYearPeriodStatusView(params: {
  db: Database
  accountSetId: string
  year: number
}) {
  const rows = params.db
    .prepare(`SELECT * FROM period_closing WHERE account_set_id=? AND year=? ORDER BY period`)
    .all(params.accountSetId, params.year) as Array<{
    period: number
    status: string
    closed_at?: string | null
    closed_by?: string | null
  }>

  const byPeriod = new Map(rows.map(r => [Number(r.period), r]))
  const months: Array<{
    period: number
    status: 'open' | 'closed'
    closedAt?: string | null
  }> = []

  for (let p = 1; p <= 12; p += 1) {
    const rec = byPeriod.get(p)
    const closed = rec?.status === 'closed'
    months.push({
      period: p,
      status: closed ? 'closed' : 'open',
      closedAt: closed ? rec?.closed_at ?? null : undefined,
    })
  }

  let yearEnd: { nextYear: number; openingBalanceRowCount: number } | undefined
  if (months[11]?.status === 'closed') {
    const countRow = params.db
      .prepare(
        `SELECT COUNT(*) as c FROM init_balances WHERE account_set_id = ? AND year = ? AND period = 1`
      )
      .get(params.accountSetId, params.year + 1) as { c: number }
    yearEnd = {
      nextYear: params.year + 1,
      openingBalanceRowCount: countRow?.c ?? 0,
    }
  }

  return {
    year: params.year,
    months,
    yearEnd,
  }
}
