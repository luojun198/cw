import { getBalance, getPeriodSum, getPeriodRangeSum, getPeriodRangeSumExcludeTransfer, type BalanceQueryDb } from './reportBalance.ts'

type ExecuteContext = {
  db: BalanceQueryDb
  accountSetId: string
  year: number
  period: number
  unitName?: string
}

type TemplateCellInput = {
  id: string
  report_sheet_id: string
  row_index: number
  col_index: number
  cell_type: string
  text_value: string | null
  formula_text: string | null
  format_text: string | null
  style_key: string | null
  side: string | null
}

type ExecutedTemplateCell = TemplateCellInput & {
  address: string
  raw_value: string
  display_value: string
  numeric_value: number | null
  status: 'ok' | 'error'
  error: string | null
}

type TemplateSheetInput = {
  id: string
  report_definition_id: string
  sheet_key: string
  sheet_name: string
  sheet_index: number
  cells: TemplateCellInput[]
}

export type ExecutedTemplateSheet = TemplateSheetInput & {
  cells: ExecutedTemplateCell[]
}

function getCellAddress(rowIndex: number, colIndex: number) {
  let col = colIndex
  let name = ''
  do {
    name = String.fromCharCode(65 + (col % 26)) + name
    col = Math.floor(col / 26) - 1
  } while (col >= 0)
  return `${name}${rowIndex + 1}`
}

function isNumericValue(value: string) {
  return /^-?\d+(\.\d+)?$/.test(value.trim())
}

function formatNumber(value: number, _formatText: string | null) {
  if (!Number.isFinite(value)) return ''
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function splitArguments(value: string) {
  const result: string[] = []
  let current = ''
  let depth = 0
  for (const char of value) {
    if (char === ',' && depth === 0) {
      result.push(current.trim())
      current = ''
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    current += char
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function getAccountDirection(db: BalanceQueryDb, accountSetId: string, accountCode: string): 'debit' | 'credit' {
  const exact = db
    .prepare(
      `
      SELECT direction
      FROM accounts
      WHERE account_set_id = ? AND code = ?
      LIMIT 1
      `
    )
    .get(accountSetId, accountCode) as { direction?: string } | undefined

  const normalizeDirection = (value: unknown): 'debit' | 'credit' =>
    String(value || '').toLowerCase() === 'credit' ? 'credit' : 'debit'

  if (exact?.direction) {
    return normalizeDirection(exact.direction)
  }

  const grouped = db
    .prepare(
      `
      SELECT direction, COUNT(*) as count
      FROM accounts
      WHERE account_set_id = ? AND code LIKE ?
      GROUP BY direction
      ORDER BY count DESC
      LIMIT 1
      `
    )
    .get(accountSetId, `${accountCode}%`) as { direction?: string } | undefined

  return normalizeDirection(grouped?.direction)
}

function getSideBalance(
  context: ExecuteContext,
  accountCode: string,
  period: number,
  side: 'debit' | 'credit'
) {
  const direction = getAccountDirection(context.db, context.accountSetId, accountCode)
  const naturalBalance = getBalance(
    context.db,
    context.accountSetId,
    accountCode,
    context.year,
    Number(period)
  )

  if (side === 'debit') {
    return direction === 'debit'
      ? Math.max(naturalBalance, 0)
      : Math.max(-naturalBalance, 0)
  }

  return direction === 'credit'
    ? Math.max(naturalBalance, 0)
    : Math.max(-naturalBalance, 0)
}

function applyFormulaFunctions(expression: string, context: ExecuteContext) {
  return expression.replace(/(^|[^\w])@?([a-z_][\w]*)\(([^()]*)\)/gi, (match, prefix: string, rawName: string, rawArgs: string) => {
    const name = rawName.toLowerCase()
    const args = splitArguments(rawArgs)
    const accountCode = String(args[0] || '').trim()
    const periodArg = args[1] === undefined || args[1] === '' ? context.period : Number(args[1])

    if (!accountCode) {
      throw new Error(`函数 @${name} 缺少科目编码参数`)
    }

    let result: number
    switch (name) {
      case 'ye': {
        result = getBalance(context.db, context.accountSetId, accountCode, context.year, Number(periodArg))
        break
      }
      case 'nc': {
        result = getBalance(context.db, context.accountSetId, accountCode, context.year, 0)
        break
      }
      case 'df': {
        const sum = getPeriodSum(context.db, context.accountSetId, accountCode, context.year, Number(periodArg))
        result = sum.debit
        break
      }
      case 'jf': {
        const sum = getPeriodSum(context.db, context.accountSetId, accountCode, context.year, Number(periodArg))
        result = sum.credit
        break
      }
      case 'mjy': {
        result = getSideBalance(context, accountCode, Number(periodArg), 'debit')
        break
      }
      case 'mdy': {
        result = getSideBalance(context, accountCode, Number(periodArg), 'credit')
        break
      }
      case 'mnj': {
        result = getSideBalance(context, accountCode, 0, 'debit')
        break
      }
      case 'mnd': {
        result = getSideBalance(context, accountCode, 0, 'credit')
        break
      }
      case 'jqy': {
        // @jqy(科目编码, 起始期间, 截止期间)
        // 99 表示当前期（context.period），数字表示具体月份
        // 排除结转凭证，取结转前净发生额，按科目自然余额方向计算
        const fromPeriodRaw = args[1] === undefined || args[1] === '' ? '99' : String(args[1]).trim()
        const toPeriodRaw = args[2] === undefined || args[2] === '' ? '99' : String(args[2]).trim()
        const fromPeriod = fromPeriodRaw === '99' ? context.period : Number(fromPeriodRaw)
        const toPeriod = toPeriodRaw === '99' ? context.period : Number(toPeriodRaw)
        const rangeSum = getPeriodRangeSumExcludeTransfer(context.db, context.accountSetId, accountCode, context.year, fromPeriod, toPeriod)
        const direction = getAccountDirection(context.db, context.accountSetId, accountCode)
        result = direction === 'debit'
          ? rangeSum.debit - rangeSum.credit
          : rangeSum.credit - rangeSum.debit
        break
      }
      default:
        throw new Error(`暂不支持公式函数 @${name}`)
    }

    return `${prefix}${result}`
  })
}

function replaceCellReferences(expression: string, cellValues: Map<string, number>) {
  return expression.replace(/\$?([A-Z]+)\$?(\d+)/gi, (_, col: string, row: string) => {
    const ref = `${col.toUpperCase()}${row}`
    const value = cellValues.get(ref)
    if (value === undefined) {
      return '0'
    }
    return String(value)
  })
}

function safeEvaluateExpression(expression: string) {
  const sanitized = expression.replace(/\s+/g, '')
  if (!sanitized) return 0
  if (!/^[0-9+\-*/().]+$/.test(sanitized)) {
    throw new Error('公式包含非法字符')
  }

  const tokens = sanitized.match(/\d*\.\d+|\d+|[()+\-*/]/g) || []
  if (tokens.join('') !== sanitized) {
    throw new Error('公式无法解析')
  }

  let index = 0

  function parseExpression(): number {
    let value = parseTerm()
    while (index < tokens.length) {
      const token = tokens[index]
      if (token !== '+' && token !== '-') break
      index += 1
      const right = parseTerm()
      value = token === '+' ? value + right : value - right
    }
    return value
  }

  function parseTerm(): number {
    let value = parseFactor()
    while (index < tokens.length) {
      const token = tokens[index]
      if (token !== '*' && token !== '/') break
      index += 1
      const right = parseFactor()
      if (token === '/' && right === 0) {
        throw new Error('公式除数不能为 0')
      }
      value = token === '*' ? value * right : value / right
    }
    return value
  }

  function parseFactor(): number {
    const token = tokens[index]
    if (token === undefined) {
      throw new Error('公式不完整')
    }
    if (token === '+') {
      index += 1
      return parseFactor()
    }
    if (token === '-') {
      index += 1
      return -parseFactor()
    }
    if (token === '(') {
      index += 1
      const value = parseExpression()
      if (tokens[index] !== ')') {
        throw new Error('公式括号未闭合')
      }
      index += 1
      return value
    }
    if (isNumericValue(token)) {
      index += 1
      return Number(token)
    }
    throw new Error(`无法识别公式片段 ${token}`)
  }

  const result = parseExpression()
  if (index !== tokens.length) {
    throw new Error('公式存在多余内容')
  }
  return result
}

function isFormulaLike(value: string | null) {
  const normalized = String(value || '').trim()
  return normalized.startsWith('=') || normalized.startsWith('@') || normalized.startsWith('＝')
}

function executeFormula(formulaText: string, context: ExecuteContext, cellValues: Map<string, number>) {
  let expression = formulaText.trim()
  if (expression.startsWith('＝')) {
    expression = '=' + expression.slice(1)
  }
  if (expression.startsWith('=')) {
    expression = expression.slice(1)
  }
  expression = applyFormulaFunctions(expression, context)
  expression = replaceCellReferences(expression, cellValues)
  return safeEvaluateExpression(expression)
}

function extractCellRefs(expression: string): string[] {
  const refs: string[] = []
  const re = /\$?([A-Z]+)\$?(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(expression)) !== null) {
    refs.push(`${m[1].toUpperCase()}${m[2]}`)
  }
  return refs
}

function topoSortCells(cells: TemplateCellInput[]): TemplateCellInput[] {
  // 建立 address -> cell 映射
  const addrMap = new Map<string, TemplateCellInput>()
  for (const cell of cells) {
    addrMap.set(getCellAddress(cell.row_index, cell.col_index), cell)
  }

  const visited = new Set<string>()
  const result: TemplateCellInput[] = []

  function visit(cell: TemplateCellInput, stack: Set<string>) {
    const addr = getCellAddress(cell.row_index, cell.col_index)
    if (visited.has(addr)) return
    if (stack.has(addr)) return // 循环引用，跳过
    stack.add(addr)

    const formulaSource = cell.formula_text || cell.text_value || ''
    if (cell.cell_type === 'formula' || isFormulaLike(formulaSource)) {
      for (const ref of extractCellRefs(formulaSource)) {
        const dep = addrMap.get(ref)
        if (dep) visit(dep, stack)
      }
    }

    stack.delete(addr)
    visited.add(addr)
    result.push(cell)
  }

  // 先按行列顺序遍历，保证稳定性
  const sorted = cells.slice().sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index)
  for (const cell of sorted) {
    visit(cell, new Set())
  }
  return result
}

function applyTextPlaceholders(text: string, context: ExecuteContext): string {
  if (!text || !text.includes('%')) return text
  const month = String(context.period).padStart(2, '0')
  const day = '01'
  // 先替换组合形式（%yh%mh%dh 连写，% 被共用），再替换单独形式
  // 每个占位符支持有无尾部 %（如 %U 和 %U% 都能匹配）
  return text
    .replace(/%yh%mh%dh(%|(?=[^a-z]|$))/gi, `${context.year}年${month}月${day}日`)
    .replace(/%yh%mh(%|(?=[^a-z]|$))/gi, `${context.year}年${month}月`)
    .replace(/%yh(%|(?=[^a-z]|$))/gi, `${context.year}年`)
    .replace(/%mh(%|(?=[^a-z]|$))/gi, `${month}月`)
    .replace(/%dh(%|(?=[^a-z]|$))/gi, `${day}日`)
    .replace(/%U(%|(?=[^a-z]|$))/gi, context.unitName || '')
}

function executeCell(
  cell: TemplateCellInput,
  context: ExecuteContext,
  cellValues: Map<string, number>
) {
  const address = getCellAddress(cell.row_index, cell.col_index)
  const formulaSource = cell.formula_text || cell.text_value || ''
  const shouldTreatAsFormula = cell.cell_type === 'formula' || isFormulaLike(formulaSource)
  const rawValue = shouldTreatAsFormula ? formulaSource : cell.text_value || ''

  try {
    if (shouldTreatAsFormula && formulaSource) {
      const numericValue = executeFormula(formulaSource, context, cellValues)
      cellValues.set(address, numericValue)
      return {
        ...cell,
        address,
        raw_value: rawValue,
        display_value: formatNumber(numericValue, cell.format_text),
        numeric_value: numericValue,
        status: 'ok' as const,
        error: null,
      }
    }

    const textValue = cell.text_value || ''
    if (cell.cell_type === 'number' && isNumericValue(textValue)) {
      const numericValue = Number(textValue)
      cellValues.set(address, numericValue)
      return {
        ...cell,
        address,
        raw_value: rawValue,
        display_value: formatNumber(numericValue, cell.format_text),
        numeric_value: numericValue,
        status: 'ok' as const,
        error: null,
      }
    }

    return {
      ...cell,
      address,
      raw_value: rawValue,
      display_value: applyTextPlaceholders(textValue, context),
      numeric_value: null,
      status: 'ok' as const,
      error: null,
    }
  } catch (error) {
    return {
      ...cell,
      address,
      raw_value: rawValue,
      display_value: '#ERROR',
      numeric_value: null,
      status: 'error' as const,
      error: error instanceof Error ? error.message : '公式执行失败',
    }
  }
}

export function executeTemplateSheets(sheets: TemplateSheetInput[], context: ExecuteContext): ExecutedTemplateSheet[] {
  return sheets
    .slice()
    .sort((a, b) => a.sheet_index - b.sheet_index)
    .map(sheet => {
      const cellValues = new Map<string, number>()
      // 拓扑排序：被依赖的单元格先执行，解决 =B6+B8 引用下方单元格的问题
      const orderedCells = topoSortCells(sheet.cells)
      // 按拓扑顺序执行，结果 Map 保持原始行列顺序输出
      const resultMap = new Map<string, ReturnType<typeof executeCell>>()
      for (const cell of orderedCells) {
        const executed = executeCell(cell, context, cellValues)
        resultMap.set(executed.address, executed)
      }
      // 按原始行列顺序输出
      const executedCells = sheet.cells
        .slice()
        .sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index)
        .map(cell => resultMap.get(getCellAddress(cell.row_index, cell.col_index))!)

      return {
        ...sheet,
        cells: executedCells,
      }
    })
}
