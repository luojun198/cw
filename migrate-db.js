const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const sourceDb = 'C:/Program Files/data/finance.db';
const targetDb = 'D:/kf/cw0423/server/data/cw_finance.db';

console.log('开始迁移数据库...');
console.log('源数据库:', sourceDb);
console.log('目标数据库:', targetDb);

// 确保目标目录存在
const targetDir = path.dirname(targetDb);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('创建目标目录:', targetDir);
}

// 复制数据库文件
fs.copyFileSync(sourceDb, targetDb);
console.log('数据库文件复制完成');

// 验证
const db = new Database(targetDb);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('目标数据库表数量:', tables.length);

if (tables.some(t => t.name === 'print_templates')) {
  const count = db.prepare('SELECT COUNT(*) as count FROM print_templates').get();
  console.log('print_templates 记录数:', count.count);
}

db.close();
console.log('迁移完成！');
