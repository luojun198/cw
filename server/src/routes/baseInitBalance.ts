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

  // 返回所有启用科目及其期初余额（含年初/账前明细字段）
  const sql = `
    SELECT a.*, ib.init_balance, ib.init_debit, ib.init_credit,
           ib.opening_debit, ib.opening_credit,
           ib.pre_book_debit, ib.pre_book_credit,
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
  const {
    account_id, direction, init_balance, init_debit, init_credit,
    year, period, aux_item_id,
    opening_debit, opening_credit, pre_book_debit, pre_book_credit,
  } = req.body
  const db = getDb()
  const y = year || new Date().getFullYear()
  const p = period || 1
  const id = uuidv4()
  db.prepare(
    `
    INSERT OR REPLACE INTO init_balances
      (id, account_set_id, account_id, direction, year, period,
       init_balance, init_debit, init_credit, aux_item_id,
       opening_debit, opening_credit, pre_book_debit, pre_book_credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    aux_item_id,
    opening_debit || 0,
    opening_credit || 0,
    pre_book_debit || 0,
    pre_book_credit || 0,
  )

  // 校验借贷平衡
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

// 批量保存期初余额（事务包裹）
router.post('/init-balances/batch', operationLog('批量保存期初余额', '基础设置'), (req: AuthRequest, res) => {
  const { year, items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ code: 1, message: '数据不能为空' })
  }
  const db = getDb()
  const y = year || new Date().getFullYear()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO init_balances
      (id, account_set_id, account_id, direction, year, period,
       init_balance, init_debit, init_credit, aux_item_id,
       opening_debit, opening_credit, pre_book_debit, pre_book_credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const runBatch = db.transaction(() => {
    for (const item of items) {
      const od = item.opening_debit || 0
      const oc = item.opening_credit || 0
      const pd = item.pre_book_debit || 0
      const pc = item.pre_book_credit || 0
      // init_debit/init_credit = 年初 + 账前
      const totalDebit = od + pd
      const totalCredit = oc + pc
      // init_balance = 净余额（借方为正，贷方为负）
      const initBalance = totalDebit - totalCredit

      stmt.run(
        uuidv4(),
        req.accountSetId,
        item.account_id,
        item.direction,
        y,
        item.period || 1,
        initBalance,
        totalDebit,
        totalCredit,
        item.aux_item_id || null,
        od,
        oc,
        pd,
        pc,
      )
    }
  })

  try {
    runBatch()

    // 校验借贷平衡
    const balances = db
      .prepare(
        `SELECT SUM(init_debit) as total_debit, SUM(init_credit) as total_credit
         FROM init_balances WHERE account_set_id=? AND year=?`
      )
      .get(req.accountSetId, y) as any

    const balanced = Math.abs((balances?.total_debit || 0) - (balances?.total_credit || 0)) < 0.01
    res.json({
      code: 0,
      message: `批量保存成功，共 ${items.length} 条`,
      data: { balanced, totalDebit: balances?.total_debit || 0, totalCredit: balances?.total_credit || 0 },
    })
  } catch (error: any) {
    res.status(500).json({ code: 1, message: '批量保存失败: ' + error.message })
  }
})

// 检查期初余额是否可编辑（该年度是否有已审核/已过账凭证）
router.get('/init-balances/can-edit', (req: AuthRequest, res) => {
  const { year } = req.query
  const db = getDb()
  const y = Number(year) || new Date().getFullYear()

  const result = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM vouchers
       WHERE account_set_id = ? AND strftime('%Y', voucher_date) = ?
       AND status IN ('audited', 'posted')`
    )
    .get(req.accountSetId, String(y)) as any

  const count = result?.cnt || 0
  const canEdit = count === 0
  res.json({
    code: 0,
    canEdit,
    reason: canEdit ? null : `${y}年已有 ${count} 张已审核/已过账凭证，期初余额不允许修改`,
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
