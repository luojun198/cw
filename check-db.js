const Database = require('better-sqlite3');
const db = new Database('D:/kf/cw0423/server/data/cw_finance.db');
const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('数据库表列表:', rows.map(r => r.name));
db.close();
