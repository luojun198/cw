<template>
  <div class="page doc-form-page">
    <!-- 顶部工具栏 -->
    <div class="doc-form-header">
      <div class="doc-form-header__left">
        <el-button link size="small" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <span class="doc-form-header__sep">/</span>
        <span class="doc-form-header__title">{{ pageTitle }}</span>
        <el-tag v-if="form.doc_no" size="small" style="margin-left:8px">{{ form.doc_no }}</el-tag>
        <el-tag v-if="form.status" :type="form.status === 'audited' ? 'success' : 'info'" size="small" style="margin-left:4px">
          {{ form.status === 'audited' ? '已审核' : '草稿' }}
        </el-tag>
      </div>
      <div class="doc-form-header__right">
        <template v-if="!isView">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button type="primary" size="small" :loading="saving" @click="handleSave">保存</el-button>
        </template>
        <template v-else>
          <el-button v-if="form.status === 'draft'" size="small" type="primary" @click="goEdit">编辑</el-button>
        </template>
      </div>
    </div>

    <!-- 单据头 -->
    <div class="doc-form-body">
      <el-form :model="form" label-width="80px" size="small" :disabled="isView">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="日期" required>
              <el-date-picker v-model="form.doc_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="单据号">
              <el-input :model-value="form.doc_no" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item :label="isTransfer ? '调出仓' : '仓库'">
              <el-select v-model="form.warehouse_code" clearable filterable style="width:100%">
                <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="往来单位">
              <el-autocomplete
                v-model="partnerSearch"
                :fetch-suggestions="queryPartners"
                :disabled="isView"
                placeholder="编号/名称模糊搜索"
                value-key="label"
                clearable
                style="width:100%"
                @select="onPartnerSelect"
                @clear="() => { form.partner_code = ''; partnerSearch = '' }"
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="经手人">
              <el-input v-model="form.operator" placeholder="可留空" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 单据类型提示 -->
      <el-alert v-if="isTransfer && !isView" type="info" show-icon :closable="false" style="margin-bottom:10px">
        调拨单：<b>调出仓</b>在上方「调出仓」选择；<b>调入仓</b>在下表每行的「调入仓」列分别指定（可不同行不同仓）。
      </el-alert>
      <el-alert v-if="isCount && !isView" type="info" show-icon :closable="false" style="margin-bottom:10px">
        盘点单：「数量」列填写<b>实盘数量</b>（账面数由系统自动与实盘比较，盘盈自动入库、盘亏自动出库）。
      </el-alert>

      <!-- 明细行工具栏 -->
      <div class="doc-lines-toolbar">
        <template v-if="!isView">
          <el-button size="small" @click="addLine"><el-icon><Plus /></el-icon>添加行</el-button>
          <template v-if="isProduction">
            <el-select v-model="selectedBom" placeholder="选择BOM" size="small" style="width:200px" clearable>
              <el-option v-for="b in boms" :key="b.id" :label="`${b.code} ${b.item_code}`" :value="b.id" />
            </el-select>
            <el-button size="small" :disabled="!selectedBom" @click="handleBomExplode">
              <el-icon><Connection /></el-icon>从BOM展开
            </el-button>
          </template>
        </template>
        <span class="doc-lines-summary">
          合计数量：{{ fmt(totalQty) }}　合计金额：¥{{ fmt(totalAmount) }}
          <span v-if="isInvoice">　含税合计：¥{{ fmt(totalTaxAmount) }}</span>
        </span>
      </div>

      <!-- 明细表格 -->
      <el-table :data="lines" border size="small" :height="tableHeight" style="width:100%" @cell-click="handleCellClick" class="compact-data-table">
        <el-table-column label="#" width="44" align="center" fixed="left">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="物料" min-width="220" fixed="left" prop="item_code">
          <template #default="{ row, $index }">
            <template v-if="isView">
              <span>{{ row.item_name || row.item_code }}</span>
            </template>
            <template v-else>
              <ItemPicker v-if="isEditing($index, 'item_code')" v-model="row.item_code" :warehouse-code="row.warehouse_code || form.warehouse_code" @pick="(item:any) => { onItemPick(row, item); stopEdit() }" v-focus />
              <div v-else class="editable-cell">{{ row.item_name ? `${row.item_code} ${row.item_name}` : row.item_code }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="isTransfer ? '调入仓' : '仓库'" width="130" prop="warehouse_code">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.warehouse_code }}</template>
            <template v-else>
              <el-select v-if="isEditing($index, 'warehouse_code')" v-model="row.warehouse_code" :placeholder="isTransfer ? '必填调入仓' : '覆盖头部仓库'" filterable clearable size="small" style="width:100%" @change="stopEdit" @visible-change="v => !v && stopEdit()" v-focus>
                <el-option v-for="w in warehouses" :key="w.code" :label="w.code" :value="w.code" />
              </el-select>
              <div v-else class="editable-cell">{{ row.warehouse_code }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="isCount ? '实盘数量' : '数量'" width="110" align="right" prop="qty">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.qty }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'qty')" v-model="row.qty" :min="0" :precision="3" size="small" :controls="false" style="width:100%" @change="recalcRow(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.qty }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="单价" width="120" align="right" prop="price">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.price }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'price')" v-model="row.price" :min="0" :precision="4" size="small" :controls="false" style="width:100%" @change="recalcRow(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.price }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ fmt(row.amount || 0) }}</template>
        </el-table-column>
        <template v-if="isInvoice">
          <el-table-column label="税率%" width="90" align="right" prop="tax_rate">
            <template #default="{ row, $index }">
              <template v-if="isView">{{ row.tax_rate || 0 }}%</template>
              <template v-else>
                <el-input-number v-if="isEditing($index, 'tax_rate')" v-model="row.tax_rate" :min="0" :max="100" :precision="1" size="small" :controls="false" style="width:100%" @change="recalcTax(row)" @blur="stopEdit" v-focus />
                <div v-else class="editable-cell">{{ row.tax_rate }}</div>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="税额" width="110" align="right" prop="tax_amount">
            <template #default="{ row, $index }">
              <template v-if="isView">{{ fmt(row.tax_amount || 0) }}</template>
              <template v-else>
                <el-input-number v-if="isEditing($index, 'tax_amount')" v-model="row.tax_amount" :min="0" :precision="2" size="small" :controls="false" style="width:100%" @blur="stopEdit" v-focus />
                <div v-else class="editable-cell">{{ row.tax_amount }}</div>
              </template>
            </template>
          </el-table-column>
        </template>
        <el-table-column v-if="form.status === 'audited'" label="成本单价" width="110" align="right">
          <template #default="{ row }">{{ row.unit_cost ? fmt(row.unit_cost) : '—' }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="120" prop="remark">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.remark }}</template>
            <template v-else>
              <el-input v-if="isEditing($index, 'remark')" v-model="row.remark" size="small" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.remark }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="!isView" label="" width="44" align="center" fixed="right">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="removeLine($index)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Plus, Connection } from '@element-plus/icons-vue'
import { scmApi, type ScmDocType } from '@/api/scm'
import ItemPicker from '@/components/scm/ItemPicker.vue'

const route  = useRoute()
const router = useRouter()

// 路由模式判断
const isNew  = computed(() => route.name === 'ScmDocNew')
const isView = computed(() => route.name === 'ScmDocView')
const editId = computed(() => isNew.value ? null : (route.params.id as string))
const initDocType = computed(() => (route.query.doc_type as string) || '')
const initSourceDocId = computed(() => (route.query.source_doc_id as string) || '')

const types       = ref<ScmDocType[]>([])
const warehouses  = ref<any[]>([])
const allPartners = ref<any[]>([])
const partnerSearch = ref('')
const boms        = ref<any[]>([])
const selectedBom = ref('')
const saving      = ref(false)

const isProduction = computed(() => ['PL','PF','PB','PJ','AS','DS'].includes(form.value.doc_type))
const isInvoice    = computed(() => ['RP','RS'].includes(form.value.doc_type))
const isTransfer   = computed(() => form.value.doc_type === 'TR')
const isCount      = computed(() => form.value.doc_type === 'CK')

const DOC_TITLE: Record<string, string> = {
  PI:'采购入库', PR:'采购退货', SO:'销售出库', SR:'销售退货',
  OI:'其他入库', OO:'其他出库', TR:'调拨单', CK:'盘点单',
  PL:'生产领用', PF:'完工入库', PS:'不良品入库', PB:'补料单', PJ:'退料单',
  WO:'委外发货', WI:'委外入库', AS:'组装单', DS:'拆卸单',
  PO:'采购订单', PQ:'采购询价', SQ:'销售报价', SOa:'销售订单',
  RP:'采购发票', RS:'销售发票', PAY:'付款单', RCV:'收款单',
}

const pageTitle = computed(() => {
  const typeName = DOC_TITLE[form.value.doc_type] || form.value.doc_type || '单据'
  if (isNew.value) return `新增${typeName}`
  if (isView.value) return `查看${typeName}`
  return `编辑${typeName}`
})

const tableHeight = computed(() => 'calc(100vh - 290px)')

const form = ref<Record<string, any>>({
  doc_type: '', doc_no: '', doc_date: new Date().toISOString().slice(0, 10),
  warehouse_code: '', partner_code: '', operator: '', remark: '', status: 'draft', bom_id: '',
})
const lines = ref<Array<Record<string, any>>>([])

const fmt = (v: number) => (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const totalQty       = computed(() => lines.value.reduce((s, l) => s + (Number(l.qty) || 0), 0))
const totalAmount    = computed(() => lines.value.reduce((s, l) => s + (Number(l.amount) || 0), 0))
const totalTaxAmount = computed(() => lines.value.reduce((s, l) => s + (Number(l.amount) || 0) + (Number(l.tax_amount) || 0), 0))

const editingCell = ref<{rowIndex: number, field: string} | null>(null)
const vFocus = {
  mounted: (el: HTMLElement) => {
    const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null
    if (input) {
      input.focus()
      input.select()
    }
  }
}

function isEditing(rowIndex: number, field: string) {
  return editingCell.value?.rowIndex === rowIndex && editingCell.value?.field === field
}

function handleCellClick(row: any, column: any) {
  if (isView.value) return
  const rowIndex = lines.value.indexOf(row)
  const field = column.property
  if (['item_code', 'warehouse_code', 'qty', 'price', 'tax_rate', 'tax_amount', 'remark'].includes(field)) {
    editingCell.value = { rowIndex, field }
  }
}

function stopEdit() {
  editingCell.value = null
}

onMounted(async () => {
  const [ts, ws, ps] = await Promise.all([scmApi.getDocTypes(), scmApi.getWarehouses(), scmApi.getPartners({})])
  if (ts.code === 0) types.value = ts.data
  if (ws.code === 0) warehouses.value = ws.data
  if (ps.code === 0) allPartners.value = ps.data

  if (isNew.value) {
    form.value.doc_type = initDocType.value
    lines.value = [newLine()]
    if (form.value.doc_type) {
      try { const r = await scmApi.getDocNextNo(form.value.doc_type); if (r.code === 0) form.value.doc_no = r.data.next_no } catch { }
    }
    // 下推：从源单加载数据
    if (initSourceDocId.value) {
      await loadSourceDoc(initSourceDocId.value)
    }
  } else if (editId.value) {
    await loadDoc(editId.value)
  }
})

async function loadDoc(id: string) {
  const res = await scmApi.getDoc(id)
  if (res.code !== 0) return
  const d = res.data as any
  form.value = {
    doc_type: d.doc_type, doc_no: d.doc_no, doc_date: d.doc_date,
    warehouse_code: d.warehouse_code || '', partner_code: d.partner_code || '',
    operator: d.operator || '', remark: d.remark || '', status: d.status,
    bom_id: d.bom_id || '',
  }
  if (d.bom_id) selectedBom.value = d.bom_id
  if (d.partner_code) {
    const p = allPartners.value.find(x => x.code === d.partner_code)
    partnerSearch.value = p ? `${p.code} ${p.name}` : d.partner_code
  }
  lines.value = (d.lines || []).map((l: any) => ({
    id: l.id, item_code: l.item_code, item_name: l.item_name || '',
    warehouse_code: l.warehouse_code || '', qty: l.qty,
    price: l.price || 0, amount: l.amount || 0, unit_cost: l.unit_cost || 0,
    tax_rate: l.tax_rate || 0, tax_amount: l.tax_amount || 0, remark: l.remark || '',
  }))
}

// 从源单加载数据（订单下推）
async function loadSourceDoc(sourceId: string) {
  const res = await scmApi.getDoc(sourceId)
  if (res.code !== 0) return
  const s = res.data as any
  // 复制源单头部信息
  form.value.partner_code = s.partner_code || ''
  form.value.warehouse_code = s.warehouse_code || ''
  form.value.remark = s.remark || ''
  form.value.operator = s.operator || ''
  if (s.partner_code) {
    const p = allPartners.value.find(x => x.code === s.partner_code)
    partnerSearch.value = p ? `${p.code} ${p.name}` : s.partner_code
  }
  // 复制源单明细行（数量保留、单价清空待填）
  if (s.lines && s.lines.length) {
    lines.value = s.lines.map((l: any) => ({
      item_code: l.item_code, item_name: l.item_name || '',
      warehouse_code: l.warehouse_code || form.value.warehouse_code,
      qty: l.qty, price: 0, amount: 0, unit_cost: l.unit_cost || 0,
      tax_rate: 0, tax_amount: 0, remark: l.remark || '',
      source_line_id: l.id,
    }))
  }
}

watch(() => form.value.doc_type, () => {
  if (isProduction.value) scmApi.getBoms().then(r => { if (r.code === 0) boms.value = r.data })
})

function newLine(): Record<string, any> {
  return { item_code: '', item_name: '', warehouse_code: form.value.warehouse_code, qty: 0, price: 0, amount: 0, tax_rate: 0, tax_amount: 0, remark: '' }
}
function addLine() { lines.value.push(newLine()) }
function removeLine(i: number) { if (lines.value.length > 1) lines.value.splice(i, 1) }

function recalcRow(row: any) {
  row.amount = Math.round((Number(row.qty) || 0) * (Number(row.price) || 0) * 100) / 100
  recalcTax(row)
}
function recalcTax(row: any) {
  if (isInvoice.value && (row.tax_rate || 0) > 0)
    row.tax_amount = Math.round(row.amount * (row.tax_rate / 100) * 100) / 100
}
function onItemPick(row: any, item: any) {
  row.item_code = item.code
  row.item_name = item.name || ''
  row.price = row.price || item.ref_cost || item.purchase_price || 0
  row.warehouse_code = row.warehouse_code || form.value.warehouse_code
  recalcRow(row)
}

// 往来单位 autocomplete
function queryPartners(query: string, cb: (s: any[]) => void) {
  const q = query.trim().toLowerCase()
  cb(allPartners.value
    .filter(p => !q || p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
    .slice(0, 20)
    .map(p => ({ value: p.id, label: `${p.code} ${p.name}`, code: p.code, name: p.name }))
  )
}
function onPartnerSelect(item: any) {
  form.value.partner_code = item.code
  partnerSearch.value = `${item.code} ${item.name}`
}

async function handleBomExplode() {
  if (!selectedBom.value) return
  const res = await scmApi.explodeBom(selectedBom.value, totalQty.value || 1)
  if (res.code === 0)
    lines.value = (res.data.lines || []).map((l: any) => ({
      item_code: l.item_code, item_name: l.item_name || '', warehouse_code: form.value.warehouse_code,
      qty: l.total_qty, price: 0, amount: 0, tax_rate: 0, tax_amount: 0, remark: '',
    }))
}

async function handleSave() {
  if (!form.value.doc_type || !form.value.doc_date) return ElMessage.warning('类型和日期不能为空')
  if (isTransfer.value && !form.value.warehouse_code) return ElMessage.warning('调拨单须指定调出仓')
  const cleanLines = lines.value
    .filter(l => l.item_code && Number(l.qty) > 0)
    .map(l => ({
      id: l.id || undefined, item_code: l.item_code,
      warehouse_code: l.warehouse_code || form.value.warehouse_code,
      qty: Number(l.qty), price: Number(l.price) || 0, amount: Number(l.amount) || 0,
      unit_cost: l.unit_cost ?? undefined,
      tax_rate: Number(l.tax_rate) || 0, tax_amount: Number(l.tax_amount) || 0,
      remark: l.remark || '',
      source_line_id: l.source_line_id ?? undefined,
    }))
  if (!cleanLines.length) return ElMessage.warning('请添加至少一行物料')
  if (isTransfer.value && cleanLines.some(l => !l.warehouse_code)) return ElMessage.warning('调拨单每行须指定调入仓')
  saving.value = true
  try {
    const payload: Record<string, any> = { ...form.value, lines: cleanLines, total_qty: totalQty.value, total_amount: totalAmount.value }
    if (initSourceDocId.value) payload.source_doc_id = initSourceDocId.value
    // 组装/拆卸单：携带 BOM ID
    if (isProduction.value && selectedBom.value) payload.bom_id = selectedBom.value
    if (editId.value) {
      await scmApi.updateDoc(editId.value, payload)
    } else {
      await scmApi.createDoc(payload)
    }
    ElMessage.success('保存成功')
    goBack()
  } finally {
    saving.value = false
  }
}

function goBack() {
  const dt = form.value.doc_type || initDocType.value
  router.push(dt ? `/scm/docs?doc_type=${dt}` : '/scm/docs')
}
function goEdit() {
  router.push(`/scm/docs/${editId.value}/edit`)
}
</script>

<style scoped>
.doc-form-page { display: flex; flex-direction: column; height: 100%; padding: 0; }
.doc-form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color); flex-shrink: 0;
}
.doc-form-header__left { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.doc-form-header__sep { color: var(--el-text-color-placeholder); }
.doc-form-header__title { font-weight: 600; color: var(--el-text-color-primary); }
.doc-form-header__right { display: flex; gap: 8px; }
.doc-form-body { flex: 1; overflow: auto; padding: 14px 16px; }
.doc-lines-toolbar {
  display: flex; align-items: center; gap: 8px; margin: 10px 0 8px;
}
.doc-lines-summary { margin-left: auto; font-size: 13px; color: var(--el-text-color-secondary); }

.compact-data-table :deep(.el-table__cell) {
  padding: 0;
}
.compact-data-table :deep(.cell) {
  padding: 0 4px;
  line-height: 28px;
}
.editable-cell {
  min-height: 28px;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editable-cell:hover {
  background-color: var(--el-fill-color-light);
}
</style>
