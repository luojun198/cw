const Database = require('better-sqlite3');
const db = new Database('D:/kf/cw0423/server/data/cw_finance.db');

console.log('=== 检查打印模版表 ===');

// 检查表是否存在
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='print_templates'").all();
console.log('print_templates 表存在:', tables.length > 0);

if (tables.length > 0) {
  // 查询所有模版
  const templates = db.prepare('SELECT id, account_set_id, name, is_default, paper_width, paper_height FROM print_templates').all();
  console.log('模版数量:', templates.length);
  console.log('模版列表:');
  templates.forEach(t => {
    console.log(`  - ID: ${t.id}, 账套: ${t.account_set_id}, 名称: ${t.name}, 默认: ${t.is_default}, 尺寸: ${t.paper_width}×${t.paper_height}`);
  });
} else {
  console.log('print_templates 表不存在，需要运行数据库迁移');
}

db.close();
