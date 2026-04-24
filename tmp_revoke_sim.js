const Database = require('better-sqlite3');
const db = new Database('C:/Program Files/data/finance.db');
const vid = 'be91f8a2-cd05-4a94-ad04-16f4c328bf5a';
const run = db.prepare('SELECT * FROM auto_transfer_runs WHERE voucher_id=?').get(vid);
const voucher = db.prepare('SELECT * FROM vouchers WHERE id=?').get(vid);
const entries = db.prepare('SELECT * FROM voucher_entries WHERE voucher_id=?').all(vid);
console.log(JSON.stringify({run, voucherStatus: voucher?.status, entryCount: entries.length}, null, 2));
try {
  db.exec('BEGIN');
  if (voucher && voucher.status === 'posted') {
    for (const entry of entries) {
      const isDebit = entry.direction === 'debit';
      db.prepare('UPDATE account_balances SET current_debit = current_debit - ?, current_credit = current_credit - ? WHERE account_set_id=? AND account_id=? AND year=? AND period=?').run(isDebit ? entry.amount : 0, isDebit ? 0 : entry.amount, voucher.account_set_id, entry.account_id, voucher.year, voucher.period);
    }
  }
  console.log('STEP_OK: revert balances');
  const d1 = db.prepare('DELETE FROM voucher_attachments WHERE voucher_id=?').run(vid); console.log('STEP_OK: delete attachments', d1.changes);
  const d2 = db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(vid); console.log('STEP_OK: delete entries', d2.changes);
  const d3 = db.prepare('DELETE FROM auto_transfer_runs WHERE voucher_id=?').run(vid); console.log('STEP_OK: delete transfer runs', d3.changes);
  const d4 = db.prepare('DELETE FROM vouchers WHERE id=?').run(vid); console.log('STEP_OK: delete voucher', d4.changes);
  db.exec('ROLLBACK');
  console.log('SIMULATION_DONE');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error('SIMULATION_FAIL:', e.message);
  console.error(e.stack);
  process.exit(1);
}
