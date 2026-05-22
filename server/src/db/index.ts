import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { PRESET_ROLES } from './permissions.js'

const MODULE_FILE = fileURLToPath(import.meta.url)
const MODULE_DIR = dirname(MODULE_FILE)
const SERVER_SRC_DIR = resolve(MODULE_DIR, '..')
const SERVER_ROOT_DIR = resolve(SERVER_SRC_DIR, '..')
const PROJECT_ROOT_DIR = resolve(SERVER_ROOT_DIR, '..')

// 便携部署：process.execPath = deploy/node/node.exe，DB 在 deploy/data/
// pkg 部署：process.pkg 标识，DB 在 exe 同目录/data/
// 开发环境：使用项目根目录
function getDeployDir(): string {
  const execPath = process.execPath || ''
  const isPkg = !!(process as any).pkg

  if (isPkg) {
    // pkg exe: deploy/cw-finance.exe → deploy/
    return dirname(execPath)
  }

  // 检查是否是便携部署（deploy/node/node.exe）
  // 通过检查 execPath 的父目录名是否为 'node' 来判断
  const parentDir = dirname(execPath)
  const parentDirName = basename(parentDir)
  
  if (execPath.endsWith('node.exe') && parentDirName === 'node') {
    // 便携 Node.js: deploy/node/node.exe → deploy/
    return dirname(parentDir)
  }

  // 开发环境：使用项目根目录
  return PROJECT_ROOT_DIR
}

const DEPLOY_DIR = getDeployDir()
const DB_DIR = process.env.DB_DIR || resolve(DEPLOY_DIR, 'data')
const DB_PATH = process.env.DB_PATH || resolve(DB_DIR, 'finance.db')

let db: Database.Database | null = null
let __DB_PATH_LOGGED = false

/** 兼容旧库/导入备份：补齐 users 表登录页所需字段 */
export function ensureUsersTableSchema(database: Database.Database) {
  const tableExists = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get()
  if (!tableExists) return

  const columns = database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
  const names = new Set(columns.map(column => column.name))

  if (!names.has('account_set_id')) {
    database.exec('ALTER TABLE users ADD COLUMN account_set_id TEXT REFERENCES account_sets(id)')
  }
  if (!names.has('status')) {
    database.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
  }
  if (!names.has('nickname')) {
    database.exec('ALTER TABLE users ADD COLUMN nickname TEXT')
  }
}

function ensureAccountsNoNegativeColumn(database: Database.Database) {
  const columns = database.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>
  const hasNoNegative = columns.some(column => column.name === 'no_negative')

  if (!hasNoNegative) {
    database.exec('ALTER TABLE accounts ADD COLUMN no_negative INTEGER DEFAULT 0')
  }
}

function ensureReportSourceConstraint(database: Database.Database) {
  // Check if 'xls' is allowed in the CHECK constraint of report_definitions.source
  const tableInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='report_definitions'").get() as { sql: string } | undefined
  if (tableInfo?.sql && !tableInfo.sql.includes("'xls'")) {
    // Rebuild table with updated CHECK constraint
    database.exec(`
      CREATE TABLE IF NOT EXISTS report_definitions_new (
        id TEXT PRIMARY KEY,
        account_set_id TEXT NOT NULL REFERENCES account_sets(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'acd' CHECK(source IN ('acd', 'manual', 'xls')),
        source_file TEXT,
        sort_order INTEGER DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(account_set_id, code)
      );
      INSERT INTO report_definitions_new SELECT * FROM report_definitions;
      DROP TABLE report_definitions;
      ALTER TABLE report_definitions_new RENAME TO report_definitions;
    `)
  }

  // Same for report_template_sources.source_type
  const sourceTableInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='report_template_sources'").get() as { sql: string } | undefined
  if (sourceTableInfo?.sql && !sourceTableInfo.sql.includes("'xls'")) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS report_template_sources_new (
        id TEXT PRIMARY KEY,
        report_definition_id TEXT NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
        source_file TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'vts' CHECK(source_type IN ('vts', 'txt', 'xls')),
        raw_content TEXT,
        content_encoding TEXT DEFAULT 'gb18030',
        parse_version TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO report_template_sources_new SELECT * FROM report_template_sources;
      DROP TABLE report_template_sources;
      ALTER TABLE report_template_sources_new RENAME TO report_template_sources;
    `)
  }
}

function ensureAuxCategoryDefaultItem(database: Database.Database) {
  const columns = database.prepare('PRAGMA table_info(aux_categories)').all() as Array<{ name: string }>
  const hasDefaultItem = columns.some(column => column.name === 'default_item_id')

  if (!hasDefaultItem) {
    database.exec('ALTER TABLE aux_categories ADD COLUMN default_item_id TEXT')
  }
}

function ensureVoucherIndexes(database: Database.Database) {
  // 确保 vouchers 表有 (account_set_id, year, period, status) 复合索引，加速日记账等查询
  const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='vouchers'").all() as Array<{ name: string }>
  const hasPeriodStatusIndex = indexes.some(idx => idx.name === 'idx_vouchers_period_status')
  if (!hasPeriodStatusIndex) {
    database.exec('CREATE INDEX IF NOT EXISTS idx_vouchers_period_status ON vouchers(account_set_id, year, period, status)')
  }
}

function ensureBudgetSurplusAdjustmentsTable(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS budget_surplus_adjustments (
      id TEXT PRIMARY KEY,
      account_set_id TEXT NOT NULL REFERENCES account_sets(id) ON DELETE CASCADE,
      source_seq INTEGER,
      item_code TEXT NOT NULL,
      item_name TEXT,
      year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      account_code TEXT,
      alt_amount REAL NOT NULL DEFAULT 0,
      item_type TEXT,
      balance_direction TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_set_id, source_seq)
    );

    CREATE INDEX IF NOT EXISTS idx_budget_surplus_adjustments_period
      ON budget_surplus_adjustments(account_set_id, year, period, item_code);
  `)
}

function ensureAuxCategoryFieldsTable(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS aux_category_fields (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES aux_categories(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text' CHECK(field_type IN ('text', 'number', 'date', 'select')),
      options_json TEXT,
      show_in_voucher INTEGER DEFAULT 0,
      required_in_voucher INTEGER DEFAULT 0,
      required_in_archive INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category_id, field_key)
    )
  `)

  // aux_items 新增 field_values 列
  const itemColumns = database.prepare('PRAGMA table_info(aux_items)').all() as Array<{ name: string }>
  const hasFieldValues = itemColumns.some(column => column.name === 'field_values')
  if (!hasFieldValues) {
    database.exec("ALTER TABLE aux_items ADD COLUMN field_values TEXT DEFAULT '{}'")
  }

  // 索引
  database.exec('CREATE INDEX IF NOT EXISTS idx_aux_category_fields_category ON aux_category_fields(category_id, sort_order)')
}

export function getDb(): Database.Database {
  if (!db) {
    // 确保目录存在
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true })
    }
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL')
    db.pragma('cache_size = -64000') // 64MB cache
    db.pragma('temp_store = MEMORY')
    if (!__DB_PATH_LOGGED) {
      const mode = (process as any).pkg ? 'pkg' : process.execPath?.endsWith('node.exe') ? 'portable' : 'dev'
      console.log(
        `[DB] Init DB path: DEPLOY_DIR=${DEPLOY_DIR}, DB_DIR=${DB_DIR}, DB_PATH=${DB_PATH}, MODE=${mode}`
      )
      __DB_PATH_LOGGED = true
    }
  }
  return db
}

/** 关闭并重置数据库连接（用于备份恢复后重建连接） */
export function closeAndResetDb() {
  if (db) {
    try { db.close() } catch { /* ignore */ }
    db = null
  }
}

export function initDatabase(): DatabaseType {
  const database = getDb()

  let schemaPath: string
  if (process.env.SCHEMA_DIR) {
    schemaPath = resolve(process.env.SCHEMA_DIR, 'schema.sql')
  } else if ((process as any).pkg) {
    schemaPath = resolve(DEPLOY_DIR, 'server', 'schema.sql')
  } else if ((process.execPath || '').endsWith('node.exe')) {
    // portable Node.js: schema.sql is in deploy/server/schema.sql
    schemaPath = resolve(DEPLOY_DIR, 'server', 'schema.sql')
  } else {
    schemaPath = resolve(SERVER_SRC_DIR, 'db', 'schema.sql')
  }

  const schema = readFileSync(schemaPath, 'utf-8')
  database.exec(schema)
  ensureAccountsNoNegativeColumn(database)
  ensureReportSourceConstraint(database)
  ensureAuxCategoryDefaultItem(database)
  ensureAuxCategoryFieldsTable(database)
  ensureVoucherIndexes(database)
  ensureBudgetSurplusAdjustmentsTable(database)
  ensureUsersTableSchema(database)
  return database
}

export function seedRoles(accountSetId?: string) {
  const database = getDb()
  const targetAccountSetIds = accountSetId
    ? [accountSetId]
    : (database.prepare('SELECT id FROM account_sets').all() as Array<{ id: string }>).map(row => row.id)

  const hasAccountSetColumn = (database.prepare('PRAGMA table_info(roles)').all() as Array<{ name: string }>).some(
    column => column.name === 'account_set_id'
  )

  if (!hasAccountSetColumn) {
    const insert = database.prepare(
      'INSERT OR IGNORE INTO roles (id, name, code, description, is_system, permissions) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const r of PRESET_ROLES) {
      // 确保 code 字段不为空
      if (!r.code) {
        console.error('Role code is missing:', r)
        continue
      }
      insert.run(uuidv4(), r.name, r.code, r.description || '', r.is_system, JSON.stringify(r.permissions))
    }
    return database.prepare('SELECT * FROM roles').all()
  }

  const insert = database.prepare(
    `INSERT OR IGNORE INTO roles (id, account_set_id, name, code, description, is_system, permissions)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const asId of targetAccountSetIds) {
    for (const r of PRESET_ROLES) {
      // 确保 code 字段不为空
      if (!r.code) {
        console.error('Role code is missing:', r)
        continue
      }
      insert.run(uuidv4(), asId, r.name, r.code, r.description || '', r.is_system, JSON.stringify(r.permissions))
    }
  }
  return accountSetId
    ? database.prepare('SELECT * FROM roles WHERE account_set_id = ?').all(accountSetId)
    : database.prepare('SELECT * FROM roles').all()
}

export function ensureAccountSetSecurityBootstrap(accountSetId: string) {
  const database = getDb()
  ensureUsersTableSchema(database)
  seedRoles(accountSetId)

  const roleColumns = database.prepare('PRAGMA table_info(roles)').all() as Array<{ name: string }>
  const rolesScopedByAccountSet = roleColumns.some(column => column.name === 'account_set_id')
  const adminRole = (
    rolesScopedByAccountSet
      ? database
          .prepare('SELECT id FROM roles WHERE account_set_id = ? AND code = ? LIMIT 1')
          .get(accountSetId, 'admin')
      : database.prepare('SELECT id FROM roles WHERE code = ? LIMIT 1').get('admin')
  ) as { id: string } | undefined

  if (!adminRole?.id) {
    console.error('[bootstrap] 未找到 admin 角色，账套:', accountSetId)
    return
  }

  const existingAdmin = database
    .prepare('SELECT id FROM users WHERE username = ? AND account_set_id = ?')
    .get('admin', accountSetId)
  if (existingAdmin) return

  database.prepare(
    `INSERT INTO users (id, account_set_id, username, password, nickname, role_id, status, created_at, updated_at)
     VALUES (?, ?, 'admin', ?, '系统管理员', ?, 'active', datetime('now'), datetime('now'))`
  ).run(
    uuidv4(),
    accountSetId,
    '$2a$10$Dj9DCcIGNtjYZmfcub6td.wly0mkJT.bLPc.yeFAStW77WqkQu5ie',
    adminRole.id
  )
}

export { DB_PATH }
