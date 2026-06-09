import request from './request'

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
  remark?: string
  enabled?: number
}

export interface ScmWarehouse {
  id: string
  code: string
  name: string
  attr?: string
  keeper?: string
  remark?: string
  enabled?: number
}

export const ITEM_TYPES: Record<string, string> = { '0': '原辅材料', '6': '半成品', '9': '成品' }
export const COSTING_METHODS: Record<string, string> = {
  moving_avg: '移动加权平均',
  month_avg: '全月平均',
  fifo: '先进先出',
  lifo: '后进先出',
  specified: '指定成本',
}

export interface ScmDoc { id?: string; doc_type: string; doc_no?: string; doc_date?: string; partner_code?: string; partner_name?: string; warehouse_code?: string; warehouse_name?: string; operator?: string; status?: string; source_doc_id?: string; total_qty?: number; total_amount?: number; remark?: string; lines?: ScmDocLine[] }
export interface ScmDocLine { id?: string; seq?: number; item_code: string; item_name?: string; spec?: string; unit?: string; warehouse_code?: string; qty: number; price?: number; amount?: number; tax_rate?: number; unit_cost?: number; batch_no?: string; source_line_id?: string; remark?: string }
export interface ScmDocType { code: string; name: string; direction: string; affects_stock: number; affects_ar_ap: number; category: string }

export const DOC_CATEGORIES: Record<string, string> = { purchase: '采购', sale: '销售', inventory: '库存', production: '生产', outsource: '委外', finance: '财务' }

export const scmApi = {
  // 物料
  getItemNextNo: () => request.get<{ next_no: string }>('/scm/items/next-no'),
  getItems: (params?: { keyword?: string; category_code?: string; item_type?: string; page?: number; page_size?: number }) =>
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

  // 参数
  getParams: () => request.get<{ param_key: string; param_value: string }[]>('/scm/params'),
  saveParams: (params: { param_key: string; param_value: string }[]) => request.put('/scm/params', { params }),

  // 单据
  getDocTypes: () => request.get<ScmDocType[]>('/scm/docs/types'),
  seedDocTypes: () => request.post<{ seeded: number }>('/scm/docs/seed', {}),
  getDocNextNo: (doc_type: string) => request.get<{ next_no: string }>('/scm/docs/next-no', { params: { doc_type } }),
  getDocs: (params: { doc_type?: string; partner_code?: string; warehouse_code?: string; status?: string; start_date?: string; end_date?: string; page?: number; page_size?: number }) =>
    request.get<{ list: ScmDoc[]; total: number; page: number; page_size: number }>('/scm/docs', { params }),
  getDoc: (id: string) => request.get<ScmDoc & { lines: ScmDocLine[] }>(`/scm/docs/${id}`),
  createDoc: (data: Partial<ScmDoc> & { lines?: Partial<ScmDocLine>[] }) => request.post<{ id: string; doc_no: string }>('/scm/docs', data),
  updateDoc: (id: string, data: Partial<ScmDoc> & { lines?: Partial<ScmDocLine>[] }) => request.put(`/scm/docs/${id}`, data),
  deleteDoc: (id: string) => request.delete(`/scm/docs/${id}`),
  auditDoc: (id: string) => request.post<{ ok: boolean }>(`/scm/docs/${id}/audit`, {}),
  unauditDoc: (id: string) => request.post<{ ok: boolean }>(`/scm/docs/${id}/unaudit`, {}),
  genAssets: (id: string) => request.post<{ created: number }>(`/scm/docs/${id}/gen-assets`, {}),
  genVoucher: (id: string) => request.post<{ voucher_id: string; voucher_no: string; entry_count: number }>(`/scm/docs/${id}/gen-voucher`, {}),

  // BOM
  getBoms: () => request.get<any[]>('/scm/boms'),
  getBom: (id: string) => request.get<any>(`/scm/boms/${id}`),
  createBom: (data: any) => request.post<{ id: string }>('/scm/boms', data),
  updateBom: (id: string, data: any) => request.put(`/scm/boms/${id}`, data),
  deleteBom: (id: string) => request.delete(`/scm/boms/${id}`),

  // 生产计划
  getProductionPlans: () => request.get<any[]>('/scm/production-plans'),
  createProductionPlan: (data: any) => request.post<{ id: string }>('/scm/production-plans', data),

  // 往来台账
  getPartnerLedger: (partnerCode: string, params?: { start_date?: string; end_date?: string }) =>
    request.get<{ opening: number; detail: any[]; closing: number }>(`/scm/arap/${partnerCode}`, { params }),
  getArApAging: (params?: { as_of_date?: string }) =>
    request.get<any[]>('/scm/arap-aging', { params }),

  // 库存报表
  getStockSummary: (params?: { start_date?: string; end_date?: string; warehouse_code?: string }) =>
    request.get<{ summary: any[] }>('/scm/stock/summary', { params }),

  // BOM 展开
  explodeBom: (bomId: string, qty?: number) =>
    request.get<{ bom_id: string; qty: number; lines: any[] }>(`/scm/boms/${bomId}/explode`, { params: { qty } }),
}
