<template>
  <el-dialog
    :model-value="modelValue"
    :title="`选择源单（${typeName(sourceDocType)}）`"
    width="820px"
    draggable
    @update:model-value="(v:boolean) => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <div class="src-picker-hint">
      仅列出<b>已审核</b>且<b>未完全下推</b>的{{ typeName(sourceDocType) }}；可多选合并（须同一往来单位）。明细按<b>剩余可下推数量</b>带入。
    </div>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="docs"
      size="small"
      border
      stripe
      max-height="380"
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

    <template #footer>
      <span class="src-picker-count">已选 {{ selected.length }} 张</span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="confirming" :disabled="!selected.length" @click="handleConfirm">确定带入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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

const tableRef = ref<any>(null)
const loading = ref(false)
const confirming = ref(false)
const docs = ref<any[]>([])
const selected = ref<any[]>([])

async function onOpen() {
  selected.value = []
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
}
function toggleRow(row: any) {
  tableRef.value?.toggleRowSelection(row)
}

async function handleConfirm() {
  if (!selected.value.length) return
  // 多选须同一往来单位（保证应收主体唯一）
  const partners = Array.from(new Set(selected.value.map(d => d.partner_code || '')))
  if (partners.length > 1) {
    return ElMessage.warning('所选源单的往来单位不一致，请选择同一往来单位的单据')
  }
  confirming.value = true
  try {
    const lines: any[] = []
    for (const d of selected.value) {
      const res = await scmApi.getDoc(d.id)
      if (res.code !== 0) continue
      const s = res.data as any
      for (const l of (s.lines || [])) {
        const remain = (Number(l.qty) || 0) - (Number(l.pushed_qty) || 0)
        if (remain <= 0) continue
        const price = Number(l.price) || 0
        lines.push({
          item_code: l.item_code,
          item_name: l.item_name || '',
          warehouse_code: l.warehouse_code || '',
          qty: remain,
          price,
          amount: Math.round(remain * price * 100) / 100,
          unit_cost: l.unit_cost || 0,
          tax_rate: 0,
          tax_amount: 0,
          remark: l.remark || '',
          source_line_id: l.id,
        })
      }
    }
    if (!lines.length) {
      confirming.value = false
      return ElMessage.warning('所选源单没有可下推的剩余明细')
    }
    emit('confirm', { lines, partner_code: partners[0] })
    emit('update:modelValue', false)
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.src-picker-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.src-picker-empty { padding: 20px; text-align: center; color: var(--el-text-color-placeholder); }
.src-picker-count { margin-right: auto; font-size: 13px; color: var(--el-text-color-secondary); }
:deep(.el-dialog__footer) { display: flex; align-items: center; gap: 8px; }
</style>
