<template>
  <div class="page">
    <div class="page-header">
      <h3>辅助项目余额表</h3>
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
        <el-input
          v-model="filters.account_code"
          placeholder="科目编码"
          clearable
          style="width: 140px"
        />
        <el-checkbox v-model="filters.include_unposted" @change="fetchData" style="margin-left: 12px">
          统计未过账凭证
        </el-checkbox>
        <el-button type="primary" @click="fetchData">查询</el-button>
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
      <el-table-column prop="category_name" label="辅助类别" :width="widths['category_name'] || 120" />
      <el-table-column prop="aux_code" label="项目编码" :width="widths['aux_code'] || 120" />
      <el-table-column prop="aux_name" label="项目名称" :width="widths['aux_name'] || 180" />
      <el-table-column label="期初余额" align="center">
        <el-table-column label="方向" :width="widths['init_direction'] || 60" align="center">
          <template #default="{ row }">
            {{ row.init_balance === 0 ? '' : (row.init_balance > 0 ? '借' : '贷') }}
          </template>
        </el-table-column>
        <el-table-column label="余额" :width="widths['init_balance'] || 120" align="right">
          <template #default="{ row }">
            {{ formatMoney(Math.abs(row.init_balance)) }}
          </template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本期发生额" align="center">
        <el-table-column label="借方" :width="widths['current_debit'] || 120" align="right">
          <template #default="{ row }">{{ formatMoney(row.current_debit) }}</template>
        </el-table-column>
        <el-table-column label="贷方" :width="widths['current_credit'] || 120" align="right">
          <template #default="{ row }">{{ formatMoney(row.current_credit) }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="期末余额" align="center">
        <el-table-column label="方向" :width="widths['end_direction'] || 60" align="center">
          <template #default="{ row }">
            {{ row.end_balance === 0 ? '' : (row.end_balance > 0 ? '借' : '贷') }}
          </template>
        </el-table-column>
        <el-table-column label="余额" :width="widths['end_balance'] || 120" align="right">
          <template #default="{ row }">
            {{ formatMoney(Math.abs(row.end_balance)) }}
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
const auxCategories = ref<any[]>([])
const auxItems = ref<any[]>([])

const { widths, onDragEnd } = useColumnWidthMemory('ledger_aux_balance')

const year = new Date().getFullYear()

const filters = ref<any>({
  aux_category_ids: [],
  aux_ids: [],
  start_date: `${year}-01-01`,
  end_date: `${year}-12-31`,
  account_code: '',
  include_unposted: true,
})

const auxTypeNames: Record<string, string> = {
  dept: '部门',
  project: '项目',
  supplier: '往来单位',
  person: '人员',
  func_class: '功能分类',
}

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
    if (index <= 2) {
      sums[index] = ''
      return
    }

    // 期初余额方向
    if (index === 3) {
      const total = data.reduce((sum, row) => sum + row.init_balance, 0)
      sums[index] = total === 0 ? '' : (total > 0 ? '借' : '贷')
    }
    // 期初余额金额
    else if (index === 4) {
      const total = data.reduce((sum, row) => sum + row.init_balance, 0)
      sums[index] = formatMoney(Math.abs(total))
    }
    // 本期借方发生额
    else if (index === 5) {
      const total = data.reduce((sum, row) => sum + (row.current_debit || 0), 0)
      sums[index] = formatMoney(total)
    }
    // 本期贷方发生额
    else if (index === 6) {
      const total = data.reduce((sum, row) => sum + (row.current_credit || 0), 0)
      sums[index] = formatMoney(total)
    }
    // 期末余额方向
    else if (index === 7) {
      const total = data.reduce((sum, row) => sum + row.end_balance, 0)
      sums[index] = total === 0 ? '' : (total > 0 ? '借' : '贷')
    }
    // 期末余额金额
    else if (index === 8) {
      const total = data.reduce((sum, row) => sum + row.end_balance, 0)
      sums[index] = formatMoney(Math.abs(total))
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
    if (filters.value.include_unposted) params.include_unposted = 'true'

    const res = await request.get<any[]>('/ledger/aux-balance', { params })
    list.value = res.data || []
  } catch (error) {
    console.error('查询辅助项目余额表失败:', error)
  }
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')
  const ws = utils.json_to_sheet(
    list.value.map((v: any) => ({
      辅助类别: v.category_name,
      项目编码: v.aux_code,
      项目名称: v.aux_name,
      期初余额方向: v.init_balance === 0 ? '' : (v.init_balance > 0 ? '借' : '贷'),
      期初余额: Math.abs(v.init_balance),
      本期借方发生额: v.current_debit || 0,
      本期贷方发生额: v.current_credit || 0,
      期末余额方向: v.end_balance === 0 ? '' : (v.end_balance > 0 ? '借' : '贷'),
      期末余额: Math.abs(v.end_balance),
    }))
  )
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '辅助项目余额表')
  const dateRange = filters.value.start_date && filters.value.end_date
    ? `${filters.value.start_date}_${filters.value.end_date}`
    : new Date().toISOString().split('T')[0]
  writeFile(wb, `辅助项目余额表_${dateRange}.xlsx`)
}

function handleRowDblClick(row: any) {
  // 双击行跳转到辅助项目明细账
  const query: any = {
    aux_category_ids: filters.value.aux_category_ids.join(','),
    aux_ids: row.aux_id,
  }

  if (filters.value.start_date) query.start_date = filters.value.start_date
  if (filters.value.end_date) query.end_date = filters.value.end_date

  router.push({
    path: '/ledger/aux-detail',
    query,
  })
}

function onAuxCategoryChange() {
  // 切换辅助类别时清空已选项目
  filters.value.aux_ids = []
  list.value = []
  fetchAuxItems()
}

onMounted(async () => {
  await fetchAuxCategories()
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
  flex-wrap: wrap;
}
</style>
