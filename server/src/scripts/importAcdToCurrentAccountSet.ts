import { getDb } from '../db/index.ts'
import { v4 as uuidv4 } from 'uuid'
import iconv from 'iconv-lite'
import * as fs from 'fs'
import * as zlib from 'zlib'
import bcrypt from 'bcryptjs'

type AcdRow = string[]

type AcdUser = {
  code: string
  username: string
  fullName: string
  password: string
}

type ParsedTables = {
  xt: Map<string, string>
  voucherTypes: AcdRow[]
  accounts: AcdRow[]
  initBalances: AcdRow[]
  transferTypes: AcdRow[]
  voucherEntries: AcdRow[]
  voucherHeaders: AcdRow[]
  reportCatalog: AcdRow[]
  reportFormulaCatalog: AcdRow[]
  reportTemplates: Map<string, string>
  reportTemplateBuffers: Map<string, Buffer>
  users: AcdUser[]
}

type ReportDefinitionSeed = {
  code: string
  name: string
  sourceFile: string
  sortOrder: number
}

type ParsedVtsCell = {
  rowIndex: number
  colIndex: number
  cellType: 'text' | 'formula' | 'number'
  textValue: string | null
  formulaText: string | null
  formatText: string | null
}

type ParsedVtsSheet = {
  key: string
  name: string
  index: number
  cells: ParsedVtsCell[]
}

type ParsedVtsTemplate = {
  sheets: ParsedVtsSheet[]
  formulas: string[]
}

type VtsStringMatch = {
  index: number
  value: string
}

type ImportStats = {
  accountSetId: string
  accountSetName: string
  importedTables: string[]
  systemParams: {
    upserted: number
  }
  voucherTypes: {
    inserted: number
    updated: number
    skipped: number
  }
  accounts: {
    inserted: number
    updated: number
    skipped: number
  }
  initBalances: {
    inserted: number
    skipped: number
  }
  transferTypes: {
    types: number
    items: number
  }
  vouchers: {
    vouchers: number
    entries: number
  }
  reportTemplates: {
    definitions: number
    sheets: number
    cells: number
    formulas: number
  }
  warnings: string[]
}

type Options = {
  acdFilePath?: string
  acdBuffer?: Buffer
  dryRun: boolean
}

function decodeTableContent(content: string): string {
  // Content is already decoded from GBK in parseAcdFileTables
  return content
}

function splitTableRows(content: string): AcdRow[] {
  return decodeTableContent(content)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split('\t'))
}

function parseAcdFileTables(filePath: string): { texts: Map<string, string>; buffers: Map<string, Buffer> }
function parseAcdFileTables(buffer: Buffer): { texts: Map<string, string>; buffers: Map<string, Buffer> }
function parseAcdFileTables(input: string | Buffer): { texts: Map<string, string>; buffers: Map<string, Buffer> } {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input
  const texts = new Map<string, string>()
  const buffers = new Map<string, Buffer>()
  let offset = 0
  const marker = Buffer.from('rhsj\\')

  while (offset < buffer.length - 32) {
    const markerIndex = buffer.indexOf(marker, offset)
    if (markerIndex === -1) break

    let fileNameEnd = markerIndex + marker.length
    while (fileNameEnd < buffer.length && buffer[fileNameEnd] !== 0) {
      fileNameEnd += 1
    }

    const fileNameBuffer = buffer.subarray(markerIndex + marker.length, fileNameEnd)
    const fileName = fileNameBuffer.toString('ascii').trim()

    if (!/^[\w]+\.(txt|vts)$/i.test(fileName)) {
      offset = markerIndex + 1
      continue
    }

    let headerStart = fileNameEnd + 1
    while (headerStart < buffer.length && buffer[headerStart] === 0x20) {
      headerStart += 1
    }

    if (headerStart + 12 > buffer.length) {
      break
    }

    const flag = buffer.readUInt8(headerStart)
    const headerZero = buffer.readUIntBE(headerStart + 1, 3)
    const decompressedSize = buffer.readUInt32LE(headerStart + 4)
    const compressedSize = buffer.readUInt32LE(headerStart + 8)

    if (flag !== 1 || headerZero !== 0 || compressedSize <= 0 || compressedSize > buffer.length || decompressedSize <= 0) {
      offset = markerIndex + 1
      continue
    }

    const compressedDataStart = headerStart + 12
    const compressedDataEnd = compressedDataStart + compressedSize
    if (compressedDataEnd > buffer.length) {
      offset = markerIndex + 1
      continue
    }

    try {
      const compressedData = buffer.subarray(compressedDataStart, compressedDataEnd)
      const decompressed = zlib.inflateSync(compressedData)
      // Decode directly from GBK buffer instead of latin1 intermediate
      // latin1 intermediate causes corruption for certain GBK double-byte sequences
      const decoded = iconv.decode(decompressed, 'gbk')
      texts.set(fileName.toLowerCase(), decoded)
      
      // Keep raw buffer for VTS files (for binary parsing)
      if (/\.vts$/i.test(fileName)) {
        buffers.set(fileName.toLowerCase(), decompressed)
      }
      
      offset = markerIndex + 1
    } catch {
      offset = markerIndex + 1
    }
  }

  return { texts, buffers }
}

function parseXtTable(content: string): Map<string, string> {
  const rows = splitTableRows(content)
  const result = new Map<string, string>()

  for (const row of rows) {
    if (!row[0]) continue
    result.set(row[0].trim(), (row[1] || '').trim())
  }

  return result
}

function parseAcdTables(acdFilePath: string): ParsedTables
function parseAcdTables(acdBuffer: Buffer): ParsedTables
function parseAcdTables(acdFilePathOrBuffer: string | Buffer, acdBuffer?: Buffer): ParsedTables {
  const { texts: tables, buffers: tableBuffers } = typeof acdFilePathOrBuffer === 'string' && !acdBuffer
    ? parseAcdFileTables(acdFilePathOrBuffer)
    : parseAcdFileTables(acdBuffer || (acdFilePathOrBuffer as Buffer))
  const getTable = (name: string) => tables.get(name.toLowerCase()) || ''

  const xtContent = getTable('xt.txt')
  const voucherTypeContent = getTable('pzlx.txt')
  const accountContent = getTable('kmbm.txt')
  const initBalanceContent = getTable('nc.txt')
  const transferTypeContent = getTable('jzlx.txt')
  const voucherEntryContent = getTable('pz.txt')
  const voucherHeaderContent = getTable('pzdj.txt')
  const reportCatalogContent = getTable('bbml.txt')
  const reportFormulaCatalogContent = getTable('bbml_gs.txt')
  const userContent = getTable('b_user.txt')
  const reportTemplates = new Map(
    Array.from(tables.entries()).filter(([fileName]) => /^bb[\w]+\.vts$/i.test(fileName))
  )
  const reportTemplateBuffers = new Map(
    Array.from(tableBuffers.entries()).filter(([fileName]) => /^bb[\w]+\.vts$/i.test(fileName))
  )
  console.log('[ACD] report template file names', Array.from(reportTemplates.keys()).sort())

  // Parse b_user.txt: format is code\tusername\tfullName\t[password]\t...
  const parsedUsers: AcdUser[] = []
  if (userContent) {
    const rows = splitTableRows(userContent)
    for (const row of rows) {
      if (row.length >= 2 && row[0] && row[1]) {
        parsedUsers.push({
          code: row[0].trim(),
          username: row[1].trim(),
          fullName: (row[2] || '').trim(),
          password: (row[3] || '').trim(),
        })
      }
    }
    console.log('[ACD] b_user.txt parsed:', parsedUsers.length, 'users')
  }

  console.log('[ACD] key tables', {
    xt: xtContent.length,
    pzlx: voucherTypeContent.length,
    kmbm: accountContent.length,
    nc: initBalanceContent.length,
    jzlx: transferTypeContent.length,
    pz: voucherEntryContent.length,
    pzdj: voucherHeaderContent.length,
    bbml: reportCatalogContent.length,
    bbml_gs: reportFormulaCatalogContent.length,
    reportTemplates: reportTemplates.size,
    b_user: parsedUsers.length,
    available: Array.from(tables.keys()).filter(key => ['xt.txt', 'pzlx.txt', 'kmbm.txt', 'nc.txt', 'jzlx.txt', 'pz.txt', 'pzdj.txt', 'bbml.txt', 'bbml_gs.txt', 'b_user.txt'].includes(key)),
  })

  return {
    xt: parseXtTable(xtContent),
    voucherTypes: splitTableRows(voucherTypeContent),
    accounts: splitTableRows(accountContent),
    initBalances: splitTableRows(initBalanceContent),
    transferTypes: splitTableRows(transferTypeContent),
    voucherEntries: splitTableRows(voucherEntryContent),
    voucherHeaders: splitTableRows(voucherHeaderContent),
    reportCatalog: splitTableRows(reportCatalogContent),
    reportFormulaCatalog: splitTableRows(reportFormulaCatalogContent),
    reportTemplates,
    reportTemplateBuffers,
    users: parsedUsers,
  }
}

function mapDirectionFromCode(code: string | undefined, fallbackCode: string): 'debit' | 'credit' {
  const value = (code || '').trim()
  if (value === '0') return 'debit'
  if (value === '1') return 'credit'

  if (fallbackCode.startsWith('2') || fallbackCode.startsWith('3') || fallbackCode.startsWith('4') || fallbackCode.startsWith('6') || fallbackCode.startsWith('8')) {
    return 'credit'
  }

  return 'debit'
}

function getAccountLevel(code: string): number {
  const normalized = code.replace(/\./g, '')
  if (normalized.length <= 4) return 1
  if (normalized.length <= 6) return 2
  return 3
}

function getParentCode(code: string, knownCodes: Set<string>): string | null {
  const normalized = code.replace(/\./g, '')
  const candidates: string[] = []

  if (normalized.length > 6) {
    candidates.push(normalized.slice(0, 6))
  }
  if (normalized.length > 4) {
    candidates.push(normalized.slice(0, 4))
  }

  for (const candidate of candidates) {
    if (knownCodes.has(candidate)) {
      return candidate
    }
  }

  return null
}

function inferVoucherPrefix(name: string, code: string): string {
  const trimmedName = name.trim()
  if (trimmedName.includes('收')) return 'SK'
  if (trimmedName.includes('付')) return 'FK'
  if (trimmedName.includes('转')) return 'ZZ'
  return code || trimmedName.slice(0, 2) || 'JZ'
}

function sanitizeReportName(name: string, fallback: string) {
  const trimmed = name.trim()
  return trimmed || fallback
}

function decodeVtsContent(content: string): string {
  return decodeTableContent(content)
}

function isReadableVtsText(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.length > 120) return false
  if (/^[\x00-\x1f\x7f]+$/.test(trimmed)) return false

  const printable = Array.from(trimmed).filter(char => {
    const code = char.charCodeAt(0)
    return code >= 0x20 || /[\u4e00-\u9fff]/.test(char)
  }).length

  return printable / trimmed.length >= 0.7
}

function isSheetMarker(value: string): boolean {
  return /^Sheet\d+$/i.test(value.trim())
}

function isFormulaToken(value: string): boolean {
  return /^@\w+\([^\)]*\)$/i.test(value.trim())
}

function isMeaningfulChineseToken(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return false
  if (/[\ue000-\uf8ff]/.test(trimmed)) return false
  if (/^(宋体|仿宋|黑体|楷体|华文[\u4e00-\u9fff]+)$/u.test(trimmed)) return false
  if (trimmed.length <= 1) return false
  if (/^[\u4e00-\u9fff]{2,}$/.test(trimmed)) return true
  if (/^[\u4e00-\u9fff][\u4e00-\u9fff\s：:、，（）()\-]*$/.test(trimmed)) return true
  if (/^[一二三四五六七八九十]+[、，.．].+/.test(trimmed)) return true
  if (/^[（(][一二三四五六七八九十]+[）)].+/.test(trimmed)) return true
  if (/^[0-9]+[.．、].+/.test(trimmed) && /[\u4e00-\u9fff]/.test(trimmed)) return true
  return false
}

function isLikelyVtsNoise(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.length <= 1 && !/[\u4e00-\u9fff]/.test(trimmed)) return true
  if (/^[A-Za-z]:\\/.test(trimmed)) return true
  if (/^(Arial|Times New Roman|MS Sans Serif|System|Fixedsys|Courier New|宋体|仿宋|黑体|楷体|华文[\u4e00-\u9fff]+)\d*$/i.test(trimmed)) return true
  if (/^(True|False|Printer|Print|Preview|Setup|System|Object|VB\.|Begin|End)$/i.test(trimmed)) return true
  if (/^(Left|Right|Top|Bottom|Center|General|Landscape|Portrait)$/i.test(trimmed)) return true
  if (/^(mm|cm|pt|inch|inches|dpi)$/i.test(trimmed)) return true
  if (/^[A-Za-z0-9_\-]{1,3}$/.test(trimmed) && !/\d/.test(trimmed)) return true
  if (/^[A-Za-z0-9_\-]{20,}$/.test(trimmed) && !/[\u4e00-\u9fff]/.test(trimmed)) return true
  if (/^[0-9.,:;\/\\\-]+$/.test(trimmed)) return true
  if (/^[#"$%\\()\[\],.;:_\-]+/.test(trimmed)) return true
  if (/\\\(|\\\)|_\)/.test(trimmed)) return true
  if (/�/.test(trimmed)) return true
  return false
}

function normalizeVtsToken(value: string): string {
  return value
    .replace(/[~&]+$/g, '')
    .replace(/�+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvePreferredSheetName(tokens: string[], fallbackSheetName: string, sheetIndex: number): string {
  const preferred = tokens.find(token => {
    if (isSheetMarker(token) || isFormulaToken(token)) return false
    if (token === fallbackSheetName || token === `${fallbackSheetName}(定义)`) return false
    if (!/表/.test(token)) return false
    if (/^(制表[:：]?|单位负责人[:：]?|财务负责人[:：]?)$/.test(token)) return false
    if (/^请根据.+填写此表的公式$/.test(token)) return false
    if (/^说明[:：]?/.test(token)) return false
    if (token.length > 24) return false
    return true
  })

  if (preferred) return preferred
  return sheetIndex === 0 ? fallbackSheetName : `${fallbackSheetName}-${sheetIndex + 1}`
}

function shouldKeepVtsToken(value: string, fallbackSheetName: string): boolean {
  const normalized = normalizeVtsToken(value)
  if (!normalized) return false
  if (normalized === fallbackSheetName || normalized === `${fallbackSheetName}(定义)`) return false
  if (isSheetMarker(normalized) || isFormulaToken(normalized)) return true
  if (isLikelyVtsNoise(normalized)) return false
  if (isMeaningfulChineseToken(normalized)) return true
  return /^(单位[:：]?元|本月数|本年累计数|本期发生额|累计发生额|累计完成数|项 目|项目|合 计|总 计)$/u.test(normalized)
}

function extractVtsStrings(content: string, fallbackSheetName: string): VtsStringMatch[] {
  const matches: VtsStringMatch[] = []
  let current = ''
  let start = -1

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const code = char.charCodeAt(0)
    const isReadable = (code >= 0x20 && code !== 0x7f) || /[\u4e00-\u9fff]/.test(char)

    if (isReadable) {
      if (current.length === 0) {
        start = index
      }
      current += char
      continue
    }

    if (current.length > 0 && isReadableVtsText(current)) {
      const normalized = normalizeVtsToken(current)
      if (shouldKeepVtsToken(normalized, fallbackSheetName)) {
        matches.push({ index: start, value: normalized })
      }
    }
    current = ''
    start = -1
  }

  if (current.length > 0 && isReadableVtsText(current)) {
    const normalized = normalizeVtsToken(current)
    if (shouldKeepVtsToken(normalized, fallbackSheetName)) {
      matches.push({ index: start, value: normalized })
    }
  }

  return matches
}

function normalizeSheetName(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed
}

function buildVtsCellsFromStrings(matches: VtsStringMatch[], fallbackSheetName: string): ParsedVtsSheet[] {
  const sheets: ParsedVtsSheet[] = []
  let pendingSheetMarker: string | null = null
  let pendingSheetMarkerIndex = -1
  let currentSheet: ParsedVtsSheet = {
    key: 'sheet1',
    name: fallbackSheetName,
    index: 0,
    cells: [],
  }
  let currentSheetTokens: string[] = []
  let rowIndex = 0
  let lastWasHeaderPair = false
  let pendingColumnLabels: string[] = []
  let pendingColumnLabelGroups: string[][] = []

  const isDefinitionOnlySheet = (sheet: ParsedVtsSheet) => {
    if (sheet.cells.length !== 1) return false
    const [cell] = sheet.cells
    return cell.cellType === 'text' && /\(定义\)$/.test(cell.textValue || '')
  }

  const isHeaderValue = (value: string) => /^(单位[:：]?元|本月数|本年累计数|本期发生额|累计发生额|累计完成数|上年数|本年数)$/u.test(value)
  const isSectionTitle = (value: string) => /^[一二三四五六七八九十]+[、，.．].+/u.test(value)
  const isIndentedProject = (value: string) => /^[（(][一二三四五六七八九十]+[）)].+/u.test(value)
  const isProjectLabel = (value: string) => isSectionTitle(value) || isIndentedProject(value)
  const isEnumeratedLabel = (value: string) => /^[0-9]+[.．、].+/u.test(value)
  const isColumnHeaderFragment = (value: string) =>
    /^(调整年初|本年|本年归|单位内部|本年财政|年末财政拨款|结转结余|财政拨款|归集|集上缴|调剂|拨款收入|拨款支出|结转|结余|调入|或调出)$/u.test(
      value
    )
  const isColumnHeaderGroupBoundary = (value: string) =>
    /^(结转结余|财政拨款|拨款收入|拨款支出|结转|调入|调整年初|年末财政拨款)$/u.test(value)
  const mergeColumnHeaderGroup = (group: string[]): string[] => {
    const merged: string[] = []
    for (const token of group) {
      const previous = merged[merged.length - 1] || ''
      if (!previous) {
        merged.push(token)
        continue
      }

      const combine = (() => {
        if (previous === '本年' && token === '归') return '本年归'
        if (previous === '本年归' && token === '单位内部') return '本年归还单位内部款'
        if (previous === '本年财政' && token === '本年财政') return '本年财政拨款'
        if (previous === '本年财政拨款' && token === '年末财政拨款') return '本年财政拨款和年末财政拨款'
        if (previous === '财政拨款' && token === '归集') return '财政拨款归集'
        if (previous === '财政拨款归集' && token === '集上缴') return '财政拨款归集上缴'
        if (previous === '结转' && token === '结余') return '结转结余'
        if (previous === '调入' && token === '或调出') return '调入或调出'
        return null
      })()

      if (combine) {
        merged[merged.length - 1] = combine
      } else {
        merged.push(token)
      }
    }

    return merged.filter((label, index, array) => {
      if (label !== '结转结余') return true
      const previous = array[index - 1] || ''
      return previous !== '结转结余'
    })
  }
  const isContinuationLabel = (value: string) => /^(其中[:：]|从.+提取|设置专用基金)$/u.test(value)

  const pushCurrentSheet = () => {
    if (currentSheet.cells.length === 0) return
    if (isDefinitionOnlySheet(currentSheet)) {
      currentSheet = {
        key: currentSheet.key,
        name: fallbackSheetName,
        index: currentSheet.index,
        cells: [],
      }
      currentSheetTokens = []
      rowIndex = 0
      lastWasHeaderPair = false
      pendingColumnLabels = []
      pendingColumnLabelGroups = []
      return
    }

    sheets.push({
      ...currentSheet,
      name: resolvePreferredSheetName(currentSheetTokens, fallbackSheetName, currentSheet.index),
      cells: [...currentSheet.cells],
    })
  }

  const startNextSheet = (marker: string, markerIndex: number) => {
    const nextIndex = sheets.length
    currentSheet = {
      key: `sheet${nextIndex + 1}`,
      name: normalizeSheetName(marker, `${fallbackSheetName}-${nextIndex + 1}`),
      index: nextIndex,
      cells: [],
    }
    currentSheetTokens = []
    rowIndex = 0
    lastWasHeaderPair = false
    pendingColumnLabels = []
    pendingColumnLabelGroups = []
    pendingSheetMarker = marker
    pendingSheetMarkerIndex = markerIndex
  }

  const rowHasCol = (targetRowIndex: number, targetColIndex: number) =>
    currentSheet.cells.some(cell => cell.rowIndex === targetRowIndex && cell.colIndex === targetColIndex)

  const pushCell = (value: string, cellType: ParsedVtsCell['cellType'], targetColIndex: number, targetRowIndex = rowIndex) => {
    currentSheetTokens.push(value)
    currentSheet.cells.push({
      rowIndex: targetRowIndex,
      colIndex: targetColIndex,
      cellType,
      textValue: cellType === 'formula' ? null : value,
      formulaText: cellType === 'formula' ? value : null,
      formatText: null,
    })
  }

  const startNextRow = () => {
    rowIndex += 1
    lastWasHeaderPair = false
  }

  const flushPendingColumnLabels = () => {
    if (pendingColumnLabels.length > 0) {
      pendingColumnLabelGroups.push([...pendingColumnLabels])
      pendingColumnLabels = []
    }

    if (pendingColumnLabelGroups.length === 0) return

    const headerStartRowIndex = rowIndex
    pendingColumnLabelGroups.forEach((group, groupIndex) => {
      const targetRowIndex = headerStartRowIndex + groupIndex
      const mergedGroup = mergeColumnHeaderGroup(group)
      mergedGroup.forEach((label, index) => {
        pushCell(label, 'text', index + 1, targetRowIndex)
      })
    })

    rowIndex = headerStartRowIndex + pendingColumnLabelGroups.length
    pendingColumnLabelGroups = []
    lastWasHeaderPair = true
  }

  for (const match of matches) {
    const value = match.value
    if (isSheetMarker(value)) {
      pendingSheetMarker = value
      pendingSheetMarkerIndex = match.index
      continue
    }

    if (pendingSheetMarker && match.index - pendingSheetMarkerIndex <= 12) {
      continue
    }

    if (pendingSheetMarker) {
      flushPendingColumnLabels()
      pushCurrentSheet()
      startNextSheet(pendingSheetMarker, pendingSheetMarkerIndex)
      pendingSheetMarker = null
      pendingSheetMarkerIndex = -1
    }

    if (/\(定义\)$/.test(value)) {
      if (currentSheet.cells.length === 0) {
        currentSheetTokens.push(value)
      }
      continue
    }

    const cellType: ParsedVtsCell['cellType'] = isFormulaToken(value) ? 'formula' : 'text'

    if (cellType === 'formula') {
      flushPendingColumnLabels()
      pushCell(value, cellType, 1)
      startNextRow()
      continue
    }

    if (value === '项 目' || value === '项目') {
      flushPendingColumnLabels()
      const targetRowIndex = rowHasCol(rowIndex, 0) ? rowIndex : Math.max(rowIndex - 1, 0)
      pushCell(value, cellType, 1, targetRowIndex)
      if (targetRowIndex === rowIndex) {
        startNextRow()
      }
      lastWasHeaderPair = true
      continue
    }

    if (isHeaderValue(value)) {
      flushPendingColumnLabels()
      const targetColIndex = rowHasCol(rowIndex, 0) ? 1 : 0
      pushCell(value, cellType, targetColIndex)
      if (targetColIndex === 1) {
        lastWasHeaderPair = true
        startNextRow()
      }
      continue
    }

    if (isColumnHeaderFragment(value)) {
      if (isColumnHeaderGroupBoundary(value) && pendingColumnLabels.length > 0) {
        pendingColumnLabelGroups.push([...pendingColumnLabels])
        pendingColumnLabels = []
      }
      pendingColumnLabels.push(value)
      continue
    }

    if (isContinuationLabel(value)) {
      flushPendingColumnLabels()
      pushCell(value, cellType, 1)
      startNextRow()
      continue
    }

    flushPendingColumnLabels()

    if (isProjectLabel(value) || isEnumeratedLabel(value)) {
      pushCell(value, cellType, 0)
      startNextRow()
      continue
    }

    if (lastWasHeaderPair) {
      pushCell(value, cellType, 1)
      startNextRow()
      continue
    }

    pushCell(value, cellType, 0)
    startNextRow()
  }

  flushPendingColumnLabels()
  pushCurrentSheet()
  return sheets
}

function extractQuotedVtsValue(segment: string): string {
  const match = segment.match(/"((?:[^"]|"")*)"/)
  if (!match) return ''
  return match[1].replace(/""/g, '"').trim()
}

function parseVtsCellLine(line: string): ParsedVtsCell | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const cellMatch = trimmed.match(/^CELL\s+([A-Z]+)(\d+)(.*)$/i)
  if (!cellMatch) return null

  const columnLabel = cellMatch[1].toUpperCase()
  const rowIndex = Number.parseInt(cellMatch[2], 10)
  const remainder = cellMatch[3] || ''

  if (!Number.isInteger(rowIndex) || rowIndex <= 0) {
    return null
  }

  let colIndex = 0
  for (const char of columnLabel) {
    colIndex = colIndex * 26 + (char.charCodeAt(0) - 64)
  }

  const formulaText = (() => {
    const formulaMatch = remainder.match(/\b(?:FORMULA|FX)\s+"((?:[^"]|"")*)"/i)
    if (!formulaMatch) return null
    return formulaMatch[1].replace(/""/g, '"').trim() || null
  })()

  const formatText = (() => {
    const formatMatch = remainder.match(/\bFORMAT\s+"((?:[^"]|"")*)"/i)
    if (!formatMatch) return null
    return formatMatch[1].replace(/""/g, '"').trim() || null
  })()

  let textValue = extractQuotedVtsValue(remainder)
  if (formulaText && textValue === formulaText) {
    textValue = ''
  }

  const numericCandidate = textValue.replace(/,/g, '')
  const isNumeric = numericCandidate !== '' && /^-?\d+(?:\.\d+)?$/.test(numericCandidate)
  const cellType: ParsedVtsCell['cellType'] = formulaText
    ? 'formula'
    : isNumeric
      ? 'number'
      : 'text'

  return {
    rowIndex: rowIndex - 1,
    colIndex: colIndex - 1,
    cellType,
    textValue: textValue || null,
    formulaText,
    formatText,
  }
}

/**
 * Parse VTS content as a full-table paste grid.
 * Rules:
 * - Cell starts with '=' or '@' => formula
 * - Other non-empty cells => text
 * - Empty cells are ignored
 */
function parsePastedGridTemplate(content: string, fallbackSheetName: string): ParsedVtsTemplate {
  const normalizePunctuation = (input: string) =>
    input
      .replace(/\u3000/g, ' ') // full-width space
      .replace(/[：]/g, ':')
      .replace(/[，]/g, ',')
      .replace(/[。]/g, '.')
      .replace(/[；]/g, ';')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')

  const normalized = normalizePunctuation(decodeTableContent(content))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const rawRows = normalized.split('\n').map(row => row.replace(/[\t ]+$/g, ''))

  // Trim leading/trailing fully-empty rows
  let startRow = 0
  let endRow = rawRows.length - 1
  while (startRow <= endRow && rawRows[startRow].trim() === '') startRow += 1
  while (endRow >= startRow && rawRows[endRow].trim() === '') endRow -= 1

  const slicedRows = startRow <= endRow ? rawRows.slice(startRow, endRow + 1) : []
  const splitRows = slicedRows.map(row => row.split('\t'))

  // Determine effective max column (drop trailing fully-empty columns)
  let maxCol = -1
  splitRows.forEach(cols => {
    for (let i = cols.length - 1; i >= 0; i -= 1) {
      const value = cols[i].replace(/\u00a0/g, ' ').trim()
      if (value !== '') {
        if (i > maxCol) maxCol = i
        break
      }
    }
  })

  // Hard anchors for top header rows (especially balance sheet templates)
  const headerAnchors: Array<{ key: string; pattern: RegExp; targetRow: number }> = [
    { key: 'title', pattern: /资产负债表|利润表|现金流量表/, targetRow: 0 },
    { key: 'org', pattern: /编制单位[:：]|单位[:：]/, targetRow: 2 },
    { key: 'date', pattern: /日期[:：]|会计期间/, targetRow: 3 },
  ]

  const detectHeaderAnchor = (rowText: string) => {
    const text = rowText.replace(/\s+/g, '')
    return headerAnchors.find(anchor => anchor.pattern.test(text)) || null
  }

  const isNoiseRow = (cols: string[]) => {
    const compact = cols
      .map(v => v.replace(/\u00a0/g, ' ').trim())
      .filter(Boolean)
      .join('')

    if (!compact) return true
    // Entire row is only punctuation/noise symbols
    if (/^[#"$%\\()\[\],.;:_\-~`!@^&*+=|/<>?]+$/.test(compact)) return true
    // OCR-like dense garbage
    if (/^[^\u4e00-\u9fa5A-Za-z0-9]{8,}$/.test(compact)) return true

    return false
  }

  type RowPlacement = { sourceRowIndex: number; targetRowIndex: number; cols: string[]; isHeader: boolean }

  const occupiedRows = new Set<number>()
  const placements: RowPlacement[] = []

  // 1) place anchored header rows first (hard anchors in top N rows)
  splitRows.forEach((cols, sourceRowIndex) => {
    const rowText = cols.join('')
    const anchor = detectHeaderAnchor(rowText)
    if (!anchor) return

    let targetRowIndex = anchor.targetRow
    while (occupiedRows.has(targetRowIndex)) {
      targetRowIndex += 1
    }

    occupiedRows.add(targetRowIndex)
    placements.push({ sourceRowIndex, targetRowIndex, cols, isHeader: true })
  })

  // 2) place body rows in original order, skipping occupied rows
  let bodyCursor = 0
  splitRows.forEach((cols, sourceRowIndex) => {
    const rowText = cols.join('')
    const anchor = detectHeaderAnchor(rowText)
    if (anchor) return
    if (isNoiseRow(cols)) return

    while (occupiedRows.has(bodyCursor)) {
      bodyCursor += 1
    }

    placements.push({ sourceRowIndex, targetRowIndex: bodyCursor, cols, isHeader: false })
    occupiedRows.add(bodyCursor)
    bodyCursor += 1
  })

  placements.sort((a, b) => a.targetRowIndex - b.targetRowIndex || a.sourceRowIndex - b.sourceRowIndex)

  const cells: ParsedVtsCell[] = []
  const formulas = new Set<string>()

  placements.forEach(({ targetRowIndex, cols, isHeader }) => {
    if (maxCol < 0) return

    for (let colIndex = 0; colIndex <= maxCol; colIndex += 1) {
      const rawCell = cols[colIndex] ?? ''
      const value = normalizePunctuation(rawCell.replace(/\u00a0/g, ' ').trim())
      if (!value) continue

      // Skip obvious OCR/garbled noise chunks for non-header rows
      if (!isHeader && /^[#"$%\\()\[\],.;:_\-~`!@^&*+=|/<>?]+$/.test(value)) continue

      const isFormula = value.startsWith('=') || value.startsWith('@')
      const cellType: ParsedVtsCell['cellType'] = isFormula ? 'formula' : 'text'

      cells.push({
        rowIndex: targetRowIndex,
        colIndex,
        cellType,
        textValue: isFormula ? null : value,
        formulaText: isFormula ? value : null,
        formatText: null,
      })

      if (isFormula) {
        formulas.add(value)
      }
    }
  })

  const sheet: ParsedVtsSheet = {
    key: 'sheet1',
    name: fallbackSheetName,
    index: 0,
    cells,
  }

  return {
    sheets: cells.length > 0 ? [sheet] : [],
    formulas: Array.from(formulas),
  }
}

function parseBinaryVtsTemplate(buffer: Buffer, fallbackSheetName: string): ParsedVtsTemplate {
  const decoded = iconv.decode(buffer, 'gb18030')
  return parsePastedGridTemplate(decoded, fallbackSheetName)
}

function parseVtsTemplate(content: string, fallbackSheetName: string): ParsedVtsTemplate {
  const decoded = decodeVtsContent(content)
  return parsePastedGridTemplate(decoded, fallbackSheetName)
}

function extractFormulaFunctionNames(formulas: string[]): string[] {
  const functions = new Set<string>()

  for (const formula of formulas) {
    const matches = formula.matchAll(/@([a-zA-Z_][\w]*)/g)
    for (const match of matches) {
      functions.add(match[1].toLowerCase())
    }
  }

  return Array.from(functions).sort((a, b) => a.localeCompare(b))
}

function buildReportDefinitionSeeds(rows: AcdRow[], reportTemplates: Map<string, string>): ReportDefinitionSeed[] {
  const seeds: ReportDefinitionSeed[] = []

  rows.forEach((row, index) => {
    const code = (row[0] || '').trim()
    if (!code) return

    const sourceFile = `bb${code.padStart(5, '0')}.vts`
    if (!reportTemplates.has(sourceFile.toLowerCase())) {
      return
    }

    const rawName = (row[1] || '').trim()
    seeds.push({
      code,
      name: sanitizeReportName(rawName, `报表${code}`),
      sourceFile,
      sortOrder: index,
    })
  })

  return seeds
}

function importReportTemplates(accountSetId: string, tables: ParsedTables, stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  const reportSeeds = buildReportDefinitionSeeds(tables.reportCatalog, tables.reportTemplates)

  if (tables.reportCatalog.length === 0) {
    stats.warnings.push('bbml.txt 没有可导入数据')
    return
  }

  stats.importedTables.push('bbml.txt')
  if (tables.reportFormulaCatalog.length > 0) {
    stats.importedTables.push('bbml_gs.txt')
  }
  for (const fileName of tables.reportTemplates.keys()) {
    stats.importedTables.push(fileName)
  }

  if (reportSeeds.length === 0) {
    stats.warnings.push('未匹配到可导入的报表模板文件')
    return
  }

  const parsedTemplates = new Map<string, ParsedVtsTemplate>()
  const allFormulaTexts: string[] = []
  for (const reportSeed of reportSeeds) {
    const rawBuffer = tables.reportTemplateBuffers.get(reportSeed.sourceFile.toLowerCase())
    const rawTemplate = tables.reportTemplates.get(reportSeed.sourceFile.toLowerCase()) || ''
    
    // Use binary parsing if buffer is available, otherwise fall back to string parsing
    const parsedTemplate = rawBuffer 
      ? parseBinaryVtsTemplate(rawBuffer, reportSeed.name)
      : parseVtsTemplate(rawTemplate, reportSeed.name)
    
    parsedTemplates.set(reportSeed.code, parsedTemplate)
    stats.reportTemplates.definitions += 1
    stats.reportTemplates.sheets += parsedTemplate.sheets.length
    stats.reportTemplates.cells += parsedTemplate.sheets.reduce((sum, sheet) => sum + sheet.cells.length, 0)
    allFormulaTexts.push(...parsedTemplate.formulas)
  }

  const formulaFunctionNames = extractFormulaFunctionNames(allFormulaTexts)
  stats.reportTemplates.formulas = formulaFunctionNames.length

  if (dryRun) return

  const existingDefinitions = db
    .prepare('SELECT id, code FROM report_definitions WHERE account_set_id = ?')
    .all(accountSetId) as Array<{ id: string; code: string }>
  const definitionIdByCode = new Map(existingDefinitions.map(item => [String(item.code), item.id]))

  const upsertDefinition = db.prepare(`
    INSERT INTO report_definitions (id, account_set_id, code, name, source, source_file, sort_order, is_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'acd', ?, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(account_set_id, code)
    DO UPDATE SET name = excluded.name, source = excluded.source, source_file = excluded.source_file, sort_order = excluded.sort_order, updated_at = datetime('now')
  `)
  const deleteSheets = db.prepare(
    `DELETE FROM report_sheets WHERE report_definition_id = ?`
  )
  const deleteSources = db.prepare(
    `DELETE FROM report_template_sources WHERE report_definition_id = ?`
  )
  const deleteFormulaFunctions = db.prepare(
    `DELETE FROM report_formula_functions WHERE account_set_id = ?`
  )
  const insertSheet = db.prepare(
    `INSERT INTO report_sheets (id, report_definition_id, sheet_key, sheet_name, sheet_index, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  )
  const insertSource = db.prepare(
    `INSERT INTO report_template_sources (id, report_definition_id, source_file, source_type, raw_content, content_encoding, parse_version, created_at) VALUES (?, ?, ?, 'vts', ?, 'gb18030', 'grid-paste-v2', datetime('now'))`
  )
  const insertCell = db.prepare(
    `INSERT INTO report_cells (id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, format_text, style_key, side, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, datetime('now'), datetime('now'))`
  )
  const insertFormulaFunction = db.prepare(
    `INSERT INTO report_formula_functions (id, account_set_id, function_name, handler_key, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  )

  deleteFormulaFunctions.run(accountSetId)
  for (const functionName of formulaFunctionNames) {
    insertFormulaFunction.run(
      uuidv4(),
      accountSetId,
      functionName,
      `acd:${functionName}`,
      'ACD 报表公式函数（待实现执行器）'
    )
  }

  for (const reportSeed of reportSeeds) {
    const definitionId = definitionIdByCode.get(reportSeed.code) || uuidv4()
    const rawTemplate = tables.reportTemplates.get(reportSeed.sourceFile.toLowerCase()) || ''
    const parsedTemplate = parsedTemplates.get(reportSeed.code) || { sheets: [], formulas: [] }

    upsertDefinition.run(
      definitionId,
      accountSetId,
      reportSeed.code,
      reportSeed.name,
      reportSeed.sourceFile,
      reportSeed.sortOrder
    )
    definitionIdByCode.set(reportSeed.code, definitionId)

    deleteSheets.run(definitionId)
    deleteSources.run(definitionId)

    insertSource.run(uuidv4(), definitionId, reportSeed.sourceFile, rawTemplate)

    if (parsedTemplate.sheets.length === 0) {
      insertSheet.run(uuidv4(), definitionId, 'sheet1', reportSeed.name, 0)
      continue
    }

    for (const sheet of parsedTemplate.sheets) {
      const sheetId = uuidv4()
      const dedupedCells = sheet.cells.filter((cell, index, allCells) => {
        const firstIndex = allCells.findIndex(candidate => candidate.rowIndex === cell.rowIndex && candidate.colIndex === cell.colIndex)
        return firstIndex === index
      })
      insertSheet.run(sheetId, definitionId, sheet.key, sheet.name, sheet.index)
      for (const cell of dedupedCells) {
        insertCell.run(
          uuidv4(),
          sheetId,
          cell.rowIndex,
          cell.colIndex,
          cell.cellType,
          cell.textValue,
          cell.formulaText,
          cell.formatText
        )
      }
    }
  }
}

function resolveCurrentAccountSet() {
  const db = getDb()
  const accountSet = db.prepare('SELECT * FROM account_sets LIMIT 1').get() as any
  if (!accountSet) {
    throw new Error('没有找到账套，请先初始化数据库')
  }
  return accountSet
}

function buildStats(accountSetId: string, accountSetName: string): ImportStats {
  return {
    accountSetId,
    accountSetName,
    importedTables: [],
    systemParams: { upserted: 0 },
    voucherTypes: { inserted: 0, updated: 0, skipped: 0 },
    accounts: { inserted: 0, updated: 0, skipped: 0 },
    initBalances: { inserted: 0, skipped: 0 },
    transferTypes: { types: 0, items: 0 },
    vouchers: { vouchers: 0, entries: 0 },
    reportTemplates: { definitions: 0, sheets: 0, cells: 0, formulas: 0 },
    warnings: [],
  }
}

function importSystemParams(accountSetId: string, xt: Map<string, string>, stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  const candidates = [
    { key: 'import_acd:version', value: xt.get('xt_bbh') || '' },
    { key: 'import_acd:source_fiscal_year', value: xt.get('xt_jzyf') || '' },
    { key: 'import_acd:unit_name', value: xt.get('xt_dwmc') || '' },
    { key: 'import_acd:base_currency', value: xt.get('xt_bwb') || '' },
  ].filter(item => item.value)

  if (candidates.length === 0) {
    stats.warnings.push('xt.txt 未解析出可导入的系统参数')
    return
  }

  stats.importedTables.push('xt.txt')
  stats.systemParams.upserted += candidates.length

  if (dryRun) return

  const upsert = db.prepare(`
    INSERT INTO system_params (id, account_set_id, param_key, param_value, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(account_set_id, param_key)
    DO UPDATE SET param_value = excluded.param_value, updated_at = datetime('now')
  `)

  for (const item of candidates) {
    upsert.run(uuidv4(), accountSetId, item.key, item.value, 'ACD 导入元数据')
  }
}

function importVoucherTypes(accountSetId: string, rows: AcdRow[], stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  if (rows.length === 0) {
    stats.warnings.push('pzlx.txt 没有可导入数据')
    return
  }

  stats.importedTables.push('pzlx.txt')

  const existing = db
    .prepare('SELECT * FROM voucher_types WHERE account_set_id = ?')
    .all(accountSetId) as Array<any>
  const existingByCode = new Map(existing.map(item => [String(item.code || '').trim(), item]))

  const insertStmt = db.prepare(
    'INSERT INTO voucher_types (id, account_set_id, name, code, prefix, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const updateStmt = db.prepare(
    'UPDATE voucher_types SET name=?, prefix=?, description=?, sort_order=? WHERE id=?'
  )

  rows.forEach((row, index) => {
    const code = (row[0] || '').trim()
    const name = (row[1] || '').trim()

    if (!code || !name) {
      stats.voucherTypes.skipped += 1
      return
    }

    const prefix = inferVoucherPrefix(name, code)
    const existingRow = existingByCode.get(code)

    if (!existingRow) {
      stats.voucherTypes.inserted += 1
      if (!dryRun) {
        insertStmt.run(uuidv4(), accountSetId, name, code, prefix, 'ACD 导入', index)
      }
      return
    }

    stats.voucherTypes.updated += 1
    if (!dryRun) {
      updateStmt.run(name, prefix, 'ACD 导入', index, existingRow.id)
    }
  })
}

function importAccounts(accountSetId: string, rows: AcdRow[], stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  if (rows.length === 0) {
    stats.warnings.push('kmbm.txt 没有可导入数据')
    return
  }

  stats.importedTables.push('kmbm.txt')

  const filtered = rows
    .map(row => ({
      code: (row[0] || '').trim(),
      name: (row[1] || row[16] || '').trim(),
      levelText: (row[2] || '').trim(),
      isCash: (row[14] || '0').trim() === '1' ? 1 : 0,
      isBank: (row[15] || '0').trim() === '1' ? 1 : 0,
      direction: mapDirectionFromCode(row[15], (row[0] || '').trim()),
    }))
    .filter(item => item.code && item.name)
    .sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))

  const knownCodes = new Set(filtered.map(item => item.code))
  const existing = db
    .prepare('SELECT * FROM accounts WHERE account_set_id = ?')
    .all(accountSetId) as Array<any>
  const existingByCode = new Map(existing.map(item => [String(item.code || '').trim(), item]))
  const accountIdByCode = new Map(existing.map(item => [String(item.code || '').trim(), String(item.id)]))

  const insertStmt = db.prepare(`
    INSERT INTO accounts (id, account_set_id, code, name, direction, level, parent_id, is_cash, is_bank, is_aux, aux_types, is_enabled, allow_delete, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 1, 1, datetime('now'), datetime('now'))
  `)
  const updateStmt = db.prepare(`
    UPDATE accounts
    SET name=?, direction=?, level=?, parent_id=?, is_cash=?, is_bank=?, updated_at=datetime('now')
    WHERE id=?
  `)

  for (const item of filtered) {
    const level = Number.parseInt(item.levelText, 10) || getAccountLevel(item.code)
    const parentCode = getParentCode(item.code, knownCodes)
    const parentId = parentCode ? accountIdByCode.get(parentCode) || null : null
    const existingRow = existingByCode.get(item.code)

    if (!existingRow) {
      const id = uuidv4()
      stats.accounts.inserted += 1
      accountIdByCode.set(item.code, id)
      if (!dryRun) {
        insertStmt.run(id, accountSetId, item.code, item.name, item.direction, level, parentId, item.isCash, item.isBank)
      }
      continue
    }

    stats.accounts.updated += 1
    accountIdByCode.set(item.code, String(existingRow.id))
    if (!dryRun) {
      updateStmt.run(item.name, item.direction, level, parentId, item.isCash, item.isBank, existingRow.id)
    }
  }
}

function importInitBalances(accountSetId: string, rows: AcdRow[], stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  if (rows.length === 0) {
    stats.warnings.push('nc.txt 没有可导入数据')
    return
  }

  stats.importedTables.push('nc.txt')

  const accounts = db
    .prepare('SELECT id, code, direction FROM accounts WHERE account_set_id = ?')
    .all(accountSetId) as Array<{ id: string; code: string; direction: 'debit' | 'credit' }>
  const accountByCode = new Map(accounts.map(item => [String(item.code || '').trim(), item]))

  const yearCandidates = rows
    .map(row => Number.parseInt((row[14] || '').trim(), 10))
    .filter(value => Number.isInteger(value) && value > 1900)
  const importYear = yearCandidates[0] || new Date().getFullYear()

  const deleteStmt = db.prepare('DELETE FROM init_balances WHERE account_set_id = ? AND year = ?')
  const insertStmt = db.prepare(`
    INSERT INTO init_balances (id, account_set_id, account_id, direction, year, period, init_balance, init_debit, init_credit, aux_item_id, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, datetime('now'))
  `)

  interface PreparedRow {
    accountId: string
    direction: 'debit' | 'credit'
    debit: number
    credit: number
    balance: number
  }

  const preparedRows: PreparedRow[] = []

  for (const row of rows) {
    const code = (row[0] || '').trim()
    const account = accountByCode.get(code)
    if (!code || !account) {
      stats.initBalances.skipped += 1
      continue
    }

    // nc.txt 列映射：row[2]=年初借方, row[3]=年初贷方
    const debit = parseFloat((row[2] || '0').replace(/,/g, '')) || 0
    const credit = parseFloat((row[3] || '0').replace(/,/g, '')) || 0
    const direction = account.direction
    const balance = direction === 'debit' ? debit - credit : credit - debit

    preparedRows.push({ accountId: account.id, direction, debit, credit, balance })
    stats.initBalances.inserted += 1
  }

  if (preparedRows.length === 0) {
    stats.warnings.push('nc.txt 未匹配到当前账套科目，未生成期初余额')
    return
  }

  if (dryRun) return

  deleteStmt.run(accountSetId, importYear)
  for (const row of preparedRows) {
    insertStmt.run(uuidv4(), accountSetId, row.accountId, row.direction, importYear, row.balance, row.debit, row.credit)
  }
}

function importTransferTypes(accountSetId: string, rows: AcdRow[], accounts: AcdRow[], stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  if (rows.length === 0) {
    stats.warnings.push('jzlx.txt 没有可导入数据')
    return
  }

  stats.importedTables.push('jzlx.txt')

  // Build account code -> name map
  const accountNameMap = new Map<string, string>()
  for (const row of accounts) {
    const code = (row[0] || '').trim()
    const name = (row[1] || '').trim()
    if (code && name) accountNameMap.set(code, name)
  }

  // Group rows by transfer type code (column 0)
  const typeGroups = new Map<string, { rows: AcdRow[]; name: string; voucherType: string }>()
  for (const row of rows) {
    const typeCode = (row[0] || '').trim()
    const voucherType = (row[1] || '').trim()
    const typeName = (row[3] || '').trim()
    if (!typeCode) continue

    if (!typeGroups.has(typeCode)) {
      // ACD type names are sometimes truncated (e.g. "结转本期支" instead of "结转本期支出")
      // Provide complete fallback names for known truncated patterns
      const fullNames: Record<string, string> = {
        '10': '结转本期收入',
        '20': '结转本期支出',
        '30': '转营业成本',
        '40': '转所得税',
        '50': '转损益调整',
        '60': '结转盈余(日常)',
        '70': '结转累计盈余',
        '80': '结转财政拨款',
        '82': '结转非财政拨款',
        '84': '结转其他资金',
        '86': '结转经营(日常)',
        '88': '财政拨款结转',
        '90': '非财政拨款结转',
        '92': '其他结余结转',
        '94': '其他结余分配',
        '96': '非财政拨款结余',
        '98': '非财政拨款分配',
      }
      // ACD type names can be truncated or garbled (encoding issues)
      // Always prefer the known full name over the ACD name for known type codes
      const betterName = fullNames[typeCode] || typeName || `结转类型${typeCode}`
      // voucherType: '2' means 结转 in ACD; garbled values should default to '结转'
      // Only accept known clean values, otherwise default to '结转'
      const vTypeLabel = voucherType === '2' ? '结转' : (/^[\w]+$/.test(voucherType) ? voucherType : '结转')
      typeGroups.set(typeCode, { rows: [], name: betterName, voucherType: vTypeLabel })
    }
    typeGroups.get(typeCode)!.rows.push(row)
  }

  stats.transferTypes.types = typeGroups.size
  let itemCount = 0

  if (dryRun) {
    stats.transferTypes.items = rows.length
    return
  }

  // Delete existing transfer data for this account set
  db.prepare('DELETE FROM transfer_items WHERE account_set_id = ?').run(accountSetId)
  db.prepare('DELETE FROM transfer_types WHERE account_set_id = ?').run(accountSetId)

  const insertType = db.prepare(`
    INSERT INTO transfer_types (id, account_set_id, code, name, voucher_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `)

  const insertItem = db.prepare(`
    INSERT INTO transfer_items (id, account_set_id, type_code, summary, from_code, from_name, to_code, to_name, transfer_type, ratio, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `)

  for (const [typeCode, group] of typeGroups) {
    // First pass: collect valid items for this type
    const validItems: { summary: string; fromCode: string; toCode: string; ratio: number; sortOrder: number }[] = []
    for (let i = 0; i < group.rows.length; i++) {
      const row = group.rows[i]
      const summary = (row[4] || '').trim()
      // ACD jzlx.txt format: col5 = to_code (转入科目), col6 = from_code (转出科目)
      const rawCol5 = (row[5] || '').trim()
      const rawCol6 = (row[6] || '').trim()
      const fromCode = rawCol6  // col6 is the source (转出) account
      const toCode = rawCol5    // col5 is the target (转入) account
      const ratioStr = (row[7] || '1').trim()
      const ratio = parseFloat(ratioStr) || 1

      if (!fromCode && !toCode) continue

      validItems.push({ summary: summary || group.name, fromCode, toCode, ratio, sortOrder: validItems.length })
    }

    // Skip types with no valid items
    if (validItems.length === 0) {
      console.log(`[ACD] 结转类型 ${typeCode}(${group.name}) 没有有效分录，跳过`)
      continue
    }

    // Insert type only if it has valid items
    insertType.run(uuidv4(), accountSetId, typeCode, group.name, group.voucherType || '结转')

    for (const item of validItems) {
      insertItem.run(
        uuidv4(),
        accountSetId,
        typeCode,
        item.summary,
        item.fromCode || null,
        accountNameMap.get(item.fromCode) || item.fromCode || null,
        item.toCode || null,
        accountNameMap.get(item.toCode) || item.toCode || null,
        item.ratio >= 1 ? 'all' : 'partial',
        item.ratio * 100,
        item.sortOrder,
      )
      itemCount++
    }
  }

  stats.transferTypes.items = itemCount
}

function importAcdUsers(accountSetId: string, tables: ParsedTables, stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  const acdUsers = tables.users

  if (acdUsers.length === 0) {
    console.log('[ACD] b_user.txt 无数据，跳过用户导入')
    return
  }

  const adminRoleId = (db.prepare("SELECT id FROM roles WHERE code = 'admin' LIMIT 1").get() as any)?.id
  const accountantRoleId = (db.prepare("SELECT id FROM roles WHERE code = 'accountant' LIMIT 1").get() as any)?.id
  const auditorRoleId = (db.prepare("SELECT id FROM roles WHERE code = 'auditor' LIMIT 1").get() as any)?.id

  // Get existing usernames for this account set (admin already created by service layer)
  const existingUsers = new Set(
    (db.prepare('SELECT username FROM users WHERE account_set_id = ?').all(accountSetId) as any[])
      .map(u => u.username.toLowerCase())
  )

  let imported = 0
  let skipped = 0

  for (const user of acdUsers) {
    // Skip if username already exists (e.g. admin)
    if (existingUsers.has(user.username.toLowerCase())) {
      console.log(`[ACD] 用户 ${user.username} 已存在，跳过`)
      skipped++
      continue
    }

    const userId = uuidv4()

    // Determine role based on ACD user
    let roleId: string | null = null
    let nickname = user.fullName || user.username

    if (user.username.toUpperCase() === 'MANAGER') {
      // MANAGER is the super admin from ACD
      roleId = adminRoleId
      nickname = user.fullName || '系统管理员'
    } else if (user.username === '001' || nickname.includes('记账')) {
      roleId = accountantRoleId
    } else if (user.username === '002' || nickname.includes('审核')) {
      roleId = auditorRoleId
    }

    // ACD passwords are stored in a proprietary format, use default password admin123
    const hashedPassword = bcrypt.hashSync('admin123', 10)

    if (!dryRun) {
      db.prepare(`
        INSERT INTO users (id, account_set_id, username, password, nickname, role_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
      `).run(userId, accountSetId, user.username, hashedPassword, nickname, roleId)
    }

    existingUsers.add(user.username.toLowerCase())
    imported++
    console.log(`[ACD] 导入用户: ${user.username} (${nickname}), role: ${roleId ? 'assigned' : 'none'}`)
  }

  stats.warnings.push(`ACD用户: 导入${imported}个, 跳过${skipped}个(已存在)`)
}

function importVouchers(accountSetId: string, tables: ParsedTables, stats: ImportStats, dryRun: boolean) {
  const db = getDb()
  const entries = tables.voucherEntries
  const headers = tables.voucherHeaders

  if (entries.length === 0) {
    stats.warnings.push('pz.txt 没有可导入数据（该ACD账套无凭证）')
    return
  }

  stats.importedTables.push('pz.txt')
  if (headers.length > 0) {
    stats.importedTables.push('pzdj.txt')
  }

  // Build account code -> {id, name} map
  const accounts = db
    .prepare('SELECT id, code, name FROM accounts WHERE account_set_id = ?')
    .all(accountSetId) as Array<{ id: string; code: string; name: string }>
  const accountMap = new Map(accounts.map(a => [a.code.trim(), a]))

  // Build voucher type code -> id map
  const voucherTypes = db
    .prepare('SELECT id, code FROM voucher_types WHERE account_set_id = ?')
    .all(accountSetId) as Array<{ id: string; code: string }>
  const voucherTypeMap = new Map(voucherTypes.map(vt => [vt.code.trim(), vt.id]))

  // Group entries by key: nf + yf + pzlx + pzbh
  const voucherGroups = new Map<string, AcdRow[]>()
  for (const row of entries) {
    const nf = (row[0] || '').trim()
    const yf = (row[1] || '').trim()
    const pzlx = (row[2] || '').trim()
    const pzbh = (row[3] || '').trim()
    const key = `${nf}|${yf}|${pzlx}|${pzbh}`
    if (!voucherGroups.has(key)) {
      voucherGroups.set(key, [])
    }
    voucherGroups.get(key)!.push(row)
  }

  // Build header map for additional info (maker, auditor, etc.)
  const headerMap = new Map<string, AcdRow>()
  for (const row of headers) {
    const nf = (row[0] || '').trim()
    const yf = (row[1] || '').trim()
    const pzlx = (row[2] || '').trim()
    const pzbh = (row[3] || '').trim()
    const key = `${nf}|${yf}|${pzlx}|${pzbh}`
    headerMap.set(key, row)
  }

  stats.vouchers.vouchers = voucherGroups.size

  if (dryRun) {
    stats.vouchers.entries = entries.length
    return
  }

  // Get fiscal year from account set
  const accountSet = db.prepare('SELECT fiscal_year FROM account_sets WHERE id = ?').get(accountSetId) as any
  const fiscalYear = accountSet?.fiscal_year || new Date().getFullYear()

  const insertVoucher = db.prepare(`
    INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period, status, total_amount, maker_name, auditor_name, remark, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, datetime('now'), datetime('now'))
  `)

  const insertEntry = db.prepare(`
    INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)

  let entryCount = 0
  let voucherNoCounter = 1

  for (const [key, groupEntries] of voucherGroups) {
    const [nf, yf, pzlx] = key.split('|')
    const year = parseInt(nf) || fiscalYear
    const period = parseInt(yf) || 1
    const voucherTypeId = voucherTypeMap.get(pzlx) || null
    const voucherDate = `${year}-${String(period).padStart(2, '0')}-${new Date(year, period, 0).getDate().toString().padStart(2, '0')}`
    const voucherNo = String(voucherNoCounter++).padStart(4, '0')

    // Get header info
    const headerRow = headerMap.get(key)
    const makerName = headerRow ? (headerRow[6] || '').trim() : ''
    const auditorName = headerRow ? (headerRow[7] || '').trim() : ''

    // Calculate total
    let totalAmount = 0

    const voucherId = uuidv4()
    const preparedEntries: Array<{
      seq: number
      accountId: string | null
      accountCode: string
      accountName: string
      direction: 'debit' | 'credit'
      amount: number
      summary: string
    }> = []

    for (let i = 0; i < groupEntries.length; i++) {
      const row = groupEntries[i]
      const kmbm = (row[5] || '').trim()
      const zy = (row[6] || '').trim()
      const jf = parseFloat((row[7] || '0').replace(/,/g, '')) || 0
      const df = parseFloat((row[8] || '0').replace(/,/g, '')) || 0

      const account = accountMap.get(kmbm)
      const direction: 'debit' | 'credit' = jf > 0 ? 'debit' : 'credit'
      const amount = jf > 0 ? jf : df

      if (amount <= 0) continue

      preparedEntries.push({
        seq: i + 1,
        accountId: account?.id || null,
        accountCode: kmbm,
        accountName: account?.name || kmbm,
        direction,
        amount,
        summary: zy,
      })

      if (direction === 'debit') totalAmount += amount
    }

    if (preparedEntries.length === 0) continue

    insertVoucher.run(
      voucherId,
      accountSetId,
      voucherNo,
      voucherTypeId,
      voucherDate,
      year,
      period,
      totalAmount,
      makerName || null,
      auditorName || null,
      `ACD导入凭证`,
    )

    for (const entry of preparedEntries) {
      insertEntry.run(
        uuidv4(),
        accountSetId,
        voucherId,
        entry.seq,
        entry.accountId,
        entry.accountCode,
        entry.accountName,
        entry.direction,
        entry.amount,
        entry.summary || null,
      )
      entryCount++
    }
  }

  stats.vouchers.entries = entryCount
}

function runImport(options: Options): ImportStats {
  const db = getDb()
  const accountSet = resolveCurrentAccountSet()
  const tables = options.acdBuffer
    ? parseAcdTables(options.acdBuffer)
    : parseAcdTables(options.acdFilePath!)
  const stats = buildStats(accountSet.id, accountSet.name)

  const execute = () => {
    importSystemParams(accountSet.id, tables.xt, stats, options.dryRun)
    importVoucherTypes(accountSet.id, tables.voucherTypes, stats, options.dryRun)
    importAccounts(accountSet.id, tables.accounts, stats, options.dryRun)
    importInitBalances(accountSet.id, tables.initBalances, stats, options.dryRun)
    importTransferTypes(accountSet.id, tables.transferTypes, tables.accounts, stats, options.dryRun)
    importVouchers(accountSet.id, tables, stats, options.dryRun)
    importReportTemplates(accountSet.id, tables, stats, options.dryRun)
    importAcdUsers(accountSet.id, tables, stats, options.dryRun)
  }

  if (options.dryRun) {
    execute()
  } else {
    db.transaction(execute)()
  }

  return stats
}

// Export for service layer usage — full import (includes vouchers & init balances)
export function importAcdToAccountSet(accountSetId: string, acdBuffer: Buffer): ImportStats {
  const db = getDb()
  const accountSet = db.prepare('SELECT * FROM account_sets WHERE id = ?').get(accountSetId) as any
  if (!accountSet) {
    throw new Error('账套不存在: ' + accountSetId)
  }

  const tables = parseAcdTables(acdBuffer)
  const stats = buildStats(accountSet.id, accountSet.name)

  const execute = () => {
    importSystemParams(accountSet.id, tables.xt, stats, false)
    importVoucherTypes(accountSet.id, tables.voucherTypes, stats, false)
    importAccounts(accountSet.id, tables.accounts, stats, false)
    importInitBalances(accountSet.id, tables.initBalances, stats, false)
    importTransferTypes(accountSet.id, tables.transferTypes, tables.accounts, stats, false)
    importVouchers(accountSet.id, tables, stats, false)
    importReportTemplates(accountSet.id, tables, stats, false)
    importAcdUsers(accountSet.id, tables, stats, false)
  }

  db.transaction(execute)()

  return stats
}

// Template import — only presets (accounts, transfer types, voucher types, reports), no vouchers/init balances
export function importAcdTemplateToAccountSet(accountSetId: string, acdBuffer: Buffer): ImportStats {
  const db = getDb()
  const accountSet = db.prepare('SELECT * FROM account_sets WHERE id = ?').get(accountSetId) as any
  if (!accountSet) {
    throw new Error('账套不存在: ' + accountSetId)
  }

  const tables = parseAcdTables(acdBuffer)
  const stats = buildStats(accountSet.id, accountSet.name)

  const execute = () => {
    importSystemParams(accountSet.id, tables.xt, stats, false)
    importVoucherTypes(accountSet.id, tables.voucherTypes, stats, false)
    importAccounts(accountSet.id, tables.accounts, stats, false)
    // Skip initBalances for template import
    importTransferTypes(accountSet.id, tables.transferTypes, tables.accounts, stats, false)
    // Skip vouchers for template import
    // Skip report templates from ACD (VTS parsing is unreliable, use Excel import instead)
    // importReportTemplates(accountSet.id, tables, stats, false)
    // Skip ACD users for template import
  }

  db.transaction(execute)()

  return stats
}

export type { ImportStats, ParsedTables, AcdRow }
export { parseAcdTables, parseAcdFileTables, splitTableRows }

function printStats(stats: ImportStats, dryRun: boolean) {
  console.log(`\n${dryRun ? '[DRY RUN]' : '[IMPORT]'} 当前账套: ${stats.accountSetName} (${stats.accountSetId})`)
  console.log(`已识别表: ${stats.importedTables.join(', ') || '无'}`)
  console.log(`system_params: upsert=${stats.systemParams.upserted}`)
  console.log(
    `voucher_types: insert=${stats.voucherTypes.inserted}, update=${stats.voucherTypes.updated}, skip=${stats.voucherTypes.skipped}`
  )
  console.log(
    `accounts: insert=${stats.accounts.inserted}, update=${stats.accounts.updated}, skip=${stats.accounts.skipped}`
  )
  console.log(
    `init_balances: insert=${stats.initBalances.inserted}, skip=${stats.initBalances.skipped}`
  )
  console.log(
    `transfer_types: types=${stats.transferTypes.types}, items=${stats.transferTypes.items}`
  )
  console.log(
    `vouchers: vouchers=${stats.vouchers.vouchers}, entries=${stats.vouchers.entries}`
  )
  console.log(`report_templates: definitions=${stats.reportTemplates.definitions}, sheets=${stats.reportTemplates.sheets}, cells=${stats.reportTemplates.cells}, formulas=${stats.reportTemplates.formulas}`)

  if (stats.warnings.length > 0) {
    console.log('\nWarnings:')
    for (const warning of stats.warnings) {
      console.log(`- ${warning}`)
    }
  }
}

function parseArgs(): Options {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const positional = args.filter(arg => arg !== '--dry-run')

  if (positional.length === 0) {
    console.log('用法: node --import tsx/esm src/scripts/importAcdToCurrentAccountSet.ts <acd文件路径> [--dry-run]')
    process.exit(1)
  }

  return {
    acdFilePath: positional[0],
    dryRun,
  }
}

function main() {
  const options = parseArgs()
  const stats = runImport({ acdFilePath: options.acdFilePath, dryRun: options.dryRun })
  printStats(stats, options.dryRun)
}

// Only run main when executed directly (not when imported)
if (process.argv[1]?.endsWith('importAcdToCurrentAccountSet.ts') || process.argv[1]?.endsWith('importAcdToCurrentAccountSet')) {
  main()
}
