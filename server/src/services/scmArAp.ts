/**
 * 供应链往来/收付款 & 出纳联动服务（P4）
 *
 * 收付款单（PAY/RCV）审核时：写入 wldj 往来台账、生成出纳日记账。
 * 采购/销售发票（RP/RS）审核时：生成应收应付分录。
 */
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

/** 审核收付款单：生成往来台账 + 出纳日记账 */
export function applyPayment(db: Database.Database, accountSetId: string, doc: any, lines: any[], operator: string) {
  const isReceive = doc.doc_type === 'RCV'

  // 往来台账 wldj 表（挂 scm_ar_ap_log）
  const insWl = db.prepare(`INSERT INTO scm_ar_ap_log
    (id, account_set_id, partner_code, doc_type, doc_no, doc_date, direction, amount, ar_account, ap_account, cashier_journal_id, remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)

  // 出纳日记账
  const insCj = db.prepare(`INSERT INTO cashier_journal
    (id, account_set_id, account_code, currency, biz_date, summary, debit, credit, settle_type, counter_account, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)

  for (const l of lines) {
    const amount = Math.round(Number(l.amount || 0) * 100) / 100
    if (amount <= 0) continue

    const partner = db.prepare('SELECT * FROM scm_partner WHERE account_set_id=? AND code=?').get(accountSetId, doc.partner_code) as any
    const cashCode = '1001' // default cash
    const arApCode = isReceive ? (partner?.ar_account || '1131') : (partner?.ap_account || '2121')

    // 出纳日记账
    const journalId = uuidv4()
    insCj.run(
      journalId, accountSetId, cashCode, 'RMB', doc.doc_date,
      `${isReceive ? '收款' : '付款'}：${doc.doc_no} ${partner?.name || doc.partner_code}`,
      isReceive ? amount : 0, isReceive ? 0 : amount, null, arApCode, operator
    )

    // 往来台账：收付款均为核销，往来余额减少 → direction='out'
    insWl.run(uuidv4(), accountSetId, doc.partner_code, doc.doc_type, doc.doc_no, doc.doc_date,
      'out', amount, partner?.ar_account || null, partner?.ap_account || null, journalId,
      doc.remark)
  }
}

/** 审核采购/销售发票（RP/RS）：生成应收应付台账（不产生出纳流水） */
export function applyInvoice(db: Database.Database, accountSetId: string, doc: any, lines: any[]) {
  const partner = db.prepare('SELECT * FROM scm_partner WHERE account_set_id=? AND code=?').get(accountSetId, doc.partner_code) as any
  // 价税合计 = Σ(行金额 + 行税额)
  let total = 0
  for (const l of lines) total += Math.round((Number(l.amount || 0) + Number(l.tax_amount || 0)) * 100) / 100
  total = Math.round(total * 100) / 100
  if (total <= 0) return

  db.prepare(`INSERT INTO scm_ar_ap_log
    (id, account_set_id, partner_code, doc_type, doc_no, doc_date, direction, amount, ar_account, ap_account, cashier_journal_id, remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    uuidv4(), accountSetId, doc.partner_code, doc.doc_type, doc.doc_no, doc.doc_date,
    'in', total, partner?.ar_account || null, partner?.ap_account || null, null, doc.remark
  )
}

/** 回退收付款（反审核时删除往来台账 + 出纳日记账） */
export function reversePayment(db: Database.Database, accountSetId: string, doc: any) {
  const jIds = db.prepare('SELECT cashier_journal_id FROM scm_ar_ap_log WHERE account_set_id=? AND doc_no=?').all(accountSetId, doc.doc_no) as any[]
  for (const r of jIds) {
    if (r.cashier_journal_id) db.prepare('DELETE FROM cashier_journal WHERE id=?').run(r.cashier_journal_id)
  }
  db.prepare('DELETE FROM scm_ar_ap_log WHERE account_set_id=? AND doc_no=?').run(accountSetId, doc.doc_no)
}

/** 往来台账查询：某单位指定期间的应收应付发生额与余额 */
export function getPartnerLedger(db: Database.Database, accountSetId: string, partnerCode: string, startDate?: string, endDate?: string) {
  const conds = ['account_set_id=?', 'partner_code=?']; const ps: any[] = [accountSetId, partnerCode]
  if (startDate) { conds.push('doc_date>=?'); ps.push(startDate) }
  if (endDate) { conds.push('doc_date<=?'); ps.push(endDate) }
  const rows = db.prepare(`SELECT * FROM scm_ar_ap_log WHERE ${conds.join(' AND ')} ORDER BY doc_date, created_at`).all(...ps)
  // calc opening balance
  let opening = 0
  if (startDate) {
    const ob = db.prepare('SELECT COALESCE(SUM(CASE WHEN direction=? THEN amount ELSE -amount END),0) as bal FROM scm_ar_ap_log WHERE account_set_id=? AND partner_code=? AND doc_date<?').get('in', accountSetId, partnerCode, startDate) as any
    opening = ob?.bal || 0
  }
  let running = opening
  const detail = (rows as any[]).map((r: any) => { running += r.direction === 'in' ? r.amount : -r.amount; return { ...r, balance: Math.round(running * 100) / 100 } })
  return { opening: Math.round(opening * 100) / 100, detail, closing: Math.round(running * 100) / 100 }
}
