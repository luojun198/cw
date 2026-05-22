import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AccountService } from '../services/accountService.js'

describe('AccountService', () => {
  let db: Database.Database
  let service: AccountService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE system_params (
        id TEXT PRIMARY KEY,
        account_set_id TEXT,
        param_key TEXT NOT NULL,
        param_value TEXT NOT NULL
      );

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        account_set_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL,
        level INTEGER NOT NULL,
        parent_id TEXT,
        is_aux INTEGER DEFAULT 0,
        aux_types TEXT,
        is_enabled INTEGER DEFAULT 1,
        is_cash INTEGER DEFAULT 0,
        is_bank INTEGER DEFAULT 0,
        allow_delete INTEGER DEFAULT 1,
        no_negative INTEGER DEFAULT 0
      );
    `)

    service = new AccountService(db as any)
  })

  afterEach(() => {
    db.close()
  })

  it('新增科目时优先使用当前账套科目长度，而不是全局默认长度', () => {
    db.prepare(`
      INSERT INTO system_params (id, account_set_id, param_key, param_value)
      VALUES
        ('global-levels', NULL, 'account_levels', '6'),
        ('global-lengths', NULL, 'account_code_lengths', '[4,2,2,2,2,2]'),
        ('set-levels', 'set-1', 'account_levels', '3'),
        ('set-lengths', 'set-1', 'account_code_lengths', '[4,3,3]')
    `).run()

    db.prepare(`
      INSERT INTO accounts (id, account_set_id, code, name, direction, level, parent_id)
      VALUES ('parent-1012', 'set-1', '1012', '其他货币资金', 'debit', 1, NULL)
    `).run()

    const id = service.createAccount({
      account_set_id: 'set-1',
      code: '1012007',
      name: '测试二级科目',
      direction: 'debit',
      parent_id: 'parent-1012',
    })

    const created = db.prepare('SELECT code, level, parent_id FROM accounts WHERE id = ?').get(id)
    expect(created).toMatchObject({
      code: '1012007',
      level: 2,
      parent_id: 'parent-1012',
    })
  })
})
