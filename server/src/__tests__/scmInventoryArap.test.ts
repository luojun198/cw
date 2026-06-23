import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import {
  applyMovingAvgIn,
  applyMovingAvgOut,
  reverseDocMoves,
  getCostingMethod,
} from '../services/scmCosting.js'
import {
  applyReceivableFromShipment,
  applyPayableFromReceipt,
  applyOutsourceFeePayable,
} from '../services/scmArAp.js'
import { computeFinishCost } from '../routes/scmDoc.js'

const AID = 'AS-TEST'

function createDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE system_params (id TEXT, account_set_id TEXT, param_key TEXT, param_value TEXT);
    CREATE TABLE scm_stock (id TEXT, account_set_id TEXT, warehouse_code TEXT, item_code TEXT,
      qty REAL DEFAULT 0, amount REAL DEFAULT 0, avg_cost REAL DEFAULT 0, updated_at TEXT);
    CREATE TABLE scm_stock_move (id TEXT, account_set_id TEXT, move_date TEXT, doc_type TEXT, doc_no TEXT,
      line_seq INTEGER, warehouse_code TEXT, item_code TEXT, direction TEXT, qty REAL, unit_cost REAL,
      amount REAL, batch_no TEXT, balance_qty REAL, balance_amount REAL, balance_avg_cost REAL);
    CREATE TABLE scm_doc (id TEXT, account_set_id TEXT, doc_type TEXT, doc_no TEXT);
    CREATE TABLE scm_partner (id TEXT, account_set_id TEXT, code TEXT, name TEXT, ar_account TEXT, ap_account TEXT);
    CREATE TABLE scm_ar_ap_log (id TEXT, account_set_id TEXT, partner_code TEXT, doc_type TEXT, doc_no TEXT,
      doc_date TEXT, direction TEXT, amount REAL, ar_account TEXT, ap_account TEXT, cashier_journal_id TEXT,
      remark TEXT, created_at TEXT DEFAULT (datetime('now')));
  `)
  return db
}

function stock(db: Database.Database, wh = 'W1', item = 'I1') {
  return db.prepare('SELECT qty, amount, avg_cost FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?').get(AID, wh, item) as any
}
const ref = (no: string, seq = 1) => ({ type: 'PI', no, seq, date: '2026-06-01' })

describe('scmCosting 移动加权平均', () => {
  let db: Database.Database
  beforeEach(() => { db = createDb() })

  it('入库按加权平均累计单位成本', () => {
    applyMovingAvgIn(db, AID, 'W1', 'I1', 10, 100, ref('D1'))
    expect(stock(db)).toMatchObject({ qty: 10, amount: 1000, avg_cost: 100 })
    applyMovingAvgIn(db, AID, 'W1', 'I1', 10, 120, ref('D2'))
    // (1000 + 1200) / 20 = 110
    expect(stock(db)).toMatchObject({ qty: 20, amount: 2200, avg_cost: 110 })
  })

  it('出库取当前均价、扣减库存', () => {
    applyMovingAvgIn(db, AID, 'W1', 'I1', 10, 100, ref('D1'))
    applyMovingAvgIn(db, AID, 'W1', 'I1', 10, 120, ref('D2'))
    const { unitCost } = applyMovingAvgOut(db, AID, 'W1', 'I1', 5, ref('D3'))
    expect(unitCost).toBe(110)
    // 20 - 5 = 15；2200 - 110*5 = 1650
    expect(stock(db)).toMatchObject({ qty: 15, amount: 1650, avg_cost: 110 })
  })

  it('reverseDocMoves 撤销单据库存移动', () => {
    const docId = uuidv4()
    db.prepare('INSERT INTO scm_doc (id,account_set_id,doc_type,doc_no) VALUES (?,?,?,?)').run(docId, AID, 'PI', 'D1')
    applyMovingAvgIn(db, AID, 'W1', 'I1', 10, 100, ref('D1'))
    expect(stock(db).qty).toBe(10)
    reverseDocMoves(db, AID, docId)
    expect(stock(db).qty).toBe(0)
    expect(db.prepare("SELECT COUNT(*) c FROM scm_stock_move WHERE account_set_id=?").get(AID)).toMatchObject({ c: 0 })
  })

  it('getCostingMethod 默认 moving_avg，可读参数', () => {
    expect(getCostingMethod(db, AID)).toBe('moving_avg')
    db.prepare('INSERT INTO system_params (id,account_set_id,param_key,param_value) VALUES (?,?,?,?)').run(uuidv4(), AID, 'scm:costing_method', 'fifo')
    expect(getCostingMethod(db, AID)).toBe('fifo')
  })
})

describe('scmArAp 货物驱动往来', () => {
  let db: Database.Database
  beforeEach(() => {
    db = createDb()
    db.prepare('INSERT INTO scm_partner (id,account_set_id,code,name,ar_account,ap_account) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), AID, 'P1', '客户甲', '1131', '2121')
  })

  it('销售发货生成应收（direction=in）', () => {
    applyReceivableFromShipment(db, AID, { doc_type: 'SO', doc_no: 'S1', doc_date: '2026-06-01', partner_code: 'P1' }, [{ amount: 300 }, { amount: 100 }])
    const rows = db.prepare("SELECT direction, amount FROM scm_ar_ap_log WHERE account_set_id=?").all(AID) as any[]
    expect(rows).toEqual([{ direction: 'in', amount: 400 }])
  })

  it('采购入库生成应付（direction=in）', () => {
    applyPayableFromReceipt(db, AID, { doc_type: 'PI', doc_no: 'I1', doc_date: '2026-06-01', partner_code: 'P1' }, [{ amount: 500 }])
    const rows = db.prepare("SELECT direction, amount, ap_account FROM scm_ar_ap_log WHERE account_set_id=?").all(AID) as any[]
    expect(rows).toEqual([{ direction: 'in', amount: 500, ap_account: '2121' }])
  })

  it('无往来单位时不挂应收/应付（回归 PI 无供应商崩溃）', () => {
    applyPayableFromReceipt(db, AID, { doc_type: 'PI', doc_no: 'I2', doc_date: '2026-06-01', partner_code: null }, [{ amount: 500 }])
    applyReceivableFromShipment(db, AID, { doc_type: 'SO', doc_no: 'S2', doc_date: '2026-06-01', partner_code: '' }, [{ amount: 300 }])
    expect(db.prepare("SELECT COUNT(*) c FROM scm_ar_ap_log WHERE account_set_id=?").get(AID)).toMatchObject({ c: 0 })
  })

  it('委外入库加工费生成委外厂应付（direction=in）', () => {
    applyOutsourceFeePayable(db, AID, { doc_type: 'WI', doc_no: 'WI1', doc_date: '2026-06-01', partner_code: 'P1' }, 300)
    const rows = db.prepare("SELECT direction, amount, ap_account FROM scm_ar_ap_log WHERE account_set_id=?").all(AID) as any[]
    expect(rows).toEqual([{ direction: 'in', amount: 300, ap_account: '2121' }])
  })

  it('加工费为0或无委外厂时不挂应付', () => {
    applyOutsourceFeePayable(db, AID, { doc_type: 'WI', doc_no: 'WI2', doc_date: '2026-06-01', partner_code: 'P1' }, 0)
    applyOutsourceFeePayable(db, AID, { doc_type: 'WI', doc_no: 'WI3', doc_date: '2026-06-01', partner_code: '' }, 300)
    expect(db.prepare("SELECT COUNT(*) c FROM scm_ar_ap_log WHERE account_set_id=?").get(AID)).toMatchObject({ c: 0 })
  })
})

describe('生产完工成本结转（实际成本·按计划数分摊，末批吸收）', () => {
  // 工单：计划10，已领成本1500（单位成本150）
  it('非末批按 单位成本×完工数 结转', () => {
    const r = computeFinishCost({ issuedCost: 1500, planQty: 10, wipBefore: 1500, finishedBefore: 0, thisQty: 5 })
    expect(r).toMatchObject({ isLast: false, unitCost: 150, thisAmount: 750, perUnit: 150 })
  })

  it('末批吸收 WIP 全部余额（含差异），保证在制归零', () => {
    // 已完工5、再完工5达成计划 → 末批；wipBefore=750
    const r = computeFinishCost({ issuedCost: 1500, planQty: 10, wipBefore: 750, finishedBefore: 5, thisQty: 5 })
    expect(r).toMatchObject({ isLast: true, thisAmount: 750, perUnit: 150 })
  })

  it('末批领料偏多时，末批吸收剩余差异（单位成本被抬高）', () => {
    // 计划10、实际领料1700（unitCost=170）；先完工5(按170→850)，余850；末批完工5 吸收 850
    const first = computeFinishCost({ issuedCost: 1700, planQty: 10, wipBefore: 1700, finishedBefore: 0, thisQty: 5 })
    expect(first).toMatchObject({ isLast: false, unitCost: 170, thisAmount: 850 })
    const last = computeFinishCost({ issuedCost: 1700, planQty: 10, wipBefore: 850, finishedBefore: 5, thisQty: 5 })
    expect(last).toMatchObject({ isLast: true, thisAmount: 850, perUnit: 170 })
  })

  it('超产也视为末批、吸收余额', () => {
    const r = computeFinishCost({ issuedCost: 1500, planQty: 10, wipBefore: 600, finishedBefore: 8, thisQty: 4 })
    expect(r.isLast).toBe(true)
    expect(r.thisAmount).toBe(600)
  })

  it('一次性全部完工：单位成本×全部数量=已领成本', () => {
    const r = computeFinishCost({ issuedCost: 1500, planQty: 10, wipBefore: 1500, finishedBefore: 0, thisQty: 10 })
    expect(r).toMatchObject({ isLast: true, thisAmount: 1500, perUnit: 150 })
  })
})
