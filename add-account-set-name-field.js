const Database = require('better-sqlite3')
const path = require('path')

const dbPath = path.join(__dirname, 'data', 'finance.db')
const db = new Database(dbPath)

try {
  // 查询所有模版
  const templates = db.prepare('SELECT id, name, elements FROM print_templates').all()
  
  console.log(`找到 ${templates.length} 个模版`)
  
  templates.forEach(template => {
    let elements = JSON.parse(template.elements)
    
    // 检查是否已经有账套名称字段
    const hasAccountSetName = elements.some(el => el.type === 'account_set_name')
    
    if (hasAccountSetName) {
      console.log(`模版 "${template.name}" 已包含账套名称字段，跳过`)
      return
    }
    
    console.log(`更新模版 "${template.name}"...`)
    
    // 在标题后添加账套名称字段
    const accountSetNameElement = {
      id: `account_set_name_${Date.now()}`,
      type: 'account_set_name',
      x: 20,
      y: 55,
      width: 200,
      height: 30,
      fontSize: 12,
      fontWeight: 'normal',
      textAlign: 'left',
      visible: true
    }
    
    // 找到标题元素的索引
    const titleIndex = elements.findIndex(el => el.type === 'title')
    
    if (titleIndex !== -1) {
      // 在标题后插入账套名称
      elements.splice(titleIndex + 1, 0, accountSetNameElement)
      
      // 调整其他元素的 y 坐标（标题和账套名称之后的元素下移 30px）
      elements.forEach((el, index) => {
        if (index > titleIndex + 1 && el.y < 100) {
          el.y += 30
        }
      })
    } else {
      // 如果没有标题，直接添加到开头
      elements.unshift(accountSetNameElement)
    }
    
    // 更新数据库
    db.prepare('UPDATE print_templates SET elements = ? WHERE id = ?')
      .run(JSON.stringify(elements), template.id)
    
    console.log(`✓ 模版 "${template.name}" 更新成功`)
  })
  
  console.log('\n所有模版更新完成！')
  
} catch (error) {
  console.error('更新失败:', error)
  process.exit(1)
} finally {
  db.close()
}
