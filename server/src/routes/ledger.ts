import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/index.ts'
import { getDb } from '../db/index.ts'
import {
  buildCashJournalQuery,
  buildChronologicalQuery,
  buildGeneralLedgerQuery,
  buildLedgerBalanceQuery,
  buildLedgerDetailQuery,
  buildLedgerGeneralQuery,
  buildAuxBalanceQuery,
  buildAuxDetailQuery,
  AuxBalanceRow,
  AuxDetailRow,
} from '../services/ledgerQuery.ts'

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

  // 将逗号分隔的字符串转为数组
  let filterTypesArray: string[] | undefined
  if (filter_types && typeof filter_types === 'string') {
    filterTypesArray = filter_types.split(',').filter(t => t.trim())
  }

  // 不传递 filterTypes 给查询构建器，我们在汇总后再过滤
  const query = buildLedgerGeneralQuery({
    accountSetId: req.accountSetId || '',
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    accountCode: account_code as string | undefined,
    accountLevel: account_level ? Number(account_level) : undefined,
    accountCodeStart: account_code_start as string | undefined,
    accountCodeEnd: account_code_end as string | undefined,
    filterTypes: undefined, // 不在 SQL 中过滤
    includeUnposted: include_unposted === 'true',
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
      existing.year_debit = (existing.year_debit || 0) + (row.year_debit || 0)
      existing.year_credit = (existing.year_credit || 0) + (row.year_credit || 0)
      existing.end_balance = (existing.end_balance || 0) + (row.end_balance || 0)
    } else {
      deduplicatedMap.set(row.account_code, { ...row })
    }
  })
  list = Array.from(deduplicatedMap.values())

  console.log('去重后科目列表:', list.map(r => r.account_code).join(', '))

  // 获取科目长度配置
  const accountCodeLengthsStr = db
    .prepare('SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ?')
    .get(req.accountSetId, 'account_code_lengths') as any
  let codeLengths = [4, 2, 2, 2, 2, 2] // 默认配置
  if (accountCodeLengthsStr?.param_value) {
    try {
      codeLengths = JSON.parse(accountCodeLengthsStr.param_value)
    } catch {
      // 使用默认值
    }
  }

  // 补充缺失的父科目
  const accountMap = new Map<string, any>()
  list.forEach(row => accountMap.set(row.account_code, row))

  console.log('原始科目列表:', list.map(r => r.account_code).join(', '))
  console.log('accountMap 包含的科目:', Array.from(accountMap.keys()).join(', '))
  console.log('科目长度配置:', codeLengths)

  const missingParents: any[] = []
  list.forEach(row => {
    const parentCodes = getParentCodes(row.account_code, codeLengths)
    console.log(`科目 ${row.account_code} 的父科目:`, parentCodes)

    parentCodes.forEach(parentCode => {
      console.log(`检查父科目 ${parentCode} 是否在 accountMap 中:`, accountMap.has(parentCode))
      if (!accountMap.has(parentCode)) {
        // 从数据库获取父科目信息
        const parentAccount = db
          .prepare('SELECT code, name, direction, level FROM accounts WHERE code = ? AND account_set_id = ?')
          .get(parentCode, req.accountSetId) as any

        console.log(`查找父科目 ${parentCode}:`, parentAccount ? '找到' : '未找到')

        // 如果数据库中有父科目，使用数据库信息；否则创建占位符
        const parentRow = {
          account_code: parentCode,
          account_name: parentAccount ? parentAccount.name : '-',
          direction: parentAccount ? parentAccount.direction : row.direction,
          level: parentAccount ? parentAccount.level : calculateLevel(parentCode, codeLengths),
          init_balance: 0,
          current_debit: 0,
          current_credit: 0,
          year_debit: 0,
          year_credit: 0,
          end_balance: 0,
        }
        missingParents.push(parentRow)
        accountMap.set(parentCode, parentRow)
        console.log(`补充父科目: ${parentCode} ${parentRow.account_name}`)
      } else {
        console.log(`父科目 ${parentCode} 已存在，跳过补充`)
      }
    })
  })

  console.log('补充的父科目数量:', missingParents.length)

  // 将补充的父科目加入列表
  list = [...list, ...missingParents]

  // 将子科目金额汇总到父科目
  // 按科目编码长度倒序排序，从最底层的子科目开始处理
  const sortedList = [...list].sort((a, b) => b.account_code.length - a.account_code.length)

  sortedList.forEach(row => {
    // 查找直接父科目（编码是当前科目编码的前缀，且是最长的前缀）
    let parent = null
    let maxPrefixLength = 0

    for (const p of list) {
      if (p.account_code !== row.account_code &&
          row.account_code.startsWith(p.account_code) &&
          p.account_code.length > maxPrefixLength) {
        parent = p
        maxPrefixLength = p.account_code.length
      }
    }

    // 如果找到父科目，将当前科目的金额累加到父科目
    if (parent) {
      parent.init_balance = (parent.init_balance || 0) + (row.init_balance || 0)
      parent.current_debit = (parent.current_debit || 0) + (row.current_debit || 0)
      parent.current_credit = (parent.current_credit || 0) + (row.current_credit || 0)
      parent.year_debit = (parent.year_debit || 0) + (row.year_debit || 0)
      parent.year_credit = (parent.year_credit || 0) + (row.year_credit || 0)
      parent.end_balance = (parent.end_balance || 0) + (row.end_balance || 0)
    }
  })

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

      // 使用 OR 逻辑：满足任一条件即可
      return conditions.length === 0 || conditions.some(c => c)
    })
  }

  res.json({ code: 0, data: list })
})

// 辅助函数：获取所有父科目编码
function getParentCodes(code: string, codeLengths: number[]): string[] {
  const parentCodes: string[] = []
  let currentLength = 0

  // 计算当前科目的级数
  let currentLevel = 0
  for (let i = 0; i < codeLengths.length; i++) {
    currentLength += codeLengths[i]
    if (currentLength >= code.length) {
      currentLevel = i + 1
      break
    }
  }

  // 生成所有上级科目编码
  currentLength = 0
  for (let i = 0; i < currentLevel - 1; i++) {
    currentLength += codeLengths[i]
    parentCodes.push(code.substring(0, currentLength))
  }

  return parentCodes
}

// 辅助函数：根据编码长度计算科目级数
function calculateLevel(code: string, codeLengths: number[]): number {
  let currentLength = 0
  for (let i = 0; i < codeLengths.length; i++) {
    currentLength += codeLengths[i]
    if (currentLength >= code.length) {
      return i + 1
    }
  }
  return 1
}

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
  })

  const initBal = db.prepare(query.initBalanceSql).get(...query.initBalanceParams) as any
  const entries = db.prepare(query.listSql).all(...query.listParams)

  res.json({ code: 0, data: entries, initBalance: initBal?.init_balance || 0 })
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

  // 获取科目长度配置
  const accountCodeLengthsStr = db
    .prepare('SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ?')
    .get(req.accountSetId, 'account_code_lengths') as any
  let codeLengths = [4, 2, 2, 2, 2, 2] // 默认配置
  if (accountCodeLengthsStr?.param_value) {
    try {
      codeLengths = JSON.parse(accountCodeLengthsStr.param_value)
    } catch {
      // 使用默认值
    }
  }

  // 补充缺失的父科目
  const accountMap = new Map<string, any>()
  list.forEach(row => accountMap.set(row.account_code, row))

  const missingParents: any[] = []
  list.forEach(row => {
    const parentCodes = getParentCodes(row.account_code, codeLengths)
    parentCodes.forEach(parentCode => {
      if (!accountMap.has(parentCode)) {
        // 从数据库获取父科目信息
        const parentAccount = db
          .prepare('SELECT code, name, direction, level FROM accounts WHERE code = ? AND account_set_id = ?')
          .get(parentCode, req.accountSetId) as any

        // 如果数据库中有父科目，使用数据库信息；否则创建占位符
        const parentRow = {
          account_code: parentCode,
          account_name: parentAccount ? parentAccount.name : '-',
          direction: parentAccount ? parentAccount.direction : row.direction,
          level: parentAccount ? parentAccount.level : calculateLevel(parentCode, codeLengths),
          init_balance: 0,
          current_debit: 0,
          current_credit: 0,
          end_balance: 0,
        }
        missingParents.push(parentRow)
        accountMap.set(parentCode, parentRow)
      }
    })
  })

  // 将补充的父科目加入列表
  list = [...list, ...missingParents]

  console.log('余额表 - 补充后的科目列表:', list.map(r => `${r.account_code}(${r.end_balance})`).join(', '))

  // 将子科目金额汇总到父科目
  // 按科目编码长度倒序排序，从最底层的子科目开始处理
  const sortedList = [...list].sort((a, b) => b.account_code.length - a.account_code.length)

  sortedList.forEach(row => {
    // 查找直接父科目（编码是当前科目编码的前缀，且是最长的前缀）
    let parent = null
    let maxPrefixLength = 0

    for (const p of list) {
      if (p.account_code !== row.account_code &&
          row.account_code.startsWith(p.account_code) &&
          p.account_code.length > maxPrefixLength) {
        parent = p
        maxPrefixLength = p.account_code.length
      }
    }

    // 如果找到父科目，将当前科目的金额累加到父科目
    if (parent) {
      console.log(`余额表 - 汇总: ${row.account_code}(${row.end_balance}) -> ${parent.account_code}`)
      parent.init_balance = (parent.init_balance || 0) + (row.init_balance || 0)
      parent.current_debit = (parent.current_debit || 0) + (row.current_debit || 0)
      parent.current_credit = (parent.current_credit || 0) + (row.current_credit || 0)
      parent.end_balance = (parent.end_balance || 0) + (row.end_balance || 0)
      console.log(`余额表 - 汇总后父科目: ${parent.account_code}(${parent.end_balance})`)
    }
  })

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
    }
    summary.totalDebit += row.current_debit
    summary.totalCredit += row.current_credit
    if (row.end_balance > 0) {
      if (row.direction === 'debit') summary.totalEndDebit += row.end_balance
      else summary.totalEndCredit += row.end_balance
    }
  }

  res.json({ code: 0, data: list, summary })
})

// ===================== 总分类账（带月度汇总） =====================

router.get('/general-ledger', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, account_code, account_level, include_unposted } = req.query

  const query = buildGeneralLedgerQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    accountCode: account_code as string | undefined,
    accountLevel: account_level ? Number(account_level) : undefined,
    includeUnposted: include_unposted === 'true',
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

  // 获取科目长度配置
  const accountCodeLengthsStr = db
    .prepare('SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ?')
    .get(req.accountSetId, 'account_code_lengths') as any
  let codeLengths = [4, 2, 2, 2, 2, 2] // 默认配置
  if (accountCodeLengthsStr?.param_value) {
    try {
      codeLengths = JSON.parse(accountCodeLengthsStr.param_value)
    } catch {
      // 使用默认值
    }
  }

  // 补充缺失的父科目
  const accountMap = new Map<string, any>()
  list.forEach((row: any) => accountMap.set(row.account_code, row))

  const missingParents: any[] = []
  list.forEach((row: any) => {
    const parentCodes = getParentCodes(row.account_code, codeLengths)
    parentCodes.forEach(parentCode => {
      if (!accountMap.has(parentCode)) {
        // 从数据库获取父科目信息
        const parentAccount = db
          .prepare('SELECT code, name, direction, level FROM accounts WHERE code = ? AND account_set_id = ?')
          .get(parentCode, req.accountSetId) as any

        // 创建父科目行，初始化所有月份为0
        const parentRow: any = {
          account_code: parentCode,
          account_name: parentAccount ? parentAccount.name : '-',
          direction: parentAccount ? parentAccount.direction : row.direction,
          level: parentAccount ? parentAccount.level : calculateLevel(parentCode, codeLengths),
          init_balance: 0,
        }
        // 初始化12个月的借贷方发生额
        for (let m = 1; m <= 12; m++) {
          parentRow[`month${m}_debit`] = 0
          parentRow[`month${m}_credit`] = 0
        }
        missingParents.push(parentRow)
        accountMap.set(parentCode, parentRow)
      }
    })
  })

  // 将补充的父科目加入列表
  list = [...list, ...missingParents]

  // 将子科目金额汇总到父科目
  // 按科目编码长度倒序排序，从最底层的子科目开始处理
  const sortedList = [...list].sort((a: any, b: any) => b.account_code.length - a.account_code.length)

  sortedList.forEach((row: any) => {
    // 查找直接父科目
    let parent = null
    let maxPrefixLength = 0

    for (const p of list as any[]) {
      if (p.account_code !== row.account_code &&
          row.account_code.startsWith(p.account_code) &&
          p.account_code.length > maxPrefixLength) {
        parent = p
        maxPrefixLength = p.account_code.length
      }
    }

    // 如果找到父科目，将当前科目的金额累加到父科目
    if (parent) {
      parent.init_balance = (parent.init_balance || 0) + (row.init_balance || 0)
      // 汇总12个月的借贷方发生额
      for (let m = 1; m <= 12; m++) {
        parent[`month${m}_debit`] = (parent[`month${m}_debit`] || 0) + (row[`month${m}_debit`] || 0)
        parent[`month${m}_credit`] = (parent[`month${m}_credit`] || 0) + (row[`month${m}_credit`] || 0)
      }
    }
  })

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

  // 计算合计
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

  for (const row of result) {
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

  res.json({ code: 0, data: result, summary })
})

// ===================== 日记账 =====================

router.get('/cash-journal', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    year,
    period,
    account_id,
    account_type,
    direction,
    min_amount,
    max_amount,
    opposite_account_code,
    account_code_start,
    account_code_end,
    include_unposted,
  } = req.query

  const query = buildCashJournalQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    accountId: account_id as string | undefined,
    accountType: account_type as string | undefined,
    direction: direction as string | undefined,
    minAmount: min_amount ? Number(min_amount) : undefined,
    maxAmount: max_amount ? Number(max_amount) : undefined,
    oppositeAccountCode: opposite_account_code as string | undefined,
    accountCodeStart: account_code_start as string | undefined,
    accountCodeEnd: account_code_end as string | undefined,
    includeUnposted: include_unposted === 'true',
  })

  const list = db.prepare(query.sql).all(...query.params)
  res.json({ code: 0, data: list })
})

// ===================== 序时账 =====================

router.get('/chronological', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period, start_date, end_date, include_unposted, page = 1, pageSize = 100 } = req.query

  const query = buildChronologicalQuery({
    accountSetId: req.accountSetId || '',
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    includeUnposted: include_unposted === 'true',
    page: Number(page),
    pageSize: Number(pageSize),
  })

  const total = (db.prepare(query.countSql).get(...query.countParams) as any).count
  const list = db.prepare(query.listSql).all(...query.listParams)
  res.json({ code: 0, data: list, total })
})

// ===================== 辅助项目余额表 =====================

router.get('/aux-balance', (req: AuthRequest, res) => {
  const db = getDb()
  const { aux_category_ids, aux_ids, start_date, end_date, account_code, include_unposted } = req.query
  const accountSetId = req.accountSetId!

  // 参数验证
  if (!aux_category_ids || !aux_ids) {
    return res.status(400).json({ code: 1, error: '缺少必要参数：aux_category_ids 和 aux_ids' })
  }

  // 将逗号分隔的字符串转为数组
  const categoryIdArray = (aux_category_ids as string).split(',').filter(id => id.trim())
  const auxIdArray = (aux_ids as string).split(',').filter(id => id.trim())

  if (categoryIdArray.length === 0 || auxIdArray.length === 0) {
    return res.status(400).json({ code: 1, error: '参数不能为空' })
  }

  // 构建凭证状态过滤条件
  const statusValue = include_unposted === 'true' ? ['draft', 'audited', 'posted'] : ['posted']

  try {
    // 查询辅助项目信息，获取它们的类别code
    const itemsPlaceholders = auxIdArray.map(() => '?').join(',')
    const itemsSql = `
      SELECT ai.id, ai.code, ai.name, ai.type, ac.code as category_code, ac.name as category_name
      FROM aux_items ai
      LEFT JOIN aux_categories ac ON ac.id = ai.type
      WHERE ai.id IN (${itemsPlaceholders}) AND ai.account_set_id = ?
    `
    const items = db.prepare(itemsSql).all(...auxIdArray, accountSetId) as any[]

    if (items.length === 0) {
      return res.json({ code: 0, data: [] })
    }

    // 按类别分组查询
    const results: any[] = []

    // 字段映射：根据类别code映射到voucher_entries表的字段
    const fieldMap: Record<string, string> = {
      dept: 'dept_id',
      project: 'project_id',
      supplier: 'supplier_id',
      person: 'person_id',
      func_class: 'func_class_id'
    }

    for (const item of items) {
      const fieldName = fieldMap[item.category_code]
      if (!fieldName) continue

      const nameField = fieldName.replace('_id', '_name')

      // 构建基础查询条件（不包含日期范围）
      const statusPlaceholders = statusValue.map(() => '?').join(',')
      const baseConditions = [
        've.account_set_id = ?',
        `v.status IN (${statusPlaceholders})`,
        `ve.${fieldName} = ?`
      ]
      const baseParams: any[] = [accountSetId, ...statusValue, item.id]

      // 添加科目编码筛选
      if (account_code) {
        baseConditions.push('ve.account_code LIKE ?')
        baseParams.push(`${account_code}%`)
      }

      const sql = `
        SELECT
          '${item.id}' as aux_id,
          '${item.code}' as aux_code,
          '${item.name}' as aux_name,
          '${item.category_name}' as category_name,
          COALESCE(SUM(CASE
            WHEN v.voucher_date < ? THEN
              CASE WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END
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
            WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END
          ), 0) as end_balance
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        WHERE ${baseConditions.join(' AND ')}
      `

      const balanceParams = [
        ...baseParams,
        start_date || '1900-01-01',
        start_date || '1900-01-01',
        end_date || '9999-12-31',
        start_date || '1900-01-01',
        end_date || '9999-12-31'
      ]

      const result = db.prepare(sql).get(...balanceParams) as any
      if (result && (result.init_balance !== 0 || result.current_debit !== 0 || result.current_credit !== 0 || result.end_balance !== 0)) {
        results.push(result)
      }
    }

    res.json({ code: 0, data: results })
  } catch (error: any) {
    console.error('辅助项目余额表查询失败:', error)
    res.status(500).json({ code: 1, error: error.message || '查询失败' })
  }
})

// ===================== 辅助项目明细账 =====================

router.get('/aux-detail', (req: AuthRequest, res) => {
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
  } = req.query
  const accountSetId = req.accountSetId!

  // 参数验证
  if (!aux_category_ids || !aux_ids) {
    return res.status(400).json({ code: 1, error: '缺少必要参数：aux_category_ids 和 aux_ids' })
  }

  const categoryIdArray = (aux_category_ids as string).split(',').filter(id => id.trim())
  const auxIdArray = (aux_ids as string).split(',').filter(id => id.trim())

  if (categoryIdArray.length === 0 || auxIdArray.length === 0) {
    return res.status(400).json({ code: 1, error: '参数不能为空' })
  }

  // 构建凭证状态过滤条件
  const statusValue = include_unposted === 'true' ? ['draft', 'audited', 'posted'] : ['posted']
  const statusPlaceholders = statusValue.map(() => '?').join(',')

  try {
    // 查询辅助项目信息
    const itemsPlaceholders = auxIdArray.map(() => '?').join(',')
    const itemsSql = `
      SELECT ai.id, ai.code, ai.name, ai.type, ac.code as category_code, ac.name as category_name
      FROM aux_items ai
      LEFT JOIN aux_categories ac ON ac.id = ai.type
      WHERE ai.id IN (${itemsPlaceholders}) AND ai.account_set_id = ?
    `
    const items = db.prepare(itemsSql).all(...auxIdArray, accountSetId) as any[]

    if (items.length === 0) {
      return res.json({ code: 0, data: [], initBalance: 0 })
    }

    // 字段映射
    const fieldMap: Record<string, string> = {
      dept: 'dept_id',
      project: 'project_id',
      supplier: 'supplier_id',
      person: 'person_id',
      func_class: 'func_class_id'
    }

    let allEntries: any[] = []
    let totalInitBalance = 0

    for (const item of items) {
      const fieldName = fieldMap[item.category_code]
      if (!fieldName) continue

      // 构建条件
      const conditions = [
        've.account_set_id = ?',
        `v.status IN (${statusPlaceholders})`,
        `ve.${fieldName} = ?`
      ]
      const params: any[] = [accountSetId, ...statusValue, item.id]

      if (start_date) {
        conditions.push('v.voucher_date >= ?')
        params.push(start_date)
      }
      if (end_date) {
        conditions.push('v.voucher_date <= ?')
        params.push(end_date)
      }
      if (account_code) {
        conditions.push('ve.account_code LIKE ?')
        params.push(`${account_code}%`)
      }
      if (summary_keyword) {
        conditions.push('ve.summary LIKE ?')
        params.push(`%${summary_keyword}%`)
      }
      if (min_amount !== undefined) {
        conditions.push('ve.amount >= ?')
        params.push(parseFloat(min_amount as string))
      }
      if (max_amount !== undefined) {
        conditions.push('ve.amount <= ?')
        params.push(parseFloat(max_amount as string))
      }
      if (maker_name) {
        conditions.push('v.maker_name LIKE ?')
        params.push(`%${maker_name}%`)
      }
      if (auditor_name) {
        conditions.push('v.auditor_name LIKE ?')
        params.push(`%${auditor_name}%`)
      }

      // 查询期初余额
      const initConditions = [
        've.account_set_id = ?',
        `v.status IN (${statusPlaceholders})`,
        `ve.${fieldName} = ?`
      ]
      const initParams: any[] = [accountSetId, ...statusValue, item.id]
      if (start_date) {
        initConditions.push('v.voucher_date < ?')
        initParams.push(start_date)
      }

      const initSql = `
        SELECT COALESCE(SUM(CASE
          WHEN ve.direction = 'debit' THEN ve.amount
          ELSE -ve.amount
        END), 0) as init_balance
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        WHERE ${initConditions.join(' AND ')}
      `
      const initResult = db.prepare(initSql).get(...initParams) as any
      totalInitBalance += initResult?.init_balance || 0

      // 查询明细分录
      const detailSql = `
        SELECT
          v.voucher_date,
          v.voucher_no,
          ve.account_code,
          ve.account_name,
          ve.summary,
          ve.direction,
          ve.amount,
          '${item.id}' as aux_id,
          '${item.name}' as aux_name,
          '${item.category_name}' as category_name
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY v.voucher_date, v.voucher_no, ve.seq
      `
      const entries = db.prepare(detailSql).all(...params) as any[]
      allEntries.push(...entries)
    }

    // 按日期和凭证号排序
    allEntries.sort((a, b) => {
      if (a.voucher_date !== b.voucher_date) {
        return a.voucher_date.localeCompare(b.voucher_date)
      }
      return a.voucher_no.localeCompare(b.voucher_no)
    })

    res.json({
      code: 0,
      data: allEntries,
      initBalance: totalInitBalance,
    })
  } catch (error: any) {
    console.error('辅助项目明细账查询失败:', error)
    res.status(500).json({ code: 1, error: error.message || '查询失败' })
  }
})

export default router
 
