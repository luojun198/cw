/**
 * 供应链库存计价引擎
 * 按系统参数 scm:costing_method 计算出入库单位成本，写入 scm_stock_move 并更新 scm_stock。
 *
 * 本期支持 moving_avg；fifo/lifo/month_avg/specified 接口预留。
 */
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

export function getCostingMethod(db: Database.Database, accountSetId: string): string {
  const row = db.prepare(
    "SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='scm:costing_method'"
  ).get(accountSetId) as any
  return (row?.param_value as string) || 'moving_avg'
}

interface StockMoveRow {
  id: string; account_set_id: string; move_date: string
  doc_type: string; doc_no: string; line_seq: number
  warehouse_code: string; item_code: string; direction: 'in' | 'out'
  qty: number; unit_cost: number; amount: number; batch_no?: string | null
  balance_qty: number; balance_amount: number; balance_avg_cost: number
}

interface StockRow { qty: number; amount: number; avg_cost: number }

/** 计算移动加权平均入仓成本并写流水+更新即时库存 */
export function applyMovingAvgIn(
  db: Database.Database, accountSetId: string,
  warehouse: string, itemCode: string,
  inQty: number, inCost: number,
  doc: { type: string; no: string; seq: number; date: string }
): StockMoveRow {
  const stock = db.prepare(
    'SELECT qty, amount FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?'
  ).get(accountSetId, warehouse, itemCode) as StockRow | undefined

  const oldQty = stock?.qty || 0
  const oldAmt = stock?.amount || 0
  const newQty = oldQty + inQty
  const newAmt = Math.round((oldAmt + inCost * inQty) * 10000) / 10000
  const avg = newQty > 0 ? Math.round((newAmt / newQty) * 10000) / 10000 : 0

  if (stock) {
    db.prepare('UPDATE scm_stock SET qty=?,amount=?,avg_cost=?,updated_at=datetime(\'now\') WHERE account_set_id=? AND warehouse_code=? AND item_code=?')
      .run(newQty, newAmt, avg, accountSetId, warehouse, itemCode)
  } else {
    db.prepare('INSERT INTO scm_stock (id,account_set_id,warehouse_code,item_code,qty,amount,avg_cost) VALUES (?,?,?,?,?,?,?)')
      .run(uuidv4(), accountSetId, warehouse, itemCode, newQty, newAmt, avg)
  }

  const moveId = uuidv4()
  db.prepare(`INSERT INTO scm_stock_move (id,account_set_id,move_date,doc_type,doc_no,line_seq,warehouse_code,item_code,direction,qty,unit_cost,amount,batch_no,balance_qty,balance_amount,balance_avg_cost)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    moveId, accountSetId, doc.date, doc.type, doc.no, doc.seq,
    warehouse, itemCode, 'in', inQty, inCost, Math.round(inCost * inQty * 100) / 100, null,
    newQty, newAmt, avg
  )
  return { id: moveId, account_set_id: accountSetId, move_date: doc.date, doc_type: doc.type, doc_no: doc.no, line_seq: doc.seq, warehouse_code: warehouse, item_code: itemCode, direction: 'in', qty: inQty, unit_cost: inCost, amount: Math.round(inCost * inQty * 100) / 100, balance_qty: newQty, balance_amount: newAmt, balance_avg_cost: avg }
}

/** 移动加权平均出仓：取当前均价为 unit_cost，减少库存 */
export function applyMovingAvgOut(
  db: Database.Database, accountSetId: string,
  warehouse: string, itemCode: string,
  outQty: number,
  doc: { type: string; no: string; seq: number; date: string }
): { move: StockMoveRow; unitCost: number } {
  const stock = db.prepare(
    'SELECT qty, amount, avg_cost FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?'
  ).get(accountSetId, warehouse, itemCode) as StockRow | undefined

  const oldQty = stock?.qty || 0
  const oldAmt = stock?.amount || 0
  const unitCost = stock?.avg_cost || 0
  const newQty = Math.max(0, Math.round((oldQty - outQty) * 10000) / 10000)
  const outAmt = Math.round(unitCost * outQty * 100) / 100
  const newAmt = Math.max(0, Math.round((oldAmt - outAmt) * 10000) / 10000)
  const avg = newQty > 0 ? Math.round((newAmt / newQty) * 10000) / 10000 : 0

  if (stock) {
    db.prepare('UPDATE scm_stock SET qty=?,amount=?,avg_cost=?,updated_at=datetime(\'now\') WHERE account_set_id=? AND warehouse_code=? AND item_code=?')
      .run(newQty, newAmt, avg, accountSetId, warehouse, itemCode)
  }

  const moveId = uuidv4()
  db.prepare(`INSERT INTO scm_stock_move (id,account_set_id,move_date,doc_type,doc_no,line_seq,warehouse_code,item_code,direction,qty,unit_cost,amount,batch_no,balance_qty,balance_amount,balance_avg_cost)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    moveId, accountSetId, doc.date, doc.type, doc.no, doc.seq,
    warehouse, itemCode, 'out', outQty, unitCost, outAmt, null,
    newQty, newAmt, avg
  )
  return { move: { id: moveId, account_set_id: accountSetId, move_date: doc.date, doc_type: doc.type, doc_no: doc.no, line_seq: doc.seq, warehouse_code: warehouse, item_code: itemCode, direction: 'out', qty: outQty, unit_cost: unitCost, amount: outAmt, balance_qty: newQty, balance_amount: newAmt, balance_avg_cost: avg }, unitCost }
}

/** 撤销某张单据的全部库存移动（反审核/删单时回退库存） */
export function reverseDocMoves(db: Database.Database, accountSetId: string, docId: string) {
  const moves = db.prepare(
    'SELECT * FROM scm_stock_move WHERE account_set_id=? AND doc_type||\'-\'||doc_no IN (SELECT doc_type||\'-\'||doc_no FROM scm_doc WHERE id=?)'
  ).all(accountSetId, docId) as StockMoveRow[]
  if (!moves.length) return

  const removed = new Set<string>()
  for (const m of moves) {
    const key = `${m.warehouse_code}|${m.item_code}`
    if (removed.has(key)) continue; removed.add(key)
    const stock = db.prepare(
      'SELECT qty, amount FROM scm_stock WHERE account_set_id=? AND warehouse_code=? AND item_code=?'
    ).get(accountSetId, m.warehouse_code, m.item_code) as StockRow | undefined
    const oldQty = stock?.qty || 0
    const oldAmt = stock?.amount || 0
    const newQty = m.direction === 'in' ? Math.max(0, oldQty - m.qty) : oldQty + m.qty
    const newAmt = m.direction === 'in' ? Math.max(0, oldAmt - m.amount) : oldAmt + m.amount
    const avg = newQty > 0 ? newAmt / newQty : 0
    db.prepare('UPDATE scm_stock SET qty=?,amount=?,avg_cost=?,updated_at=datetime(\'now\') WHERE account_set_id=? AND warehouse_code=? AND item_code=?')
      .run(newQty, newAmt, avg, accountSetId, m.warehouse_code, m.item_code)
  }
  db.prepare('DELETE FROM scm_stock_move WHERE account_set_id=? AND doc_type||\'-\'||doc_no IN (SELECT doc_type||\'-\'||doc_no FROM scm_doc WHERE id=?)')
    .run(accountSetId, docId)
}
