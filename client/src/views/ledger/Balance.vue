<template>
  <div class="page">
    <div class="page-header">
      <h3>总分类账</h3>
      <div class="filter-row">
        <el-select v-model="filters.year" style="width: 110px" @change="fetchData">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-input
          v-model="filters.account_code"
          placeholder="科目编码"
          clearable
          style="width: 130px"
          @clear="fetchData"
          @keyup.enter="fetchData"
        />
        <el-select
          v-model="filters.account_level"
          placeholder="科目级次"
          clearable
          style="width: 120px"
          @change="fetchData"
        >
          <el-option label="展开到1级" :value="1" />
          <el-option label="展开到2级" :value="2" />
          <el-option label="展开到3级" :value="3" />
          <el-option label="展开到4级" :value="4" />
        </el-select>
        <el-divider direction="vertical" />
        <el-checkbox v-model="hideNoActivity">隐藏未发生</el-checkbox>
        <el-divider direction="vertical" />
        <el-checkbox v-model="filters.include_unposted" @change="fetchData">
          统计未过账凭证
        </el-checkbox>
        <el-divider direction="vertical" />
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="exportData">导出Excel</el-button>
        <span class="balance-tag" :class="isBalanced ? 'ok' : 'err'">
          {{ isBalanced ? '借贷平衡' : '借贷不平衡' }}
        </span>
      </div>
    </div>

    <el-table
      ref="tableRef"
      :data="filteredList"
      stripe
      border
      height="calc(100vh - 130px)"
      show-summary
      :summary-method="getSummaries"
      :header-cell-style="headerCellStyle"
      style="width: 100%"
    >
      <!-- 固定列 -->
      <el-table-column prop="account_code" label="科目编码" width="120" fixed>
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 16 + 'px' }">
            {{ row.account_code }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="account_name" label="科目名称" width="160" fixed>
        <template #default="{ row }">
          <span
            :style="{
              paddingLeft: (row.level - 1) * 16 + 'px',
              fontWeight: row.level === 1 ? 'bold' : 'normal',
            }"
          >
            {{ row.account_name }}
          </span>
        </template>
      </el-table-column>

      <!-- 期初余额 -->
      <el-table-column label="期初余额" align="center">
        <el-table-column label="借方" width="100" align="right" prop="init_debit">
          <template #default="{ row }">
            {{ row.direction === 'debit' && row.init_balance > 0 ? fmt(row.init_balance) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="贷方" width="100" align="right" prop="init_credit">
          <template #default="{ row }">
            {{ row.direction === 'credit' && row.init_balance > 0 ? fmt(row.init_balance) : '' }}
          </template>
        </el-table-column>
      </el-table-column>

      <!-- 1-12月发生额 -->
      <el-table-column v-for="m in 12" :key="m" :label="m + '月'" align="center">
        <el-table-column label="借方" width="90" align="right" :prop="'month' + m + '_debit'">
          <template #default="{ row }">
            {{ row['month' + m + '_debit'] > 0 ? fmt(row['month' + m + '_debit']) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="贷方" width="90" align="right" :prop="'month' + m + '_credit'">
          <template #default="{ row }">
            {{ row['month' + m + '_credit'] > 0 ? fmt(row['month' + m + '_credit']) : '' }}
          </template>
        </el-table-column>
      </el-table-column>

      <!-- 本年累计 -->
      <el-table-column label="本年累计" align="center">
        <el-table-column label="借方" width="100" align="right" prop="year_debit">
          <template #default="{ row }">
            {{ row.year_debit > 0 ? fmt(row.year_debit) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="贷方" width="100" align="right" prop="year_credit">
          <template #default="{ row }">
            {{ row.year_credit > 0 ? fmt(row.year_credit) : '' }}
          </template>
        </el-table-column>
      </el-table-column>

      <!-- 期末余额 -->
      <el-table-column label="期末余额" align="center">
        <el-table-column label="借方" width="100" align="right" prop="end_debit">
          <template #default="{ row }">
            {{ row.direction === 'debit' && row.end_balance > 0 ? fmt(row.end_balance) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="贷方" width="100" align="right" prop="end_credit">
          <template #default="{ row }">
            {{ row.direction === 'credit' && row.end_balance > 0 ? fmt(row.end_balance) : '' }}
          </template>
        </el-table-column>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'

const tableRef = ref()
const list = ref<any[]>([])
const hideNoActivity = ref(true)
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

const filters = ref<any>({
  year: new Date().getFullYear(),
  account_code: '',
  account_level: null,
  include_unposted: true,
})

// 前端筛选：隐藏未发生的科目（科目编码和级次已由后端筛选）
const filteredList = computed(() => {
  if (!hideNoActivity.value) return list.value
  return list.value.filter(r => {
    // 有期初余额 或 有任何月发生额 或 有期末余额
    if (Math.abs(r.init_balance) > 0.005) return true
    if (Math.abs(r.end_balance) > 0.005) return true
    for (let m = 1; m <= 12; m++) {
      if ((r['month' + m + '_debit'] || 0) > 0.005 || (r['month' + m + '_credit'] || 0) > 0.005)
        return true
    }
    return false
  })
})

const isBalanced = computed(() => {
  const data = filteredList.value
  const t = 0.01
  const initDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const initCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const yearDebit = data.reduce((s, r) => s + (r.year_debit || 0), 0)
  const yearCredit = data.reduce((s, r) => s + (r.year_credit || 0), 0)
  const endDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const endCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  return (
    Math.abs(initDebit - initCredit) < t &&
    Math.abs(yearDebit - yearCredit) < t &&
    Math.abs(endDebit - endCredit) < t
  )
})

function fmt(val: number) {
  if (!val) return ''
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(val))
}

function headerCellStyle({ column, rowIndex, columnIndex }: any) {
  if (rowIndex === 0) {
    return { background: '#e8f0fe', color: '#303133', fontWeight: 'bold', textAlign: 'center' }
  }
  return { background: '#f5f7fa', color: '#606266', fontWeight: 'normal', textAlign: 'center' }
}

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param

  // 基于当前显示的数据动态计算合计
  const calcInitDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const calcInitCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const calcEndDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const calcEndCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const calcYearDebit = data.reduce((s, r) => s + (r.year_debit || 0), 0)
  const calcYearCredit = data.reduce((s, r) => s + (r.year_credit || 0), 0)

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

    const prop = column.property
    if (!prop) {
      sums[index] = ''
      return
    }

    if (prop === 'init_debit') sums[index] = fmt(calcInitDebit)
    else if (prop === 'init_credit') sums[index] = fmt(calcInitCredit)
    else if (prop === 'end_debit') sums[index] = fmt(calcEndDebit)
    else if (prop === 'end_credit') sums[index] = fmt(calcEndCredit)
    else if (prop === 'year_debit') sums[index] = fmt(calcYearDebit)
    else if (prop === 'year_credit') sums[index] = fmt(calcYearCredit)
    else {
      const match = prop.match(/^month(\d+)_(debit|credit)$/)
      if (match) {
        const m = Number(match[1])
        const type = match[2]
        const total = data.reduce((s, r) => s + (r[`month${m}_${type}`] || 0), 0)
        sums[index] = fmt(total)
      } else {
        sums[index] = ''
      }
    }
  })

  return sums
}

async function fetchData() {
  const params: any = { year: filters.value.year }
  if (filters.value.account_code) params.account_code = filters.value.account_code
  if (filters.value.account_level) params.account_level = filters.value.account_level
  if (filters.value.include_unposted) params.include_unposted = 'true'

  const res = await request.get<any>('/ledger/general-ledger', { params })

  list.value = res.data || []
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')

  const headers = ['科目编码', '科目名称', '期初借', '期初贷']
  for (let m = 1; m <= 12; m++) {
    headers.push(m + '月借', m + '月贷')
  }
  headers.push('累计借', '累计贷', '期末借', '期末贷')

  const rows: any[][] = [headers]

  for (const row of filteredList.value) {
    const r: any[] = [
      row.account_code,
      row.account_name,
      row.direction === 'debit' && row.init_balance > 0 ? row.init_balance : '',
      row.direction === 'credit' && row.init_balance > 0 ? row.init_balance : '',
    ]
    for (let m = 1; m <= 12; m++) {
      r.push(row['month' + m + '_debit'] > 0 ? row['month' + m + '_debit'] : '')
      r.push(row['month' + m + '_credit'] > 0 ? row['month' + m + '_credit'] : '')
    }
    r.push(
      row.year_debit > 0 ? row.year_debit : '',
      row.year_credit > 0 ? row.year_credit : '',
      row.direction === 'debit' && row.end_balance > 0 ? row.end_balance : '',
      row.direction === 'credit' && row.end_balance > 0 ? row.end_balance : ''
    )
    rows.push(r)
  }

  // 合计行 - 基于筛选后的数据计算
  const data = filteredList.value
  const calcInitDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const calcInitCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.init_balance > 0 ? r.init_balance : 0),
    0
  )
  const calcEndDebit = data.reduce(
    (s, r) => s + (r.direction === 'debit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const calcEndCredit = data.reduce(
    (s, r) => s + (r.direction === 'credit' && r.end_balance > 0 ? r.end_balance : 0),
    0
  )
  const calcYearDebit = data.reduce((s, r) => s + (r.year_debit || 0), 0)
  const calcYearCredit = data.reduce((s, r) => s + (r.year_credit || 0), 0)

  const sr: any[] = ['合计', '', calcInitDebit || '', calcInitCredit || '']
  for (let m = 1; m <= 12; m++) {
    sr.push(
      data.reduce((s, r) => s + (r[`month${m}_debit`] || 0), 0) || '',
      data.reduce((s, r) => s + (r[`month${m}_credit`] || 0), 0) || ''
    )
  }
  sr.push(calcYearDebit || '', calcYearCredit || '', calcEndDebit || '', calcEndCredit || '')
  rows.push(sr)

  const ws = utils.aoa_to_sheet(rows)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '总分类账')
  writeFile(wb, `总分类账_${filters.value.year}.xlsx`)
}

onMounted(async () => {
  await fetchData()
})
</script>

<style scoped>
.page {
  padding: 16px;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.page-header h3 {
  margin: 0;
}
.filter-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.balance-tag {
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
}
.balance-tag.ok {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #b3e19d;
}
.balance-tag.err {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fbc4c4;
}
</style>
