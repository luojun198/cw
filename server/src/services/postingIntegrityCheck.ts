import Database from 'better-sqlite3'

/**
 * 过账前数据完整性检查
 */

export interface IntegrityCheckResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface VoucherEntry {
  account_id: string
  direction: 'debit' | 'credit'
  amount: number
  [key: string]: any
}

/**
 * 检查过账前的数据完整性
 */
export function checkPostingIntegrity(
  db: Database.Database,
  accountSetId: string,
  year: number,
  period: number,
  entries: VoucherEntry[]
): IntegrityCheckResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 检查每个分录
  for (const entry of entries) {
    // 获取科目信息
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(entry.account_id) as any

    if (!account) {
      errors.push(`科目ID ${entry.account_id} 不存在`)
      continue
    }

    // 检查科目余额是否会为负数
    // no_negative=1 表示不允许负数，no_negative=0 表示允许负数
    if (account.no_negative === 1) {
      const currentBalance = getCurrentBalance(db, accountSetId, entry.account_id, year, period)

      // 计算余额变动：借方分录增加借方科目余额，贷方分录减少借方科目余额
      let newBalance: number
      if (account.direction === 'debit') {
        // 借方科目：借方分录增加余额，贷方分录减少余额
        newBalance = currentBalance + (entry.direction === 'debit' ? entry.amount : -entry.amount)
      } else {
        // 贷方科目：贷方分录增加余额，借方分录减少余额
        newBalance = currentBalance + (entry.direction === 'credit' ? entry.amount : -entry.amount)
      }

      if (newBalance < -0.01) {
        errors.push(
          `科目"${account.name}"不允许负数余额，过账后余额将为 ${newBalance.toFixed(2)} 元`
        )
      }
    }

    // 检查辅助核算是否完整
    if (account.is_aux === 1 && account.aux_types) {
      try {
        const auxTypes = JSON.parse(account.aux_types)
        for (const [auxCode, auxValue] of Object.entries(auxTypes)) {
          const auxFieldKey = `${auxCode}_id`
          if (!entry[auxFieldKey]) {
            errors.push(`科目"${account.name}"缺少${auxCode}辅助核算项目`)
          }
        }
      } catch (e) {
        warnings.push(`科目"${account.name}"的辅助核算配置解析失败`)
      }
    }

    // 检查现金/银行科目
    if (account.is_cash === 1 || account.is_bank === 1) {
      const accountType = account.is_cash === 1 ? '现金' : '银行存款'
      const currentBalance = getCurrentBalance(db, accountSetId, entry.account_id, year, period)
      // 现金/银行科目是借方科目
      const newBalance =
        currentBalance + (entry.direction === 'debit' ? entry.amount : -entry.amount)

      if (newBalance < -0.01) {
        warnings.push(
          `${accountType}科目"${account.name}"余额将为负数：${newBalance.toFixed(2)} 元`
        )
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 获取科目当前余额
 */
function getCurrentBalance(
  db: Database.Database,
  accountSetId: string,
  accountId: string,
  year: number,
  period: number
): number {
  const balance = db
    .prepare(
      `SELECT end_balance FROM account_balances 
       WHERE account_set_id = ? AND account_id = ? AND year = ? AND period = ?
       ORDER BY year DESC, period DESC LIMIT 1`
    )
    .get(accountSetId, accountId, year, period) as any

  return balance?.end_balance || 0
}
