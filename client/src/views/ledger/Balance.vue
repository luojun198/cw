<template>
  <div class="page page-ledger">
    <div class="page-header">
      <h3>总分类账</h3>
      <div class="filter-row">
        <el-select v-model="filters.year" style="width: 110px" @change="fetchData">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-input
          v-model="filters.account_code"
          placeholder="科目编码"
          clearable
          style="width: 130px"
          @clear="fetchData"
          @keyup.enter="fetchData"
        />
        <el-select
          v-model="filters.account_level"
          placeholder="科目级次"
          clearable
          style="width: 120px"
          @change="fetchData"
        >
          <el-option label="展开到1级" :value="1" />
          <el-option label="展开到2级" :value="2" />
          <el-option label="展开到3级" :value="3" />
          <el-option label="展开到4级" :value="4" />
        </el-select>
        <el-divider direction="vertical" />
        <el-checkbox v-model="hideNoActivity">隐藏未发生</el-checkbox>
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
        <span class="balance-tag" :class="isBalanced ? 'ok' : 'err'">
          {{ isBalanced ? '借贷平衡' : '借贷不平衡' }}
        </span>
      </div>
    </div>

    <div class="print-title-row">
      <h2 class="print-title">总分类账</h2>
      <p class="print-date-range">{{ printDateLabel }}</p>
    </div>

    <div v-if="!initialLoaded && loading" class="skeleton-table">
      <div v-for="i in 8" :key="i" class="skeleton skeleton-row" />
    </div>

    <div v-else v-loading="loading" class="table-summary-scroll table-summary-scroll--wide">
    <el-table
      :key="displayMonths.join('-') || '0'"
      ref="tableRef"
      :data="filteredList"
      :style="{ width: `${ledgerTableWidth}px` }"
      :fit="false"
      stripe
      border
      size="small"
      class="compact-data-table"
      highlight-current-row
      show-summary
      :summary-method="getSummaries"
      :header-cell-style="headerCellStyle"
      @header-dragend="handleHeaderDragEnd"
    >
      <!-- 科目编码（宽表横向滚动，不使用 fixed 以免与滚动层冲突） -->
      <el-table-column
        column-key="account_code"
        prop="account_code"
        label="科目编码"
        :width="colWidth('account_code', 120)"
      >
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 16 + 'px' }">
            {{ row.account_code }}
          </span>
        </template>
      </el-table-column>
      <el-table-column
        column-key="account_name"
        prop="account_name"
        label="科目名称"
        :width="colWidth('account_name', 160)"
      >
        <template #default="{ row }">
          <span
            :style="{
              paddingLeft: (row.level - 1) * 16 + 'px',
              fontWeight: row.level === 1 ? 'bold' : 'normal',
            }"
          >
            {{ row.account_name }}
          </span>
        </template>
      </el-table-column>

      <!-- 期初余额 -->
      <el-table-column label="期初余额" align="center">
        <el-table-column
          label="借方"
          :width="colWidth('init_debit', 100)"
          align="right"
          prop="init_debit"
        >
          <template #default="{ row }">
            {{ row.direction === 'debit' ? fmtMonthAmount(Math.max(row.init_balance, 0)) : '' }}
          </template>
        </el-table-column>
        <el-table-column
          label="贷方"
          :width="colWidth('init_credit', 100)"
          align="right"
          prop="init_credit"
        >
          <template #default="{ row }">
            {{ row.direction === 'credit' ? fmtMonthAmount(Math.max(row.init_balance, 0)) : '' }}
          </template>
        </el-table-column>
      </el-table-column>

      <!-- 已发生月份的发生额（1..lastActiveMonth） -->
      <el-table-column v-for="m in displayMonths" :key="m" :label="m + '月'" align="center">
        <el-table-column
          label="借方"
          :width="colWidth('month' + m + '_debit', 90)"
          align="right"
          :prop="'month' + m + '_debit'"
        >
          <template #default="{ row }">
            {{ fmtMonthAmount(row['month' + m + '_debit']) }}
          </template>
        </el-table-column>
        <el-table-column
          label="贷方"
          :width="colWidth('month' + m + '_credit', 90)"
          align="right"
          :prop="'month' + m + '_credit'"
        >
          <template #default="{ row }">
            {{ fmtMonthAmount(row['month' + m + '_credit']) }}
          </template>
        </el-table-column>
      </el-table-column>

      <!-- 本年累计 -->
      <el-table-column label="本年累计" align="center">
        <el-table-column
          label="借方"
          :width="colWidth('year_debit', 100)"
          align="right"
          prop="year_debit"
        >
          <template #default="{ row }">
            {{ fmtMonthAmount(row.year_debit) }}
          </template>
        </el-table-column>
        <el-table-column
          label="贷方"
          :width="colWidth('year_credit', 100)"
          align="right"
          prop="year_credit"
        >
          <template #default="{ row }">
            {{ fmtMonthAmount(row.year_credit) }}
          </template>
        </el-table-column>
      </el-table-column>

      <!-- 期末余额 -->
      <el-table-column label="期末余额" align="center">
        <el-table-column
          label="借方"
          :width="colWidth('end_debit', 100)"
          align="right"
          prop="end_debit"
        >
          <template #default="{ row }">
            {{ row.direction === 'debit' ? fmtMonthAmount(Math.max(row.end_balance, 0)) : '' }}
          </template>
        </el-table-column>
        <el-table-column
          label="贷方"
          :width="colWidth('end_credit', 100)"
          align="right"
          prop="end_credit"
        >
          <template #default="{ row }">
            {{ row.direction === 'credit' ? fmtMonthAmount(Math.max(row.end_balance, 0)) : '' }}
          </template>
        </el-table-column>
      </el-table-column>
      <template #empty>
        <EmptyState type="data" description="暂无数据，请选择科目和期间后查询" />
      </template>
    </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import request from '@/api/request'
import { Printer, Search, Download } from '@element-plus/icons-vue'
import type { TableColumnCtx } from 'element-plus'
import { formatAmount } from '@/utils/format'
import { useListColumnWidth, sumColWidths } from '@/composables/useColumnWidthMemory'
import { exportStyledTable } from '@/utils/exportStyledExcel'
import {
  buildBalanceSheetExportColumns,
  buildBalanceSheetSummaryValues,
} from '@/utils/ledgerExportBuilders'

const { tableRef, onDragEnd, colWidth, relayoutTable } = useListColumnWidth('ledger_balance')
const list = ref<any[]>([])
const lastActiveMonth = ref(0)
const loading = ref(false)
const initialLoaded = ref(false)
const hideNoActivity = ref(true)
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

const filters = ref<any>({
  year: new Date().getFullYear(),
  account_code: '',
  account_level: null,
  include_unposted: true,
})

const printDateLabel = computed(() => {
  const y = filters.value.year
  if (lastActiveMonth.value > 0) {
    return `日期：${y}年1-${lastActiveMonth.value}月`
  }
  return `日期：${y}年`
})

/** 仅展示已有凭证的月份（1..lastActiveMonth） */
const displayMonths = computed(() =>
  lastActiveMonth.value > 0
    ? Array.from({ length: lastActiveMonth.value }, (_, i) => i + 1)
    : []
)

const ledgerTableWidth = computed(() => {
  const defs: Array<{ key: string; fallback: number }> = [
    { key: 'account_code', fallback: 120 },
    { key: 'account_name', fallback: 160 },
    { key: 'init_debit', fallback: 100 },
    { key: 'init_credit', fallback: 100 },
  ]
  for (const m of displayMonths.value) {
    defs.push({ key: `month${m}_debit`, fallback: 90 })
    defs.push({ key: `month${m}_credit`, fallback: 90 })
  }
  defs.push(
    { key: 'year_debit', fallback: 100 },
    { key: 'year_credit', fallback: 100 },
    { key: 'end_debit', fallback: 100 },
    { key: 'end_credit', fallback: 100 }
  )
  return sumColWidths(colWidth, defs, { includeGutter: false })
})

function syncLedgerTableBodyWidth() {
  const w = `${ledgerTableWidth.value}px`
  nextTick(() => {
    requestAnimationFrame(() => {
      const root = tableRef.value?.$el as HTMLElement | undefined
      if (!root) return
      for (const sel of [
        '.el-table__header-wrapper table',
        '.el-table__body-wrapper table.el-table__body',
        '.el-table__footer-wrapper table',
      ]) {
        const el = root.querySelector(sel) as HTMLElement | null
        if (el) el.style.width = w
      }
    })
  })
}

watch(ledgerTableWidth, () => syncLedgerTableBodyWidth())

function handleHeaderDragEnd(newWidth: number, oldWidth: number, column: any) {
  onDragEnd(newWidth, oldWidth, column)
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

// 前端筛选：隐藏未发生的科目（科目编码和级次已由后端筛选）
const filteredList = computed(() => {
  if (!hideNoActivity.value) return list.value
  return list.value.filter(r => {
    // 有期初余额 或 有任何月发生额 或 有期末余额
    if (Math.abs(r.init_balance) > 0.005) return true
    if (Math.abs(r.end_balance) > 0.005) return true
    for (let m = 1; m <= 12; m++) {
      if ((r['month' + m + '_debit'] || 0) > 0.005 || (r['month' + m + '_credit'] || 0) > 0.005)
        return true
    }
    return false
  })
})

const isBalanced = computed(() => {
  const data = filteredList.value
  const t = 0.01
  // 有限定级次时：只取最大级次的科目（其值已包含更深度子科目汇总）
  // 无限定级次时：取所有叶节点（排除有子科目的父科目）
  const maxLevel = filters.value.account_level
  const leafData = maxLevel
    ? data.filter(row => row.level === maxLevel)
    : data.filter(row => !data.some(r => r.account_code !== row.account_code && r.account_code.startsWith(row.account_code)))
  const initDebit = leafData.reduce(
    (s, r) => s + (r.direction === 'debit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const initCredit = leafData.reduce(
    (s, r) => s + (r.direction === 'credit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const yearDebit = leafData.reduce((s, r) => s + (r.year_debit || 0), 0)
  const yearCredit = leafData.reduce((s, r) => s + (r.year_credit || 0), 0)
  const endDebit = leafData.reduce(
    (s, r) => s + (r.direction === 'debit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const endCredit = leafData.reduce(
    (s, r) => s + (r.direction === 'credit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  return (
    Math.abs(initDebit - initCredit) < t &&
    Math.abs(yearDebit - yearCredit) < t &&
    Math.abs(endDebit - endCredit) < t
  )
})

function fmt(val: number) {
  if (!val) return ''
  return formatAmount(Math.abs(val))
}

/** 月度发生额：无发生也显示 0.00，保持表格网格 */
function fmtMonthAmount(val: number) {
  return formatAmount(Math.abs(val || 0))
}

function headerCellStyle({ rowIndex }: any) {
  if (rowIndex === 0) {
    return {
      background: '#e8f0fe',
      color: '#303133',
      fontWeight: 'bold',
      textAlign: 'center' as const,
    }
  }
  return {
    background: '#f5f7fa',
    color: '#606266',
    fontWeight: 'normal',
    textAlign: 'center' as const,
  }
}

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param

  // 基于当前显示的数据动态计算合计
  const calcInitDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const calcInitCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const calcEndDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const calcEndCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const calcYearDebit = data.reduce((s, r) => s + (r.year_debit || 0), 0)
  const calcYearCredit = data.reduce((s, r) => s + (r.year_credit || 0), 0)

  const sums: string[] = []

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    if (index === 1) {
      sums[index] = ''
      return
    }

    const prop = column.property
    if (!prop) {
      sums[index] = ''
      return
    }

    if (prop === 'init_debit') sums[index] = fmt(calcInitDebit)
    else if (prop === 'init_credit') sums[index] = fmt(calcInitCredit)
    else if (prop === 'end_debit') sums[index] = fmt(calcEndDebit)
    else if (prop === 'end_credit') sums[index] = fmt(calcEndCredit)
    else if (prop === 'year_debit') sums[index] = fmt(calcYearDebit)
    else if (prop === 'year_credit') sums[index] = fmt(calcYearCredit)
    else {
      const match = prop.match(/^month(\d+)_(debit|credit)$/)
      if (match) {
        const m = Number(match[1])
        const type = match[2]
        const total = data.reduce((s, r) => s + (r[`month${m}_${type}`] || 0), 0)
        sums[index] = fmtMonthAmount(total)
      } else {
        sums[index] = ''
      }
    }
  })

  return sums
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = { year: filters.value.year }
    if (filters.value.account_code) params.account_code = filters.value.account_code
    if (filters.value.account_level) params.account_level = filters.value.account_level
    if (filters.value.include_unposted) params.include_unposted = 'true'

    const res = await request.get<any>('/ledger/general-ledger', { params })
    list.value = res.data || []
    lastActiveMonth.value = Number(res.lastActiveMonth) || 0
    initialLoaded.value = true
    await relayoutTable()
    syncLedgerTableBodyWidth()
  } finally {
    loading.value = false
  }
}

async function exportData() {
  await exportStyledTable({
    fileName: `总分类账_${filters.value.year}.xlsx`,
    sheetName: '总分类账',
    title: '总分类账',
    subtitle: printDateLabel.value,
    columns: buildBalanceSheetExportColumns(colWidth, displayMonths.value),
    rows: filteredList.value,
    summaryValues: buildBalanceSheetSummaryValues(filteredList.value, displayMonths.value),
  })
}

onMounted(async () => {
  await fetchData()
})
</script>

<style scoped>
.page {
  padding: 16px;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.page-header h3 {
  margin: 0;
}
.filter-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.balance-tag {
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
}
.balance-tag.ok {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #b3e19d;
}
.balance-tag.err {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fbc4c4;
}

.print-title-row {
  display: none;
}
.skeleton-table {
  flex: 1;
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
