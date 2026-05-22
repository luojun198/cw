import { Router } from 'express'
import dayjs from 'dayjs'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/index.js'

const router = Router()
router.use(authMiddleware)

function getDashboardPeriod(db: ReturnType<typeof getDb>, accountSetId?: string) {
  const latestVoucher = db
    .prepare(
      `
    SELECT year, period
    FROM vouchers
    WHERE account_set_id=?
    ORDER BY year DESC, period DESC, voucher_date DESC, voucher_no DESC
    LIMIT 1
  `
    )
    .get(accountSetId) as any

  if (latestVoucher?.year && latestVoucher?.period) {
    return {
      year: Number(latestVoucher.year),
      period: Number(latestVoucher.period),
    }
  }

  const accountSet = db
    .prepare('SELECT fiscal_year FROM account_sets WHERE id=?')
    .get(accountSetId) as any
  const now = dayjs()
  return {
    year: Number(accountSet?.fiscal_year) || now.year(),
    period: now.month() + 1,
  }
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
    )
    SELECT d.id, d.code, d.name,
      COALESCE((SELECT SUM(ib.init_balance)
        FROM init_balances ib
        WHERE ib.account_set_id=d.account_set_id AND ib.account_id=d.id AND ib.year=?), 0)
      + COALESCE((SELECT SUM(${buildBalanceExpression('d', 've')})
        FROM voucher_entries ve
        JOIN vouchers v ON v.id = ve.voucher_id
        WHERE ve.account_set_id=d.account_set_id
          AND v.account_set_id=d.account_set_id
          AND ve.account_id=d.id
          AND v.voucher_date >= ?
          AND v.voucher_date <= ?), 0) as balance
    FROM descendants d
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts c
      WHERE c.account_set_id=d.account_set_id
        AND c.parent_id=d.id
        AND c.is_enabled=1
    )
    ORDER BY d.code
  `
    )
    .all(accountSetId, rootCode, accountSetId, year, yearStart, periodEnd) as CashBankAccountRow[]
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
  ]

  return groups.map(group => {
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
}

// ===================== 工作台数据 =====================
router.get('/stats', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = getDashboardPeriod(db, req.accountSetId)
  const periodStart = dayjs(`${year}-${String(period).padStart(2, '0')}-01`)
  const monthEnd = periodStart.endOf('month').format('YYYY-MM-DD')

  // 本月凭证数
  const voucherCount = db
    .prepare(
      `
    SELECT COUNT(*) as cnt FROM vouchers
    WHERE account_set_id=? AND year=? AND period=?
  `
    )
    .get(req.accountSetId, year, period) as any

  // 未记账凭证数：草稿和已审核都还没有完成记账
  const unpostedVoucherCount = db
    .prepare(
      `
    SELECT COUNT(*) as cnt FROM vouchers
    WHERE account_set_id=? AND status IN ('draft', 'audited')
  `
    )
    .get(req.accountSetId) as any

  const cashBankStructure = getCashBankStructure(db, req.accountSetId, year, monthEnd)

  // 本月收入/支出：兼容财务会计 4/5 类与预算会计 6/7 类科目
  const monthlyFlow = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE
        WHEN substr(a.code, 1, 1) IN ('4', '6')
          THEN CASE WHEN ve.direction='credit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as income,
      COALESCE(SUM(CASE
        WHEN substr(a.code, 1, 1) IN ('5', '7')
          THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
        ELSE 0
      END), 0) as expense
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    JOIN accounts a ON a.id = ve.account_id
    WHERE ve.account_set_id=? AND v.year=? AND v.period=?
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
    },
  })
})

// 近6个月收支趋势
router.get('/trend', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = getDashboardPeriod(db, req.accountSetId)
  const results = []
  for (let i = 5; i >= 0; i--) {
    const d = dayjs(`${year}-${String(period).padStart(2, '0')}-01`).subtract(i, 'month')
    const y = d.year()
    const m = d.month() + 1
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE
          WHEN substr(a.code, 1, 1) IN ('4', '6')
            THEN CASE WHEN ve.direction='credit' THEN ve.amount ELSE -ve.amount END
          ELSE 0
        END), 0) as income,
        COALESCE(SUM(CASE
          WHEN substr(a.code, 1, 1) IN ('5', '7')
            THEN CASE WHEN ve.direction='debit' THEN ve.amount ELSE -ve.amount END
          ELSE 0
        END), 0) as expense
      FROM voucher_entries ve
      JOIN vouchers v ON v.id=ve.voucher_id
      JOIN accounts a ON a.id=ve.account_id
      WHERE ve.account_set_id=? AND v.year=? AND v.period=?
    `).get(req.accountSetId, y, m) as any
    results.push({
      month: `${y}-${String(m).padStart(2,'0')}`,
      income: row?.income || 0,
      expense: row?.expense || 0,
    })
  }
  res.json({ code: 0, data: results })
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
    WHERE account_set_id=?
  `
    )
    .get(req.accountSetId) as any

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
    SELECT a.code, a.name,
      COALESCE(SUM(ve.amount), 0) as amount
    FROM voucher_entries ve
    JOIN vouchers v ON v.id = ve.voucher_id
    JOIN accounts a ON a.id = ve.account_id
    WHERE ve.account_set_id=?
      AND v.year=? AND v.period=?
      AND NOT EXISTS (
        SELECT 1 FROM accounts c
        WHERE c.account_set_id=a.account_set_id AND c.parent_id=a.id
      )
    GROUP BY a.id, a.code, a.name
    HAVING amount <> 0
    ORDER BY ABS(amount) DESC
    LIMIT 5
  `
    )
    .all(req.accountSetId, year, period) as any[]

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

  const list = db
    .prepare(
      `
    SELECT a.code, a.name, a.direction,
      COALESCE(ib.init_balance, 0)
      + CASE WHEN a.direction = 'debit'
          THEN COALESCE(SUM(CASE
            WHEN v.id IS NULL THEN 0
            WHEN ve.direction = 'debit' THEN ve.amount
            ELSE -ve.amount
          END), 0)
          ELSE COALESCE(SUM(CASE
            WHEN v.id IS NULL THEN 0
            WHEN ve.direction = 'credit' THEN ve.amount
            ELSE -ve.amount
          END), 0)
        END as balance
    FROM accounts a
    LEFT JOIN (
      SELECT account_id, SUM(init_balance) AS init_balance
      FROM init_balances
      WHERE account_set_id = ? AND year = ?
      GROUP BY account_id
    ) ib ON ib.account_id = a.id
    LEFT JOIN voucher_entries ve
      ON ve.account_id = a.id AND ve.account_set_id = a.account_set_id
    LEFT JOIN vouchers v
      ON v.id = ve.voucher_id AND v.status = 'posted' AND v.year = ?
    WHERE a.account_set_id = ?
      AND a.is_enabled = 1
      AND NOT EXISTS (
        SELECT 1 FROM accounts c
        WHERE c.account_set_id = a.account_set_id
          AND c.parent_id = a.id
          AND c.is_enabled = 1
      )
    GROUP BY a.id, a.code, a.name, a.direction, ib.init_balance
    HAVING balance <> 0
    ORDER BY ABS(balance) DESC
    LIMIT 5
  `
    )
    .all(req.accountSetId, year, year, req.accountSetId)

  res.json({ code: 0, data: list })
})

// 近期凭证（最近10条）
router.get('/recent-vouchers', (req: AuthRequest, res) => {
  const db = getDb()
  const list = db
    .prepare(
      `
    SELECT v.id, v.voucher_no as voucherNo, v.voucher_date as voucherDate,
           v.remark as abstract, v.status, v.year, v.period,
           v.maker_name as makerName, v.auditor_name as auditorName,
           v.poster_name as posterName, v.attachments,
           COUNT(ve.id) as entryCount,
           SUM(CASE WHEN ve.direction='debit' THEN ve.amount ELSE 0 END) as totalAmount,
           GROUP_CONCAT(DISTINCT ve.account_code || ' ' || ve.account_name) as accountSummary
    FROM vouchers v
    LEFT JOIN voucher_entries ve ON ve.voucher_id = v.id
    WHERE v.account_set_id=?
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.voucher_no DESC
    LIMIT 10
  `
    )
    .all(req.accountSetId)

  res.json({ code: 0, data: list })
})

export default router
