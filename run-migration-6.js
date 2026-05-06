const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'D:/kf/cw0423/server/data/cw_finance.db';
console.log('数据库路径:', dbPath);

const db = new Database(dbPath);

// 初始化迁移表
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// 获取当前版本
const result = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();
const currentVersion = result?.version || 0;
console.log('当前数据库版本:', currentVersion);

// 检查是否已执行 version 6 迁移
const migration6 = db.prepare('SELECT * FROM schema_migrations WHERE version = 6').get();

if (migration6) {
  console.log('Version 6 迁移已执行，跳过');
} else {
  console.log('执行 Version 6 迁移：创建 print_templates 表');
  
  const transaction = db.transaction(() => {
    // 创建打印模版表
    db.exec(`
      CREATE TABLE IF NOT EXISTS print_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_set_id TEXT NOT NULL REFERENCES account_sets(id),
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        paper_width REAL NOT NULL DEFAULT 220,
        paper_height REAL NOT NULL DEFAULT 140,
        margin_top REAL NOT NULL DEFAULT 15,
        margin_bottom REAL NOT NULL DEFAULT 15,
        margin_left REAL NOT NULL DEFAULT 10,
        margin_right REAL NOT NULL DEFAULT 10,
        elements TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    
    // 记录迁移
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      6,
      'add_print_templates_table'
    );
  });
  
  try {
    transaction();
    console.log('✓ Version 6 迁移执行成功');
  } catch (error) {
    console.error('✗ Version 6 迁移失败:', error);
    throw error;
  }
}

// 验证表结构
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='print_templates'").all();
console.log('print_templates 表存在:', tables.length > 0);

if (tables.length > 0) {
  const count = db.prepare('SELECT COUNT(*) as count FROM print_templates').get();
  console.log('print_templates 记录数:', count.count);
}

db.close();
console.log('迁移完成！');
