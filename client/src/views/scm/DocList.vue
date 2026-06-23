<template>
  <div class="page scm-doc-page">

    <div class="filter-row">
      <el-select v-if="!propType" v-model="filters.doc_type" placeholder="单据类型" style="width:140px" @change="load" clearable size="small">
        <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
      </el-select>
      <el-select v-model="filters.warehouse_code" placeholder="仓库" clearable style="width:120px" size="small">
        <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
      </el-select>
      <el-input v-model="filters.partner_code" placeholder="往来单位" clearable style="width:140px" size="small" />
      <el-date-picker v-model="filters.start_date" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:130px" size="small" />
      <el-date-picker v-model="filters.end_date" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:130px" size="small" />
      <el-button type="primary" plain @click="load" size="small"><el-icon><Search /></el-icon>查询</el-button>
      <el-button type="primary" size="small" @click="handleCreate"><el-icon><Plus /></el-icon>新增单据</el-button>
      <el-popover v-if="canColScheme" placement="bottom-end" :width="240" trigger="click">
        <template #reference>
          <el-button size="small" plain><el-icon><Setting /></el-icon>列设置</el-button>
        </template>
        <div class="col-setting">
          <div class="col-setting__hd">
            <span>显示列</span>
            <el-button link type="primary" size="small" @click="resetColumns">恢复默认</el-button>
          </div>
          <el-checkbox-group v-model="visibleColKeys" @change="saveColumnConfig">
            <el-checkbox
              v-for="c in availableColumns"
              :key="c.key"
              :value="c.key"
              :disabled="c.required"
              size="small"
            >{{ c.label }}</el-checkbox>
          </el-checkbox-group>
        </div>
      </el-popover>
    </div>

    <div v-if="!propType" class="doc-type-tabs">
      <el-radio-group v-model="filters.doc_type" size="small" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button v-for="g in tabGroups" :key="g.key" :value="g.key">{{ g.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="page-body">
      <el-table ref="tableRef" :data="list" v-loading="loading" border stripe size="small" height="100%" @row-dblclick="handleView" @header-dragend="onDragEnd">
        <el-table-column v-if="col('doc_no')" label="单据号" prop="doc_no" :width="cw('doc_no', 160)" />
        <el-table-column v-if="col('doc_date')" label="日期" prop="doc_date" :width="cw('doc_date', 100)" />
        <el-table-column v-if="col('doc_type') && !propType" label="类型" column-key="doc_type" :width="cw('doc_type', 90)">
          <template #default="{ row }">{{ typeName(row.doc_type) }}</template>
        </el-table-column>
        <el-table-column v-if="col('partner')" label="往来单位" column-key="partner" min-width="150" :width="widths.partner" show-overflow-tooltip>
          <template #default="{ row }">{{ row.partner_name || row.partner_code }}</template>
        </el-table-column>
        <el-table-column v-if="col('warehouse')" label="仓库" column-key="warehouse" :width="cw('warehouse', 120)">
          <template #default="{ row }">{{ row.warehouse_name || row.warehouse_code }}</template>
        </el-table-column>
        <el-table-column v-if="col('biz_person')" label="业务员" prop="biz_person" :width="cw('biz_person', 90)" show-overflow-tooltip />
        <el-table-column v-if="col('dept_code')" label="部门" prop="dept_code" :width="cw('dept_code', 90)" show-overflow-tooltip />
        <el-table-column v-if="col('contract_no')" label="合同号" prop="contract_no" :width="cw('contract_no', 130)" show-overflow-tooltip />
        <el-table-column v-if="col('payment_type')" label="付款方式" :width="cw('payment_type', 90)">
          <template #default="{ row }">{{ paymentLabel(row.payment_type) }}</template>
        </el-table-column>
        <el-table-column v-if="col('invoice_no')" label="发票号" prop="invoice_no" :width="cw('invoice_no', 130)" show-overflow-tooltip />
        <el-table-column v-if="col('total_qty')" label="数量" prop="total_qty" :width="cw('total_qty', 80)" align="right" />
        <el-table-column v-if="col('total_amount')" label="金额" prop="total_amount" :width="cw('total_amount', 110)" align="right">
          <template #default="{ row }">{{ fmt(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column v-if="col('total_with_tax')" label="价税合计" :width="cw('total_with_tax', 120)" align="right">
          <template #default="{ row }">{{ fmt((row.total_amount || 0) + ((row as any).total_tax || 0)) }}</template>
        </el-table-column>
        <el-table-column v-if="col('currency')" label="币别" prop="currency" :width="cw('currency', 70)" align="center" />
        <el-table-column v-if="col('maker')" label="制单人" prop="maker" :width="cw('maker', 90)" show-overflow-tooltip />
        <el-table-column v-if="col('auditor')" label="审核人" prop="auditor" :width="cw('auditor', 90)" show-overflow-tooltip />
        <el-table-column v-if="col('push')" label="下推数量" width="110" align="center">
          <template #default="{ row }">
            <span v-if="isPushProgressDoc(row.doc_type)">
              <el-tag :type="row.pushed_qty >= row.total_qty && row.total_qty > 0 ? 'success' : (row.pushed_qty > 0 ? 'warning' : 'info')" size="small">
                {{ row.pushed_qty || 0 }} / {{ row.total_qty || 0 }}
              </el-tag>
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="col('status')" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'audited' ? 'success' : 'info'" size="small">
              {{ row.status === 'audited' ? '已审核' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="col('remark')" label="备注" prop="remark" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" width="132" fixed="right" align="center" class-name="action-col">
          <template #default="{ row }">
            <ScmDocActions :row="row" @changed="load" />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev,pager,next,total" background @current-change="load" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Plus, Setting } from '@element-plus/icons-vue'
import { scmApi, type ScmDoc, type ScmDocType } from '@/api/scm'
import { hasPermission } from '@/utils/permission'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'
import ScmDocActions from '@/components/scm/ScmDocActions.vue'
import { isPushProgressDoc } from '@/utils/scmDoc'

const { tableRef, colWidth, onDragEnd, widths } = useListColumnWidth('scm_doc_list')
function cw(key: string, fallback: number) { return colWidth(key, fallback) }

const route  = useRoute()
const router = useRouter()

const propType = computed(() => (route.query.doc_type as string) || '')

const list      = ref<ScmDoc[]>([])
const total     = ref(0)
const page      = ref(1)
const pageSize  = 30
const loading   = ref(false)
const types     = ref<ScmDocType[]>([])
const warehouses = ref<any[]>([])
const filters   = reactive({ doc_type: propType.value, warehouse_code: '', partner_code: '', start_date: '', end_date: '' })

const DOC_TITLE: Record<string, string> = {
  PI:'采购入库', PR:'采购退货', SO:'销售出库', SR:'销售退货',
  OI:'其他入库', OO:'其他出库', TR:'调拨单', CK:'盘点单',
  PL:'生产领用', PF:'完工入库', PS:'不良品入库', PB:'补料单', PJ:'退料单',
  WO:'委外发货', WI:'委外入库', AS:'组装单', DS:'拆卸单',
  PO:'采购订单', PQ:'采购询价', SQ:'销售报价', SOa:'销售订单',
  RP:'采购发票', RS:'销售发票', PAY:'付款单', RCV:'收款单', MR:'缺料单',
}

const title = computed(() => propType.value ? DOC_TITLE[propType.value] || '单据列表' : '供应链单据')

const tabGroups = computed(() => [
  { key: 'PI', label: '采购入库' }, { key: 'SO', label: '销售出库' },
  { key: 'OI', label: '其他入库' }, { key: 'OO', label: '其他出库' },
  { key: 'PL', label: '生产领用' }, { key: 'PF', label: '完工入库' },
  { key: 'PO', label: '采购订单' }, { key: 'SOa', label: '销售订单' },
  { key: 'PAY', label: '付款单' }, { key: 'RCV', label: '收款单' },
  { key: 'TR', label: '调拨' }, { key: 'CK', label: '盘点' },
])

const typeName = (c: string) => DOC_TITLE[c] || c
const fmt = (v: number) => (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAYMENT_LABEL: Record<string, string> = { cash: '现金', transfer: '转账', credit: '挂账' }
const paymentLabel = (v?: string) => (v ? (PAYMENT_LABEL[v] || v) : '')

// ── 自定义显示列 ────────────────────────────────────────────
const STORAGE_KEY_COLS = 'scm_doc_list_columns_visible'
const allColumns: Array<{ key: string; label: string; required?: boolean; def: boolean }> = [
  { key: 'doc_no',         label: '单据号',   required: true,  def: true },
  { key: 'doc_date',       label: '日期',     def: true },
  { key: 'doc_type',       label: '类型',     def: true },
  { key: 'partner',        label: '往来单位', def: true },
  { key: 'warehouse',      label: '仓库',     def: true },
  { key: 'biz_person',     label: '业务员',   def: false },
  { key: 'dept_code',      label: '部门',     def: false },
  { key: 'contract_no',    label: '合同号',   def: false },
  { key: 'payment_type',   label: '付款方式', def: false },
  { key: 'invoice_no',     label: '发票号',   def: false },
  { key: 'total_qty',      label: '数量',     def: true },
  { key: 'total_amount',   label: '金额',     def: true },
  { key: 'total_with_tax', label: '价税合计', def: true },
  { key: 'currency',       label: '币别',     def: false },
  { key: 'maker',          label: '制单人',   def: false },
  { key: 'auditor',        label: '审核人',   def: false },
  { key: 'push',           label: '下推数量', def: true },
  { key: 'status',         label: '状态',     def: true },
  { key: 'remark',         label: '备注',     def: false },
]

// 扩展列对单据类型字段配置的依赖：仅当该类型 header_fields/line_fields 含对应项时才可用
const parseCfg = (s?: string): string[] => { try { return s ? JSON.parse(s) : [] } catch { return [] } }
const COL_HEADER_DEP: Record<string, string> = {
  partner: 'partner', warehouse: 'warehouse', biz_person: 'biz_person',
  dept_code: 'dept', contract_no: 'contract', payment_type: 'payment',
  invoice_no: 'invoice', currency: 'currency',
}
// 始终可用的通用列（与单据类型无关）
const ALWAYS_COLS = new Set(['doc_no', 'doc_date', 'total_qty', 'total_amount', 'status', 'maker', 'auditor', 'remark'])

// 当前筛选类型下「实际拥有」的列集合（驱动列设置面板与渲染）
const availableColKeys = computed<Set<string>>(() => {
  const dt = filters.doc_type
  // 「全部」视图：各类型字段并集，允许选任意列
  if (!dt) return new Set(allColumns.map(c => c.key))
  const t = types.value.find(x => x.code === dt)
  const header = parseCfg(t?.header_fields)
  const line = parseCfg(t?.line_fields)
  const s = new Set<string>(ALWAYS_COLS)
  for (const [colKey, dep] of Object.entries(COL_HEADER_DEP)) if (header.includes(dep)) s.add(colKey)
  if (line.includes('tax_amount') || line.includes('tax_rate')) s.add('total_with_tax')
  if (['PO', 'PQ', 'SOa', 'SQ', 'MR'].includes(dt)) s.add('push')  // 有下推目标的类型
  return s
})
// 列设置面板仅展示当前类型可用的列
const availableColumns = computed(() => allColumns.filter(c => availableColKeys.value.has(c.key)))

const defaultColKeys = () => allColumns.filter(c => c.def || c.required).map(c => c.key as string)
const visibleColKeys = ref<string[]>(defaultColKeys())

// ── 列方案：有 scm:colscheme 权限者可用「列设置」自行调列；无权限者按分配方案锁定 ──
const canColScheme = computed(() => hasPermission('scm:colscheme'))
/** 当前类型下方案要隐藏的列；仅对「无权限」用户硬生效（有权限者用本地列设置自由控制） */
const listHidden = ref<Set<string>>(new Set())
async function loadListColScheme() {
  const dt = filters.doc_type
  if (!dt) { listHidden.value = new Set(); return }  // 「全部」混合视图不套单类型方案
  try {
    const res = await scmApi.getMyColScheme({ target: 'list', doc_type: dt })
    listHidden.value = res.code === 0 ? new Set(res.data.hidden_cols || []) : new Set()
  } catch { listHidden.value = new Set() }
}

// 渲染 = 用户勾选 ∩ 当前类型可用列；无权限用户再叠加方案隐藏（锁定）
const col = (key: string) =>
  visibleColKeys.value.includes(key) && availableColKeys.value.has(key) &&
  (canColScheme.value || !listHidden.value.has(key))

function loadColumnConfig() {
  const stored = localStorage.getItem(STORAGE_KEY_COLS)
  if (stored) {
    try {
      const saved = JSON.parse(stored) as string[]
      if (Array.isArray(saved) && saved.length) {
        // 必选列始终保留
        const required = allColumns.filter(c => c.required).map(c => c.key as string)
        const keys = saved.filter(k => allColumns.some(c => c.key === k))
        // 一次性迁移：价税合计列由隐藏改为默认显示，为老配置补上（只补一次，之后用户仍可手动取消）
        const MIGRATION_KEY = STORAGE_KEY_COLS + ':taxcol'
        if (!localStorage.getItem(MIGRATION_KEY)) {
          if (!keys.includes('total_with_tax')) keys.push('total_with_tax')
          localStorage.setItem(MIGRATION_KEY, '1')
        }
        visibleColKeys.value = Array.from(new Set([...required, ...keys]))
      }
    } catch {}
  }
}
function saveColumnConfig() {
  // 必选列强制包含
  for (const c of allColumns) if (c.required && !visibleColKeys.value.includes(c.key)) visibleColKeys.value.push(c.key)
  localStorage.setItem(STORAGE_KEY_COLS, JSON.stringify(visibleColKeys.value))
}
function resetColumns() {
  visibleColKeys.value = defaultColKeys()
  localStorage.removeItem(STORAGE_KEY_COLS)
}
loadColumnConfig()

watch(propType, v => { filters.doc_type = v; load() })

async function load() {
  loadListColScheme()  // 并行加载当前类型的列方案（不阻塞数据查询）
  loading.value = true
  try {
    const res = await scmApi.getDocs({ ...filters, doc_type: filters.doc_type || undefined, page: page.value, page_size: pageSize })
    if (res.code === 0) { list.value = res.data.list; total.value = res.data.total }
  } finally { loading.value = false }
}

onMounted(async () => {
  const [ts, ws] = await Promise.all([scmApi.getDocTypes(), scmApi.getWarehouses()])
  if (ts.code === 0) types.value = ts.data
  if (ws.code === 0) warehouses.value = ws.data
  load()
})

onActivated(() => { load() })

// 路由跳转
function handleCreate() {
  const dt = filters.doc_type || propType.value
  router.push({ name: 'ScmDocNew', query: dt ? { doc_type: dt } : {} })
}
// 行双击查看（行内其余操作见 ScmDocActions 组件）
function handleView(row: ScmDoc) {
  router.push({ name: 'ScmDocView', params: { id: row.id } })
}
</script>

<style scoped>
.scm-doc-page { padding: 12px 16px; }

.filter-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
.doc-type-tabs { margin-bottom: 8px; }
:deep(.action-col .cell) { padding: 0 4px !important; }
.action-btns { display: flex; justify-content: center; align-items: center; gap: 2px; flex-wrap: wrap; }
.action-btns .el-button { margin: 0 !important; padding: 0 2px !important; min-width: auto; font-size: 13px; }
.col-setting__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
.col-setting :deep(.el-checkbox-group) { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
.col-setting :deep(.el-checkbox) { margin-right: 0; }
</style>
