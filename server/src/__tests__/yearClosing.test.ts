import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  buildYearEndBalances,
  closeAccountingPeriod,
  openAccountingPeriod,
  splitSignedBalance,
} from '../services/yearClosing.js'

function createDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE account_sets (
      id TEXT PRIMARY KEY,
      start_date TEXT NOT NULL
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1
    );
    CREATE TABLE init_balances (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      init_balance REAL NOT NULL DEFAULT 0,
      init_debit REAL NOT NULL DEFAULT 0,
      init_credit REAL NOT NULL DEFAULT 0,
      aux_item_id TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      opening_debit REAL NOT NULL DEFAULT 0,
      opening_credit REAL NOT NULL DEFAULT 0,
      pre_book_debit REAL NOT NULL DEFAULT 0,
      pre_book_credit REAL NOT NULL DEFAULT 0,
      UNIQUE(account_set_id, account_id, year, period, aux_item_id)
    );
    CREATE TABLE vouchers (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      voucher_date TEXT NOT NULL,
      year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      status TEXT NOT NULL,
      total_amount REAL DEFAULT 0
    );
    CREATE TABLE voucher_entries (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL,
      voucher_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      account_code TEXT NOT NULL,
      account_name TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount REAL NOT NULL,
      dept_id TEXT,
      project_id TEXT,
      supplier_id TEXT,
      person_id TEXT,
      func_class_id TEXT,
      aux_data TEXT
    );
    CREATE TABLE period_closing (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      closed_by TEXT,
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_set_id, year, period)
    );
  `)
  db.prepare('INSERT INTO account_sets (id, start_date) VALUES (?, ?)').run('set-1', '2026-01-01')
  db.prepare('INSERT INTO accounts (id, account_set_id, code, name, direction) VALUES (?, ?, ?, ?, ?)').run(
    'cash',
    'set-1',
    '1001',
    '库存现金',
    'debit'
  )
  db.prepare('INSERT INTO accounts (id, account_set_id, code, name, direction) VALUES (?, ?, ?, ?, ?)').run(
    'payable',
    'set-1',
    '2202',
    '应付账款',
    'credit'
  )
  return db
}

function closeMonths(db: Database.Database) {
  const insert = db.prepare(
    "INSERT INTO period_closing (id, account_set_id, year, period, status) VALUES (?, 'set-1', 2026, ?, 'closed')"
  )
  for (let period = 1; period <= 11; period += 1) {
    insert.run(`close-${period}`, period)
  }
}

function insertVoucher(db: Database.Database, params: { id: string; period: number; status?: string }) {
  db.prepare(
    `
    INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_date, year, period, status)
    VALUES (?, 'set-1', ?, ?, 2026, ?, ?)
  `
  ).run(params.id, params.id, `2026-${String(params.period).padStart(2, '0')}-15`, params.period, params.status || 'posted')
}

function insertEntry(
  db: Database.Database,
  params: {
    id: string
    voucherId: string
    accountId: string
    accountCode: string
    accountName: string
    direction: 'debit' | 'credit'
    amount: number
    deptId?: string
  }
) {
  db.prepare(
    `
    INSERT INTO voucher_entries (
      id, account_set_id, voucher_id, seq, account_id, account_code, account_name,
      direction, amount, dept_id
    )
    VALUES (?, 'set-1', ?, 1, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    params.id,
    params.voucherId,
    params.accountId,
    params.accountCode,
    params.accountName,
    params.direction,
    params.amount,
    params.deptId || null
  )
}

describe('yearClosing', () => {
  it('按科目方向拆分下一年期初借贷金额', () => {
    expect(splitSignedBalance('debit', 120)).toEqual({ initBalance: 120, initDebit: 120, initCredit: 0 })
    expect(splitSignedBalance('debit', -80)).toEqual({ initBalance: -80, initDebit: 0, initCredit: 80 })
    expect(splitSignedBalance('credit', 300)).toEqual({ initBalance: 300, initDebit: 0, initCredit: 300 })
    expect(splitSignedBalance('credit', -40)).toEqual({ initBalance: -40, initDebit: 40, initCredit: 0 })
  })

  it('生成年末余额时按辅助核算维度分别结转', () => {
    const db = createDb()
    db.prepare(
      `
      INSERT INTO init_balances (id, account_set_id, account_id, direction, year, period, init_balance, init_debit, init_credit, aux_item_id)
      VALUES ('ib1', 'set-1', 'cash', 'debit', 2026, 1, 100, 100, 0, '')
    `
    ).run()
    insertVoucher(db, { id: 'v1', period: 12 })
    insertEntry(db, {
      id: 'e1',
      voucherId: 'v1',
      accountId: 'cash',
      accountCode: '1001',
      accountName: '库存现金',
      direction: 'debit',
      amount: 50,
      deptId: 'dept-a',
    })
    insertEntry(db, {
      id: 'e2',
      voucherId: 'v1',
      accountId: 'cash',
      accountCode: '1001',
      accountName: '库存现金',
      direction: 'credit',
      amount: 20,
      deptId: 'dept-b',
    })

    const rows = buildYearEndBalances(db, 'set-1', 2026)

    expect(rows).toMatchObject([
      { accountId: 'cash', auxItemId: '', initBalance: 100, initDebit: 100, initCredit: 0 },
      { accountId: 'cash', auxItemId: 'dept:dept-a', initBalance: 50, initDebit: 50, initCredit: 0 },
      { accountId: 'cash', auxItemId: 'dept:dept-b', initBalance: -20, initDebit: 0, initCredit: 20 },
    ])
  })

  it('12月结账写入下一年度期初余额并关闭期间', () => {
    const db = createDb()
    closeMonths(db)
    db.prepare(
      `
      INSERT INTO init_balances (id, account_set_id, account_id, direction, year, period, init_balance, init_debit, init_credit, aux_item_id)
      VALUES ('ib1', 'set-1', 'payable', 'credit', 2026, 1, 200, 0, 200, '')
    `
    ).run()
    insertVoucher(db, { id: 'v1', period: 12 })
    insertEntry(db, {
      id: 'e1',
      voucherId: 'v1',
      accountId: 'payable',
      accountCode: '2202',
      accountName: '应付账款',
      direction: 'credit',
      amount: 80,
    })

    const result = closeAccountingPeriod({
      db,
      accountSetId: 'set-1',
      year: 2026,
      period: 12,
      userId: 'u1',
    })

    expect(result).toEqual({ closedYear: 2026, closedPeriod: 12, nextYear: 2027, carriedCount: 1 })
    expect(
      db.prepare('SELECT status FROM period_closing WHERE account_set_id=? AND year=? AND period=?').get('set-1', 2026, 12)
    ).toMatchObject({ status: 'closed' })
    expect(
      db.prepare('SELECT year, init_balance, init_debit, init_credit, opening_credit FROM init_balances WHERE year=2027').get()
    ).toMatchObject({ year: 2027, init_balance: 280, init_debit: 0, init_credit: 280, opening_credit: 280 })
  })

  it('存在未记账凭证时阻止结账', () => {
    const db = createDb()
    insertVoucher(db, { id: 'v1', period: 5, status: 'audited' })

    expect(() =>
      closeAccountingPeriod({
        db,
        accountSetId: 'set-1',
        year: 2026,
        period: 5,
      })
    ).toThrow('存在未记账凭证')
  })

  it('下一年度已有凭证时阻止覆盖期初', () => {
    const db = createDb()
    closeMonths(db)
    insertVoucher(db, { id: 'v-next', period: 1 })
    db.prepare("UPDATE vouchers SET year=2027, voucher_date='2027-01-10' WHERE id='v-next'").run()

    expect(() =>
      closeAccountingPeriod({
        db,
        accountSetId: 'set-1',
        year: 2026,
        period: 12,
      })
    ).toThrow('2027年已存在凭证')
  })
  it('12月反结账会撤销下一年度期初余额', () => {
    const db = createDb()
    closeMonths(db)
    db.prepare(
      `
      INSERT INTO period_closing (id, account_set_id, year, period, status)
      VALUES ('close-12', 'set-1', 2026, 12, 'closed')
    `
    ).run()
    db.prepare(
      `
      INSERT INTO init_balances (id, account_set_id, account_id, direction, year, period, init_balance, init_debit, init_credit, aux_item_id)
      VALUES ('next-ib', 'set-1', 'cash', 'debit', 2027, 1, 100, 100, 0, '')
    `
    ).run()

    const result = openAccountingPeriod({
      db,
      accountSetId: 'set-1',
      year: 2026,
      period: 12,
    })

    expect(result).toMatchObject({
      openedYear: 2026,
      openedPeriod: 12,
      removedNextYearOpening: true,
      nextYear: 2027,
    })
    expect(db.prepare('SELECT COUNT(*) as count FROM init_balances WHERE year=2027').get()).toMatchObject({
      count: 0,
    })
    expect(db.prepare('SELECT status FROM period_closing WHERE id=?').get('close-12')).toMatchObject({
      status: 'open',
    })
  })

  it('下一年度已有凭证时阻止年度反结账撤销期初', () => {
    const db = createDb()
    closeMonths(db)
    db.prepare(
      `
      INSERT INTO period_closing (id, account_set_id, year, period, status)
      VALUES ('close-12', 'set-1', 2026, 12, 'closed')
    `
    ).run()
    insertVoucher(db, { id: 'v-next', period: 1 })
    db.prepare("UPDATE vouchers SET year=2027, voucher_date='2027-01-10' WHERE id='v-next'").run()

    expect(() =>
      openAccountingPeriod({
        db,
        accountSetId: 'set-1',
        year: 2026,
        period: 12,
      })
    ).toThrow('2027')
    expect(db.prepare('SELECT status FROM period_closing WHERE id=?').get('close-12')).toMatchObject({
      status: 'closed',
    })
  })
})
