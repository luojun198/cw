<template>
  <div class="page">
    <div class="page-header">
      <h3>净资产变动表</h3>
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
        <h2 class="report-title">净资产变动表</h2>
        <p class="report-subtitle">{{ reportData.reportDate }}</p>
      </div>

      <table class="rpt-table">
        <thead>
          <tr>
            <th>净资产项目</th>
            <th>行次</th>
            <th>期初余额</th>
            <th>本期增加</th>
            <th>本期减少</th>
            <th>期末余额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.code" class="data-row">
            <td class="account-name">{{ item.name }}</td>
            <td class="center">{{ item.num }}</td>
            <td class="amount">{{ fmt(item.beginBalance) }}</td>
            <td class="amount increase">{{ fmt(item.increase) }}</td>
            <td class="amount decrease">{{ fmt(item.decrease) }}</td>
            <td class="amount">{{ fmt(item.endBalance) }}</td>
          </tr>
          <tr class="total-row">
            <td><strong>合计</strong></td>
            <td class="center"></td>
            <td class="amount">
              <strong>{{ fmt(totalBegin) }}</strong>
            </td>
            <td class="amount increase">
              <strong>{{ fmt(totalIncrease) }}</strong>
            </td>
            <td class="amount decrease">
              <strong>{{ fmt(totalDecrease) }}</strong>
            </td>
            <td class="amount">
              <strong>{{ fmt(totalEnd) }}</strong>
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

const reportData = ref<any>(null)
const loading = ref(false)
const filters = ref<any>({ year: new Date().getFullYear(), period: new Date().getMonth() + 1 })
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

const nameMap: Record<string, string> = {
  累计盈余: '累计盈余',
  专用基金: '专用基金',
  权益法调整: '权益法调整',
  本期盈余: '本期盈余',
  本年盈余分配: '本年盈余分配',
  无偿调拨净资产: '无偿调拨净资产',
  以前年度盈余调整: '以前年度盈余调整',
}
const numMap: Record<string, string> = {
  累计盈余: '1',
  专用基金: '2',
  权益法调整: '3',
  本期盈余: '4',
  本年盈余分配: '5',
  无偿调拨净资产: '6',
  以前年度盈余调整: '7',
}

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '—'
  const prefix = val < 0 ? '-' : ''
  return (
    prefix +
    new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Math.abs(val)
    )
  )
}

const items = computed(() => {
  return (reportData.value?.items || []).map((item: any) => ({
    code: item.code,
    name: nameMap[item.name] || item.name,
    num: numMap[item.name] || '',
    beginBalance: item.beginBalance,
    increase: item.increase,
    decrease: item.decrease,
    endBalance: item.endBalance,
  }))
})

const totalBegin = computed(() =>
  items.value.reduce((s: number, i: any) => s + (i.beginBalance || 0), 0)
)
const totalIncrease = computed(() =>
  items.value.reduce((s: number, i: any) => s + (i.increase || 0), 0)
)
const totalDecrease = computed(() =>
  items.value.reduce((s: number, i: any) => s + (i.decrease || 0), 0)
)
const totalEnd = computed(() =>
  items.value.reduce((s: number, i: any) => s + (i.endBalance || 0), 0)
)

async function fetchData() {
  loading.value = true
  try {
    const res = await request.get('/report/equity-changes', { params: filters.value })
    reportData.value = res.data
  } catch (error) {
    showOperationError('查询净资产变动表', error)
  } finally {
    loading.value = false
  }
}

function printData() {
  if (!reportData.value) return
  try {
    const d = reportData.value
    const rows = d.items
      .map(
        (item: any) =>
          `${item.name}: 期初${fmt(item.beginBalance)} 增加${fmt(item.increase)} 减少${fmt(item.decrease)} 期末${fmt(item.endBalance)}`
      )
      .join('\n')
    const html = `<h1 style="text-align:center">净资产变动表</h1><p style="text-align:center">${d.reportDate}</p><pre>${rows}</pre>`
    printJS({ printable: html, type: 'raw-html' })
  } catch (error) {
    showOperationError('打印', error)
  }
}

async function exportData() {
  try {
    const { utils, writeFile } = await import('xlsx')
    const d = reportData.value
    const data: (string | number)[][] = [
      ['净资产变动表'],
      [d.reportDate],
      [],
      ['净资产项目', '行次', '期初余额', '本期增加', '本期减少', '期末余额'],
      ...d.items.map((item: any) => [
        item.name,
        numMap[item.name] || '',
        item.beginBalance || '',
        item.increase || '',
        item.decrease || '',
        item.endBalance || '',
      ]),
      ['合计', '', totalBegin.value, totalIncrease.value, totalDecrease.value, totalEnd.value],
    ]
    const wb = utils.book_new()
    const ws = utils.aoa_to_sheet(data)
    utils.book_append_sheet(wb, ws, '净资产变动表')
    writeFile(wb, `净资产变动表_${filters.value.year}_${filters.value.period}月.xlsx`)
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
}
.rpt-table th,
.rpt-table td {
  border: 1px solid #dcdfe6;
  padding: 6px 10px;
}
.rpt-table th {
  background: #f5f7fa;
  font-weight: bold;
  text-align: center;
}
.account-name {
  text-align: left;
}
.center {
  text-align: center;
  color: #909399;
}
.amount {
  text-align: right;
  font-family: 'Courier New', monospace;
}
.increase {
  color: #67c23a;
}
.decrease {
  color: #f56c6c;
}
.total-row td {
  background: #ecf5ff;
  font-weight: bold;
  border-top: 2px solid #409eff;
}
</style>
