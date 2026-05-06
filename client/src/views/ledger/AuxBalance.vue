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
          <el-option-group
            v-for="cat in selectedCategoryItems"
            :key="cat.id"
            :label="cat.name"
          >
            <el-option
              v-for="item in cat.items"
              :key="item.id"
              :label="`${item.code} ${item.name}`"
              :value="item.id"
            />
          </el-option-group>
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
        <el-checkbox v-model="filters.include_unposted" style="margin-left: 12px">
          统计未记账凭证
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
      @row-dblclick="handleRowDblClick"
    >
      <!-- 动态辅助类别列：每个类别生成「类别名 + 项目名称」 -->
      <template v-for="cat in activeCategoryColumns" :key="cat.code">
        <el-table-column :label="cat.name" min-width="140">
          <template #default="{ row }">
            {{ row.category_code === cat.code ? row.aux_name : '' }}
          </template>
        </el-table-column>
      </template>

      <!-- 固定余额列 -->
      <el-table-column label="期初余额" align="center">
        <el-table-column label="方向" width="60" align="center">
          <template #default="{ row }">
            {{ row.init_balance === 0 ? '' : (row.init_balance > 0 ? '借' : '贷') }}
          </template>
        </el-table-column>
        <el-table-column label="余额" width="130" align="right">
          <template #default="{ row }">{{ formatAmount(Math.abs(row.init_balance)) }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本期发生额" align="center">
        <el-table-column label="借方" width="130" align="right">
          <template #default="{ row }">{{ formatAmount(row.current_debit) }}</template>
        </el-table-column>
        <el-table-column label="贷方" width="130" align="right">
          <template #default="{ row }">{{ formatAmount(row.current_credit) }}</template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="期末余额" align="center">
        <el-table-column label="方向" width="60" align="center">
          <template #default="{ row }">
            {{ row.end_balance === 0 ? '' : (row.end_balance > 0 ? '借' : '贷') }}
          </template>
        </el-table-column>
        <el-table-column label="余额" width="130" align="right">
          <template #default="{ row }">{{ formatAmount(Math.abs(row.end_balance)) }}</template>
        </el-table-column>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { formatAmount } from '@/utils/format'

const router = useRouter()
const tableRef = ref()
const list = ref<any[]>([])
const auxCategories = ref<any[]>([])
// { [categoryId]: AuxItem[] }
const auxItemsMap = ref<Record<string, any[]>>({})
// categoryFields 来自后端：{ [category_code]: { name, fields: [{field_key, field_name}] } }
const categoryFields = ref<Record<string, { name: string; fields: { field_key: string; field_name: string }[] }>>({})

const year = new Date().getFullYear()

const filters = ref<any>({
  aux_category_ids: [],
  aux_ids: [],
  start_date: `${year}-01-01`,
  end_date: `${year}-12-31`,
  account_code: '',
  include_unposted: true,
})

// 按类别分组的项目列表，用于下拉分组显示
const selectedCategoryItems = computed(() => {
  return filters.value.aux_category_ids.map((catId: string) => {
    const cat = auxCategories.value.find(c => c.id === catId)
    return {
      id: catId,
      name: cat ? `${cat.code} ${cat.name}` : catId,
      items: auxItemsMap.value[catId] || [],
    }
  })
})

// 当前查询结果中实际出现的类别，按选择顺序排列，用于动态列
const activeCategoryColumns = computed(() => {
  // 按用户选择的类别顺序排列
  const selectedCatIds = filters.value.aux_category_ids as string[]
  const result: { code: string; name: string }[] = []
  for (const catId of selectedCatIds) {
    const cat = auxCategories.value.find(c => c.id === catId)
    if (!cat) continue
    result.push({
      code: cat.code,
      name: cat.name,
    })
  }
  return result
})

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param
  const sums: string[] = columns.map((col, index) => {
    if (index === 0) return '合计'
    const prop = col.property
    if (prop === 'init_balance_dir') {
      const total = data.reduce((s, r) => s + r.init_balance, 0)
      return total === 0 ? '' : total > 0 ? '借' : '贷'
    }
    if (prop === 'init_balance') {
      return formatAmount(Math.abs(data.reduce((s, r) => s + r.init_balance, 0)))
    }
    if (prop === 'current_debit') {
      return formatAmount(data.reduce((s, r) => s + (r.current_debit || 0), 0))
    }
    if (prop === 'current_credit') {
      return formatAmount(data.reduce((s, r) => s + (r.current_credit || 0), 0))
    }
    if (prop === 'end_balance_dir') {
      const total = data.reduce((s, r) => s + r.end_balance, 0)
      return total === 0 ? '' : total > 0 ? '借' : '贷'
    }
    if (prop === 'end_balance') {
      return formatAmount(Math.abs(data.reduce((s, r) => s + r.end_balance, 0)))
    }
    return ''
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
    auxItemsMap.value = {}
    return
  }
  try {
    for (const categoryId of filters.value.aux_category_ids) {
      if (auxItemsMap.value[categoryId]) continue
      const res = await request.get<any[]>('/base/aux-items', { params: { category_id: categoryId } })
      auxItemsMap.value[categoryId] = res.data || []
    }
  } catch (error) {
    console.error('加载辅助项目失败:', error)
  }
}

async function fetchData() {
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) return

  try {
    const params: any = {
      aux_category_ids: filters.value.aux_category_ids.join(','),
    }
    // aux_ids 可选：不传时后端查类别下所有项目
    if (filters.value.aux_ids && filters.value.aux_ids.length > 0) {
      params.aux_ids = filters.value.aux_ids.join(',')
    }
    if (filters.value.start_date) params.start_date = filters.value.start_date
    if (filters.value.end_date) params.end_date = filters.value.end_date
    if (filters.value.account_code) params.account_code = filters.value.account_code
    if (filters.value.include_unposted) params.include_unposted = 'true'

    const res = await request.get<any>('/ledger/aux-balance', { params })
    list.value = res.data || []
    if (res.categoryFields) {
      categoryFields.value = res.categoryFields
    }
  } catch (error) {
    console.error('查询辅助项目余额表失败:', error)
  }
}

async function exportData() {
  const { utils, writeFile } = await import('xlsx')

  // 收集所有自定义字段（按类别顺序）
  const customFields: { key: string; name: string }[] = []
  for (const catCode of Object.keys(categoryFields.value)) {
    const cat = categoryFields.value[catCode]
    for (const f of cat.fields || []) {
      customFields.push({ key: f.field_key, name: f.field_name })
    }
  }

  const rows = list.value.map((v: any) => {
    const row: Record<string, any> = {
      辅助类别: v.category_name,
      项目编码: v.aux_code,
      项目名称: v.aux_name,
    }
    // 插入自定义字段列
    for (const f of customFields) {
      row[f.name] = v.field_values?.[f.key] ?? ''
    }
    row['期初余额方向'] = v.init_balance === 0 ? '' : v.init_balance > 0 ? '借' : '贷'
    row['期初余额'] = Math.abs(v.init_balance)
    row['本期借方'] = v.current_debit || 0
    row['本期贷方'] = v.current_credit || 0
    row['期末余额方向'] = v.end_balance === 0 ? '' : v.end_balance > 0 ? '借' : '贷'
    row['期末余额'] = Math.abs(v.end_balance)
    return row
  })
  const ws = utils.json_to_sheet(rows)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '辅助项目余额表')
  const dateRange = filters.value.start_date && filters.value.end_date
    ? `${filters.value.start_date}_${filters.value.end_date}`
    : new Date().toISOString().split('T')[0]
  writeFile(wb, `辅助项目余额表_${dateRange}.xlsx`)
}

function handleRowDblClick(row: any) {
  const query: any = {
    aux_category_ids: filters.value.aux_category_ids.join(','),
    aux_ids: row.aux_id,
  }
  if (filters.value.start_date) query.start_date = filters.value.start_date
  if (filters.value.end_date) query.end_date = filters.value.end_date
  router.push({ path: '/ledger/aux-detail', query })
}

async function onAuxCategoryChange() {
  filters.value.aux_ids = []
  list.value = []
  categoryFields.value = {}
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) return
  await fetchAuxItems()
  // 自动全选所有项目
  const allIds: string[] = []
  for (const catId of filters.value.aux_category_ids) {
    const items = auxItemsMap.value[catId] || []
    for (const item of items) {
      allIds.push(item.id)
    }
  }
  filters.value.aux_ids = allIds
  // 自动查询
  fetchData()
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
