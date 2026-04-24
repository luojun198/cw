import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath, { readonly: true })

  console.log('\n=== Vouchers count ===')
  const voucherCount = db.prepare('SELECT COUNT(*) as count FROM vouchers').get()
  console.log(voucherCount)

  console.log('\n=== Account balances (non-zero) ===')
  const balances = db.prepare(`
    SELECT account_code, account_name, year, period,
           current_debit, current_credit, end_balance
    FROM account_balances
    WHERE current_debit != 0 OR current_credit != 0 OR end_balance != 0
    ORDER BY account_code, year, period
    LIMIT 20
  `).all()
  console.log(JSON.stringify(balances, null, 2))

  db.close()
} catch (e) {
  console.error('Error:', e.message)
}
