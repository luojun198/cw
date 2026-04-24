import Database from 'better-sqlite3'
import { resolve } from 'path'

// Try multiple possible DB paths
const possiblePaths = [
  'D:/kf/cw0416/server/data/cw_finance.db',
  'D:/kf/cw0416/server/data.db',
  'D:/kf/cw0416/server/data/cw.db',
]

for (const dbPath of possiblePaths) {
  try {
    const db = new Database(dbPath, { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    if (tables.length > 0) {
      console.log(`\n=== Found DB at: ${dbPath} ===`)
      console.log('Tables:', tables.map(t => t.name).join(', '))

      // Query account_sets
      const accountSets = db.prepare('SELECT * FROM account_sets LIMIT 3').all()
      console.log('\nAccount Sets:', JSON.stringify(accountSets, null, 2))

      // Query users
      const users = db.prepare('SELECT id, username, nickname, role_id FROM users LIMIT 3').all()
      console.log('\nUsers:', JSON.stringify(users, null, 2))

      // Query accounts (first few)
      const accounts = db.prepare('SELECT id, code, name, direction FROM accounts LIMIT 10').all()
      console.log('\nAccounts:', JSON.stringify(accounts, null, 2))

      db.close()
      break
    }
  } catch (e) {
    console.log(`Cannot read ${dbPath}: ${e.message}`)
  }
}
