import { Router } from 'express'
import { getDb } from '../db/index.js'
import { authMiddleware as auth, AuthRequest } from '../middleware/auth.js'
import multer from 'multer'
import { extractAcdReportTemplates } from '../services/acdReportFormulaSync.js'
import { executeTemplateSheets } from '../services/reportTemplateExecutor.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for ACD
})

// 获取标准报表列表
router.get('/', auth, (req: AuthRequest, res) => {
  try {
    const db = getDb()
    const reports = db
      .prepare('SELECT * FROM rh_standard_reports WHERE account_set_id = ? ORDER BY created_at DESC')
      .all(req.accountSetId)
    res.json({ code: 0, data: reports })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 上传 ACD 并解析创建标准报表
// 复用主报表系统同款的二进制 VTS 解析器（acdReportFormulaSync.extractAcdReportTemplates），
// 按真实行列还原报表网格，存入 rh_standard_report_cells，供模板视图渲染与公式计算。
router.post('/upload', auth, upload.single('file'), (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传 ACD 文件' })
    }

    const { templates, warnings } = extractAcdReportTemplates(req.file.buffer)
    if (templates.length === 0) {
      return res.status(400).json({
        code: 400,
        message: warnings[0] || '文件中未找到可解析的 vts 报表模板',
      })
    }

    const db = getDb()
    const resultReports: { id: string; name: string }[] = []

    db.transaction(() => {
      // 可重复导入：先清空当前账套旧的标准报表（含历史无效导入数据）
      const oldReports = db
        .prepare('SELECT id FROM rh_standard_reports WHERE account_set_id = ?')
        .all(req.accountSetId) as { id: string }[]
      const delCells = db.prepare('DELETE FROM rh_standard_report_cells WHERE report_id = ?')
      for (const old of oldReports) {
        delCells.run(old.id)
      }
      db.prepare('DELETE FROM rh_standard_reports WHERE account_set_id = ?').run(req.accountSetId)

      const insertReport = db.prepare(
        'INSERT INTO rh_standard_reports (id, account_set_id, code, name, source_file, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      )
      const insertCell = db.prepare(
        'INSERT INTO rh_standard_report_cells (id, report_id, row_index, col_index, text_value, formula_text) VALUES (?, ?, ?, ?, ?, ?)'
      )

      templates.forEach((template, templateIndex) => {
        // 资产负债表等为单 sheet；取首个含单元格的 sheet
        const sheet = template.sheets.find(s => s.cells.length > 0)
        if (!sheet) return

        // 去重：同一 (row,col) 公式优先于文本，避免 UNIQUE(report_id,row,col) 冲突
        const cellMap = new Map<string, (typeof sheet.cells)[number]>()
        for (const cell of sheet.cells) {
          if (cell.rowIndex < 0 || cell.colIndex < 0) continue
          const key = `${cell.rowIndex}_${cell.colIndex}`
          const existing = cellMap.get(key)
          if (!existing || (cell.cellType === 'formula' && existing.cellType !== 'formula')) {
            cellMap.set(key, cell)
          }
        }
        if (cellMap.size === 0) return

        const reportId = uuidv4()
        insertReport.run(
          reportId,
          req.accountSetId,
          template.reportCode,
          template.reportName,
          template.sourceFile,
          templateIndex
        )

        for (const cell of cellMap.values()) {
          insertCell.run(
            uuidv4(),
            reportId,
            cell.rowIndex,
            cell.colIndex,
            cell.textValue,
            cell.formulaText
          )
        }

        resultReports.push({ id: reportId, name: template.reportName })
      })
    })()

    res.json({ code: 0, message: '导入成功', data: resultReports })
  } catch (error: any) {
    console.error('[standard-report] ACD 导入失败:', error)
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 获取单个标准报表详情（包含公式和文字）
router.get('/:id', auth, (req: AuthRequest, res) => {
  try {
    const db = getDb()
    const report = db
      .prepare('SELECT * FROM rh_standard_reports WHERE id = ? AND account_set_id = ?')
      .get(req.params.id, req.accountSetId)
    
    if (!report) {
      return res.status(404).json({ code: 404, message: '报表不存在' })
    }

    const cells = db
      .prepare('SELECT * FROM rh_standard_report_cells WHERE report_id = ? ORDER BY row_index ASC, col_index ASC')
      .all(req.params.id)

    res.json({ code: 0, data: { ...report, cells } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 计算标准报表（按年/期，用主报表系统同款公式引擎求值）
router.get('/:id/compute', auth, (req: AuthRequest, res) => {
  try {
    const db = getDb()
    const report = db
      .prepare('SELECT * FROM rh_standard_reports WHERE id = ? AND account_set_id = ?')
      .get(req.params.id, req.accountSetId) as
      | { id: string; name: string }
      | undefined

    if (!report) {
      return res.status(404).json({ code: 404, message: '报表不存在' })
    }

    // 解析年/期：缺省取账套会计年度 + 12 期（年末，适配资产负债表）
    const accountSet = db
      .prepare('SELECT name, fiscal_year FROM account_sets WHERE id = ?')
      .get(req.accountSetId) as { name?: string; fiscal_year?: number } | undefined

    const year = Number.parseInt(String(req.query.year ?? ''), 10) || accountSet?.fiscal_year || new Date().getFullYear()
    let period = Number.parseInt(String(req.query.period ?? ''), 10)
    if (!Number.isInteger(period) || period < 1 || period > 12) period = 12

    const rawCells = db
      .prepare(
        'SELECT id, row_index, col_index, text_value, formula_text FROM rh_standard_report_cells WHERE report_id = ? ORDER BY row_index ASC, col_index ASC'
      )
      .all(req.params.id) as {
      id: string
      row_index: number
      col_index: number
      text_value: string | null
      formula_text: string | null
    }[]

    const sheetId = 'sheet1'
    const templateCells = rawCells.map(cell => ({
      id: cell.id,
      report_sheet_id: sheetId,
      row_index: cell.row_index,
      col_index: cell.col_index,
      cell_type: cell.formula_text ? 'formula' : 'text',
      text_value: cell.text_value,
      formula_text: cell.formula_text,
      format_text: null,
      style_key: null,
      side: null,
    }))

    const [executedSheet] = executeTemplateSheets(
      [
        {
          id: sheetId,
          report_definition_id: report.id,
          sheet_key: sheetId,
          sheet_name: report.name,
          sheet_index: 0,
          cells: templateCells,
        },
      ],
      {
        db,
        accountSetId: req.accountSetId!,
        year,
        period,
        unitName: accountSet?.name || '',
        accountScope: req.accountScope,
      }
    )

    const cells = (executedSheet?.cells || []).map((cell: any) => ({
      row_index: cell.row_index,
      col_index: cell.col_index,
      display_value: cell.display_value,
      numeric_value: cell.numeric_value,
      status: cell.status,
    }))

    const maxRow = cells.reduce((max, cell) => Math.max(max, cell.row_index), 0)
    const maxCol = cells.reduce((max, cell) => Math.max(max, cell.col_index), 0)

    res.json({ code: 0, data: { year, period, maxRow, maxCol, cells } })
  } catch (error: any) {
    console.error('[standard-report] 报表计算失败:', error)
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 删除标准报表
router.delete('/:id', auth, (req: AuthRequest, res) => {
  try {
    const db = getDb()
    db.transaction(() => {
      db.prepare('DELETE FROM rh_standard_report_cells WHERE report_id = ?').run(req.params.id)
      db.prepare('DELETE FROM rh_standard_reports WHERE id = ? AND account_set_id = ?').run(req.params.id, req.accountSetId)
    })()
    res.json({ code: 0, message: '删除成功' })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

export default router
