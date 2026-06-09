import * as fs from 'fs'
import { extractVtsFromAcd, parseVtsContent } from './server/src/utils/rhVtsParser.js'

try {
  const buffer = fs.readFileSync('D:\\BDKF\\cw0523\\标准模版\\小企业会计准则\\小企业会计准则.acd')
  console.log(`Loaded ACD file: ${buffer.length} bytes`)

  const vtsFiles = extractVtsFromAcd(buffer)
  console.log(`Extracted ${vtsFiles.length} VTS files.`)

  for (const vts of vtsFiles) {
    console.log(`\n--- Parsing ${vts.name} ---`)
    const cells = parseVtsContent(vts.buffer)
    console.log(`Got ${cells.length} cells.`)
    for (let i = 0; i < Math.min(5, cells.length); i++) {
      console.log(cells[i])
    }
  }
} catch (e) {
  console.error(e)
}
