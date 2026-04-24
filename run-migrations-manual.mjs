import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath)

  console.log('\n=== Running migration 3: update vouchers table ===')

  db.pragma('foreign_keys = OFF')

  db.exec(`
    -- 创建新表结构
    CREATE TABLE vouchers_new (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL REFERENCES account_sets(id),
      voucher_no TEXT NOT NULL,
      voucher_type_id TEXT REFERENCES voucher_types(id),
      voucher_date TEXT NOT NULL,
      year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'audited', 'posted')),
      total_amount REAL NOT NULL DEFAULT 0,
      maker_id TEXT REFERENCES users(id),
      maker_name TEXT,
      auditor_id TEXT REFERENCES users(id),
      auditor_name TEXT,
      poster_id TEXT REFERENCES users(id),
      poster_name TEXT,
      posted_at TEXT,
      attachments INTEGER DEFAULT 0,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_set_id, year, period, voucher_type_id, voucher_no)
    );

    -- 复制数据
    INSERT INTO vouchers_new SELECT * FROM vouchers;

    -- 删除旧表
    DROP TABLE vouchers;

    -- 重命名新表
    ALTER TABLE vouchers_new RENAME TO vouchers;

    -- 重建索引
    CREATE INDEX IF NOT EXISTS idx_vouchers_account_set ON vouchers(account_set_id);
    CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date);
    CREATE INDEX IF NOT EXISTS idx_vouchers_year_period ON vouchers(year, period);
    CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
  `)

  db.pragma('foreign_keys = ON')

  console.log('✓ Migration 3 completed')

  console.log('\n=== Running migration 4: update auto_transfer_runs table ===')

  db.pragma('foreign_keys = OFF')

  db.exec(`
    -- 创建新表结构
    CREATE TABLE auto_transfer_runs_new (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL REFERENCES account_sets(id),
      year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      transfer_type TEXT NOT NULL,
      transfer_type_code TEXT,
      voucher_id TEXT NOT NULL REFERENCES vouchers(id),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_set_id, year, period, transfer_type_code)
    );

    -- 复制数据（旧数据的 transfer_type_code 设为 NULL）
    INSERT INTO auto_transfer_runs_new
    SELECT id, account_set_id, year, period, transfer_type, NULL, voucher_id, created_by, created_at
    FROM auto_transfer_runs;

    -- 删除旧表
    DROP TABLE auto_transfer_runs;

    -- 重命名新表
    ALTER TABLE auto_transfer_runs_new RENAME TO auto_transfer_runs;
  `)

  db.pragma('foreign_keys = ON')

  console.log('✓ Migration 4 completed')

  // 记录迁移
  db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(3, 'update_voucher_unique_constraint_add_period_and_type')
  db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(4, 'update_auto_transfer_runs_add_transfer_type_code')

  console.log('\n✓ All migrations completed successfully')

  db.close()
} catch (e) {
  console.error('Error:', e.message)
  console.error(e)
}
