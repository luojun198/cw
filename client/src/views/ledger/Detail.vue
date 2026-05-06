<template>
  <div class="page">
    <div class="page-header">
      <h3>明细账</h3>
      <div class="filter-row">
        <el-select
          v-model="filters.account_id"
          filterable
          placeholder="选择科目"
          style="width: 240px"
          clearable
        >
          <el-option v-for="a in accounts" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
        </el-select>
        <el-date-picker
          v-model="filters.start_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          style="width: 150px"
        />
        <el-date-picker
          v-model="filters.end_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          style="width: 150px"
        />
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="showAdvancedFilter = !showAdvancedFilter">
          {{ showAdvancedFilter ? '收起' : '高级筛选' }}
        </el-button>
        <el-checkbox v-model="filters.include_unposted" @change="fetchData" style="margin-left: 12px">
          统计未记账凭证
        </el-checkbox>
        <el-button @click="exportData">导出Excel</el-button>
      </div>
      <div v-if="showAdvancedFilter" class="filter-row" style="margin-top: 8px">
        <el-input
          v-model="filters.summary_keyword"
          placeholder="摘要关键词"
          clearable
          style="width: 160px"
        />
        <el-input
          v-model="filters.min_amount"
          placeholder="最小金额"
          type="number"
          clearable
          style="width: 120px"
        />
        <el-input
          v-model="filters.max_amount"
          placeholder="最大金额"
          type="number"
          clearable
          style="width: 120px"
        />
        <el-input
          v-model="filters.maker_name"
          placeholder="制单人"
          clearable
          style="width: 120px"
        />
        <el-input
          v-model="filters.auditor_name"
          placeholder="审核人"
          clearable
          style="width: 120px"
        />
      </div>
    </div>

    <div v-if="selectedAccount" class="account-info">
      <span class="label">科目:</span>
      <span class="value">{{ selectedAccount.code }} {{ selectedAccount.name }}</span>
    </div>

    <el-table
      ref="tableRef"
      :data="list"
      stripe
      border
      height="calc(100vh - 240px)"
      show-summary
      :summary-method="getSummaries"
      @header-dragend="onDragEnd"
    >
      <el-table-column prop="voucher_date" label="日期" :width="widths['voucher_date'] || 100" />
      <el-table-column prop="voucher_no" label="凭证号" :width="widths['voucher_no'] || 130" />
      <el-table-column prop="summary" label="摘要" :width="widths['summary'] || 180" />
      <el-table-column label="借方" :width="widths['借方'] || 140" align="right">
        <template #default="{ row }">{{
          row.direction === 'debit' ? formatAmount(row.amount) : ''
        }}</template>
      </el-table-column>
      <el-table-column label="贷方" :width="widths['贷方'] || 140" align="right">
        <template #default="{ row }">{{
          row.direction === 'credit' ? formatAmount(row.amount) : ''
        }}</template>
      </el-table-column>
      <el-table-column label="方向" :width="widths['方向'] || 60" align="center">
        <template #default="{ row }">
          {{ row.running_balance === 0 ? '平' : (row.running_balance > 0 ? (selectedAccount?.direction === 'debit' ? '借' : '贷') : (selectedAccount?.direction === 'debit' ? '贷' : '借')) }}
        </template>
      </el-table-column>
      <el-table-column label="余额" :width="widths['余额'] || 140" align="right">
        <template #default="{ row }">{{ formatAmount(Math.abs(row.running_balance)) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { formatAmount } from '@/utils/format'

const route = useRoute()
const initBalance = ref(0)
const list = ref<any[]>([])
const accounts = ref<any[]>([])
const showAdvancedFilter = ref(false)
const tableRef = ref()

const { widths, onDragEnd } = useColumnWidthMemory('ledger_detail')

const selectedAccount = computed(() => {
  if (!filters.value.account_id) return null
  return accounts.value.find(a => a.id === filters.value.account_id)
})

const filters = ref<any>({
  account_id: '',
  start_date: '',
  end_date: '',
  summary_keyword: '',
  min_amount: '',
  max_amount: '',
  maker_name: '',
  auditor_name: '',
  include_unposted: true,
})

// 监听科目选择变化，自动触发查询
watch(() => filters.value.account_id, (newVal) => {
  if (newVal) {
    fetchData()
  }
})

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param
  const sums: string[] = []

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    if (index === 1 || index === 2) {
      sums[index] = ''
      return
    }

    // 借方
    if (index === 3) {
      const total = data.reduce((sum, row) => sum + (row.direction === 'debit' ? row.amount : 0), 0)
      sums[index] = formatAmount(total)
    }
    // 贷方
    else if (index === 4) {
      const total = data.reduce((sum, row) => sum + (row.direction === 'credit' ? row.amount : 0), 0)
      sums[index] = formatAmount(total)
    }
    // 方向
    else if (index === 5) {
      const lastRow = data[data.length - 1]
      if (lastRow) {
        const balance = lastRow.running_balance
        sums[index] = balance === 0 ? '平' : (balance > 0 ? (selectedAccount.value?.direction === 'debit' ? '借' : '贷') : (selectedAccount.value?.direction === 'debit' ? '贷' : '借'))
      }
    }
    // 余额
    else if (index === 6) {
      const lastRow = data[data.length - 1]
      if (lastRow) {
        sums[index] = formatAmount(Math.abs(lastRow.running_balance))
      }
    }
  })

  return sums
}

async function fetchData() {
  if (!filters.value.account_id) {
    list.value = []
    return
  }

  // 获取选中的科目信息
  const account = selectedAccount.value
  console.log('选中的科目:', account)
  if (!account) {
    list.value = []
    return
  }

  const params: any = {}

  // 判断是否有子科目：检查是否有其他科目的编码以当前科目编码开头且长度更长
  const hasChildren = accounts.value.some((a: any) =>
    a.id !== account.id && a.code.startsWith(account.code) && a.code.length > account.code.length
  )
  console.log('是否有子科目:', hasChildren)
  console.log('科目编码:', account.code)

  if (hasChildren) {
    // 如果有子科目，使用科目编码范围查询
    params.account_code_start = account.code
    params.account_code_end = account.code + '9999'
    console.log('使用范围查询:', params.account_code_start, params.account_code_end)
  } else {
    // 如果没有子科目，使用科目ID查询
    params.account_id = filters.value.account_id
    console.log('使用ID查询:', params.account_id)
  }

  if (filters.value.start_date) params.start_date = filters.value.start_date
  if (filters.value.end_date) params.end_date = filters.value.end_date
  if (filters.value.summary_keyword) params.summary_keyword = filters.value.summary_keyword
  if (filters.value.min_amount) params.min_amount = filters.value.min_amount
  if (filters.value.max_amount) params.max_amount = filters.value.max_amount
  if (filters.value.maker_name) params.maker_name = filters.value.maker_name
  if (filters.value.auditor_name) params.auditor_name = filters.value.auditor_name
  if (filters.value.include_unposted) params.include_unposted = 'true'

  console.log('明细账查询参数:', params)
  const res = await request.get<any>('/ledger/detail', { params })
  console.log('明细账查询结果:', res)
  initBalance.value = (res as any).initBalance || 0
  const entries = res.data || []
  console.log('明细账数据条数:', entries.length)
  console.log('明细账第一条数据:', entries[0])

  // 计算余额 - 根据科目方向
  let balance = initBalance.value
  for (const entry of entries) {
    if (account?.direction === 'debit') {
      // 借方科目: 借方增加，贷方减少
      if (entry.direction === 'debit') {
        balance += entry.amount
      } else {
        balance -= entry.amount
      }
    } else {
      // 贷方科目: 贷方增加，借方减少
      if (entry.direction === 'credit') {
        balance += entry.amount
      } else {
        balance -= entry.amount
      }
    }
    entry.running_balance = balance
  }
  list.value = entries
  console.log('处理后的list.value:', list.value)
}

async function fetchAccounts() {
  const res = await request.get<any[]>('/base/accounts', { params: { is_enabled: 1 } })
  accounts.value = res.data
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')
  const account = selectedAccount.value
  const ws = utils.json_to_sheet(
    list.value.map((v: any) => ({
      日期: v.voucher_date,
      凭证号: v.voucher_no,
      摘要: v.summary,
      借方: v.direction === 'debit' ? v.amount : '',
      贷方: v.direction === 'credit' ? v.amount : '',
      方向: v.running_balance === 0 ? '平' : (v.running_balance > 0 ? (account?.direction === 'debit' ? '借' : '贷') : (account?.direction === 'debit' ? '贷' : '借')),
      余额: Math.abs(v.running_balance),
    }))
  )
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '明细账')
  const accountName = account ? `${account.code}_${account.name}` : '明细账'
  const dateRange = filters.value.start_date && filters.value.end_date
    ? `${filters.value.start_date}_${filters.value.end_date}`
    : new Date().toISOString().split('T')[0]
  writeFile(wb, `${accountName}_${dateRange}.xlsx`)
}

onMounted(async () => {
  await fetchAccounts()

  // 从路由参数获取科目ID和日期范围
  if (route.query.account_id) {
    filters.value.account_id = route.query.account_id as string
  } else {
    // 默认选中 1001 库存现金
    const defaultAccount = accounts.value.find((a: any) => a.code === '1001')
    if (defaultAccount) filters.value.account_id = defaultAccount.id
  }
  if (route.query.start_date) {
    filters.value.start_date = route.query.start_date as string
  }
  if (route.query.end_date) {
    filters.value.end_date = route.query.end_date as string
  }

  // 如果没有日期范围，默认使用当年1月1日到12月31日
  if (!filters.value.start_date || !filters.value.end_date) {
    const currentYear = new Date().getFullYear()
    filters.value.start_date = filters.value.start_date || `${currentYear}-01-01`
    filters.value.end_date = filters.value.end_date || `${currentYear}-12-31`
  }

  if (filters.value.account_id) {
    await fetchData()
  }
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0 0 12px 0;
}
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.account-info {
  padding: 8px 12px;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  margin-bottom: 12px;
  font-weight: 500;
}
.account-info .label {
  color: #606266;
  margin-right: 8px;
}
.account-info .value {
  color: #409eff;
  font-size: 16px;
}
</style>
