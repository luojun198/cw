import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import {
  closePeriod,
  getPeriodClosingRecord,
  isPeriodClosed,
  listPeriodClosingStatus,
} from '../services/voucherEntry.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 月结/年结 =====================

router.post(
  '/periods/:year/:period/close',
  operationLog('月结', '凭证管理'),
  (req: AuthRequest, res) => {
    const { year, period } = req.params
    const db = getDb()
    const existing = getPeriodClosingRecord({
      db,
      accountSetId: req.accountSetId || '',
      year,
      period,
    })
    if (isPeriodClosed(existing)) {
      return res.status(400).json({
        code: 400,
        message: '该月份已结账',
        data: {
          hint: '该期间已经结账，无法重复结账',
        },
      })
    }
    const id = existing?.id || uuidv4()
    closePeriod({
      db,
      id,
      accountSetId: req.accountSetId || '',
      year,
      period,
      userId: req.userId,
    })
    res.json({ code: 0, message: '月结成功' })
  }
)

router.post(
  '/periods/:year/:period/open',
  operationLog('反月结', '凭证管理'),
  (req: AuthRequest, res) => {
    const { year, period } = req.params
    const db = getDb()
    openPeriod({
      db,
      accountSetId: req.accountSetId || '',
      year,
      period,
    })
    res.json({ code: 0, message: '反月结成功' })
  }
)

router.get('/periods/status', (req: AuthRequest, res) => {
  const { year } = req.query
  const db = getDb()
  const list = listPeriodClosingStatus({
    db,
    accountSetId: req.accountSetId || '',
    year: year || new Date().getFullYear(),
  })
  res.json({ code: 0, data: list })
})

// Helper function for opening period
function openPeriod(params: { db: any; accountSetId: string; year: string; period: string }) {
  const { db, accountSetId, year, period } = params
  db.prepare(
    `UPDATE period_closing SET status='open', updated_at=datetime('now') WHERE account_set_id=? AND year=? AND period=?`
  ).run(accountSetId, year, period)
}

export default router
