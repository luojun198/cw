<template>
  <div class="page page-ledger">
    <div class="page-header">
      <h3>科目余额表</h3>
      <div class="filter-row">
        <el-date-picker
          v-model="filters.start_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          class="filter-ctl--md"
          @change="fetchData"
        />
        <el-date-picker
          v-model="filters.end_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          class="filter-ctl--md"
          @change="fetchData"
        />
        <el-input
          v-model="filters.account_code"
          placeholder="科目编码"
          clearable
          class="filter-ctl--sm"
          @clear="fetchData"
          @keyup.enter="fetchData"
        />
        <el-select
          v-model="filters.account_level"
          placeholder="科目级次"
          clearable
          class="filter-ctl--xs"
          @change="fetchData"
        >
          <el-option label="展开到1级" :value="1" />
          <el-option label="展开到2级" :value="2" />
          <el-option label="展开到3级" :value="3" />
          <el-option label="展开到4级" :value="4" />
        </el-select>
        <el-divider direction="vertical" />
        <el-checkbox-group v-model="filters.filter_types" size="small" @change="fetchData">
          <el-checkbox value="init_balance">有期初</el-checkbox>
          <el-checkbox value="has_amount">有发生额</el-checkbox>
          <el-checkbox value="has_balance">有余额</el-checkbox>
        </el-checkbox-group>
        <el-divider direction="vertical" />
        <el-checkbox v-model="filters.include_unposted" @change="fetchData">
          统计未记账凭证
        </el-checkbox>
        <el-divider direction="vertical" />
        <el-button type="primary" @click="fetchData">
          <el-icon><Search /></el-icon>
          查询
        </el-button>

        <el-divider direction="vertical" />

        <el-button plain @click="exportData">
          <el-icon><Download /></el-icon>
          导出 Excel
        </el-button>
        <el-button plain @click="printPage">
          <el-icon><Printer /></el-icon>
          打印
        </el-button>
      </div>
    </div>

    <AccountScopeAlert />

    <div class="print-title-row">
      <h2 class="print-title">科目余额表</h2>
      <p class="print-date-range">{{ printDateLabel }}</p>
    </div>

    <div v-if="!initialLoaded && loading" class="skeleton-table">
      <div v-for="i in 8" :key="i" class="skeleton skeleton-row" />
    </div>

    <div v-else v-loading="loading" ref="tableContainerRef" class="table-summary-scroll table-summary-scroll--wide table-summary-scroll--flow">
    <el-table
      ref="tableRef"
      :height="tableHeight"
      :data="list"
      :style="{ width: `${ledgerTableWidth}px` }"
      :fit="false"
      stripe
      border
      size="small"
      class="compact-data-table"
      highlight-current-row
      show-summary
      :summary-method="getSummaries"
      @header-dragend="handleHeaderDragEnd"
      @row-dblclick="handleRowDblClick"
    >
      <el-table-column column-key="account_code" label="科目编码" :width="colWidth('account_code', 100)">
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 20 + 'px' }">{{ row.account_code }}</span>
        </template>
      </el-table-column>
      <el-table-column
        column-key="account_name"
        prop="account_name"
        label="科目名称"
        :width="colWidth('account_name', 150)"
      >
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 20 + 'px' }">{{ row.account_name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="期初余额" align="center">
        <el-table-column column-key="方向" label="方向" :width="colWidth('方向', 60)" align="center">
          <template #default="{ row }">
            {{
              row.init_balance !== 0
                ? row.init_balance > 0
                  ? row.direction === 'debit'
                    ? '借'
                    : '贷'
                  : row.direction === 'debit'
                    ? '贷'
                    : '借'
                : ''
            }}
          </template>
        </el-table-column>
        <el-table-column column-key="余额" label="余额" :width="colWidth('余额', 100)" align="right">
          <template #default="{ row }">
            {{
              row.init_balance !== 0
                ? formatAmount(Math.abs(row.init_balance))
                : hideZero
                  ? ''
                  : formatAmount(0)
            }}
          </template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本期发生额" align="center">
        <el-table-column column-key="借方" label="借方" :width="colWidth('借方', 120)" align="right">
          <template #default="{ row }">{{
            row.current_debit && row.current_debit > 0
              ? formatAmount(row.current_debit)
              : hideZero
                ? ''
                : formatAmount(0)
          }}</template>
        </el-table-column>
        <el-table-column column-key="贷方" label="贷方" :width="colWidth('贷方', 120)" align="right">
          <template #default="{ row }">{{
            row.current_credit && row.current_credit > 0
              ? formatAmount(row.current_credit)
              : hideZero
                ? ''
                : formatAmount(0)
          }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本年累计发生额" align="center">
        <el-table-column
          column-key="year_debit"
          label="借方"
          prop="year_debit"
          :width="colWidth('year_debit', 120)"
          align="right"
        >
          <template #default="{ row }">{{
            row.year_debit && row.year_debit > 0
              ? formatAmount(row.year_debit)
              : hideZero
                ? ''
                : formatAmount(0)
          }}</template>
        </el-table-column>
        <el-table-column
          column-key="year_credit"
          label="贷方"
          prop="year_credit"
          :width="colWidth('year_credit', 120)"
          align="right"
        >
          <template #default="{ row }">{{
            row.year_credit && row.year_credit > 0
              ? formatAmount(row.year_credit)
              : hideZero
                ? ''
                : formatAmount(0)
          }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="期末余额" align="center">
        <el-table-column
          column-key="end_direction"
          label="方向"
          prop="end_direction"
          :width="colWidth('end_direction', 60)"
          align="center"
        >
          <template #default="{ row }">
            {{
              row.end_balance !== 0
                ? row.end_balance > 0
                  ? row.direction === 'debit'
                    ? '借'
                    : '贷'
                  : row.direction === 'debit'
                    ? '贷'
                    : '借'
                : ''
            }}
          </template>
        </el-table-column>
        <el-table-column
          column-key="end_balance"
          label="余额"
          prop="end_balance"
          :width="colWidth('end_balance', 100)"
          align="right"
        >
          <template #default="{ row }">
            {{
              row.end_balance !== 0
                ? formatAmount(Math.abs(row.end_balance))
                : hideZero
                  ? ''
                  : formatAmount(0)
            }}
          </template>
        </el-table-column>
      </el-table-column>
      <template #empty>
        <EmptyState type="data" description="暂无数据，请选择期间后查询" />
      </template>
    </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDrillDownNavigate } from '@/composables/useDrillDownNavigate'
import { Printer, Search, Download } from '@element-plus/icons-vue'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { useLedgerWideTable } from '@/composables/useLedgerWideTable'
import { useFillHeightTable } from '@/composables/useFillHeightTable'
import { formatAmount } from '@/utils/format'
import { exportStyledTable } from '@/utils/exportStyledExcel'
import {
  buildGeneralLedgerExportColumns,
  buildGeneralLedgerSummaryValues,
} from '@/utils/ledgerExportBuilders'
import { getSummaryAccountRows } from '@/utils/exportLedgerHelpers'
import AccountScopeAlert from '@/components/AccountScopeAlert.vue'

const { drillDown } = useDrillDownNavigate()
const list = ref<any[]>([])
const loading = ref(false)
const initialLoaded = ref(false)
const hideZero = ref(true)

const ledgerColumnDefs = computed(() => [
  { key: 'account_code', fallback: 100 },
  { key: 'account_name', fallback: 150 },
  { key: '方向', fallback: 60 },
  { key: '余额', fallback: 100 },
  { key: '借方', fallback: 120 },
  { key: '贷方', fallback: 120 },
  { key: 'year_debit', fallback: 120 },
  { key: 'year_credit', fallback: 120 },
  { key: 'end_direction', fallback: 60 },
  { key: 'end_balance', fallback: 100 },
])

const { containerRef: tableContainerRef, tableHeight, relayoutAfterData } = useFillHeightTable({ flow: true })

const { tableRef, colWidth, ledgerTableWidth, handleHeaderDragEnd, afterTableLayout } =
  useLedgerWideTable('ledger_general', ledgerColumnDefs, { afterLayout: relayoutAfterData })

const year = new Date().getFullYear()

let printTimer: ReturnType<typeof setTimeout> | null = null

const printDateLabel = computed(() => {
  const s = filters.value.start_date || `${year}-01-01`
  const e = filters.value.end_date || `${year}-12-31`
  return `日期：${s} 至 ${e}`
})

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

const filters = ref<any>({
  start_date: `${year}-01-01`,
  end_date: `${year}-12-31`,
  account_code: '',
  account_level: null,
  filter_types: ['init_balance', 'has_amount', 'has_balance'],
  include_unposted: true,
})

/** 将带符号余额拆分为借贷方展示金额（与表格行、后端 summary 一致） */
function splitBalanceToDebitCredit(balance: number, direction: string) {
  if (!balance) return { debit: 0, credit: 0 }
  const amount = Math.abs(balance)
  const onDebitSide =
    (balance > 0 && direction === 'debit') || (balance < 0 && direction === 'credit')
  return onDebitSide ? { debit: amount, credit: 0 } : { debit: 0, credit: amount }
}

function sumBalanceSides(rows: any[], field: 'init_balance' | 'end_balance') {
  return rows.reduce(
    (acc, row) => {
      const { debit, credit } = splitBalanceToDebitCredit(row[field] || 0, row.direction)
      acc.debit += debit
      acc.credit += credit
      return acc
    },
    { debit: 0, credit: 0 }
  )
}

function resolveSummaryColumnKey(column: TableColumnCtx<any>): string {
  if (column.columnKey != null && column.columnKey !== '') return String(column.columnKey)
  if (column.property) return String(column.property)
  return column.label ? String(column.label) : ''
}

function formatBalanceDirection(netBalance: number): string {
  if (Math.abs(netBalance) < 0.005) return '平'
  return netBalance > 0 ? '借' : '贷'
}

/** 合计行应参与的科目：优先一级科目（已含下级汇总），避免展开深层级时叶节点重复/方向不一致 */
function getSummaryRows(data: any[]) {
  if (!data.length) return []
  const level1Rows = data.filter(row => row.level === 1)
  if (level1Rows.length > 0) return level1Rows
  return data.filter(
    row =>
      !data.some(
        r => r.account_code !== row.account_code && r.account_code.startsWith(row.account_code)
      )
  )
}

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param
  const summaryRows = getSummaryRows(data)
  const initSides = sumBalanceSides(summaryRows, 'init_balance')
  const endSides = sumBalanceSides(summaryRows, 'end_balance')
  const initNet = initSides.debit - initSides.credit
  const endNet = endSides.debit - endSides.credit

  return columns.map(column => {
    const key = resolveSummaryColumnKey(column)
    switch (key) {
      case 'account_code':
        return '合计'
      case 'account_name':
        return ''
      case '方向':
        return formatBalanceDirection(initNet)
      case '余额':
        return formatAmount(Math.abs(initNet))
      case '借方':
        return formatAmount(summaryRows.reduce((sum, row) => sum + (row.current_debit || 0), 0))
      case '贷方':
        return formatAmount(summaryRows.reduce((sum, row) => sum + (row.current_credit || 0), 0))
      case 'year_debit':
        return formatAmount(summaryRows.reduce((sum, row) => sum + (row.year_debit || 0), 0))
      case 'year_credit':
        return formatAmount(summaryRows.reduce((sum, row) => sum + (row.year_credit || 0), 0))
      case 'end_direction':
        return formatBalanceDirection(endNet)
      case 'end_balance':
        return formatAmount(Math.abs(endNet))
      default:
        return ''
    }
  })
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = {}
    if (filters.value.start_date) params.start_date = filters.value.start_date
    if (filters.value.end_date) params.end_date = filters.value.end_date
    if (filters.value.account_code) params.account_code = filters.value.account_code
    if (filters.value.account_level) params.account_level = filters.value.account_level
    if (filters.value.filter_types && filters.value.filter_types.length > 0) {
      params.filter_types = filters.value.filter_types.join(',')
    }
    if (filters.value.include_unposted) params.include_unposted = 'true'

    const res = await request.get<any[]>('/ledger/general', { params })
    list.value = res.data
    initialLoaded.value = true
    await afterTableLayout()
  } finally {
    loading.value = false
  }
}

async function exportData() {
  const dateRange =
    filters.value.start_date && filters.value.end_date
      ? `${filters.value.start_date}_${filters.value.end_date}`
      : new Date().toISOString().split('T')[0]
  const summaryRows = getSummaryAccountRows(list.value, filters.value.account_level)

  await exportStyledTable({
    fileName: `科目余额表_${dateRange}.xlsx`,
    sheetName: '科目余额表',
    title: '科目余额表',
    subtitle: printDateLabel.value,
    columns: buildGeneralLedgerExportColumns(colWidth, hideZero.value),
    rows: list.value,
    summaryValues: buildGeneralLedgerSummaryValues(summaryRows, hideZero.value),
  })
}

function handleRowDblClick(row: any) {
  // 双击行跳转到明细账页面
  const query: any = {}
  if (row.account_id) query.account_id = row.account_id
  else if (row.code) query.account_code = row.code

  // 传递当前的日期范围（如果有的话）
  if (filters.value.start_date) query.start_date = filters.value.start_date
  if (filters.value.end_date) query.end_date = filters.value.end_date

  drillDown('/ledger/detail', query, '科目余额表', {
    start_date: filters.value.start_date || '',
    end_date: filters.value.end_date || '',
    account_code: filters.value.account_code || '',
    account_level: filters.value.account_level ? String(filters.value.account_level) : '',
  })
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
}

.print-title-row {
  display: none;
}
.skeleton-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}
.skeleton-row {
  height: 36px;
  border-radius: 4px;
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
  .page-header,
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
