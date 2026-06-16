<template>
  <div class="page page-ledger">
    
    <AccountScopeAlert />

    <div class="print-title-row">
      <h2 class="print-title">序时账</h2>
      <p class="print-date-range">{{ printDateLabel }}</p>
    </div>

    <div ref="tableContainerRef" class="table-summary-scroll table-summary-scroll--wide">
    <el-table
      ref="tableRef"
      :height="tableHeight"
      :data="list"
      :style="{ width: `${ledgerTableWidth}px` }"
      :fit="false"
      border
      size="small"
      class="compact-data-table"
      highlight-current-row
      :row-class-name="getRowClassName"
      @header-dragend="handleHeaderDragEnd"
      @row-dblclick="handleLedgerRowDblClick"
    >
      <el-table-column prop="voucher_date" label="日期" :width="colWidth('voucher_date', 100)" />
      <el-table-column
        prop="voucher_type_name"
        label="凭证类型"
        :width="colWidth('voucher_type_name', 100)"
      />
      <el-table-column prop="voucher_no" label="凭证号" :width="colWidth('voucher_no', 130)" />
      <el-table-column
        prop="account_code"
        label="科目编码"
        :width="colWidth('account_code', 100)"
      />
      <el-table-column
        prop="account_name"
        label="科目名称"
        :width="colWidth('account_name', 140)"
      />
      <el-table-column prop="summary" label="摘要" :width="colWidth('summary', 180)" />
      <el-table-column column-key="借方金额" label="借方金额" :width="colWidth('借方金额', 140)" align="right">
        <template #default="{ row }">
          <template v-if="row.is_monthly_subtotal">
            {{ formatAmount(row.monthly_debit) }}
          </template>
          <template v-else>
            {{ row.direction === 'debit' ? formatAmount(row.amount) : '' }}
          </template>
        </template>
      </el-table-column>
      <el-table-column column-key="贷方金额" label="贷方金额" :width="colWidth('贷方金额', 140)" align="right">
        <template #default="{ row }">
          <template v-if="row.is_monthly_subtotal">
            {{ formatAmount(row.monthly_credit) }}
          </template>
          <template v-else>
            {{ row.direction === 'credit' ? formatAmount(row.amount) : '' }}
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="maker_name" label="制单人" :width="colWidth('maker_name', 80)" />
    </el-table>
    </div>

    <div class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[50, 100, 200, 500]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </div>

    <VoucherEntryDialogHost ref="entryDialogHostRef" @saved="fetchData" />

    <HiprintDialog
      v-model="hiprintVisible"
      template-type="ledger"
      template-key="ledger:chronological"
      title="序时账"
      :get-print-html="buildPrintHtml"
      default-paper="A4"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { Printer, Search, Download } from '@element-plus/icons-vue'
import request from '@/api/request'
import VoucherEntryDialogHost from '@/components/voucher/VoucherEntryDialogHost.vue'
import { useLedgerWideTable } from '@/composables/useLedgerWideTable'
import { useFillHeightTable } from '@/composables/useFillHeightTable'
import {
  useLedgerVoucherNavigate,
  resolveLedgerVoucherId,
} from '@/composables/useLedgerVoucherNavigate'
import { useVoucherModalRestore } from '@/composables/useVoucherModalRestore'
import { formatAmount } from '@/utils/format'
import HiprintDialog from '@/components/print/HiprintDialog.vue'
import { buildTablePrintHtml } from '@/utils/printTemplateHiprint'
import { exportStyledTable, type ExportColumnDef } from '@/utils/exportStyledExcel'
import AccountScopeAlert from '@/components/AccountScopeAlert.vue'

const list = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(100)
const showAdvancedFilter = ref(false)
const filters = ref<any>({
  year: new Date().getFullYear(),
  period: new Date().getMonth() + 1,
  start_date: '',
  end_date: '',
  include_unposted: true,
  summary_keyword: '',
  min_amount: '',
  max_amount: '',
  maker_name: '',
  auditor_name: '',
})
const years = Array.from({ length: new Date().getFullYear() - 2000 + 1 }, (_, i) => new Date().getFullYear() - i)

const entryDialogHostRef = ref<InstanceType<typeof VoucherEntryDialogHost> | null>(null)
const { tryRestoreVoucherModal } = useVoucherModalRestore(entryDialogHostRef)

const { handleLedgerRowDblClick } = useLedgerVoucherNavigate({
  returnLabel: '序时账',
  getReturnQuery: () => ({
    year: filters.value.year ? String(filters.value.year) : '',
    period: filters.value.period ? String(filters.value.period) : '',
    start_date: filters.value.start_date || '',
    end_date: filters.value.end_date || '',
  }),
  openVoucherModal: row => {
    // 忽略小计行
    if (row.is_monthly_subtotal) {
      return
    }
    
    const voucherId = resolveLedgerVoucherId(row)
    if (!voucherId) return
    entryDialogHostRef.value?.open({
      _voucherId: voucherId,
      id: voucherId,
      status: row.voucher_status,
    })
  },
})

const printDateLabel = computed(() => {
  if (filters.value.start_date || filters.value.end_date) {
    const start = filters.value.start_date || '不限'
    const end = filters.value.end_date || '不限'
    return `日期：${start} 至 ${end}`
  }
  if (!filters.value.year && !filters.value.period) {
    return '日期：当前期间'
  }
  return `日期：${filters.value.year}年 ${filters.value.period}月`
})

// hiprint 套打
const hiprintVisible = ref(false)
function buildPrintHtml(): string {
  return buildTablePrintHtml<any>({
    title: '序时账',
    subtitle: printDateLabel.value,
    rows: list.value,
    rowStyle: (r: any) => (r.is_monthly_subtotal ? 'font-weight:600;background:#f7f7f7;' : ''),
    columns: [
      { label: '日期', align: 'center', render: r => (r.is_monthly_subtotal ? '' : r.voucher_date || '') },
      { label: '凭证类型', align: 'center', render: r => r.voucher_type_name || '' },
      { label: '凭证号', align: 'center', render: r => r.voucher_no || '' },
      { label: '科目编码', align: 'left', render: r => r.account_code || '' },
      { label: '科目名称', align: 'left', render: r => r.account_name || '' },
      { label: '摘要', align: 'left', render: r => r.summary || (r.is_monthly_subtotal ? '本月合计' : '') },
      { label: '借方金额', align: 'right', render: r => (r.is_monthly_subtotal ? formatAmount(r.monthly_debit) : r.direction === 'debit' ? formatAmount(r.amount) : '') },
      { label: '贷方金额', align: 'right', render: r => (r.is_monthly_subtotal ? formatAmount(r.monthly_credit) : r.direction === 'credit' ? formatAmount(r.amount) : '') },
      { label: '制单人', align: 'center', render: r => r.maker_name || '' },
    ],
  })
}

let printTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (printTimer) clearTimeout(printTimer)
})

function printPage() {
  // 展开表格解除高度限制，确保打印全部内容
  const tableWrapper = document.querySelector('.el-table__body-wrapper') as HTMLElement
  const table = document.querySelector('.el-table') as HTMLElement
  if (tableWrapper) {
    tableWrapper.style.setProperty('height', 'auto', 'important')
    tableWrapper.style.setProperty('overflow', 'visible', 'important')
    tableWrapper.style.setProperty('max-height', 'none', 'important')
  }
  if (table) {
    table.style.setProperty('height', 'auto', 'important')
    table.style.setProperty('max-height', 'none', 'important')
  }

  // 强制重排后打印
  void document.body.offsetHeight
  window.print()

  // 打印后恢复
  const restore = () => {
    if (tableWrapper) { tableWrapper.style.cssText = '' }
    if (table) { table.style.cssText = '' }
  }
  if ('onafterprint' in window) {
    window.addEventListener('afterprint', restore, { once: true })
    printTimer = setTimeout(restore, 2000)
  } else {
    printTimer = setTimeout(restore, 2000)
  }
}

const ledgerColumnDefs = computed(() => [
  { key: 'voucher_date', fallback: 100 },
  { key: 'voucher_type_name', fallback: 100 },
  { key: 'voucher_no', fallback: 130 },
  { key: 'account_code', fallback: 100 },
  { key: 'account_name', fallback: 140 },
  { key: 'summary', fallback: 180 },
  { key: '借方金额', fallback: 140 },
  { key: '贷方金额', fallback: 140 },
  { key: 'maker_name', fallback: 80 },
])

const { tableRef, colWidth, ledgerTableWidth, handleHeaderDragEnd, afterTableLayout } =
  useLedgerWideTable('ledger_chronological', ledgerColumnDefs)
const { containerRef: tableContainerRef, tableHeight } = useFillHeightTable()

function isDateFilterActive() {
  return Boolean(filters.value.start_date || filters.value.end_date)
}

function onYearPeriodChange() {
  if (filters.value.year || filters.value.period) {
    filters.value.start_date = ''
    filters.value.end_date = ''
  }
}

function onDateRangeChange() {
  if (isDateFilterActive()) {
    filters.value.year = null
    filters.value.period = null
  }
}

function insertMonthlySubtotals(entries: any[]): any[] {
  if (entries.length === 0) return entries
  
  const result: any[] = []
  let currentMonth = ''
  let monthlyDebit = 0
  let monthlyCredit = 0
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const entryMonth = entry.voucher_date.substring(0, 7)
    
    if (currentMonth && entryMonth !== currentMonth) {
      result.push({
        id: `__monthly_subtotal_${currentMonth}__`,
        voucher_date: currentMonth + '-31',
        voucher_type_name: '',
        voucher_no: '',
        account_code: '',
        account_name: '',
        summary: '本月合计',
        amount: 0,
        maker_name: '',
        is_monthly_subtotal: true,
        monthly_debit: monthlyDebit,
        monthly_credit: monthlyCredit,
      })
      
      monthlyDebit = 0
      monthlyCredit = 0
    }
    
    if (entry.direction === 'debit') {
      monthlyDebit += entry.amount
    } else if (entry.direction === 'credit') {
      monthlyCredit += entry.amount
    }
    
    currentMonth = entryMonth
    result.push(entry)
  }
  
  if (currentMonth && entries.length > 0) {
    result.push({
      id: `__monthly_subtotal_${currentMonth}__`,
      voucher_date: currentMonth + '-31',
      voucher_type_name: '',
      voucher_no: '',
      account_code: '',
      account_name: '',
      summary: '本月合计',
      amount: 0,
      maker_name: '',
      is_monthly_subtotal: true,
      monthly_debit: monthlyDebit,
      monthly_credit: monthlyCredit,
    })
  }
  
  return result
}

function getRowClassName({ row }: { row: any }) {
  if (row.is_monthly_subtotal) return 'monthly-subtotal-row'
  return ''
}

function buildQueryParams(page: number, size: number) {
  const params: any = {
    page,
    pageSize: size,
  }
  if (!isDateFilterActive()) {
    if (filters.value.year) params.year = filters.value.year
    if (filters.value.period) params.period = filters.value.period
  }
  if (filters.value.start_date) params.start_date = filters.value.start_date
  if (filters.value.end_date) params.end_date = filters.value.end_date
  if (filters.value.include_unposted) params.include_unposted = 'true'
  if (filters.value.summary_keyword) params.summary_keyword = filters.value.summary_keyword
  if (filters.value.min_amount) params.min_amount = filters.value.min_amount
  if (filters.value.max_amount) params.max_amount = filters.value.max_amount
  if (filters.value.maker_name) params.maker_name = filters.value.maker_name
  if (filters.value.auditor_name) params.auditor_name = filters.value.auditor_name
  return params
}

async function fetchData() {
  const params = buildQueryParams(currentPage.value, pageSize.value)
  const res = await request.get<any>('/ledger/chronological', { params })
  const entries = res.data || []
  const entriesWithSubtotals = insertMonthlySubtotals(entries)
  list.value = entriesWithSubtotals
  total.value = res.total || 0
  await afterTableLayout()
}

async function exportData() {
  const params = buildQueryParams(1, 10000)
  const res = await request.get<any>('/ledger/chronological', { params })
  const entries = res.data || []
  const entriesWithSubtotals = insertMonthlySubtotals(entries)
  const allData = entriesWithSubtotals
  const dateRange = isDateFilterActive()
    ? `${filters.value.start_date || '不限'}_${filters.value.end_date || '不限'}`
    : `${filters.value.year || new Date().getFullYear()}_${filters.value.period || new Date().getMonth() + 1}`

  const columns: ExportColumnDef[] = [
    { label: '日期', width: colWidth('voucher_date', 100), value: row => row.voucher_date },
    {
      label: '凭证类型',
      width: colWidth('voucher_type_name', 100),
      value: row => row.voucher_type_name || '',
    },
    { label: '凭证号', width: colWidth('voucher_no', 130), value: row => row.voucher_no },
    { label: '科目编码', width: colWidth('account_code', 100), value: row => row.account_code },
    { label: '科目名称', width: colWidth('account_name', 140), value: row => row.account_name },
    { label: '摘要', width: colWidth('summary', 180), value: row => row.summary },
    {
      label: '借方金额',
      width: colWidth('借方金额', 140),
      align: 'right',
      type: 'amount',
      value: row => {
        if (row.is_monthly_subtotal) return row.monthly_debit
        return row.direction === 'debit' ? row.amount : ''
      },
    },
    {
      label: '贷方金额',
      width: colWidth('贷方金额', 140),
      align: 'right',
      type: 'amount',
      value: row => {
        if (row.is_monthly_subtotal) return row.monthly_credit
        return row.direction === 'credit' ? row.amount : ''
      },
    },
    { label: '制单人', width: colWidth('maker_name', 80), value: row => row.maker_name || '' },
  ]

  await exportStyledTable({
    fileName: `序时账_${dateRange}.xlsx`,
    sheetName: '序时账',
    title: '序时账',
    subtitle: printDateLabel.value,
    columns,
    rows: allData,
  })
}

onMounted(async () => {
  await fetchData()
})

onActivated(() => {
  void tryRestoreVoucherModal()
})
</script>

<style scoped>
:deep(.monthly-subtotal-row) {
  background-color: #e0f2fe !important;
  font-weight: 600;
}

.page {
  padding: 16px;
}
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
  margin: 0;
}
.filter-row--advanced {
  margin-top: 8px;
}
.pagination {
  margin-top: 4px;
  display: flex;
  justify-content: flex-end;
}

.print-title-row {
  display: none;
}
</style>
<style>
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  body {
    padding: 15mm 10mm !important;
  }

  /* 隐藏筛选栏、按钮、分页等非打印元素 */
  .filter-row,
  .pagination,
  .el-button,
  .el-divider,
  .balance-tag {
    display: none !important;
  }

  /* 显示打印标题 */
  .print-title-row {
    display: block !important;
    text-align: center;
    margin-bottom: 16px;
  }
  .print-title {
    font-size: 16pt;
    font-weight: bold;
    margin: 0 0 8px;
  }
  .print-date-range {
    font-size: 11pt;
    color: #333;
    margin: 0 0 12px;
  }

  /* 表格占满页面 */
  .el-table {
    height: auto !important;
    max-height: none !important;
  }
  .el-table__body-wrapper {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* 页面主体 */
  .page {
    padding: 0 !important;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
