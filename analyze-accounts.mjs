import XLSX from 'xlsx'
import Database from 'better-sqlite3'

// 读取Excel文件
const workbook = XLSX.readFile('行政事业单位科目表.XLS')
const sheetName = workbook.SheetNames[0]
const worksheet = workbook.Sheets[sheetName]
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

// 找到表头行（包含"科目编码"的行）
let headerRowIndex = -1
for (let i = 0; i < rawData.length; i++) {
  if (rawData[i][0] === '科目编码' || rawData[i].includes('科目编码')) {
    headerRowIndex = i
    break
  }
}

console.log('表头行索引:', headerRowIndex)

// 解析数据
const excelAccounts = []
if (headerRowIndex >= 0) {
  const headers = rawData[headerRowIndex]
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (row[0]) {
      const code = String(row[0]).trim().replace(/\.$/, '') // 移除末尾的点
      const name = String(row[1] || '').trim()
      if (code && name) {
        excelAccounts.push({ code, name })
      }
    }
  }
}

console.log('Excel文件中的有效科目数量:', excelAccounts.length)
console.log('前10条科目:')
excelAccounts.slice(0, 10).forEach(acc => {
  console.log(`  ${acc.code} - ${acc.name}`)
})

// 连接数据库
const dbPath = process.env.DB_PATH || 'C:\\Program Files\\data\\finance.db'
const db = new Database(dbPath)

// 查询当前数据库中的科目
const accounts = db.prepare(`
  SELECT code, name, parent_id, level
  FROM accounts
  WHERE account_set_id = (SELECT id FROM account_sets LIMIT 1)
  ORDER BY code
`).all()

console.log('\n数据库中的科目数量:', accounts.length)

// 创建数据库科目映射
const dbAccountMap = new Map()
accounts.forEach(acc => dbAccountMap.set(acc.code, acc))

// 创建Excel科目映射
const excelAccountMap = new Map()
excelAccounts.forEach(acc => excelAccountMap.set(acc.code, acc))

// 分析缺失的父科目
const missingParents = new Set()

accounts.forEach(acc => {
  // 对于每个数据库中的科目，检查其所有可能的父科目
  const code = acc.code

  // 尝试不同长度的父科目编码
  for (let len = code.length - 1; len >= 4; len--) {
    const parentCode = code.substring(0, len)

    // 如果数据库中没有这个父科目，但Excel中有
    if (!dbAccountMap.has(parentCode) && excelAccountMap.has(parentCode)) {
      missingParents.add(parentCode)
    }
  }
})

console.log('\n缺失的父科目数量:', missingParents.size)
console.log('\n缺失的父科目列表:')
const sortedMissing = Array.from(missingParents).sort()
sortedMissing.forEach(code => {
  const excelAcc = excelAccountMap.get(code)
  console.log(`  ${code} - ${excelAcc.name}`)
})

db.close()
