import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.js'
import { accountHasAuxAccounting } from '../utils/auxItemId.js'
import {
  assertOpeningDebitCreditExclusive,
  normalizeOpeningDebitCredit,
} from '../utils/initBalanceOpening.js'
import {
  checkInitBalanceAuxCategoryConsistency,
  getInitBalanceAuxConfig,
  getInitBalanceAuxDetails,
  saveInitBalanceAuxDetails,
  upsertInitBalanceAuxLine,
} from '../services/initBalanceAux.js'

const router = Router()
router.use(authMiddleware)

function normalizeAuxItemId(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function calcInitBalance(direction: string, totalDebit: number, totalCredit: number) {
  return direction === 'credit' ? totalCredit - totalDebit : totalDebit - totalCredit
}

function getInitBalanceTotals(db: any, accountSetId: string, year: number | string) {
  const balances = db
    .prepare(
      `
      SELECT SUM(init_debit) as total_debit, SUM(init_credit) as total_credit
      FROM init_balances
      WHERE account_set_id=? AND year=? AND aux_item_id=''
    `
    )
    .get(accountSetId, year) as any
  const totalDebit = balances?.total_debit || 0
  const totalCredit = balances?.total_credit || 0
  return {
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    totalDebit,
    totalCredit,
  }
}

function assertAccountEditableForDirectInit(db: any, accountSetId: string, accountId: string) {
  const account = db
    .prepare(`SELECT is_aux, aux_types FROM accounts WHERE id=? AND account_set_id=?`)
    .get(accountId, accountSetId) as { is_aux?: number; aux_types?: string } | undefined
  if (account && accountHasAuxAccounting(account)) {
    throw new Error('该科目已启用辅助核算，请通过「辅助期初」录入，不能直接修改科目期初')
  }
}

router.get('/init-balances', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, keyword } = req.query
  const y = Number(year) || new Date().getFullYear()

  const accountSet = db.prepare('SELECT * FROM account_sets WHERE id=?').get(req.accountSetId) as any
  const startDate = accountSet?.start_date ? new Date(accountSet.start_date) : null
  const startMonth = startDate ? startDate.getMonth() + 1 : 1
  const isMidYear = startMonth > 1

  let sql = `
    SELECT a.*, ib.init_balance, ib.init_debit, ib.init_credit,
           ib.opening_debit, ib.opening_credit,
           ib.pre_book_debit, ib.pre_book_credit,
           ib.direction as balance_direction,
           (SELECT COUNT(*) FROM init_balances ib2
            WHERE ib2.account_set_id = a.account_set_id
              AND ib2.account_id = a.id
              AND ib2.year = ?
              AND ib2.aux_item_id != '') as aux_detail_count
    FROM accounts a
    LEFT JOIN init_balances ib
      ON a.id = ib.account_id
      AND ib.year = ?
      AND ib.account_set_id = ?
      AND ib.aux_item_id = ''
    WHERE a.account_set_id = ? AND a.is_enabled = 1
  `
  const params: any[] = [y, y, req.accountSetId, req.accountSetId]

  if (keyword && typeof keyword === 'string' && keyword.trim()) {
    const kw = `%${keyword.trim()}%`
    sql += ` AND (a.code LIKE ? OR a.name LIKE ?)`
    params.push(kw, kw)
  }

  sql += ` ORDER BY a.code`

  const list = (db.prepare(sql).all(...params) as any[]).map(row => ({
    ...row,
    has_aux: accountHasAuxAccounting(row),
    aux_readonly: accountHasAuxAccounting(row),
  }))

  res.json({ code: 0, data: list, isMidYear, startMonth })
})

router.get('/init-balances/aux-config', (req: AuthRequest, res) => {
  const db = getDb()
  try {
    const data = getInitBalanceAuxConfig(db, req.accountSetId || '')
    res.json({ code: 0, data })
  } catch (error: any) {
    res.status(500).json({ code: 1, message: error.message })
  }
})

router.get('/init-balances/aux-details', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, account_id, period } = req.query
  if (!account_id || typeof account_id !== 'string') {
    return res.status(400).json({ code: 1, message: '缺少 account_id' })
  }
  const y = Number(year) || new Date().getFullYear()
  const p = Number(period) || 1
  try {
    const data = getInitBalanceAuxDetails(db, req.accountSetId || '', account_id, y, p)
    res.json({ code: 0, data })
  } catch (error: any) {
    res.status(400).json({ code: 1, message: error.message })
  }
})

router.post(
  '/init-balances/aux-details/line',
  operationLog('保存辅助期初单行', '基础设置'),
  (req: AuthRequest, res) => {
    const { year, account_id, period, line } = req.body
    if (!account_id) {
      return res.status(400).json({ code: 1, message: '缺少 account_id' })
    }
    if (!line || typeof line !== 'object') {
      return res.status(400).json({ code: 1, message: '缺少 line' })
    }
    const db = getDb()
    const y = year || new Date().getFullYear()
    const p = period || 1
    try {
      const summary = upsertInitBalanceAuxLine(
        db,
        req.accountSetId || '',
        account_id,
        y,
        line,
        p
      )
      res.json({ code: 0, message: '保存成功', data: { summary } })
    } catch (error: any) {
      res.status(400).json({ code: 1, message: error.message })
    }
  }
)

router.post(
  '/init-balances/aux-details',
  operationLog('保存辅助期初余额', '基础设置'),
  (req: AuthRequest, res) => {
    const { year, account_id, period, lines } = req.body
    if (!account_id) {
      return res.status(400).json({ code: 1, message: '缺少 account_id' })
    }
    if (!Array.isArray(lines)) {
      return res.status(400).json({ code: 1, message: 'lines 必须为数组' })
    }
    const db = getDb()
    const y = year || new Date().getFullYear()
    const p = period || 1

    try {
      const summary = saveInitBalanceAuxDetails(
        db,
        req.accountSetId || '',
        account_id,
        y,
        lines,
        p
      )
      const totals = getInitBalanceTotals(db, req.accountSetId || '', y)
      res.json({
        code: 0,
        message: '保存成功',
        data: { summary, ...totals },
      })
    } catch (error: any) {
      res.status(400).json({ code: 1, message: error.message })
    }
  }
)

router.post('/init-balances', operationLog('录入期初余额', '基础设置'), (req: AuthRequest, res) => {
  const {
    account_id,
    direction,
    init_balance,
    init_debit,
    init_credit,
    year,
    period,
    aux_item_id,
    opening_debit,
    opening_credit,
    pre_book_debit,
    pre_book_credit,
  } = req.body
  const db = getDb()
  const y = year || new Date().getFullYear()
  const p = period || 1
  const auxItemId = normalizeAuxItemId(aux_item_id)

  try {
    if (auxItemId === '') {
      assertAccountEditableForDirectInit(db, req.accountSetId || '', account_id)
    }
  } catch (error: any) {
    return res.status(400).json({ code: 1, message: error.message })
  }

  try {
    assertOpeningDebitCreditExclusive(opening_debit || 0, opening_credit || 0)
  } catch (error: any) {
    return res.status(400).json({ code: 1, message: error.message })
  }

  const opening = normalizeOpeningDebitCredit(opening_debit || 0, opening_credit || 0)
  const od = opening.opening_debit
  const oc = opening.opening_credit
  const pd = pre_book_debit || 0
  const pc = pre_book_credit || 0
  const totalDebit = od + pd
  const totalCredit = oc + pc
  const normalizedInitBalance = init_balance ?? calcInitBalance(direction, totalDebit, totalCredit)

  const existing = db
    .prepare(
      `SELECT id FROM init_balances WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?`
    )
    .get(req.accountSetId, account_id, y, p, auxItemId) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `
      UPDATE init_balances SET
        direction=?, init_balance=?, init_debit=?, init_credit=?, aux_item_id=?,
        opening_debit=?, opening_credit=?, pre_book_debit=?, pre_book_credit=?
      WHERE id=?
    `
    ).run(
      direction,
      normalizedInitBalance || 0,
      totalDebit,
      totalCredit,
      auxItemId,
      od,
      oc,
      pd,
      pc,
      existing.id
    )
  } else {
    db.prepare(
      `
      INSERT INTO init_balances
        (id, account_set_id, account_id, direction, year, period,
         init_balance, init_debit, init_credit, aux_item_id,
         opening_debit, opening_credit, pre_book_debit, pre_book_credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      uuidv4(),
      req.accountSetId,
      account_id,
      direction,
      y,
      p,
      normalizedInitBalance || 0,
      totalDebit,
      totalCredit,
      auxItemId,
      od,
      oc,
      pd,
      pc
    )
  }

  const totals = getInitBalanceTotals(db, req.accountSetId || '', y)
  res.json({
    code: 0,
    message: '保存成功',
    data: totals,
  })
})

router.post(
  '/init-balances/batch',
  operationLog('批量保存期初余额', '基础设置'),
  (req: AuthRequest, res) => {
    const { year, items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 1, message: '数据不能为空' })
    }
    const db = getDb()
    const y = year || new Date().getFullYear()

    const findExisting = db.prepare(
      `SELECT id FROM init_balances WHERE account_set_id=? AND account_id=? AND year=? AND period=? AND aux_item_id=?`
    )
    const updateStmt = db.prepare(`
      UPDATE init_balances SET
        direction=?, init_balance=?, init_debit=?, init_credit=?, aux_item_id=?,
        opening_debit=?, opening_credit=?, pre_book_debit=?, pre_book_credit=?
      WHERE id=?
    `)
    const insertStmt = db.prepare(`
      INSERT INTO init_balances
        (id, account_set_id, account_id, direction, year, period,
         init_balance, init_debit, init_credit, aux_item_id,
         opening_debit, opening_credit, pre_book_debit, pre_book_credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    try {
      const runBatch = db.transaction(() => {
        for (const item of items) {
          const auxItemId = normalizeAuxItemId(item.aux_item_id)
          if (auxItemId === '') {
            assertAccountEditableForDirectInit(db, req.accountSetId || '', item.account_id)
          }

          assertOpeningDebitCreditExclusive(item.opening_debit || 0, item.opening_credit || 0)
          const opening = normalizeOpeningDebitCredit(
            item.opening_debit || 0,
            item.opening_credit || 0
          )
          const od = opening.opening_debit
          const oc = opening.opening_credit
          const pd = item.pre_book_debit || 0
          const pc = item.pre_book_credit || 0
          const totalDebit = od + pd
          const totalCredit = oc + pc
          const initBalance = calcInitBalance(item.direction, totalDebit, totalCredit)
          const p = item.period || 1

          const existing = findExisting.get(req.accountSetId, item.account_id, y, p, auxItemId) as
            | { id: string }
            | undefined

          if (existing) {
            updateStmt.run(
              item.direction,
              initBalance,
              totalDebit,
              totalCredit,
              auxItemId,
              od,
              oc,
              pd,
              pc,
              existing.id
            )
          } else {
            insertStmt.run(
              uuidv4(),
              req.accountSetId,
              item.account_id,
              item.direction,
              y,
              p,
              initBalance,
              totalDebit,
              totalCredit,
              auxItemId,
              od,
              oc,
              pd,
              pc
            )
          }
        }
      })

      runBatch()
      const totals = getInitBalanceTotals(db, req.accountSetId || '', y)
      res.json({
        code: 0,
        message: `批量保存成功，共 ${items.length} 条`,
        data: totals,
      })
    } catch (error: any) {
      res.status(400).json({ code: 1, message: error.message })
    }
  }
)

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
    reason: canEdit ? null : `${y}年已有 ${count} 张已审核/已记账凭证，期初余额不允许修改`,
  })
})

router.get('/init-balances/check', (req: AuthRequest, res) => {
  const { year } = req.query
  const db = getDb()
  const y = Number(year) || new Date().getFullYear()
  const totals = getInitBalanceTotals(db, req.accountSetId || '', y)
  const auxCategoryCheck = checkInitBalanceAuxCategoryConsistency(
    db,
    req.accountSetId || '',
    y
  )
  res.json({
    code: 0,
    ...totals,
    auxCategoryConsistent: auxCategoryCheck.consistent,
    auxCategoryMismatches: auxCategoryCheck.mismatches,
  })
})

export default router
