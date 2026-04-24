<template>
  <div class="page">
    <div class="page-header">
      <h3>现金流量表</h3>
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
        <h2 class="report-title">现金流量表</h2>
        <p class="report-subtitle">{{ reportData.reportDate }}</p>
      </div>

      <table class="rpt-table">
        <thead>
          <tr>
            <th style="width: 45%">项目</th>
            <th style="width: 10%">行次</th>
            <th style="width: 20%">金额</th>
          </tr>
        </thead>
        <tbody>
          <!-- 经营活动 -->
          <tr class="section-header">
            <td colspan="3"><strong>一、经营活动产生的现金流量</strong></td>
          </tr>
          <tr v-for="item in opFlowItems" :key="item.key" class="data-row">
            <td style="padding-left: 24px">{{ item.label }}</td>
            <td class="center"></td>
            <td class="amount">{{ item.formatted }}</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>经营活动产生的现金流量净额</strong></td>
            <td class="center"></td>
            <td class="amount">
              <strong
                :style="{
                  color: reportData.operatingActivities?.['净额'] >= 0 ? '#67c23a' : '#f56c6c',
                }"
                >{{ fmt(reportData.operatingActivities?.['净额']) }}</strong
              >
            </td>
          </tr>

          <!-- 投资活动 -->
          <tr class="section-header">
            <td colspan="3"><strong>二、投资活动产生的现金流量</strong></td>
          </tr>
          <tr v-for="item in invFlowItems" :key="item.key" class="data-row">
            <td style="padding-left: 24px">{{ item.label }}</td>
            <td class="center"></td>
            <td class="amount">{{ item.formatted }}</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>投资活动产生的现金流量净额</strong></td>
            <td class="center"></td>
            <td class="amount">
              <strong
                :style="{
                  color: reportData.investingActivities?.['净额'] >= 0 ? '#67c23a' : '#f56c6c',
                }"
                >{{ fmt(reportData.investingActivities?.['净额']) }}</strong
              >
            </td>
          </tr>

          <!-- 筹资活动 -->
          <tr class="section-header">
            <td colspan="3"><strong>三、筹资活动产生的现金流量</strong></td>
          </tr>
          <tr v-for="item in finFlowItems" :key="item.key" class="data-row">
            <td style="padding-left: 24px">{{ item.label }}</td>
            <td class="center"></td>
            <td class="amount">{{ item.formatted }}</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>筹资活动产生的现金流量净额</strong></td>
            <td class="center"></td>
            <td class="amount">
              <strong
                :style="{
                  color: reportData.financingActivities?.['净额'] >= 0 ? '#67c23a' : '#f56c6c',
                }"
                >{{ fmt(reportData.financingActivities?.['净额']) }}</strong
              >
            </td>
          </tr>

          <!-- 汇总 -->
          <tr class="total-row">
            <td><strong>四、现金及现金等价物净增加额</strong></td>
            <td class="center"></td>
            <td class="amount">
              <strong :style="{ color: reportData.netCashChange >= 0 ? '#67c23a' : '#f56c6c' }">{{
                fmt(reportData.netCashChange)
              }}</strong>
            </td>
          </tr>

          <!-- 期初/期末 -->
          <tr class="data-row">
            <td>加：期初现金余额</td>
            <td class="center"></td>
            <td class="amount">{{ fmt(reportData.beginCash) }}</td>
          </tr>
          <tr class="data-row">
            <td>期末现金余额</td>
            <td class="center"></td>
            <td class="amount">{{ fmt(reportData.endCash) }}</td>
          </tr>
          <tr class="subtotal-row">
            <td><strong>平衡校验</strong></td>
            <td class="center"></td>
            <td class="amount">
              <el-tag :type="reportData.cashBalanceCheck ? 'success' : 'danger'" size="small">
                {{ reportData.cashBalanceCheck ? '√ 平衡' : '✗ 不平衡' }}
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

// Vue 3 v-for 对对象只迭代值，需要用数组
const toFlowItems = (obj: Record<string, number>) => {
  return Object.entries(obj || {})
    .filter(([k]) => !k.includes('净额'))
    .map(([k, v]) => ({
      key: k,
      label: k.replace('流入_', '  ').replace('流出_', '  '),
      formatted: fmt(v),
    }))
}
const opFlowItems = computed(() => toFlowItems(reportData.value?.operatingActivities || {}))
const invFlowItems = computed(() => toFlowItems(reportData.value?.investingActivities || {}))
const finFlowItems = computed(() => toFlowItems(reportData.value?.financingActivities || {}))

async function fetchData() {
  loading.value = true
  try {
    const res = await request.get('/report/cash-flow', { params: filters.value })
    reportData.value = res.data
  } catch (error) {
    showOperationError('查询现金流量表', error)
  } finally {
    loading.value = false
  }
}

function printData() {
  if (!reportData.value) return
  try {
    const d = reportData.value
    const html = `<h1 style="text-align:center">现金流量表</h1>
    <p style="text-align:center">${d.reportDate}</p>
    <p>现金净增加额: ${fmt(d.netCashChange)}</p>
    <p>期初余额: ${fmt(d.beginCash)} | 期末余额: ${fmt(d.endCash)}</p>
    <p>平衡: ${d.cashBalanceCheck ? '是' : '否'}</p>`
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
      ['现金流量表'],
      [d.reportDate],
      [],
      ['项目', '行次', '金额'],
      ['一、经营活动产生的现金流量净额', '', d.operatingActivities?.['净额'] || ''],
      ['二、投资活动产生的现金流量净额', '', d.investingActivities?.['净额'] || ''],
      ['三、筹资活动产生的现金流量净额', '', d.financingActivities?.['净额'] || ''],
      ['四、现金净增加额', '', d.netCashChange || ''],
      ['期初现金', '', d.beginCash || ''],
      ['期末现金', '', d.endCash || ''],
      [`平衡校验: ${d.cashBalanceCheck ? '是' : '否'}`],
    ]
    const wb = utils.book_new()
    const ws = utils.aoa_to_sheet(data)
    utils.book_append_sheet(wb, ws, '现金流量表')
    writeFile(wb, `现金流量表_${filters.value.year}_${filters.value.period}月.xlsx`)
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
.section-header td {
  background: #f0f0f0;
  font-weight: bold;
}
.data-row td:first-child {
  text-align: left;
}
.amount {
  text-align: right;
  font-family: 'Courier New', monospace;
}
.center {
  text-align: center;
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
}
</style>
