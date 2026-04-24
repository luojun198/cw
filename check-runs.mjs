import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath, { readonly: true })

  console.log('\n=== auto_transfer_runs records ===')
  const runs = db.prepare('SELECT * FROM auto_transfer_runs ORDER BY created_at DESC LIMIT 10').all()
  console.log(JSON.stringify(runs, null, 2))

  db.close()
} catch (e) {
  console.error('Error:', e.message)
}
