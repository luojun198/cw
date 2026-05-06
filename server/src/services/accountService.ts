import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { buildWhereClause, SqlParam } from './baseValidation.ts'

/**
 * 会计科目 Service 层
 * 将 SQL 逻辑从路由层抽离，提高可测试性和可维护性
 */

export interface Account {
  id: string
  account_set_id: string
  code: string
  name: string
  direction: string
  level: number
  parent_id: string | null
  is_aux: number
  aux_types: string | null
  is_enabled: number
  is_cash: number
  is_bank: number
  no_negative: number
  allow_delete: number
  created_at: string
  updated_at: string
}

export interface AccountQueryParams {
  account_set_id: string
  parent_id?: string
  keyword?: string
  direction?: string
  level?: number
  is_enabled?: number
}

export interface CreateAccountParams {
  account_set_id: string
  code: string
  name: string
  direction: string
  level?: number
  parent_id?: string | null
  is_aux?: boolean
  aux_types?: Record<string, string> | null
  is_enabled?: boolean
  is_cash?: boolean
  is_bank?: boolean
  no_negative?: boolean
  migrate_from_parent?: boolean
}

export interface UpdateAccountParams {
  name: string
  direction: string
  is_aux?: boolean
  aux_types?: Record<string, string> | null
  is_enabled?: boolean
  is_cash?: boolean
  is_bank?: boolean
  no_negative?: boolean
}

export interface AccountUsage {
  voucherCount: number
  balanceYears: number[]
  voucherYears: number[]
  years: number[]
}

export class AccountService {
  constructor(private db: Database.Database) {}

  /**
   * 获取系统参数
   */
  private getSystemParam(accountSetId: string, paramKey: string): string | null {
    const result = this.db
      .prepare('SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ?')
      .get(accountSetId, paramKey) as any
    return result?.param_value || null
  }

  /**
   * 验证科目编码格式
   */
  validateAccountCode(accountSetId: string, code: string, level: number): { valid: boolean; message?: string } {
    // 获取科目级数和长度配置
    const accountLevelsStr = this.getSystemParam(accountSetId, 'account_levels')
    const accountCodeLengthsStr = this.getSystemParam(accountSetId, 'account_code_lengths')

    if (!accountLevelsStr || !accountCodeLengthsStr) {
      // 如果没有配置，使用默认值：6级，4-2-2-2-2-2
      const maxLevels = 6
      const codeLengths = [4, 2, 2, 2, 2, 2]
      return this.validateCodeFormat(code, level, maxLevels, codeLengths)
    }

    const maxLevels = parseInt(accountLevelsStr)
    let codeLengths: number[]
    try {
      codeLengths = JSON.parse(accountCodeLengthsStr)
    } catch {
      return { valid: false, message: '系统参数配置错误' }
    }

    return this.validateCodeFormat(code, level, maxLevels, codeLengths)
  }

  /**
   * 验证编码格式
   */
  private validateCodeFormat(code: string, level: number, maxLevels: number, codeLengths: number[]): { valid: boolean; message?: string } {
    // 检查级数是否超过最大级数
    if (level > maxLevels) {
      return { valid: false, message: `科目级数不能超过${maxLevels}级` }
    }

    // 计算该级别科目应有的编码长度
    let expectedLength = 0
    for (let i = 0; i < level; i++) {
      expectedLength += codeLengths[i] || 0
    }

    // 检查编码长度
    if (code.length !== expectedLength) {
      const lengthDesc = codeLengths.slice(0, level).join('-')
      return { valid: false, message: `第${level}级科目编码长度应为${expectedLength}位（${lengthDesc}）` }
    }

    // 检查编码是否全为数字
    if (!/^\d+$/.test(code)) {
      return { valid: false, message: '科目编码只能包含数字' }
    }

    return { valid: true }
  }

  /**
   * 查询会计科目列表
   */
  getAccounts(params: AccountQueryParams): Account[] {
    const conditions = ['account_set_id = ?']
    const sqlParams: SqlParam[] = [params.account_set_id]

    if (params.parent_id) {
      conditions.push('parent_id = ?')
      sqlParams.push(params.parent_id)
    }

    if (params.keyword) {
      conditions.push('(name LIKE ? OR code LIKE ?)')
      const keywordPattern = `%${params.keyword}%`
      sqlParams.push(keywordPattern, `${params.keyword}%`)
    }

    if (params.direction) {
      conditions.push('direction = ?')
      sqlParams.push(params.direction)
    }

    if (params.level !== undefined) {
      conditions.push('level = ?')
      sqlParams.push(params.level)
    }

    if (params.is_enabled !== undefined) {
      conditions.push('is_enabled = ?')
      sqlParams.push(params.is_enabled)
    }

    const where = buildWhereClause(conditions)
    const sql = `SELECT * FROM accounts${where} GROUP BY id ORDER BY code`
    return this.db.prepare(sql).all(...sqlParams) as Account[]
  }

  /**
   * 根据 ID 获取科目
   */
  getAccountById(id: string): Account | null {
    return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | null
  }

  /**
   * 检查科目编码是否存在
   */
  isCodeExists(accountSetId: string, code: string, excludeId?: string): boolean {
    if (excludeId) {
      const result = this.db
        .prepare('SELECT id FROM accounts WHERE account_set_id = ? AND code = ? AND id != ?')
        .get(accountSetId, code, excludeId)
      return !!result
    }
    const result = this.db
      .prepare('SELECT id FROM accounts WHERE account_set_id = ? AND code = ?')
      .get(accountSetId, code)
    return !!result
  }

  /**
   * 获取科目使用情况
   */
  getAccountUsage(accountId: string): AccountUsage {
    const voucherCount =
      (
        this.db
          .prepare('SELECT COUNT(*) as cnt FROM voucher_entries WHERE account_id = ?')
          .get(accountId) as any
      )?.cnt || 0

    const balanceYears = this.db
      .prepare('SELECT DISTINCT year FROM init_balances WHERE account_id = ? ORDER BY year DESC')
      .all(accountId) as any[]

    const voucherYearRows = this.db
      .prepare(
        'SELECT DISTINCT v.year FROM voucher_entries ve JOIN vouchers v ON v.id = ve.voucher_id WHERE ve.account_id = ? ORDER BY v.year DESC'
      )
      .all(accountId) as any[]

    const years = [
      ...new Set([...balanceYears.map(r => r.year), ...voucherYearRows.map(r => r.year)]),
    ].sort((a, b) => b - a)

    return {
      voucherCount,
      balanceYears: balanceYears.map(r => r.year),
      voucherYears: voucherYearRows.map(r => r.year),
      years,
    }
  }

  /**
   * 统计科目的所有子科目数量（递归）
   */
  countAllChildren(accountId: string): number {
    const children = this.db
      .prepare('SELECT id FROM accounts WHERE parent_id = ?')
      .all(accountId) as { id: string }[]

    let count = children.length
    for (const child of children) {
      count += this.countAllChildren(child.id)
    }
    return count
  }

  /**
   * 创建会计科目
   */
  createAccount(params: CreateAccountParams): string {
    const actualLevel = params.level || 1

    // 验证科目编码格式
    const validation = this.validateAccountCode(params.account_set_id, params.code, actualLevel)
    if (!validation.valid) {
      throw new Error(validation.message || '科目编码格式错误')
    }

    const id = uuidv4()
    const auxTypesJson =
      params.aux_types &&
      typeof params.aux_types === 'object' &&
      Object.keys(params.aux_types).length > 0
        ? JSON.stringify(params.aux_types)
        : null
    const hasAux = auxTypesJson ? 1 : 0
    const allowNegative = params.no_negative ? 0 : 1

    this.db
      .prepare(
        `INSERT INTO accounts (id, account_set_id, code, name, direction, level, parent_id, is_aux, aux_types, is_enabled, is_cash, is_bank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.account_set_id,
        params.code,
        params.name,
        params.direction,
        actualLevel,
        params.parent_id || null,
        hasAux,
        auxTypesJson,
        params.is_enabled !== false ? 1 : 0,
        params.is_cash ? 1 : 0,
        params.is_bank ? 1 : 0
      )

    if (params.no_negative !== undefined) {
      this.db.prepare('UPDATE accounts SET no_negative = ? WHERE id = ?').run(allowNegative, id)
    }

    // 从父科目迁移数据
    if (params.parent_id && params.migrate_from_parent) {
      this.migrateFromParent(id, params.parent_id, params.code, params.name)
    }

    return id
  }

  /**
   * 从父科目迁移数据
   */
  private migrateFromParent(
    newAccountId: string,
    parentId: string,
    code: string,
    name: string
  ): void {
    // 迁移凭证分录
    const veCount = this.db
      .prepare('SELECT COUNT(*) as cnt FROM voucher_entries WHERE account_id = ?')
      .get(parentId) as any

    if (veCount?.cnt > 0) {
      this.db
        .prepare(
          'UPDATE voucher_entries SET account_id = ?, account_code = ?, account_name = ? WHERE account_id = ?'
        )
        .run(newAccountId, code, name, parentId)
    }

    // 迁移期初余额
    this.db
      .prepare('UPDATE init_balances SET account_id = ? WHERE account_id = ?')
      .run(newAccountId, parentId)
  }

  /**
   * 更新会计科目
   * 如果科目被禁用，则递归禁用所有下级科目
   * 如果科目被启用，则递归启用所有下级科目
   */
  updateAccount(id: string, params: UpdateAccountParams): void {
    // 获取修改前的状态，用于判断是否需要级联
    const oldAccount = this.getAccountById(id)
    const oldEnabled = oldAccount?.is_enabled

    const auxTypesJson =
      params.aux_types &&
      typeof params.aux_types === 'object' &&
      Object.keys(params.aux_types).length > 0
        ? JSON.stringify(params.aux_types)
        : null
    const hasAux = auxTypesJson ? 1 : 0

    // 将 is_enabled 转换为数字 0 或 1
    const newEnabled = params.is_enabled ? 1 : 0

    if (params.no_negative !== undefined) {
      const allowNegative = params.no_negative ? 1 : 0
      this.db
        .prepare(
          `UPDATE accounts
           SET name = ?, direction = ?, is_aux = ?, aux_types = ?, is_enabled = ?, is_cash = ?, is_bank = ?, no_negative = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          params.name,
          params.direction,
          hasAux,
          auxTypesJson,
          newEnabled,
          params.is_cash ? 1 : 0,
          params.is_bank ? 1 : 0,
          allowNegative,
          id
        )
    } else {
      this.db
        .prepare(
          `UPDATE accounts
           SET name = ?, direction = ?, is_aux = ?, aux_types = ?, is_enabled = ?, is_cash = ?, is_bank = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          params.name,
          params.direction,
          hasAux,
          auxTypesJson,
          newEnabled,
          params.is_cash ? 1 : 0,
          params.is_bank ? 1 : 0,
          id
        )
    }

    // 只有当状态发生变化时才级联处理子科目
    if (oldEnabled !== newEnabled) {
      if (newEnabled === 0) {
        // 禁用时级联禁用所有下级科目
        this.cascadeDisableChildren(id)
      } else {
        // 启用时级联启用所有下级科目
        this.cascadeEnableChildren(id)
      }
    }
  }

  /**
   * 递归禁用所有下级科目
   */
  private cascadeDisableChildren(parentId: string): void {
    const children = this.db
      .prepare('SELECT id, code, name FROM accounts WHERE parent_id = ?')
      .all(parentId) as { id: string; code: string; name: string }[]

    console.log(`禁用父科目的 ${children.length} 个子科目:`, children.map(c => c.code).join(', '))

    for (const child of children) {
      this.db
        .prepare('UPDATE accounts SET is_enabled = 0, updated_at = datetime(\'now\') WHERE id = ?')
        .run(child.id)
      // 递归处理下级的下级
      this.cascadeDisableChildren(child.id)
    }
  }

  /**
   * 递归启用所有下级科目
   */
  private cascadeEnableChildren(parentId: string): void {
    const children = this.db
      .prepare('SELECT id, code, name FROM accounts WHERE parent_id = ?')
      .all(parentId) as { id: string; code: string; name: string }[]

    console.log(`启用父科目的 ${children.length} 个子科目:`, children.map(c => c.code).join(', '))

    for (const child of children) {
      this.db
        .prepare('UPDATE accounts SET is_enabled = 1, updated_at = datetime(\'now\') WHERE id = ?')
        .run(child.id)
      // 递归处理下级的下级
      this.cascadeEnableChildren(child.id)
    }
  }

  /**
   * 删除会计科目
   */
  deleteAccount(id: string): void {
    const account = this.getAccountById(id)
    if (!account) {
      throw new Error('科目不存在')
    }

    if (!account.allow_delete) {
      throw new Error('系统内置科目无法删除')
    }

    // 检查是否有子科目
    const children = this.db
      .prepare('SELECT COUNT(*) as count FROM accounts WHERE parent_id = ?')
      .get(id) as any

    if (children?.count > 0) {
      throw new Error('该科目有子科目，请先删除子科目')
    }

    // 检查是否有期初余额
    const initBalance = this.db
      .prepare('SELECT COUNT(*) as count FROM init_balances WHERE account_id = ?')
      .get(id) as any

    if (initBalance?.count > 0) {
      throw new Error('该科目有期初余额，请先清除期初余额')
    }

    // 检查是否被凭证使用
    const used = this.db
      .prepare('SELECT COUNT(*) as count FROM voucher_entries WHERE account_id = ?')
      .get(id) as any

    if (used?.count > 0) {
      throw new Error('该科目已被凭证使用，无法删除')
    }

    // 检查是否在报表模板中使用
    const templateUsage = this.db
      .prepare('SELECT COUNT(*) as count FROM report_template_cells WHERE account_id = ?')
      .get(id) as any

    if (templateUsage?.count > 0) {
      throw new Error('该科目在报表模板中使用，请先修改报表模板')
    }

    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  }

  /**
   * 检查并补充缺失的父科目
   * 根据科目编码和配置的科目长度，自动创建缺失的上级科目
   */
  fillMissingParentAccounts(accountSetId: string): {
    checked: number
    created: number
    details: Array<{ code: string; name: string; level: number }>
  } {
    // 获取科目长度配置
    const accountCodeLengthsStr = this.getSystemParam(accountSetId, 'account_code_lengths')
    let codeLengths: number[]
    if (!accountCodeLengthsStr) {
      codeLengths = [4, 2, 2, 2, 2, 2] // 默认配置
    } else {
      try {
        codeLengths = JSON.parse(accountCodeLengthsStr)
      } catch {
        throw new Error('系统参数配置错误')
      }
    }

    // 获取所有科目
    const accounts = this.getAccounts({ account_set_id: accountSetId })
    const accountMap = new Map<string, Account>()
    accounts.forEach(acc => accountMap.set(acc.code, acc))

    const created: Array<{ code: string; name: string; level: number }> = []
    const toCreate: Array<{ code: string; level: number; direction: string }> = []

    // 检查每个科目的父科目是否存在
    for (const account of accounts) {
      const level = this.calculateLevel(account.code, codeLengths)

      // 如果是第一级科目，不需要父科目
      if (level === 1) continue

      // 计算所有上级科目编码
      const parentCodes = this.getParentCodes(account.code, codeLengths, level)

      for (const parentCode of parentCodes) {
        if (!accountMap.has(parentCode) && !toCreate.some(t => t.code === parentCode)) {
          const parentLevel = this.calculateLevel(parentCode, codeLengths)
          toCreate.push({
            code: parentCode,
            level: parentLevel,
            direction: account.direction, // 继承子科目的方向
          })
        }
      }
    }

    // 按级别和编码排序，确保先创建上级科目
    toCreate.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level
      return a.code.localeCompare(b.code)
    })

    // 创建缺失的父科目
    for (const item of toCreate) {
      const parentId = this.findParentId(item.code, codeLengths, accountMap)
      const id = uuidv4()

      this.db
        .prepare(
          `INSERT INTO accounts (id, account_set_id, code, name, direction, level, parent_id, is_aux, aux_types, is_enabled, is_cash, is_bank, allow_delete)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          accountSetId,
          item.code,
          '-', // 名称用"-"占位
          item.direction,
          item.level,
          parentId,
          0, // is_aux
          null, // aux_types
          1, // is_enabled
          0, // is_cash
          0, // is_bank
          1  // allow_delete
        )

      // 添加到 map 中，供后续科目查找父科目
      accountMap.set(item.code, {
        id,
        account_set_id: accountSetId,
        code: item.code,
        name: '-',
        direction: item.direction,
        level: item.level,
        parent_id: parentId,
        is_aux: 0,
        aux_types: null,
        is_enabled: 1,
        is_cash: 0,
        is_bank: 0,
        no_negative: 0,
        allow_delete: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      created.push({
        code: item.code,
        name: '-',
        level: item.level,
      })
    }

    return {
      checked: accounts.length,
      created: created.length,
      details: created,
    }
  }

  /**
   * 根据编码和长度配置计算科目级数
   */
  private calculateLevel(code: string, codeLengths: number[]): number {
    let totalLength = 0
    for (let i = 0; i < codeLengths.length; i++) {
      totalLength += codeLengths[i]
      if (code.length === totalLength) {
        return i + 1
      }
    }
    return 1
  }

  /**
   * 获取所有上级科目编码
   */
  private getParentCodes(code: string, codeLengths: number[], level: number): string[] {
    const parentCodes: string[] = []
    let currentLength = 0

    for (let i = 0; i < level - 1; i++) {
      currentLength += codeLengths[i]
      parentCodes.push(code.substring(0, currentLength))
    }

    return parentCodes
  }

  /**
   * 查找父科目ID
   */
  private findParentId(code: string, codeLengths: number[], accountMap: Map<string, Account>): string | null {
    const level = this.calculateLevel(code, codeLengths)
    if (level === 1) return null

    const parentCodes = this.getParentCodes(code, codeLengths, level)
    const immediateParentCode = parentCodes[parentCodes.length - 1]

    const parent = accountMap.get(immediateParentCode)
    return parent ? parent.id : null
  }
}
