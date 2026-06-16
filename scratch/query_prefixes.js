import Database from 'better-sqlite3'
import { join } from 'path'

try {
  const dbPath = 'd:/BDKF/cw0523/data/finance.db'
  const db = new Database(dbPath, { readonly: true })

  // 查询 parent_id 不为 null 的明细物料的 category_code
  const items = db.prepare(`
    SELECT i.code, i.name, i.parent_id, i.category_code, p.code as parent_code, p.category_code as parent_category_code
    FROM scm_item i
    JOIN scm_item p ON i.parent_id = p.id
    WHERE i.is_leaf = 1 LIMIT 10
  `).all()
  console.log("Leaf items with parent:")
  console.log(JSON.stringify(items, null, 2))

  db.close()
} catch (e) {
  console.error(e)
}
