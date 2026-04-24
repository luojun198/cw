import Database from 'better-sqlite3'

const dbPath = 'C:/Program Files/data/finance.db'

try {
  const db = new Database(dbPath)

  console.log('\n=== Checking migrations table ===')
  const migrations = db.prepare('SELECT * FROM migrations ORDER BY version').all()
  console.log(migrations)

  db.close()
} catch (e) {
  console.error('Error:', e.message)
}
