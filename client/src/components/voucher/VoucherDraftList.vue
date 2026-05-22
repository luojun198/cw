<template>
  <el-card class="draft-card">
    <template #header>
      <div class="draft-card-header">
        <span class="draft-card-title">未审核凭证</span>
        <div class="voucher-draft-toolbar">
          <div class="voucher-toolbar-group voucher-toolbar-group--tools">
            <span class="voucher-toolbar-group-label">工具</span>
            <el-button class="voucher-toolbar-btn" size="small" type="warning" plain @click="emit('renumber')">重新排号</el-button>
            <el-button class="voucher-toolbar-btn" size="small" type="danger" plain @click="emit('batch-delete')">批量删除</el-button>
          </div>
          <div class="voucher-toolbar-group voucher-toolbar-group--sort">
            <span class="voucher-toolbar-group-label">排序</span>
            <el-select
              :model-value="props.sortConfig.field"
              @update:model-value="handleFieldChange"
              size="small"
              style="width: 108px"
            >
              <el-option label="凭证号" value="voucher_no" />
              <el-option label="凭证日期" value="voucher_date" />
              <el-option label="创建时间" value="created_at" />
              <el-option label="修改时间" value="updated_at" />
            </el-select>
            <el-button class="voucher-toolbar-btn" size="small" @click="toggleOrder">
              <el-icon>
                <SortUp v-if="props.sortConfig.order === 'asc'" />
                <SortDown v-else />
              </el-icon>
              {{ props.sortConfig.order === 'asc' ? '升序' : '降序' }}
            </el-button>
          </div>
          <el-input
            v-model="inputKeyword"
            class="voucher-draft-search"
            placeholder="搜索凭证号、摘要、科目..."
            clearable
            size="small"
            prefix-icon="Search"
          />
          <el-button class="voucher-toolbar-btn" size="small" type="primary" link @click="emit('refresh')">刷新</el-button>
        </div>
      </div>
    </template>

    <el-table
      ref="tableRef"
      :data="filteredData"
      border
      size="small"
      class="compact-data-table"
      v-loading="loading"
      empty-text="暂无未审核凭证"
      :row-class-name="getDraftRowClass"
      :cell-class-name="getCellClassName"
      :span-method="voucherSpanMethod"
      height="calc(100vh - 260px)"
      @header-dragend="onDragEnd"
      @row-click="handleRowClick"
      @row-dblclick="handleRowDblclick"
    >
      <el-table-column
        column-key="voucher_date"
        label="日期"
        prop="voucher_date"
        :width="colWidth('voucher_date', 100)"
      />
      <el-table-column
        column-key="voucher_no"
        label="凭证号"
        prop="voucher_no"
        :width="colWidth('voucher_no', 100)"
        align="center"
      >
        <template #default="{ row }">
          <span v-html="highlightText(row.voucher_no)"></span>
        </template>
      </el-table-column>
      <el-table-column label="摘要" prop="summary">
        <template #default="{ row }">
          <span v-html="highlightText(row.summary)"></span>
        </template>
      </el-table-column>
      <el-table-column
        column-key="account_code"
        prop="account_code"
        label="科目编码"
        :width="colWidth('account_code', 100)"
      >
        <template #default="{ row }">
          <span v-html="highlightText(row.account_code)"></span>
        </template>
      </el-table-column>
      <el-table-column
        column-key="account_name"
        prop="account_name"
        label="科目名称"
        :width="colWidth('account_name', 160)"
      >
        <template #default="{ row }">
          <span v-html="highlightText(row.account_name)"></span>
        </template>
      </el-table-column>
      <el-table-column
        column-key="借方金额"
        label="借方金额"
        :width="colWidth('借方金额', 130)"
        align="right"
      >
        <template #default="{ row }">
          <span v-if="row.direction === 'debit'">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        column-key="贷方金额"
        label="贷方金额"
        :width="colWidth('贷方金额', 130)"
        align="right"
      >
        <template #default="{ row }">
          <span v-if="row.direction === 'credit'">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in auxColumns"
        :key="col.code"
        :column-key="col.prop"
        :prop="col.prop"
        :label="col.name"
        :width="colWidth(col.prop, 100)"
      />
      <el-table-column
        column-key="operator_info"
        label="制单/审核"
        prop="operator_info"
        :width="colWidth('operator_info', 140)"
      >
        <template #default="{ row }">
          <div class="operator-info">
            <span>制单 {{ row.maker_name || '-' }}</span>
            <span>审核 {{ row.auditor_name || '-' }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column column-key="状态" label="状态" :width="colWidth('状态', 90)" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div v-if="props.pagination" class="draft-pagination" style="display: flex; justify-content: flex-end">
      <el-pagination
        :current-page="props.pagination.page"
        :page-size="props.pagination.pageSize"
        :page-sizes="[20, 50, 100, 200]"
        :total="props.pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentPageChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'
import { useTableSearch } from '@/composables/useTableSearch'
import { useDebounce } from '@/composables/useDebounceThrottle'
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
  pagination?: {
    page: number
    pageSize: number
    total: number
  }
  /** 当前选中的凭证 ID（与凭证管理页选中逻辑一致） */
  selectedVoucherId?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  sortConfig: () => ({ field: 'voucher_date', order: 'asc' }),
  auxCategories: () => [],
  selectedVoucherId: '',
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
  'page-change': [page: number, pageSize: number]
}>()

const { tableRef, onDragEnd, colWidth } = useListColumnWidth('voucher_draft_list')

function handleRowClick(row: any) {
  emit('row-click', row)
}

function handleRowDblclick(row: any) {
  if (row) emit('row-dblclick', row)
}

function getDraftRowClass({ row }: { row: any }) {
  const stripeClass = row._stripeGroup === 0 ? 'voucher-group-even' : 'voucher-group-odd'
  if (props.selectedVoucherId && row._voucherId === props.selectedVoucherId) {
    return `${stripeClass} voucher-selected`
  }
  return stripeClass
}

function getCellClassName({ row }: { row: any }) {
  return props.selectedVoucherId && row._voucherId === props.selectedVoucherId
    ? 'voucher-cell-selected'
    : ''
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

// 搜索功能：inputKeyword 直接绑定输入框，debouncedKeyword 延迟 300ms 后更新实际过滤条件
const inputKeyword = ref('')
const debouncedKeyword = useDebounce(inputKeyword, 300)
const { searchKeyword, filteredData, highlightText } = useTableSearch(() => draftFlatList.value, [
  'voucher_no',
  'summary',
  'account_code',
  'account_name',
  'dept_name',
  'project_name',
])
watch(debouncedKeyword, (val) => { searchKeyword.value = val })

function voucherSpanMethod({ row, column }: { row: any; column: any }) {
  // 这些列同一个凭证的多行分录合并显示
  const mergeProps = ['voucher_no', 'voucher_date', 'operator_info']
  if (mergeProps.includes(column.property) || column.label === '状态' || column.label === '') {
    if (row._voucherRowIndex === 0) {
      return { rowspan: row._voucherEntryCount, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
}

function handleSizeChange(size: number) {
  emit('page-change', 1, size)
}

function handleCurrentPageChange(page: number) {
  emit('page-change', page, props.pagination?.pageSize || 50)
}
</script>

<style scoped>
.draft-card {
  margin-bottom: 0;
}

.draft-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.draft-card-title {
  font-weight: 600;
  font-size: 15px;
}

.draft-card-header-actions {
  display: flex;
  align-items: center;
}

.operator-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.35;
  font-size: 12px;
  color: #606266;
}

/* 斑马纹 */
:deep(.el-table__body tr.voucher-group-even td.el-table__cell) {
  background-color: #f0f5ff;
}
:deep(.el-table__body tr.voucher-group-odd td.el-table__cell) {
  background-color: #fff;
}
/* 选中行 */
:deep(.el-table__body tr.voucher-selected td.el-table__cell),
:deep(.el-table__body td.voucher-cell-selected) {
  background-color: #b3d8ff !important;
  font-weight: 500;
}
/* 选中行悬停保持选中色 */
:deep(.el-table__body tr.voucher-selected:hover td.el-table__cell),
:deep(.el-table__body tr:hover td.voucher-cell-selected) {
  background-color: #b3d8ff !important;
}
</style>
