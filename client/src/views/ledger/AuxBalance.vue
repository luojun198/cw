<template>
  <div class="page page-ledger page-ledger-aux">
    <div class="page-header">
      <div class="header-left">
        <h3>辅助项目余额表</h3>
        <div class="filter-summary" @click="drawerVisible = true">
          <el-icon><Filter /></el-icon>
          <span v-if="hasActiveFilters" class="summary-text">
            {{ filterSummaryText }}
          </span>
          <span v-else class="placeholder">点击设置筛选条件</span>
        </div>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="drawerVisible = true">
          <el-icon><Filter /></el-icon>
          筛选
        </el-button>

        <el-divider direction="vertical" />

        <el-button plain :loading="loadingAll" @click="handleLoadAll">
          全部加载
        </el-button>

        <el-button plain @click="exportData">
          <el-icon><Download /></el-icon>
          导出 Excel
        </el-button>
      </div>
    </div>

    <!-- 筛选抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      title="筛选条件"
      direction="rtl"
      size="480px"
      :close-on-click-modal="false"
    >
      <div class="drawer-content">
        <div class="filter-item">
          <label>辅助类别</label>
          <el-select
            v-model="filters.aux_category_ids"
            multiple
            filterable
            clearable
            placeholder="选择辅助类别（可多选）"
            style="width: 100%"
            @change="onAuxCategoryChange"
          >
            <el-option
              v-for="cat in auxCategories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </div>

        <div class="filter-item">
          <label>辅助项目</label>
          <el-input
            v-if="allAuxItems.length > 0"
            v-model="auxItemSearchKeyword"
            placeholder="快速检索项目（编码/名称）"
            clearable
            style="margin-bottom: 8px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <div class="checkbox-list" v-if="allAuxItems.length > 0">
            <template v-for="cat in filteredCategoryItems" :key="cat.id">
              <div class="category-group" v-if="cat.items.length > 0">
                <div class="category-header">
                  <div class="category-label">{{ cat.name }}</div>
                  <div class="category-actions">
                    <el-button link size="small" @click="selectCategoryItems(cat.id)">全选</el-button>
                    <el-button link size="small" @click="invertCategorySelection(cat.id)">反选</el-button>
                    <el-button link size="small" @click="clearCategorySelection(cat.id)">清空</el-button>
                  </div>
                </div>
                <div class="category-items">
                  <el-checkbox
                    v-for="item in cat.items"
                    :key="item.id"
                    :label="item.id"
                    v-model="itemCheckMap[item.id]"
                    @change="onItemCheckChange"
                  >
                    {{ item.code }} {{ item.name }}
                  </el-checkbox>
                </div>
              </div>
            </template>
          </div>
          <div v-else class="empty-hint">
            {{ filters.aux_category_ids && filters.aux_category_ids.length > 0 ? '该类别下暂无项目' : '请先选择辅助类别' }}
          </div>
        </div>

        <div class="filter-item">
          <label>日期范围</label>
          <div class="date-range">
            <el-date-picker
              v-model="filters.start_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="开始日期"
              style="width: 48%"
            />
            <span class="date-separator">至</span>
            <el-date-picker
              v-model="filters.end_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="结束日期"
              style="width: 48%"
            />
          </div>
        </div>

        <div class="filter-item">
          <label>科目编码</label>
          <el-input
            v-model="filters.account_code"
            placeholder="科目编码"
            clearable
          />
        </div>

        <div class="filter-item">
          <el-checkbox v-model="filters.include_unposted">
            统计未记账凭证
          </el-checkbox>
        </div>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" @click="handleQuery">查询</el-button>
        </div>
      </template>
    </el-drawer>

    <div class="table-summary-scroll table-summary-scroll--wide">
    <el-table
      :key="auxTableColumnKey"
      ref="tableRef"
      :data="list"
      :style="{ width: `${auxTableWidth}px` }"
      :fit="false"
      stripe
      border
      size="small"
      class="compact-data-table"
      highlight-current-row
      show-summary
      :summary-method="getSummaries"
      :row-class-name="getRowClassName"
      @header-dragend="onDragEnd"
      @row-dblclick="handleRowDblClick"
    >
      <!-- 科目编码列 -->
      <el-table-column
        column-key="account_code"
        prop="account_code"
        label="科目编码"
        :width="colWidth('account_code', 140)"
        fixed
      >
        <template #default="{ row }">
          <span :style="{
            paddingLeft: (row.level - 1) * 16 + 'px',
            fontWeight: row.is_summary ? 'bold' : 'normal'
          }">
            {{ row.account_code }}
          </span>
        </template>
      </el-table-column>

      <!-- 科目名称列 -->
      <el-table-column
        column-key="account_name"
        prop="account_name"
        label="科目名称"
        :width="colWidth('account_name', 150)"
        fixed
      >
        <template #default="{ row }">
          <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
            {{ row.account_name }}
          </span>
        </template>
      </el-table-column>

      <!-- 动态辅助类别列：只在明细行显示 -->
      <template v-for="cat in activeCategoryColumns" :key="cat.code">
        <el-table-column
          :column-key="cat.code"
          :label="cat.name"
          :width="colWidth(cat.code, 140)"
        >
          <template #default="{ row }">
            <span v-if="!row.is_summary && row.category_code === cat.code">
              {{ row.aux_name }}
            </span>
          </template>
        </el-table-column>
      </template>

      <!-- 固定余额列 -->
      <el-table-column label="期初余额" align="center">
        <el-table-column
          column-key="init_direction"
          label="方向"
          :width="colWidth('init_direction', 60)"
          align="center"
        >
          <template #default="{ row }">
            <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
              {{ row.init_balance === 0 ? '' : (row.init_balance > 0 ? '借' : '贷') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          column-key="init_balance"
          prop="init_balance"
          label="余额"
          :width="colWidth('init_balance', 130)"
          align="right"
        >
          <template #default="{ row }">
            <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
              {{ formatAmount(Math.abs(row.init_balance)) }}
            </span>
          </template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="本期发生额" align="center">
        <el-table-column
          column-key="current_debit"
          prop="current_debit"
          label="借方"
          :width="colWidth('current_debit', 130)"
          align="right"
        >
          <template #default="{ row }">
            <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
              {{ formatAmount(row.current_debit) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          column-key="current_credit"
          prop="current_credit"
          label="贷方"
          :width="colWidth('current_credit', 130)"
          align="right"
        >
          <template #default="{ row }">
            <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
              {{ formatAmount(row.current_credit) }}
            </span>
          </template>
        </el-table-column>
      </el-table-column>
      <el-table-column label="期末余额" align="center">
        <el-table-column
          column-key="end_direction"
          label="方向"
          :width="colWidth('end_direction', 60)"
          align="center"
        >
          <template #default="{ row }">
            <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
              {{ row.end_balance === 0 ? '' : (row.end_balance > 0 ? '借' : '贷') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          column-key="end_balance"
          prop="end_balance"
          label="余额"
          :width="colWidth('end_balance', 130)"
          align="right"
        >
          <template #default="{ row }">
            <span :style="{ fontWeight: row.is_summary ? 'bold' : 'normal' }">
              {{ formatAmount(Math.abs(row.end_balance)) }}
            </span>
          </template>
        </el-table-column>
      </el-table-column>
    </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Filter, Search, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { formatAmount } from '@/utils/format'
import { useConfirm } from '@/composables/useConfirm'
import { filterAuxCategoriesForAccount } from '@/utils/accountCashFlow'
import { useAuxColumnWidth, sumColWidths, syncAuxTableBodyWidth } from '@/composables/useColumnWidthMemory'
import { exportStyledTable, type ExportColumnDef } from '@/utils/exportStyledExcel'
import { formatSignedBalanceAmount } from '@/utils/exportLedgerHelpers'

const router = useRouter()
const { tableRef, onDragEnd, colWidth } = useAuxColumnWidth('ledger_aux_balance')
const list = ref<any[]>([])
const auxCategories = ref<any[]>([])
const drawerVisible = ref(false)
const itemCheckMap = ref<Record<string, boolean>>({})
// { [categoryId]: AuxItem[] }
const auxItemsMap = ref<Record<string, any[]>>({})
// categoryFields 来自后端：{ [category_code]: { name, fields: [{field_key, field_name}] } }
const categoryFields = ref<Record<string, { name: string; fields: { field_key: string; field_name: string }[] }>>({})
// 辅助项目搜索关键词
const auxItemSearchKeyword = ref('')
const loadingAll = ref(false)

const year = new Date().getFullYear()

const filters = ref<any>({
  aux_category_ids: [],
  aux_ids: [],
  start_date: `${year}-01-01`,
  end_date: `${year}-12-31`,
  account_code: '',
  include_unposted: true,
})

// 是否有激活的筛选条件
const hasActiveFilters = computed(() => {
  return (
    (filters.value.aux_category_ids && filters.value.aux_category_ids.length > 0) ||
    (filters.value.aux_ids && filters.value.aux_ids.length > 0) ||
    filters.value.account_code
  )
})

// 筛选摘要文本
const filterSummaryText = computed(() => {
  const parts: string[] = []

  // 类别和项目
  if (filters.value.aux_category_ids && filters.value.aux_category_ids.length > 0) {
    const catNames = filters.value.aux_category_ids
      .map((id: string) => {
        const cat = auxCategories.value.find(c => c.id === id)
        return cat ? cat.name : ''
      })
      .filter(Boolean)

    if (catNames.length > 0) {
      parts.push(`${catNames.slice(0, 2).join('、')}${catNames.length > 2 ? ` +${catNames.length - 2}` : ''}`)
    }
  }

  if (filters.value.aux_ids && filters.value.aux_ids.length > 0) {
    parts.push(`${filters.value.aux_ids.length} 个项目`)
  }

  // 日期范围
  if (filters.value.start_date && filters.value.end_date) {
    parts.push(`${filters.value.start_date} 至 ${filters.value.end_date}`)
  }

  return parts.join(' | ')
})

// 所有项目的扁平列表
const allAuxItems = computed(() => {
  const items: any[] = []
  for (const catId of filters.value.aux_category_ids) {
    const catItems = auxItemsMap.value[catId] || []
    items.push(...catItems)
  }
  return items
})

// 按类别分组的项目列表，用于下拉分组显示
const selectedCategoryItems = computed(() => {
  return filters.value.aux_category_ids.map((catId: string) => {
    const cat = auxCategories.value.find(c => c.id === catId)
    return {
      id: catId,
      name: cat ? cat.name : catId,
      items: auxItemsMap.value[catId] || [],
    }
  })
})

// 根据搜索关键词过滤的项目列表
const filteredCategoryItems = computed(() => {
  const keyword = auxItemSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return selectedCategoryItems.value
  }

  return selectedCategoryItems.value.map((cat: any) => ({
    ...cat,
    items: cat.items.filter((item: any) => {
      const code = (item.code || '').toLowerCase()
      const name = (item.name || '').toLowerCase()
      return code.includes(keyword) || name.includes(keyword)
    })
  }))
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

/** 动态辅助列变化时重建表格，替代反复 doLayout */
const auxTableColumnKey = computed(() =>
  activeCategoryColumns.value.map(c => c.code).join('|') || 'none'
)

/** 列宽合计（fit=false 不含 gutter，外框与最后一列对齐） */
const auxTableWidth = computed(() => {
  const defs: Array<{ key: string; fallback: number }> = [
    { key: 'account_code', fallback: 140 },
    { key: 'account_name', fallback: 150 },
  ]
  for (const cat of activeCategoryColumns.value) {
    defs.push({ key: cat.code, fallback: 140 })
  }
  defs.push(
    { key: 'init_direction', fallback: 60 },
    { key: 'init_balance', fallback: 130 },
    { key: 'current_debit', fallback: 130 },
    { key: 'current_credit', fallback: 130 },
    { key: 'end_direction', fallback: 60 },
    { key: 'end_balance', fallback: 130 }
  )
  return sumColWidths(colWidth, defs, { includeGutter: false })
})

watch(auxTableWidth, w => syncAuxTableBodyWidth(tableRef, w))

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param

  // 只对汇总行求和（避免重复计算）
  const summaryRows = data.filter((row: any) => row.is_summary)

  const sums: string[] = columns.map((col, index) => {
    if (index === 0) return '合计'
    const prop = col.property
    if (prop === 'init_balance_dir') {
      const total = summaryRows.reduce((s, r) => s + r.init_balance, 0)
      return total === 0 ? '' : total > 0 ? '借' : '贷'
    }
    if (prop === 'init_balance') {
      return formatAmount(Math.abs(summaryRows.reduce((s, r) => s + r.init_balance, 0)))
    }
    if (prop === 'current_debit') {
      return formatAmount(summaryRows.reduce((s, r) => s + (r.current_debit || 0), 0))
    }
    if (prop === 'current_credit') {
      return formatAmount(summaryRows.reduce((s, r) => s + (r.current_credit || 0), 0))
    }
    if (prop === 'end_balance_dir') {
      const total = summaryRows.reduce((s, r) => s + r.end_balance, 0)
      return total === 0 ? '' : total > 0 ? '借' : '贷'
    }
    if (prop === 'end_balance') {
      return formatAmount(Math.abs(summaryRows.reduce((s, r) => s + r.end_balance, 0)))
    }
    return ''
  })
  return sums
}

// 行样式类名
function getRowClassName({ row }: { row: any }) {
  return row.is_summary ? 'summary-row' : 'detail-row'
}

async function fetchAuxCategories() {
  try {
    const res = await request.get<any[]>('/base/aux-categories')
    // 现金流量项目本质是凭证级标签而非辅助核算项目，不应出现在辅助账簿筛选项中
    auxCategories.value = filterAuxCategoriesForAccount(res.data || [])
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

  // 限制选择数量，避免请求过大
  const MAX_AUX_ITEMS = 5000
  if (filters.value.aux_ids && filters.value.aux_ids.length > MAX_AUX_ITEMS) {
    ElMessage.warning(`最多只能选择 ${MAX_AUX_ITEMS} 个辅助项目，请缩小筛选范围`)
    return
  }

  try {
    const params: any = {
      aux_category_ids: filters.value.aux_category_ids.join(','), // 转换为逗号分隔的字符串
    }
    if (filters.value.aux_ids && filters.value.aux_ids.length > 0) {
      params.aux_ids = filters.value.aux_ids.join(',') // 转换为逗号分隔的字符串
    }
    if (filters.value.start_date) params.start_date = filters.value.start_date
    if (filters.value.end_date) params.end_date = filters.value.end_date
    if (filters.value.account_code) params.account_code = filters.value.account_code
    if (filters.value.include_unposted) params.include_unposted = true

    const res = await request.post<any>('/ledger/aux-balance', params)
    list.value = res.data || []
    const cf = (res as any).categoryFields as typeof categoryFields.value | undefined
    if (cf) {
      categoryFields.value = cf
    }
    syncAuxTableBodyWidth(tableRef, auxTableWidth.value)
  } catch (error: any) {
    console.error('查询辅助项目余额表失败:', error)
    const msg = error?.response?.data?.error || error?.message || '查询失败'
    ElMessage.error(msg)
  }
}

async function exportData() {
  const EXPORT_WARNING_THRESHOLD = 5000
  const EXPORT_HARD_LIMIT = 50000

  if (list.value.length > EXPORT_HARD_LIMIT) {
    ElMessage.error(`数据量过大（${list.value.length} 条），请缩小筛选范围后重试`)
    return
  }

  if (list.value.length > EXPORT_WARNING_THRESHOLD) {
    const confirmed = await useConfirm({
      title: '数据量较大',
      message: `当前数据量 ${list.value.length} 条，导出可能需要较长时间，是否继续？`,
      confirmButtonText: '继续导出',
      cancelButtonText: '取消',
    })
    if (!confirmed) return
  }

  const columns: ExportColumnDef[] = [
    {
      label: '科目编码',
      width: colWidth('account_code', 140),
      value: row => row.account_code,
      indent: row => Math.max(0, (row.level || 1) - 1),
      bold: row => row.is_summary,
    },
    {
      label: '科目名称',
      width: colWidth('account_name', 150),
      value: row => row.account_name,
      bold: row => row.is_summary,
    },
  ]

  for (const cat of activeCategoryColumns.value) {
    columns.push({
      label: cat.name,
      width: colWidth(cat.code, 140),
      value: row =>
        !row.is_summary && row.category_code === cat.code ? row.aux_name || row.aux_code || '' : '',
    })
  }

  columns.push(
    {
      label: '期初余额',
      children: [
        {
          label: '方向',
          width: colWidth('init_direction', 60),
          align: 'center',
          value: row =>
            row.init_balance === 0 ? '' : row.init_balance > 0 ? '借' : '贷',
          bold: row => row.is_summary,
        },
        {
          label: '余额',
          width: colWidth('init_balance', 130),
          align: 'right',
          type: 'amount',
          value: row => formatSignedBalanceAmount(row.init_balance, false),
          bold: row => row.is_summary,
        },
      ],
    },
    {
      label: '本期发生额',
      children: [
        {
          label: '借方',
          width: colWidth('current_debit', 130),
          align: 'right',
          type: 'amount',
          value: row => row.current_debit || 0,
          bold: row => row.is_summary,
        },
        {
          label: '贷方',
          width: colWidth('current_credit', 130),
          align: 'right',
          type: 'amount',
          value: row => row.current_credit || 0,
          bold: row => row.is_summary,
        },
      ],
    },
    {
      label: '期末余额',
      children: [
        {
          label: '方向',
          width: colWidth('end_direction', 60),
          align: 'center',
          value: row => (row.end_balance === 0 ? '' : row.end_balance > 0 ? '借' : '贷'),
          bold: row => row.is_summary,
        },
        {
          label: '余额',
          width: colWidth('end_balance', 130),
          align: 'right',
          type: 'amount',
          value: row => formatSignedBalanceAmount(row.end_balance, false),
          bold: row => row.is_summary,
        },
      ],
    }
  )

  const summaryRows = list.value.filter((row: any) => row.is_summary)
  const initTotal = summaryRows.reduce((s, r) => s + r.init_balance, 0)
  const endTotal = summaryRows.reduce((s, r) => s + r.end_balance, 0)
  const summaryPrefix = Array(activeCategoryColumns.value.length + 1).fill('')
  const summaryValues = [
    ...summaryPrefix,
    initTotal === 0 ? '' : initTotal > 0 ? '借' : '贷',
    formatSignedBalanceAmount(initTotal, false),
    summaryRows.reduce((s, r) => s + (r.current_debit || 0), 0),
    summaryRows.reduce((s, r) => s + (r.current_credit || 0), 0),
    endTotal === 0 ? '' : endTotal > 0 ? '借' : '贷',
    formatSignedBalanceAmount(endTotal, false),
  ]

  const dateRange =
    filters.value.start_date && filters.value.end_date
      ? `${filters.value.start_date}_${filters.value.end_date}`
      : new Date().toISOString().split('T')[0]

  await exportStyledTable({
    fileName: `辅助项目余额表_${dateRange}.xlsx`,
    sheetName: '辅助项目余额表',
    title: '辅助项目余额表',
    subtitle: filterSummaryText.value,
    columns,
    rows: list.value,
    summaryValues,
  })
}

function handleRowDblClick(row: any) {
  if (row.is_summary) {
    // 汇总行：跳转到科目明细账
    const query: any = {
      account_code: row.account_code,
    }
    if (filters.value.start_date) query.start_date = filters.value.start_date
    if (filters.value.end_date) query.end_date = filters.value.end_date
    router.push({ path: '/ledger/detail', query })
  } else {
    // 明细行：跳转到辅助项目明细账
    const query: any = {
      aux_category_ids: row.category_code,
      aux_ids: row.aux_id,
      account_code: row.account_code,
    }
    if (filters.value.start_date) query.start_date = filters.value.start_date
    if (filters.value.end_date) query.end_date = filters.value.end_date
    router.push({ path: '/ledger/aux-detail', query })
  }
}

// 查询按钮点击
function handleQuery() {
  drawerVisible.value = false
  fetchData()
}

/** 选中全部辅助类别，查询类别下所有项目（不传 aux_ids） */
async function handleLoadAll() {
  loadingAll.value = true
  try {
    if (auxCategories.value.length === 0) {
      await fetchAuxCategories()
    }
    if (auxCategories.value.length === 0) {
      ElMessage.warning('暂无辅助类别')
      return
    }
    filters.value.aux_category_ids = auxCategories.value.map((c: any) => c.id)
    auxItemsMap.value = {}
    await fetchAuxItems()
    filters.value.aux_ids = []
    itemCheckMap.value = {}
    await fetchData()
    ElMessage.success(`已加载 ${list.value.length} 条记录`)
  } catch (error: any) {
    console.error('全部加载失败:', error)
    ElMessage.error(error?.message || '全部加载失败')
  } finally {
    loadingAll.value = false
  }
}

// 重置筛选条件
function resetFilters() {
  const year = new Date().getFullYear()
  filters.value = {
    aux_category_ids: [],
    aux_ids: [],
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    account_code: '',
    include_unposted: true,
  }
  list.value = []
  categoryFields.value = {}
}

// 全选某个类别的项目
function selectCategoryItems(categoryId: string) {
  const items = auxItemsMap.value[categoryId] || []
  items.forEach(item => {
    itemCheckMap.value[item.id] = true
  })
  syncFiltersFromCheckMap()
}

// 反选某个类别的项目
function invertCategorySelection(categoryId: string) {
  const items = auxItemsMap.value[categoryId] || []
  items.forEach(item => {
    itemCheckMap.value[item.id] = !itemCheckMap.value[item.id]
  })
  syncFiltersFromCheckMap()
}

// 清空某个类别的选择
function clearCategorySelection(categoryId: string) {
  const items = auxItemsMap.value[categoryId] || []
  items.forEach(item => {
    itemCheckMap.value[item.id] = false
  })
  syncFiltersFromCheckMap()
}

// 单个项目勾选变化
function onItemCheckChange() {
  syncFiltersFromCheckMap()
}

// 从 checkMap 同步到 filters.aux_ids
function syncFiltersFromCheckMap() {
  filters.value.aux_ids = Object.keys(itemCheckMap.value).filter(id => itemCheckMap.value[id])
}

async function onAuxCategoryChange() {
  filters.value.aux_ids = []
  itemCheckMap.value = {}
  list.value = []
  categoryFields.value = {}
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) return
  await fetchAuxItems()
  // 初始化 checkMap（默认全选）
  allAuxItems.value.forEach(item => {
    itemCheckMap.value[item.id] = true
  })
  syncFiltersFromCheckMap()
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
  padding: 12px 16px;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.filter-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-summary:hover {
  background-color: #e4e7ed;
}

.filter-summary .placeholder {
  color: #909399;
}

.filter-summary .summary-text {
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  gap: 8px;
}

/* 抽屉内容样式 */
.drawer-content {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-item label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-separator {
  color: #909399;
  font-size: 13px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
}

.filter-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.batch-actions {
  display: flex;
  gap: 4px;
}

.checkbox-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.category-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.category-actions {
  display: flex;
  gap: 4px;
}

.category-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 8px;
}

.empty-hint {
  padding: 12px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

/* 汇总行样式 */
.el-table :deep(.summary-row) {
  background-color: #f5f7fa;
}

/* 明细行样式 */
.el-table :deep(.detail-row) {
  background-color: #ffffff;
}
</style>
