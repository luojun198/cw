type SqlParam = string | number

function buildWhereClause(conditions: string[]) {
  if (conditions.length === 0) {
    return ''
  }

  return ` WHERE ${conditions.join(' AND ')}`
}

export function buildLedgerGeneralQuery(filters: {
  accountSetId: string
  startDate?: string // 开始日期
  endDate?: string // 结束日期
  accountCode?: string
  accountLevel?: number
  accountCodeStart?: string
  accountCodeEnd?: string
  filterTypes?: string[]
  includeUnposted?: boolean
}) {
  // 如果没有指定日期，使用当前年月
  const now = new Date()
  const defaultStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultEndDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

  const startDate = filters.startDate || defaultStartDate
  const endDate = filters.endDate || defaultEndDate

  // 计算本年累计的起始日期（当年1月1日）
  const yearStartDate = `${new Date(endDate).getFullYear()}-01-01`

  // 构建凭证状态过滤条件
  const statusCondition = filters.includeUnposted
    ? "v.status IN ('draft', 'audited', 'posted')"
    : "v.status = 'posted'"

  // 构建科目筛选条件
  const accountConditions = ['a.account_set_id = ?', 'a.is_enabled = 1']
  const accountParams: SqlParam[] = [filters.accountSetId]

  // 科目编码筛选
  if (filters.accountCode) {
    accountConditions.push('a.code LIKE ?')
    accountParams.push(`${filters.accountCode}%`)
  }

  // 科目级次筛选
  if (filters.accountLevel) {
    accountConditions.push('a.level <= ?')
    accountParams.push(filters.accountLevel)
  }

  // 科目范围查询
  if (filters.accountCodeStart) {
    accountConditions.push('a.code >= ?')
    accountParams.push(filters.accountCodeStart)
  }
  if (filters.accountCodeEnd) {
    accountConditions.push('a.code <= ?')
    accountParams.push(filters.accountCodeEnd)
  }

  // 根据筛选类型构建WHERE子句（支持多选，使用OR连接）
  let havingClause = ''
  if (filters.filterTypes && filters.filterTypes.length > 0) {
    const conditions: string[] = []

    if (filters.filterTypes.includes('init_balance')) {
      conditions.push('init_balance != 0')
    }

    if (filters.filterTypes.includes('has_amount')) {
      conditions.push('(current_debit != 0 OR current_credit != 0)')
    }

    if (filters.filterTypes.includes('has_balance')) {
      conditions.push('end_balance != 0')
    }

    if (conditions.length > 0) {
      havingClause = ` AND (${conditions.join(' OR ')})`
    }
  }

  // 从 accounts 表出发，计算日期区间内的发生额
  // 将 UNION ALL 包在子查询中，外层再应用 filter_types 过滤
  return {
    sql: `
      SELECT * FROM (
        SELECT * FROM (
          SELECT
            a.id as account_id,
            a.code as account_code,
            a.name as account_name,
            a.direction,
            a.level,
            COALESCE(
              (SELECT SUM(ib.init_balance) FROM init_balances ib
               WHERE ib.account_id = a.id AND ib.account_set_id = ?),
              0
            ) + COALESCE(
              (SELECT
                 CASE WHEN a.direction = 'debit'
                   THEN SUM(CASE WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END)
                   ELSE SUM(CASE WHEN ve.direction = 'credit' THEN ve.amount ELSE -ve.amount END)
                 END
               FROM voucher_entries ve
               JOIN vouchers v ON v.id = ve.voucher_id
               WHERE ve.account_id = a.id
                 AND ve.account_set_id = ?
                 AND ${statusCondition}
                 AND v.voucher_date < ?),
              0
            ) as init_balance,
            COALESCE(
              (SELECT SUM(ve.amount)
               FROM voucher_entries ve
               JOIN vouchers v ON v.id = ve.voucher_id
               WHERE ve.account_id = a.id
                 AND ve.account_set_id = ?
                 AND ve.direction = 'debit'
                 AND ${statusCondition}
                 AND v.voucher_date >= ?
                 AND v.voucher_date <= ?),
              0
            ) as current_debit,
            COALESCE(
              (SELECT SUM(ve.amount)
               FROM voucher_entries ve
               JOIN vouchers v ON v.id = ve.voucher_id
               WHERE ve.account_id = a.id
                 AND ve.account_set_id = ?
                 AND ve.direction = 'credit'
                 AND ${statusCondition}
                 AND v.voucher_date >= ?
                 AND v.voucher_date <= ?),
              0
            ) as current_credit,
            COALESCE(
              (SELECT SUM(ve.amount)
               FROM voucher_entries ve
               JOIN vouchers v ON v.id = ve.voucher_id
               WHERE ve.account_id = a.id
                 AND ve.account_set_id = ?
                 AND ve.direction = 'debit'
                 AND ${statusCondition}
                 AND v.voucher_date >= ?
                 AND v.voucher_date <= ?),
              0
            ) as year_debit,
            COALESCE(
              (SELECT SUM(ve.amount)
               FROM voucher_entries ve
               JOIN vouchers v ON v.id = ve.voucher_id
               WHERE ve.account_id = a.id
                 AND ve.account_set_id = ?
                 AND ve.direction = 'credit'
                 AND ${statusCondition}
                 AND v.voucher_date >= ?
                 AND v.voucher_date <= ?),
              0
            ) as year_credit,
            COALESCE(
              (SELECT SUM(ib.init_balance) FROM init_balances ib
               WHERE ib.account_id = a.id AND ib.account_set_id = ?),
              0
            ) + COALESCE(
              (SELECT
                 CASE WHEN a.direction = 'debit'
                   THEN SUM(CASE WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END)
                   ELSE SUM(CASE WHEN ve.direction = 'credit' THEN ve.amount ELSE -ve.amount END)
                 END
               FROM voucher_entries ve
               JOIN vouchers v ON v.id = ve.voucher_id
               WHERE ve.account_id = a.id
                 AND ve.account_set_id = ?
                 AND ${statusCondition}
                 AND v.voucher_date <= ?),
              0
            ) as end_balance
          FROM accounts a
          ${buildWhereClause(accountConditions)}
        )

        UNION ALL

        SELECT
          p.id as account_id,
          p.code as account_code,
          p.name as account_name,
          p.direction,
          p.level,
          0 as init_balance,
          0 as current_debit,
          0 as current_credit,
          0 as year_debit,
          0 as year_credit,
          0 as end_balance
        FROM accounts p
        WHERE p.account_set_id = ?
          AND p.is_enabled = 1
          AND p.id IN (
            SELECT DISTINCT parent_id FROM accounts a
            WHERE a.account_set_id = ?
              AND a.is_enabled = 1
              AND a.parent_id IS NOT NULL
              AND a.id IN (
                SELECT a2.id FROM accounts a2
                WHERE a2.account_set_id = ?
                  AND a2.is_enabled = 1
              )
          )
      ) WHERE 1=1 ${havingClause}
      ORDER BY account_code
    `,
    params: [
      filters.accountSetId, // 期初余额查询
      filters.accountSetId,
      startDate, // 期初余额计算
      filters.accountSetId,
      startDate,
      endDate, // 本期借方
      filters.accountSetId,
      startDate,
      endDate, // 本期贷方
      filters.accountSetId,
      yearStartDate,
      endDate, // 本年累计借方
      filters.accountSetId,
      yearStartDate,
      endDate, // 本年累计贷方
      filters.accountSetId, // 期末余额查询
      filters.accountSetId,
      endDate, // 期末余额计算
      filters.accountSetId, // 父科目查询
      filters.accountSetId, // 父科目过滤
      filters.accountSetId, // 父科目内层查询
      ...accountParams,
    ],
  }
}

export function buildLedgerBalanceQuery(filters: {
  accountSetId: string
  year?: string | number
  period?: string | number
}) {
  const y = Number(filters.year) || new Date().getFullYear()
  const p = Number(filters.period) || new Date().getMonth() + 1

  // 期初余额子查询：汇总该科目本年期初余额（可能有多个辅助核算项）
  const initBalanceSubquery = `
    SELECT account_id, SUM(init_balance) as init_balance
    FROM init_balances
    WHERE year = ? AND account_set_id = ?
    GROUP BY account_id
  `

  // 本期发生额子查询：汇总该科目的所有辅助核算项
  const currentBalanceSubquery = `
    SELECT
      account_id,
      SUM(current_debit) as current_debit,
      SUM(current_credit) as current_credit,
      SUM(end_balance) as end_balance
    FROM account_balances
    WHERE year = ? AND period = ? AND account_set_id = ?
    GROUP BY account_id
  `

  return {
    sql: `
      SELECT * FROM (
        SELECT
          a.code as account_code,
          a.name as account_name,
          a.direction,
          a.level,
          COALESCE(ib.init_balance, 0) as init_balance,
          COALESCE(cb.current_debit, 0) as current_debit,
          COALESCE(cb.current_credit, 0) as current_credit,
          COALESCE(cb.end_balance, 0) as end_balance
        FROM accounts a
        LEFT JOIN (${initBalanceSubquery}) ib ON ib.account_id = a.id
        LEFT JOIN (${currentBalanceSubquery}) cb ON cb.account_id = a.id
        WHERE a.account_set_id = ? AND a.is_enabled = 1
      ) WHERE init_balance != 0 OR current_debit != 0 OR current_credit != 0 OR end_balance != 0
      ORDER BY account_code
    `,
    params: [y, filters.accountSetId, y, p, filters.accountSetId, filters.accountSetId],
  }
}

// ===================== 总分类账（带月度汇总） =====================

export function buildGeneralLedgerQuery(filters: {
  accountSetId: string
  year?: string | number
  accountCode?: string
  accountLevel?: number
  includeUnposted?: boolean
}) {
  const y = Number(filters.year) || new Date().getFullYear()

  // 构建凭证状态过滤条件
  const statusCondition = filters.includeUnposted
    ? "v.status IN ('draft', 'audited', 'posted')"
    : "v.status = 'posted'"

  // 构建月份子查询（1-12月各自的发生额）
  const monthSubqueries: string[] = []
  const monthParams: SqlParam[] = []

  for (let month = 1; month <= 12; month++) {
    // 期初余额（截止到该月之前）
    const periodStart = month === 1 ? `${y}-01-01` : `${y}-${String(month).padStart(2, '0')}-01`
    const periodEnd = `${y}-${String(month).padStart(2, '0')}-31`

    // 月度借方发生额
    monthSubqueries.push(`
      COALESCE((
        SELECT SUM(ve.amount)
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        WHERE ve.account_id = a.id
          AND ve.account_set_id = ?
          AND ve.direction = 'debit'
          AND ${statusCondition}
          AND v.voucher_date >= '${periodStart}'
          AND v.voucher_date <= '${periodEnd}'
      ), 0) as month${month}_debit`)

    // 月度贷方发生额
    monthSubqueries.push(`
      COALESCE((
        SELECT SUM(ve.amount)
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        WHERE ve.account_id = a.id
          AND ve.account_set_id = ?
          AND ve.direction = 'credit'
          AND ${statusCondition}
          AND v.voucher_date >= '${periodStart}'
          AND v.voucher_date <= '${periodEnd}'
      ), 0) as month${month}_credit`)

    // 每个月份需要2个参数（借方贷方各用一次 account_set_id）
    monthParams.push(filters.accountSetId)
    monthParams.push(filters.accountSetId)
  }

  // 科目筛选条件
  const conditions: string[] = ['a.account_set_id = ?', 'a.is_enabled = 1']
  const accountParams: SqlParam[] = [filters.accountSetId]

  if (filters.accountCode) {
    conditions.push('a.code LIKE ?')
    accountParams.push(`${filters.accountCode}%`)
  }
  if (filters.accountLevel) {
    conditions.push('a.level <= ?')
    accountParams.push(filters.accountLevel)
  }

  return {
    sql: `
      SELECT
        a.id as account_id,
        a.code as account_code,
        a.name as account_name,
        a.direction,
        a.level,
        a.parent_id,
        -- 期初余额 = init_balances + 该年1月1日之前的凭证累计
        COALESCE(
          (SELECT SUM(ib.init_balance) FROM init_balances ib
           WHERE ib.account_id = a.id AND ib.account_set_id = ? AND ib.year = ?),
          0
        ) + COALESCE(
          (SELECT
             CASE WHEN a.direction = 'debit'
               THEN SUM(CASE WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END)
               ELSE SUM(CASE WHEN ve.direction = 'credit' THEN ve.amount ELSE -ve.amount END)
             END
           FROM voucher_entries ve
           JOIN vouchers v ON v.id = ve.voucher_id
           WHERE ve.account_id = a.id
             AND ve.account_set_id = ?
             AND ${statusCondition}
             AND v.voucher_date < '${y}-01-01'),
          0
        ) as init_balance,
        -- 各月发生额
        ${monthSubqueries.join(',\n        ')}
      FROM accounts a
      ${buildWhereClause(conditions)}
    `,
    params: [
      // init_balances 期初余额
      filters.accountSetId,
      y,
      // 期初余额凭证查询
      filters.accountSetId,
      // 月度发生额（每个月份2个参数）
      ...monthParams,
      // 科目筛选
      ...accountParams,
    ],
  }
}

export function buildCashJournalQuery(filters: {
  accountSetId: string
  year?: string | number
  period?: string | number
  accountId?: string
  accountType?: string
  direction?: string
  minAmount?: number
  maxAmount?: number
  oppositeAccountCode?: string
  includeUnposted?: boolean
}) {
  const y = Number(filters.year) || new Date().getFullYear()
  const p = Number(filters.period) || new Date().getMonth() + 1

  // 构建凭证状态过滤条件
  const statusCondition = filters.includeUnposted
    ? "v.status IN ('draft', 'audited', 'posted')"
    : "v.status = 'posted'"

  const conditions = ['ve.account_set_id = ?', 'v.year = ?', 'v.period = ?', statusCondition]
  const params: SqlParam[] = [filters.accountSetId, y, p]

  if (filters.accountId) {
    conditions.push('ve.account_id = ?')
    params.push(filters.accountId)
  } else if (filters.accountType === 'cash') {
    conditions.push('a.is_cash = 1')
  } else if (filters.accountType === 'bank') {
    conditions.push('a.is_bank = 1')
  }

  // 收支类型筛选
  if (filters.direction) {
    conditions.push('ve.direction = ?')
    params.push(filters.direction)
  }

  // 金额范围筛选
  if (filters.minAmount !== undefined) {
    conditions.push('ve.amount >= ?')
    params.push(filters.minAmount)
  }
  if (filters.maxAmount !== undefined) {
    conditions.push('ve.amount <= ?')
    params.push(filters.maxAmount)
  }

  // 对方科目筛选 (需要子查询)
  let oppositeAccountFilter = ''
  if (filters.oppositeAccountCode) {
    oppositeAccountFilter = `
      AND EXISTS (
        SELECT 1 FROM voucher_entries ve2
        WHERE ve2.voucher_id = ve.voucher_id
          AND ve2.id != ve.id
          AND ve2.account_code LIKE ?
      )
    `
    params.push(`${filters.oppositeAccountCode}%`)
  }

  // 查询对方科目：从同一凭证的其他分录中获取
  // 使用 GROUP_CONCAT 合并多个对方科目
  return {
    sql: `
      SELECT
        v.voucher_date,
        v.voucher_no,
        a.code as account_code,
        a.name as account_name,
        ve.summary,
        ve.direction,
        ve.amount,
        v.maker_name,
        v.auditor_name,
        (
          SELECT GROUP_CONCAT(ve2.account_code || ' ' || ve2.account_name, ', ')
          FROM voucher_entries ve2
          WHERE ve2.voucher_id = ve.voucher_id
            AND ve2.id != ve.id
        ) as opposite_accounts
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      JOIN accounts a ON a.id = ve.account_id
      ${buildWhereClause(conditions)}
      ${oppositeAccountFilter}
      ORDER BY v.voucher_date, v.voucher_no, ve.seq
    `,
    params,
  }
}

export function buildLedgerDetailQuery(filters: {
  accountSetId: string
  year?: string | number
  period?: string | number
  accountId?: string
  startDate?: string
  endDate?: string
  auxType?: string
  auxId?: string
  voucherTypeId?: string
  makerName?: string
  auditorName?: string
  summaryKeyword?: string
  minAmount?: number
  maxAmount?: number
  includeUnposted?: boolean
  page: number
  pageSize: number
}) {
  const y = Number(filters.year) || new Date().getFullYear()
  const p = Number(filters.period) || new Date().getMonth() + 1

  // 构建凭证状态过滤条件
  const statusCondition = filters.includeUnposted
    ? "v.status IN ('draft', 'audited', 'posted')"
    : "v.status = 'posted'"

  const conditions = ['ve.account_set_id = ?', statusCondition]
  const params: SqlParam[] = [filters.accountSetId]

  if (filters.accountId) {
    conditions.push('ve.account_id = ?')
    params.push(filters.accountId)
  }

  if (filters.startDate) {
    conditions.push('v.voucher_date >= ?')
    params.push(filters.startDate)
  }

  if (filters.endDate) {
    conditions.push('v.voucher_date <= ?')
    params.push(filters.endDate)
  }

  // 辅助核算筛选
  if (filters.auxType && filters.auxId) {
    const fieldMap: Record<string, string> = {
      dept: 'dept_id',
      project: 'project_id',
      supplier: 'supplier_id',
      person: 'person_id',
      func_class: 'func_class_id',
    }
    const fieldName = fieldMap[filters.auxType]
    if (fieldName) {
      conditions.push(`ve.${fieldName} = ?`)
      params.push(filters.auxId)
    }
  }

  // 凭证类型筛选
  if (filters.voucherTypeId) {
    conditions.push('v.voucher_type_id = ?')
    params.push(filters.voucherTypeId)
  }

  // 制单人筛选
  if (filters.makerName) {
    conditions.push('v.maker_name LIKE ?')
    params.push(`%${filters.makerName}%`)
  }

  // 审核人筛选
  if (filters.auditorName) {
    conditions.push('v.auditor_name LIKE ?')
    params.push(`%${filters.auditorName}%`)
  }

  // 摘要关键词搜索
  if (filters.summaryKeyword) {
    conditions.push('ve.summary LIKE ?')
    params.push(`%${filters.summaryKeyword}%`)
  }

  // 金额范围筛选
  if (filters.minAmount !== undefined) {
    conditions.push('ve.amount >= ?')
    params.push(filters.minAmount)
  }
  if (filters.maxAmount !== undefined) {
    conditions.push('ve.amount <= ?')
    params.push(filters.maxAmount)
  }

  // 如果提供了日期范围，使用日期范围计算期初余额
  // 否则使用年份期间从期初余额表查询
  let initBalanceSql: string
  let initBalanceParams: SqlParam[]

  if (filters.startDate && filters.accountId) {
    // 使用日期范围计算期初余额：期初余额表 + 开始日期之前的凭证
    initBalanceSql = `
      SELECT
        COALESCE(
          (SELECT SUM(ib.init_balance) FROM init_balances ib
           WHERE ib.account_id = ? AND ib.account_set_id = ?),
          0
        ) + COALESCE(
          (SELECT
             CASE WHEN a.direction = 'debit'
               THEN SUM(CASE WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END)
               ELSE SUM(CASE WHEN ve.direction = 'credit' THEN ve.amount ELSE -ve.amount END)
             END
           FROM voucher_entries ve
           JOIN vouchers v ON v.id = ve.voucher_id
           JOIN accounts a ON a.id = ve.account_id
           WHERE ve.account_id = ?
             AND ve.account_set_id = ?
             AND ${statusCondition}
             AND v.voucher_date < ?),
          0
        ) as init_balance
    `
    initBalanceParams = [
      filters.accountId,
      filters.accountSetId,
      filters.accountId,
      filters.accountSetId,
      filters.startDate,
    ]
  } else {
    // 使用年份期间查询期初余额表
    initBalanceSql = `
      SELECT ib.init_balance
      FROM init_balances ib
      WHERE ib.account_set_id = ?
        AND ib.account_id = ?
        AND ib.year = ?
        AND ib.period = ?
      LIMIT 1
    `
    initBalanceParams = [filters.accountSetId, filters.accountId || '', y, p]
  }

  return {
    initBalanceSql,
    initBalanceParams,
    listSql: `
      SELECT ve.*, v.voucher_no, v.voucher_date, v.status as voucher_status,
             vt.name as voucher_type_name, v.maker_name, v.auditor_name
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      LEFT JOIN voucher_types vt ON v.voucher_type_id = vt.id
      ${buildWhereClause(conditions)}
      ORDER BY v.voucher_date, v.voucher_no, ve.seq
      LIMIT ? OFFSET ?
    `,
    listParams: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  }
}

export function buildChronologicalQuery(filters: {
  accountSetId: string
  year?: string | number
  period?: string | number
  startDate?: string
  endDate?: string
  includeUnposted?: boolean
  page: number
  pageSize: number
}) {
  const y = Number(filters.year) || new Date().getFullYear()
  const p = Number(filters.period) || new Date().getMonth() + 1

  // 构建凭证状态过滤条件
  const statusCondition = filters.includeUnposted
    ? "v.status IN ('draft', 'audited', 'posted')"
    : "v.status = 'posted'"

  const conditions = ['v.account_set_id = ?', 'v.year = ?', 'v.period = ?', statusCondition]
  const params: SqlParam[] = [filters.accountSetId, y, p]

  if (filters.startDate) {
    conditions.push('v.voucher_date >= ?')
    params.push(filters.startDate)
  }

  if (filters.endDate) {
    conditions.push('v.voucher_date <= ?')
    params.push(filters.endDate)
  }

  const whereClause = buildWhereClause(conditions)

  return {
    countSql: `SELECT COUNT(*) as count FROM vouchers v${whereClause}`,
    listSql: `
      SELECT ve.*, v.voucher_no, v.voucher_date, vt.name as voucher_type_name, v.maker_name, v.status as voucher_status
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      LEFT JOIN voucher_types vt ON v.voucher_type_id = vt.id
      ${whereClause}
      ORDER BY v.voucher_date, v.voucher_no, ve.seq
      LIMIT ? OFFSET ?
    `,
    countParams: params,
    listParams: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  }
}
