import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCashBankLeavesByRootCode } from '../routes/dashboard.js'

describe('dashboard cash bank structure', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        account_set_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL,
        parent_id TEXT,
        is_enabled INTEGER DEFAULT 1,
        is_cash INTEGER DEFAULT 0,
        is_bank INTEGER DEFAULT 0
      );

      CREATE TABLE init_balances (
        id TEXT PRIMARY KEY,
        account_set_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        init_balance REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE vouchers (
        id TEXT PRIMARY KEY,
        account_set_id TEXT NOT NULL,
        voucher_date TEXT NOT NULL
      );

      CREATE TABLE voucher_entries (
        id TEXT PRIMARY KEY,
        account_set_id TEXT NOT NULL,
        voucher_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount REAL NOT NULL
      );
    `)

    const insertAccount = db.prepare(`
      INSERT INTO accounts (id, account_set_id, code, name, direction, parent_id, is_enabled, is_cash, is_bank)
      VALUES (?, 'set-1', ?, ?, 'debit', ?, ?, ?, ?)
    `)
    insertAccount.run('cash-root', '1001', '不依赖名称的现金根', null, 1, 0, 0)
    insertAccount.run('cash-leaf', '100101', '现金下级', 'cash-root', 1, 0, 0)
    insertAccount.run('bank-root', '1002', '不依赖名称的银行根', null, 1, 0, 0)
    insertAccount.run('name-cash', '1999', '现金', null, 1, 1, 0)
    insertAccount.run('flag-bank', '2999', '其他银行科目', null, 1, 0, 1)

    const insertInit = db.prepare(`
      INSERT INTO init_balances (id, account_set_id, account_id, year, init_balance)
      VALUES (?, 'set-1', ?, 2026, ?)
    `)
    insertInit.run('init-cash-root', 'cash-root', 9999)
    insertInit.run('init-cash-leaf', 'cash-leaf', 100)
    insertInit.run('init-bank-root', 'bank-root', 200)
    insertInit.run('init-name-cash', 'name-cash', 8888)
    insertInit.run('init-flag-bank', 'flag-bank', 7777)

    db.prepare("INSERT INTO vouchers (id, account_set_id, voucher_date) VALUES ('v1', 'set-1', '2026-01-15')").run()
    const insertEntry = db.prepare(`
      INSERT INTO voucher_entries (id, account_set_id, voucher_id, account_id, direction, amount)
      VALUES (?, 'set-1', 'v1', ?, ?, ?)
    `)
    insertEntry.run('entry-cash-debit', 'cash-leaf', 'debit', 20)
    insertEntry.run('entry-cash-credit', 'cash-leaf', 'credit', 5)
    insertEntry.run('entry-bank-credit', 'bank-root', 'credit', 30)
  })

  afterEach(() => {
    db.close()
  })

  it('现金结构只读取 1001 及其启用叶子下级，不按名称或标记回退', () => {
    const rows = getCashBankLeavesByRootCode(db as any, 'set-1', '1001', 2026, '2026-01-31')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code: '100101', name: '现金下级', balance: 115 })
  })

  it('银行结构在 1002 没有下级时读取 1002 本身', () => {
    const rows = getCashBankLeavesByRootCode(db as any, 'set-1', '1002', 2026, '2026-01-31')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code: '1002', balance: 170 })
  })
})
