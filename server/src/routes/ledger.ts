import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/index.js'
import { getDb } from '../db/index.js'
import {
  buildCashJournalQuery,
  buildChronologicalQuery,
  buildGeneralLedgerQuery,
  buildLedgerBalanceQuery,
  buildLedgerDetailQuery,
  buildLedgerGeneralQuery,
  supplementMissingParents,
  accumulateParentBalances,
  accumulateParentBalancesWithMonths,
  supplementMissingParentsWithMonths,
  getCodeLengths,
} from '../services/ledgerQuery.js'
import {
  buildAuxFieldValuesSelect,
  appendAuxItemMatchParams,
  buildAuxIdSelect,
  buildAuxItemLookup,
  buildAuxItemMatchCondition,
  buildAuxMatchOptions,
  buildAuxNameSelect,
  enrichAuxLedgerEntry,
} from '../utils/auxLedgerQuery.js'
import {
  applyEntryToSignedBalance,
  buildSignedEntryAmountSql,
  calcInitBalanceFromDebitCredit,
} from '../utils/accountBalance.js'
import {
  getCashFlowTrialBalance,
  type CashFlowTrialBalanceScope,
} from '../services/cashFlowTrialBalance.js'
import { getCashFlowVoucherCheck } from '../services/cashFlowVoucherCheck.js'
import { isCashFlowEnabledForAccountSet } from '../services/voucherEntry.js'
import {
  appendAccountScopeCondition,
  assertAccountCodePrefixInScope,
  assertAccountIdInScope,
  filterLedgerRowsByScope,
} from '../services/accountAuthorization.js'
import { MAX_AUX_BALANCE_ITEMS, AUX_BALANCE_ITEM_BATCH, MAX_PAGE_SIZE, parsePageSizeParam } from '../utils/listLimits.js'

const router = Router()
router.use(authMiddleware)

// ===================== 总账 =====================

router.get('/general', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    start_date,
    end_date,
    account_code,
    account_level,
    account_code_start,
    account_code_end,
    filter_types,
    include_unposted,
  } = req.query
  const maxLevel = account_level ? Number(account_level) : undefined

  // 将逗号分隔的字符串转为数组
  let filterTypesArray: string[] | undefined
  if (filter_types && typeof filter_types === 'string') {
    filterTypesArray = filter_types.split(',').filter(t => t.trim())
  }

  const query = buildLedgerGeneralQuery({
    accountSetId: req.accountSetId || '',
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    accountCode: account_code as string | undefined,
    accountLevel: undefined, // 不限制级次，确保子科目能正确汇总到父科目
    accountCodeStart: account_code_start as string | undefined,
    accountCodeEnd: account_code_end as string | undefined,
    filterTypes: undefined,
    includeUnposted: include_unposted === 'true',
    accountScope: req.accountScope,
  })

  let list = db.prepare(query.sql).all(...query.params) as any[]

  // 获取科目编码长度配置
  const codeLengths = getCodeLengths(db, req.accountSetId || '')

  // 补充缺失的父科目
  list = supplementMissingParents(list, db, req.accountSetId || '', codeLengths)

  // 将子科目金额汇总到父科目
  list = accumulateParentBalances(list, codeLengths)
  list = filterLedgerRowsByScope(req.accountScope, list)

  // 汇总完成后，再应用筛选条件
  if (filterTypesArray && filterTypesArray.length > 0) {
    list = list.filter(row => {
      const conditions: boolean[] = []

      if (filterTypesArray.includes('init_balance')) {
        conditions.push(row.init_balance !== 0)
      }

      if (filterTypesArray.includes('has_amount')) {
        conditions.push(row.current_debit !== 0 || row.current_credit !== 0)
      }

      if (filterTypesArray.includes('has_balance')) {
        conditions.push(row.end_balance !== 0)
      }

      return conditions.length === 0 || conditions.some(c => c)
    })
  }

  // 如果指定了科目级次，在汇总计算完成后过滤展示
  if (maxLevel) {
    list = list.filter(row => row.level <= maxLevel)
  }

  res.json({ code: 0, data: list })
})

// ===================== 明细账 =====================

router.get('/detail', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    year,
    period,
    account_id,
    start_date,
    end_date,
    aux_type,
    aux_id,
    voucher_type_id,
    maker_name,
    auditor_name,
    summary_keyword,
    min_amount,
    max_amount,
    account_code_start,
    account_code_end,
    include_unposted,
    page = 1,
    pageSize = 100,
  } = req.query

  if (account_id && typeof account_id === 'string') {
    const scopeErr = assertAccountIdInScope(req.accountScope, account_id)
    if (scopeErr) {
      return res.status(403).json({ code: 403, message: scopeErr })
    }
  }

  const query = buildLedgerDetailQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    accountId: account_id as string | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    auxType: aux_type as string | undefined,
    auxId: aux_id as string | undefined,
    voucherTypeId: voucher_type_id as string | undefined,
    makerName: maker_name as string | undefined,
    auditorName: auditor_name as string | undefined,
    summaryKeyword: summary_keyword as string | undefined,
    minAmount: min_amount ? Number(min_amount) : undefined,
    maxAmount: max_amount ? Number(max_amount) : undefined,
    accountCodeStart: account_code_start as string | undefined,
    accountCodeEnd: account_code_end as string | undefined,
    includeUnposted: include_unposted === 'true',
    page: Number(page),
    pageSize: Number(pageSize),
    accountScope: req.accountScope,
  })

  const initBal = db.prepare(query.initBalanceSql).get(...query.initBalanceParams) as any
  const total = (db.prepare(query.countSql).get(...query.countParams) as any).count
  const entries = db.prepare(query.listSql).all(...query.listParams)

  res.json({
    code: 0,
    data: entries,
    initBalance: initBal?.init_balance || 0,
    total
  })
})

// ===================== 余额表 =====================

router.get('/balance', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = req.query

  // 不传递 filterTypes，我们在汇总后再过滤
  const query = buildLedgerBalanceQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    accountScope: req.accountScope,
  })
  let list = db.prepare(query.sql).all(...query.params) as any[]

  // 去重：如果同一个科目出现多次，合并它们的金额
  const deduplicatedMap = new Map<string, any>()
  list.forEach(row => {
    if (deduplicatedMap.has(row.account_code)) {
      // 如果已存在，合并金额
      const existing = deduplicatedMap.get(row.account_code)
      existing.init_balance = (existing.init_balance || 0) + (row.init_balance || 0)
      existing.current_debit = (existing.current_debit || 0) + (row.current_debit || 0)
      existing.current_credit = (existing.current_credit || 0) + (row.current_credit || 0)
      existing.end_balance = (existing.end_balance || 0) + (row.end_balance || 0)
    } else {
      deduplicatedMap.set(row.account_code, { ...row })
    }
  })
  list = Array.from(deduplicatedMap.values())

  const codeLengths = getCodeLengths(db, req.accountSetId || '')
  list = supplementMissingParents(list, db, req.accountSetId || '', codeLengths)
  list = accumulateParentBalances(list, codeLengths)
  list = filterLedgerRowsByScope(req.accountScope, list)

  const summary = {
    totalInitDebit: 0,
    totalInitCredit: 0,
    totalDebit: 0,
    totalCredit: 0,
    totalEndDebit: 0,
    totalEndCredit: 0,
  }
  for (const row of list as any[]) {
    if (row.init_balance > 0) {
      if (row.direction === 'debit') summary.totalInitDebit += row.init_balance
      else summary.totalInitCredit += row.init_balance
    } else if (row.init_balance < 0) {
      // 负数余额反向显示
      if (row.direction === 'debit') summary.totalInitCredit += Math.abs(row.init_balance)
      else summary.totalInitDebit += Math.abs(row.init_balance)
    }
    summary.totalDebit += row.current_debit
    summary.totalCredit += row.current_credit
    if (row.end_balance > 0) {
      if (row.direction === 'debit') summary.totalEndDebit += row.end_balance
      else summary.totalEndCredit += row.end_balance
    } else if (row.end_balance < 0) {
      // 负数余额反向显示
      if (row.direction === 'debit') summary.totalEndCredit += Math.abs(row.end_balance)
      else summary.totalEndDebit += Math.abs(row.end_balance)
    }
  }

  res.json({ code: 0, data: list, summary })
})

// ===================== 总分类账（带月度汇总） =====================

router.get('/general-ledger', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, account_code, account_level, include_unposted } = req.query
  const maxLevel = account_level ? Number(account_level) : undefined

  // 注意：不传 accountLevel 给 SQL 查询，确保所有级次的科目都被查询到
  // 这样才能正确汇总子科目到父科目，级次过滤在汇总计算完成后进行
  const query = buildGeneralLedgerQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    accountCode: account_code as string | undefined,
    accountLevel: undefined, // 不限制级次，查询所有科目用于汇总计算
    includeUnposted: include_unposted === 'true',
    accountScope: req.accountScope,
  })

  let list = db.prepare(query.sql).all(...query.params)

  // 去重：如果同一个科目出现多次，合并它们的金额
  const deduplicatedMap = new Map<string, any>()
  ;(list as any[]).forEach(row => {
    if (deduplicatedMap.has(row.account_code)) {
      // 如果已存在，合并金额
      const existing = deduplicatedMap.get(row.account_code)
      existing.init_balance = (existing.init_balance || 0) + (row.init_balance || 0)
      // 合并12个月的借贷方发生额
      for (let m = 1; m <= 12; m++) {
        existing[`month${m}_debit`] = (existing[`month${m}_debit`] || 0) + (row[`month${m}_debit`] || 0)
        existing[`month${m}_credit`] = (existing[`month${m}_credit`] || 0) + (row[`month${m}_credit`] || 0)
      }
    } else {
      deduplicatedMap.set(row.account_code, { ...row })
    }
  })
  list = Array.from(deduplicatedMap.values())

  const codeLengths = getCodeLengths(db, req.accountSetId || '')
  list = supplementMissingParentsWithMonths(list, db, req.accountSetId || '', codeLengths)
  list = accumulateParentBalancesWithMonths(list, codeLengths)
  list = filterLedgerRowsByScope(req.accountScope, list)

  // 计算累计和期末余额
  const result = (list as any[]).map(row => {
    // 计算本年累计借方和贷方
    let yearDebit = 0
    let yearCredit = 0
    for (let m = 1; m <= 12; m++) {
      yearDebit += (row[`month${m}_debit`] || 0)
      yearCredit += (row[`month${m}_credit`] || 0)
    }

    // 计算期末余额
    let endBalance = row.init_balance
    if (row.direction === 'debit') {
      endBalance += yearDebit - yearCredit
    } else {
      endBalance += yearCredit - yearDebit
    }

    return {
      ...row,
      year_debit: yearDebit,
      year_credit: yearCredit,
      end_balance: endBalance,
    }
  })

  // 如果指定了科目级次，在汇总计算完成后过滤展示
  let finalData = result
  if (maxLevel) {
    finalData = (result as any[]).filter(row => row.level <= maxLevel)
  }

  // 合计计算：统一按"叶节点"——数据集中没有任何子项以本科目编码为前缀。
  // 不分级次单独处理，避免"展开到 N 级但实际数据没那么深"时漏掉行（如展开到
  // 3 级但所有科目最深只到 2 级，按 level===3 过滤就空了）。
  const leafData = finalData.filter(
    (row: any) =>
      !finalData.some((r: any) => r.account_code !== row.account_code && r.account_code.startsWith(row.account_code))
  )
  const summary: any = {
    totalInitDebit: 0,
    totalInitCredit: 0,
    totalMonthDebit: {},
    totalMonthCredit: {},
    totalYearDebit: 0,
    totalYearCredit: 0,
    totalEndDebit: 0,
    totalEndCredit: 0,
  }

  // 初始化月度合计
  for (let m = 1; m <= 12; m++) {
    summary.totalMonthDebit[m] = 0
    summary.totalMonthCredit[m] = 0
  }

  for (const row of leafData) {
    // 期初余额
    if (row.init_balance > 0) {
      if (row.direction === 'debit') summary.totalInitDebit += row.init_balance
      else summary.totalInitCredit += row.init_balance
    } else if (row.init_balance < 0) {
      if (row.direction === 'debit') summary.totalInitCredit += Math.abs(row.init_balance)
      else summary.totalInitDebit += Math.abs(row.init_balance)
    }

    // 月度发生额
    for (let m = 1; m <= 12; m++) {
      summary.totalMonthDebit[m] += (row[`month${m}_debit`] || 0)
      summary.totalMonthCredit[m] += (row[`month${m}_credit`] || 0)
    }

    // 本年累计
    summary.totalYearDebit += row.year_debit
    summary.totalYearCredit += row.year_credit

    // 期末余额
    if (row.end_balance > 0) {
      if (row.direction === 'debit') summary.totalEndDebit += row.end_balance
      else summary.totalEndCredit += row.end_balance
    } else if (row.end_balance < 0) {
      if (row.direction === 'debit') summary.totalEndCredit += Math.abs(row.end_balance)
      else summary.totalEndDebit += Math.abs(row.end_balance)
    }
  }

  const y = Number(year) || new Date().getFullYear()
  const voucherStatusCondition = include_unposted === 'true'
    ? "v.status IN ('draft', 'audited', 'posted')"
    : "v.status = 'posted'"
  const lastMonthRow = db
    .prepare(
      `
      SELECT MAX(CAST(strftime('%m', v.voucher_date) AS INTEGER)) as last_month
      FROM vouchers v
      WHERE v.account_set_id = ?
        AND ${voucherStatusCondition}
        AND v.voucher_date >= ?
        AND v.voucher_date <= ?
    `
    )
    .get(req.accountSetId, `${y}-01-01`, `${y}-12-31`) as { last_month: number | null } | undefined
  const lastActiveMonth = lastMonthRow?.last_month ? Number(lastMonthRow.last_month) : 0

  res.json({ code: 0, data: finalData, summary, lastActiveMonth })
})

// ===================== 日记账 =====================

router.get('/cash-journal', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    year,
    period,
    start_date,
    end_date,
    account_id,
    account_type,
    direction,
    min_amount,
    max_amount,
    opposite_account_code,
    include_unposted,
    page = 1,
    pageSize = 100,
  } = req.query

  // 未指定科目范围时不查询全账套，避免误解为「全部科目日记账」
  if (!account_id && !account_type) {
    return res.json({ code: 0, data: [], total: 0, initBalance: 0 })
  }

  if (account_id && typeof account_id === 'string') {
    const scopeErr = assertAccountIdInScope(req.accountScope, account_id)
    if (scopeErr) {
      return res.status(403).json({ code: 403, message: scopeErr })
    }
  }

  const query = buildCashJournalQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    accountId: account_id as string | undefined,
    accountType: account_type as string | undefined,
    direction: direction as string | undefined,
    minAmount: min_amount ? Number(min_amount) : undefined,
    maxAmount: max_amount ? Number(max_amount) : undefined,
    oppositeAccountCode: opposite_account_code as string | undefined,
    includeUnposted: include_unposted === 'true',
    page: Number(page),
    pageSize: Number(pageSize),
    accountScope: req.accountScope,
  })

  const total = (db.prepare(query.countSql).get(...query.countParams) as any).count
  const list = db.prepare(query.listSql).all(...query.listParams)
  const initBal = db.prepare(query.initBalanceSql).get(...query.initBalanceParams) as any
  const carryAmount = db.prepare(query.carryAmountSql).get(...query.carryAmountParams) as any
  let runningBalance = (initBal?.init_balance || 0) + (carryAmount?.carry_amount || 0)

  for (const entry of list as any[]) {
    const accountDirection = entry.account_direction === 'credit' ? 'credit' : 'debit'
    runningBalance = applyEntryToSignedBalance(
      runningBalance,
      entry.amount,
      entry.direction,
      accountDirection
    )
    entry.running_balance = runningBalance
  }

  res.json({ code: 0, data: list, total, initBalance: initBal?.init_balance || 0 })
})

// ===================== 序时账 =====================

router.get('/chronological', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    year,
    period,
    start_date,
    end_date,
    include_unposted,
    summary_keyword,
    min_amount,
    max_amount,
    maker_name,
    auditor_name,
    page = 1,
    pageSize = 100,
  } = req.query

  const query = buildChronologicalQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    includeUnposted: include_unposted === 'true',
    summaryKeyword: summary_keyword as string | undefined,
    minAmount: min_amount as string | number | undefined,
    maxAmount: max_amount as string | number | undefined,
    makerName: maker_name as string | undefined,
    auditorName: auditor_name as string | undefined,
    page: Number(page),
    pageSize: Number(pageSize),
    accountScope: req.accountScope,
  })

  const total = (db.prepare(query.countSql).get(...query.countParams) as any).count
  const list = db.prepare(query.listSql).all(...query.listParams)
  res.json({ code: 0, data: list, total })
})

// ===================== 辅助项目余额表 =====================

router.post('/aux-balance', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    aux_category_ids,
    aux_ids,
    start_date,
    end_date,
    account_code,
    include_unposted,
    page,
    pageSize,
    item_offset,
    item_limit,
    summary_only,
    skip_summary,
  } = req.body
  const accountSetId = req.accountSetId!

  const itemOffset = Math.max(0, Number(item_offset) || 0)
  const itemLimitProvided = item_limit !== undefined && item_limit !== null && item_limit !== ''
  const itemLimitNum = itemLimitProvided ? Math.max(0, Number(item_limit) || 0) : null
  const metaOnly = itemLimitNum === 0
  const summaryOnly = summary_only === true || summary_only === 'true'
  const skipSummary = skip_summary === true || skip_summary === 'true'
  const chunkedMode = itemLimitProvided && itemLimitNum !== null && itemLimitNum > 0

  // 参数验证：aux_category_ids 必填，aux_ids 可选（不传时查类别下所有项目）
  if (!aux_category_ids) {
    return res.status(400).json({ code: 1, error: '缺少必要参数：aux_category_ids' })
  }

  const rawCategoryIdArray = (aux_category_ids as string).split(',').filter(id => id.trim())
  const auxIdArray = aux_ids ? (aux_ids as string).split(',').filter(id => id.trim()) : []

  if (rawCategoryIdArray.length === 0) {
    return res.status(400).json({ code: 1, error: '辅助类别不能为空' })
  }

  if (account_code) {
    const codeErr = assertAccountCodePrefixInScope(
      db,
      req.accountScope,
      accountSetId,
      String(account_code)
    )
    if (codeErr) {
      return res.status(403).json({ code: 403, message: codeErr })
    }
  }

  // 现金流量项目本质是凭证级标签而非辅助核算项目，从辅助账簿中剔除（兜底，防止前端漏过滤）
  const cfRows = db
    .prepare(`SELECT id FROM aux_categories WHERE code = 'cash_flow' AND account_set_id = ?`)
    .all(accountSetId) as { id: string }[]
  const cashFlowCatIds = new Set(cfRows.map(r => r.id))
  const categoryIdArray = rawCategoryIdArray.filter(id => !cashFlowCatIds.has(id))

  if (categoryIdArray.length === 0) {
    return res.json({ code: 0, data: [], categoryFields: {}, total: 0, totals: null })
  }

  // 兼容布尔值和字符串
  const statusValue = (include_unposted === true || include_unposted === 'true')
    ? ['draft', 'audited', 'posted']
    : ['posted']

  const startTime = Date.now()
  const catPlaceholders = categoryIdArray.map(() => '?').join(',')

  // 查询自定义字段定义（meta / 正式查询均需要）
  const fieldDefs = db.prepare(`
    SELECT f.category_id, f.field_key, f.field_name, f.sort_order
    FROM aux_category_fields f
    WHERE f.category_id IN (${catPlaceholders}) AND f.is_enabled = 1
    ORDER BY f.category_id, f.sort_order
  `).all(...categoryIdArray) as any[]

  const categoryMeta = db.prepare(`
    SELECT id, code, name FROM aux_categories WHERE id IN (${catPlaceholders})
  `).all(...categoryIdArray) as any[]

  const categoryFields: Record<string, { name: string; fields: { field_key: string; field_name: string }[] }> = {}
  const categoryNameByCode = new Map<string, string>()
  const categoryIdByCode = new Map<string, string>()
  for (const cat of categoryMeta) {
    categoryNameByCode.set(cat.code, cat.name)
    categoryIdByCode.set(cat.code, cat.id)
    categoryFields[cat.code] = {
      name: cat.name,
      fields: fieldDefs.filter(f => f.category_id === cat.id).map(f => ({ field_key: f.field_key, field_name: f.field_name })),
    }
  }

  const itemsCountRow = db
    .prepare(
      `SELECT COUNT(*) as count FROM aux_items ai WHERE ai.type IN (${catPlaceholders}) AND ai.account_set_id = ?`
    )
    .get(...categoryIdArray, accountSetId) as { count: number }
  const itemsTotal = auxIdArray.length > 0 ? auxIdArray.length : (itemsCountRow?.count ?? 0)

  if (metaOnly) {
    return res.json({
      code: 0,
      data: [],
      total: 0,
      items_total: itemsTotal,
      categoryFields,
      totals: null,
    })
  }

  try {
    // 查询辅助项目信息（同样剔除属于 cash_flow 类目的项目）
    let items: any[]
    if (auxIdArray.length > 0) {
      const itemsPlaceholders = auxIdArray.map(() => '?').join(',')
      const itemsSql = `
        SELECT ai.id, ai.code, ai.name, ai.type as category_id, ac.code as category_code, ac.name as category_name
        FROM aux_items ai
        LEFT JOIN aux_categories ac ON ac.id = ai.type
        WHERE ai.id IN (${itemsPlaceholders}) AND ai.account_set_id = ?
          AND (ac.code IS NULL OR ac.code != 'cash_flow')
      `
      items = db.prepare(itemsSql).all(...auxIdArray, accountSetId) as any[]
    } else if (summaryOnly && auxIdArray.length === 0) {
      items = []
    } else if (chunkedMode || summaryOnly) {
      const limit = summaryOnly ? itemsTotal : Math.min(itemLimitNum!, AUX_BALANCE_ITEM_BATCH)
      const itemsSql = `
        SELECT ai.id, ai.code, ai.name, ai.type as category_id, ac.code as category_code, ac.name as category_name
        FROM aux_items ai
        LEFT JOIN aux_categories ac ON ac.id = ai.type
        WHERE ai.type IN (${catPlaceholders}) AND ai.account_set_id = ?
          AND (ac.code IS NULL OR ac.code != 'cash_flow')
        ORDER BY ac.code, ai.code
        LIMIT ? OFFSET ?
      `
      items = db.prepare(itemsSql).all(...categoryIdArray, accountSetId, limit, itemOffset) as any[]
    } else {
      const itemLimit = Math.min(itemsTotal, MAX_AUX_BALANCE_ITEMS)
      const itemsSql = `
        SELECT ai.id, ai.code, ai.name, ai.type as category_id, ac.code as category_code, ac.name as category_name
        FROM aux_items ai
        LEFT JOIN aux_categories ac ON ac.id = ai.type
        WHERE ai.type IN (${catPlaceholders}) AND ai.account_set_id = ?
          AND (ac.code IS NULL OR ac.code != 'cash_flow')
        ORDER BY ac.code, ai.code
        LIMIT ${itemLimit}
      `
      items = db.prepare(itemsSql).all(...categoryIdArray, accountSetId) as any[]
      if (itemsTotal > itemLimit) {
        console.warn(
          `辅助项目余额表：类别下共 ${itemsTotal} 个项目，本次仅处理前 ${itemLimit} 个，请使用分批加载或指定 aux_ids`
        )
      }
    }

    if (items.length === 0 && !summaryOnly) {
      return res.json({
        code: 0,
        data: [],
        categoryFields,
        total: 0,
        items_total: itemsTotal,
        items_processed: Math.min(itemOffset + (itemLimitNum ?? 0), itemsTotal),
        totals: null,
      })
    }

    if (!summaryOnly) {
      console.log(`辅助项目余额表：本批处理 ${items.length} 个辅助项目（offset=${itemOffset}）`)
    }

    const auxLookup = buildAuxItemLookup(items)

    // 按类别分组辅助项目
    const itemsByCategory = new Map<string, any[]>()
    for (const item of items) {
      if (!item.category_code) continue
      if (!itemsByCategory.has(item.category_code)) {
        itemsByCategory.set(item.category_code, [])
      }
      itemsByCategory.get(item.category_code)!.push(item)
    }

    const allDetails: any[] = []
    const statusPlaceholders = statusValue.map(() => '?').join(',')
    if (!summaryOnly) {

    for (const [categoryCode, categoryItems] of itemsByCategory) {
      // SQLite 参数限制为 999，分批查询
      // SQLite 参数上限 999，每个辅助项目最多生成 ~5 个 SQL 参数
      // （JSON 双 key + legacy 列 + 编码匹配），加上基础参数约 20 个，
      // 安全批次 = floor((999 - 20) / 5) ≈ 195，取 150 留余量
      const batchSize = 150
      for (let i = 0; i < categoryItems.length; i += batchSize) {
        const batch = categoryItems.slice(i, i + batchSize)
        const itemIds = batch.map(item => item.id)
        const itemIdsPlaceholders = itemIds.map(() => '?').join(',')
        const matchOpts = buildAuxMatchOptions(categoryCode, categoryIdByCode, batch)
        const auxMatchCondition = buildAuxItemMatchCondition(categoryCode, itemIdsPlaceholders, matchOpts)

        const baseConditions = [
          've.account_set_id = ?',
          `v.status IN (${statusPlaceholders})`,
          auxMatchCondition,
        ]
        const baseParams: any[] = [accountSetId, ...statusValue]
        appendAuxItemMatchParams(baseParams, categoryCode, itemIds, matchOpts)

        if (account_code) {
          baseConditions.push('ve.account_code LIKE ?')
          baseParams.push(`${account_code}%`)
        }

        appendAccountScopeCondition(req.accountScope, 've.account_id', baseConditions, baseParams)

        const signedEntryAmount = buildSignedEntryAmountSql('a.direction', 've.direction', 've.amount')
        const sql = `
          SELECT
            ve.account_code,
            ve.account_name,
            a.direction as account_direction,
            ${buildAuxIdSelect(categoryCode, categoryIdByCode.get(categoryCode))} as aux_id,
            ${buildAuxNameSelect(categoryCode, categoryIdByCode.get(categoryCode))} as aux_name,
            MAX(${buildAuxFieldValuesSelect(categoryCode, categoryIdByCode.get(categoryCode))}) as field_values_json,
            '${categoryCode}' as category_code,
            COALESCE(SUM(CASE
              WHEN v.voucher_date < ? THEN ${signedEntryAmount}
              ELSE 0
            END), 0) as init_balance,
            COALESCE(SUM(CASE
              WHEN v.voucher_date >= ? AND v.voucher_date <= ? AND ve.direction = 'debit'
              THEN ve.amount ELSE 0
            END), 0) as current_debit,
            COALESCE(SUM(CASE
              WHEN v.voucher_date >= ? AND v.voucher_date <= ? AND ve.direction = 'credit'
              THEN ve.amount ELSE 0
            END), 0) as current_credit,
            COALESCE(SUM(CASE
              WHEN v.voucher_date <= ? THEN ${signedEntryAmount}
              ELSE 0
            END), 0) as end_balance
          FROM voucher_entries ve
          JOIN vouchers v ON v.id = ve.voucher_id
          JOIN accounts a ON a.id = ve.account_id
          WHERE ${baseConditions.join(' AND ')}
          GROUP BY ve.account_code, ve.account_name, a.direction, aux_id, aux_name
          HAVING init_balance != 0 OR current_debit != 0 OR current_credit != 0 OR end_balance != 0
          ORDER BY ve.account_code, aux_name
        `

        const balanceParams = [
          start_date || '1900-01-01',
          start_date || '1900-01-01',
          end_date || '9999-12-31',
          start_date || '1900-01-01',
          end_date || '9999-12-31',
          end_date || '9999-12-31',
          ...baseParams,
        ]

        const batchResults = db.prepare(sql).all(...balanceParams) as any[]
        for (const row of batchResults) {
          enrichAuxLedgerEntry(row, categoryCode, categoryNameByCode, auxLookup)
        }
        allDetails.push(...batchResults)
      }
    }
    }

    if (!summaryOnly) {
      console.log(`辅助项目余额表：查询到 ${allDetails.length} 条凭证明细数据`)
    }

    // ===== 合并 init_balances 表中的辅助期初 =====
    const initYear = start_date ? new Date(start_date).getFullYear() : new Date().getFullYear()
    const auxInitMergeKey = (accountCode: string, categoryCode: string, auxId: string) =>
      `${accountCode}|${categoryCode}|${auxId}`
    const detailKeyMap = new Map<string, any>()
    if (!summaryOnly) {
      for (const d of allDetails) {
        detailKeyMap.set(auxInitMergeKey(d.account_code, d.category_code, String(d.aux_id || '')), d)
      }
    }

    const accountCodeFilter = account_code ? ` AND a.code LIKE ?` : ''
    const initBalanceSql = `
      SELECT a.code as account_code, a.name as account_name, a.direction,
             ib.aux_item_id, ib.init_balance, ib.init_debit, ib.init_credit
      FROM init_balances ib
      JOIN accounts a ON a.id = ib.account_id
      WHERE ib.account_set_id = ? AND ib.year = ? AND ib.aux_item_id != ''
      ${accountCodeFilter}
    `
    const initBalanceParams: any[] = [accountSetId, initYear]
    if (account_code) initBalanceParams.push(`${account_code}%`)
    const auxInitRows = db.prepare(initBalanceSql).all(...initBalanceParams) as any[]

    const itemNameById = new Map<string, { name: string; categoryCode: string }>()
    for (const it of items) {
      itemNameById.set(String(it.id), { name: it.name, categoryCode: it.category_code })
    }

    const selectedCategoryCodes = new Set(Array.from(itemsByCategory.keys()))
    const selectedCategoryFilterCodes = new Set(categoryMeta.map((c: any) => c.code))
    const selectedItemIdsByCat = new Map<string, Set<string>>()
    for (const [code, arr] of itemsByCategory) {
      selectedItemIdsByCat.set(code, new Set(arr.map((it: any) => String(it.id))))
    }
    const restrictItemIds = auxIdArray.length > 0 || (chunkedMode && !summaryOnly)

    if (!summaryOnly) {
    for (const row of auxInitRows) {
      const parts = row.aux_item_id.split('|')
      // aux_item_id 单类目格式 `code:itemId`，组合格式 `code1:id1|code2:id2`
      // 取每个部分分别处理（与多类目分标签录入一致）
      for (const part of parts) {
        const idx = part.indexOf(':')
        if (idx <= 0) continue
        const categoryCode = part.slice(0, idx)
        const itemId = part.slice(idx + 1)
        if (!selectedCategoryCodes.has(categoryCode)) continue
        if (restrictItemIds) {
          const allowedIds = selectedItemIdsByCat.get(categoryCode)
          if (!allowedIds || !allowedIds.size || !allowedIds.has(itemId)) continue
        }

        const initDebit = row.init_debit || 0
        const initCredit = row.init_credit || 0
        const initBalance = calcInitBalanceFromDebitCredit(
          row.direction === 'credit' ? 'credit' : 'debit',
          initDebit,
          initCredit,
          row.init_balance
        )
        const key = auxInitMergeKey(row.account_code, categoryCode, itemId)
        const existing = detailKeyMap.get(key)
        if (existing) {
          existing.init_balance = (existing.init_balance || 0) + initBalance
          existing.end_balance = (existing.end_balance || 0) + initBalance
        } else {
          const itemMeta = itemNameById.get(itemId)
          const newDetail = {
            account_code: row.account_code,
            account_name: row.account_name,
            account_direction: row.direction === 'credit' ? 'credit' : 'debit',
            aux_id: itemId,
            aux_name: itemMeta?.name || '',
            field_values_json: null,
            category_code: categoryCode,
            init_balance: initBalance,
            current_debit: 0,
            current_credit: 0,
            end_balance: initBalance,
          }
          allDetails.push(newDetail)
          detailKeyMap.set(key, newDetail)
        }
      }
    }
    }

    if (!summaryOnly) {
      console.log(`辅助项目余额表：合并辅助期初 ${auxInitRows.length} 条，合计 ${allDetails.length} 条明细`)
    }

    let grandTotals = {
      init_balance: 0,
      current_debit: 0,
      current_credit: 0,
      end_balance: 0,
    }

    if (!skipSummary) {
    // ===== 独立查询科目汇总行余额（临时表去重，避免多类目重复计算同一分录）=====
    // 当用户选多个辅助类目时，同一条分录可能命中多个类目查询（如既有 dept 又有 person 标签），
    // 若直接把明细行加总会导致同一笔金额被多次累加。
    // 用临时表收集所有匹配的 voucher_entry ID（自动去重），再做科目维度汇总，
    // 同时避免 OR 合并所有类目条件导致 SQL 参数超过 SQLite 999 上限。
    db.exec('CREATE TEMP TABLE IF NOT EXISTS _tmp_aux_entry_ids (entry_id TEXT)')
    db.exec('DELETE FROM _tmp_aux_entry_ids')

    const insertEntryId = db.prepare('INSERT INTO _tmp_aux_entry_ids (entry_id) VALUES (?)')
    const summaryBatchSize = 150

    const fillTempTableForCategoryItems = (catCode: string, catItems: any[]) => {
      for (let i = 0; i < catItems.length; i += summaryBatchSize) {
        const batch = catItems.slice(i, i + summaryBatchSize)
        const ids = batch.map((it: any) => it.id)
        const ph = ids.map(() => '?').join(',')
        const matchOpts = buildAuxMatchOptions(catCode, categoryIdByCode, batch)
        const auxCond = buildAuxItemMatchCondition(catCode, ph, matchOpts)

        const conds = [
          've.account_set_id = ?',
          `v.status IN (${statusPlaceholders})`,
          auxCond,
        ]
        const params: any[] = [accountSetId, ...statusValue]
        appendAuxItemMatchParams(params, catCode, ids, matchOpts)

        if (account_code) {
          conds.push('ve.account_code LIKE ?')
          params.push(`${account_code}%`)
        }
        appendAccountScopeCondition(req.accountScope, 've.account_id', conds, params)

        const selectSql = `
          SELECT DISTINCT ve.id
          FROM voucher_entries ve
          JOIN vouchers v ON v.id = ve.voucher_id
          WHERE ${conds.join(' AND ')}
        `
        const entryRows = db.prepare(selectSql).all(...params) as { id: string }[]
        const insertMany = db.transaction((rows: { id: string }[]) => {
          for (const row of rows) {
            insertEntryId.run(row.id)
          }
        })
        insertMany(entryRows)
      }
    }

    if (summaryOnly && auxIdArray.length === 0) {
      for (let offset = 0; offset < itemsTotal; offset += AUX_BALANCE_ITEM_BATCH) {
        const batchItems = db
          .prepare(
            `SELECT ai.id, ai.code, ai.name, ai.type as category_id, ac.code as category_code, ac.name as category_name
             FROM aux_items ai
             LEFT JOIN aux_categories ac ON ac.id = ai.type
             WHERE ai.type IN (${catPlaceholders}) AND ai.account_set_id = ?
               AND (ac.code IS NULL OR ac.code != 'cash_flow')
             ORDER BY ac.code, ai.code
             LIMIT ? OFFSET ?`
          )
          .all(...categoryIdArray, accountSetId, AUX_BALANCE_ITEM_BATCH, offset) as any[]
        const batchByCategory = new Map<string, any[]>()
        for (const item of batchItems) {
          if (!item.category_code) continue
          if (!batchByCategory.has(item.category_code)) batchByCategory.set(item.category_code, [])
          batchByCategory.get(item.category_code)!.push(item)
        }
        for (const [catCode, catItems] of batchByCategory) {
          fillTempTableForCategoryItems(catCode, catItems)
        }
      }
    } else {
      for (const [catCode, catItems] of itemsByCategory) {
        fillTempTableForCategoryItems(catCode, catItems)
      }
    }

    const signedAmtSqlSummary = buildSignedEntryAmountSql('a.direction', 've.direction', 've.amount')
    const accountSummarySql = `
      SELECT
        ve.account_code,
        ve.account_name,
        a.direction as account_direction,
        COALESCE(SUM(CASE
          WHEN v.voucher_date < ? THEN ${signedAmtSqlSummary}
          ELSE 0
        END), 0) as init_balance,
        COALESCE(SUM(CASE
          WHEN v.voucher_date >= ? AND v.voucher_date <= ? AND ve.direction = 'debit'
          THEN ve.amount ELSE 0
        END), 0) as current_debit,
        COALESCE(SUM(CASE
          WHEN v.voucher_date >= ? AND v.voucher_date <= ? AND ve.direction = 'credit'
          THEN ve.amount ELSE 0
        END), 0) as current_credit,
        COALESCE(SUM(CASE
          WHEN v.voucher_date <= ? THEN ${signedAmtSqlSummary}
          ELSE 0
        END), 0) as end_balance
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      JOIN accounts a ON a.id = ve.account_id
      WHERE ve.id IN (SELECT DISTINCT entry_id FROM _tmp_aux_entry_ids)
      GROUP BY ve.account_code, ve.account_name, a.direction
    `
    const accountSummaryBalanceParams = [
      start_date || '1900-01-01',
      start_date || '1900-01-01',
      end_date || '9999-12-31',
      start_date || '1900-01-01',
      end_date || '9999-12-31',
      end_date || '9999-12-31',
    ]
    const accountSummaryRows = db.prepare(accountSummarySql).all(...accountSummaryBalanceParams) as any[]

    // 清理临时表
    db.exec('DROP TABLE IF EXISTS _tmp_aux_entry_ids')

    // 科目汇总余额 Map（来自凭证，不含 init_balances 期初）
    const accountSummaryMap = new Map<string, { init_balance: number; current_debit: number; current_credit: number; end_balance: number; account_direction: 'debit' | 'credit' }>()
    for (const row of accountSummaryRows) {
      accountSummaryMap.set(row.account_code, {
        init_balance: row.init_balance || 0,
        current_debit: row.current_debit || 0,
        current_credit: row.current_credit || 0,
        end_balance: row.end_balance || 0,
        account_direction: row.account_direction === 'credit' ? 'credit' : 'debit',
      })
    }

    // 把 init_balances 的辅助期初也折入科目汇总
    // （已在 auxInitRows 循环中更新了 allDetails 里的明细行，这里对科目汇总单独加一遍）
    // 修复：一行 aux_item_id 可能形如 "cash_flow:xxx|person:yyy"（组合），
    // 按 parts 累加会把同一行算多次，应"命中即一次"。
    const accountInitMap = new Map<string, { initBalance: number; account_direction: 'debit' | 'credit' }>()
    for (const row of auxInitRows) {
      let hit = false
      for (const part of String(row.aux_item_id).split('|')) {
        const idx = part.indexOf(':')
        if (idx <= 0) continue
        const catCode = part.slice(0, idx)
        const itemId = part.slice(idx + 1)
        if (!selectedCategoryFilterCodes.has(catCode)) continue
        if (restrictItemIds) {
          const allowedIds = selectedItemIdsByCat.get(catCode)
          if (!allowedIds || !allowedIds.size || !allowedIds.has(itemId)) continue
        }
        hit = true
        break
      }
      if (hit) {
        const initBalance = calcInitBalanceFromDebitCredit(
          row.direction === 'credit' ? 'credit' : 'debit',
          row.init_debit || 0,
          row.init_credit || 0,
          row.init_balance
        )
        const existing = accountInitMap.get(row.account_code)
        accountInitMap.set(row.account_code, {
          initBalance: (existing?.initBalance || 0) + initBalance,
          account_direction: row.direction === 'credit' ? 'credit' : 'debit',
        })
      }
    }
    for (const [acctCode, initInfo] of accountInitMap) {
      const existing = accountSummaryMap.get(acctCode)
      if (existing) {
        existing.init_balance += initInfo.initBalance
        existing.end_balance += initInfo.initBalance
      } else {
        // 只有期初、无凭证的科目
        accountSummaryMap.set(acctCode, {
          init_balance: initInfo.initBalance,
          current_debit: 0,
          current_credit: 0,
          end_balance: initInfo.initBalance,
          account_direction: initInfo.account_direction,
        })
      }
    }

    for (const accSum of accountSummaryMap.values()) {
      grandTotals.init_balance += accSum.init_balance || 0
      grandTotals.current_debit += accSum.current_debit || 0
      grandTotals.current_credit += accSum.current_credit || 0
      grandTotals.end_balance += accSum.end_balance || 0
    }
    }

    if (summaryOnly) {
      const queryTime = Date.now() - startTime
      console.log(`辅助项目余额表：合计查询完成，耗时 ${queryTime}ms`)
      return res.json({
        code: 0,
        data: [],
        total: 0,
        items_total: itemsTotal,
        totals: grandTotals,
        categoryFields,
      })
    }

    const flatRows = allDetails.map(detail => {
      let field_values: Record<string, any> = {}
      try {
        if (detail.field_values_json) {
          field_values = JSON.parse(detail.field_values_json)
        }
      } catch {}

      return {
        ...detail,
        direction: detail.account_direction,
        field_values,
        field_values_json: undefined,
      }
    })

    flatRows.sort((a, b) => {
      const byAccount = String(a.account_code).localeCompare(String(b.account_code))
      if (byAccount !== 0) return byAccount
      const byCategory = String(a.category_code || '').localeCompare(String(b.category_code || ''))
      if (byCategory !== 0) return byCategory
      return String(a.aux_name || '').localeCompare(String(b.aux_name || ''))
    })

    const itemsProcessed = Math.min(
      itemOffset + (chunkedMode ? items.length : itemsTotal),
      itemsTotal
    )
    const queryTime = Date.now() - startTime

    if (chunkedMode) {
      console.log(
        `辅助项目余额表：分批查询完成，耗时 ${queryTime}ms，本批明细 ${flatRows.length} 行，项目进度 ${itemsProcessed}/${itemsTotal}`
      )
      return res.json({
        code: 0,
        data: flatRows,
        total: flatRows.length,
        chunk_rows: flatRows.length,
        items_total: itemsTotal,
        items_processed: itemsProcessed,
        totals: skipSummary ? null : grandTotals,
        categoryFields,
      })
    }

    const totalRows = flatRows.length
    const currentPage = Math.max(1, Number(page) || 1)
    const pageSizeNum = Math.max(1, Math.min(Number(pageSize) || 50, MAX_PAGE_SIZE))
    const offset = (currentPage - 1) * pageSizeNum
    const pagedResults = flatRows.slice(offset, offset + pageSizeNum)

    console.log(
      `辅助项目余额表：查询完成，耗时 ${queryTime}ms，明细 ${totalRows} 行，返回第 ${currentPage} 页 ${pagedResults.length} 行`
    )

    res.json({
      code: 0,
      data: pagedResults,
      total: totalRows,
      items_total: itemsTotal,
      totals: skipSummary ? null : grandTotals,
      categoryFields,
    })
  } catch (error: any) {
    console.error('辅助项目余额表查询失败:', error)
    res.status(500).json({ code: 1, error: error.message || '查询失败' })
  }
})

// ===================== 辅助项目明细账 =====================

router.post('/aux-detail', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    aux_category_ids,
    aux_ids,
    start_date,
    end_date,
    account_code,
    summary_keyword,
    min_amount,
    max_amount,
    maker_name,
    auditor_name,
    include_unposted,
    page,
    pageSize,
  } = req.body
  const accountSetId = req.accountSetId!

  console.log('辅助明细账查询参数:', { aux_category_ids, aux_ids, page, pageSize, start_date, end_date })

  // 参数验证：aux_category_ids 必填，aux_ids 可选（不传时查类别下所有项目）
  if (!aux_category_ids) {
    return res.status(400).json({ code: 1, error: '缺少必要参数：aux_category_ids' })
  }

  const rawCategoryIdArray = (aux_category_ids as string).split(',').filter(id => id.trim())
  const auxIdArray = aux_ids ? (aux_ids as string).split(',').filter(id => id.trim()) : []

  if (rawCategoryIdArray.length === 0) {
    return res.status(400).json({ code: 1, error: '辅助类别不能为空' })
  }

  if (account_code) {
    const codeErr = assertAccountCodePrefixInScope(
      db,
      req.accountScope,
      accountSetId,
      String(account_code)
    )
    if (codeErr) {
      return res.status(403).json({ code: 403, message: codeErr })
    }
  }

  // 现金流量项目本质是凭证级标签而非辅助核算项目，从辅助账簿中剔除（兜底，防止前端漏过滤）
  const cfRowsDetail = db
    .prepare(`SELECT id FROM aux_categories WHERE code = 'cash_flow' AND account_set_id = ?`)
    .all(accountSetId) as { id: string }[]
  const cashFlowCatIdsDetail = new Set(cfRowsDetail.map(r => r.id))
  const categoryIdArray = rawCategoryIdArray.filter(id => !cashFlowCatIdsDetail.has(id))

  if (categoryIdArray.length === 0) {
    return res.json({ code: 0, data: [], initBalance: 0, categoryFields: {}, total: 0 })
  }

  // 构建凭证状态过滤条件（兼容布尔值和字符串）
  const statusValue = (include_unposted === true || include_unposted === 'true')
    ? ['draft', 'audited', 'posted']
    : ['posted']
  const statusPlaceholders = statusValue.map(() => '?').join(',')

  try {
    // 查询辅助项目信息：如果指定了 aux_ids 则按 ID 查，否则查类别下所有项目
    // 同样剔除属于 cash_flow 类目的项目
    let items: any[]
    if (auxIdArray.length > 0) {
      const itemsPlaceholders = auxIdArray.map(() => '?').join(',')
      const itemsSql = `
        SELECT ai.id, ai.code, ai.name, ai.type, ac.code as category_code, ac.name as category_name
        FROM aux_items ai
        LEFT JOIN aux_categories ac ON ac.id = ai.type
        WHERE ai.id IN (${itemsPlaceholders}) AND ai.account_set_id = ?
          AND (ac.code IS NULL OR ac.code != 'cash_flow')
      `
      items = db.prepare(itemsSql).all(...auxIdArray, accountSetId) as any[]
    } else {
      const catPlaceholders = categoryIdArray.map(() => '?').join(',')
      const itemsSql = `
        SELECT ai.id, ai.code, ai.name, ai.type, ac.code as category_code, ac.name as category_name
        FROM aux_items ai
        LEFT JOIN aux_categories ac ON ac.id = ai.type
        WHERE ai.type IN (${catPlaceholders}) AND ai.account_set_id = ?
        ORDER BY ac.code, ai.code
      `
      items = db.prepare(itemsSql).all(...categoryIdArray, accountSetId) as any[]
    }

    if (items.length === 0) {
      console.log('辅助明细账：未找到辅助项目')
      return res.json({ code: 0, data: [], initBalance: 0, categoryFields: {}, total: 0 })
    }

    console.log('辅助明细账：找到辅助项目数量:', items.length)
    if (items.length > 0) {
      console.log('辅助明细账：第一个项目示例:', {
        id: items[0].id,
        code: items[0].code,
        name: items[0].name,
        category_code: items[0].category_code
      })
    }

    // 查询所选类别的自定义字段定义
    const catPlaceholders2 = categoryIdArray.map(() => '?').join(',')
    const fieldDefs = db.prepare(`
      SELECT f.category_id, f.field_key, f.field_name, f.sort_order
      FROM aux_category_fields f
      WHERE f.category_id IN (${catPlaceholders2}) AND f.is_enabled = 1
      ORDER BY f.category_id, f.sort_order
    `).all(...categoryIdArray) as any[]

    const categoryMeta = db.prepare(`
      SELECT id, code, name FROM aux_categories WHERE id IN (${catPlaceholders2})
    `).all(...categoryIdArray) as any[]

    const categoryFields: Record<string, { name: string; fields: { field_key: string; field_name: string }[] }> = {}
    const categoryNameByCode = new Map<string, string>()
    const categoryIdByCode = new Map<string, string>()
    for (const cat of categoryMeta) {
      categoryNameByCode.set(cat.code, cat.name)
      categoryIdByCode.set(cat.code, cat.id)
      categoryFields[cat.code] = {
        name: cat.name,
        fields: fieldDefs.filter((f: any) => f.category_id === cat.id).map((f: any) => ({ field_key: f.field_key, field_name: f.field_name })),
      }
    }

    const auxLookup = buildAuxItemLookup(items)

    // 按类别分组辅助项目
    const itemsByCategory = new Map<string, any[]>()
    for (const item of items) {
      if (!item.category_code) continue
      if (!itemsByCategory.has(item.category_code)) {
        itemsByCategory.set(item.category_code, [])
      }
      itemsByCategory.get(item.category_code)!.push(item)
    }

    // ===== 临时表收集所有匹配的分录 ID（去重 COUNT / 期初用） =====
    // 同一条分录可能同时打了多个类目标签（如 cash_flow + person），若按类目分别 COUNT/累加会重复。
    // 用临时表收集所有匹配的 entry ID（自动去重），避免 OR 合并所有类目导致 SQL 参数超 999。
    db.exec('CREATE TEMP TABLE IF NOT EXISTS _tmp_aux_detail_ids (entry_id TEXT)')
    db.exec('DELETE FROM _tmp_aux_detail_ids')

    // 公共筛选条件构造器（避免在多处重复拼接）
    function buildCommonFilter(opts: { withRangeDate?: boolean; lessThanStart?: boolean }) {
      const conds: string[] = []
      const params: any[] = []
      if (opts.withRangeDate) {
        if (start_date) {
          conds.push('v.voucher_date >= ?')
          params.push(start_date)
        }
        if (end_date) {
          conds.push('v.voucher_date <= ?')
          params.push(end_date)
        }
      }
      if (opts.lessThanStart && start_date) {
        conds.push('v.voucher_date < ?')
        params.push(start_date)
      }
      if (account_code) {
        conds.push('ve.account_code LIKE ?')
        params.push(`${account_code}%`)
      }
      appendAccountScopeCondition(req.accountScope, 've.account_id', conds, params)
      if (summary_keyword) {
        conds.push('ve.summary LIKE ?')
        params.push(`%${summary_keyword}%`)
      }
      if (min_amount !== undefined) {
        conds.push('ve.amount >= ?')
        params.push(parseFloat(min_amount as string))
      }
      if (max_amount !== undefined) {
        conds.push('ve.amount <= ?')
        params.push(parseFloat(max_amount as string))
      }
      if (maker_name) {
        conds.push('v.maker_name LIKE ?')
        params.push(`%${maker_name}%`)
      }
      if (auditor_name) {
        conds.push('v.auditor_name LIKE ?')
        params.push(`%${auditor_name}%`)
      }
      return { conds, params }
    }

    // 按批次收集匹配的 entry ID 到临时表
    const insertDetailEntryId = db.prepare('INSERT INTO _tmp_aux_detail_ids (entry_id) VALUES (?)')
    const detailCollectBatchSize = 150

    for (const [catCode, catItems] of itemsByCategory) {
      for (let i = 0; i < catItems.length; i += detailCollectBatchSize) {
        const batch = catItems.slice(i, i + detailCollectBatchSize)
        const ids = batch.map((it: any) => it.id)
        const ph = ids.map(() => '?').join(',')
        const matchOpts = buildAuxMatchOptions(catCode, categoryIdByCode, batch)
        const auxCond = buildAuxItemMatchCondition(catCode, ph, matchOpts)

        const conds = [
          've.account_set_id = ?',
          `v.status IN (${statusPlaceholders})`,
          auxCond,
        ]
        const params: any[] = [accountSetId, ...statusValue]
        appendAuxItemMatchParams(params, catCode, ids, matchOpts)

        // 应用公共筛选条件（日期范围、科目、摘要等）
        const dataCommon = buildCommonFilter({ withRangeDate: true })
        conds.push(...dataCommon.conds)
        params.push(...dataCommon.params)

        const selectSql = `
          SELECT DISTINCT ve.id
          FROM voucher_entries ve
          JOIN vouchers v ON v.id = ve.voucher_id
          WHERE ${conds.join(' AND ')}
        `
        const entryRows = db.prepare(selectSql).all(...params) as { id: string }[]
        const insertMany = db.transaction((rows: { id: string }[]) => {
          for (const row of rows) {
            insertDetailEntryId.run(row.id)
          }
        })
        insertMany(entryRows)
      }
    }

    // ===== 使用临时表 COUNT(DISTINCT)，避免同一分录被多个类目重复计数 =====
    const totalCount = (db.prepare(`
      SELECT COUNT(DISTINCT entry_id) as count FROM _tmp_aux_detail_ids
    `).get() as any)?.count || 0

    console.log('辅助明细账：COUNT 查询完成，总记录数:', totalCount)

    // 批量查询所有辅助项目的数据（性能优化：使用 IN 子句替代循环查询）
    let allEntries: any[] = []
    let totalInitBalance = 0
    const categoryInitBalances: {
      category_code: string
      category_name: string
      init_balance: number
    }[] = []

    const initYearAuxDetail = start_date ? new Date(start_date).getFullYear() : new Date().getFullYear()
    const selectedCategoryCodes = new Set(Array.from(itemsByCategory.keys()))
    const selectedItemIdsByCat = new Map<string, Set<string>>()
    for (const [code, arr] of itemsByCategory) {
      selectedItemIdsByCat.set(code, new Set(arr.map((it: any) => String(it.id))))
    }

    const accountCodeFilter = account_code ? ` AND a.code LIKE ?` : ''
    const initRowsSql = `
      SELECT a.code as account_code, a.direction, ib.aux_item_id, ib.init_balance, ib.init_debit, ib.init_credit
      FROM init_balances ib
      JOIN accounts a ON a.id = ib.account_id
      WHERE ib.account_set_id = ? AND ib.year = ? AND ib.aux_item_id != ''
      ${accountCodeFilter}
    `
    const initRowsParams: any[] = [accountSetId, initYearAuxDetail]
    if (account_code) initRowsParams.push(`${account_code}%`)
    const auxInitRows = db.prepare(initRowsSql).all(...initRowsParams) as any[]

    /** 期初余额表：组合 aux_item_id 行只计入首个命中的类目，避免拆行展示时重复 */
    function addAuxInitBalanceForCategory(categoryCode: string): number {
      let sum = 0
      for (const row of auxInitRows) {
        const matchedParts: string[] = []
        for (const part of String(row.aux_item_id).split('|')) {
          const idx = part.indexOf(':')
          if (idx <= 0) continue
          const cat = part.slice(0, idx)
          const itemId = part.slice(idx + 1)
          if (!selectedCategoryCodes.has(cat)) continue
          const allowed = selectedItemIdsByCat.get(cat)
          if (!allowed || !allowed.has(itemId)) continue
          matchedParts.push(cat)
        }
        if (matchedParts.length === 0) continue
        const firstMatched = matchedParts.find(c => itemsByCategory.has(c))
        if (firstMatched !== categoryCode) continue
        sum += calcInitBalanceFromDebitCredit(
          row.direction === 'credit' ? 'credit' : 'debit',
          row.init_debit || 0,
          row.init_credit || 0,
          row.init_balance
        )
      }
      return sum
    }

    // ===== 按辅助类别分别汇总期初（用于前端分开展示） =====
    for (const [categoryCode, categoryItems] of itemsByCategory) {
      let catInit = 0
      if (start_date) {
        const initCommon = buildCommonFilter({ lessThanStart: true })
        const batchSize = 150
        for (let i = 0; i < categoryItems.length; i += batchSize) {
          const batch = categoryItems.slice(i, i + batchSize)
          const ids = batch.map((it: any) => it.id)
          const ph = ids.map(() => '?').join(',')
          const matchOpts = buildAuxMatchOptions(categoryCode, categoryIdByCode, batch)
          const catAuxCond = buildAuxItemMatchCondition(categoryCode, ph, matchOpts)
          
          const catMatchParams: any[] = []
          appendAuxItemMatchParams(catMatchParams, categoryCode, ids, matchOpts)

          const initSqlCat = `
            SELECT COALESCE(SUM(
              ${buildSignedEntryAmountSql('account_direction', 'direction', 'amount')}
            ), 0) as init_balance
            FROM (
              SELECT DISTINCT ve.id, ve.direction, ve.amount, a.direction as account_direction
              FROM voucher_entries ve
              JOIN vouchers v ON v.id = ve.voucher_id
              JOIN accounts a ON a.id = ve.account_id
              WHERE ve.account_set_id = ?
                AND v.status IN (${statusPlaceholders})
                AND ${catAuxCond}
                ${initCommon.conds.length > 0 ? 'AND ' + initCommon.conds.join(' AND ') : ''}
            )
          `
          const initRowCat = db.prepare(initSqlCat).get(
            accountSetId,
            ...statusValue,
            ...catMatchParams,
            ...initCommon.params
          ) as any
          catInit += initRowCat?.init_balance || 0
        }
      }
      catInit += addAuxInitBalanceForCategory(categoryCode)
      if (catInit !== 0) {
        categoryInitBalances.push({
          category_code: categoryCode,
          category_name: categoryNameByCode.get(categoryCode) || categoryCode,
          init_balance: catInit,
        })
      }
    }

    // ===== 合计期初（凭证 DISTINCT 去重 + 期初表每行只计一次） =====
    if (start_date) {
      // 从临时表中取已去重的 entry ID，仅查询日期 < start_date 的部分
      const initCommon = buildCommonFilter({ lessThanStart: true })
      const initCondParts = ['ve.id IN (SELECT DISTINCT entry_id FROM _tmp_aux_detail_ids)']
      // 还需补充日期过滤（临时表中收集的是有日期范围的，但期初需要 < start_date）
      // 所以直接用子查询重新根据临时表中的分录 + 日期 < start_date 条件求和
      const initSqlAll = `
        SELECT COALESCE(SUM(
          ${buildSignedEntryAmountSql('a.direction', 've.direction', 've.amount')}
        ), 0) as init_balance
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        JOIN accounts a ON a.id = ve.account_id
        WHERE ve.id IN (SELECT DISTINCT entry_id FROM _tmp_aux_detail_ids)
          AND v.voucher_date < ?
      `
      const initRow = db.prepare(initSqlAll).get(start_date) as any
      totalInitBalance += initRow?.init_balance || 0
    }

    for (const row of auxInitRows) {
      let hit = false
      for (const part of String(row.aux_item_id).split('|')) {
        const idx = part.indexOf(':')
        if (idx <= 0) continue
        const categoryCode = part.slice(0, idx)
        const itemId = part.slice(idx + 1)
        if (!selectedCategoryCodes.has(categoryCode)) continue
        const allowed = selectedItemIdsByCat.get(categoryCode)
        if (!allowed || !allowed.has(itemId)) continue
        hit = true
        break
      }
      if (hit) {
        totalInitBalance += calcInitBalanceFromDebitCredit(
          row.direction === 'credit' ? 'credit' : 'debit',
          row.init_debit || 0,
          row.init_credit || 0,
          row.init_balance
        )
      }
    }
    console.log(
      `辅助明细账：合并辅助期初记录 ${auxInitRows.length} 条，年度 ${initYearAuxDetail}，分类期初 ${categoryInitBalances.length} 项`
    )

    // 为每个类别执行批量查询，结果按 ve.id 去重合并到 entryMap
    // 同一条分录可能同时被多个类目命中（如 cash_flow + person），用 Map 去重，多个类目的标签合并到同一行
    const entryMap = new Map<string, any>()

    for (const [categoryCode, categoryItems] of itemsByCategory) {
      const batchSize = 150
      for (let i = 0; i < categoryItems.length; i += batchSize) {
        const batch = categoryItems.slice(i, i + batchSize)
        const itemIds = batch.map(item => item.id)
        const itemIdsPlaceholder = itemIds.map(() => '?').join(',')
        const matchOpts = buildAuxMatchOptions(categoryCode, categoryIdByCode, batch)
        const auxMatchCondition = buildAuxItemMatchCondition(categoryCode, itemIdsPlaceholder, matchOpts)

        // 查询明细分录
        const dataConditions = [
          've.account_set_id = ?',
          `v.status IN (${statusPlaceholders})`,
          auxMatchCondition,
        ]
        const dataParams: any[] = [accountSetId, ...statusValue]
        appendAuxItemMatchParams(dataParams, categoryCode, itemIds, matchOpts)

        const dataCommon = buildCommonFilter({ withRangeDate: true })
        dataConditions.push(...dataCommon.conds)
        dataParams.push(...dataCommon.params)

        const detailSql = `
          SELECT
            ve.id as entry_id,
            ve.voucher_id,
            v.status as voucher_status,
            v.voucher_date,
            v.voucher_no,
            ve.seq,
            ve.account_code,
            ve.account_name,
            a.direction as account_direction,
            ve.summary,
            ve.direction,
            ve.amount,
            ${buildAuxIdSelect(categoryCode, categoryIdByCode.get(categoryCode))} as aux_id,
            ${buildAuxNameSelect(categoryCode, categoryIdByCode.get(categoryCode))} as aux_name,
            '${categoryCode}' as category_code,
            ${buildAuxFieldValuesSelect(categoryCode, categoryIdByCode.get(categoryCode))} as field_values_json
          FROM voucher_entries ve
          JOIN vouchers v ON v.id = ve.voucher_id
          JOIN accounts a ON a.id = ve.account_id
          WHERE ${dataConditions.join(' AND ')}
          ORDER BY v.voucher_date, v.voucher_no, ve.seq
        `
        const entries = db.prepare(detailSql).all(...dataParams) as any[]

        for (const entry of entries) {
          let field_values: Record<string, any> = {}
          try {
            if (entry.field_values_json) {
              const raw =
                typeof entry.field_values_json === 'string'
                  ? entry.field_values_json
                  : JSON.stringify(entry.field_values_json)
              field_values = JSON.parse(raw)
            }
          } catch {}
          entry.field_values = field_values
          delete entry.field_values_json

          enrichAuxLedgerEntry(entry, categoryCode, categoryNameByCode, auxLookup)

          const existing = entryMap.get(entry.entry_id)
          if (existing) {
            // 同一条分录被多个类目命中：合并 category_name / aux_name，金额不重复累加
            const newCatName = entry.category_name || categoryCode
            const newAuxName = entry.aux_name || ''
            if (newCatName && !String(existing.category_name || '').split('、').includes(newCatName)) {
              existing.category_name = existing.category_name
                ? `${existing.category_name}、${newCatName}`
                : newCatName
            }
            if (newAuxName && !String(existing.aux_name || '').split('、').includes(newAuxName)) {
              existing.aux_name = existing.aux_name
                ? `${existing.aux_name}、${newAuxName}`
                : newAuxName
            }
            // 自定义字段：浅合并
            existing.field_values = { ...(existing.field_values || {}), ...field_values }
          } else {
            entryMap.set(entry.entry_id, entry)
          }
        }
      }
    }

    allEntries = Array.from(entryMap.values())

    console.log('辅助明细账：数据查询完成，去重后分录数:', allEntries.length)

    // 按日期、凭证号、分录序排序（去重后多类目混合时需稳定排序）
    allEntries.sort((a, b) => {
      if (a.voucher_date !== b.voucher_date) {
        return a.voucher_date.localeCompare(b.voucher_date)
      }
      if (a.voucher_no !== b.voucher_no) {
        return a.voucher_no.localeCompare(b.voucher_no)
      }
      return (a.seq || 0) - (b.seq || 0)
    })

    // 应用分页
    const currentPage = parseInt(page as string) || 1
    const pageSizeNum = parsePageSizeParam(pageSize, 50)
    const offset = (currentPage - 1) * pageSizeNum
    const carryAmount = allEntries.slice(0, offset).reduce((sum, entry) => {
      const accountDirection = entry.account_direction === 'credit' ? 'credit' : 'debit'
      return applyEntryToSignedBalance(sum, entry.amount, entry.direction, accountDirection)
    }, 0)
    const paginatedEntries = allEntries.slice(offset, offset + pageSizeNum)

    console.log('辅助明细账查询结果:', {
      totalCount,
      allEntriesLength: allEntries.length,
      paginatedEntriesLength: paginatedEntries.length,
      currentPage,
      pageSizeNum,
      offset
    })

    // 清理临时表
    db.exec('DROP TABLE IF EXISTS _tmp_aux_detail_ids')

    res.json({
      code: 0,
      data: paginatedEntries,
      initBalance: totalInitBalance,
      categoryInitBalances,
      pageStartBalance: totalInitBalance + carryAmount,
      categoryFields,
      total: totalCount,
    })
  } catch (error: any) {
    console.error('辅助项目明细账查询失败:', error)
    res.status(500).json({ code: 1, error: error.message || '查询失败' })
  }
})

router.get('/cash-flow-trial-balance', (req: AuthRequest, res) => {
  try {
    const accountSetId = req.accountSetId || ''
    if (!isCashFlowEnabledForAccountSet(getDb(), accountSetId)) {
      return res.status(400).json({ code: 400, message: '账套未启用现金流核算' })
    }

    const year = Number(req.query.year) || new Date().getFullYear()
    const period = Number(req.query.period) || new Date().getMonth() + 1
    const scope: CashFlowTrialBalanceScope = req.query.scope === 'ytd' ? 'ytd' : 'month'
    const includeUnposted = req.query.include_unposted === 'true'

    const data = getCashFlowTrialBalance(getDb(), accountSetId, year, period, scope, includeUnposted)
    res.json({ code: 0, data })
  } catch (error: any) {
    console.error('现金流量试算平衡表查询失败:', error)
    res.status(500).json({ code: 500, message: error.message || '查询失败' })
  }
})

router.get('/cash-flow-voucher-check', (req: AuthRequest, res) => {
  try {
    const accountSetId = req.accountSetId || ''
    if (!isCashFlowEnabledForAccountSet(getDb(), accountSetId)) {
      return res.status(400).json({ code: 400, message: '账套未启用现金流核算' })
    }

    const year = Number(req.query.year) || new Date().getFullYear()
    const period = Number(req.query.period) || new Date().getMonth() + 1
    const scope: CashFlowTrialBalanceScope = req.query.scope === 'ytd' ? 'ytd' : 'month'
    const includeUnposted = req.query.include_unposted === 'true'

    const data = getCashFlowVoucherCheck(getDb(), accountSetId, year, period, scope, includeUnposted)
    res.json({ code: 0, data })
  } catch (error: any) {
    console.error('现金流量凭证检查失败:', error)
    res.status(500).json({ code: 500, message: error.message || '查询失败' })
  }
})

export default router
 
