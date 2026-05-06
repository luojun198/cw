<template>
  <div class="page">
    <div class="page-header">
      <h3>序时账</h3>
      <div class="filter-row">
        <el-select v-model="filters.year" style="width: 100px">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" style="width: 100px">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-date-picker
          v-model="filters.start_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          style="width: 140px"
        />
        <el-date-picker
          v-model="filters.end_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          style="width: 140px"
        />
        <el-checkbox v-model="filters.include_unposted" @change="fetchData" style="margin-left: 12px">
          统计未记账凭证
        </el-checkbox>
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="exportData">导出Excel</el-button>
      </div>
    </div>

    <el-table ref="tableRef" :data="list" stripe border height="calc(100vh - 200px)" @header-dragend="onDragEnd">
      <el-table-column prop="voucher_date" label="日期" :width="widths['voucher_date'] || 100" />
      <el-table-column prop="voucher_type_name" label="凭证类型" :width="widths['voucher_type_name'] || 100" />
      <el-table-column prop="voucher_no" label="凭证号" :width="widths['voucher_no'] || 130" />
      <el-table-column prop="account_code" label="科目编码" :width="widths['account_code'] || 100" />
      <el-table-column prop="account_name" label="科目名称" :width="widths['account_name'] || 140" />
      <el-table-column prop="summary" label="摘要" :width="widths['summary'] || 180" />
      <el-table-column label="借方金额" :width="widths['借方金额'] || 140" align="right">
        <template #default="{ row }">{{
          row.direction === 'debit' ? formatAmount(row.amount) : ''
        }}</template>
      </el-table-column>
      <el-table-column label="贷方金额" :width="widths['贷方金额'] || 140" align="right">
        <template #default="{ row }">{{
          row.direction === 'credit' ? formatAmount(row.amount) : ''
        }}</template>
      </el-table-column>
      <el-table-column prop="maker_name" label="制单人" :width="widths['maker_name'] || 80" />
    </el-table>

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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '@/api/request'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { formatAmount } from '@/utils/format'

const list = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(100)
const filters = ref<any>({
  year: new Date().getFullYear(),
  period: new Date().getMonth() + 1,
  start_date: '',
  end_date: '',
  include_unposted: true,
})
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

const tableRef = ref()
const { widths, onDragEnd } = useColumnWidthMemory('ledger_chronological')

async function fetchData() {
  const params: any = {
    year: filters.value.year,
    period: filters.value.period,
    page: currentPage.value,
    pageSize: pageSize.value,
  }
  if (filters.value.start_date) params.start_date = filters.value.start_date
  if (filters.value.end_date) params.end_date = filters.value.end_date
  if (filters.value.include_unposted) params.include_unposted = 'true'

  const res = await request.get<any>('/ledger/chronological', { params })
  list.value = res.data || []
  total.value = res.total || 0
}

async function exportData() {
  // 导出全部数据
  const params: any = {
    year: filters.value.year,
    period: filters.value.period,
    page: 1,
    pageSize: 10000,
  }
  if (filters.value.start_date) params.start_date = filters.value.start_date
  if (filters.value.end_date) params.end_date = filters.value.end_date
  if (filters.value.include_unposted) params.include_unposted = 'true'

  const res = await request.get<any>('/ledger/chronological', { params })
  const allData = res.data || []

  const { utils, writeFile } = await import('xlsx')
  const ws = utils.json_to_sheet(
    allData.map((v: any) => ({
      日期: v.voucher_date,
      凭证类型: v.voucher_type_name || '',
      凭证号: v.voucher_no,
      科目编码: v.account_code,
      科目名称: v.account_name,
      摘要: v.summary,
      借方金额: v.direction === 'debit' ? v.amount : '',
      贷方金额: v.direction === 'credit' ? v.amount : '',
      制单人: v.maker_name || '',
    }))
  )
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '序时账')
  writeFile(wb, `序时账_${filters.value.year}_${filters.value.period}.xlsx`)
}

onMounted(async () => {
  await fetchData()
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
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
