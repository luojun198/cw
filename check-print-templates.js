import Database from 'better-sqlite3'

const db = new Database('D:/kf/cw0423/data/finance.db')

console.log('=== 检查打印模版数据 ===\n')

const templates = db.prepare(`
  SELECT id, name, paper_size, LENGTH(elements) as elements_length
  FROM print_templates
`).all()

console.log(`找到 ${templates.length} 个模版:\n`)

for (const t of templates) {
  console.log(`ID: ${t.id}`)
  console.log(`名称: ${t.name}`)
  console.log(`纸张尺寸: ${t.paper_size}`)
  console.log(`elements 长度: ${t.elements_length} 字节`)
  
  // 尝试解析 elements
  const raw = db.prepare('SELECT elements FROM print_templates WHERE id = ?').get(t.id)
  try {
    const elements = JSON.parse(raw.elements)
    console.log(`elements 数组长度: ${elements.length}`)
    console.log(`elements 类型: ${Array.isArray(elements) ? 'array' : typeof elements}`)
    
    // 检查是否有辅助项目列
    const tableElement = elements.find(e => e.type === 'table')
    if (tableElement && tableElement.columns) {
      const auxColumns = tableElement.columns.filter(c => c.field && c.field.startsWith('aux_'))
      if (auxColumns.length > 0) {
        console.log(`辅助项目列: ${auxColumns.map(c => c.field).join(', ')}`)
      }
    }
  } catch (error) {
    console.error(`❌ 解析 elements 失败: ${error.message}`)
  }
  console.log('---\n')
}

db.close()
