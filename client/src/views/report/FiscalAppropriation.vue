<template>
  <div class="page">
    <div class="page-header">
      <h3>财政拨款收入支出表</h3>
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
        <h2 class="report-title">财政拨款收入支出表</h2>
        <p class="report-subtitle">{{ reportData.reportDate }}</p>
      </div>

      <!-- 财政拨款收入部分 -->
      <h4 class="section-title">一、财政拨款收入</h4>
      <table class="rpt-table">
        <thead>
          <tr>
            <th style="width: 40%">收入项目</th>
            <th style="width: 15%">金额</th>
            <th style="width: 40%">支出项目</th>
            <th style="width: 15%">金额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(rev, idx) in revenueItems" :key="rev.name" class="data-row">
            <td>{{ rev.name }}</td>
            <td class="amount">{{ rev.formatted }}</td>
            <td>{{ expenseItems[idx]?.name || '' }}</td>
            <td class="amount">{{ expenseItems[idx]?.formatted || '' }}</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>财政拨款收入合计</strong></td>
            <td class="amount">
              <strong>{{ fmt(reportData.totalFiscalRevenue) }}</strong>
            </td>
            <td><strong>预算支出合计</strong></td>
            <td class="amount">
              <strong>{{ fmt(reportData.totalBudgetExpense) }}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 财政应返还额度 -->
      <h4 class="section-title">二、财政应返还额度</h4>
      <table class="rpt-table">
        <thead>
          <tr>
            <th style="width: 50%">项目</th>
            <th style="width: 50%">余额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(val, key) in quotaItems" :key="key" class="data-row">
            <td>{{ key }}</td>
            <td class="amount">{{ fmt(val) }}</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>财政应返还额度合计</strong></td>
            <td class="amount">
              <strong>{{ fmt(reportData.totalFiscalQuota) }}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 结余 -->
      <div class="surplus-area">
        <el-card class="surplus-card">
          <div class="surplus-title">三、本期收支结余</div>
          <div
            class="surplus-amount"
            :style="{ color: reportData.netFiscalSurplus >= 0 ? '#67c23a' : '#f56c6c' }"
          >
            {{ reportData.netFiscalSurplus >= 0 ? '+' : '' }}{{ fmt(reportData.netFiscalSurplus) }}
          </div>
          <div class="surplus-detail">
            收入 {{ fmt(reportData.totalFiscalRevenue) }} - 支出
            {{ fmt(reportData.totalBudgetExpense) }} = 结余 {{ fmt(reportData.netFiscalSurplus) }}
          </div>
        </el-card>
      </div>
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

const revenueSeq = [
  '一般公共预算拨款',
  '政府性基金预算拨款',
  '国有资本经营预算拨款',
  '财政直接支付',
  '财政授权支付',
]
const expenseSeq = ['基本支出', '项目支出']

const revenueItems = computed(() => {
  const rev = reportData.value?.fiscalRevenue || {}
  return revenueSeq.map(name => {
    const val = rev[name] || 0
    return { name, formatted: val === 0 ? '—' : fmt(val) }
  })
})

const expenseItems = computed(() => {
  const exp = reportData.value?.budgetExpense || {}
  return expenseSeq.map(name => {
    const val = exp[name] || 0
    return { name, formatted: val === 0 ? '—' : fmt(val) }
  })
})

const quotaItems = computed(() => reportData.value?.fiscalQuota || {})

async function fetchData() {
  loading.value = true
  try {
    const res = await request.get('/report/fiscal-appropriation', { params: filters.value })
    reportData.value = res.data
  } catch (error) {
    showOperationError('查询财政拨款收支表', error)
  } finally {
    loading.value = false
  }
}

function printData() {
  if (!reportData.value) return
  try {
    const d = reportData.value
    const html = `<h1 style="text-align:center">财政拨款收入支出表</h1>
    <p style="text-align:center">${d.reportDate}</p>
    <p>财政拨款收入: ${fmt(d.totalFiscalRevenue)} | 预算支出: ${fmt(d.totalBudgetExpense)} | 结余: ${fmt(d.netFiscalSurplus)}</p>
    <p>财政应返还额度: ${fmt(d.totalFiscalQuota)}</p>`
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
      ['财政拨款收入支出表'],
      [d.reportDate],
      [],
      ['收入项目', '金额', '支出项目', '金额'],
      ...revenueSeq.map((name, i) => {
        const rv = d.fiscalRevenue?.[name] || 0
        const ep = d.budgetExpense?.[expenseSeq[i]] || 0
        return [name, rv === 0 ? '' : fmt(rv), expenseSeq[i] || '', ep === 0 ? '' : fmt(ep)]
      }),
      ['财政拨款收入合计', d.totalFiscalRevenue, '预算支出合计', d.totalBudgetExpense],
      [],
      ['财政应返还额度项目', '金额'],
      ...Object.entries(d.fiscalQuota || {}).map(([k, v]) => [k, v === 0 ? '' : fmt(v as number)]),
      ['合计', d.totalFiscalQuota],
      [],
      [`结余: ${fmt(d.netFiscalSurplus)}`],
    ]
    const wb = utils.book_new()
    const ws = utils.aoa_to_sheet(data)
    utils.book_append_sheet(wb, ws, '财政拨款收支表')
    writeFile(wb, `财政拨款收支表_${filters.value.year}_${filters.value.period}月.xlsx`)
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
.section-title {
  font-size: 14px;
  margin: 16px 0 8px;
  color: #303133;
  padding-left: 8px;
  border-left: 3px solid #409eff;
}
.rpt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 8px;
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
.rpt-table td:first-child,
.rpt-table td:nth-child(3) {
  text-align: left;
}
.amount {
  text-align: right;
  font-family: 'Courier New', monospace;
}
.subtotal-row td {
  background: #fafafa;
  font-weight: bold;
  border-top: 2px solid #dcdfe6;
}
.surplus-area {
  margin-top: 16px;
}
.surplus-card {
  max-width: 400px;
  margin: 0 auto;
  text-align: center;
  background: #f0f9eb;
  border-color: #e1f3d8;
}
.surplus-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}
.surplus-amount {
  font-size: 28px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}
.surplus-detail {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
</style>
