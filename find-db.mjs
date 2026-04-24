import Database from 'better-sqlite3'

const possiblePaths = [
  'D:/kf/cw0416/server/data/cw_finance.db',
  'D:/kf/cw0416/server/data/cw.db',
  'D:/kf/cw0416/server/data.db',
]

for (const dbPath of possiblePaths) {
  try {
    console.log(`Trying: ${dbPath}`)
    const db = new Database(dbPath, { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    console.log(`  Tables: ${tables.map(t => t.name).join(', ')}`)

    // Check if vouchers table exists
    const hasVouchers = tables.some(t => t.name === 'vouchers')
    if (hasVouchers) {
      console.log(`\n=== Found DB with vouchers at: ${dbPath} ===\n`)

      const voucher = db.prepare('SELECT * FROM vouchers LIMIT 3').all()
      console.log('Vouchers:')
      console.log(JSON.stringify(voucher, null, 2))

      const entries = db.prepare('SELECT * FROM voucher_entries LIMIT 3').all()
      console.log('\nVoucher Entries:')
      console.log(JSON.stringify(entries, null, 2))

      db.close()
      break
    }
    db.close()
  } catch (e) {
    console.log(`  Error: ${e.message}`)
  }
}
