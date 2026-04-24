const Database = require('better-sqlite3');
const db = new Database('C:/Program Files/data/finance.db');
const vid = 'be91f8a2-cd05-4a94-ad04-16f4c328bf5a';
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
const out = [];
for (const t of tables) {
  try {
    const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all();
    for (const fk of fks) {
      if (fk.table === 'vouchers') {
        out.push({ table: t, from: fk.from, to: fk.to, on_delete: fk.on_delete, on_update: fk.on_update });
      }
    }
  } catch (e) {}
}
console.log(JSON.stringify(out, null, 2));
