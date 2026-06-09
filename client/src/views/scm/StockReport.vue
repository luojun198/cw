<template>
  <div class="page scm-report-page">
    <div class="page-header">
      <h3>收发存汇总表</h3>
      <div class="filter-row">
        <el-date-picker v-model="startDate" type="date" value-format="YYYY-MM-DD" placeholder="开始" style="width:130px" />
        <el-date-picker v-model="endDate" type="date" value-format="YYYY-MM-DD" placeholder="结束" style="width:130px" />
        <el-select v-model="wh" placeholder="仓库" clearable style="width:140px">
          <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
        </el-select>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <span class="total-hint">共 {{ list.length }} 条</span>
      </div>
    </div>
    <el-table :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 200px)"
      :summary-method="summaryMethod" show-summary>
      <el-table-column label="仓库" prop="warehouse_code" width="90" />
      <el-table-column label="物料编号" prop="item_code" width="110" />
      <el-table-column label="名称" prop="item_name" min-width="130" show-overflow-tooltip />
      <el-table-column label="规格" prop="spec" width="100" show-overflow-tooltip />
      <el-table-column label="单位" prop="unit" width="60" />
      <el-table-column label="期初数量" prop="opening_qty" width="90" align="right" />
      <el-table-column label="期初金额" prop="opening_amt" width="110" align="right" />
      <el-table-column label="本期入库" prop="in_qty" width="90" align="right" />
      <el-table-column label="入库金额" prop="in_amt" width="110" align="right" />
      <el-table-column label="本期出库" prop="out_qty" width="90" align="right" />
      <el-table-column label="出库金额" prop="out_amt" width="110" align="right" />
      <el-table-column label="期末数量" prop="closing_qty" width="90" align="right">
        <template #default="{ row }"><b>{{ row.closing_qty }}</b></template>
      </el-table-column>
      <el-table-column label="期末金额" prop="closing_amt" width="120" align="right">
        <template #default="{ row }"><b>{{ fmt(row.closing_amt) }}</b></template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'

const list = ref<any[]>([]); const loading = ref(false)
const warehouses = ref<any[]>([])
const startDate = ref(''); const endDate = ref(''); const wh = ref('')
const fmt = (v: number) => (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function load() {
  loading.value = true
  try {
    const res = await scmApi.getStockSummary({ start_date: startDate.value || undefined, end_date: endDate.value || undefined, warehouse_code: wh.value || undefined })
    if (res.code === 0) list.value = res.data.summary || []
  } finally { loading.value = false }
}

function summaryMethod({ columns, data }: any) {
  const sums: string[] = []
  columns.forEach((col: any, i: number) => {
    if (['opening_qty','opening_amt','in_qty','in_amt','out_qty','out_amt','closing_qty','closing_amt'].includes(col.property)) {
      sums[i] = fmt(data.reduce((s: number, r: any) => s + (Number(r[col.property]) || 0), 0))
    } else { sums[i] = i === 0 ? '合计' : '' }
  })
  return sums
}

onMounted(async () => {
  const w = await scmApi.getWarehouses(); if (w.code === 0) warehouses.value = w.data
  load()
})
</script>

<style scoped>
.scm-report-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
