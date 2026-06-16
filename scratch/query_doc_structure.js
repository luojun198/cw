import Database from 'better-sqlite3'

try {
  const dbPath = 'd:/BDKF/cw0523/data/finance.db'
  const db = new Database(dbPath, { readonly: true })
  
  // 1. 查询 scm_doc 结构
  const docCols = db.prepare("PRAGMA table_info(scm_doc)").all()
  console.log("scm_doc columns:")
  console.log(docCols.map(c => `${c.name} (${c.type})`).join(', '))

  // 2. 查询 scm_doc_line 结构
  const lineCols = db.prepare("PRAGMA table_info(scm_doc_line)").all()
  console.log("\nscm_doc_line columns:")
  console.log(lineCols.map(c => `${c.name} (${c.type})`).join(', '))

  db.close()
} catch (e) {
  console.error(e)
}
