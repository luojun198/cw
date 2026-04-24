<template>
  <div class="page">
    <div class="page-header">
      <h3>辅助项目明细账</h3>
      <div class="filter-row">
        <el-select
          v-model="filters.aux_category_ids"
          multiple
          filterable
          clearable
          placeholder="选择辅助类别（可多选）"
          style="width: 300px"
          @change="onAuxCategoryChange"
        >
          <el-option
            v-for="cat in auxCategories"
            :key="cat.id"
            :label="`${cat.code} ${cat.name}`"
            :value="cat.id"
          />
        </el-select>
        <el-select
          v-model="filters.aux_ids"
          multiple
          filterable
          clearable
          placeholder="选择项目（可多选）"
          style="width: 300px"
          :disabled="!filters.aux_category_ids || filters.aux_category_ids.length === 0"
        >
          <el-option
            v-for="item in auxItems"
            :key="item.id"
            :label="`${item.code} ${item.name}`"
            :value="item.id"
          />
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
        <el-checkbox v-model="filters.include_unposted" @change="fetchData" style="margin-left: 12px">
          统计未过账凭证
        </el-checkbox>
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button @click="toggleAdvanced">
          {{ showAdvanced ? '收起' : '高级筛选' }}
        </el-button>
        <el-button @click="exportData">导出Excel</el-button>
      </div>
      <div v-if="showAdvanced" class="filter-row" style="margin-top: 8px">
        <el-input
          v-model="filters.account_code"
          placeholder="科目编码"
          clearable
          style="width: 140px"
        />
        <el-input
          v-model="filters.summary_keyword"
          placeholder="摘要关键词"
          clearable
          style="width: 160px"
        />
        <el-input
          v-model="filters.min_amount"
          placeholder="最小金额"
          clearable
          style="width: 120px"
        />
        <el-input
          v-model="filters.max_amount"
          placeholder="最大金额"
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

    <el-table
      ref="tableRef"
      :data="list"
      stripe
      border
      height="calc(100vh - 200px)"
      show-summary
      :summary-method="getSummaries"
      @header-dragend="onDragEnd"
    >
      <el-table-column prop="category_name" label="辅助类别" :width="widths['category_name'] || 120" />
      <el-table-column prop="aux_name" label="辅助项目" :width="widths['aux_name'] || 140" />
      <el-table-column prop="voucher_date" label="日期" :width="widths['voucher_date'] || 100" />
      <el-table-column prop="voucher_no" label="凭证号" :width="widths['voucher_no'] || 130" />
      <el-table-column prop="account_code" label="科目编码" :width="widths['account_code'] || 100" />
      <el-table-column prop="account_name" label="科目名称" :width="widths['account_name'] || 160" />
      <el-table-column prop="summary" label="摘要" :width="widths['summary'] || 180" />
      <el-table-column label="借方" :width="widths['借方'] || 120" align="right">
        <template #default="{ row }">
          <span v-if="row.direction === 'debit'">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="贷方" :width="widths['贷方'] || 120" align="right">
        <template #default="{ row }">
          <span v-if="row.direction === 'credit'">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="余额" :width="widths['余额'] || 120" align="right">
        <template #default="{ row }">
          {{ formatMoney(row.running_balance) }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'

const route = useRoute()
const tableRef = ref()
const list = ref<any[]>([])
const auxCategories = ref<any[]>([])
const auxItems = ref<any[]>([])
const showAdvanced = ref(false)

const { widths, onDragEnd } = useColumnWidthMemory('ledger_aux_detail')

const year = new Date().getFullYear()

const filters = ref<any>({
  aux_category_ids: [],
  aux_ids: [],
  start_date: `${year}-01-01`,
  end_date: `${year}-12-31`,
  account_code: '',
  summary_keyword: '',
  min_amount: '',
  max_amount: '',
  maker_name: '',
  auditor_name: '',
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
    if (index < 7) {
      sums[index] = ''
      return
    }

    // 借方合计
    if (index === 7) {
      const total = data.reduce((sum, row) => {
        return sum + (row.direction === 'debit' ? row.amount : 0)
      }, 0)
      sums[index] = formatMoney(total)
    }
    // 贷方合计
    else if (index === 8) {
      const total = data.reduce((sum, row) => {
        return sum + (row.direction === 'credit' ? row.amount : 0)
      }, 0)
      sums[index] = formatMoney(total)
    }
    // 余额（显示最后一行的余额）
    else if (index === 9) {
      if (data.length > 0) {
        sums[index] = formatMoney(data[data.length - 1].running_balance)
      } else {
        sums[index] = formatMoney(0)
      }
    }
  })

  return sums
}

async function fetchAuxCategories() {
  try {
    const res = await request.get<any[]>('/base/aux-categories')
    auxCategories.value = res.data || []
  } catch (error) {
    console.error('加载辅助类别失败:', error)
  }
}

async function fetchAuxItems() {
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) {
    auxItems.value = []
    return
  }

  try {
    // 获取所有选中类别的辅助项目
    const allItems: any[] = []
    for (const categoryId of filters.value.aux_category_ids) {
      const res = await request.get<any[]>('/base/aux-items', {
        params: { category_id: categoryId },
      })
      if (res.data) {
        allItems.push(...res.data)
      }
    }
    auxItems.value = allItems
  } catch (error) {
    console.error('加载辅助项目失败:', error)
  }
}

async function fetchData() {
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) {
    return
  }

  if (!filters.value.aux_ids || filters.value.aux_ids.length === 0) {
    list.value = []
    return
  }

  try {
    const params: any = {
      aux_category_ids: filters.value.aux_category_ids.join(','),
      aux_ids: filters.value.aux_ids.join(','),
    }

    if (filters.value.start_date) params.start_date = filters.value.start_date
    if (filters.value.end_date) params.end_date = filters.value.end_date
    if (filters.value.account_code) params.account_code = filters.value.account_code
    if (filters.value.summary_keyword) params.summary_keyword = filters.value.summary_keyword
    if (filters.value.min_amount) params.min_amount = filters.value.min_amount
    if (filters.value.max_amount) params.max_amount = filters.value.max_amount
    if (filters.value.maker_name) params.maker_name = filters.value.maker_name
    if (filters.value.auditor_name) params.auditor_name = filters.value.auditor_name
    if (filters.value.include_unposted) params.include_unposted = 'true'

    const res = await request.get<any>('/ledger/aux-detail', { params })
    const entries = res.data || []
    const initBalance = res.initBalance || 0

    // 计算运行余额
    let balance = initBalance
    for (const entry of entries) {
      if (entry.direction === 'debit') {
        balance += entry.amount
      } else {
        balance -= entry.amount
      }
      entry.running_balance = balance
    }

    list.value = entries
  } catch (error) {
    console.error('查询辅助项目明细账失败:', error)
  }
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')
  const ws = utils.json_to_sheet(
    list.value.map((v: any) => ({
      辅助类别: v.category_name,
      辅助项目: v.aux_name,
      日期: v.voucher_date,
      凭证号: v.voucher_no,
      科目编码: v.account_code,
      科目名称: v.account_name,
      摘要: v.summary,
      借方: v.direction === 'debit' ? v.amount : 0,
      贷方: v.direction === 'credit' ? v.amount : 0,
      余额: v.running_balance,
    }))
  )
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '辅助项目明细账')
  const dateRange = filters.value.start_date && filters.value.end_date
    ? `${filters.value.start_date}_${filters.value.end_date}`
    : new Date().toISOString().split('T')[0]
  writeFile(wb, `辅助项目明细账_${dateRange}.xlsx`)
}

function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
}

function onAuxCategoryChange() {
  // 切换辅助类别时清空已选项目
  filters.value.aux_ids = []
  list.value = []
  fetchAuxItems()
}

// 从路由参数初始化筛选条件
function applyRouteFilters() {
  if (route.query.aux_category_ids) {
    const ids = route.query.aux_category_ids as string
    filters.value.aux_category_ids = ids.split(',')
  }
  if (route.query.aux_ids) {
    const ids = route.query.aux_ids as string
    filters.value.aux_ids = ids.split(',')
  }
  if (route.query.start_date) {
    filters.value.start_date = route.query.start_date as string
  }
  if (route.query.end_date) {
    filters.value.end_date = route.query.end_date as string
  }
}

onMounted(async () => {
  await fetchAuxCategories()
  applyRouteFilters()
  await fetchAuxItems()
  if (filters.value.aux_ids.length > 0) {
    fetchData()
  }
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-direction: column;
  gap: 8px;
}
.page-header h3 {
  margin: 0;
}
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
