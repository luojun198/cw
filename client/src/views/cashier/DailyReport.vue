<template>
  <div class="page page-daily">
    <div class="page-header">
      <h3>出纳日报</h3>
      <div class="filter-row">
        <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" style="width:150px" @change="load" />
        <el-button type="primary" @click="load" :loading="loading">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button plain @click="handlePrint">
          <el-icon><Printer /></el-icon>打印
        </el-button>
        <el-checkbox v-model="showZero">显示零值</el-checkbox>
      </div>
    </div>

    <div v-if="rows.length" class="report-body">
      <h4 class="report-title">
        出纳日报 — {{ date }}
        <span class="subtitle">（单位：人民币元）</span>
      </h4>

      <el-table :data="displayRows" size="small" border stripe show-summary :summary-method="summarize">
        <el-table-column label="科目编码" prop="account_code" width="120" />
        <el-table-column label="科目名称" prop="account_name" min-width="150" />
        <el-table-column label="期初余额" prop="opening" width="130" align="right">
          <template #default="{ row }">{{ fmt(row.opening) }}</template>
        </el-table-column>
        <el-table-column label="本期收入" prop="income" width="130" align="right">
          <template #default="{ row }"><span v-if="row.income" class="debit">{{ fmt(row.income) }}</span></template>
        </el-table-column>
        <el-table-column label="本期支出" prop="expense" width="130" align="right">
          <template #default="{ row }"><span v-if="row.expense" class="credit">{{ fmt(row.expense) }}</span></template>
        </el-table-column>
        <el-table-column label="期末余额" prop="closing" width="130" align="right">
          <template #default="{ row }">{{ fmt(row.closing) }}</template>
        </el-table-column>
      </el-table>

      <div class="summary-section">
        <div class="summary-card">
          <span class="s-label">本期收入合计</span>
          <span class="s-value debit">¥{{ fmt(data?.total_income ?? 0) }}</span>
        </div>
        <div class="summary-card">
          <span class="s-label">本期支出合计</span>
          <span class="s-value credit">¥{{ fmt(data?.total_expense ?? 0) }}</span>
        </div>
        <div class="summary-card">
          <span class="s-label">净收支</span>
          <span class="s-value" :class="{ debit: netFlow >= 0, credit: netFlow < 0 }">
            ¥{{ fmt(netFlow) }}
          </span>
        </div>
      </div>
    </div>

    <el-empty v-else-if="!loading" description="请选择日期后查询" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, Printer } from '@element-plus/icons-vue'
import { cashierApi } from '@/api/cashier'

const date = ref(new Date().toISOString().slice(0, 10))
const rows = ref<any[]>([])
const data = ref<{ total_income: number; total_expense: number } | null>(null)
const loading = ref(false)
const showZero = ref(false)

const displayRows = computed(() => showZero.value ? rows.value : rows.value.filter(r => r.income || r.expense))
const netFlow = computed(() => (data.value?.total_income ?? 0) - (data.value?.total_expense ?? 0))

const fmt = (v: number) =>
  (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function summarize({ columns, data: tableData }: any) {
  const sums: string[] = []
  columns.forEach((col: any, i: number) => {
    if (i === 0) sums[0] = '合计'
    else if (i === 1) sums[1] = ''
    else if (col.property === 'opening' || col.property === 'closing') sums[i] = ''
    else if (col.property === 'income') sums[i] = fmt(data.value?.total_income ?? 0)
    else if (col.property === 'expense') sums[i] = fmt(data.value?.total_expense ?? 0)
    else sums[i] = ''
  })
  return sums
}

onMounted(load)
async function load() {
  loading.value = true
  try {
    const res = await cashierApi.getDailyReport(date.value)
    if (res.code === 0) {
      rows.value = res.data.rows
      data.value = { total_income: res.data.total_income, total_expense: res.data.total_expense }
    }
  } finally { loading.value = false }
}

function handlePrint() { window.print() }
</script>

<style scoped>
.page-daily { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.report-body { flex: 1; overflow: auto; padding: 16px; }
.report-title { margin: 0 0 12px; font-size: 16px; text-align: center; }
.subtitle { font-size: 12px; color: var(--el-text-color-secondary); }
.summary-section { display: flex; gap: 16px; margin-top: 12px; justify-content: flex-end; }
.summary-card { text-align: center; padding: 8px 20px; border-radius: 6px; background: var(--el-fill-color-lighter); }
.s-label { display: block; font-size: 12px; color: var(--el-text-color-secondary); }
.s-value { font-size: 18px; font-weight: 700; }
.debit { color: #409eff; }
.credit { color: #f56c6c; }
</style>
