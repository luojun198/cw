import Database from 'better-sqlite3'

// 检查开发环境数据库
const devDb = 'D:/kf/cw0416/data/finance.db'
console.log('=== 检查开发环境数据库:', devDb, '===')
try {
  const db = new Database(devDb, { readonly: true })
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
  console.log('表数量:', tables.length)
  console.log('表列表:', tables.map(t => t.name).join(', '))
  
  // 检查关键表
  const hasAuxCat = tables.some(t => t.name === 'aux_categories')
  const hasAuxItems = tables.some(t => t.name === 'aux_items')
  console.log('aux_categories 存在:', hasAuxCat)
  console.log('aux_items 存在:', hasAuxItems)
  
  db.close()
} catch (e) {
  console.error('错误:', e.message)
}

// 检查部署环境数据库
const deployDb = 'C:/Program Files/data/finance.db'
console.log('\n=== 检查部署环境数据库:', deployDb, '===')
try {
  const db = new Database(deployDb, { readonly: true })
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
  console.log('表数量:', tables.length)
  console.log('表列表:', tables.map(t => t.name).join(', '))
  
  // 检查关键表
  const hasAuxCat = tables.some(t => t.name === 'aux_categories')
  const hasAuxItems = tables.some(t => t.name === 'aux_items')
  console.log('aux_categories 存在:', hasAuxCat)
  console.log('aux_items 存在:', hasAuxItems)
  
  db.close()
} catch (e) {
  console.error('错误:', e.message)
}
