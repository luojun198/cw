import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath, { readonly: true })

  console.log('\n=== Checking transfer_types ===')
  const transferTypes = db.prepare('SELECT * FROM transfer_types').all()
  console.log(transferTypes)

  console.log('\n=== Checking transfer_items ===')
  const transferItems = db.prepare('SELECT * FROM transfer_items LIMIT 10').all()
  console.log(transferItems)

  db.close()
} catch (e) {
  console.error('Error:', e.message)
}
