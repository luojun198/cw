const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'finance.db');
const db = new Database(dbPath);

console.log('=== print_templates 表结构 ===');
const tableInfo = db.prepare('PRAGMA table_info(print_templates)').all();
console.log(tableInfo);

console.log('\n=== 查询一条模版数据 ===');
const template = db.prepare('SELECT * FROM print_templates LIMIT 1').get();
console.log(template);

db.close();
