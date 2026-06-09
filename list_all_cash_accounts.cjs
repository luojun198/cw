const Database = require('better-sqlite3');
const db = new Database('data/finance.db');
const results = db.prepare("SELECT code, name, is_cash, is_bank, account_set_id FROM accounts WHERE (is_cash = 1 OR is_bank = 1)").all();
console.log(JSON.stringify(results, null, 2));
