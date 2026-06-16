import Database from 'better-sqlite3'
import { join } from 'path'

try {
  const dbPath = 'd:/BDKF/cw0523/data/finance.db'
  const db = new Database(dbPath, { readonly: true })
  
  // 1. 查询所有目录（is_leaf = 0）
  const categories = db.prepare("SELECT id, code, name, parent_id, level FROM scm_item WHERE is_leaf = 0").all()
  console.log("Categories (is_leaf = 0):")
  console.log(JSON.stringify(categories, null, 2))

  // 2. 查询这些目录下的明细子项数量
  console.log("\nChild count per category:")
  for (const cat of categories) {
    const childCount = db.prepare("SELECT COUNT(*) c FROM scm_item WHERE parent_id = ?").get(cat.id).c
    const leafCount = db.prepare("SELECT COUNT(*) c FROM scm_item WHERE parent_id = ? AND is_leaf = 1").get(cat.id).c
    console.log(`Category: ${cat.code} - ${cat.name} (ID: ${cat.id}) has ${childCount} total children, ${leafCount} leaf children`)
  }

  // 3. 检查是否有明细没有parent_id
  const noParentCount = db.prepare("SELECT COUNT(*) c FROM scm_item WHERE is_leaf = 1 AND parent_id IS NULL").get().c
  const totalLeafCount = db.prepare("SELECT COUNT(*) c FROM scm_item WHERE is_leaf = 1").get().c
  console.log(`\nTotal leaf items: ${totalLeafCount}, Leaf items with parent_id IS NULL: ${noParentCount}`)

  db.close()
} catch (e) {
  console.error(e)
}
