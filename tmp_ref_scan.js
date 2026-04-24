const Database = require('better-sqlite3');
const db = new Database('C:/Program Files/data/finance.db');
const vid = 'be91f8a2-cd05-4a94-ad04-16f4c328bf5a';
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
const hits = [];
for (const t of tables) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    for (const c of cols) {
      if (/voucher_id/i.test(c)) {
        const row = db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE ${c} = ?`).get(vid);
        if (row && row.c > 0) hits.push({ table: t, column: c, count: row.c });
      }
    }
  } catch (e) {}
}
console.log(JSON.stringify(hits, null, 2));
