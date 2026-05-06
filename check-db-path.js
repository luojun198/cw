const Database = require('better-sqlite3');
const db1 = new Database('C:/Program Files/data/finance.db');
const db2 = new Database('D:/kf/cw0423/server/data/cw_finance.db');

console.log('=== C盘数据库 (C:/Program Files/data/finance.db) ===');
const tables1 = db1.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('表数量:', tables1.length);
console.log('表列表:', tables1.map(r => r.name));

if (tables1.some(t => t.name === 'print_templates')) {
  const count1 = db1.prepare('SELECT COUNT(*) as count FROM print_templates').get();
  console.log('print_templates 记录数:', count1.count);
}

console.log('\n=== D盘数据库 (D:/kf/cw0423/server/data/cw_finance.db) ===');
const tables2 = db2.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('表数量:', tables2.length);
console.log('表列表:', tables2.map(r => r.name));

db1.close();
db2.close();
