import request, { type RequestConfig } from './request'

export interface ScmItemFieldDef {
  id?: string
  field_key: string
  field_name: string
  field_type: 'text' | 'number' | 'date' | 'select'
  options_json?: string
  sort_order?: number
  is_enabled?: number
}

export interface ScmItem {
  id: string
  code: string
  name: string
  spec?: string
  barcode?: string
  short_code?: string
  unit?: string               // 向后兼容：主单位名称文本
  primary_unit_code?: string  // 主单位编号
  unit_name?: string          // 主单位名称
  secondary_units?: ScmItemUnit[] // 副单位列表
  category_code?: string
  subcategory_code?: string
  item_type?: string
  purchase_price?: number
  sale_price?: number
  ref_cost?: number
  fixed_cost?: number
  inv_account?: string
  sale_account?: string
  batch_flag?: number
  is_asset?: number
  is_leaf?: number
  field_values?: Record<string, any>
  supplier_code?: string
  remark?: string
  enabled?: number
  // 扩展字段（Phase 5）
  volume?: number
  min_order_qty?: number
  lead_time_days?: number
  shelf_life_days?: number
  batch_out_mode?: 'fifo' | 'manual'
  serial_flag?: number
  buyer?: string
  work_station?: string
  transfer_price?: number
  sale_price2?: number
  sale_price3?: number
  safety_stock?: number
  source_type?: 'purchase' | 'outsource' | 'self'  // 物料来源：采购/委外/自制
}

export interface ScmUnit {
  id: string
  code: string
  name: string
  enabled: number
  remark?: string
  created_at?: string
  updated_at?: string
}

export interface ScmItemUnit {
  unit_code: string
  unit_name?: string
  is_primary: number
  conversion_rate: number
}

export interface ScmPartner {
  id: string
  code: string
  name: string
  short_name?: string
  partner_type?: string
  ar_account?: string
  ap_account?: string
  credit_limit?: number
  tax_rate?: number
  region_code?: string
  contact?: string
  phone?: string
  address?: string
  bank_name?: string
  bank_account?: string
  tax_no?: string
  salesman?: string
  price_level?: number
  remark?: string
  enabled?: number
  // 扩展字段（Phase 5）
  ship_address?: string
  ship_phone?: string
  ship_contact?: string
  province?: string
  city?: string
  county?: string
  country?: string
  payment_type?: string
  credit_days?: number
  qq?: string
  email?: string
  wechat?: string
  is_outsource?: number  // 委外厂标识
}

export interface ScmWarehouse {
  id: string
  code: string
  name: string
  attr?: string
  keeper?: string
  remark?: string
  enabled?: number
  // 扩展字段（Phase 5）
  address?: string
  phone?: string
  partner_code?: string
}

export const ITEM_TYPES: Record<string, string> = { '0': '原辅材料', '6': '半成品', '9': '成品' }
export const SOURCE_TYPES: Record<string, string> = { purchase: '采购', outsource: '委外', self: '自制' }
export const COSTING_METHODS: Record<string, string> = {
  moving_avg: '移动加权平均',
  month_avg: '全月平均',
  fifo: '先进先出',
  lifo: '后进先出',
  specified: '指定成本',
}

export interface ScmDocRef { id: string; doc_no: string; doc_type: string; status: string }
export interface ScmDoc { id?: string; doc_type: string; doc_no?: string; doc_date?: string; partner_code?: string; partner_name?: string; warehouse_code?: string; warehouse_name?: string; operator?: string; status?: string; source_doc_id?: string; total_qty?: number; total_amount?: number; remark?: string; lines?: ScmDocLine[];
  // 扩展表头字段（Phase 2）
  biz_person?: string; payment_type?: string; settle_account?: string; invoice_type?: string; invoice_no?: string; invoice_date?: string;
  contract_no?: string; currency?: string; exchange_rate?: number; discount_rate?: number; expect_date?: string; dest_warehouse_code?: string;
  credit_days?: number; due_date?: string; maker?: string; auditor?: string; audited_at?: string; total_tax?: number; field_values?: Record<string, any> | string;
  voucher_id?: string; pushed_qty?: number;
  // 上下游链路
  push_progress?: 'none' | 'part' | 'full'; total_lines?: number; pushed_lines?: number; fully_pushed_lines?: number;
  source_doc?: ScmDocRef | null; source_docs?: ScmDocRef[]; target_docs?: ScmDocRef[];
  // 销售订单已生成缺料单标记（SOa 列表用，防重复下推）
  shortage_doc_count?: number; shortage_doc_id?: string;
  // 上下游计数（列表用，控制「览」追溯按钮显隐）
  downstream_doc_count?: number; downstream_plan_count?: number; upstream_doc_count?: number; downstream_line_count?: number }
export interface ScmDocLine { id?: string; seq?: number; item_code: string; item_name?: string; spec?: string; unit?: string; warehouse_code?: string; qty: number; pushed_qty?: number; price?: number; amount?: number; tax_rate?: number; tax_amount?: number; unit_cost?: number; batch_no?: string; source_line_id?: string; remark?: string;
  // 扩展明细字段（Phase 2）
  price_with_tax?: number; discount_rate?: number; discount_amount?: number; expire_date?: string; produce_date?: string; gift_flag?: number; ref_no?: string; scrap_rate?: number; process_fee?: number; field_values?: Record<string, any> | string;
  supplier_code?: string; source_type?: string; serial_nos?: string[] | string;
  // 物料档案默认供应商/来源（getDoc 返回，用于行供应商为空时的展示兜底）
  item_supplier?: string; item_source_type?: string }
export interface ScmDocType { code: string; name: string; direction: string; affects_stock: number; affects_ar_ap: number; category: string;
  header_fields?: string; line_fields?: string; required_fields?: string }

export const DOC_CATEGORIES: Record<string, string> = { purchase: '采购', sale: '销售', inventory: '库存', production: '生产', outsource: '委外', finance: '财务' }

/** 销售订单可用库存对比行 */
export interface ScmStockAvailLine {
  line_id: string; seq?: number; item_code: string; item_name?: string; spec?: string; unit?: string
  warehouse_code?: string; warehouse_name?: string
  order_qty: number; pushed_qty: number; remain: number
  on_hand: number; other_reserved: number; available: number
  ship_qty: number; short_qty: number
  price?: number; unit_cost?: number; bom_id?: string
  supplier_code?: string; purchase_price?: number; source_type?: 'purchase' | 'outsource' | 'self'
  // BOM 展开（材料缺口）模式专有字段
  required?: number
}

export const scmApi = {
  // 物料
  getItemNextNo: () => request.get<{ next_no: string }>('/scm/items/next-no'),
  getItems: (params?: { keyword?: string; category_code?: string; item_type?: string; is_leaf?: number; page?: number; page_size?: number; all?: string | number }) =>
    request.get<{ list: ScmItem[]; total: number; page: number; page_size: number }>('/scm/items', { params }),
  createItem: (data: Partial<ScmItem>) => request.post<{ id: string }>('/scm/items', data),
  // 物料自定义字段定义
  getItemFieldDefs: () => request.get<ScmItemFieldDef[]>('/scm/item-fields'),
  saveItemFieldDefs: (fields: ScmItemFieldDef[]) => request.post('/scm/item-fields', { fields }),
  updateItem: (id: string, data: Partial<ScmItem>) => request.put(`/scm/items/${id}`, data),
  deleteItem: (id: string) => request.delete(`/scm/items/${id}`),

  // 往来单位
  getPartnerNextNo: (partner_type?: string) => request.get<{ next_no: string }>('/scm/partners/next-no', { params: { partner_type } }),
  getPartners: (params?: { keyword?: string; partner_type?: string }) =>
    request.get<ScmPartner[]>('/scm/partners', { params }),
  createPartner: (data: Partial<ScmPartner>) => request.post<{ id: string }>('/scm/partners', data),
  updatePartner: (id: string, data: Partial<ScmPartner>) => request.put(`/scm/partners/${id}`, data),
  deletePartner: (id: string) => request.delete(`/scm/partners/${id}`),

  // 仓库
  getWarehouseNextNo: () => request.get<{ next_no: string }>('/scm/warehouses/next-no'),
  getWarehouses: () => request.get<ScmWarehouse[]>('/scm/warehouses'),
  createWarehouse: (data: Partial<ScmWarehouse>) => request.post<{ id: string }>('/scm/warehouses', data),
  updateWarehouse: (id: string, data: Partial<ScmWarehouse>) => request.put(`/scm/warehouses/${id}`, data),
  deleteWarehouse: (id: string) => request.delete(`/scm/warehouses/${id}`),

  // 计量单位
  getUnitNextNo: () => request.get<{ next_no: string }>('/scm/units/next-no'),
  getUnits: () => request.get<ScmUnit[]>('/scm/units'),
  createUnit: (data: Partial<ScmUnit>) => request.post<{ id: string }>('/scm/units', data),
  updateUnit: (id: string, data: Partial<ScmUnit>) => request.put(`/scm/units/${id}`, data),
  deleteUnit: (id: string) => request.delete(`/scm/units/${id}`),

  // 库存
  getStock: (params?: { keyword?: string; warehouse_code?: string }) =>
    request.get<any[]>('/scm/stock', { params }),
  getStockLedger: (params: { item_code?: string; warehouse_code?: string; start_date?: string; end_date?: string }) =>
    request.get<any[]>('/scm/stock/ledger', { params }),

  // 分类
  getCategories: () => request.get<any[]>('/scm/categories'),
  createCategory: (data: { code: string; name: string; parent_code?: string | null }) => request.post('/scm/categories', data),
  updateCategory: (id: string, data: { name: string; parent_code?: string | null }) => request.put(`/scm/categories/${id}`, data),
  deleteCategory: (id: string) => request.delete(`/scm/categories/${id}`),
  // 库位档案
  getBins: (warehouse_code?: string) => request.get<any[]>('/scm/bins', { params: warehouse_code ? { warehouse_code } : {} }),
  createBin: (data: { warehouse_code: string; code: string; name: string; remark?: string }) => request.post('/scm/bins', data),
  updateBin: (id: string, data: { name: string; remark?: string; enabled?: number }) => request.put(`/scm/bins/${id}`, data),
  deleteBin: (id: string) => request.delete(`/scm/bins/${id}`),

  // 参数
  getParams: () => request.get<{ param_key: string; param_value: string }[]>('/scm/params'),
  saveParams: (params: { param_key: string; param_value: string }[]) => request.put('/scm/params', { params }),
  // 供应链初始化（清空业务数据 business / 连同档案 all）
  resetData: (mode: 'business' | 'all') => request.post<{ ok: boolean; cleared: string[] }>('/scm/reset', { mode }),

  // 单据
  getDocTypes: () => request.get<ScmDocType[]>('/scm/docs/types'),
  seedDocTypes: () => request.post<{ seeded: number }>('/scm/docs/seed', {}),
  getDocNextNo: (doc_type: string) => request.get<{ next_no: string }>('/scm/docs/next-no', { params: { doc_type } }),
  getDocs: (params: { doc_type?: string; partner_code?: string; warehouse_code?: string; status?: string; start_date?: string; end_date?: string; page?: number; page_size?: number }) =>
    request.get<{ list: ScmDoc[]; total: number; page: number; page_size: number }>('/scm/docs', { params }),
  getDoc: (id: string) => request.get<ScmDoc & { lines: ScmDocLine[] }>(`/scm/docs/${id}`),
  createDoc: (data: Partial<ScmDoc> & { lines?: Partial<ScmDocLine>[] }) => request.post<{ id: string; doc_no: string }>('/scm/docs', data),
  updateDoc: (id: string, data: Partial<ScmDoc> & { lines?: Partial<ScmDocLine>[] }) => request.put(`/scm/docs/${id}`, data),
  deleteDoc: (id: string, config?: RequestConfig) => request.delete(`/scm/docs/${id}`, config),
  auditDoc: (id: string) => request.post<{ ok: boolean }>(`/scm/docs/${id}/audit`, {}),
  unauditDoc: (id: string, config?: RequestConfig) => request.post<{ ok: boolean }>(`/scm/docs/${id}/unaudit`, {}, config),
  genAssets: (id: string) => request.post<{ created: number }>(`/scm/docs/${id}/gen-assets`, {}),
  genVoucher: (id: string) => request.post<{ voucher_id: string; voucher_no: string; entry_count: number }>(`/scm/docs/${id}/gen-voucher`, {}),

  // BOM
  getBomNextNo: () => request.get<{ next_no: string }>('/scm/boms/next-no'),
  getBoms: () => request.get<any[]>('/scm/boms'),
  getBom: (id: string) => request.get<any>(`/scm/boms/${id}`),
  createBom: (data: any) => request.post<{ id: string }>('/scm/boms', data),
  updateBom: (id: string, data: any) => request.put(`/scm/boms/${id}`, data),
  deleteBom: (id: string) => request.delete(`/scm/boms/${id}`),

  // 生产计划
  getProductionPlans: () => request.get<any[]>('/scm/production-plans'),
  getProductionPlanNextNo: (plan_type?: 'self' | 'outsource') =>
    request.get<{ next_no: string }>('/scm/production-plans/next-no', { params: { plan_type } }),
  createProductionPlan: (data: any) => request.post<{ id: string }>('/scm/production-plans', data),
  deleteProductionPlan: (id: string) => request.delete(`/scm/production-plans/${id}`),
  // 工单（生产闭环）
  getProductionPlan: (id: string) => request.get<{ plan: any; bom_lines: any[]; docs: any[]; cost: { issuedCost: number; finishedCost: number; finishedQty: number; wip: number; unitCost: number } }>(`/scm/production-plans/${id}`),
  releaseProductionPlan: (id: string) => request.post(`/scm/production-plans/${id}/release`, {}),
  closeProductionPlan: (id: string, force = false) => request.post(`/scm/production-plans/${id}/close`, { force }, { skipErrorToast: true }),
  getIssueSuggestion: (id: string) => request.get<{ plan_id: string; yl_warehouse: string; lines: any[] }>(`/scm/production-plans/${id}/issue-suggestion`),
  genPlanIssue: (id: string) => request.post<{ id: string; doc_no: string }>(`/scm/production-plans/${id}/gen-issue`, {}),
  genPlanFinish: (id: string, qty: number, process_fee = 0) => request.post<{ id: string; doc_no: string }>(`/scm/production-plans/${id}/gen-finish`, { qty, process_fee }),
  // 批量下推生产/委外计划（销售订单缺口）
  createProductionPlansBatch: (data: { source_doc_id?: string; plan_type: 'self' | 'outsource'; supplier_code?: string; start_date?: string; end_date?: string; lines: Array<{ item_code: string; plan_qty: number; bom_id?: string; remark?: string }> }) =>
    request.post<{ created: number }>('/scm/production-plans/batch', data),

  // 销售订单可用库存对比
  getDocAvailability: (id: string, explode?: boolean) =>
    request.get<{ doc: ScmDoc; lines: ScmStockAvailLine[]; shortage_docs: Array<{ id: string; doc_no: string; status: string }>; explode?: boolean }>(`/scm/docs/${id}/availability`, { params: explode ? { explode: 1 } : {} }),
  // 单据上下游关联追溯（上游父单 + 下游子单 + 委外/生产计划）
  getDocDownstream: (id: string) =>
    request.get<{
      doc: ScmDoc
      upstream_docs: Array<{ id: string; doc_no: string; doc_type: string; status: string; doc_date?: string; partner_code?: string; partner_name?: string; total_qty?: number; total_amount?: number }>
      downstream_docs: Array<{ id: string; doc_no: string; doc_type: string; status: string; doc_date?: string; partner_code?: string; partner_name?: string; total_qty?: number; total_amount?: number }>
      downstream_plans: Array<{ id: string; code: string; plan_type: string; item_code: string; item_name?: string; plan_qty: number; supplier_code?: string; status?: string; start_date?: string; end_date?: string; remark?: string }>
    }>(`/scm/docs/${id}/downstream`),
  // 缺料单 → 按供应商拆采购订单(PO)/询价单(PQ)
  genPurchaseDocs: (id: string, target_type: 'PO' | 'PQ' = 'PO') =>
    request.post<{ created: number; target_type: string; docs: Array<{ doc_no: string; supplier_code: string; lines: number }> }>(`/scm/docs/${id}/gen-purchase-docs`, { target_type }),
  // 缺料单 → 按行物料来源自动路由（采购→PO、委外→委外计划、自制→生产计划）
  genDownstream: (id: string, targets?: Array<'purchase' | 'outsource' | 'self'>, quantities?: Record<string, number>) =>
    request.post<{ po: number; outsource_plans: number; self_plans: number }>(`/scm/docs/${id}/gen-downstream`, {
      ...(targets ? { targets } : {}),
      ...(quantities ? { quantities } : {}),
    }),

  // 往来台账
  getPartnerLedger: (partnerCode: string, params?: { start_date?: string; end_date?: string }) =>
    request.get<{ opening: number; detail: any[]; closing: number }>(`/scm/arap/${partnerCode}`, { params }),
  getArApAging: (params?: { as_of_date?: string }) =>
    request.get<any[]>('/scm/arap-aging', { params }),

  // 库存报表
  getStockSummary: (params?: { start_date?: string; end_date?: string; warehouse_code?: string }) =>
    request.get<{ summary: any[] }>('/scm/stock/summary', { params }),
  // 报表
  getStockAlert: () => request.get<any[]>('/scm/report/stock-alert'),
  getSalesReport: (params?: { start_date?: string; end_date?: string; item_code?: string; partner_code?: string }) =>
    request.get<any[]>('/scm/report/sales', { params }),
  getPurchaseReport: (params?: { start_date?: string; end_date?: string; item_code?: string; partner_code?: string }) =>
    request.get<any[]>('/scm/report/purchase', { params }),
  getPurchaseAdvice: () => request.get<any[]>('/scm/report/purchase-advice'),
  // 批次
  getBatchStock: (params?: { keyword?: string; warehouse_code?: string; batch_no?: string }) =>
    request.get<any[]>('/scm/batch-stock', { params }),
  getBatchAlert: (params?: { days?: number }) =>
    request.get<any[]>('/scm/report/batch-alert', { params }),
  // 序列号
  getSerials: (params?: { keyword?: string; serial_no?: string; status?: string; warehouse_code?: string }) =>
    request.get<any[]>('/scm/serials', { params }),
  // 复用财务辅助核算档案（业务员=人员, 部门）。注意 aux_items.type 存的是类别 id（UUID），需先取类别
  getAuxCategories: () => request.get<any[]>('/base/aux-categories'),
  getAuxItemsByCategory: (categoryId: string) =>
    request.get<any[]>('/base/aux-items', { params: { type: categoryId, all: 1 } }),
  createAuxItem: (data: { type: string; code: string; name: string }) =>
    request.post('/base/aux-items', data),
  // 复用出纳结算方式字典
  getSettleTypes: () => request.get<any[]>('/cashier/settle-types'),
  createSettleType: (data: { code: string; name: string }) => request.post('/cashier/settle-type', data),

  // BOM 展开
  explodeBom: (bomId: string, qty?: number) =>
    request.get<{ bom_id: string; qty: number; lines: any[] }>(`/scm/boms/${bomId}/explode`, { params: { qty } }),

  // 列方案（管理员建方案 + 分配用户；target: 'line'明细表 / 'list'单据列表）
  getColSchemes: (params: { target: string; doc_type?: string }) =>
    request.get<ColScheme[]>('/scm/col-schemes', { params }),
  createColScheme: (data: { target: string; doc_type: string; name: string; hidden_cols: string[] }) =>
    request.post<{ id: string }>('/scm/col-schemes', data),
  updateColScheme: (id: string, data: { name?: string; hidden_cols?: string[] }) =>
    request.put(`/scm/col-schemes/${id}`, data),
  deleteColScheme: (id: string) => request.delete(`/scm/col-schemes/${id}`),
  assignColScheme: (id: string, user_ids: string[]) =>
    request.post(`/scm/col-schemes/${id}/assign`, { user_ids }),
  getColSchemeUsers: () => request.get<ColSchemeUser[]>('/scm/col-schemes/users'),
  getMyColScheme: (params: { target: string; doc_type: string }) =>
    request.get<{ scheme_id: string | null; name: string | null; hidden_cols: string[] }>('/scm/col-schemes/my', { params }),
}

export interface ColScheme {
  id: string
  target: string
  doc_type: string
  name: string
  hidden_cols: string[]
  is_default: boolean
  user_ids: string[]
  created_at?: string
  updated_at?: string
}
export interface ColSchemeUser {
  id: string
  username: string
  nickname: string
}
