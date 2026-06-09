import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('data/finance.db');
const db = new Database(dbPath);

const code = '1101002';
const row = db.prepare(`
  SELECT a.code, a.name, a.is_enabled, a.is_cash, a.is_bank, 
  (SELECT COUNT(*) FROM accounts WHERE parent_id = a.id) as children_count 
  FROM accounts a 
  WHERE a.code = ?
`).get(code);

if (row) {
  console.log('Account Details:');
  console.log(JSON.stringify(row, null, 2));
} else {
  console.log('Account not found: ' + code);
  
  // Also list similar codes
  const similar = db.prepare("SELECT code, name FROM accounts WHERE code LIKE '1101%' LIMIT 10").all();
  console.log('Similar accounts:');
  console.log(JSON.stringify(similar, null, 2));
}
