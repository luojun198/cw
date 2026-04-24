import { Router } from 'express'
import dayjs from 'dayjs'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest } from '../middleware/index.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 工作台数据 =====================
router.get('/stats', (req: AuthRequest, res) => {
  const db = getDb()
  const year = new Date().getFullYear()
  const month = new Date().getMonth() + 1

  // 本月凭证数
  const voucherCount = db
    .prepare(
      `
    SELECT COUNT(*) as cnt FROM vouchers
    WHERE account_set_id=? AND year=? AND period=?
  `
    )
    .get(req.accountSetId, year, month) as any

  // 本月借方合计
  const debitTotal = db
    .prepare(
      `
    SELECT COALESCE(SUM(ve.amount), 0) as total
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    WHERE ve.account_set_id=? AND v.year=? AND v.period=? AND ve.direction='debit'
  `
    )
    .get(req.accountSetId, year, month) as any

  // 本月贷方合计
  const creditTotal = db
    .prepare(
      `
    SELECT COALESCE(SUM(ve.amount), 0) as total
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    WHERE ve.account_set_id=? AND v.year=? AND v.period=? AND ve.direction='credit'
  `
    )
    .get(req.accountSetId, year, month) as any

  // 待审核凭证数（已审核但未过账）
  const auditPending = db
    .prepare(
      `
    SELECT COUNT(*) as cnt FROM vouchers
    WHERE account_set_id=? AND status='audited'
  `
    )
    .get(req.accountSetId) as any

  res.json({
    code: 0,
    data: {
      voucherCount: voucherCount?.cnt || 0,
      debitTotal: debitTotal?.total || 0,
      creditTotal: creditTotal?.total || 0,
      auditPending: auditPending?.cnt || 0,
    },
  })
})

// 近6个月收支趋势
router.get('/trend', (req: AuthRequest, res) => {
  const db = getDb()
  const now = new Date()
  const results = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ve.direction='debit' THEN ve.amount ELSE 0 END),0) as debit,
        COALESCE(SUM(CASE WHEN ve.direction='credit' THEN ve.amount ELSE 0 END),0) as credit
      FROM voucher_entries ve
      JOIN vouchers v ON v.id=ve.voucher_id
      WHERE ve.account_set_id=? AND v.year=? AND v.period=?
    `).get(req.accountSetId, y, m) as any
    results.push({ month: `${y}-${String(m).padStart(2,'0')}`, debit: row?.debit||0, credit: row?.credit||0 })
  }
  res.json({ code: 0, data: results })
})

// 科目余额Top5（按余额绝对值降序，仅叶子科目）
router.get('/top-accounts', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare(
      `
    SELECT a.code, a.name,
      COALESCE(SUM(CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END),0) as balance
    FROM accounts a
    LEFT JOIN voucher_entries ve ON ve.account_id = a.id AND ve.account_set_id = a.account_set_id
    WHERE a.account_set_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM accounts c
        WHERE c.account_set_id = a.account_set_id AND c.parent_id = a.id
      )
    GROUP BY a.id, a.code, a.name
    ORDER BY ABS(balance) DESC
    LIMIT 5
  `
    )
    .all(req.accountSetId)

  res.json({ code: 0, data: list })
})

// 近期凭证（最近10条）
router.get('/recent-vouchers', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare(
      `
    SELECT v.id, v.voucher_no as voucherNo, v.voucher_date as voucherDate,
           v.remark as abstract, v.status, v.year, v.period,
           SUM(CASE WHEN ve.direction='debit' THEN ve.amount ELSE 0 END) as totalAmount
    FROM vouchers v
    LEFT JOIN voucher_entries ve ON ve.voucher_id = v.id
    WHERE v.account_set_id=?
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.voucher_no DESC
    LIMIT 10
  `
    )
    .all(req.accountSetId)

  res.json({ code: 0, data: list })
})

export default router
