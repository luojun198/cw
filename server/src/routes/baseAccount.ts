import { Router } from 'express'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, operationLog, AppError } from '../middleware/index.js'
import { AccountService } from '../services/accountService.js'
import {
  getAccountRealtimeBalance,
  getAccountRealtimeAuxBalance,
  parseAuxBalanceSelections,
} from '../services/accountRealtimeBalance.js'

const router = Router()
router.use(authMiddleware)

// ===================== 会计科目 =====================

router.get('/accounts', (req: AuthRequest, res) => {
  const db = getDb()
  const service = new AccountService(db)
  const { parent_id, keyword, direction, level, is_enabled } = req.query

  const list = service.getAccounts({
    account_set_id: req.accountSetId || '',
    parent_id: typeof parent_id === 'string' ? parent_id : undefined,
    keyword: typeof keyword === 'string' ? keyword : undefined,
    direction: typeof direction === 'string' ? direction : undefined,
    level: level !== undefined && level !== '' ? Number(level) : undefined,
    is_enabled: is_enabled !== undefined && is_enabled !== '' ? Number(is_enabled) : undefined,
  })

  res.json({ code: 0, data: list })
})

// 检查科目是否被使用
router.get('/accounts/:id/usage', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const service = new AccountService(db)
  const usage = service.getAccountUsage(id)
  const childrenCount = service.countAllChildren(id)
  res.json({ code: 0, data: { ...usage, childrenCount } })
})

router.post('/accounts', operationLog('新增科目', '基础设置'), (req: AuthRequest, res) => {
  const {
    code,
    name,
    direction,
    level,
    parent_id,
    is_aux,
    aux_types,
    is_enabled,
    is_cash,
    is_bank,
    no_negative,
    migrate_from_parent,
  } = req.body

  if (!code || !name || !direction) {
    return res.status(400).json({ code: 400, message: '编码、名称、方向不能为空' })
  }

  const db = getDb()
  const service = new AccountService(db)

  if (service.isCodeExists(req.accountSetId || '', code)) {
    return res.status(400).json({ code: 400, message: '科目编码已存在' })
  }

  const id = service.createAccount({
    account_set_id: req.accountSetId || '',
    code,
    name,
    direction,
    level,
    parent_id,
    is_aux,
    aux_types,
    is_enabled,
    is_cash,
    is_bank,
    no_negative,
    migrate_from_parent,
  })

  res.json({ code: 0, message: '创建成功', data: { id } })
})

router.put('/accounts/:id', operationLog('修改科目', '基础设置'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { name, direction, is_aux, aux_types, is_enabled, is_cash, is_bank, no_negative } = req.body

  const db = getDb()
  const service = new AccountService(db)

  service.updateAccount(id, {
    name,
    direction,
    is_aux,
    aux_types,
    is_enabled,
    is_cash,
    is_bank,
    no_negative,
  })

  res.json({ code: 0, message: '更新成功' })
})

router.delete('/accounts/:id', operationLog('删除科目', '基础设置'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const service = new AccountService(db)

  try {
    service.deleteAccount(id)
    res.json({ code: 0, message: '删除成功' })
  } catch (error: any) {
    if (error.message === '科目不存在') {
      return res.status(404).json({ code: 404, message: error.message })
    }
    return res.status(400).json({ code: 400, message: error.message })
  }
})

// 查询科目余额（凭证录入时实时查询，依赖记账数据）
router.get('/accounts/:id/balance', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const year = Number(req.query.year) || new Date().getFullYear()
  const period = Number(req.query.period) || new Date().getMonth() + 1

  const row = db.prepare(`
    SELECT ab.init_balance, ab.current_debit, ab.current_credit, ab.end_balance, a.direction
    FROM accounts a
    LEFT JOIN account_balances ab ON ab.account_id = a.id AND ab.year = ? AND ab.period = ? AND ab.account_set_id = ?
    WHERE a.id = ?
  `).get(year, period, req.accountSetId || '', id) as any

  if (!row) {
    return res.json({ code: 0, data: { init_balance: 0, current_debit: 0, current_credit: 0, end_balance: 0, direction: null } })
  }

  res.json({ code: 0, data: row })
})

// 查询科目实时余额（不考虑记账因素，从期初余额+所有凭证分录汇总计算）
router.get('/accounts/:id/realtime-balance', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const year = Number(req.query.year) || new Date().getFullYear()
  const period = Number(req.query.period) || new Date().getMonth() + 1
  const accountSetId = req.accountSetId || ''

  const data = getAccountRealtimeBalance(db, {
    accountId: id,
    accountSetId,
    year,
    period,
  })

  if (!data) {
    return res.json({
      code: 0,
      data: { init_balance: 0, current_debit: 0, current_credit: 0, end_balance: 0, direction: null },
    })
  }

  res.json({ code: 0, data })
})

// 查询科目下各辅助项目的实时余额（selections=dept:id1,project:id2）
router.get('/accounts/:id/realtime-aux-balances', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const year = Number(req.query.year) || new Date().getFullYear()
  const period = Number(req.query.period) || new Date().getMonth() + 1
  const accountSetId = req.accountSetId || ''
  const selections = parseAuxBalanceSelections(req.query.selections as string | undefined)

  const acc = db
    .prepare('SELECT direction FROM accounts WHERE id=? AND account_set_id=?')
    .get(id, accountSetId) as { direction: 'debit' | 'credit' } | undefined
  if (!acc || selections.length === 0) {
    return res.json({ code: 0, data: [] })
  }

  const itemNameStmt = db.prepare('SELECT name FROM aux_items WHERE id=? AND account_set_id=?')

  const balances = selections.map(sel => {
    const row = getAccountRealtimeAuxBalance(db, {
      accountId: id,
      accountSetId,
      year,
      period,
      categoryCode: sel.categoryCode,
      itemId: sel.itemId,
      accountDirection: acc.direction,
    })
    const itemRow = itemNameStmt.get(sel.itemId, accountSetId) as { name: string } | undefined
    row.item_name = itemRow?.name || ''
    return row
  })

  res.json({ code: 0, data: balances })
})

// ===================== 现金流向项目 =====================

router.get('/cash-flow-items', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db.prepare('SELECT code, name FROM cash_flow_items ORDER BY code').all()
  res.json({ code: 0, data: list })
})

// 检查并补充缺失的父科目
export default router
