const Database = require('better-sqlite3');
const db = new Database('data/finance.db');

const accountSetId = '1be2a318-ddae-4863-b87a-db4e2407f525';
const conditions = [
  'a.account_set_id = ?',
  'a.is_enabled = 1',
  '(a.is_cash = 1 OR a.is_bank = 1)',
  'NOT EXISTS (SELECT 1 FROM accounts c WHERE c.parent_id = a.id)',
];
const params = [accountSetId];

const sql = `SELECT a.code, a.name, a.is_cash, a.is_bank
     FROM accounts a
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.code`;

const results = db.prepare(sql).all(...params);
console.log('Results for 出纳录单 API:');
console.log(JSON.stringify(results, null, 2));
