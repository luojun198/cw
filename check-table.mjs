import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath, { readonly: true })

  console.log('\n=== auto_transfer_runs table structure ===')
  const tableInfo = db.prepare("PRAGMA table_info(auto_transfer_runs)").all()
  console.log(tableInfo)

  console.log('\n=== auto_transfer_runs data ===')
  const data = db.prepare('SELECT * FROM auto_transfer_runs LIMIT 5').all()
  console.log(data)

  db.close()
} catch (e) {
  console.error('Error:', e.message)
}
