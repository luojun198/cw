export interface VoucherListFilters {
  accountSetId: string
  page: number
  pageSize: number
  year?: string | number
  period?: string | number
  status?: string
  keyword?: string
  startDate?: string
  endDate?: string
  accountId?: string
  accountIds?: number[]
  auditorId?: string
  voucherTypeIds?: string[]
  auxItems?: Record<string, number[]>
  auxFields?: Record<string, string>
  sortField?: string
  sortOrder?: string
}

export interface BatchVoucherQueryFilters {
  voucherTypeIds: string[]
  accountSetId: string
  startDate: string
  endDate: string
  startNo?: string | number | null
  endNo?: string | number | null
}

export function buildBatchVoucherQuery({
  voucherTypeIds,
  accountSetId,
  startDate,
  endDate,
  startNo,
  endNo,
}: BatchVoucherQueryFilters) {
  const placeholders = voucherTypeIds.map(() => '?').join(',')
  const conditions = [
    'account_set_id=?',
    `voucher_type_id IN (${placeholders})`,
    'voucher_date>=?',
    'voucher_date<=?',
  ]
  const params: Array<string | number> = [accountSetId, ...voucherTypeIds, startDate, endDate]

  const hasStartNo = startNo !== undefined && startNo !== null && String(startNo).trim() !== ''
  const hasEndNo = endNo !== undefined && endNo !== null && String(endNo).trim() !== ''

  if (hasStartNo) {
    conditions.push("CAST(SUBSTR(voucher_no, INSTR(voucher_no, '-') + 1) AS INTEGER) >= ?")
    params.push(Number(startNo))
  }

  if (hasEndNo) {
    conditions.push("CAST(SUBSTR(voucher_no, INSTR(voucher_no, '-') + 1) AS INTEGER) <= ?")
    params.push(Number(endNo))
  }

  return {
    sql: `SELECT id, voucher_no, status, maker_id FROM vouchers WHERE ${conditions.join(' AND ')} ORDER BY voucher_date ASC, voucher_no ASC`,
    params,
  }
}

export function buildVoucherListQuery(filters: VoucherListFilters) {
  const conditions = ['v.account_set_id = ?']
  const params: Array<string | number> = [filters.accountSetId]

  if (filters.year !== undefined && filters.year !== '') {
    conditions.push('v.year = ?')
    params.push(Number(filters.year))
  }

  if (filters.period !== undefined && filters.period !== '') {
    conditions.push('v.period = ?')
    params.push(Number(filters.period))
  }

  if (filters.status) {
    conditions.push('v.status = ?')
    params.push(filters.status)
  }

  if (filters.startDate) {
    conditions.push('v.voucher_date >= ?')
    params.push(filters.startDate)
  }

  if (filters.endDate) {
    conditions.push('v.voucher_date <= ?')
    params.push(filters.endDate)
  }

  if (filters.auditorId) {
    conditions.push('v.auditor_id = ?')
    params.push(filters.auditorId)
  }

  if (filters.keyword) {
    const keywordPattern = `%${filters.keyword}%`
    // 基础字段：凭证号、备注、摘要、金额、制单人、记账人
    // 科目字段：科目编码、科目名称
    // 辅助核算：通过 JSON 搜索 aux_data 中的所有内容（包括辅助项目名称和自定义字段值）
    conditions.push(`(
      v.voucher_no LIKE ? 
      OR v.remark LIKE ? 
      OR ve.summary LIKE ? 
      OR CAST(v.total_amount AS TEXT) LIKE ? 
      OR v.maker_name LIKE ? 
      OR v.poster_name LIKE ?
      OR ve.account_code LIKE ?
      OR ve.account_name LIKE ?
      OR ve.aux_data LIKE ?
    )`)
    params.push(keywordPattern, keywordPattern, keywordPattern, keywordPattern, keywordPattern, keywordPattern, keywordPattern, keywordPattern, keywordPattern)
  }

  if (filters.accountId) {
    conditions.push('EXISTS (SELECT 1 FROM voucher_entries WHERE voucher_id=v.id AND account_id=?)')
    params.push(filters.accountId)
  }

  // 科目多选筛选
  if (filters.accountIds && filters.accountIds.length > 0) {
    const placeholders = filters.accountIds.map(() => '?').join(',')
    conditions.push(`EXISTS (SELECT 1 FROM voucher_entries WHERE voucher_id=v.id AND account_id IN (${placeholders}))`)
    params.push(...filters.accountIds)
  }

  if (filters.voucherTypeIds && filters.voucherTypeIds.length > 0) {
    const placeholders = filters.voucherTypeIds.map(() => '?').join(',')
    conditions.push(`v.voucher_type_id IN (${placeholders})`)
    params.push(...filters.voucherTypeIds)
  }

  // 辅助核算项目筛选（支持多选）
  // aux_data 格式：{ category_code: { id: itemId, field_values: {...} } }
  // filters.auxItems 的 key 已经是 categoryCode（在路由层转换）
  if (filters.auxItems) {
    for (const [categoryCode, itemIds] of Object.entries(filters.auxItems)) {
      if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
        const placeholders = itemIds.map(() => '?').join(',')
        conditions.push(
          `EXISTS (SELECT 1 FROM voucher_entries ve2 
           WHERE ve2.voucher_id = v.id 
           AND json_extract(ve2.aux_data, '$.${categoryCode}.id') IN (${placeholders}))`
        )
        params.push(...itemIds)
      }
    }
  }

  // 辅助核算自定义字段筛选
  // field_values 存储在 aux_data 的 category_code.field_values 中
  // filters.auxFields 的 key 格式：categoryCode_fieldKey（在路由层转换）
  if (filters.auxFields) {
    for (const [key, value] of Object.entries(filters.auxFields)) {
      if (value) {
        // key 格式：categoryCode_fieldKey
        const parts = key.split('_')
        if (parts.length >= 2) {
          const categoryCode = parts[0]
          const fieldKey = parts.slice(1).join('_')
          conditions.push(
            `EXISTS (SELECT 1 FROM voucher_entries ve3 
             WHERE ve3.voucher_id = v.id 
             AND json_extract(ve3.aux_data, '$.${categoryCode}.field_values.${fieldKey}') LIKE ?)`
          )
          params.push(`%${value}%`)
        }
      }
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  // 动态排序：仅允许安全字段，防止 SQL 注入
  const allowedSortFields: Record<string, string> = {
    voucher_date: 'v.voucher_date',
    voucher_no: 'v.voucher_no',
    created_at: 'v.created_at',
    debit_amount: 'COALESCE((SELECT SUM(amount) FROM voucher_entries WHERE voucher_id=v.id AND direction=\'debit\'), 0)',
    credit_amount: 'COALESCE((SELECT SUM(amount) FROM voucher_entries WHERE voucher_id=v.id AND direction=\'credit\'), 0)',
  }
  const sortExpr = allowedSortFields[filters.sortField || 'voucher_date'] || 'v.voucher_date'
  const sortDir = filters.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const orderBy = `ORDER BY ${sortExpr} ${sortDir}, v.voucher_no ASC`

  // pageSize 为 -1 时返回全部，不加 LIMIT/OFFSET
  const isAll = filters.pageSize === -1
  const limitClause = isAll ? '' : '\n      LIMIT ? OFFSET ?'

  return {
    countSql: `SELECT COUNT(DISTINCT v.id) as count FROM vouchers v LEFT JOIN voucher_entries ve ON v.id=ve.voucher_id ${whereClause}`,
    listSql: `
      SELECT DISTINCT v.*, vt.name as voucher_type_name
      FROM vouchers v
      LEFT JOIN voucher_types vt ON v.voucher_type_id = vt.id
      LEFT JOIN voucher_entries ve ON v.id = ve.voucher_id
      ${whereClause}
      ${orderBy}${limitClause}
    `,
    countParams: params,
    listParams: isAll ? params : [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  }
}
