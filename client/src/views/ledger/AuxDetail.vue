<template>
  <div class="page page-ledger page-ledger-aux">
    <div class="page-header">
      <div class="header-left">
        <h3>辅助项目明细账</h3>
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
            v-if="auxItemsByCategory.length > 0"
            v-model="auxItemSearchKeyword"
            placeholder="快速检索项目（编码/名称）"
            clearable
            style="margin-bottom: 8px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <div class="checkbox-list" v-if="auxItemsByCategory.length > 0">
            <template v-for="catGroup in filteredAuxItemsByCategory" :key="catGroup.categoryId">
              <div class="category-group" v-if="catGroup.items.length > 0">
                <div class="category-header">
                  <div class="category-label">{{ catGroup.categoryName }}</div>
                  <div class="category-actions">
                    <el-button link size="small" @click="selectCategoryItems(catGroup.categoryId)">全选</el-button>
                    <el-button link size="small" @click="invertCategorySelection(catGroup.categoryId)">反选</el-button>
                    <el-button link size="small" @click="clearCategorySelection(catGroup.categoryId)">清空</el-button>
                  </div>
                </div>
                <div class="category-items">
                  <el-checkbox
                    v-for="item in catGroup.items"
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

        <el-divider>高级筛选</el-divider>

        <div class="filter-item">
          <label>科目编码</label>
          <el-input
            v-model="filters.account_code"
            placeholder="科目编码"
            clearable
          />
        </div>

        <div class="filter-item">
          <label>摘要关键词</label>
          <el-input
            v-model="filters.summary_keyword"
            placeholder="摘要关键词"
            clearable
          />
        </div>

        <div class="filter-item">
          <label>金额范围</label>
          <div class="amount-range">
            <el-input
              v-model="filters.min_amount"
              placeholder="最小金额"
              clearable
              style="width: 48%"
            />
            <span class="amount-separator">至</span>
            <el-input
              v-model="filters.max_amount"
              placeholder="最大金额"
              clearable
              style="width: 48%"
            />
          </div>
        </div>

        <div class="filter-item">
          <label>制单人</label>
          <el-input
            v-model="filters.maker_name"
            placeholder="制单人"
            clearable
          />
        </div>

        <div class="filter-item">
          <label>审核人</label>
          <el-input
            v-model="filters.auditor_name"
            placeholder="审核人"
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

    <div v-loading="loading" class="table-summary-scroll table-summary-scroll--wide">
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
      @header-dragend="onDragEnd"
      @row-dblclick="handleLedgerRowDblClick"
    >
      <el-table-column prop="category_name" label="辅助类别" :width="colWidth('category_name', 120)" />
      <el-table-column prop="aux_name" label="辅助项目" :width="colWidth('aux_name', 140)" />
      
      <!-- 动态辅助类别自定义字段列 -->
      <template v-for="cat in activeCategoryColumns" :key="cat.code">
        <el-table-column
          v-for="field in cat.fields"
          :key="field.field_key"
          :column-key="`${cat.code}_${field.field_key}`"
          :label="field.field_name"
          :width="colWidth(`${cat.code}_${field.field_key}`, 120)"
        >
          <template #default="{ row }">
            {{ row.category_code === cat.code ? (row.field_values?.[field.field_key] ?? '') : '' }}
          </template>
        </el-table-column>
      </template>
      
      <el-table-column prop="voucher_date" label="日期" :width="colWidth('voucher_date', 100)" />
      <el-table-column prop="voucher_no" label="凭证号" :width="colWidth('voucher_no', 130)" />
      <el-table-column prop="account_code" label="科目编码" :width="colWidth('account_code', 100)" />
      <el-table-column prop="account_name" label="科目名称" :width="colWidth('account_name', 160)" />
      <el-table-column prop="summary" label="摘要" :width="colWidth('summary', 180)" />
      <el-table-column column-key="借方" label="借方" :width="colWidth('借方', 120)" align="right">
        <template #default="{ row }">
          <span v-if="!row.is_opening_balance && row.direction === 'debit'">{{ formatAmount(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column column-key="贷方" label="贷方" :width="colWidth('贷方', 120)" align="right">
        <template #default="{ row }">
          <span v-if="!row.is_opening_balance && row.direction === 'credit'">{{ formatAmount(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column column-key="余额" label="余额" :width="colWidth('余额', 120)" align="right">
        <template #default="{ row }">
          {{ formatAmount(row.running_balance) }}
        </template>
      </el-table-column>
    </el-table>
    </div>

    <!-- 分页 -->
    <div style="margin-top: 16px; display: flex; justify-content: flex-end">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100, 200, 500]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Filter, Search, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import request from '@/api/request'
import type { TableColumnCtx } from 'element-plus'
import { useAuxColumnWidth, sumColWidths, syncAuxTableBodyWidth } from '@/composables/useColumnWidthMemory'
import { useLedgerVoucherNavigate } from '@/composables/useLedgerVoucherNavigate'
import { formatAmount } from '@/utils/format'
import { filterAuxCategoriesForAccount } from '@/utils/accountCashFlow'
import { exportStyledTable, type ExportColumnDef } from '@/utils/exportStyledExcel'

const route = useRoute()
const { handleLedgerRowDblClick } = useLedgerVoucherNavigate()
const { tableRef, onDragEnd, colWidth } = useAuxColumnWidth('ledger_aux_detail')
const list = ref<any[]>([])
const auxCategories = ref<any[]>([])
const auxItemsMap = ref<Record<string, any[]>>({})
const drawerVisible = ref(false)
const itemCheckMap = ref<Record<string, boolean>>({})
const categoryFields = ref<Record<string, { fields: { field_key: string; field_name: string }[] }>>({})
// 辅助项目搜索关键词
const auxItemSearchKeyword = ref('')
// 分页状态
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
// 加载状态
const loading = ref(false)
const loadingAll = ref(false)

/** 明细账一次拉取上限（与导出一致） */
const LOAD_ALL_PAGE_SIZE = 100000

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

// 当前查询结果中实际出现的类别，按选择顺序排列，用于动态列
// 是否有激活的筛选条件
const hasActiveFilters = computed(() => {
  return (
    (filters.value.aux_category_ids && filters.value.aux_category_ids.length > 0) ||
    (filters.value.aux_ids && filters.value.aux_ids.length > 0) ||
    filters.value.account_code ||
    filters.value.summary_keyword ||
    filters.value.min_amount ||
    filters.value.max_amount ||
    filters.value.maker_name ||
    filters.value.auditor_name
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

// 按类别分组的项目列表
const auxItemsByCategory = computed(() => {
  const result: { categoryId: string; categoryName: string; items: any[] }[] = []
  for (const catId of filters.value.aux_category_ids) {
    const cat = auxCategories.value.find(c => c.id === catId)
    const items = auxItemsMap.value[catId] || []
    if (cat && items.length > 0) {
      result.push({
        categoryId: catId,
        categoryName: cat.name,
        items: items
      })
    }
  }
  return result
})

// 根据搜索关键词过滤的项目列表
const filteredAuxItemsByCategory = computed(() => {
  const keyword = auxItemSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return auxItemsByCategory.value
  }

  return auxItemsByCategory.value.map(catGroup => ({
    ...catGroup,
    items: catGroup.items.filter((item: any) => {
      const code = (item.code || '').toLowerCase()
      const name = (item.name || '').toLowerCase()
      return code.includes(keyword) || name.includes(keyword)
    })
  }))
})

// 所有项目的扁平列表（用于全选/反选/清空）
const allAuxItems = computed(() => {
  const items: any[] = []
  for (const catGroup of auxItemsByCategory.value) {
    items.push(...catGroup.items)
  }
  return items
})

const activeCategoryColumns = computed(() => {
  const selectedCatIds = filters.value.aux_category_ids as string[]
  const result: { code: string; name: string; fields: { field_key: string; field_name: string }[] }[] = []
  for (const catId of selectedCatIds) {
    const cat = auxCategories.value.find(c => c.id === catId)
    if (!cat) continue
    const meta = categoryFields.value[cat.code]
    result.push({
      code: cat.code,
      name: cat.name,
      fields: meta?.fields || [],
    })
  }
  return result
})

const auxTableColumnKey = computed(() => {
  const parts = activeCategoryColumns.value.map(
    c => `${c.code}:${c.fields.map(f => f.field_key).join(',')}`
  )
  return parts.join('|') || 'none'
})

const auxTableWidth = computed(() => {
  const defs: Array<{ key: string; fallback: number }> = [
    { key: 'category_name', fallback: 120 },
    { key: 'aux_name', fallback: 140 },
  ]
  for (const cat of activeCategoryColumns.value) {
    for (const field of cat.fields) {
      defs.push({ key: `${cat.code}_${field.field_key}`, fallback: 120 })
    }
  }
  defs.push(
    { key: 'voucher_date', fallback: 100 },
    { key: 'voucher_no', fallback: 130 },
    { key: 'account_code', fallback: 100 },
    { key: 'account_name', fallback: 160 },
    { key: 'summary', fallback: 180 },
    { key: '借方', fallback: 120 },
    { key: '贷方', fallback: 120 },
    { key: '余额', fallback: 120 }
  )
  return sumColWidths(colWidth, defs, { includeGutter: false })
})

watch(auxTableWidth, w => syncAuxTableBodyWidth(tableRef, w))

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param
  const sums: string[] = []

  // 计算自定义字段列数
  const customFieldsCount = activeCategoryColumns.value.reduce((sum, cat) => sum + cat.fields.length, 0)
  // 固定列：辅助类别、辅助项目、日期、凭证号、科目编码、科目名称、摘要 = 7
  const fixedColsBeforeAmount = 7 + customFieldsCount

  columns.forEach((_column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    if (index < fixedColsBeforeAmount) {
      sums[index] = ''
      return
    }

    // 借方合计
    if (index === fixedColsBeforeAmount) {
      const total = data.reduce((sum, row) => {
        return sum + (row.direction === 'debit' ? row.amount : 0)
      }, 0)
      sums[index] = formatAmount(total)
    }
    // 贷方合计
    else if (index === fixedColsBeforeAmount + 1) {
      const total = data.reduce((sum, row) => {
        return sum + (row.direction === 'credit' ? row.amount : 0)
      }, 0)
      sums[index] = formatAmount(total)
    }
    // 余额（显示最后一行的余额）
    else if (index === fixedColsBeforeAmount + 2) {
      if (data.length > 0) {
        sums[index] = formatAmount(data[data.length - 1].running_balance)
      } else {
        sums[index] = formatAmount(0)
      }
    }
  })

  return sums
}

function getOpeningBalanceDate() {
  const startDate = filters.value.start_date
  if (!startDate) return ''

  if (/^\d{4}-01-01$/.test(startDate)) return startDate

  const d = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return startDate
  d.setDate(d.getDate() - 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type CategoryInitBalance = { category_name: string; init_balance: number }

function buildOpeningBalanceBase() {
  return {
    aux_name: '',
    field_values: {},
    voucher_date: getOpeningBalanceDate(),
    voucher_no: '',
    account_code: '',
    account_name: '',
    summary: '期初余额',
    direction: '',
    amount: 0,
    is_opening_balance: true,
  }
}

/** 按辅助类别分开展示期初行，每行「辅助类别」仅显示当前类目 */
function buildOpeningBalanceRows(
  categoryInits: CategoryInitBalance[] | undefined,
  totalBalance: number
) {
  const base = buildOpeningBalanceBase()
  const items = (categoryInits || []).filter(c => c.init_balance !== 0)
  if (items.length === 0) {
    return [
      {
        ...base,
        id: '__opening_balance__',
        category_name: '',
        running_balance: totalBalance,
      },
    ]
  }
  if (items.length === 1) {
    return [
      {
        ...base,
        id: '__opening_balance__',
        category_name: items[0].category_name,
        running_balance: totalBalance,
      },
    ]
  }
  let running = 0
  const rows = items.map((cat, index) => {
    running += cat.init_balance
    return {
      ...base,
      id: `__opening_balance__${index}`,
      category_name: cat.category_name,
      running_balance: running,
    }
  })
  if (rows.length > 0 && running !== totalBalance) {
    rows[rows.length - 1].running_balance = totalBalance
  }
  return rows
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
    // 获取所有选中类别的辅助项目，按类别分别存储
    for (const categoryId of filters.value.aux_category_ids) {
      if (auxItemsMap.value[categoryId]) continue // 已加载过的不重复加载
      const res = await request.get<any[]>('/base/aux-items', {
        params: { category_id: categoryId },
      })
      if (res.data) {
        auxItemsMap.value[categoryId] = res.data
      }
    }
  } catch (error) {
    console.error('加载辅助项目失败:', error)
  }
}

async function fetchData(options?: { loadAll?: boolean }) {
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) {
    ElMessage.warning('请先选择辅助类别')
    return
  }

  // 限制选择数量，避免请求过大（全部加载时不传 aux_ids，不受此限）
  const MAX_AUX_ITEMS = 5000
  if (
    !options?.loadAll &&
    filters.value.aux_ids &&
    filters.value.aux_ids.length > MAX_AUX_ITEMS
  ) {
    ElMessage.warning(`最多只能选择 ${MAX_AUX_ITEMS} 个辅助项目，请缩小筛选范围`)
    return
  }

  loading.value = true
  try {
    const params: any = {
      aux_category_ids: filters.value.aux_category_ids.join(','),
      page: options?.loadAll ? 1 : currentPage.value,
      pageSize: options?.loadAll ? LOAD_ALL_PAGE_SIZE : pageSize.value,
    }
    // aux_ids 可选：不传时后端查类别下所有项目
    if (filters.value.aux_ids && filters.value.aux_ids.length > 0) {
      params.aux_ids = filters.value.aux_ids.join(',')
    }

    if (filters.value.start_date) params.start_date = filters.value.start_date
    if (filters.value.end_date) params.end_date = filters.value.end_date
    if (filters.value.account_code) params.account_code = filters.value.account_code
    if (filters.value.summary_keyword) params.summary_keyword = filters.value.summary_keyword
    if (filters.value.min_amount) params.min_amount = filters.value.min_amount
    if (filters.value.max_amount) params.max_amount = filters.value.max_amount
    if (filters.value.maker_name) params.maker_name = filters.value.maker_name
    if (filters.value.auditor_name) params.auditor_name = filters.value.auditor_name
    if (filters.value.include_unposted) params.include_unposted = true

    const res = await request.post<any>('/ledger/aux-detail', params)

    const entries = res.data || []
    const initBalance = (res as any).initBalance || 0
    const categoryInitBalances = (res as any).categoryInitBalances as
      | CategoryInitBalance[]
      | undefined
    const pageStartBalance = (res as any).pageStartBalance ?? initBalance
    total.value = (res as any).total || 0

    // 保存自定义字段定义
    const cf = (res as any).categoryFields as typeof categoryFields.value | undefined
    if (cf) {
      categoryFields.value = cf
    }

    // 计算运行余额
    // 注意：后端返回的是分页后的数据，但 initBalance 是整个查询的期初余额
    // 前端需要基于 initBalance 计算当前页每条数据的余额
    let balance = pageStartBalance
    for (const entry of entries) {
      if (entry.direction === 'debit') {
        balance += entry.amount
      } else {
        balance -= entry.amount
      }
      entry.running_balance = balance
    }

    const showOpeningRow = options?.loadAll || currentPage.value === 1
    list.value = showOpeningRow
      ? [...buildOpeningBalanceRows(categoryInitBalances, initBalance), ...entries]
      : entries

    if (options?.loadAll) {
      currentPage.value = 1
      if (total.value > 0) {
        pageSize.value = total.value
      }
    }
    syncAuxTableBodyWidth(tableRef, auxTableWidth.value)
  } catch (error: any) {
    console.error('查询辅助项目明细账失败:', error)
    ElMessage.error(`查询失败：${error.message || '未知错误'}`)
  } finally {
    loading.value = false
  }
}

// 分页事件处理
function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1  // 切换每页数量时重置到第一页
  fetchData()
}

function handlePageChange(page: number) {
  currentPage.value = page
  fetchData()
}

async function exportData() {
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) {
    ElMessage.warning('请先选择辅助类别')
    return
  }

  // 导出全部数据
  const params: any = {
    aux_category_ids: filters.value.aux_category_ids.join(','),
    page: 1,
    pageSize: 10000,
  }

  if (filters.value.aux_ids && filters.value.aux_ids.length > 0) {
    params.aux_ids = filters.value.aux_ids.join(',')
  }

  if (filters.value.start_date) params.start_date = filters.value.start_date
  if (filters.value.end_date) params.end_date = filters.value.end_date
  if (filters.value.account_code) params.account_code = filters.value.account_code
  if (filters.value.summary_keyword) params.summary_keyword = filters.value.summary_keyword
  if (filters.value.min_amount) params.min_amount = filters.value.min_amount
  if (filters.value.max_amount) params.max_amount = filters.value.max_amount
  if (filters.value.maker_name) params.maker_name = filters.value.maker_name
  if (filters.value.auditor_name) params.auditor_name = filters.value.auditor_name
  if (filters.value.include_unposted) params.include_unposted = true

  const res = await request.post<any>('/ledger/aux-detail', params)
  const entries = res.data || []
  const exportInitBalance = (res as any).initBalance || 0

  // 计算运行余额
  let balance = exportInitBalance
  for (const entry of entries) {
    if (entry.direction === 'debit') {
      balance += entry.amount
    } else {
      balance -= entry.amount
    }
    entry.running_balance = balance
  }

  const exportCategoryInits = (res as any).categoryInitBalances as CategoryInitBalance[] | undefined
  const exportRows = [...buildOpeningBalanceRows(exportCategoryInits, exportInitBalance), ...entries]

  const columns: ExportColumnDef[] = [
    { label: '辅助类别', width: colWidth('category_name', 120), value: row => row.category_name || '' },
    { label: '辅助项目', width: colWidth('aux_name', 140), value: row => row.aux_name || '' },
  ]

  for (const cat of activeCategoryColumns.value) {
    for (const field of cat.fields) {
      columns.push({
        label: field.field_name,
        width: colWidth(`${cat.code}_${field.field_key}`, 120),
        value: row =>
          row.category_code === cat.code ? row.field_values?.[field.field_key] ?? '' : '',
      })
    }
  }

  columns.push(
    { label: '日期', width: colWidth('voucher_date', 100), value: row => row.voucher_date || '' },
    { label: '凭证号', width: colWidth('voucher_no', 130), value: row => row.voucher_no || '' },
    { label: '科目编码', width: colWidth('account_code', 100), value: row => row.account_code || '' },
    { label: '科目名称', width: colWidth('account_name', 160), value: row => row.account_name || '' },
    { label: '摘要', width: colWidth('summary', 180), value: row => row.summary || '' },
    {
      label: '借方',
      width: colWidth('借方', 120),
      align: 'right',
      type: 'amount',
      value: row => (!row.is_opening_balance && row.direction === 'debit' ? row.amount : ''),
    },
    {
      label: '贷方',
      width: colWidth('贷方', 120),
      align: 'right',
      type: 'amount',
      value: row => (!row.is_opening_balance && row.direction === 'credit' ? row.amount : ''),
    },
    {
      label: '余额',
      width: colWidth('余额', 120),
      align: 'right',
      type: 'amount',
      value: row => row.running_balance ?? '',
    }
  )

  const dateRange =
    filters.value.start_date && filters.value.end_date
      ? `${filters.value.start_date}_${filters.value.end_date}`
      : new Date().toISOString().split('T')[0]

  await exportStyledTable({
    fileName: `辅助项目明细账_${dateRange}.xlsx`,
    sheetName: '辅助项目明细账',
    title: '辅助项目明细账',
    subtitle: filterSummaryText.value,
    columns,
    rows: exportRows,
  })
}

// 查询按钮点击
function handleQuery() {
  currentPage.value = 1  // 重置到第一页
  drawerVisible.value = false
  fetchData()
}

/** 选中全部辅助类别，一次查询全部明细分录 */
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
    currentPage.value = 1
    await fetchData({ loadAll: true })
    const rowCount = list.value.filter((r: any) => !r.is_opening_balance).length
    ElMessage.success(`已加载 ${rowCount} 条明细（共 ${total.value} 条）`)
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
    summary_keyword: '',
    min_amount: '',
    max_amount: '',
    maker_name: '',
    auditor_name: '',
    include_unposted: true,
  }
  list.value = []
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
  // 切换辅助类别时清空已选项目
  filters.value.aux_ids = []
  itemCheckMap.value = {}
  list.value = []
  if (!filters.value.aux_category_ids || filters.value.aux_category_ids.length === 0) return
  await fetchAuxItems()
  // 初始化 checkMap（默认全选）
  allAuxItems.value.forEach(item => {
    itemCheckMap.value[item.id] = true
  })
  syncFiltersFromCheckMap()
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

.date-range,
.amount-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-separator,
.amount-separator {
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
</style>
