<template>
  <div class="page">
    <div class="page-header">
      <h3>日记账</h3>
      <div class="quick-filter-btns">
        <el-button type="primary" plain @click="quickFilterCash">现金日记账</el-button>
        <el-button type="success" plain @click="quickFilterBank">银行日记账</el-button>
      </div>
      <div class="filter-row">
        <el-select
          v-model="filters.account_type"
          style="width: 120px"
          clearable
          placeholder="账户类型"
        >
          <el-option label="现金" value="cash" />
          <el-option label="银行存款" value="bank" />
        </el-select>
        <el-select
          v-model="filters.account_id"
          filterable
          placeholder="选择具体科目"
          style="width: 200px"
          clearable
        >
          <el-option v-for="a in cashBankAccounts" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
        </el-select>
        <el-select v-model="filters.year" style="width: 100px">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" style="width: 100px">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-select v-model="filters.direction" placeholder="收支类型" clearable style="width: 120px">
          <el-option label="收入(借方)" value="debit" />
          <el-option label="支出(贷方)" value="credit" />
        </el-select>
        <el-checkbox v-model="filters.include_unposted" @change="fetchData" style="margin-left: 12px">
          统计未记账凭证
        </el-checkbox>
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="exportData">导出Excel</el-button>
      </div>
    </div>

    <el-table ref="tableRef" :data="list" stripe border height="calc(100vh - 200px)" @header-dragend="onDragEnd">
      <el-table-column prop="voucher_date" label="日期" :width="widths['voucher_date'] || 100" />
      <el-table-column prop="voucher_no" label="凭证号" :width="widths['voucher_no'] || 130" />
      <el-table-column prop="account_code" label="科目编码" :width="widths['account_code'] || 100" />
      <el-table-column prop="account_name" label="科目名称" :width="widths['account_name'] || 140" />
      <el-table-column prop="summary" label="摘要" :width="widths['summary'] || 160" />
      <el-table-column prop="opposite_accounts" label="对方科目" :width="widths['opposite_accounts'] || 180" />
      <el-table-column label="借贷" :width="widths['借贷'] || 50">
        <template #default="{ row }">{{ row.direction === 'debit' ? '借' : '贷' }}</template>
      </el-table-column>
      <el-table-column label="金额" :width="widths['金额'] || 140" align="right">
        <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="余额" :width="widths['余额'] || 140" align="right">
        <template #default="{ row }">{{ formatAmount(row.running_balance) }}</template>
      </el-table-column>
      <el-table-column prop="maker_name" label="制单人" :width="widths['maker_name'] || 80" />
      <el-table-column prop="auditor_name" label="审核人" :width="widths['auditor_name'] || 80" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import request from '@/api/request'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { formatAmount } from '@/utils/format'

const list = ref<any[]>([])
const cashBankAccounts = ref<any[]>([])
const filters = ref<any>({
  year: new Date().getFullYear(),
  period: new Date().getMonth() + 1,
  account_type: '',
  account_id: '',
  direction: '',
  account_code_start: '',
  account_code_end: '',
  include_unposted: true,
})
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

const tableRef = ref()
const { widths, onDragEnd } = useColumnWidthMemory('ledger_cash_journal')

async function fetchData() {
  const params: any = {
    year: filters.value.year,
    period: filters.value.period,
  }
  if (filters.value.account_type) params.account_type = filters.value.account_type
  if (filters.value.account_id) params.account_id = filters.value.account_id
  if (filters.value.direction) params.direction = filters.value.direction
  if (filters.value.account_code_start) params.account_code_start = filters.value.account_code_start
  if (filters.value.account_code_end) params.account_code_end = filters.value.account_code_end
  if (filters.value.include_unposted) params.include_unposted = 'true'

  console.log('日记账查询参数:', params)
  const res = await request.get<any[]>('/ledger/cash-journal', { params })
  console.log('日记账查询结果:', res.data?.length, '条')
  if (res.data && res.data.length > 0) {
    console.log('第一条数据的科目:', res.data[0].account_code, res.data[0].account_name)
    console.log('所有科目编码:', res.data.map((e: any) => e.account_code).join(', '))
  }
  const entries = res.data || []

  // 计算余额 (按科目分组计算)
  const balanceByAccount: Record<string, number> = {}
  for (const entry of entries) {
    const accountKey = entry.account_id || entry.account_code
    if (!balanceByAccount[accountKey]) {
      balanceByAccount[accountKey] = 0
    }
    if (entry.direction === 'debit') {
      balanceByAccount[accountKey] += entry.amount
    } else {
      balanceByAccount[accountKey] -= entry.amount
    }
    entry.running_balance = balanceByAccount[accountKey]
  }

  list.value = entries
}

async function fetchCashBankAccounts() {
  const res = await request.get<any[]>('/base/accounts', {
    params: { is_enabled: 1 },
  })
  // 筛选现金和银行科目
  cashBankAccounts.value = res.data.filter((a: any) => a.is_cash || a.is_bank)
}

// 快捷筛选：现金日记账 (100101和100102及其所有子科目)
function quickFilterCash() {
  // 使用account_type='cash'查询所有现金科目
  filters.value.account_type = 'cash'
  filters.value.account_id = ''
  filters.value.account_code_start = ''
  filters.value.account_code_end = ''
  fetchData()
}

// 快捷筛选：银行日记账 (100201和100202及其所有子科目)
function quickFilterBank() {
  // 使用account_type='bank'查询所有银行科目
  filters.value.account_type = 'bank'
  filters.value.account_id = ''
  filters.value.account_code_start = ''
  filters.value.account_code_end = ''
  fetchData()
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')
  const ws = utils.json_to_sheet(
    list.value.map((v: any) => ({
      日期: v.voucher_date,
      凭证号: v.voucher_no,
      科目编码: v.account_code,
      科目名称: v.account_name,
      摘要: v.summary,
      对方科目: v.opposite_accounts || '',
      借贷: v.direction === 'debit' ? '借' : '贷',
      金额: v.amount,
      余额: v.running_balance,
      制单人: v.maker_name || '',
      审核人: v.auditor_name || '',
    }))
  )
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '日记账')
  writeFile(wb, `日记账_${filters.value.year}_${filters.value.period}.xlsx`)
}

// 当账户类型改变时,清空具体科目选择
watch(() => filters.value.account_type, () => {
  filters.value.account_id = ''
})

onMounted(async () => {
  await fetchData()
  fetchCashBankAccounts()
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
  flex-wrap: wrap;
  gap: 12px;
}
.page-header h3 {
  margin: 0;
}
.quick-filter-btns {
  display: flex;
  gap: 8px;
}
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
