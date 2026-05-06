<template>
  <div class="page">
    <div class="page-header">
      <h3>收入费用表</h3>
      <div class="filter-row">
        <el-select v-model="filters.year" style="width: 100px">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" style="width: 100px">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="exportData">导出 Excel</el-button>
        <el-button @click="printData">打印</el-button>
      </div>
    </div>

    <el-card v-if="reportData" class="report-card">
      <div class="report-title-area">
        <h2 class="report-title">收入费用表</h2>
        <p class="report-subtitle">{{ reportData.reportDate }}</p>
      </div>

      <table class="rpt-table">
        <thead>
          <tr>
            <th style="width: 30%">收入项目</th>
            <th style="width: 12%">本期金额</th>
            <th style="width: 12%">累计金额</th>
            <th style="width: 30%">费用项目</th>
            <th style="width: 12%">本期金额</th>
            <th style="width: 12%">累计金额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(rev, idx) in revenueItems" :key="rev.name" class="data-row">
            <td>{{ rev.name }}</td>
            <td class="amount">{{ rev.formatted }}</td>
            <td class="amount">—</td>
            <td>{{ expenseItems[idx]?.name || '' }}</td>
            <td class="amount">{{ expenseItems[idx]?.formatted || '' }}</td>
            <td class="amount">—</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>收入合计</strong></td>
            <td class="amount">
              <strong>{{ fmt(reportData.totalRevenue) }}</strong>
            </td>
            <td class="amount">—</td>
            <td><strong>费用合计</strong></td>
            <td class="amount">
              <strong>{{ fmt(reportData.totalExpense) }}</strong>
            </td>
            <td class="amount">—</td>
          </tr>
          <tr class="total-row">
            <td colspan="6">
              <strong>本期盈余 = 收入合计 - 费用合计 = {{ fmt(reportData.netSurplus) }}</strong>
              <el-tag
                :type="reportData.netSurplus >= 0 ? 'success' : 'danger'"
                style="margin-left: 16px"
              >
                {{ reportData.netSurplus >= 0 ? '盈利' : '亏损' }}
              </el-tag>
            </td>
          </tr>
        </tbody>
      </table>
    </el-card>

    <EmptyState v-else-if="!loading" type="data" description="请选择年月后点击查询" />
    <el-skeleton v-if="loading" :rows="10" animated />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import request from '@/api/request'
import printJS from 'print-js'
import EmptyState from '@/components/EmptyState.vue'
import { showOperationError } from '@/composables/useMessage'
import { formatAmount } from '@/utils/format'

const reportData = ref<any>(null)
const loading = ref(false)
const filters = ref<any>({ year: new Date().getFullYear(), period: new Date().getMonth() + 1 })
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '—'
  return formatAmount(Math.abs(val))
}

const revenueItems = computed(() => {
  const rev = reportData.value?.revenues || {}
  const seq = [
    '财政拨款收入',
    '事业收入',
    '上级补助收入',
    '附属单位上缴收入',
    '经营收入',
    '捐赠收入',
    '利息收入',
    '租金收入',
    '其他收入',
  ]
  return seq.map(name => {
    const val = rev[name] || 0
    return { name, formatted: val === 0 ? '—' : fmt(val) }
  })
})

const expenseItems = computed(() => {
  const exp = reportData.value?.expenses || {}
  const seq = [
    '业务活动费用',
    '单位管理费用',
    '经营费用',
    '上缴上级费用',
    '对附属单位补助费用',
    '所得税费用',
    '其他费用',
    '资产处置费用',
  ]
  return seq.map(name => {
    const val = exp[name] || 0
    return { name, formatted: val === 0 ? '—' : fmt(val) }
  })
})

async function fetchData() {
  loading.value = true
  try {
    const res = await request.get('/report/income-statement', { params: filters.value })
    reportData.value = res.data
  } catch (error) {
    showOperationError('查询收入费用表', error)
  } finally {
    loading.value = false
  }
}

function printData() {
  if (!reportData.value) return
  try {
    const d = reportData.value
    const html = `<h1 style="text-align:center">收入费用表</h1>
    <p style="text-align:center">${d.reportDate}</p>
    <p>收入合计: ${fmt(d.totalRevenue)} | 费用合计: ${fmt(d.totalExpense)}</p>
    <p>本期盈余: ${fmt(d.netSurplus)} (${d.netSurplus >= 0 ? '盈利' : '亏损'})</p>`
    printJS({ printable: html, type: 'raw-html' })
  } catch (error) {
    showOperationError('打印', error)
  }
}

async function exportData() {
  try {
    const { utils, writeFile } = await import('xlsx')
    const d = reportData.value
    const revSeq = [
      '财政拨款收入',
      '事业收入',
      '上级补助收入',
      '附属单位上缴收入',
      '经营收入',
      '捐赠收入',
      '利息收入',
      '租金收入',
      '其他收入',
    ]
    const expSeq = [
      '业务活动费用',
      '单位管理费用',
      '经营费用',
      '上缴上级费用',
      '对附属单位补助费用',
      '所得税费用',
      '其他费用',
      '资产处置费用',
    ]
    const maxRows = Math.max(revSeq.length, expSeq.length)
    const data: (string | number)[][] = [
      ['收入费用表'],
      [d.reportDate],
      [],
      ['收入项目', '本期', '费用项目', '本期'],
    ]
    for (let i = 0; i < maxRows; i++) {
      const rv = d.revenues[revSeq[i]] || 0
      const ep = d.expenses[expSeq[i]] || 0
      data.push([revSeq[i] || '', rv === 0 ? '' : fmt(rv), expSeq[i] || '', ep === 0 ? '' : fmt(ep)])
    }
    data.push(['收入合计', d.totalRevenue, '费用合计', d.totalExpense])
    data.push([`本期盈余: ${fmt(d.netSurplus)}`])
    const wb = utils.book_new()
    const ws = utils.aoa_to_sheet(data)
    utils.book_append_sheet(wb, ws, '收入费用表')
    writeFile(wb, `收入费用表_${filters.value.year}_${filters.value.period}月.xlsx`)
  } catch (error) {
    showOperationError('导出', error)
  }
}

onMounted(fetchData)
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
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.report-card {
  max-width: 100%;
  overflow-x: auto;
}
.report-title-area {
  text-align: center;
  margin-bottom: 16px;
}
.report-title {
  font-size: 20px;
  margin: 0 0 4px;
}
.report-subtitle {
  color: #666;
  margin: 0;
}
.rpt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 700px;
}
.rpt-table th,
.rpt-table td {
  border: 1px solid #dcdfe6;
  padding: 6px 8px;
}
.rpt-table th {
  background: #f5f7fa;
  font-weight: bold;
  text-align: center;
}
.rpt-table td:first-child,
.rpt-table td:nth-child(4) {
  text-align: left;
}
.rpt-table td:nth-child(2),
.rpt-table td:nth-child(3),
.rpt-table td:nth-child(5),
.rpt-table td:nth-child(6) {
  text-align: right;
}
.amount {
  font-family: 'Courier New', monospace;
}
.subtotal-row td {
  background: #fafafa;
  font-weight: bold;
  border-top: 2px solid #dcdfe6;
}
.total-row td {
  background: #ecf5ff;
  font-weight: bold;
  border-top: 2px solid #409eff;
  text-align: center;
}
</style>
