<template>
  <div class="page">
    <div class="page-header">
      <h3>科目余额表</h3>
      <div class="filter-row">
        <el-date-picker
          v-model="filters.start_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          style="width: 150px"
          @change="fetchData"
        />
        <el-date-picker
          v-model="filters.end_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          style="width: 150px"
          @change="fetchData"
        />
        <el-input
          v-model="filters.account_code"
          placeholder="科目编码"
          clearable
          style="width: 140px"
          @clear="fetchData"
          @keyup.enter="fetchData"
        />
        <el-select v-model="filters.account_level" placeholder="科目级次" clearable style="width: 120px" @change="fetchData">
          <el-option label="展开到1级" :value="1" />
          <el-option label="展开到2级" :value="2" />
          <el-option label="展开到3级" :value="3" />
          <el-option label="展开到4级" :value="4" />
        </el-select>
        <el-divider direction="vertical" />
        <el-checkbox-group v-model="filters.filter_types" size="small" @change="fetchData">
          <el-checkbox value="init_balance">有期初</el-checkbox>
          <el-checkbox value="has_amount">有发生额</el-checkbox>
          <el-checkbox value="has_balance">有余额</el-checkbox>
        </el-checkbox-group>
        <el-divider direction="vertical" />
        <el-checkbox v-model="filters.include_unposted" @change="fetchData">
          统计未过账凭证
        </el-checkbox>
        <el-divider direction="vertical" />
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button :type="hideZero ? 'primary' : 'default'" @click="hideZero = !hideZero">
          {{ hideZero ? '显示0值' : '隐藏0值' }}
        </el-button>
        <el-button @click="exportData">导出Excel</el-button>
      </div>
    </div>

    <el-table
      ref="tableRef"
      :data="list"
      stripe
      border
      height="calc(100vh - 200px)"
      show-summary
      :summary-method="getSummaries"
      @header-dragend="onDragEnd"
      @row-dblclick="handleRowDblClick"
    >
      <el-table-column label="科目编码" :width="widths['account_code'] || 100" fixed>
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 20 + 'px' }">{{ row.account_code }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="account_name" label="科目名称" :width="widths['account_name'] || 150" fixed>
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 20 + 'px' }">{{ row.account_name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="期初余额" align="center">
        <el-table-column label="方向" :width="widths['方向'] || 60" align="center">
          <template #default="{ row }">
            {{
              row.init_balance !== 0
                ? row.init_balance > 0
                  ? row.direction === 'debit'
                    ? '借'
                    : '贷'
                  : row.direction === 'debit'
                    ? '贷'
                    : '借'
                : ''
            }}
          </template>
        </el-table-column>
        <el-table-column label="余额" :width="widths['余额'] || 100" align="right">
          <template #default="{ row }">
            {{ row.init_balance !== 0 ? formatMoney(Math.abs(row.init_balance)) : (hideZero ? '' : formatMoney(0)) }}
          </template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本期发生额" align="center">
        <el-table-column label="借方" :width="widths['借方'] || 120" align="right">
          <template #default="{ row }">{{ row.current_debit && row.current_debit > 0 ? formatMoney(row.current_debit) : (hideZero ? '' : formatMoney(0)) }}</template>
        </el-table-column>
        <el-table-column label="贷方" :width="widths['贷方'] || 120" align="right">
          <template #default="{ row }">{{ row.current_credit && row.current_credit > 0 ? formatMoney(row.current_credit) : (hideZero ? '' : formatMoney(0)) }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本年累计发生额" align="center">
        <el-table-column label="借方" prop="year_debit" :width="widths['year_debit'] || 120" align="right">
          <template #default="{ row }">{{ row.year_debit && row.year_debit > 0 ? formatMoney(row.year_debit) : (hideZero ? '' : formatMoney(0)) }}</template>
        </el-table-column>
        <el-table-column label="贷方" prop="year_credit" :width="widths['year_credit'] || 120" align="right">
          <template #default="{ row }">{{ row.year_credit && row.year_credit > 0 ? formatMoney(row.year_credit) : (hideZero ? '' : formatMoney(0)) }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="期末余额" align="center">
        <el-table-column label="方向" prop="end_direction" :width="widths['end_direction'] || 60" align="center">
          <template #default="{ row }">
            {{
              row.end_balance !== 0
                ? row.end_balance > 0
                  ? row.direction === 'debit'
                    ? '借'
                    : '贷'
                  : row.direction === 'debit'
                    ? '贷'
                    : '借'
                : ''
            }}
          </template>
        </el-table-column>
        <el-table-column label="余额" prop="end_balance" :width="widths['end_balance'] || 100" align="right">
          <template #default="{ row }">
            {{ row.end_balance !== 0 ? formatMoney(Math.abs(row.end_balance)) : (hideZero ? '' : formatMoney(0)) }}
          </template>
        </el-table-column>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'

const router = useRouter()
const tableRef = ref()
const list = ref<any[]>([])
const hideZero = ref(true)

const { widths, onDragEnd } = useColumnWidthMemory('ledger_general')

const year = new Date().getFullYear()

const filters = ref<any>({
  start_date: `${year}-01-01`,
  end_date: `${year}-12-31`,
  account_code: '',
  account_level: null,
  filter_types: ['init_balance', 'has_amount', 'has_balance'],
  include_unposted: true,
})

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param
  const sums: string[] = []

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    if (index === 1) {
      sums[index] = ''
      return
    }

    // 期初余额方向
    if (index === 2) {
      const debitTotal = data.reduce((sum, row) => sum + (row.init_balance > 0 && row.direction === 'debit' ? row.init_balance : 0), 0)
      const creditTotal = data.reduce((sum, row) => sum + (row.init_balance > 0 && row.direction === 'credit' ? row.init_balance : 0), 0)
      const netBalance = debitTotal - creditTotal
      sums[index] = netBalance === 0 ? '平' : netBalance > 0 ? '借' : '贷'
    }
    // 期初余额金额
    else if (index === 3) {
      const debitTotal = data.reduce((sum, row) => sum + (row.init_balance > 0 && row.direction === 'debit' ? row.init_balance : 0), 0)
      const creditTotal = data.reduce((sum, row) => sum + (row.init_balance > 0 && row.direction === 'credit' ? row.init_balance : 0), 0)
      const netBalance = debitTotal - creditTotal
      sums[index] = formatMoney(Math.abs(netBalance))
    }
    // 本期发生额借方
    else if (index === 4) {
      const total = data.reduce((sum, row) => sum + (row.current_debit || 0), 0)
      sums[index] = formatMoney(total)
    }
    // 本期发生额贷方
    else if (index === 5) {
      const total = data.reduce((sum, row) => sum + (row.current_credit || 0), 0)
      sums[index] = formatMoney(total)
    }
    // 本年累计发生额借方
    else if (index === 6) {
      const total = data.reduce((sum, row) => sum + (row.year_debit || 0), 0)
      sums[index] = formatMoney(total)
    }
    // 本年累计发生额贷方
    else if (index === 7) {
      const total = data.reduce((sum, row) => sum + (row.year_credit || 0), 0)
      sums[index] = formatMoney(total)
    }
    // 期末余额方向
    else if (index === 8) {
      const debitTotal = data.reduce((sum, row) => sum + (row.end_balance > 0 && row.direction === 'debit' ? row.end_balance : 0), 0)
      const creditTotal = data.reduce((sum, row) => sum + (row.end_balance > 0 && row.direction === 'credit' ? row.end_balance : 0), 0)
      const netBalance = debitTotal - creditTotal
      sums[index] = netBalance === 0 ? '平' : netBalance > 0 ? '借' : '贷'
    }
    // 期末余额金额
    else if (index === 9) {
      const debitTotal = data.reduce((sum, row) => sum + (row.end_balance > 0 && row.direction === 'debit' ? row.end_balance : 0), 0)
      const creditTotal = data.reduce((sum, row) => sum + (row.end_balance > 0 && row.direction === 'credit' ? row.end_balance : 0), 0)
      const netBalance = debitTotal - creditTotal
      sums[index] = formatMoney(Math.abs(netBalance))
    }
  })

  return sums
}

async function fetchData() {
  const params: any = {}
  if (filters.value.start_date) params.start_date = filters.value.start_date
  if (filters.value.end_date) params.end_date = filters.value.end_date
  if (filters.value.account_code) params.account_code = filters.value.account_code
  if (filters.value.account_level) params.account_level = filters.value.account_level
  // 将数组转为逗号分隔的字符串传递给后端
  if (filters.value.filter_types && filters.value.filter_types.length > 0) {
    params.filter_types = filters.value.filter_types.join(',')
  }
  if (filters.value.include_unposted) params.include_unposted = 'true'

  const res = await request.get<any[]>('/ledger/general', { params })
  list.value = res.data
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')
  const ws = utils.json_to_sheet(
    list.value.map((v: any) => ({
      科目编码: v.account_code,
      科目名称: v.account_name,
      方向: v.direction === 'debit' ? '借' : '贷',
      期初余额方向:
        v.init_balance !== 0
          ? v.init_balance > 0
            ? v.direction === 'debit'
              ? '借'
              : '贷'
            : v.direction === 'debit'
              ? '贷'
              : '借'
          : '',
      期初余额: v.init_balance !== 0 ? Math.abs(v.init_balance) : '',
      本期借方发生额: v.current_debit || 0,
      本期贷方发生额: v.current_credit || 0,
      本年累计借方发生额: v.year_debit || 0,
      本年累计贷方发生额: v.year_credit || 0,
      期末余额方向:
        v.end_balance !== 0
          ? v.end_balance > 0
            ? v.direction === 'debit'
              ? '借'
              : '贷'
            : v.direction === 'debit'
              ? '贷'
              : '借'
          : '',
      期末余额: v.end_balance !== 0 ? Math.abs(v.end_balance) : '',
    }))
  )
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '总账')
  const dateRange = filters.value.start_date && filters.value.end_date
    ? `${filters.value.start_date}_${filters.value.end_date}`
    : new Date().toISOString().split('T')[0]
  writeFile(wb, `总账_${dateRange}.xlsx`)
}

function handleRowDblClick(row: any) {
  // 双击行跳转到明细账页面
  const query: any = {}
  if (row.account_id) query.account_id = row.account_id

  // 传递当前的日期范围（如果有的话）
  if (filters.value.start_date) query.start_date = filters.value.start_date
  if (filters.value.end_date) query.end_date = filters.value.end_date

  router.push({
    path: '/ledger/detail',
    query
  })
}

onMounted(() => {
  fetchData()
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
</style>
