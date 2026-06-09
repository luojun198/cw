import { getDb } from './server/src/db/index.ts'
const db = getDb()
const sets = db.prepare('SELECT id, name FROM account_sets').all() as any[]
for (const s of sets) {
  const vs = db.prepare('SELECT voucher_no, year, period, source, status FROM vouchers WHERE account_set_id=? ORDER BY created_at DESC LIMIT 5').all(s.id)
  if (vs.length) console.log(s.name, JSON.stringify(vs))
}
