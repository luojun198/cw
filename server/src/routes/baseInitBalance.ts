import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 期初余额 =====================

router.get('/init-balances', (req: AuthRequest, res) => {
  const db = getDb()
  const { year } = req.query
  const y = Number(year) || new Date().getFullYear()

  // 获取账套信息（含开账日期）
  const accountSet = db
    .prepare('SELECT * FROM account_sets WHERE id=?')
    .get(req.accountSetId) as any
  const startDate = accountSet?.start_date ? new Date(accountSet.start_date) : null
  const startMonth = startDate ? startDate.getMonth() + 1 : 1
  const isMidYear = startMonth > 1

  // 返回所有启用科目及其期初余额
  const sql = `
    SELECT a.*, ib.init_balance, ib.init_debit, ib.init_credit,
           ib.direction as balance_direction, ib.aux_item_id
    FROM accounts a
    LEFT JOIN init_balances ib ON a.id = ib.account_id AND ib.year = ? AND ib.account_set_id = ?
    WHERE a.account_set_id = ? AND a.is_enabled = 1
    ORDER BY a.code
  `
  const list = db.prepare(sql).all(y, req.accountSetId, req.accountSetId)
  res.json({ code: 0, data: list, isMidYear, startMonth })
})

router.post('/init-balances', operationLog('录入期初余额', '基础设置'), (req: AuthRequest, res) => {
  const { account_id, direction, init_balance, init_debit, init_credit, year, period, aux_item_id } =
    req.body
  const db = getDb()
  const y = year || new Date().getFullYear()
  const p = period || 1
  const id = uuidv4()
  db.prepare(
    `
    INSERT OR REPLACE INTO init_balances (id, account_set_id, account_id, direction, year, period, init_balance, init_debit, init_credit, aux_item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    req.accountSetId,
    account_id,
    direction,
    y,
    p,
    init_balance || 0,
    init_debit || 0,
    init_credit || 0,
    aux_item_id
  )

  // 校验借贷平衡（使用期末余额）
  const balances = db
    .prepare(
      `
    SELECT SUM(init_debit) as total_debit, SUM(init_credit) as total_credit
    FROM init_balances WHERE account_set_id=? AND year=?
  `
    )
    .get(req.accountSetId, y) as any

  const balanced = Math.abs((balances?.total_debit || 0) - (balances?.total_credit || 0)) < 0.01
  res.json({
    code: 0,
    message: '保存成功',
    data: { balanced, totalDebit: balances?.total_debit, totalCredit: balances?.total_credit },
  })
})

router.get('/init-balances/check', (req: AuthRequest, res) => {
  const { year } = req.query
  const db = getDb()
  const y = year || new Date().getFullYear()
  const balances = db
    .prepare(
      `
    SELECT SUM(init_debit) as total_debit, SUM(init_credit) as total_credit
    FROM init_balances WHERE account_set_id=? AND year=?
  `
    )
    .get(req.accountSetId, y) as any
  const balanced = Math.abs((balances?.total_debit || 0) - (balances?.total_credit || 0)) < 0.01
  res.json({
    code: 0,
    balanced,
    totalDebit: balances?.total_debit || 0,
    totalCredit: balances?.total_credit || 0,
  })
})

export default router
