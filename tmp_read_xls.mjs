// Read XLS file using the server's xlsx dependency
import XLSX from 'xlsx'
import fs from 'fs'

const buf = fs.readFileSync('模版/资产表.XLS')
const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellStyles: true })

console.log('Sheet names:', wb.SheetNames)

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  console.log(`\n=== Sheet: ${name} ===`)
  console.log(`Range: ${ws['!ref']}`)
  console.log(`Rows: ${range.e.r - range.s.r + 1}, Cols: ${range.e.c - range.s.c + 1}`)
  
  // Print merged cells
  if (ws['!merges']) {
    console.log(`Merges: ${ws['!merges'].length}`)
    for (const m of ws['!merges'].slice(0, 5)) {
      console.log(`  ${XLSX.utils.encode_range(m)}`)
    }
  }
  
  // Print first 60 rows of content
  console.log('\nContent:')
  for (let r = range.s.r; r <= Math.min(range.e.r, 59); r++) {
    const row = []
    for (let c = range.s.c; c <= Math.min(range.e.c, 9); c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (!cell) {
        row.push('')
        continue
      }
      if (cell.f) {
        row.push(`[${cell.f}]`)
      } else if (cell.v !== undefined) {
        row.push(String(cell.v))
      } else {
        row.push('')
      }
    }
    const line = row.map((v, i) => `${String.fromCharCode(65 + i)}:${v}`).join(' | ')
    if (row.some(v => v !== '')) {
      console.log(`R${r + 1}: ${line}`)
    }
  }
}
