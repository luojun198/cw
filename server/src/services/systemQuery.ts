type SqlParam = string | number

function buildWhereClause(conditions: string[]) {
  if (conditions.length === 0) {
    return ''
  }

  return ` WHERE ${conditions.join(' AND ')}`
}

export function buildSystemUsersQuery(filters: {
  currentAccountSetId: string
}) {
  const conditions = ['u.account_set_id = ?']
  const params: SqlParam[] = [filters.currentAccountSetId]

  return {
    sql: `
      SELECT u.id, u.username, u.nickname, u.email, u.phone, u.status, u.last_login_at, u.created_at,
             u.account_set_id, u.role_id, a.name as account_set_name,
             r.name as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id AND r.account_set_id = u.account_set_id
      LEFT JOIN account_sets a ON a.id = u.account_set_id
      ${buildWhereClause(conditions)}
    `,
    params,
  }
}

export function buildSystemLogsQuery(filters: {
  accountSetId: string
  page: number
  pageSize: number
  userId?: string
  action?: string
  module?: string
  startDate?: string
  endDate?: string
}) {
  const conditions = ['account_set_id = ?']
  const params: SqlParam[] = [filters.accountSetId]

  if (filters.userId) {
    conditions.push('user_id = ?')
    params.push(filters.userId)
  }

  if (filters.action) {
    conditions.push('action LIKE ?')
    params.push(`%${filters.action}%`)
  }

  if (filters.module) {
    conditions.push('module = ?')
    params.push(filters.module)
  }

  if (filters.startDate) {
    conditions.push('created_at >= ?')
    params.push(filters.startDate)
  }

  if (filters.endDate) {
    conditions.push('created_at <= ?')
    params.push(`${filters.endDate} 23:59:59`)
  }

  const whereClause = buildWhereClause(conditions)
  const offset = (filters.page - 1) * filters.pageSize

  return {
    countSql: `SELECT COUNT(*) as count FROM operation_logs${whereClause}`,
    listSql: `
      SELECT * FROM operation_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    countParams: params,
    listParams: [...params, filters.pageSize, offset],
  }
}
