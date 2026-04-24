import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath, { readonly: true })

  console.log('\n=== Type 20 transfer items ===')
  const items = db.prepare("SELECT * FROM transfer_items WHERE type_code='20' ORDER BY sort_order").all()
  console.log(JSON.stringify(items, null, 2))

  db.close()
} catch (e) {
  console.error('Error:', e.message)
}
