import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.js'
import {
  listCashierAccounts,
  listJournal,
  autoReconcile,
} from '../services/cashierQuery.js'

const router = Router()
router.use(authMiddleware)

// ── 出纳科目列表（现金/银行末级科目） ────────────────────
router.get('/cashier/accounts', (req: AuthRequest, res) => {
  const asid = req.accountSetId || ''
  res.json({ code: 0, data: listCashierAccounts(asid) })
})

// ── 期初余额 ─────────────────────────────────────────────
router.get('/cashier/init-balance', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare('SELECT * FROM cashier_init_balance WHERE account_set_id = ? ORDER BY account_code, currency')
    .all(req.accountSetId || '') as any[]
  res.json({ code: 0, data: list })
})

router.put(
  '/cashier/init-balance',
  operationLog('出纳期初余额', '出纳管理'),
  (req: AuthRequest, res) => {
    const { account_code, currency = 'RMB', balance } = req.body
    if (!account_code || balance === undefined) {
      return res.status(400).json({ code: 400, message: '科目编码和余额不能为空' })
    }
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM cashier_init_balance WHERE account_set_id=? AND account_code=? AND currency=?')
      .get(req.accountSetId, account_code, currency) as { id: string } | undefined
    if (existing) {
      db.prepare('UPDATE cashier_init_balance SET balance=?, updated_at=datetime(\'now\') WHERE id=?').run(
        Number(balance),
        existing.id
      )
    } else {
      db.prepare(
        'INSERT INTO cashier_init_balance (id, account_set_id, account_code, currency, balance) VALUES (?,?,?,?,?)'
      ).run(uuidv4(), req.accountSetId, account_code, currency, Number(balance))
    }
    res.json({ code: 0, data: { ok: true } })
  }
)

// ── 日记账列表（含逐行余额） ──────────────────────────────
router.get('/cashier/journal', (req: AuthRequest, res) => {
  const { account_code, currency, start_date, end_date } = req.query as Record<string, string>
  if (!account_code) return res.status(400).json({ code: 400, message: '科目编码不能为空' })
  const result = listJournal({
    accountSetId: req.accountSetId || '',
    accountCode: account_code,
    currency: currency || 'RMB',
    startDate: start_date,
    endDate: end_date,
  })
  res.json({ code: 0, data: result })
})

router.post(
  '/cashier/journal',
  operationLog('出纳日记账录入', '出纳管理'),
  (req: AuthRequest, res) => {
    const {
      account_code, currency = 'RMB', biz_date, seq = 0, summary,
      debit = 0, credit = 0, settle_type, bill_no, counter_unit,
      counter_account, bank_name, bank_account, unit_code,
    } = req.body
    if (!account_code || !biz_date) {
      return res.status(400).json({ code: 400, message: '科目编码和日期不能为空' })
    }
    const db = getDb()
    const id = uuidv4()
    db.prepare(
      `INSERT INTO cashier_journal
        (id, account_set_id, account_code, currency, biz_date, seq, summary,
         debit, credit, settle_type, bill_no, counter_unit, counter_account,
         bank_name, bank_account, unit_code, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, req.accountSetId, account_code, currency, biz_date, seq, summary || null,
      Number(debit), Number(credit), settle_type || null, bill_no || null,
      counter_unit || null, counter_account || null, bank_name || null,
      bank_account || null, unit_code || null, (req as any).user?.name || null
    )
    res.json({ code: 0, data: { id } })
  }
)

router.put(
  '/cashier/journal/:id',
  operationLog('出纳日记账修改', '出纳管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM cashier_journal WHERE id=? AND account_set_id=?')
      .get(id, req.accountSetId)
    if (!existing) return res.status(404).json({ code: 404, message: '记录不存在' })

    const {
      biz_date, seq, summary, debit, credit,
      settle_type, bill_no, counter_unit, counter_account,
      bank_name, bank_account,
    } = req.body
    db.prepare(
      `UPDATE cashier_journal SET
        biz_date=COALESCE(?,biz_date), seq=COALESCE(?,seq), summary=COALESCE(?,summary),
        debit=COALESCE(?,debit), credit=COALESCE(?,credit),
        settle_type=COALESCE(?,settle_type), bill_no=COALESCE(?,bill_no),
        counter_unit=COALESCE(?,counter_unit), counter_account=COALESCE(?,counter_account),
        bank_name=COALESCE(?,bank_name), bank_account=COALESCE(?,bank_account),
        updated_at=datetime('now')
       WHERE id=?`
    ).run(
      biz_date, seq, summary, debit != null ? Number(debit) : null,
      credit != null ? Number(credit) : null,
      settle_type, bill_no, counter_unit, counter_account, bank_name, bank_account, id
    )
    res.json({ code: 0, data: { ok: true } })
  }
)

router.delete(
  '/cashier/journal/:id',
  operationLog('出纳日记账删除', '出纳管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM cashier_journal WHERE id=? AND account_set_id=?')
      .get(id, req.accountSetId)
    if (!existing) return res.status(404).json({ code: 404, message: '记录不存在' })
    db.prepare('DELETE FROM cashier_journal WHERE id=?').run(id)
    res.json({ code: 0, data: { ok: true } })
  }
)

// ── 银行对账单 ────────────────────────────────────────────
router.get('/cashier/bank-statement', (req: AuthRequest, res) => {
  const { account_code, start_date, end_date, matched } = req.query as Record<string, string>
  const db = getDb()
  const conds = ['account_set_id = ?']
  const params: any[] = [req.accountSetId]
  if (account_code) { conds.push('account_code = ?'); params.push(account_code) }
  if (start_date) { conds.push('biz_date >= ?'); params.push(start_date) }
  if (end_date) { conds.push('biz_date <= ?'); params.push(end_date) }
  if (matched !== undefined) { conds.push('matched = ?'); params.push(Number(matched)) }
  const rows = db
    .prepare(`SELECT * FROM bank_statement WHERE ${conds.join(' AND ')} ORDER BY biz_date, id`)
    .all(...params)
  res.json({ code: 0, data: rows })
})

router.post(
  '/cashier/bank-statement',
  operationLog('录入对账单', '出纳管理'),
  (req: AuthRequest, res) => {
    const { account_code, biz_date, debit = 0, credit = 0, settle_type, bill_no } = req.body
    if (!account_code || !biz_date) {
      return res.status(400).json({ code: 400, message: '科目编码和日期不能为空' })
    }
    const db = getDb()
    const id = uuidv4()
    db.prepare(
      `INSERT INTO bank_statement (id, account_set_id, account_code, biz_date, debit, credit, settle_type, bill_no, source)
       VALUES (?,?,?,?,?,?,?,?,'manual')`
    ).run(id, req.accountSetId, account_code, biz_date, Number(debit), Number(credit), settle_type || null, bill_no || null)
    res.json({ code: 0, data: { id } })
  }
)

// ── 银行自动对账 ──────────────────────────────────────────
router.post(
  '/cashier/reconcile/auto',
  operationLog('银行自动对账', '出纳管理'),
  (req: AuthRequest, res) => {
    const { account_code, start_date, end_date } = req.body
    if (!account_code) return res.status(400).json({ code: 400, message: '科目编码不能为空' })
    const result = autoReconcile({
      accountSetId: req.accountSetId || '',
      accountCode: account_code,
      startDate: start_date,
      endDate: end_date,
    })
    res.json({ code: 0, data: result })
  }
)

// ── 结算方式字典 ──────────────────────────────────────────
router.get('/cashier/settle-types', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare('SELECT code, name FROM settle_type WHERE account_set_id = ? ORDER BY code')
    .all(req.accountSetId || '')
  res.json({ code: 0, data: list })
})

export default router
