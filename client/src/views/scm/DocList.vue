<template>
  <div class="page scm-doc-page">
    <div class="page-header">
      <h3>{{ title }}</h3>
      <div class="filter-row">
        <el-select v-if="!propType" v-model="filters.doc_type" placeholder="单据类型" style="width:150px" @change="load" clearable>
          <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
        </el-select>
        <el-select v-model="filters.warehouse_code" placeholder="仓库" clearable style="width:130px">
          <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
        </el-select>
        <el-input v-model="filters.partner_code" placeholder="往来编号" clearable style="width:130px" />
        <el-date-picker v-model="filters.start_date" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:130px" />
        <el-date-picker v-model="filters.end_date" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:130px" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <el-button type="success" @click="handleCreate"><el-icon><Plus /></el-icon>新增</el-button>
        <span class="total-hint">共 {{ total }} 条</span>
      </div>
    </div>

    <div v-if="!propType" class="doc-type-tabs">
      <el-radio-group v-model="filters.doc_type" size="small" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button v-for="g in tabGroups" :key="g.key" :value="g.key">{{ g.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <el-table :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 280px)" @row-dblclick="handleView">
      <el-table-column label="单据号" prop="doc_no" width="180" />
      <el-table-column label="日期" prop="doc_date" width="110" />
      <el-table-column v-if="!propType" label="类型" width="90">
        <template #default="{ row }">{{ typeName(row.doc_type) }}</template>
      </el-table-column>
      <el-table-column label="往来单位" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.partner_name || row.partner_code }}</template>
      </el-table-column>
      <el-table-column label="仓库" width="120">
        <template #default="{ row }">{{ row.warehouse_name || row.warehouse_code }}</template>
      </el-table-column>
      <el-table-column label="数量" prop="total_qty" width="80" align="right" />
      <el-table-column label="金额" prop="total_amount" width="110" align="right">
        <template #default="{ row }">{{ fmt(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'audited' ? 'success' : 'info'" size="small">
            {{ row.status === 'audited' ? '已审核' : '草稿' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="340" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleView(row)">查看</el-button>
          <el-button v-if="row.status === 'draft'" link type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button v-if="row.status === 'draft'" link type="success" size="small" @click="handleAudit(row)">审核</el-button>
          <el-button v-if="row.status === 'audited'" link type="warning" size="small" @click="handleUnaudit(row)">反审核</el-button>
          <el-button v-if="row.status === 'draft'" link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          <el-button v-if="row.status === 'audited' && !row.voucher_id" link type="warning" size="small" @click="handleGenVoucher(row)">生成凭证</el-button>
          <el-button v-if="row.status === 'audited' && row.doc_type === 'PI'" link type="warning" size="small" @click="handleGenAssets(row)">生成资产</el-button>
          <el-button v-if="pushTarget(row.doc_type)" link type="success" size="small" @click="handlePush(row)">下推{{ pushLabel(row.doc_type) }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev,pager,next,total" background
      style="margin-top:8px;justify-content:flex-end" @current-change="load" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { scmApi, type ScmDoc, type ScmDocType } from '@/api/scm'

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
  RP:'采购发票', RS:'销售发票', PAY:'付款单', RCV:'收款单',
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

watch(propType, v => { filters.doc_type = v; load() })

async function load() {
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
function handleView(row: ScmDoc) {
  router.push({ name: 'ScmDocView', params: { id: row.id } })
}
function handleEdit(row: ScmDoc) {
  router.push({ name: 'ScmDocEdit', params: { id: row.id } })
}

// 列表内联操作
async function handleAudit(row: ScmDoc) {
  await ElMessageBox.confirm('确认审核？', '提示', { type: 'info' })
  await scmApi.auditDoc(row.id!)
  ElMessage.success('已审核')
  load()
}
async function handleUnaudit(row: ScmDoc) {
  await ElMessageBox.confirm('确认反审核（将撤销库存移动）？', '提示', { type: 'warning' })
  await scmApi.unauditDoc(row.id!)
  ElMessage.success('已反审核')
  load()
}
async function handleDelete(row: ScmDoc) {
  await ElMessageBox.confirm(`确认删除单据「${row.doc_no}」？`, '提示', { type: 'warning' })
  await scmApi.deleteDoc(row.id!)
  ElMessage.success('已删除')
  load()
}
async function handleGenVoucher(row: ScmDoc) {
  await ElMessageBox.confirm('为该单据生成记账凭证？', '提示', { type: 'info' })
  const r = await scmApi.genVoucher(row.id!)
  if (r.code === 0) ElMessage.success(`已生成凭证 ${r.data.voucher_no}`)
  load()
}
async function handleGenAssets(row: ScmDoc) {
  await ElMessageBox.confirm('为采购入库中的资产品生成固定资产卡片？', '提示', { type: 'info' })
  const r = await scmApi.genAssets(row.id!)
  if (r.code === 0) ElMessage.success(`已生成 ${r.data.created} 个资产卡片`)
  load()
}

// ── 订单下推 ──────────────────────────────────────────────
const PUSH_MAP: Record<string, string> = {
  PO: 'PI',   // 采购订单→采购入库
  PQ: 'PO',   // 采购询价→采购订单
  SOa:'SO',   // 销售订单→销售出库
  SQ: 'SOa',  // 销售报价→销售订单
}
const PUSH_LABEL: Record<string, string> = {
  PO: '采购入库', PQ: '采购订单', SOa:'销售出库', SQ:'销售订单',
}
function pushTarget(docType: string): string | undefined { return PUSH_MAP[docType] }
function pushLabel(docType: string): string { return PUSH_LABEL[docType] || '' }
async function handlePush(row: ScmDoc) {
  const target = PUSH_MAP[row.doc_type]
  if (!target) return
  router.push({ name: 'ScmDocNew', query: { doc_type: target, source_doc_id: row.id } })
}
</script>

<style scoped>
.scm-doc-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
.doc-type-tabs { margin-bottom: 8px; }
</style>
