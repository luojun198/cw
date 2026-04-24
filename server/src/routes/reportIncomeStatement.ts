import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/index.ts'
import { getDb } from '../db/index.ts'
import { getBalance, getPeriodSum } from '../services/reportBalance.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 收入费用表 =====================
// 政府会计制度收入费用表（本期盈余 = 收入合计 - 费用合计）
router.get('/income-statement', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = req.query
  const y = Number(year) || new Date().getFullYear()
  const p = Number(period) || new Date().getMonth() + 1

  // 收入类（贷方余额，期末余额表示累计收入，取绝对值）
  const revenueGroups: Record<string, string[]> = {
    财政拨款收入: ['4001'],
    事业收入: ['4101'],
    上级补助收入: ['4201'],
    附属单位上缴收入: ['4301'],
    经营收入: ['4401'],
    捐赠收入: ['4601'],
    利息收入: ['4701'],
    租金收入: ['4801'],
    其他收入: ['4901'],
  }

  // 费用类（借方余额）
  const expenseGroups: Record<string, string[]> = {
    业务活动费用: ['5001'],
    单位管理费用: ['5101'],
    经营费用: ['5201'],
    上缴上级费用: ['5301'],
    对附属单位补助费用: ['5401'],
    所得税费用: ['5501'],
    其他费用: ['5601'],
    资产处置费用: ['5901'],
  }

  // 政府会计制度特有：费用中含折旧摊销，不需另加
  // 但经营费用中可能含折旧（510103/510104已含），这是正确的

  const calcGroup = (codes: string[], isRevenue: boolean) => {
    let total = 0
    for (const code of codes) {
      const bal = getBalance(db, req.accountSetId, code, y, p)
      // 收入贷方余额取绝对值；费用借方余额直接取
      total += isRevenue ? Math.abs(bal) : bal
    }
    return total
  }

  const revenues: Record<string, number> = {}
  let totalRevenue = 0
  for (const [name, codes] of Object.entries(revenueGroups)) {
    const amt = calcGroup(codes, true)
    if (amt !== 0) revenues[name] = amt
    totalRevenue += amt
  }

  const expenses: Record<string, number> = {}
  let totalExpense = 0
  for (const [name, codes] of Object.entries(expenseGroups)) {
    const amt = calcGroup(codes, false)
    if (amt !== 0) expenses[name] = amt
    totalExpense += amt
  }

  const netSurplus = totalRevenue - totalExpense

  res.json({
    code: 0,
    data: {
      year: y,
      period: p,
      reportDate: `${y}年${p}月`,
      revenues,
      expenses,
      totalRevenue,
      totalExpense,
      netSurplus,
    },
  })
})

// ===================== 现金流量表 =====================
// 政府会计制度现金流量表（简化版）
// 仅核算库存现金、银行存款、其他货币资金的变动
// 间接法调整：将收入费用表中的"本期盈余"调整为经营活动现金流量
router.get('/cash-flow', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = req.query
  const y = Number(year) || new Date().getFullYear()
  const p = Number(period) || new Date().getMonth() + 1

  // 现金及现金等价物科目
  const cashCodes = ['1001', '1002', '1012']
  const bankCodes = ['100201', '100202', '100203', '100204', '100205', '100209']

  // 经营活动现金流入（贷方发生）
  const operatingInflowCodes = {
    财政拨款收到: ['4001'], // 财政拨款收入（收到现金部分）
    事业收到现金: ['4101'], // 事业收入（收到现金部分）
    上级补助收到: ['4201'], // 上级补助收入
    经营收到现金: ['4401'], // 经营收入
    其他收到现金: ['4601', '4701', '4801', '4901'], // 捐赠、利息、租金、其他
  }

  // 经营活动现金流出（借方发生）
  const operatingOutflowCodes = {
    人员经费支出: ['50010101'], // 业务活动费用-基本支出-人员经费
    日常公用经费: ['50010102'], // 业务活动费用-基本支出-日常公用
    项目支出: ['500102'], // 业务活动费用-项目支出
    单位管理费用: ['5101'], // 单位管理费用
    经营支出: ['5201'], // 经营费用
    上缴上级支出: ['5301'], // 上缴上级费用
    对附属补助: ['5401'], // 对附属单位补助费用
    其他支出: ['5601', '5901'], // 其他费用+资产处置费用
  }

  // 投资活动
  const investingInflowCodes = {
    收回投资: ['1021'], // 短期投资减少（处置）
  }
  const investingOutflowCodes = {
    购建固定资产: ['1601'], // 购建固定资产
    购建无形资产: ['1701'], // 购建无形资产
    在建工程: ['1611'], // 在建工程
  }

  // 筹资活动
  const financingInflowCodes = {
    借款收到: ['2001', '2501'], // 短期/长期借款增加
  }
  const financingOutflowCodes = {
    偿还借款: ['2001', '2501'], // 借款减少（支付）
  }

  const calcPeriodFlow = (codes: string[], isDebit: boolean): number => {
    let total = 0
    for (const code of codes) {
      const sum = getPeriodSum(db, req.accountSetId, code, y, p)
      total += isDebit ? sum.debit : sum.credit
    }
    return total
  }

  // 经营活动
  const operatingActivities: Record<string, number> = {}
  let totalOperatingInflow = 0
  for (const [name, codes] of Object.entries(operatingInflowCodes)) {
    const amt = calcPeriodFlow(codes, false)
    if (amt !== 0) operatingActivities[`流入_${name}`] = amt
    totalOperatingInflow += amt
  }
  let totalOperatingOutflow = 0
  for (const [name, codes] of Object.entries(operatingOutflowCodes)) {
    const amt = calcPeriodFlow(codes, true)
    if (amt !== 0) operatingActivities[`流出_${name}`] = amt
    totalOperatingOutflow += amt
  }
  const netOperating = totalOperatingInflow - totalOperatingOutflow
  operatingActivities['净额'] = netOperating

  // 投资活动
  const investingActivities: Record<string, number> = {}
  let totalInvestingInflow = 0
  for (const [name, codes] of Object.entries(investingInflowCodes)) {
    const amt = calcPeriodFlow(codes, false)
    if (amt !== 0) investingActivities[`流入_${name}`] = amt
    totalInvestingInflow += amt
  }
  let totalInvestingOutflow = 0
  for (const [name, codes] of Object.entries(investingOutflowCodes)) {
    const amt = calcPeriodFlow(codes, true)
    if (amt !== 0) investingActivities[`流出_${name}`] = amt
    totalInvestingOutflow += amt
  }
  const netInvesting = totalInvestingInflow - totalInvestingOutflow
  investingActivities['净额'] = netInvesting

  // 筹资活动
  const financingActivities: Record<string, number> = {}
  let totalFinancingInflow = 0
  for (const [name, codes] of Object.entries(financingInflowCodes)) {
    const amt = calcPeriodFlow(codes, false)
    if (amt !== 0) financingActivities[`流入_${name}`] = amt
    totalFinancingInflow += amt
  }
  let totalFinancingOutflow = 0
  for (const [name, codes] of Object.entries(financingOutflowCodes)) {
    const amt = calcPeriodFlow(codes, true)
    if (amt !== 0) financingActivities[`流出_${name}`] = amt
    totalFinancingOutflow += amt
  }
  const netFinancing = totalFinancingInflow - totalFinancingOutflow
  financingActivities['净额'] = netFinancing

  // 现金净增加额
  const netCashChange = netOperating + netInvesting + netFinancing

  // 期初/期末现金余额
  let beginCash = 0
  let endCash = 0
  for (const code of cashCodes) {
    beginCash += getBalance(db, req.accountSetId, code, y, 0)
    endCash += getBalance(db, req.accountSetId, code, y, p)
  }
  for (const code of bankCodes) {
    beginCash += getBalance(db, req.accountSetId, code, y, 0)
    endCash += getBalance(db, req.accountSetId, code, y, p)
  }

  res.json({
    code: 0,
    data: {
      year: y,
      period: p,
      reportDate: `${y}年${p}月`,
      operatingActivities,
      investingActivities,
      financingActivities,
      netCashChange,
      beginCash,
      endCash,
      cashBalanceCheck: Math.abs(endCash - beginCash - netCashChange) < 0.01,
    },
  })
})

export default router
