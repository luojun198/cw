import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.js'
import {
  listCashierAccounts,
  listJournal,
  autoReconcile,
  getBankReconciliation,
  getDailyReport,
  generateCashierVoucher,
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
  // 所有行共享同一个 init_date（账套级别），取第一条
  const initDate = list[0]?.init_date ?? null
  // 检查是否有对账记录（reconciled=1 的日记账）
  const hasReconciled = !!(db
    .prepare('SELECT 1 FROM cashier_journal WHERE account_set_id=? AND reconciled=1 LIMIT 1')
    .get(req.accountSetId || ''))
  res.json({ code: 0, data: { rows: list, init_date: initDate, locked: hasReconciled } })
})

router.put(
  '/cashier/init-balance',
  operationLog('出纳期初余额', '出纳管理'),
  (req: AuthRequest, res) => {
    const db = getDb()
    // 有对账记录则锁定
    const hasReconciled = !!(db
      .prepare('SELECT 1 FROM cashier_journal WHERE account_set_id=? AND reconciled=1 LIMIT 1')
      .get(req.accountSetId || ''))
    if (hasReconciled) {
      return res.status(400).json({ code: 400, message: '已有对账单据，不允许修改期初余额' })
    }

    const { account_code, currency = 'RMB', balance, init_date } = req.body
    if (!account_code || balance === undefined) {
      return res.status(400).json({ code: 400, message: '科目编码和余额不能为空' })
    }
    const existing = db
      .prepare('SELECT id FROM cashier_init_balance WHERE account_set_id=? AND account_code=? AND currency=?')
      .get(req.accountSetId, account_code, currency) as { id: string } | undefined
    if (existing) {
      db.prepare(
        "UPDATE cashier_init_balance SET balance=?, init_date=COALESCE(?,init_date), updated_at=datetime('now') WHERE id=?"
      ).run(Number(balance), init_date ?? null, existing.id)
    } else {
      db.prepare(
        'INSERT INTO cashier_init_balance (id, account_set_id, account_code, currency, balance, init_date) VALUES (?,?,?,?,?,?)'
      ).run(uuidv4(), req.accountSetId, account_code, currency, Number(balance), init_date ?? null)
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
      counter_account, bank_name, bank_account, unit_code, counter_aux_item_id,
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
         bank_name, bank_account, unit_code, counter_aux_item_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, req.accountSetId, account_code, currency, biz_date, seq, summary || null,
      Number(debit), Number(credit), settle_type || null, bill_no || null,
      counter_unit || null, counter_account || null, bank_name || null,
      bank_account || null, unit_code || null,
      counter_aux_item_id || null, (req as any).user?.name || null
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
    const auxProvided = 'counter_aux_item_id' in req.body
    const auxClause = auxProvided ? 'counter_aux_item_id=?,' : ''
    const auxParam: any[] = auxProvided ? [req.body.counter_aux_item_id || null] : []
    db.prepare(
      `UPDATE cashier_journal SET
        biz_date=COALESCE(?,biz_date), seq=COALESCE(?,seq), summary=COALESCE(?,summary),
        debit=COALESCE(?,debit), credit=COALESCE(?,credit),
        settle_type=COALESCE(?,settle_type), bill_no=COALESCE(?,bill_no),
        counter_unit=COALESCE(?,counter_unit), counter_account=COALESCE(?,counter_account),
        bank_name=COALESCE(?,bank_name), bank_account=COALESCE(?,bank_account),
        ${auxClause}
        updated_at=datetime('now')
       WHERE id=?`
    ).run(
      biz_date, seq, summary, debit != null ? Number(debit) : null,
      credit != null ? Number(credit) : null,
      settle_type, bill_no, counter_unit, counter_account, bank_name, bank_account,
      ...auxParam, id
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

// ── 银行余额调节表 ──────────────────────────────────────────

router.get('/cashier/reconciliation', (req: AuthRequest, res) => {
  const { account_code, end_date } = req.query as Record<string, string>
  if (!account_code || !end_date) {
    return res.status(400).json({ code: 400, message: '科目编码和截止日期不能为空' })
  }
  const data = getBankReconciliation({
    accountSetId: req.accountSetId || '',
    accountCode: account_code,
    endDate: end_date,
  })
  res.json({ code: 0, data })
})

// ── 出纳对账 → 生成凭证 ──────────────────────────────────

router.post(
  '/cashier/generate-voucher',
  operationLog('出纳生成凭证', '出纳管理'),
  (req: AuthRequest, res) => {
    const { account_code, start_date, end_date } = req.body
    if (!account_code) return res.status(400).json({ code: 400, message: '科目编码不能为空' })
    const db = getDb()
    const result = generateCashierVoucher({
      db,
      accountSetId: req.accountSetId || '',
      accountCode: account_code,
      startDate: start_date,
      endDate: end_date,
      makerName: (req as any).userName || '系统',
    })
    if ('error' in result) return res.status(400).json({ code: 400, message: result.error })
    res.json({ code: 0, data: result })
  }
)

// ── 出纳日报 ─────────────────────────────────────────────

router.get('/cashier/daily-report', (req: AuthRequest, res) => {
  const { date } = req.query as Record<string, string>
  if (!date) return res.status(400).json({ code: 400, message: '日期不能为空' })
  const data = getDailyReport({ accountSetId: req.accountSetId || '', date })
  res.json({ code: 0, data })
})

// ── 结算方式字典 ──────────────────────────────────────────
router.get('/cashier/settle-types', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare('SELECT code, name FROM settle_type WHERE account_set_id = ? ORDER BY code')
    .all(req.accountSetId || '')
  res.json({ code: 0, data: list })
})

// ── 出纳初始化（清理所有出纳数据） ───────────────────────
router.post(
  '/cashier/reset',
  operationLog('出纳初始化', '出纳管理'),
  (req: AuthRequest, res) => {
    const db = getDb()
    const asid = req.accountSetId || ''
    db.transaction(() => {
      db.prepare('DELETE FROM cashier_journal WHERE account_set_id=?').run(asid)
      db.prepare('DELETE FROM cashier_init_balance WHERE account_set_id=?').run(asid)
      db.prepare('DELETE FROM bank_statement WHERE account_set_id=?').run(asid)
    })()
    res.json({ code: 0, data: { ok: true } })
  }
)

export default router
