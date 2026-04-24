export interface BalanceQueryDb {
  prepare: (sql: string) => {
    get: (...params: Array<string | number>) => any
  }
}

export function getBalance(
  db: BalanceQueryDb,
  accountSetId: string,
  accountCode: string,
  year: number,
  period: number
): number {
  try {
    const init = db
      .prepare(
        `
      SELECT SUM(ib.init_balance) as init_balance, a.direction FROM init_balances ib
      JOIN accounts a ON a.id = ib.account_id
      WHERE ib.account_set_id=? AND (a.code=? OR a.code LIKE ?) AND ib.year=?
      GROUP BY a.direction
    `
      )
      .get(accountSetId, accountCode, `${accountCode}%`, year) as any

    const periodBal = db
      .prepare(
        `
      SELECT SUM(ab.current_debit) as current_debit, SUM(ab.current_credit) as current_credit, a.direction FROM account_balances ab
      JOIN accounts a ON a.id = ab.account_id
      WHERE ab.account_set_id=? AND (a.code=? OR a.code LIKE ?) AND ab.year=? AND ab.period<=?
      GROUP BY a.direction
    `
      )
      .get(accountSetId, accountCode, `${accountCode}%`, year, period) as any

    if (!init && !periodBal) return 0

    const initBal = init?.init_balance || 0
    const dir = init?.direction || periodBal?.direction || 'debit'

    if (dir === 'debit') {
      return initBal + (periodBal?.current_debit || 0) - (periodBal?.current_credit || 0)
    }

    return initBal + (periodBal?.current_credit || 0) - (periodBal?.current_debit || 0)
  } catch {
    return 0
  }
}

export function getPeriodSum(
  db: BalanceQueryDb,
  accountSetId: string,
  accountCode: string,
  year: number,
  period: number
): { debit: number; credit: number } {
  try {
    const row = db
      .prepare(
        `
      SELECT
        SUM(ab.current_debit) as total_debit,
        SUM(ab.current_credit) as total_credit
      FROM account_balances ab
      JOIN accounts a ON a.id = ab.account_id
      WHERE ab.account_set_id=? AND a.code LIKE ? AND ab.year=? AND ab.period<=?
    `
      )
      .get(accountSetId, `${accountCode}%`, year, period) as any

    return {
      debit: row?.total_debit || 0,
      credit: row?.total_credit || 0,
    }
  } catch {
    return { debit: 0, credit: 0 }
  }
}
