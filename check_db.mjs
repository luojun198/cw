import Database from 'better-sqlite3'

const db = new Database('D:/kf/cw0416/data/finance.db', { readonly: true })

console.log('=== 检查数据库表 ===')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log('所有表:', tables.map(t => t.name).join(', '))

console.log('\n=== 检查 aux_categories 表 ===')
try {
  const auxCatSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='aux_categories'").get()
  if (auxCatSchema) {
    console.log('表结构:', auxCatSchema.sql)
    const count = db.prepare("SELECT COUNT(*) as count FROM aux_categories").get()
    console.log('记录数:', count.count)
  } else {
    console.log('❌ aux_categories 表不存在')
  }
} catch (e) {
  console.error('错误:', e.message)
}

console.log('\n=== 检查 aux_items 表 ===')
try {
  const auxItemsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='aux_items'").get()
  if (auxItemsSchema) {
    console.log('表结构:', auxItemsSchema.sql)
    const count = db.prepare("SELECT COUNT(*) as count FROM aux_items").get()
    console.log('记录数:', count.count)
  } else {
    console.log('❌ aux_items 表不存在')
  }
} catch (e) {
  console.error('错误:', e.message)
}

console.log('\n=== 检查 aux_category_fields 表 ===')
try {
  const auxFieldsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='aux_category_fields'").get()
  if (auxFieldsSchema) {
    console.log('表结构:', auxFieldsSchema.sql)
    const count = db.prepare("SELECT COUNT(*) as count FROM aux_category_fields").get()
    console.log('记录数:', count.count)
  } else {
    console.log('❌ aux_category_fields 表不存在')
  }
} catch (e) {
  console.error('错误:', e.message)
}

db.close()
