import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/index.ts'
import { getDb } from '../db/index.ts'
import { getBalance } from '../services/reportBalance.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 资产负债表 =====================
// 政府会计制度资产负债表
// 格式：资产总计 = 负债合计 + 净资产合计
// 资产列报净值 = 原值 - 累计折旧/累计摊销/减值准备
router.get('/balance-sheet', (req: AuthRequest, res) => {
  const db = getDb()
  const { year, period } = req.query
  const y = Number(year) || new Date().getFullYear()
  const p = Number(period) || new Date().getMonth() + 1

  // 资产类分组（政府会计制度标准格式）
  // 1218 财政应返还额度属于非流动资产（年度预算结余资金）
  const assetGroups: Record<
    string,
    { codes: string[]; isNetValue?: boolean; deductCodes?: string[] }
  > = {
    流动资产: {
      codes: [
        '1001',
        '1002',
        '1011',
        '1012',
        '1021',
        '1101',
        '1211',
        '1212',
        '1214',
        '1301',
        '1401',
        '1501',
        '1511',
      ],
    },
    非流动资产: {
      codes: ['1218', '1611', '1613', '1891', '1901'],
    },
    固定资产: {
      codes: ['1601'],
      isNetValue: true,
      deductCodes: ['1602', '1603'],
    },
    公共基础设施: {
      codes: ['1801'],
      isNetValue: true,
      deductCodes: ['1802'],
    },
    无形资产: {
      codes: ['1701'],
      isNetValue: true,
      deductCodes: ['1702', '1703'],
    },
    政府储备物资: {
      codes: ['1803'],
    },
    文物文化资产: {
      codes: ['1811'],
    },
    保障性住房: {
      codes: ['1821'],
    },
  }

  // 负债类分组
  const liabilityGroups: Record<string, string[]> = {
    流动负债: [
      '2001',
      '2101',
      '2102',
      '2103',
      '2105',
      '2106',
      '2201',
      '2202',
      '2301',
      '2302',
      '2305',
      '2401',
      '2901',
    ],
    非流动负债: ['2501', '2502', '2601'],
  }

  // 净资产分组
  const equityGroups: Record<string, string[]> = {
    净资产: ['3001', '3101', '3201', '3301', '3302', '3401', '3501'],
  }

  const calcItem = (codes: string[]) => {
    const lines: Record<string, number> = {}
    let total = 0
    for (const code of codes) {
      const bal = getBalance(db, req.accountSetId, code, y, p)
      if (bal !== 0) {
        lines[code] = bal
        total += bal
      }
    }
    return { lines, total }
  }

  const calcNetValueItem = (codes: string[], deductCodes: string[]) => {
    const lines: Record<string, number> = {}
    let total = 0
    for (const code of codes) {
      const grossBal = getBalance(db, req.accountSetId, code, y, p)
      let netBal = grossBal
      for (const dc of deductCodes) {
        // 备抵科目为贷方余额，取绝对值
        const dBal = getBalance(db, req.accountSetId, dc, y, p)
        netBal -= Math.abs(dBal)
      }
      if (netBal !== 0) lines[code] = netBal
      total += netBal
    }
    return { lines, total }
  }

  const result: Record<string, any> = {}
  let totalAssets = 0
  for (const [group, cfg] of Object.entries(assetGroups)) {
    const item =
      cfg.isNetValue && cfg.deductCodes
        ? calcNetValueItem(cfg.codes, cfg.deductCodes)
        : calcItem(cfg.codes)
    result[group] = item.lines
    totalAssets += item.total
  }

  let totalLiabilities = 0
  for (const [group, codes] of Object.entries(liabilityGroups)) {
    const { lines, total } = calcItem(codes)
    result[group] = lines
    totalLiabilities += total
  }

  let totalEquity = 0
  for (const [group, codes] of Object.entries(equityGroups)) {
    const { lines, total } = calcItem(codes)
    result[group] = lines
    totalEquity += total
  }

  const balanced = Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01

  // 备抵科目详情（固定资产累计折旧、无形资产累计摊销等）
  const allDeductions: Record<string, number> = {}
  for (const code of ['1602', '1603', '1702', '1703', '1802']) {
    const bal = getBalance(db, req.accountSetId, code, y, p)
    if (bal !== 0) allDeductions[code] = Math.abs(bal)
  }

  res.json({
    code: 0,
    data: {
      year: y,
      period: p,
      reportDate: `${y}年${p}月`,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      balanced,
      items: result,
      deductions: allDeductions,
    },
  })
})

export default router
