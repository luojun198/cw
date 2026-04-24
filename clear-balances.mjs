import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath)

  console.log('\n=== Clearing account_balances table ===')
  db.prepare('DELETE FROM account_balances').run()
  console.log('✓ Account balances cleared')

  console.log('\n=== Clearing auto_transfer_runs table ===')
  db.prepare('DELETE FROM auto_transfer_runs').run()
  console.log('✓ Auto transfer runs cleared')

  console.log('\n=== Verifying ===')
  const balanceCount = db.prepare('SELECT COUNT(*) as count FROM account_balances').get()
  const runCount = db.prepare('SELECT COUNT(*) as count FROM auto_transfer_runs').get()
  console.log('Account balances:', balanceCount)
  console.log('Auto transfer runs:', runCount)

  db.close()
  console.log('\n✓ All done')
} catch (e) {
  console.error('Error:', e.message)
}
