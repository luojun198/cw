<template>
  <div class="page voucher-list-page">
    <div class="voucher-page-top">
      <h3 class="voucher-page-top-title">凭证查询</h3>
      <VoucherFilterBar
        layout="grouped"
        :filters="filters"
        :aux-categories="auxCategories"
        :voucher-types="voucherTypes"
        :accounts="accounts"
        :aux-items-map="auxItemsMap"
        enable-status
        enable-year-period
        enable-voucher-type
        enable-account
        enable-auxiliary
        enable-sort
        @search="fetchData"
        @sort-change="onSortChange"
        @load-accounts="loadAccounts"
        @load-aux-items="loadAuxItems"
      >
        <template #actions>
          <el-popover placement="bottom-start" :width="200" trigger="click">
            <template #reference>
              <el-button class="voucher-toolbar-btn" plain>
                <el-icon><Setting /></el-icon>
                列设置
              </el-button>
            </template>
            <div style="display: flex; flex-direction: column; gap: 8px">
              <div
                v-for="col in visibleCols"
                :key="col.prop"
                style="display: flex; align-items: center; gap: 8px"
              >
                <el-checkbox v-model="col.visible" @change="saveVisibleCols" />
                <span>{{ col.label }}</span>
              </div>
            </div>
          </el-popover>
          <el-button class="voucher-toolbar-btn" plain :loading="exporting" @click="exportData">
            <el-icon><Download /></el-icon>
            导出 Excel
          </el-button>
          <el-button class="voucher-toolbar-btn" plain @click="handleBatchPrint">
            <el-icon><Printer /></el-icon>
            批量打印
          </el-button>
          <el-button
            class="voucher-toolbar-btn"
            plain
            :disabled="!selectedVoucherId"
            @click="handleTurnTemplate"
          >
            转模版
          </el-button>
        </template>
      </VoucherFilterBar>
    </div>

    <el-table
      ref="tableRef"
      :data="flatList"
      border
      size="small"
      class="compact-data-table"
      height="100%"
      :loading="loading"
      :row-class-name="getRowClass"
      :cell-class-name="getCellClassName"
      :span-method="voucherSpanMethod"
      @header-dragend="onDragEnd"
      @row-click="handleRowClick"
    >
      <el-table-column
        v-if="getColVisible('voucher_no')"
        label="凭证号"
        prop="voucher_no"
        :width="colWidth('voucher_no', 80)"
        align="center"
      />
      <el-table-column
        v-if="getColVisible('voucher_date')"
        label="日期"
        prop="voucher_date"
        :width="colWidth('voucher_date', 100)"
      />
      <el-table-column
        v-if="getColVisible('summary')"
        label="摘要"
        prop="summary"
        :width="colWidth('summary', 150)"
      />
      <el-table-column
        v-if="getColVisible('account_code')"
        prop="account_code"
        label="科目编码"
        :width="colWidth('account_code', 100)"
      />
      <el-table-column
        v-if="getColVisible('account_name')"
        prop="account_name"
        label="科目名称"
        :width="colWidth('account_name', 160)"
      />
      <el-table-column
        v-if="getColVisible('debit_amt')"
        label="借方金额"
        prop="debit_amt"
        :width="colWidth('debit_amt', 130)"
        align="right"
        class-name="amount-cell"
      >
        <template #default="{ row }">
          <AmountDisplay v-if="row.direction === 'debit'" :value="row.amount" :show-color="false" />
        </template>
      </el-table-column>
      <el-table-column
        v-if="getColVisible('credit_amt')"
        label="贷方金额"
        prop="credit_amt"
        :width="colWidth('credit_amt', 130)"
        align="right"
        class-name="amount-cell"
      >
        <template #default="{ row }">
          <AmountDisplay
            v-if="row.direction === 'credit'"
            :value="row.amount"
            :show-color="false"
          />
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in auxColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.name"
        :width="colWidth(col.prop, 100)"
      />
      <el-table-column
        v-if="getColVisible('operator_info')"
        label="经办信息"
        prop="operator_info"
        :width="colWidth('operator_info', 150)"
      >
        <template #default="{ row }">
          <div class="operator-info">
            <span>制单 {{ row.maker_name || '-' }}</span>
            <span>审核 {{ row.auditor_name || '-' }}</span>
            <span>记账 {{ row.poster_name || '-' }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-if="getColVisible('status')"
        label="状态"
        prop="status"
        :width="colWidth('status', 80)"
      >
        <template #default="{ row }">
          <StatusTag :status="row.status" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="printVoucher(row)">打印</el-button>
          <el-button
            v-if="row.status !== 'posted'"
            link
            type="danger"
            size="small"
            @click="handleDelete(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <span class="pagination-text">共 {{ pagination.total }} 条</span>
      <el-select v-model="pagination.pageSize" style="width: 95px" @change="onPageSizeChange">
        <el-option label="10条" :value="10" />
        <el-option label="20条" :value="20" />
        <el-option label="50条" :value="50" />
        <el-option label="100条" :value="100" />
      </el-select>
      <el-pagination
        v-model:current-page="pagination.page"
        :total="pagination.total"
        :page-size="pagination.pageSize"
        layout="prev, pager, next, jumper"
        :pager-count="5"
        @current-change="onPageChange"
      />
    </div>

    <!-- 日期范围对话框 -->
    <el-dialog v-model="showDateDialog" title="选择日期范围" width="300px">
      <el-form label-width="80px">
        <el-form-item label="开始日期">
          <el-date-picker
            v-model="tempDateRange[0]"
            type="date"
            placeholder="选择开始日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker
            v-model="tempDateRange[1]"
            type="date"
            placeholder="选择结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDateDialog = false">取消</el-button>
        <el-button @click="clearDateRange">清空</el-button>
        <el-button type="primary" @click="confirmDateRange">确定</el-button>
      </template>
    </el-dialog>

    <PrintDialog
      v-model="printDialogVisible"
      :voucher-ids="printVoucherIds"
      :mode="printMode"
      :auto-print="directPrint"
    />

    <BatchPrintDialog
      v-model="batchPrintVisible"
      :default-date-range="batchPrintDateRange"
      :default-voucher-type-ids="batchPrintVoucherTypeIds"
    />

    <!-- 转模版对话框 -->
    <el-dialog v-model="templateDialogVisible" title="保存为模版" width="500px">
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模版编号" required>
          <el-input v-model="templateForm.template_no" placeholder="如：MB001" />
        </el-form-item>
        <el-form-item label="模版说明" required>
          <el-input v-model="templateForm.template_name" placeholder="如：差旅费报销" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="templateSaving" @click="handleTemplateConfirm"
          >确定</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import request from '@/api/request'
import { Setting, Printer, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import StatusTag from '@/components/StatusTag.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import PrintDialog from '@/components/print/PrintDialog.vue'
import BatchPrintDialog from '@/components/print/BatchPrintDialog.vue'
import VoucherFilterBar from '@/components/voucher/VoucherFilterBar.vue'
import { useDeleteConfirm } from '@/composables/useConfirm'
import { showSuccess, showOperationError } from '@/composables/useMessage'
import { useVoucherQuery } from '@/composables/useVoucherQuery'
import { useOperationHistory } from '@/composables/useOperationHistory'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { exportVouchersToExcel, fetchAllVouchers } from '@/utils/voucherExport'

const route = useRoute()

// 使用 useVoucherQuery composable
const {
  filters,
  pagination,
  list,
  loading,
  auxCategories,
  voucherTypes,
  accounts,
  auxItemsMap,
  flatList,
  fetchData,
  buildQueryParams,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  loadAuxCategories,
  loadVoucherTypes,
  loadAccounts,
  loadAuxItems,
} = useVoucherQuery({
  enableStatus: true,
  enableYearPeriod: true,
  enableVoucherType: true,
  enableAccount: true,
  enableAuxiliary: true,
  enableSearchMemory: true,
  searchMemoryKey: 'voucher-query-filters',
})

// 操作历史
const { addRecord } = useOperationHistory()

const tableRef = ref()
const exporting = ref(false)
const VIS_COL_KEY = 'voucher-query-cols-visible'
const { onDragEnd, load, colWidth, bindTable } = useColumnWidthMemory('voucher_query')
bindTable(tableRef)
onActivated(() => load())

// 列可见性配置
const visibleCols = ref([
  { prop: 'voucher_no', label: '凭证号', visible: true },
  { prop: 'voucher_date', label: '日期', visible: true },
  { prop: 'summary', label: '摘要', visible: true },
  { prop: 'account_code', label: '科目编码', visible: true },
  { prop: 'account_name', label: '科目名称', visible: true },
  { prop: 'debit_amt', label: '借方金额', visible: true },
  { prop: 'credit_amt', label: '贷方金额', visible: true },
  { prop: 'operator_info', label: '经办信息', visible: true },
  { prop: 'status', label: '状态', visible: true },
])

// 恢复列可见性
function restoreVisibleCols() {
  const saved = JSON.parse(localStorage.getItem(VIS_COL_KEY) || 'null')
  if (saved && Array.isArray(saved)) {
    for (const s of saved) {
      const col = visibleCols.value.find(c => c.prop === s.prop)
      if (col) col.visible = s.visible
    }
    const operatorCol = visibleCols.value.find(c => c.prop === 'operator_info')
    if (operatorCol && !saved.some((s: any) => s.prop === 'operator_info')) {
      operatorCol.visible = ['maker_name', 'auditor_name', 'poster_name'].some(
        prop => saved.find((s: any) => s.prop === prop)?.visible !== false
      )
    }
  }
}

function saveVisibleCols() {
  localStorage.setItem(
    VIS_COL_KEY,
    JSON.stringify(visibleCols.value.map(c => ({ prop: c.prop, visible: c.visible })))
  )
}

function getColVisible(prop: string) {
  return visibleCols.value.find(c => c.prop === prop)?.visible ?? true
}

// 动态辅助列：从 aux_data 中提取出现过的辅助类别和自定义字段
const auxColumns = computed(() => {
  const colMap = new Map<string, { name: string; order: number }>()

  for (const row of flatList.value) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_aux_') && row[key]) {
        if (!colMap.has(key)) {
          const parts = key.slice(5).split('_') // 去掉 _aux_ 前缀后分割
          const code = parts[0]
          const cat = auxCategories.value.find(c => c.code === code)

          if (parts.length === 1) {
            // 辅助项目列：_aux_{code}
            colMap.set(key, {
              name: cat?.name || code,
              order: (cat?.id || 0) * 1000,
            })
          } else {
            // 自定义字段列：_aux_{code}_{fieldKey}
            const fieldKey = parts.slice(1).join('_')
            const field = cat?.fields?.find((f: any) => f.field_key === fieldKey)
            colMap.set(key, {
              name: field?.field_name || fieldKey,
              order: (cat?.id || 0) * 1000 + (field?.id || 0),
            })
          }
        }
      }
    }
  }

  // 按 order 排序，确保同一类别的列聚合在一起
  return Array.from(colMap.entries())
    .map(([prop, { name, order }]) => ({ prop, name, order }))
    .sort((a, b) => a.order - b.order)
})

function getRowClass({ row }: { row: any }) {
  const stripeClass = row._stripeGroup === 0 ? 'voucher-group-even' : 'voucher-group-odd'
  if (selectedVoucherId.value && row._voucherId === selectedVoucherId.value) {
    return `${stripeClass} voucher-selected`
  }
  return stripeClass
}

function getCellClassName({ row }: { row: any }) {
  return selectedVoucherId.value && row._voucherId === selectedVoucherId.value
    ? 'voucher-cell-selected'
    : ''
}

function voucherSpanMethod({ row, column }: { row: any; column: any }) {
  if (['voucher_no', 'voucher_date', 'operator_info'].includes(column.property)) {
    if (row._voucherRowIndex === 0) {
      return { rowspan: row._voucherEntryCount, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
}

function applyRouteFilters() {
  const year = Number(route.query.year)
  const period = Number(route.query.period)
  const keyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''

  if (Number.isFinite(year) && year > 0) filters.value.year = year
  if (Number.isFinite(period) && period > 0) filters.value.period = period
  filters.value.keyword = keyword
}

function printVoucher(row: any) {
  const voucherId = row._voucherId || row.id
  if (!voucherId) return
  printVoucherIds.value = [voucherId]
  printMode.value = 'single'
  printDialogVisible.value = true
}

const printDialogVisible = ref(false)
const printVoucherIds = ref<number[]>([])
const printMode = ref<'single' | 'batch'>('batch')
const directPrint = ref(false)
const batchPrintVisible = ref(false)
const batchPrintDateRange = ref<string[]>([])
const batchPrintVoucherTypeIds = ref<string[]>([])

// 转模版相关
const selectedVoucherId = ref('')
const templateDialogVisible = ref(false)
const templateForm = ref({
  template_no: '',
  template_name: '',
})
const templateSaving = ref(false)

function handleRowClick(row: any) {
  if (selectedVoucherId.value === row._voucherId) {
    selectedVoucherId.value = ''
  } else {
    selectedVoucherId.value = row._voucherId
  }
}

function handleTurnTemplate() {
  if (!selectedVoucherId.value) return
  templateForm.value = {
    template_no: '',
    template_name: '',
  }
  templateDialogVisible.value = true
}

async function handleTemplateConfirm() {
  if (!templateForm.value.template_no || !templateForm.value.template_name) {
    ElMessage.warning('请填写模版编号和模版说明')
    return
  }
  templateSaving.value = true
  try {
    await request.post('/voucher-templates', {
      template_no: templateForm.value.template_no,
      template_name: templateForm.value.template_name,
      voucher_id: selectedVoucherId.value,
    })
    showSuccess('模版保存成功')
    templateDialogVisible.value = false
  } catch (error: any) {
    showOperationError(error, '保存失败')
  } finally {
    templateSaving.value = false
  }
}

// 日期范围对话框相关
const showDateDialog = ref(false)
const tempDateRange = ref<string[]>([])

function clearDateRange() {
  tempDateRange.value = []
  filters.value.dateRange = []
  showDateDialog.value = false
  fetchData()
}

function confirmDateRange() {
  filters.value.dateRange = [...tempDateRange.value]
  showDateDialog.value = false
  fetchData()
}

function handleBatchPrint() {
  // 从当前页面显示的凭证中提取日期范围和凭证类型
  const vouchers = list.value
  if (vouchers.length > 0) {
    // 提取日期范围：取所有凭证的最小/最大日期
    const dates = vouchers
      .map((v: any) => v.voucher_date || v.date)
      .filter(Boolean)
      .sort()
    if (dates.length >= 2) {
      batchPrintDateRange.value = [dates[0], dates[dates.length - 1]]
    } else if (dates.length === 1) {
      batchPrintDateRange.value = [dates[0], dates[0]]
    } else {
      batchPrintDateRange.value = []
    }
    // 提取凭证类型ID：取页面上所有出现的凭证类型
    const typeIds = new Set<string>()
    vouchers.forEach((v: any) => {
      if (v.voucher_type_id) typeIds.add(v.voucher_type_id)
    })
    batchPrintVoucherTypeIds.value = Array.from(typeIds)
  } else {
    batchPrintDateRange.value = []
    batchPrintVoucherTypeIds.value = []
  }
  batchPrintVisible.value = true
}

async function exportData() {
  exporting.value = true
  try {
    const vouchers = await fetchAllVouchers(buildQueryParams())
    await exportVouchersToExcel(vouchers, {
      sheetName: '凭证查询',
      filePrefix: '凭证查询',
    })
    ElMessage.success(`已导出 ${vouchers.length} 张凭证`)
  } catch (error) {
    showOperationError('导出', error)
  } finally {
    exporting.value = false
  }
}

async function handleDelete(row: any) {
  const voucher = list.value.find((v: any) => v.id === row._voucherId)
  if (!voucher) return

  const confirmed = await useDeleteConfirm(`凭证 ${voucher.voucher_no}`)
  if (!confirmed) return

  try {
    await request.delete(`/voucher/vouchers/${row._voucherId}`)
    showSuccess('删除成功')
    addRecord('delete', '凭证查询', `删除凭证：${voucher.voucher_no}`)
    fetchData()
  } catch (error) {
    showOperationError('删除', error)
  }
}

onMounted(async () => {
  applyRouteFilters()
  restoreVisibleCols()
  const [, , paramsRes] = await Promise.all([
    loadAuxCategories(),
    loadVoucherTypes(),
    request.get<any[]>('/system/params').catch(() => ({ data: [] })),
  ])
  const params = ((paramsRes as any).data || []) as any[]
  const dp = params.find((p: any) => p.param_key === 'direct_print')
  directPrint.value = dp ? dp.param_value === 'true' : false
  fetchData()
})
</script>

<style src="./voucher.styles.css"></style>

<style>
/* 凭证查询表格斑马纹与选中 */
.voucher-list-page .el-table__body tr.voucher-group-even td.el-table__cell {
  background-color: #f0f5ff;
}
.voucher-list-page .el-table__body tr.voucher-group-odd td.el-table__cell {
  background-color: #fff;
}
.voucher-list-page .el-table__body tr.voucher-selected td.el-table__cell,
.voucher-list-page .el-table__body td.voucher-cell-selected {
  background-color: #b3d8ff !important;
  font-weight: 500;
}
.voucher-list-page .el-table__body tr.voucher-selected:hover td.el-table__cell,
.voucher-list-page .el-table__body tr:hover td.voucher-cell-selected {
  background-color: #b3d8ff !important;
}

/* 缩小日期选择器弹出面板 */
.el-date-range-picker {
  width: 450px !important;
}
.el-date-range-picker .el-picker-panel__body {
  min-width: 400px !important;
}
.el-date-range-picker .el-date-table {
  font-size: 12px !important;
}
.el-date-range-picker .el-date-table td {
  width: 28px !important;
  height: 28px !important;
  padding: 2px !important;
}
.el-date-range-picker .el-date-table td span {
  width: 24px !important;
  height: 24px !important;
  line-height: 24px !important;
}
</style>
