import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import {
  buildIndirectMethodSchedule,
  calcNetProfitForPeriod,
} from '../services/cashFlowIndirectMethod.js'

function seedSmallBusinessSet(db: Database, accountSetId: string) {
  db.exec(`
    CREATE TABLE account_sets (id TEXT PRIMARY KEY);
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      account_set_id TEXT,
      code TEXT,
      name TEXT,
      direction TEXT,
      parent_id TEXT,
      is_enabled INTEGER DEFAULT 1
    );
    CREATE TABLE init_balances (
      id TEXT PRIMARY KEY,
      account_set_id TEXT,
      account_id TEXT,
      year INTEGER,
      init_balance REAL,
      aux_item_id TEXT DEFAULT ''
    );
    CREATE TABLE account_balances (
      id TEXT PRIMARY KEY,
      account_set_id TEXT,
      account_id TEXT,
      year INTEGER,
      period INTEGER,
      current_debit REAL,
      current_credit REAL
    );
  `)

  db.prepare(`INSERT INTO account_sets VALUES (?)`).run(accountSetId)

  const accounts: Array<[string, string, string, string]> = [
    ['5001', '5001', '主营业务收入', 'credit'],
    ['5401', '5401', '主营业务成本', 'debit'],
    ['1602', '1602', '累计折旧', 'credit'],
    ['1122', '1122', '应收账款', 'debit'],
    ['2202', '2202', '应付账款', 'credit'],
  ]

  for (const [id, code, name, direction] of accounts) {
    db.prepare(
      `INSERT INTO accounts (id, account_set_id, code, name, direction, parent_id, is_enabled)
       VALUES (?, ?, ?, ?, ?, NULL, 1)`
    ).run(id, accountSetId, code, name, direction)
  }

  const bal = (
    accountId: string,
    period: number,
    debit: number,
    credit: number
  ) => {
    db.prepare(
      `INSERT INTO account_balances VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), accountSetId, accountId, 2026, period, debit, credit)
  }

  bal('5001', 5, 0, 1000)
  bal('5401', 5, 600, 0)
  bal('1602', 4, 0, 50)
  bal('1602', 5, 0, 80)
  bal('1122', 4, 200, 0)
  bal('1122', 5, 300, 0)
  bal('2202', 4, 0, 100)
  bal('2202', 5, 0, 150)
}

describe('cashFlowIndirectMethod', () => {
  it('应计算净利润及间接法经营活动净额', () => {
    const db = new Database(':memory:')
    const accountSetId = 'set-indirect'
    seedSmallBusinessSet(db, accountSetId)

    const profit = calcNetProfitForPeriod(db, accountSetId, 2026, 5, undefined, 'ytd')
    expect(profit.profitLabel).toBe('净利润')
    expect(profit.netProfit).toBe(400)

    const schedule = buildIndirectMethodSchedule(db, accountSetId, 2026, 5, 'ytd')
    expect(schedule.netProfit).toBe(400)
    expect(schedule.adjustments.some(a => a.label.includes('折旧'))).toBe(true)
    // ytd：400 + 折旧130(0→130) - 应收500(0→500) + 应付250(0→250)
    expect(schedule.operatingCashNet).toBe(280)
  })
})
