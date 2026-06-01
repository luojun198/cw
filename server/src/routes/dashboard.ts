import { Router } from 'express'
import dayjs from 'dayjs'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, requirePermission } from '../middleware/index.js'
import {
  buildAccountCategoryPredicate,
  getDashboardCategoryConfig,
  type DashboardCategoryPredicates,
} from '../services/dashboardCategoryConfig.js'

const router = Router()
router.use(authMiddleware)
router.use(requirePermission('system:dashboard'))

router.use((req: AuthRequest, res, next) => {
  if (!req.accountSetId) {
    return res.status(400).json({ code: 400, message: '账套未选择，请重新登录' })
  }
  next()
})

/**
 * 决定"本期"的语义：
 *   1. 优先：period_closing 表里最大已结账期的"下一期"（即第一个未结账期）。
 *      用 ORDER BY year DESC, period DESC LIMIT 1 取最后一条 closed，加 1。
 *   2. 退化：vouchers 表最新 (year, period)。
 *   3. 兜底：账套 fiscal_year + 当前自然月。
 */
export function getDashboardPeriod(db: ReturnType<typeof getDb>, accountSetId?: string) {
  // 1) period_closing 推导
  const lastClosed = db
    .prepare(
      `SELECT year, period FROM period_closing
       WHERE account_set_id=? AND status='closed'
       ORDER BY year DESC, period DESC LIMIT 1`
    )
    .get(accountSetId) as any
  if (lastClosed?.year && lastClosed?.period) {
    let y = Number(lastClosed.year)
    let m = Number(lastClosed.period) + 1
    if (m > 12) { m = 1; y += 1 }
    return { year: y, period: m }
  }

  // 2) vouchers 最新
  const latestVoucher = db
    .prepare(
      `SELECT year, period FROM vouchers
       WHERE account_set_id=?
       ORDER BY year DESC, period DESC, voucher_date DESC, voucher_no DESC
       LIMIT 1`
    )
    .get(accountSetId) as any
  if (latestVoucher?.year && latestVoucher?.period) {
    return { year: Number(latestVoucher.year), period: Number(latestVoucher.period) }
  }

  // 3) 兜底
  const accountSet = db
    .prepare('SELECT fiscal_year FROM account_sets WHERE id=?')
    .get(accountSetId) as any
  const now = dayjs()
  return {
    year: Number(accountSet?.fiscal_year) || now.year(),
    period: now.month() + 1,
  }
}

/**
 * 损益判定（兼容旧测试导出）：名称关键字 + 方向
 */
export const INCOME_PREDICATE = `a.name LIKE '%收入%' AND a.direction='credit'`
export const EXPENSE_PREDICATE = `(a.name LIKE '%支出%' OR a.name LIKE '%费用%' OR a.name LIKE '%成本%') AND a.direction='debit'`
export const PURE_EXPENSE_PREDICATE = `a.name LIKE '%支出%' AND a.direction='debit'`
export const FEE_PREDICATE = `a.name LIKE '%费用%' AND a.direction='debit'`
export const COST_PREDICATE = `a.name LIKE '%成本%' AND a.direction='debit'`

export { buildAccountCategoryPredicate }

export const INCOME_CATEGORY_PREDICATE = buildAccountCategoryPredicate('收入', 'credit')
export const PURE_EXPENSE_CATEGORY_PREDICATE = buildAccountCategoryPredicate('支出', 'debit')
export const FEE_CATEGORY_PREDICATE = buildAccountCategoryPredicate('费用', 'debit')
export const COST_CATEGORY_PREDICATE = buildAccountCategoryPredicate('成本', 'debit')
export const EXPENSE_CATEGORY_PREDICATE = `(${PURE_EXPENSE_CATEGORY_PREDICATE} OR ${FEE_CATEGORY_PREDICATE} OR ${COST_CATEGORY_PREDICATE})`

// 排除自动结转生成的凭证
// 把损益清零，混入会导致 Dashboard 上"本期收入/支出"显示为 0 或负数。
export const EXCLUDE_TRANSFER_VOUCHERS = `NOT EXISTS (SELECT 1 FROM auto_transfer_runs atr WHERE atr.account_set_id=v.account_set_id AND atr.voucher_id=v.id)`

export interface PeriodFlowRow {
  income: number
  pureExpense: number
  fee: number
  cost: number
  expense: number
}

export function queryPeriodFlow(
  db: ReturnType<typeof getDb>,
  accountSetId: string | undefined,
  year: number,
  period: number,
  predicates?: DashboardCategoryPredicates
): PeriodFlowRow {
  const resolvedPredicates =
    predicates ??
    (accountSetId
      ? getDashboardCategoryConfig(db, accountSetId).predicates
      : {
          income: INCOME_CATEGORY_PREDICATE,
          pureExpense: PURE_EXPENSE_CATEGORY_PREDICATE,
          fee: FEE_CATEGORY_PREDICATE,
          cost: COST_CATEGORY_PREDICATE,
          expense: EXPENSE_CATEGORY_PREDICATE,
        })

  const row = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE
        WHEN ${resolvedPredicates.income}
          THEN CASE WHEN ve.direction='credit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as income,
      COALESCE(SUM(CASE
        WHEN ${resolvedPredicates.pureExpense}
          AND NOT (${resolvedPredicates.fee} OR ${resolvedPredicates.cost})
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as pureExpense,
      COALESCE(SUM(CASE
        WHEN ${resolvedPredicates.fee}
          AND NOT ${resolvedPredicates.cost}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as fee,
      COALESCE(SUM(CASE
        WHEN ${resolvedPredicates.cost}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as cost,
      COALESCE(SUM(CASE
        WHEN ${resolvedPredicates.expense}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as expense
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    JOIN accounts a ON a.id = ve.account_id
    WHERE ve.account_set_id=? AND v.year=? AND v.period=? AND ${EXCLUDE_TRANSFER_VOUCHERS}
  `
    )
    .get(accountSetId, year, period) as any

  const income = Number(row?.income || 0)
  const pureExpense = Number(row?.pureExpense || 0)
  const fee = Number(row?.fee || 0)
  const cost = Number(row?.cost || 0)
  const expense = Number(row?.expense || 0)

  return { income, pureExpense, fee, cost, expense }
}

function getPeriodEndDate(year: number, period: number) {
  return dayjs(`${year}-${String(period).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD')
}

function buildBalanceExpression(alias = 'a', entryAlias = 've') {
  return `CASE WHEN ${alias}.direction='debit'
    THEN CASE WHEN ${entryAlias}.direction='debit' THEN ${entryAlias}.amount ELSE -${entryAlias}.amount END
    ELSE CASE WHEN ${entryAlias}.direction='credit' THEN ${entryAlias}.amount ELSE -${entryAlias}.amount END
  END`
}

interface CashBankAccountRow {
  id: string
  code: string
  name: string
  balance: number
}

export function getCashBankLeavesByRootCode(
  db: ReturnType<typeof getDb>,
  accountSetId: string | undefined,
  rootCode: string,
  year: number,
  periodEnd: string
) {
  const yearStart = dayjs(`${year}-01-01`).format('YYYY-MM-DD')
  return db
    .prepare(
      `
    WITH RECURSIVE descendants AS (
      SELECT id, code, name, direction, account_set_id
      FROM accounts
      WHERE account_set_id=? AND code=? AND is_enabled=1
      UNION ALL
      SELECT c.id, c.code, c.name, c.direction, c.account_set_id
      FROM accounts c
      JOIN descendants d ON d.id = c.parent_id
      WHERE c.account_set_id=? AND c.is_enabled=1
    ),
    leaf_accounts AS (
      SELECT d.id, d.code, d.name, d.direction, d.account_set_id
      FROM descendants d
      WHERE NOT EXISTS (
        SELECT 1 FROM accounts c
        WHERE c.account_set_id=d.account_set_id
          AND c.parent_id=d.id
          AND c.is_enabled=1
      )
    ),
    init_bals AS (
      SELECT ib.account_id, SUM(ib.init_balance) as balance
      FROM init_balances ib
      JOIN leaf_accounts l ON l.id = ib.account_id
      WHERE ib.account_set_id=? AND ib.year=?
      GROUP BY ib.account_id
    ),
    flows AS (
      SELECT ve.account_id,
        SUM(CASE WHEN l.direction='debit'
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
          ELSE CASE WHEN ve.direction='credit' THEN ve.amount ELSE -ve.amount END
        END) as balance
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      JOIN leaf_accounts l ON l.id = ve.account_id
      WHERE ve.account_set_id=?
        AND v.voucher_date >= ? AND v.voucher_date <= ?
      GROUP BY ve.account_id
    )
    SELECT l.id, l.code, l.name,
      COALESCE(i.balance, 0) + COALESCE(f.balance, 0) as balance
    FROM leaf_accounts l
    LEFT JOIN init_bals i ON i.account_id = l.id
    LEFT JOIN flows f ON f.account_id = l.id
    ORDER BY l.code
  `
    )
    .all(accountSetId, rootCode, accountSetId, accountSetId, year, accountSetId, yearStart, periodEnd) as CashBankAccountRow[]
}

function getCashBankStructure(
  db: ReturnType<typeof getDb>,
  accountSetId: string | undefined,
  year: number,
  periodEnd: string
) {
  const groups = [
    { rootCode: '1001', name: '现金' },
    { rootCode: '1002', name: '银行' },
    { rootCode: '1012', name: '其他货币资金' },
  ]

  return groups
    .map(group => {
      const rows = getCashBankLeavesByRootCode(db, accountSetId, group.rootCode, year, periodEnd)
      const children = rows.map(row => ({
        code: row.code,
        name: row.name,
        balance: Number(row.balance || 0),
      }))
      return {
        name: group.name,
        balance: children.reduce((sum, item) => sum + item.balance, 0),
        children,
      }
    })
    .filter(group => group.children.length > 0)
}

// ===================== 工作台数据 =====================
router.get('/stats', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = getDashboardPeriod(db, req.accountSetId)
  const periodStart = dayjs(`${year}-${String(period).padStart(2, '0')}-01`)
  const monthEnd = periodStart.endOf('month').format('YYYY-MM-DD')
  const categoryConfig = getDashboardCategoryConfig(db, req.accountSetId!)
  const { predicates } = categoryConfig

  // 本月凭证数
  const voucherCount = db
    .prepare(
      `
    SELECT COUNT(*) as cnt FROM vouchers
    WHERE account_set_id=? AND year=? AND period=?
  `
    )
    .get(req.accountSetId, year, period) as any

  // 未记账凭证数（本期）：草稿+已审核都还没有完成记账
  const unpostedVoucherCount = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM vouchers
       WHERE account_set_id=? AND year=? AND period=? AND status IN ('draft', 'audited')`
    )
    .get(req.accountSetId, year, period) as any

  const cashBankStructure = getCashBankStructure(db, req.accountSetId, year, monthEnd)

  // 本期收入/支出：按"科目名+方向"识别，跨准则通用；排除自动结转凭证（取结转前发生额）
  const monthlyFlow = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE
        WHEN ${predicates.income}
          THEN CASE WHEN ve.direction='credit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as income,
      COALESCE(SUM(CASE
        WHEN ${predicates.expense}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as expense
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    JOIN accounts a ON a.id = ve.account_id
    WHERE ve.account_set_id=? AND v.year=? AND v.period=? AND ${EXCLUDE_TRANSFER_VOUCHERS}
  `
    )
    .get(req.accountSetId, year, period) as any

  const cashBalance = cashBankStructure.reduce((sum, item) => sum + item.balance, 0)
  const monthlyIncome = Number(monthlyFlow?.income || 0)
  const monthlyExpense = Number(monthlyFlow?.expense || 0)

  res.json({
    code: 0,
    data: {
      currentYear: year,
      currentPeriod: period,
      voucherCount: voucherCount?.cnt || 0,
      unpostedVoucherCount: unpostedVoucherCount?.cnt || 0,
      pendingVoucherCount: unpostedVoucherCount?.cnt || 0,
      auditPending: unpostedVoucherCount?.cnt || 0,
      cashBalance,
      monthlyIncome,
      monthlyExpense,
      monthlySurplus: monthlyIncome - monthlyExpense,
      accountingStandard: categoryConfig.standard,
      accountingStandardName: categoryConfig.standardName,
      dashboardRuleMode: categoryConfig.dashboardRuleMode,
    },
  })
})

// 近6个月收支趋势
router.get('/trend', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = getDashboardPeriod(db, req.accountSetId)
  const categoryConfig = getDashboardCategoryConfig(db, req.accountSetId!)
  const { predicates } = categoryConfig

  // 计算最近6个月的范围
  const endMonth = year * 12 + (period - 1)
  const startMonth = endMonth - 5
  
  const startYear = Math.floor(startMonth / 12)
  const startPeriod = (startMonth % 12) + 1

  // 单次查询获取 6 个月数据
  const rows = db.prepare(`
    SELECT
      v.year, v.period,
      COALESCE(SUM(CASE
        WHEN ${predicates.income}
          THEN CASE WHEN ve.direction='credit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as income,
      COALESCE(SUM(CASE
        WHEN ${predicates.pureExpense}
          AND NOT (${predicates.fee} OR ${predicates.cost})
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as pureExpense,
      COALESCE(SUM(CASE
        WHEN ${predicates.fee}
          AND NOT ${predicates.cost}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as fee,
      COALESCE(SUM(CASE
        WHEN ${predicates.cost}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as cost,
      COALESCE(SUM(CASE
        WHEN ${predicates.expense}
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as expense
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    JOIN accounts a ON a.id = ve.account_id
    WHERE ve.account_set_id=?
      AND (v.year * 12 + v.period - 1) BETWEEN ? AND ?
      AND ${EXCLUDE_TRANSFER_VOUCHERS}
    GROUP BY v.year, v.period
  `).all(req.accountSetId, startMonth, endMonth) as any[]

  const results = []
  for (let i = 5; i >= 0; i--) {
    const d = dayjs(`${year}-${String(period).padStart(2, '0')}-01`).subtract(i, 'month')
    const y = d.year()
    const m = d.month() + 1
    const row = rows.find(r => r.year === y && r.period === m)
    results.push({
      month: `${y}-${String(m).padStart(2, '0')}`,
      income: Number(row?.income || 0),
      pureExpense: Number(row?.pureExpense || 0),
      fee: Number(row?.fee || 0),
      cost: Number(row?.cost || 0),
      expense: Number(row?.expense || 0),
    })
  }

  res.json({
    code: 0,
    data: results,
    meta: {
      accountingStandard: categoryConfig.standard,
      accountingStandardName: categoryConfig.standardName,
      dashboardRuleMode: categoryConfig.dashboardRuleMode,
    },
  })
})

// 工作台洞察：待办风险、资金结构、科目活跃度
router.get('/insights', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = getDashboardPeriod(db, req.accountSetId)
  const periodEnd = getPeriodEndDate(year, period)

  const statusRow = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END), 0) as draftCount,
      COALESCE(SUM(CASE WHEN status='audited' THEN 1 ELSE 0 END), 0) as auditedCount,
      COALESCE(SUM(CASE WHEN status='posted' THEN 1 ELSE 0 END), 0) as postedCount
    FROM vouchers
    WHERE account_set_id=? AND year=? AND period=?
  `
    )
    .get(req.accountSetId, year, period) as any

  const auxMissing = db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM voucher_entries ve
    JOIN accounts a ON a.id = ve.account_id
    JOIN vouchers v ON v.id = ve.voucher_id
    WHERE ve.account_set_id=?
      AND v.year=? AND v.period=?
      AND a.is_aux=1
      AND (ve.aux_data IS NULL OR ve.aux_data='' OR ve.aux_data='{}')
  `
    )
    .get(req.accountSetId, year, period) as any

  const cashStructure = getCashBankStructure(db, req.accountSetId, year, periodEnd)
  const negativeCashCount = cashStructure.reduce(
    (count, group) => count + group.children.filter(item => item.balance < 0).length,
    0
  )

  const activityTop = db
    .prepare(
      `
    WITH leaf_accounts AS (
      SELECT id, code, name
      FROM accounts a
      WHERE account_set_id=?
        AND is_enabled=1
        AND NOT EXISTS (
          SELECT 1 FROM accounts c
          WHERE c.account_set_id=a.account_set_id AND c.parent_id=a.id
        )
    )
    SELECT a.code, a.name,
      COALESCE(SUM(ve.amount), 0) as amount
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    JOIN leaf_accounts a ON a.id = ve.account_id
    WHERE ve.account_set_id=?
      AND v.year=? AND v.period=?
      AND ${EXCLUDE_TRANSFER_VOUCHERS}
    GROUP BY a.id, a.code, a.name
    HAVING amount <> 0
    ORDER BY ABS(amount) DESC
    LIMIT 5
  `
    )
    .all(req.accountSetId, req.accountSetId, year, period) as any[]

  const riskItems = [
    {
      key: 'draft',
      title: '草稿凭证',
      count: Number(statusRow?.draftCount || 0),
      level: Number(statusRow?.draftCount || 0) > 0 ? 'warning' : 'normal',
      actionPath: '/voucher/audit',
    },
    {
      key: 'audited',
      title: '待记账凭证',
      count: Number(statusRow?.auditedCount || 0),
      level: Number(statusRow?.auditedCount || 0) > 0 ? 'warning' : 'normal',
      actionPath: '/voucher/audit',
    },
    {
      key: 'negative-cash',
      title: '货币资金负数',
      count: negativeCashCount,
      level: negativeCashCount > 0 ? 'danger' : 'normal',
      actionPath: '/ledger/balance',
    },
    {
      key: 'aux-missing',
      title: '辅助核算缺失',
      count: Number(auxMissing?.count || 0),
      level: Number(auxMissing?.count || 0) > 0 ? 'danger' : 'normal',
      actionPath: '/voucher/audit',
    },
  ]

  res.json({
    code: 0,
    data: {
      currentYear: year,
      currentPeriod: period,
      statusCounts: {
        draft: Number(statusRow?.draftCount || 0),
        audited: Number(statusRow?.auditedCount || 0),
        posted: Number(statusRow?.postedCount || 0),
      },
      riskItems,
      cashStructure,
      activityTop,
      expenseTop: activityTop,
    },
  })
})

// 科目余额Top5（按余额绝对值降序，仅叶子科目）
// 余额定义：当年期初 + 当年已记账凭证（v.status='posted'）累计；按科目方向取符号
router.get('/top-accounts', (req: AuthRequest, res) => {
  const db = getDb()
  const { year } = getDashboardPeriod(db, req.accountSetId)

  // 1. 获取所有叶子科目
  const leafAccounts = db.prepare(`
    SELECT a.id, a.code, a.name, a.direction
    FROM accounts a
    WHERE a.account_set_id = ?
      AND a.is_enabled = 1
      AND NOT EXISTS (
        SELECT 1 FROM accounts c
        WHERE c.account_set_id = a.account_set_id
          AND c.parent_id = a.id
          AND c.is_enabled = 1
      )
  `).all(req.accountSetId) as any[]

  if (leafAccounts.length === 0) {
    return res.json({ code: 0, data: [] })
  }

  const leafIds = leafAccounts.map(a => a.id)
  
  // 2. 批量查询期初和发生额
  const list = db
    .prepare(
      `
    WITH leaf_ids(id) AS (
      SELECT value FROM json_each(?)
    ),
    init_bals AS (
      SELECT ib.account_id, SUM(ib.init_balance) as balance
      FROM init_balances ib
      JOIN leaf_ids l ON l.id = ib.account_id
      WHERE ib.account_set_id = ? AND ib.year = ?
      GROUP BY ib.account_id
    ),
    flows AS (
      SELECT ve.account_id,
        SUM(CASE WHEN a.direction = 'debit'
          THEN CASE WHEN ve.direction = 'debit' THEN ve.amount ELSE -ve.amount END
          ELSE CASE WHEN ve.direction = 'credit' THEN ve.amount ELSE -ve.amount END
        END) as balance
      FROM voucher_entries ve
      JOIN vouchers v ON v.id = ve.voucher_id
      JOIN accounts a ON a.id = ve.account_id
      JOIN leaf_ids l ON l.id = ve.account_id
      WHERE ve.account_set_id = ?
        AND v.status = 'posted'
        AND v.year = ?
      GROUP BY ve.account_id
    )
    SELECT a.code, a.name, a.direction,
      (COALESCE(i.balance, 0) + COALESCE(f.balance, 0)) as balance
    FROM accounts a
    JOIN leaf_ids l ON l.id = a.id
    LEFT JOIN init_bals i ON i.account_id = a.id
    LEFT JOIN flows f ON f.account_id = a.id
    WHERE balance <> 0
    ORDER BY ABS(balance) DESC
    LIMIT 5
  `
    )
    .all(JSON.stringify(leafIds), req.accountSetId, year, req.accountSetId, year)

  res.json({ code: 0, data: list })
})

// 近期凭证（最近10条）
router.get('/recent-vouchers', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare(
      `
    WITH top_vouchers AS (
      SELECT id, voucher_no, voucher_date, remark, status, year, period,
             maker_name, auditor_name, poster_name, attachments
      FROM vouchers
      WHERE account_set_id=?
      ORDER BY voucher_date DESC, voucher_no DESC
      LIMIT 10
    )
    SELECT v.id, v.voucher_no as voucherNo, v.voucher_date as voucherDate,
           v.remark as abstract, v.status, v.year, v.period,
           v.maker_name as makerName, v.auditor_name as auditorName,
           v.poster_name as posterName, v.attachments,
           COUNT(ve.id) as entryCount,
           SUM(CASE WHEN ve.direction='debit' THEN ve.amount ELSE 0 END) as totalAmount,
           GROUP_CONCAT(DISTINCT ve.account_code || ' ' || ve.account_name) as accountSummary
    FROM top_vouchers v
    LEFT JOIN voucher_entries ve ON ve.voucher_id = v.id
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.voucher_no DESC
  `
    )
    .all(req.accountSetId)

  res.json({ code: 0, data: list })
})

export default router
