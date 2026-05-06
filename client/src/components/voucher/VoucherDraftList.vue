<template>
  <el-card class="draft-card">
    <template #header>
      <div class="draft-card-header">
        <span class="draft-card-title">未审核凭证</span>
        <div class="draft-card-header-actions">
          <el-button size="small" type="warning" plain @click="emit('renumber')" style="margin-right: 4px">重新排号</el-button>
          <el-button size="small" type="danger" plain @click="emit('batch-delete')" style="margin-right: 20px">批量删除</el-button>
          <div class="sort-controls">
            <span style="font-size: 13px; color: #606266; margin-right: 8px">排序：</span>
            <el-select
              :model-value="props.sortConfig.field"
              @update:model-value="handleFieldChange"
              size="small"
              style="width: 120px; margin-right: 8px"
            >
              <el-option label="凭证号" value="voucher_no" />
              <el-option label="凭证日期" value="voucher_date" />
              <el-option label="创建时间" value="created_at" />
              <el-option label="修改时间" value="updated_at" />
            </el-select>
            <el-button
              size="small"
              @click="toggleOrder"
              style="margin-right: 12px"
            >
              <el-icon>
                <SortUp v-if="props.sortConfig.order === 'asc'" />
                <SortDown v-else />
              </el-icon>
              {{ props.sortConfig.order === 'asc' ? '升序' : '降序' }}
            </el-button>
          </div>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索凭证号、摘要、科目..."
            clearable
            style="width: 300px; margin-right: 12px"
            prefix-icon="Search"
          />
          <el-button link type="primary" @click="emit('refresh')">刷新</el-button>
        </div>
      </div>
    </template>

    <el-table
      ref="tableRef"
      :data="filteredData"
      border
      v-loading="loading"
      empty-text="暂无未审核凭证"
      :row-class-name="getDraftRowClass"
      :span-method="voucherSpanMethod"
      @current-change="handleCurrentChange"
      @row-dblclick="handleRowDblclick"
    >
      <el-table-column label="凭证号" prop="voucher_no" width="100" align="center">
        <template #default="{ row }">
          <span v-html="highlightText(row.voucher_no)"></span>
        </template>
      </el-table-column>
      <el-table-column label="日期" prop="voucher_date" width="100" />
      <el-table-column label="摘要" prop="summary">
        <template #default="{ row }">
          <span v-html="highlightText(row.summary)"></span>
        </template>
      </el-table-column>
      <el-table-column prop="account_code" label="科目编码" width="100">
        <template #default="{ row }">
          <span v-html="highlightText(row.account_code)"></span>
        </template>
      </el-table-column>
      <el-table-column prop="account_name" label="科目名称" width="160">
        <template #default="{ row }">
          <span v-html="highlightText(row.account_name)"></span>
        </template>
      </el-table-column>
      <el-table-column label="借方金额" width="130" align="right">
        <template #default="{ row }">
          <span v-if="row.direction === 'debit'">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="贷方金额" width="130" align="right">
        <template #default="{ row }">
          <span v-if="row.direction === 'credit'">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in auxColumns"
        :key="col.code"
        :prop="col.prop"
        :label="col.name"
        width="100"
      />
      <el-table-column label="制单人" prop="maker_name" width="80" />
      <el-table-column label="审核人" prop="auditor_name" width="80" />
      <el-table-column label="记账人" prop="poster_name" width="80" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTableSearch } from '@/composables/useTableSearch'
import { SortUp, SortDown } from '@element-plus/icons-vue'
import { formatAmount } from '@/utils/format'

interface SortConfig {
  field: string
  order: string
}

interface Props {
  vouchers: any[]
  loading?: boolean
  sortConfig?: SortConfig
  auxCategories?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  sortConfig: () => ({ field: 'voucher_date', order: 'asc' }),
  auxCategories: () => [],
})

const emit = defineEmits<{
  refresh: []
  edit: [row: any]
  delete: [row: any]
  'sort-change': [config: SortConfig]
  'row-click': [row: any]
  'row-dblclick': [row: any]
  'renumber': []
  'batch-delete': []
}>()

// 当前行选中
const tableRef = ref<any>(null)
const selectedVoucherId = ref<string>('')

function handleCurrentChange(row: any) {
  if (row) {
    selectedVoucherId.value = row._voucherId
    emit('row-click', row)
  }
}

function handleRowDblclick(row: any) {
  if (row) emit('row-dblclick', row)
}

function getDraftRowClass({ row }: { row: any }) {
  const isSelected = row._voucherId === selectedVoucherId.value
  if (isSelected) return 'voucher-selected'
  return row._stripeGroup === 0 ? 'voucher-group-even' : 'voucher-group-odd'
}

function statusLabel(status: string) {
  if (status === 'audited') return '已审核'
  if (status === 'posted') return '已记账'
  return '未审核'
}

function statusTagType(status: string): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'audited') return 'success'
  if (status === 'posted') return 'primary'
  return 'info'
}

// 排序控制
function handleFieldChange(field: string) {
  emit('sort-change', { field, order: props.sortConfig.order })
}

function toggleOrder() {
  const newOrder = props.sortConfig.order === 'asc' ? 'desc' : 'asc'
  emit('sort-change', { field: props.sortConfig.field, order: newOrder })
}

function formatMoney(val: number) {
  return formatAmount(val || 0)
}

function getVoucherSeq(voucherNo: string) {
  const idx = voucherNo.indexOf('-')
  const seq = idx >= 0 ? voucherNo.slice(idx + 1) : voucherNo
  return String(parseInt(seq, 10))
}

const typeAbbr: Record<string, string> = {
  记账凭证: '记',
  收款凭证: '收',
  付款凭证: '付',
  转账凭证: '转',
}

function getTypeAbbr(name: string) {
  return typeAbbr[name] || name.charAt(0) || '凭'
}

// 解析 aux_data JSON，提取辅助项目名称
function parseAuxData(entry: any): Record<string, string> {
  const result: Record<string, string> = {}
  if (!entry.aux_data) return result
  try {
    const auxData = typeof entry.aux_data === 'string' ? JSON.parse(entry.aux_data) : entry.aux_data
    for (const [code, val] of Object.entries(auxData)) {
      if (val && typeof val === 'object' && (val as any).name) {
        result[`_aux_${code}`] = (val as any).name
      }
    }
  } catch { /* ignore */ }
  return result
}

const draftFlatList = computed(() => {
  const rows: any[] = []
  for (const [index, v] of props.vouchers.entries()) {
    const seq = getVoucherSeq(v.voucher_no)
    const abbr = getTypeAbbr(v.voucher_type_name || '记')
    const voucherLabel = `${abbr}-${seq}`
    const entries = v.entries?.length ? v.entries : [null]
    const entryCount = entries.length
    for (const [entryIdx, e] of entries.entries()) {
      const base: any = {
        ...v,
        ...(e || {}),
        ...(e ? parseAuxData(e) : {}),
        id: v.id,
        entry_id: e?.id,
        voucher_no: voucherLabel,
        summary: e ? (e.summary || v.remark || '') : (v.remark || ''),
        _voucherId: v.id,
        _stripeGroup: index % 2,
        _voucherRowIndex: entryIdx,
        _voucherEntryCount: entryCount,
      }
      rows.push(base)
    }
  }
  return rows
})

// 动态辅助列：从 aux_data 中提取出现过的辅助类别，排除已有固定列的
const auxColumns = computed(() => {
  const fixedCodes = new Set(['dept', 'project', 'supplier', 'person', 'func_class'])
  const colMap = new Map<string, string>()
  for (const row of draftFlatList.value) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_aux_') && row[key]) {
        const code = key.slice(5)
        if (fixedCodes.has(code) || colMap.has(code)) continue
        const cat = props.auxCategories.find(c => c.code === code)
        if (cat) {
          colMap.set(code, cat.name || code)
        }
      }
    }
  }
  return Array.from(colMap.entries()).map(([code, name]) => ({
    code,
    name,
    prop: `_aux_${code}`,
  }))
})

// 搜索功能
const { searchKeyword, filteredData, highlightText } = useTableSearch(() => draftFlatList.value, [
  'voucher_no',
  'summary',
  'account_code',
  'account_name',
  'dept_name',
  'project_name',
])

function voucherSpanMethod({ row, column }: { row: any; column: any }) {
  // 这些列同一个凭证的多行分录合并显示
  const mergeProps = ['voucher_no', 'voucher_date', 'maker_name', 'auditor_name', 'poster_name']
  if (mergeProps.includes(column.property) || column.label === '状态' || column.label === '') {
    if (row._voucherRowIndex === 0) {
      return { rowspan: row._voucherEntryCount, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
}
</script>

<style scoped>
.draft-card {
  margin-bottom: 16px;
}

.draft-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.draft-card-title {
  font-weight: 600;
  font-size: 15px;
}

.draft-card-header-actions {
  display: flex;
  align-items: center;
}

:deep(.voucher-group-even td) {
  background-color: #f0f5ff;
}

:deep(.voucher-group-odd td) {
  background-color: #ffffff;
}

:deep(.voucher-selected td) {
  background-color: #b3d8ff !important;
  font-weight: 500;
}
</style>
