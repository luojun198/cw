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
  auditorId?: string
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
    conditions.push('(v.voucher_no LIKE ? OR v.remark LIKE ? OR ve.summary LIKE ?)')
    const keywordPattern = `%${filters.keyword}%`
    params.push(keywordPattern, keywordPattern, keywordPattern)
  }

  if (filters.accountId) {
    conditions.push('EXISTS (SELECT 1 FROM voucher_entries WHERE voucher_id=v.id AND account_id=?)')
    params.push(filters.accountId)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  return {
    countSql: `SELECT COUNT(DISTINCT v.id) as count FROM vouchers v LEFT JOIN voucher_entries ve ON v.id=ve.voucher_id ${whereClause}`,
    listSql: `
      SELECT DISTINCT v.*, vt.name as voucher_type_name
      FROM vouchers v
      LEFT JOIN voucher_types vt ON v.voucher_type_id = vt.id
      LEFT JOIN voucher_entries ve ON v.id = ve.voucher_id
      ${whereClause}
      ORDER BY v.voucher_date DESC, v.voucher_no ASC
      LIMIT ? OFFSET ?
    `,
    countParams: params,
    listParams: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  }
}
