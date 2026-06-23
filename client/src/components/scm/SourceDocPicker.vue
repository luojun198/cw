<template>
  <el-dialog
    :model-value="modelValue"
    :title="`选择源单（${typeName(sourceDocType)}）`"
    width="900px"
    draggable
    @update:model-value="(v:boolean) => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <div class="src-picker-hint">
      仅列出<b>已审核</b>且<b>未完全下推</b>的{{ typeName(sourceDocType) }}；可多选合并（须同一往来单位）。
      下方明细可<b>逐行勾选</b>并<b>调整带入数量</b>。
    </div>

    <!-- 上栏：源单列表（整张多选） -->
    <div class="src-picker-section-title">源单</div>
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="docs"
      size="small"
      border
      stripe
      max-height="240"
      @selection-change="onSelectionChange"
      @row-click="toggleRow"
    >
      <el-table-column type="selection" width="42" />
      <el-table-column label="单据号" prop="doc_no" width="160" />
      <el-table-column label="日期" prop="doc_date" width="105" />
      <el-table-column label="往来单位" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.partner_name || row.partner_code }}</template>
      </el-table-column>
      <el-table-column label="数量" prop="total_qty" width="90" align="right" />
      <el-table-column label="金额" width="120" align="right">
        <template #default="{ row }">{{ fmt(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column label="下推进度" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.push_progress === 'part' ? 'warning' : 'info'" size="small">
            {{ row.push_progress === 'part' ? '部分下推' : '未下推' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!loading && !docs.length" class="src-picker-empty">无可选源单</div>

    <!-- 下栏：已选源单的明细行（逐行勾选 + 可调带入数量） -->
    <div class="src-picker-section-title">
      明细行
      <span class="src-picker-section-sub">勾选要带入的明细，可按需修改带入数量（不超过剩余可推）</span>
    </div>
    <el-table
      v-loading="loadingDetail"
      :data="detailRows"
      size="small"
      border
      stripe
      max-height="240"
      empty-text="请先在上方勾选源单"
    >
      <el-table-column label="" width="42" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.checked" />
        </template>
      </el-table-column>
      <el-table-column label="来源单据" prop="doc_no" width="150" />
      <el-table-column label="编号" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.line.item_code }}</template>
      </el-table-column>
      <el-table-column label="名称" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.line.item_name || '' }}</template>
      </el-table-column>
      <el-table-column label="规格" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.line.spec || '' }}</template>
      </el-table-column>
      <el-table-column label="仓位" width="90">
        <template #default="{ row }">{{ row.line.warehouse_code || '-' }}</template>
      </el-table-column>
      <el-table-column label="原数量" width="80" align="right">
        <template #default="{ row }">{{ row.line.qty }}</template>
      </el-table-column>
      <el-table-column label="已下推" width="80" align="right">
        <template #default="{ row }">{{ row.line.pushed_qty || 0 }}</template>
      </el-table-column>
      <el-table-column label="剩余可推" width="90" align="right">
        <template #default="{ row }">{{ row.remain }}</template>
      </el-table-column>
      <el-table-column label="带入数量" width="130" align="right">
        <template #default="{ row }">
          <el-input-number
            v-model="row.bringQty"
            :min="0"
            :max="row.remain"
            :precision="3"
            :controls="false"
            size="small"
            :disabled="!row.checked"
            style="width:100%"
          />
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <span class="src-picker-count">
        已选源单 {{ selected.length }} 张 · 已勾明细 {{ checkedCount }} 行 · 带入数量合计 {{ bringTotal }}
      </span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="confirming"
        :disabled="!checkedCount"
        @click="handleConfirm"
      >确定带入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { scmApi } from '@/api/scm'

const props = defineProps<{
  modelValue: boolean
  sourceDocType: string
  partnerCode?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** 带入的明细行 + 来源往来单位 */
  (e: 'confirm', payload: { lines: any[]; partner_code: string }): void
}>()

const DOC_TITLE: Record<string, string> = {
  PQ: '采购询价', PO: '采购订单', SQ: '销售报价', SOa: '销售订单',
}
const typeName = (c: string) => DOC_TITLE[c] || c
const fmt = (v: number) => (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 一条明细选择行：绑定到某张源单的某条明细 */
interface DetailRow {
  doc_id: string       // 来源源单 id
  doc_no: string       // 来源单据号（展示用）
  partner_code: string // 来源源单往来单位（校验用）
  line: any            // 原始明细行（含 id/item_code/qty/pushed_qty/price...）
  remain: number       // 剩余可下推量 = qty - pushed_qty
  checked: boolean     // 是否勾选带入，默认 true
  bringQty: number     // 带入数量，默认 = remain
}

const tableRef = ref<any>(null)
const loading = ref(false)
const loadingDetail = ref(false)
const confirming = ref(false)
const docs = ref<any[]>([])
const selected = ref<any[]>([])
// 已加载明细的源单 id 集合，避免重复请求；增删整张单据时不影响已做的勾选/数量调整
const loadedDocIds = ref<Set<string>>(new Set())
const detailRows = ref<DetailRow[]>([])

/** 已勾选且带入数量 > 0 的明细行数 */
const checkedCount = computed(() =>
  detailRows.value.filter(r => r.checked && (Number(r.bringQty) || 0) > 0).length
)
/** 带入数量合计 */
const bringTotal = computed(() =>
  detailRows.value
    .filter(r => r.checked)
    .reduce((s, r) => s + (Number(r.bringQty) || 0), 0)
)

async function onOpen() {
  selected.value = []
  detailRows.value = []
  loadedDocIds.value = new Set()
  loading.value = true
  try {
    const res = await scmApi.getDocs({
      doc_type: props.sourceDocType,
      status: 'audited',
      partner_code: props.partnerCode || undefined,
      page_size: 200,
    })
    if (res.code === 0) {
      // 仅保留未完全下推
      docs.value = (res.data.list as any[]).filter(d => d.push_progress !== 'full')
    }
  } finally {
    loading.value = false
  }
}

function onSelectionChange(rows: any[]) {
  selected.value = rows
  void syncDetailRows(rows)
}

function toggleRow(row: any) {
  tableRef.value?.toggleRowSelection(row)
}

/** 源单勾选变化时，增量加载明细：移除已取消勾选的单据明细，为新勾选的单据补充明细。 */
async function syncDetailRows(rows: any[]) {
  const keepIds = new Set(rows.map(r => r.id))
  // 1) 移除已取消勾选源单的明细行
  detailRows.value = detailRows.value.filter(d => keepIds.has(d.doc_id))
  // 2) 找出尚未加载明细的源单
  const toLoad = rows.filter(r => !loadedDocIds.value.has(r.id))
  if (!toLoad.length) return
  loadingDetail.value = true
  try {
    for (const d of toLoad) {
      const res = await scmApi.getDoc(d.id)
      loadedDocIds.value.add(d.id)
      if (res.code !== 0) continue
      const s = res.data as any
      for (const l of (s.lines || [])) {
        const remain = (Number(l.qty) || 0) - (Number(l.pushed_qty) || 0)
        if (remain <= 0) continue // 跳过已下推完的行
        detailRows.value.push({
          doc_id: d.id,
          doc_no: d.doc_no,
          partner_code: d.partner_code || '',
          line: l,
          remain,
          checked: true,        // 默认带入
          bringQty: remain,     // 默认全量
        })
      }
    }
  } finally {
    loadingDetail.value = false
  }
}

async function handleConfirm() {
  // 取已勾选且带入数量 > 0 的明细行
  const picked = detailRows.value.filter(r => r.checked && (Number(r.bringQty) || 0) > 0)
  if (!picked.length) {
    return ElMessage.warning('请勾选并填写要带入的明细行')
  }
  // 多选须同一往来单位（保证应收主体唯一）
  const partners = Array.from(new Set(picked.map(r => r.partner_code || '')))
  if (partners.length > 1) {
    return ElMessage.warning('所选明细的往来单位不一致，请选择同一往来单位的单据')
  }
  confirming.value = true
  try {
    const lines: any[] = picked.map(r => {
      const qty = Number(r.bringQty) || 0
      const price = Number(r.line.price) || 0
      const l = r.line
      return {
        item_code: l.item_code,
        item_name: l.item_name || '',
        warehouse_code: l.warehouse_code || '',
        qty,
        price,
        amount: Math.round(qty * price * 100) / 100,
        unit_cost: l.unit_cost || 0,
        tax_rate: 0,
        tax_amount: 0,
        remark: l.remark || '',
        source_line_id: l.id, // 行级溯源键
      }
    })
    emit('confirm', { lines, partner_code: partners[0] })
    emit('update:modelValue', false)
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.src-picker-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.src-picker-section-title {
  font-size: 13px; font-weight: 600; color: var(--el-text-color-primary);
  margin: 10px 0 6px; display: flex; align-items: baseline; gap: 8px;
}
.src-picker-section-sub { font-weight: 400; color: var(--el-text-color-secondary); }
.src-picker-empty { padding: 20px; text-align: center; color: var(--el-text-color-placeholder); }
.src-picker-count { margin-right: auto; font-size: 13px; color: var(--el-text-color-secondary); }
:deep(.el-dialog__footer) { display: flex; align-items: center; gap: 8px; }
</style>
