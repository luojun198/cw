import Database from 'better-sqlite3'
import { join } from 'path'

try {
  const dbPath = 'd:/BDKF/cw0523/data/finance.db'
  const db = new Database(dbPath, { readonly: true })
  
  // 查询表结构
  const info = db.prepare("PRAGMA table_info(scm_item)").all()
  console.log("scm_item columns:")
  console.log(info.map(c => `${c.name} (${c.type})`).join(', '))

  // 查询前10条物料的分类和级联关系
  const items = db.prepare("SELECT id, code, name, category_code, subcategory_code, parent_id, level, is_leaf FROM scm_item LIMIT 20").all()
  console.log("\nSome items:")
  console.log(JSON.stringify(items, null, 2))
  
  db.close()
} catch (e) {
  console.error(e)
}
