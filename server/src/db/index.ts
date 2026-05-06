import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

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
  const isPkg = !!process.pkg

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
      const mode = process.pkg ? 'pkg' : process.execPath?.endsWith('node.exe') ? 'portable' : 'dev'
      console.log(
        `[DB] Init DB path: DEPLOY_DIR=${DEPLOY_DIR}, DB_DIR=${DB_DIR}, DB_PATH=${DB_PATH}, MODE=${mode}`
      )
      __DB_PATH_LOGGED = true
    }
  }
  return db
}

export function initDatabase() {
  const database = getDb()

  let schemaPath: string
  if (process.env.SCHEMA_DIR) {
    schemaPath = resolve(process.env.SCHEMA_DIR, 'schema.sql')
  } else if (process.pkg) {
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
  return database
}

export function seedRoles() {
  const database = getDb()
  const roles = [
    {
      id: uuidv4(),
      name: '系统管理员',
      code: 'admin',
      description: '系统全部权限',
      is_system: 1,
      permissions: JSON.stringify(['*']),
    },
    {
      id: uuidv4(),
      name: '财务会计',
      code: 'accountant',
      description: '凭证录入、账簿查看',
      is_system: 1,
      permissions: JSON.stringify(['voucher:entry', 'voucher:query', 'ledger:view', 'report:view']),
    },
    {
      id: uuidv4(),
      name: '审核人员',
      code: 'auditor',
      description: '凭证审核、账簿查看',
      is_system: 1,
      permissions: JSON.stringify(['voucher:audit', 'ledger:view', 'report:view']),
    },
    {
      id: uuidv4(),
      name: '报表管理员',
      code: 'reporter',
      description: '报表编制与导出',
      is_system: 1,
      permissions: JSON.stringify(['report:view', 'report:export']),
    },
  ]
  const insert = database.prepare(
    'INSERT OR IGNORE INTO roles (id, name, code, description, is_system, permissions) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const r of roles) {
    insert.run(r.id, r.name, r.code, r.description, r.is_system, r.permissions)
  }
  return database.prepare('SELECT * FROM roles').all()
}

export { DB_PATH }
