/**
 * 供应链单据「列方案」可控列元数据。
 * 由列方案管理界面（ColSchemeManager）、明细表（DocForm）、单据列表（DocList）共用，
 * 保证三处对「可隐藏列」的 key 与名称完全一致。
 *
 * 仅列出「可被用户/方案隐藏的列」；核心列（物料/数量/金额/操作等）不在此，始终显示。
 */
export interface ColMeta { key: string; label: string }

/** 明细表（target='line'）可隐藏的可选业务列。key 与 DocForm 的 lineColShown(key) 对应。 */
export const LINE_OPT_COLS: ColMeta[] = [
  { key: 'realtime_stock', label: '实时库存' },
  { key: 'price_with_tax', label: '含税单价' },
  { key: 'discount_rate', label: '折扣(折)' },
  { key: 'tax_rate', label: '税率%' },
  { key: 'tax_amount', label: '税额' },
  { key: 'gross_amount', label: '价税合计' },
  { key: 'batch_no', label: '批号' },
  { key: 'produce_date', label: '生产日期' },
  { key: 'expire_date', label: '保质期' },
  { key: 'bin_no', label: '库位' },
  { key: 'scrap_rate', label: '损耗%' },
  { key: 'process_fee', label: '加工费' },
  { key: 'remark', label: '备注' },
]

/** 单据列表（target='list'）可隐藏的可选列。key 与 DocList allColumns 的 key 对应（不含 ALWAYS 必选列）。 */
export const LIST_OPT_COLS: ColMeta[] = [
  { key: 'doc_type', label: '类型' },
  { key: 'partner', label: '往来单位' },
  { key: 'warehouse', label: '仓库' },
  { key: 'biz_person', label: '业务员' },
  { key: 'dept_code', label: '部门' },
  { key: 'contract_no', label: '合同号' },
  { key: 'payment_type', label: '付款方式' },
  { key: 'invoice_no', label: '发票号' },
  { key: 'total_with_tax', label: '价税合计' },
  { key: 'currency', label: '币别' },
  { key: 'push', label: '下推数量' },
]

export function optColsFor(target: string): ColMeta[] {
  return target === 'list' ? LIST_OPT_COLS : LINE_OPT_COLS
}
