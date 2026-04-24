import { Router } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, AuthRequest } from '../middleware/index.ts'
import { getDb } from '../db/index.ts'
import { executeTemplateSheets } from '../services/reportTemplateExecutor.ts'
import {
  createReportTask,
  getReportTask,
  updateReportTask,
  runWithProgress,
} from '../services/reportTaskManager.ts'

const router = Router()
router.use(authMiddleware)

// Excel 模板上传配置
const ALLOWED_EXCEL_MIMES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXCEL_MIMES.includes(file.mimetype)) {
      return cb(new Error('仅支持 Excel 文件 (.xls, .xlsx)'))
    }
    cb(null, true)
  },
})

// 报表生成进度查询接口
router.get('/tasks/:taskId', (req: AuthRequest, res) => {
  const { taskId } = req.params
  const task = getReportTask(taskId)
  if (!task) {
    return res.status(404).json({ code: 404, message: '任务不存在或已过期' })
  }
  res.json({ code: 0, data: task })
})

type ReportDefinitionRow = {
  id: string
  code: string
  name: string
  source: string
  source_file: string | null
  sort_order: number
  is_enabled: number
}

type ReportSheetRow = {
  id: string
  report_definition_id: string
  sheet_key: string
  sheet_name: string
  sheet_index: number
  default_col_width: number | null
  default_row_height: number | null
  col_widths: string | null
  row_heights: string | null
}

type ReportCellRow = {
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
  col_width: number | null
  row_height: number | null
  merge_info: string | null
}

type UpdateReportCellPayload = {
  id?: string
  row_index?: number
  col_index?: number
  text_value?: string | null
  formula_text?: string | null
  format_text?: string | null
  style_key?: string | null
  cell_type?: string
  col_width?: number | null
  row_height?: number | null
  merge_info?: string | null
}

const ALLOWED_CELL_TYPES = new Set(['text', 'formula', 'number', 'empty', 'merged'])

function normalizeMergeInfo(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return null
  }

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('merge_info 必须是对象，格式为 {"colSpan": number, "rowSpan": number}')
  }

  const colSpanRaw = (parsed as { colSpan?: unknown }).colSpan
  const rowSpanRaw = (parsed as { rowSpan?: unknown }).rowSpan

  const colSpan = colSpanRaw == null ? 1 : Number(colSpanRaw)
  const rowSpan = rowSpanRaw == null ? 1 : Number(rowSpanRaw)

  if (!Number.isInteger(colSpan) || colSpan < 1) {
    throw new Error('merge_info.colSpan 必须是大于等于 1 的整数')
  }
  if (!Number.isInteger(rowSpan) || rowSpan < 1) {
    throw new Error('merge_info.rowSpan 必须是大于等于 1 的整数')
  }

  // No actual merge when both are 1
  if (colSpan === 1 && rowSpan === 1) {
    return null
  }

  return JSON.stringify({ colSpan, rowSpan })
}

function resolveAccountSetId(accountSetId: string, db: ReturnType<typeof getDb>) {
  return (
    accountSetId ||
    ((
      db.prepare('SELECT id FROM account_sets ORDER BY created_at ASC LIMIT 1').get() as
        | { id: string }
        | undefined
    )?.id ??
      '')
  )
}

function getDefinitionByCode(
  db: ReturnType<typeof getDb>,
  accountSetId: string,
  reportCode: string
) {
  return db
    .prepare(
      `
      SELECT id, code, name, source, source_file, sort_order, is_enabled
      FROM report_definitions
      WHERE account_set_id = ? AND code = ?
      LIMIT 1
      `
    )
    .get(accountSetId, reportCode) as ReportDefinitionRow | undefined
}

function getSheetsByDefinitionId(db: ReturnType<typeof getDb>, reportDefinitionId: string) {
  return db
    .prepare(
      `
      SELECT id, report_definition_id, sheet_key, sheet_name, sheet_index, default_col_width, default_row_height, col_widths, row_heights
      FROM report_sheets
      WHERE report_definition_id = ?
      ORDER BY sheet_index ASC, sheet_key ASC
      `
    )
    .all(reportDefinitionId) as ReportSheetRow[]
}

function getCellsBySheetIds(db: ReturnType<typeof getDb>, sheetIds: string[]) {
  return sheetIds.length
    ? (db
        .prepare(
          `
          SELECT id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, format_text, style_key, side, col_width, row_height, merge_info
          FROM report_cells
          WHERE report_sheet_id IN (${sheetIds.map(() => '?').join(', ')})
          ORDER BY report_sheet_id ASC, row_index ASC, col_index ASC
          `
        )
        .all(...sheetIds) as ReportCellRow[])
    : []
}

router.get('/templates', (req: AuthRequest, res) => {
  const accountSetId = req.accountSetId || ''
  const db = getDb()

  const resolvedAccountSetId =
    accountSetId ||
    ((
      db.prepare('SELECT id FROM account_sets ORDER BY created_at ASC LIMIT 1').get() as
        | { id: string }
        | undefined
    )?.id ??
      '')

  const definitions = db
    .prepare(
      `
      SELECT id, code, name, source, source_file, sort_order, is_enabled
      FROM report_definitions
      WHERE account_set_id = ?
      ORDER BY sort_order ASC, code ASC
      `
    )
    .all(resolvedAccountSetId) as ReportDefinitionRow[]

  const formulaFunctions = db
    .prepare(
      `
      SELECT function_name, handler_key, description
      FROM report_formula_functions
      WHERE account_set_id = ?
      ORDER BY function_name ASC
      `
    )
    .all(resolvedAccountSetId) as Array<{
    function_name: string
    handler_key: string
    description: string | null
  }>

  res.json({
    code: 0,
    data: definitions.map(definition => ({
      ...definition,
      is_enabled: Boolean(definition.is_enabled),
    })),
    summary: {
      total: definitions.length,
      formulaFunctionCount: formulaFunctions.length,
      formulaFunctions,
    },
  })
})

router.get('/templates/:code', (req: AuthRequest, res) => {
  const accountSetId = req.accountSetId || ''
  const reportCode = String(req.params.code || '').trim()
  const db = getDb()

  if (!reportCode) {
    return res.status(400).json({ code: 400, message: '报表编码不能为空' })
  }

  const resolvedAccountSetId =
    accountSetId ||
    ((
      db.prepare('SELECT id FROM account_sets ORDER BY created_at ASC LIMIT 1').get() as
        | { id: string }
        | undefined
    )?.id ??
      '')

  const definition = db
    .prepare(
      `
      SELECT id, code, name, source, source_file, sort_order, is_enabled
      FROM report_definitions
      WHERE account_set_id = ? AND code = ?
      LIMIT 1
      `
    )
    .get(resolvedAccountSetId, reportCode) as ReportDefinitionRow | undefined

  if (!definition) {
    return res.status(404).json({ code: 404, message: '未找到对应报表模板' })
  }

  const sheets = db
    .prepare(
      `
      SELECT id, report_definition_id, sheet_key, sheet_name, sheet_index, default_col_width, default_row_height, col_widths, row_heights
      FROM report_sheets
      WHERE report_definition_id = ?
      ORDER BY sheet_index ASC, sheet_key ASC
      `
    )
    .all(definition.id) as ReportSheetRow[]

  const sheetIds = sheets.map(sheet => sheet.id)
  const cells = sheetIds.length
    ? (db
        .prepare(
          `
          SELECT id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, format_text, style_key, side, col_width, row_height, merge_info
          FROM report_cells
          WHERE report_sheet_id IN (${sheetIds.map(() => '?').join(', ')})
          ORDER BY report_sheet_id ASC, row_index ASC, col_index ASC
          `
        )
        .all(...sheetIds) as ReportCellRow[])
    : []

  const source = db
    .prepare(
      `
      SELECT source_file, source_type, content_encoding, parse_version, created_at
      FROM report_template_sources
      WHERE report_definition_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
    .get(definition.id) as
    | {
        source_file: string
        source_type: string
        content_encoding: string | null
        parse_version: string | null
        created_at: string
      }
    | undefined

  const formulaFunctions = db
    .prepare(
      `
      SELECT function_name, handler_key, description
      FROM report_formula_functions
      WHERE account_set_id = ?
      ORDER BY function_name ASC
      `
    )
    .all(resolvedAccountSetId) as Array<{
    function_name: string
    handler_key: string
    description: string | null
  }>

  const cellsBySheetId = new Map<string, ReportCellRow[]>()
  for (const cell of cells) {
    const bucket = cellsBySheetId.get(cell.report_sheet_id)
    if (bucket) {
      bucket.push(cell)
    } else {
      cellsBySheetId.set(cell.report_sheet_id, [cell])
    }
  }

  res.json({
    code: 0,
    data: {
      definition: {
        ...definition,
        is_enabled: Boolean(definition.is_enabled),
      },
      source: source || null,
      formulaFunctions,
      sheets: sheets.map(sheet => {
        const sheetCells = cellsBySheetId.get(sheet.id) || []
        const maxRowIndex = sheetCells.reduce((max, cell) => Math.max(max, cell.row_index), -1)
        const maxColIndex = sheetCells.reduce((max, cell) => Math.max(max, cell.col_index), -1)
        return {
          ...sheet,
          metrics: {
            cellCount: sheetCells.length,
            rowCount: maxRowIndex + 1,
            colCount: maxColIndex + 1,
          },
          cells: sheetCells,
        }
      }),
    },
  })
})

router.put('/templates/:code/cells', (req: AuthRequest, res) => {
  const reportCode = String(req.params.code || '').trim()
  const { sheetId, cells } = (req.body || {}) as {
    sheetId?: string
    cells?: UpdateReportCellPayload[]
  }
  const db = getDb()
  const resolvedAccountSetId = resolveAccountSetId(req.accountSetId || '', db)

  if (!reportCode) {
    return res.status(400).json({ code: 400, message: '报表编码不能为空' })
  }
  if (!sheetId) {
    return res.status(400).json({ code: 400, message: 'sheetId 不能为空' })
  }
  if (!Array.isArray(cells) || cells.length === 0) {
    return res.status(400).json({ code: 400, message: 'cells 不能为空' })
  }

  const definition = getDefinitionByCode(db, resolvedAccountSetId, reportCode)
  if (!definition) {
    return res.status(404).json({ code: 404, message: '未找到对应报表模板' })
  }

  const sheet = db
    .prepare(
      `
      SELECT id, report_definition_id, sheet_key, sheet_name, sheet_index
      FROM report_sheets
      WHERE id = ? AND report_definition_id = ?
      LIMIT 1
      `
    )
    .get(sheetId, definition.id) as ReportSheetRow | undefined

  if (!sheet) {
    return res.status(404).json({ code: 404, message: '未找到对应工作表' })
  }

  const existingCells = db
    .prepare(
      `
      SELECT id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, format_text, style_key, side, col_width, row_height, merge_info
      FROM report_cells
      WHERE report_sheet_id = ?
      `
    )
    .all(sheetId) as ReportCellRow[]

  const existingById = new Map(existingCells.map(cell => [cell.id, cell]))
  const existingByPosition = new Map(
    existingCells.map(cell => [`${cell.row_index}:${cell.col_index}`, cell])
  )

  const updateStmt = db.prepare(
    `
    UPDATE report_cells
    SET cell_type = ?, text_value = ?, formula_text = ?, format_text = ?, style_key = ?, col_width = ?, row_height = ?, merge_info = ?, updated_at = datetime('now')
    WHERE id = ?
    `
  )

  const insertStmt = db.prepare(
    `
    INSERT INTO report_cells (
      id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, format_text, style_key, side, col_width, row_height, merge_info, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, datetime('now'), datetime('now'))
    `
  )

  const applyChanges = db.transaction((payloads: UpdateReportCellPayload[]) => {
    for (const payload of payloads) {
      const rowIndex = Number(payload.row_index)
      const colIndex = Number(payload.col_index)
      const targetById = payload.id ? existingById.get(payload.id) : undefined
      const targetByPos =
        Number.isInteger(rowIndex) && Number.isInteger(colIndex)
          ? existingByPosition.get(`${rowIndex}:${colIndex}`)
          : undefined
      const target = targetById || targetByPos

      const nextCellType = payload.cell_type || target?.cell_type || 'text'
      if (!ALLOWED_CELL_TYPES.has(nextCellType)) {
        throw new Error(`不支持的单元格类型: ${nextCellType}`)
      }

      const textValue =
        payload.text_value === undefined ? target?.text_value || null : payload.text_value
      const formulaText =
        payload.formula_text === undefined ? target?.formula_text || null : payload.formula_text
      const formatText =
        payload.format_text === undefined ? target?.format_text || null : payload.format_text
      const styleKey =
        payload.style_key === undefined ? target?.style_key || null : payload.style_key
      const colWidth =
        payload.col_width === undefined ? target?.col_width || null : payload.col_width
      const rowHeight =
        payload.row_height === undefined ? target?.row_height || null : payload.row_height
      const mergeInfo =
        payload.merge_info === undefined
          ? normalizeMergeInfo(target?.merge_info || null)
          : normalizeMergeInfo(payload.merge_info)

      if (colWidth != null && (!Number.isFinite(colWidth) || colWidth <= 0)) {
        throw new Error('col_width 必须是大于 0 的数字')
      }
      if (rowHeight != null && (!Number.isFinite(rowHeight) || rowHeight <= 0)) {
        throw new Error('row_height 必须是大于 0 的数字')
      }

      if (target) {
        updateStmt.run(nextCellType, textValue, formulaText, formatText, styleKey, colWidth, rowHeight, mergeInfo, target.id)
        continue
      }

      if (
        !Number.isInteger(rowIndex) ||
        rowIndex < 0 ||
        !Number.isInteger(colIndex) ||
        colIndex < 0
      ) {
        throw new Error('新增单元格必须提供合法的 row_index 和 col_index')
      }

      insertStmt.run(
        crypto.randomUUID(),
        sheetId,
        rowIndex,
        colIndex,
        nextCellType,
        textValue,
        formulaText,
        formatText,
        colWidth,
        rowHeight,
        mergeInfo
      )
    }
  })

  try {
    applyChanges(cells)
  } catch (error) {
    return res
      .status(400)
      .json({ code: 400, message: error instanceof Error ? error.message : '保存模板失败' })
  }

  res.json({ code: 0, message: '模板单元格保存成功' })
})

router.post('/templates/:code/rowcol', (req: AuthRequest, res) => {
  const reportCode = String(req.params.code || '').trim()
  const body = req.body || {}
  const sheetId = body.sheetId
  const action = body.action
  const index = Number(body.index)
  const db = getDb()
  const resolvedAccountSetId = resolveAccountSetId(req.accountSetId || '', db)

  console.log(
    '[rowcol] body:',
    JSON.stringify(body),
    'parsed index:',
    index,
    'isInteger:',
    Number.isInteger(index)
  )

  if (!reportCode) {
    return res.status(400).json({ code: 400, message: '报表编码不能为空' })
  }
  if (!sheetId) {
    return res.status(400).json({ code: 400, message: 'sheetId 不能为空' })
  }
  if (!['insert_row', 'delete_row', 'insert_col', 'delete_col'].includes(action || '')) {
    return res
      .status(400)
      .json({ code: 400, message: 'action 必须为 insert_row/delete_row/insert_col/delete_col' })
  }
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ code: 400, message: `index 必须为非负整数, 收到: ${index}` })
  }
  const definition = getDefinitionByCode(db, resolvedAccountSetId, reportCode)
  if (!definition) {
    return res.status(404).json({ code: 404, message: '未找到对应报表模板' })
  }

  const sheet = db
    .prepare(
      `
      SELECT id, report_definition_id, sheet_key, sheet_name, sheet_index
      FROM report_sheets
      WHERE id = ? AND report_definition_id = ?
      LIMIT 1
      `
    )
    .get(sheetId, definition.id) as ReportSheetRow | undefined

  if (!sheet) {
    return res.status(404).json({ code: 404, message: '未找到对应工作表' })
  }

  const updateRowIndexes = db.prepare(
    `UPDATE report_cells SET row_index = row_index + 1, updated_at = datetime('now') WHERE report_sheet_id = ? AND row_index >= ?`
  )
  const updateColIndexes = db.prepare(
    `UPDATE report_cells SET col_index = col_index + 1, updated_at = datetime('now') WHERE report_sheet_id = ? AND col_index >= ?`
  )
  const deleteCellsAtIndex = db.prepare(
    `DELETE FROM report_cells WHERE report_sheet_id = ? AND row_index = ?`
  )
  const deleteColCellsAtIndex = db.prepare(
    `DELETE FROM report_cells WHERE report_sheet_id = ? AND col_index = ?`
  )
  const decrementRowIndexes = db.prepare(
    `UPDATE report_cells SET row_index = row_index - 1, updated_at = datetime('now') WHERE report_sheet_id = ? AND row_index > ?`
  )
  const decrementColIndexes = db.prepare(
    `UPDATE report_cells SET col_index = col_index - 1, updated_at = datetime('now') WHERE report_sheet_id = ? AND col_index > ?`
  )

  const applyChanges = db.transaction(() => {
    switch (action) {
      case 'insert_row':
        updateRowIndexes.run(sheetId, index)
        break
      case 'delete_row':
        deleteCellsAtIndex.run(sheetId, index)
        decrementRowIndexes.run(sheetId, index)
        break
      case 'insert_col': {
        const cells = db
          .prepare(
            `SELECT id, col_index FROM report_cells WHERE report_sheet_id = ? AND col_index >= ? ORDER BY col_index DESC`
          )
          .all(sheetId, index) as Array<{ id: string; col_index: number }>
        const updateStmt = db.prepare(
          `UPDATE report_cells SET col_index = ?, updated_at = datetime('now') WHERE id = ?`
        )
        for (const cell of cells) {
          updateStmt.run(cell.col_index + 1, cell.id)
        }
        break
      }
      case 'delete_col':
        deleteColCellsAtIndex.run(sheetId, index)
        decrementColIndexes.run(sheetId, index)
        break
    }
  })

  try {
    applyChanges()
  } catch (error) {
    console.error('[rowcol] error:', error)
    return res
      .status(400)
      .json({ code: 400, message: error instanceof Error ? error.message : '操作失败' })
  }

  res.json({ code: 0, message: '操作成功' })
})

router.post('/templates/import', excelUpload.single('file'), async (req: AuthRequest, res) => {
  const db = getDb()
  const resolvedAccountSetId = resolveAccountSetId(req.accountSetId || '', db)
  const reportCode = String(req.body?.reportCode || '').trim()
  const reportName = String(req.body?.reportName || '').trim()

  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请选择要上传的 Excel 文件' })
  }

  const filename = req.file.originalname
  const ext = filename.toLowerCase().split('.').pop()
  if (ext !== 'xls' && ext !== 'xlsx') {
    return res.status(400).json({ code: 400, message: `只支持 .xls 或 .xlsx 格式` })
  }

  if (!reportCode) {
    return res.status(400).json({ code: 400, message: '请提供报表编码 reportCode' })
  }

  try {
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellStyles: true })

    // Derive report name: explicit param > first sheet name > reportCode
    const effectiveName = reportName || workbook.SheetNames[0]?.replace(/\(定义\)$/g, '').trim() || reportCode

    const applyImport = db.transaction(() => {
      // Upsert report definition: create if not exists, update if exists
      let definition = getDefinitionByCode(db, resolvedAccountSetId, reportCode)
      let definitionId: string

      if (definition) {
        definitionId = definition.id
        db.prepare(
          `UPDATE report_definitions SET name = ?, source = 'xls', source_file = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(effectiveName, filename, definitionId)
        db.prepare(
          `DELETE FROM report_cells WHERE report_sheet_id IN (SELECT id FROM report_sheets WHERE report_definition_id = ?)`
        ).run(definitionId)
        db.prepare(`DELETE FROM report_sheets WHERE report_definition_id = ?`).run(definitionId)
        db.prepare(`DELETE FROM report_template_sources WHERE report_definition_id = ?`).run(definitionId)
      } else {
        definitionId = uuidv4()
        // Determine sort_order
        const maxSort = db
          .prepare('SELECT MAX(sort_order) as max_order FROM report_definitions WHERE account_set_id = ?')
          .get(resolvedAccountSetId) as { max_order: number | null }
        const sortOrder = (maxSort?.max_order ?? 0) + 1

        db.prepare(
          `INSERT INTO report_definitions (id, account_set_id, code, name, source, source_file, sort_order, is_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'xls', ?, ?, 1, datetime('now'), datetime('now'))`
        ).run(definitionId, resolvedAccountSetId, reportCode, effectiveName, filename, sortOrder)
      }

      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const sheetId = uuidv4()
        const cleanSheetName = sheetName.replace(/\(定义\)$/g, '').trim()

        const sheet = workbook.Sheets[sheetName]

        // --- Extract column widths and row heights ---
        const colWidths: number[] = []
        const rowHeights: number[] = []
        const sheetCols = (sheet['!cols'] || []) as Array<{ wpx?: number; wch?: number; width?: number; hidden?: number }>
        const sheetRows = (sheet['!rows'] || []) as Array<{ hpx?: number; hpt?: number; hidden?: number }>
        for (const col of sheetCols) {
          if (col.hidden) { colWidths.push(-1); continue }
          // wpx = pixel width, wch = character width (approx 8px per char)
          colWidths.push(col.wpx || Math.round((col.wch || col.width || 8) * 8))
        }
        for (const row of sheetRows) {
          if (row.hidden) { rowHeights.push(-1); continue }
          rowHeights.push(row.hpx || Math.round((row.hpt || 15) * 1.33))
        }

        // Save sheet with col_widths/row_heights
        const colWidthsJson = colWidths.length > 0 ? JSON.stringify(colWidths) : null
        const rowHeightsJson = rowHeights.length > 0 ? JSON.stringify(rowHeights) : null
        db.prepare(
          `INSERT INTO report_sheets (id, report_definition_id, sheet_key, sheet_name, sheet_index, col_widths, row_heights, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).run(sheetId, definitionId, `sheet_${sheetIndex + 1}`, cleanSheetName, sheetIndex, colWidthsJson, rowHeightsJson)

        // --- Build merge map ---
        const mergeMap = new Map<string, { colSpan: number; rowSpan: number }>()
        const explicitMerges = (sheet['!merges'] || []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>

        if (explicitMerges.length > 0) {
          // .xlsx format: use explicit merge info
          for (const m of explicitMerges) {
            const colSpan = m.e.c - m.s.c + 1
            const rowSpan = m.e.r - m.s.r + 1
            mergeMap.set(`${m.s.r}:${m.s.c}`, { colSpan, rowSpan })
          }
        } else {
          // .xls format: infer merges from data distribution patterns
          // Step 1: find actual data boundaries and build cell map
          const cellMap = new Map<string, any>()
          const rowDataCols = new Map<number, Set<number>>() // row -> set of data columns
          let maxDataR = 0, maxDataC = 0
          for (const key of Object.keys(sheet)) {
            if (key.startsWith('!')) continue
            const rawCell = (sheet as any)[key]
            const addr = xlsx.utils.decode_cell(key)
            cellMap.set(`${addr.r}:${addr.c}`, rawCell)
            if (rawCell && rawCell.v != null && String(rawCell.v).trim() !== '') {
              maxDataR = Math.max(maxDataR, addr.r)
              maxDataC = Math.max(maxDataC, addr.c)
              if (!rowDataCols.has(addr.r)) rowDataCols.set(addr.r, new Set())
              rowDataCols.get(addr.r)!.add(addr.c)
            }
          }

          // Step 2: infer merges using heuristic approach
          const visited = new Set<string>()

          // For each row with data, check if we should infer merges
          for (let r = 0; r <= maxDataR; r++) {
            const colsInRow = rowDataCols.get(r)
            if (!colsInRow || colsInRow.size === 0) continue

            const sortedCols = Array.from(colsInRow).sort((a, b) => a - b)
            const firstCol = sortedCols[0]
            const lastCol = sortedCols[sortedCols.length - 1]

            // If this row has fewer data cells than the "full" row below it,
            // the extra cells might be merged
            // Find the "full" width by looking at the most data-rich rows below
            let effectiveMaxC = maxDataC
            for (let checkR = r + 1; checkR <= maxDataR; checkR++) {
              const checkCols = rowDataCols.get(checkR)
              if (checkCols && checkCols.size > 0) {
                effectiveMaxC = Math.max(...Array.from(checkCols))
                break
              }
            }

            // Heuristic 1: If only one data cell and it's at the left edge,
            // infer it merges right to the effective width
            if (sortedCols.length === 1 && firstCol === 0) {
              const endC = effectiveMaxC
              if (endC > firstCol) {
                mergeMap.set(`${r}:${firstCol}`, { colSpan: endC - firstCol + 1, rowSpan: 1 })
                // Mark all cells in range as visited
                for (let cc = firstCol; cc <= endC; cc++) visited.add(`${r}:${cc}`)
                // Auto-center the merged cell
                continue
              }
            }

            // Heuristic 2: If only one data cell and it's at the right edge (lastCol === effectiveMaxC),
            // infer it merges left to column 0
            if (sortedCols.length === 1 && lastCol === effectiveMaxC && firstCol > 0) {
              const startC = 0
              mergeMap.set(`${r}:${startC}`, { colSpan: lastCol - startC + 1, rowSpan: 1 })
              // Mark all cells in range as visited
              for (let cc = startC; cc <= lastCol; cc++) visited.add(`${r}:${cc}`)
              // Auto-center the merged cell
              continue
            }

            // If data cells are "clustered" (dense within a range),
            // no merge needed for single cells
            // Mark all data cells as visited
            for (const c of sortedCols) visited.add(`${r}:${c}`)
          }
        }

        // --- Read with formula support ---
        // Determine effective range: for .xls files, !ref may extend far beyond actual data
        const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1')
        // Find actual data boundary by scanning cells
        let scanMaxR = range.s.r, scanMaxC = range.s.c
        for (const key of Object.keys(sheet)) {
          if (key.startsWith('!')) continue
          const rawCell = (sheet as any)[key]
          if (rawCell && rawCell.t !== 'z' && rawCell.v != null && String(rawCell.v).trim() !== '') {
            const addr = xlsx.utils.decode_cell(key)
            scanMaxR = Math.max(scanMaxR, addr.r)
            scanMaxC = Math.max(scanMaxC, addr.c)
          }
        }
        // Also account for merge regions that may extend beyond data cells
        let mergeMaxR = scanMaxR
        let mergeMaxC = scanMaxC
        for (const [key, m] of mergeMap.entries()) {
          const [sr, sc] = key.split(':').map(Number)
          mergeMaxR = Math.max(mergeMaxR, sr + m.rowSpan - 1)
          mergeMaxC = Math.max(mergeMaxC, sc + m.colSpan - 1)
        }
        const effectiveMaxR = mergeMaxR
        const effectiveMaxC = mergeMaxC

        const insertCell = db.prepare(
          `INSERT INTO report_cells (id, report_sheet_id, row_index, col_index, cell_type, text_value, formula_text, style_key, col_width, row_height, merge_info, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )

        // Collect formula functions
        const formulaFunctions = new Set<string>()

        for (let r = range.s.r; r <= effectiveMaxR; r++) {
          for (let c = range.s.c; c <= effectiveMaxC; c++) {
            const addr = xlsx.utils.encode_cell({ r, c })
            const rawCell = sheet[addr] as any
            if (!rawCell) continue

            // Determine value
            let cellStr = ''
            if (rawCell.f) {
              cellStr = rawCell.f.startsWith('=') || rawCell.f.startsWith('@') ? rawCell.f : '=' + rawCell.f
            } else {
              cellStr = String(rawCell.v ?? rawCell.w ?? '')
            }
            if (!cellStr && rawCell.t !== 'z') continue
            // Skip z-cells (covered by merges) - they are stored as part of the merge origin
            if (rawCell.t === 'z') continue

            const isFormula = cellStr.startsWith('=') || cellStr.startsWith('@')

            // --- Extract alignment ---
            const styleParts: string[] = []
            const alignment = rawCell.s?.alignment
            if (alignment) {
              if (alignment.horizontal === 'center') styleParts.push('align-center')
              else if (alignment.horizontal === 'right') styleParts.push('align-right')
              else if (alignment.horizontal === 'left') styleParts.push('align-left')
              if (alignment.vertical === 'center') styleParts.push('valign-middle')
              else if (alignment.vertical === 'bottom') styleParts.push('valign-bottom')
            }

            // --- Merge info: auto-apply center alignment for horizontally merged cells ---
            const merge = mergeMap.get(`${r}:${c}`)
            if (merge && merge.colSpan > 1) {
              // Merged cells spanning multiple columns should be center-aligned by default
              if (!styleParts.some(p => p.startsWith('align-'))) {
                styleParts.push('align-center')
              }
              if (!styleParts.some(p => p.startsWith('valign-'))) {
                styleParts.push('valign-middle')
              }
            }
            const styleKey = styleParts.length > 0 ? styleParts.join(' ') : null
            const mergeInfo = merge ? JSON.stringify(merge) : null

            insertCell.run(
              uuidv4(),
              sheetId,
              r,
              c,
              isFormula ? 'formula' : 'text',
              isFormula ? null : cellStr,
              isFormula ? cellStr : null,
              styleKey,
              null, // col_width: stored at sheet level
              null, // row_height: stored at sheet level
              mergeInfo
            )

            // Extract @ function names
            if (isFormula && cellStr.startsWith('@')) {
              const matches = cellStr.matchAll(/@([a-zA-Z_][\w]*)/g)
              for (const m of matches) formulaFunctions.add(m[1].toLowerCase())
            }
          }
        }

        // Upsert formula functions
        for (const fn of formulaFunctions) {
          db.prepare(
            `INSERT INTO report_formula_functions (id, account_set_id, function_name, handler_key, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(account_set_id, function_name)
             DO UPDATE SET updated_at = datetime('now')`
          ).run(uuidv4(), resolvedAccountSetId, fn, `xls:${fn}`, 'Excel 报表公式函数（待实现执行器）')
        }
      })
    })

    applyImport()

    const definition = getDefinitionByCode(db, resolvedAccountSetId, reportCode)
    res.json({ code: 0, message: '导入成功', data: { definitionId: definition?.id, name: effectiveName, code: reportCode } })
  } catch (error) {
    console.error('[import] error:', error)
    return res
      .status(400)
      .json({ code: 400, message: error instanceof Error ? error.message : '导入失败' })
  }
})

router.delete('/templates/:code/sheets/:sheetId', (req: AuthRequest, res) => {
  const reportCode = String(req.params.code || '').trim()
  const sheetId = String(req.params.sheetId || '').trim()
  const db = getDb()
  const resolvedAccountSetId = resolveAccountSetId(req.accountSetId || '', db)

  if (!reportCode) {
    return res.status(400).json({ code: 400, message: '报表编码不能为空' })
  }
  if (!sheetId) {
    return res.status(400).json({ code: 400, message: 'sheetId 不能为空' })
  }

  const definition = getDefinitionByCode(db, resolvedAccountSetId, reportCode)
  if (!definition) {
    return res.status(404).json({ code: 404, message: '未找到对应的报表模板' })
  }

  const sheets = getSheetsByDefinitionId(db, definition.id)
  if (sheets.length <= 1) {
    return res.status(400).json({ code: 400, message: '至少需要保留一个工作表' })
  }

  const targetSheet = sheets.find(s => s.id === sheetId)
  if (!targetSheet) {
    return res.status(404).json({ code: 404, message: '未找到对应工作表' })
  }

  db.prepare(`DELETE FROM report_cells WHERE report_sheet_id = ?`).run(sheetId)
  db.prepare(`DELETE FROM report_sheets WHERE id = ?`).run(sheetId)

  res.json({ code: 0, message: '删除成功' })
})

router.post('/templates/:code/execute', (req: AuthRequest, res) => {
  const reportCode = String(req.params.code || '').trim()
  const db = getDb()
  const resolvedAccountSetId = resolveAccountSetId(req.accountSetId || '', db)
  const year = Number(req.body?.year) || new Date().getFullYear()
  const period = Number(req.body?.period) || new Date().getMonth() + 1

  if (!reportCode) {
    return res.status(400).json({ code: 400, message: '报表编码不能为空' })
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ code: 400, message: 'year 必须为 2000-2100 的整数' })
  }
  if (!Number.isInteger(period) || period < 1 || period > 12) {
    return res.status(400).json({ code: 400, message: 'period 必须为 1-12 的整数' })
  }

  // 创建进度追踪任务
  const taskId = uuidv4()
  createReportTask(taskId)

  // 异步执行报表生成，立即返回任务ID
  setImmediate(async () => {
    try {
      updateReportTask(taskId, { status: 'running', progress: 10, message: '正在加载报表模板...' })

      const definition = getDefinitionByCode(db, resolvedAccountSetId, reportCode)
      if (!definition) {
        updateReportTask(taskId, {
          status: 'failed',
          progress: 20,
          message: '未找到对应报表模板',
          error: '未找到对应报表模板',
        })
        return
      }

      updateReportTask(taskId, { progress: 30, message: '正在加载报表配置...' })

      const sheets = getSheetsByDefinitionId(db, definition.id)
      const cells = getCellsBySheetIds(
        db,
        sheets.map(sheet => sheet.id)
      )
      const cellsBySheetId = new Map<string, ReportCellRow[]>()
      for (const cell of cells) {
        const bucket = cellsBySheetId.get(cell.report_sheet_id)
        if (bucket) {
          bucket.push(cell)
        } else {
          cellsBySheetId.set(cell.report_sheet_id, [cell])
        }
      }

      updateReportTask(taskId, { progress: 50, message: '正在计算报表数据...' })

      const executedSheets = executeTemplateSheets(
        sheets.map(sheet => ({
          ...sheet,
          cells: cellsBySheetId.get(sheet.id) || [],
        })),
        {
          db,
          accountSetId: resolvedAccountSetId,
          year,
          period,
        }
      )

      updateReportTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '报表生成完成',
        result: {
          definition: {
            ...definition,
            is_enabled: Boolean(definition.is_enabled),
          },
          filters: { year, period },
          sheets: executedSheets.map(sheet => ({
            ...sheet,
            metrics: {
              cellCount: sheet.cells.length,
              rowCount:
                sheet.cells.reduce((max: number, cell: any) => Math.max(max, cell.row_index), -1) +
                1,
              colCount:
                sheet.cells.reduce((max: number, cell: any) => Math.max(max, cell.col_index), -1) +
                1,
              errorCount: sheet.cells.filter((cell: any) => cell.status === 'error').length,
            },
          })),
        },
      })
    } catch (error: any) {
      updateReportTask(taskId, {
        status: 'failed',
        progress: 80,
        message: '报表生成失败',
        error: error.message || '未知错误',
      })
    }
  })

  // 立即返回任务ID，前端可轮询进度
  res.json({
    code: 0,
    message: '报表生成任务已创建',
    data: {
      taskId,
      pollUrl: `/api/report/tasks/${taskId}`,
    },
  })
})

export default router
