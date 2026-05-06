import { Migration } from './migrations.ts'

/**
 * 迁移示例：添加新字段
 *
 * 使用方法：
 * 1. 在此文件中定义所有迁移
 * 2. 按版本号顺序排列
 * 3. 运行 npm run db:migrate 执行迁移
 */

export const migrations: Migration[] = [
  {
    version: 3,
    name: 'update_voucher_unique_constraint_add_period_and_type',
    up: (db) => {
      // 修改凭证表的唯一约束，从 (account_set_id, year, voucher_no) 改为 (account_set_id, year, period, voucher_type_id, voucher_no)
      // 确保同年同月同类型不能有相同编号
      db.exec(`
        PRAGMA foreign_keys = OFF;

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

        PRAGMA foreign_keys = ON;
      `)
    },
    down: (db) => {
      // 回滚：恢复原来的唯一约束
      db.exec(`
        CREATE TABLE vouchers_old (
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
          UNIQUE(account_set_id, year, voucher_no)
        );

        INSERT INTO vouchers_old SELECT * FROM vouchers;
        DROP TABLE vouchers;
        ALTER TABLE vouchers_old RENAME TO vouchers;

        CREATE INDEX IF NOT EXISTS idx_vouchers_account_set ON vouchers(account_set_id);
        CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date);
        CREATE INDEX IF NOT EXISTS idx_vouchers_year_period ON vouchers(year, period);
        CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
      `)
    }
  },
  {
    version: 4,
    name: 'update_auto_transfer_runs_add_transfer_type_code',
    up: (db) => {
      // 更新 auto_transfer_runs 表，添加 transfer_type_code 字段并修改唯一约束
      db.exec(`
        PRAGMA foreign_keys = OFF;

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

        PRAGMA foreign_keys = ON;
      `)
    },
    down: (db) => {
      // 回滚：恢复原来的表结构
      db.exec(`
        CREATE TABLE auto_transfer_runs_old (
          id TEXT PRIMARY KEY,
          account_set_id TEXT NOT NULL REFERENCES account_sets(id),
          year INTEGER NOT NULL,
          period INTEGER NOT NULL,
          transfer_type TEXT NOT NULL,
          voucher_id TEXT NOT NULL REFERENCES vouchers(id),
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(account_set_id, year, period, transfer_type)
        );

        INSERT INTO auto_transfer_runs_old
        SELECT id, account_set_id, year, period, transfer_type, voucher_id, created_by, created_at
        FROM auto_transfer_runs;

        DROP TABLE auto_transfer_runs;
        ALTER TABLE auto_transfer_runs_old RENAME TO auto_transfer_runs;
      `)
    }
  },
  {
    version: 5,
    name: 'add_ledger_enhancement_fields',
    up: (db) => {
      // 为账簿管理功能增强添加新字段
      db.exec(`
        -- 1. 为 voucher_entries 表添加数量金额式账簿所需字段
        ALTER TABLE voucher_entries ADD COLUMN quantity REAL DEFAULT 0;
        ALTER TABLE voucher_entries ADD COLUMN unit_price REAL DEFAULT 0;
        ALTER TABLE voucher_entries ADD COLUMN unit TEXT;

        -- 2. 为 accounts 表添加账簿格式配置字段
        ALTER TABLE accounts ADD COLUMN ledger_format TEXT DEFAULT 'three_column'
          CHECK(ledger_format IN ('three_column', 'multi_column', 'quantity_amount'));

        -- 3. 优化明细账查询索引
        CREATE INDEX IF NOT EXISTS idx_voucher_entries_account_date
          ON voucher_entries(account_id, voucher_id);

        -- 4. 优化余额表查询索引
        CREATE INDEX IF NOT EXISTS idx_account_balances_period
          ON account_balances(account_set_id, year, period);

        -- 5. 优化凭证分录查询索引
        CREATE INDEX IF NOT EXISTS idx_voucher_entries_voucher
          ON voucher_entries(voucher_id, seq);
      `)
    },
    down: (db) => {
      // 回滚：删除新增的字段和索引
      // 注意：SQLite 不支持 DROP COLUMN，需要重建表
      db.exec(`
        PRAGMA foreign_keys = OFF;

        -- 删除索引
        DROP INDEX IF EXISTS idx_voucher_entries_account_date;
        DROP INDEX IF EXISTS idx_account_balances_period;
        DROP INDEX IF EXISTS idx_voucher_entries_voucher;

        -- 重建 voucher_entries 表（移除新增字段）
        CREATE TABLE voucher_entries_old (
          id TEXT PRIMARY KEY,
          account_set_id TEXT NOT NULL REFERENCES account_sets(id),
          voucher_id TEXT NOT NULL REFERENCES vouchers(id),
          seq INTEGER NOT NULL,
          account_id TEXT NOT NULL REFERENCES accounts(id),
          account_code TEXT NOT NULL,
          account_name TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('debit', 'credit')),
          amount REAL NOT NULL DEFAULT 0,
          summary TEXT,
          dept_id TEXT,
          dept_name TEXT,
          project_id TEXT,
          project_name TEXT,
          supplier_id TEXT,
          supplier_name TEXT,
          person_id TEXT,
          person_name TEXT,
          func_class_id TEXT,
          func_class_name TEXT,
          aux_data TEXT DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO voucher_entries_old
        SELECT id, account_set_id, voucher_id, seq, account_id, account_code, account_name,
               direction, amount, summary, dept_id, dept_name, project_id, project_name,
               supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name,
               aux_data, created_at, updated_at
        FROM voucher_entries;

        DROP TABLE voucher_entries;
        ALTER TABLE voucher_entries_old RENAME TO voucher_entries;

        -- 重建 accounts 表（移除 ledger_format 字段）
        CREATE TABLE accounts_old (
          id TEXT PRIMARY KEY,
          account_set_id TEXT NOT NULL REFERENCES account_sets(id),
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('debit', 'credit')),
          level INTEGER NOT NULL DEFAULT 1,
          parent_id TEXT,
          is_aux INTEGER DEFAULT 0,
          aux_types TEXT,
          balance TEXT CHECK(balance IN ('initial', 'normal', 'temp')),
          is_cash INTEGER DEFAULT 0,
          is_bank INTEGER DEFAULT 0,
          is_enabled INTEGER DEFAULT 1,
          allow_delete INTEGER DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(account_set_id, code)
        );

        INSERT INTO accounts_old
        SELECT id, account_set_id, code, name, direction, level, parent_id, is_aux, aux_types,
               balance, is_cash, is_bank, is_enabled, allow_delete, created_at, updated_at
        FROM accounts;

        DROP TABLE accounts;
        ALTER TABLE accounts_old RENAME TO accounts;

        PRAGMA foreign_keys = ON;
      `)
    }
  },
  {
    version: 6,
    name: 'add_print_templates_table',
    up: (db) => {
      // 添加打印模版表
      db.exec(`
        -- 创建打印模版表
        CREATE TABLE IF NOT EXISTS print_templates (
          id TEXT PRIMARY KEY,
          account_set_id TEXT NOT NULL REFERENCES account_sets(id),
          name TEXT NOT NULL,
          paper_size TEXT NOT NULL DEFAULT 'custom' CHECK(paper_size IN ('custom', 'A4', 'A5')),
          paper_width REAL NOT NULL DEFAULT 220,
          paper_height REAL NOT NULL DEFAULT 140,
          margin_top REAL NOT NULL DEFAULT 15,
          margin_bottom REAL NOT NULL DEFAULT 15,
          margin_left REAL NOT NULL DEFAULT 10,
          margin_right REAL NOT NULL DEFAULT 10,
          elements TEXT NOT NULL DEFAULT '[]',
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 创建索引
        CREATE INDEX IF NOT EXISTS idx_print_templates_account_set
          ON print_templates(account_set_id);
        CREATE INDEX IF NOT EXISTS idx_print_templates_default
          ON print_templates(account_set_id, is_default);
      `)
    },
    down: (db) => {
      // 回滚：删除打印模版表
      db.exec(`
        DROP INDEX IF EXISTS idx_print_templates_account_set;
        DROP INDEX IF EXISTS idx_print_templates_default;
        DROP TABLE IF EXISTS print_templates;
      `)
    }
  },
  {
    version: 7,
    name: 'add_init_balance_detail_fields',
    up: (db) => {
      // 期初余额表新增年初借贷方、账前借贷方字段
      db.prepare('ALTER TABLE init_balances ADD COLUMN opening_debit REAL NOT NULL DEFAULT 0').run()
      db.prepare('ALTER TABLE init_balances ADD COLUMN opening_credit REAL NOT NULL DEFAULT 0').run()
      db.prepare('ALTER TABLE init_balances ADD COLUMN pre_book_debit REAL NOT NULL DEFAULT 0').run()
      db.prepare('ALTER TABLE init_balances ADD COLUMN pre_book_credit REAL NOT NULL DEFAULT 0').run()
    },
    down: (db) => {
      db.prepare('ALTER TABLE init_balances DROP COLUMN opening_debit').run()
      db.prepare('ALTER TABLE init_balances DROP COLUMN opening_credit').run()
      db.prepare('ALTER TABLE init_balances DROP COLUMN pre_book_debit').run()
      db.prepare('ALTER TABLE init_balances DROP COLUMN pre_book_credit').run()
    }
  },
]
