/**
 * 固定资产折旧计算引擎（四种折旧方法）
 *
 * ACD 折旧方法代码：1=平均年限  2=工作量  3=双倍余额递减  4=年数总和
 * 起折规则（与润衡相同）：syrq 所在月份 次月 开始计提。
 */
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

export interface DeprAsset {
  id: string
  asset_no: string
  asset_name: string
  dept_code: string | null
  purpose_code: string | null
  depr_method: string | null
  original_value: number
  salvage_value: number
  use_months: number | null
  total_workload: number | null
  depr_months_done: number
  workload_done: number
  accum_depr: number
  net_value: number
  status_code: string | null
  start_depr_date: string | null
  expense_account: string | null  // 折旧费用科目（来自 purpose）
  asset_account: string | null    // 累计折旧科目 或 资产科目（来自 category）
}

export interface DeprLine {
  asset_no: string
  asset_name: string
  dept_code: string | null
  purpose_code: string | null
  depr_method: string
  original_value: number
  accum_depr_before: number
  month_depr: number
  accum_depr_after: number
  net_value_after: number
  expense_account: string | null
  asset_account: string | null
}

// ── 四种折旧算法 ──────────────────────────────────────────

function calcMethodAvgYears(a: DeprAsset): number {
  if (!a.use_months || a.use_months <= 0) return 0
  const depreciable = a.original_value - a.salvage_value
  if (depreciable <= 0) return 0
  if (a.depr_months_done >= a.use_months) return 0
  return Math.round((depreciable / a.use_months) * 100) / 100
}

function calcMethodWorkload(a: DeprAsset, currentWorkload: number): number {
  if (!a.total_workload || a.total_workload <= 0) return 0
  const depreciable = a.original_value - a.salvage_value
  if (depreciable <= 0) return 0
  return Math.round((depreciable / a.total_workload) * currentWorkload * 100) / 100
}

function calcMethodDoubleDeclining(a: DeprAsset): number {
  if (!a.use_months || a.use_months <= 0) return 0
  const remaining = a.use_months - a.depr_months_done
  if (remaining <= 0) return 0
  // 最后 2 个月改用直线法
  if (remaining <= 2) {
    const rem = a.net_value - a.salvage_value
    return Math.max(0, Math.round((rem / remaining) * 100) / 100)
  }
  const rate = 2 / a.use_months
  return Math.round(a.net_value * rate * 100) / 100
}

function calcMethodSumOfYears(a: DeprAsset): number {
  if (!a.use_months || a.use_months <= 0) return 0
  const depreciable = a.original_value - a.salvage_value
  if (depreciable <= 0) return 0
  const n = a.use_months
  const sumOfNums = (n * (n + 1)) / 2
  const remaining = n - a.depr_months_done
  if (remaining <= 0) return 0
  return Math.round((depreciable * remaining / sumOfNums) * 100) / 100
}

// ── 计划明细：预览（不写库） ───────────────────────────────

export function previewDepreciation(params: {
  db: Database
  accountSetId: string
  year: number
  month: number
  workloadMap?: Record<string, number>
}): DeprLine[] {
  const { db, accountSetId, year, month } = params
  const workloadMap = params.workloadMap || {}

  const assets = db.prepare(`
    SELECT fa.*,
      fp.expense_account,
      fc.account_code AS asset_account
    FROM fixed_asset fa
    LEFT JOIN fixed_asset_purpose  fp ON fp.account_set_id = fa.account_set_id AND fp.code = fa.purpose_code
    LEFT JOIN fixed_asset_category fc ON fc.account_set_id = fa.account_set_id AND fc.code = fa.category_code
    LEFT JOIN fixed_asset_status   fs ON fs.account_set_id = fa.account_set_id AND fs.code = fa.status_code
    WHERE fa.account_set_id = ?
      AND (fs.depreciable = 1 OR fa.status_code IS NULL)
      AND fa.depr_method IS NOT NULL
      AND fa.use_months > 0
      AND fa.depr_months_done < fa.use_months
  `).all(accountSetId) as DeprAsset[]

  const lines: DeprLine[] = []

  for (const a of assets) {
    // 起折日期校验：计提月必须 > 起折月
    if (a.start_depr_date) {
      const [sy, sm] = a.start_depr_date.split('-').map(Number)
      if (year * 12 + month <= sy * 12 + sm) continue
    }

    // 已计提本月则跳过
    const already = db.prepare(
      'SELECT id FROM fixed_asset_depr WHERE account_set_id=? AND asset_no=? AND year=? AND month=?'
    ).get(accountSetId, a.asset_no, year, month)
    if (already) continue

    const method = a.depr_method || '1'
    let monthDepr = 0
    if (method === '1') monthDepr = calcMethodAvgYears(a)
    else if (method === '2') monthDepr = calcMethodWorkload(a, workloadMap[a.asset_no] ?? 0)
    else if (method === '3') monthDepr = calcMethodDoubleDeclining(a)
    else if (method === '4') monthDepr = calcMethodSumOfYears(a)

    if (monthDepr <= 0) continue

    // 不超过剩余可折余额（防止最后一月多折）
    const maxDepr = Math.max(0, Math.round((a.net_value - a.salvage_value) * 100) / 100)
    monthDepr = Math.min(monthDepr, maxDepr)
    monthDepr = Math.round(monthDepr * 100) / 100
    if (monthDepr <= 0) continue

    lines.push({
      asset_no: a.asset_no,
      asset_name: a.asset_name,
      dept_code: a.dept_code,
      purpose_code: a.purpose_code,
      depr_method: method,
      original_value: a.original_value,
      accum_depr_before: a.accum_depr,
      month_depr: monthDepr,
      accum_depr_after: Math.round((a.accum_depr + monthDepr) * 100) / 100,
      net_value_after: Math.round((a.net_value - monthDepr) * 100) / 100,
      expense_account: a.expense_account,
      asset_account: a.asset_account,
    })
  }

  return lines
}

// ── 执行计提：写库 ─────────────────────────────────────────

export function executeDepreciation(params: {
  db: Database
  accountSetId: string
  year: number
  month: number
  lines: DeprLine[]
}): void {
  const { db, accountSetId, year, month, lines } = params

  const insDepr = db.prepare(`
    INSERT INTO fixed_asset_depr
      (id, account_set_id, asset_no, year, month, dept_code, purpose_code, depr_method, month_depr, accum_depr)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_set_id, asset_no, year, month) DO UPDATE SET
      month_depr=excluded.month_depr, accum_depr=excluded.accum_depr
  `)

  const updAsset = db.prepare(`
    UPDATE fixed_asset SET
      accum_depr       = ROUND(accum_depr + ?, 2),
      net_value        = ROUND(net_value  - ?, 2),
      depr_months_done = depr_months_done + 1,
      updated_at       = datetime('now')
    WHERE account_set_id = ? AND asset_no = ?
  `)

  for (const ln of lines) {
    insDepr.run(
      uuidv4(), accountSetId, ln.asset_no, year, month,
      ln.dept_code, ln.purpose_code, ln.depr_method, ln.month_depr, ln.accum_depr_after
    )
    updAsset.run(ln.month_depr, ln.month_depr, accountSetId, ln.asset_no)
  }
}

// ── 生成折旧凭证 ───────────────────────────────────────────

export interface DeprVoucherResult {
  voucherId: string
  voucherNo: string
  entryCount: number
  totalDepr: number
}

export function generateDeprVoucher(params: {
  db: Database
  accountSetId: string
  year: number
  month: number
  lines: DeprLine[]
  deprAccumAccount: string    // 累计折旧科目，默认 1602（或从 xt.txt 读）
  makerName: string
  voucherTypeId?: string | null
}): DeprVoucherResult {
  const { db, accountSetId, year, month, lines, deprAccumAccount, makerName, voucherTypeId } = params
  if (lines.length === 0) throw new Error('无折旧明细，无法生成凭证')

  // 按「折旧费用科目」合并同科目金额
  const expenseMap = new Map<string, number>()
  for (const ln of lines) {
    const acc = ln.expense_account || '660201'
    expenseMap.set(acc, (expenseMap.get(acc) ?? 0) + ln.month_depr)
  }

  const totalDepr = lines.reduce((s, l) => s + l.month_depr, 0)
  const totalDeprRounded = Math.round(totalDepr * 100) / 100

  // 查询折旧费用科目 id
  const lookupAccount = db.prepare('SELECT id, name FROM accounts WHERE account_set_id=? AND code=? LIMIT 1')
  const accumRow = lookupAccount.get(accountSetId, deprAccumAccount) as { id: string; name: string } | undefined

  // 生成凭证号（按现有最大号+1）
  const lastNo = (db.prepare(`
    SELECT CAST(
      CASE WHEN INSTR(voucher_no,'-')>0 THEN SUBSTR(voucher_no,INSTR(voucher_no,'-')+1) ELSE voucher_no END
      AS INTEGER) no
    FROM vouchers
    WHERE account_set_id=? AND year=? AND period=?
    ORDER BY no DESC LIMIT 1
  `).get(accountSetId, year, month) as any)?.no ?? 0
  const voucherNo = String(lastNo + 1).padStart(3, '0')

  // 预检：所有科目必须在账套内存在（在 INSERT 之前抛错，避免孤立凭证头）
  const missingCodes: string[] = []
  for (const [code] of expenseMap) {
    if (!lookupAccount.get(accountSetId, code)) missingCodes.push(code)
  }
  if (!accumRow) missingCodes.push(deprAccumAccount)
  if (missingCodes.length > 0) {
    throw new Error(`以下科目在账套中不存在，无法生成凭证：${missingCodes.join('、')}。请先在「会计科目」中建立对应科目。`)
  }

  const voucherId = uuidv4()
  const voucherDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

  db.prepare(`
    INSERT INTO vouchers
      (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period,
       total_amount, maker_name, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    voucherId, accountSetId, voucherNo, voucherTypeId ?? null,
    voucherDate, year, month, totalDeprRounded, makerName,
    `${year}年${month}月固定资产折旧`
  )

  const insEntry = db.prepare(`
    INSERT INTO voucher_entries
      (id, account_set_id, voucher_id, seq, account_id, account_code, account_name,
       direction, amount, amount_cents, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let seq = 1
  const summary = `${year}年${month}月计提折旧`

  // 借：各折旧费用科目
  for (const [code, amt] of expenseMap) {
    const accRow2 = lookupAccount.get(accountSetId, code) as { id: string; name: string }
    insEntry.run(
      uuidv4(), accountSetId, voucherId, seq++,
      accRow2.id, code, accRow2.name,
      'debit', amt, Math.round(amt * 100), summary
    )
  }

  // 贷：累计折旧
  insEntry.run(
    uuidv4(), accountSetId, voucherId, seq,
    accumRow!.id, deprAccumAccount, accumRow!.name,
    'credit', totalDeprRounded, Math.round(totalDeprRounded * 100), summary
  )

  return { voucherId, voucherNo, entryCount: seq, totalDepr: totalDeprRounded }
}
