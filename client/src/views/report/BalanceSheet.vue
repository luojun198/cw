<template>
  <div class="page">
    <div class="page-header">
      <h3>资产负债表</h3>
      <div class="filter-row">
        <el-select v-model="filters.year" style="width: 100px">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" style="width: 100px">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="handleExport">导出 Excel</el-button>
        <el-button @click="handlePrint">打印</el-button>
      </div>
    </div>

    <BalanceSheetTable
      v-if="reportData"
      :report-data="reportData"
      :asset-items-by-group="assetItemsByGroup"
      :net-value-items="netValueItems"
      :liability-items="liabilityItems"
      :equity-items="equityItems"
      :deductions="deductions"
      :deduction-total="deductionTotal"
    />

    <EmptyState v-else-if="!loading" type="data" description="请选择年月后点击查询" />
    <el-skeleton v-if="loading" :rows="10" animated />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '@/api/request'
import BalanceSheetTable from '@/components/report/BalanceSheetTable.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useBalanceSheetData } from '@/composables/useBalanceSheetData'
import { useBalanceSheetExport } from '@/composables/useBalanceSheetExport'
import { showOperationError } from '@/composables/useMessage'

const reportData = ref<any>(null)
const loading = ref(false)
const filters = ref<any>({ year: new Date().getFullYear(), period: new Date().getMonth() + 1 })
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

const {
  deductions,
  deductionTotal,
  assetItemsByGroup,
  netValueItems,
  liabilityItems,
  equityItems,
} = useBalanceSheetData(reportData)

const { printReport, exportToExcel } = useBalanceSheetExport()

async function fetchData() {
  loading.value = true
  try {
    const res = await request.get('/report/balance-sheet', { params: filters.value })
    reportData.value = res.data
  } catch (error) {
    showOperationError('查询资产负债表', error)
  } finally {
    loading.value = false
  }
}

function handlePrint() {
  try {
    printReport(reportData.value)
  } catch (error) {
    showOperationError('打印', error)
  }
}

async function handleExport() {
  try {
    await exportToExcel(
      reportData.value,
      filters.value,
      assetItemsByGroup.value,
      netValueItems.value,
      liabilityItems.value,
      equityItems.value
    )
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
</style>
