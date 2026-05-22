import { Router } from 'express'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, requirePermission, operationLog } from '../middleware/index.js'
import { listPeriodClosingStatus } from '../services/voucherEntry.js'
import {
  buildYearPeriodStatusView,
  closeAccountingPeriod,
  openAccountingPeriod,
} from '../services/yearClosing.js'

const router = Router()
router.use(authMiddleware)

function parseYearPeriod(params: { year?: string; period?: string }) {
  return {
    year: Number(params.year),
    period: Number(params.period),
  }
}

router.get('/periods/:year/overview', (req: AuthRequest, res) => {
  const db = getDb()
  const year = Number(req.params.year) || new Date().getFullYear()
  const data = buildYearPeriodStatusView({
    db,
    accountSetId: req.accountSetId || '',
    year,
  })
  res.json({ code: 0, data })
})

router.post(
  '/periods/:year/:period/close',
  requirePermission('period:close'),
  operationLog('结账', '凭证管理'),
  (req: AuthRequest, res) => {
    const { year, period } = parseYearPeriod(req.params)
    const db = getDb()

    try {
      const result = closeAccountingPeriod({
        db,
        accountSetId: req.accountSetId || '',
        year,
        period,
        userId: req.userId,
      })

      res.json({
        code: 0,
        message: period === 12 ? '年度结账成功，已生成下一年期初余额' : '月结成功',
        data: result,
      })
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error?.message || '结账失败',
      })
    }
  }
)

router.post(
  '/periods/:year/:period/open',
  requirePermission('period:unclose'),
  operationLog('反结账', '凭证管理'),
  (req: AuthRequest, res) => {
    const { year, period } = parseYearPeriod(req.params)
    const db = getDb()

    try {
      const result = openAccountingPeriod({
        db,
        accountSetId: req.accountSetId || '',
        year,
        period,
        userId: req.userId,
      })
      res.json({
        code: 0,
        message:
          period === 12 && result.removedNextYearOpening
            ? '年度反结账成功，已撤销下一年期初余额'
            : '反结账成功',
        data: result,
      })
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error?.message || '反结账失败',
      })
    }
  }
)

router.get('/periods/status', (req: AuthRequest, res) => {
  const { year } = req.query
  const db = getDb()
  const yearValue = typeof year === 'string' || typeof year === 'number' ? year : new Date().getFullYear()
  const list = listPeriodClosingStatus({
    db,
    accountSetId: req.accountSetId || '',
    year: yearValue,
  })
  res.json({ code: 0, data: list })
})

router.get('/periods/available-for-report', (req: AuthRequest, res) => {
  const db = getDb()
  const { year } = req.query
  let y = Number(year) || new Date().getFullYear()

  if (y < 100) {
    y = 2000 + y
  }

  const closedPeriods = db
    .prepare(
      `
      SELECT year, period
      FROM period_closing
      WHERE account_set_id = ?
        AND year = ?
        AND status = 'closed'
      ORDER BY period
    `
    )
    .all(req.accountSetId, y)

  res.json({
    code: 0,
    data: closedPeriods.map((p: any) => p.period),
  })
})

export default router
