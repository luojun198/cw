// 供应链单据：类型名 / 下推链路 / 锁定判断等共享逻辑（列表与上下游追溯共用）
import type { ScmDoc } from '@/api/scm'

export const DOC_TITLE: Record<string, string> = {
  PI: '采购入库', PR: '采购退货', SO: '销售出库', SR: '销售退货',
  OI: '其他入库', OO: '其他出库', TR: '调拨单', CK: '盘点单',
  PL: '生产领用', PF: '完工入库', PS: '不良品入库', PB: '补料单', PJ: '退料单',
  WO: '委外发货', WI: '委外入库', AS: '组装单', DS: '拆卸单',
  PO: '采购订单', PQ: '采购询价', SQ: '销售报价', SOa: '销售订单',
  RP: '采购发票', RS: '销售发票', PAY: '付款单', RCV: '收款单', MR: '缺料单',
}
export const typeName = (c: string) => DOC_TITLE[c] || c

// 下推链路：上游类型 → 下游目标类型
export const PUSH_MAP: Record<string, string> = {
  PO: 'PI',   // 采购订单→采购入库
  PQ: 'PO',   // 采购询价→采购订单
  SOa: 'SO',  // 销售订单→销售出库
  SQ: 'SOa',  // 销售报价→销售订单
}
export const PUSH_LABEL: Record<string, string> = {
  PO: '采购入库', PQ: '采购订单', SOa: '销售出库', SQ: '销售订单',
}
export function pushTarget(docType: string): string | undefined { return PUSH_MAP[docType] }
export function pushLabel(docType: string): string { return PUSH_LABEL[docType] || '' }
export function isPushProgressDoc(docType: string): boolean { return !!pushTarget(docType) || docType === 'MR' }

// 已被下游引用（部分/完全下推）即视为锁定，禁止编辑/删除
export function isLocked(row: ScmDoc): boolean {
  return isPushProgressDoc(row.doc_type) && row.push_progress != null && row.push_progress !== 'none'
}

// 是否存在上下游关联（数据驱动控制「览」按钮）
export function hasTrace(row: ScmDoc): boolean {
  return !!row.source_doc_id
    || (row.upstream_doc_count || 0) > 0
    || (row.downstream_doc_count || 0) > 0
    || (row.downstream_line_count || 0) > 0
    || (row.downstream_plan_count || 0) > 0
}
