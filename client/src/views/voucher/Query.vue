<template>
  <div class="page">
    <div class="page-header">
      <h3>凭证查询</h3>
      <div style="display: flex; gap: 8px; align-items: center">
        <el-popover placement="bottom-start" :width="200" trigger="click">
          <template #reference>
            <el-button>
              <el-icon style="margin-right: 4px"><Setting /></el-icon>列设置
            </el-button>
          </template>
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div
              v-for="col in visibleCols"
              :key="col.prop"
              style="display: flex; align-items: center; gap: 8px"
            >
              <el-checkbox v-model="col.visible" @change="saveVisibleCols" />
              <span>{{ col.label }}</span>
            </div>
          </div>
          </el-popover>
        <el-button @click="exportData">导出 Excel</el-button>
        <el-button type="info" plain @click="handleBatchPrint">
          <el-icon><Printer /></el-icon>
          批量打印
        </el-button>
      </div>
    </div>

    <el-card style="margin-bottom: 12px">
      <div class="filter-row">
        <el-input
          v-model="filters.keyword"
          placeholder="凭证号/摘要/金额/制单人/记账人/科目/辅助核算"
          style="width: 360px"
          clearable
          @keyup.enter="fetchData"
        />
        <el-select v-model="filters.status" placeholder="状态" style="width: 120px">
          <el-option label="全部" value="" />
          <el-option label="只录入" value="draft" />
          <el-option label="已审核" value="audited" />
          <el-option label="已记账" value="posted" />
        </el-select>
        <el-button @click="showDateDialog = true" :icon="Calendar" circle />
        <el-select v-model="filters.year" placeholder="年度" style="width: 100px" clearable>
          <el-option label="全部年份" :value="null" />
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" placeholder="月份" style="width: 100px" clearable>
          <el-option label="全部月份" :value="null" />
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-select
          v-model="filters.voucherTypeIds"
          placeholder="凭证类型"
          style="width: 180px"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
        >
          <el-option label="全部类型" value="" />
          <el-option
            v-for="vt in voucherTypes"
            :key="vt.id"
            :label="vt.name"
            :value="vt.id"
          />
        </el-select>
        <el-select
          v-model="filters.accountIds"
          placeholder="科目"
          style="width: 180px"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          filterable
          @focus="loadAccounts"
        >
          <el-option
            v-for="acc in accounts"
            :key="acc.id"
            :label="`${acc.code} ${acc.name}`"
            :value="acc.id"
          />
        </el-select>
        <!-- 动态辅助核算筛选 -->
        <template v-for="cat in auxCategories" :key="cat.id">
          <el-select
            v-model="filters.auxItems[cat.id]"
            :placeholder="cat.name"
            style="width: 150px"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            @focus="loadAuxItems(cat.id)"
          >
            <el-option
              v-for="item in auxItemsMap[cat.id] || []"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <!-- 该类别的自定义字段筛选 -->
          <template v-for="field in cat.fields || []" :key="field.id">
            <el-input
              v-if="field.field_type === 'text' || field.field_type === 'number'"
              v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
              :placeholder="field.field_name"
              style="width: 150px"
              clearable
            />
            <el-select
              v-else-if="field.field_type === 'select'"
              v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
              :placeholder="field.field_name"
              style="width: 150px"
              clearable
            >
              <el-option
                v-for="opt in parseFieldOptions(field.options_json)"
                :key="opt"
                :label="opt"
                :value="opt"
              />
            </el-select>
            <el-date-picker
              v-else-if="field.field_type === 'date'"
              v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
              type="date"
              :placeholder="field.field_name"
              value-format="YYYY-MM-DD"
              style="width: 150px"
              clearable
            />
          </template>
        </template>
        <el-button type="primary" @click="fetchData">查询</el-button>
      </div>
    </el-card>

    <el-table
      ref="tableRef"
      :data="flatList"
      border
      height="100%"
      :loading="loading"
      :row-class-name="getRowClass"
      :span-method="voucherSpanMethod"
      @header-dragend="onDragEnd"
    >
      <el-table-column
        v-if="getColVisible('voucher_no')"
        label="凭证号"
        prop="voucher_no"
        :width="widths['voucher_no'] || 80"
        align="center"
      />
      <el-table-column
        v-if="getColVisible('voucher_date')"
        label="日期"
        prop="voucher_date"
        :width="widths['voucher_date'] || 100"
      />
      <el-table-column v-if="getColVisible('summary')" label="摘要" prop="summary" :width="widths['summary'] || 150" />
      <el-table-column
        v-if="getColVisible('account_code')"
        prop="account_code"
        label="科目编码"
        :width="widths['account_code'] || 100"
      />
      <el-table-column
        v-if="getColVisible('account_name')"
        prop="account_name"
        label="科目名称"
        :width="widths['account_name'] || 160"
      />
      <el-table-column
        v-if="getColVisible('debit_amt')"
        label="借方金额"
        prop="debit_amt"
        :width="widths['debit_amt'] || 130"
        align="right"
        class-name="amount-cell"
      >
        <template #default="{ row }">
          <AmountDisplay v-if="row.direction === 'debit'" :value="row.amount" :show-color="false" />
        </template>
      </el-table-column>
      <el-table-column
        v-if="getColVisible('credit_amt')"
        label="贷方金额"
        prop="credit_amt"
        :width="widths['credit_amt'] || 130"
        align="right"
        class-name="amount-cell"
      >
        <template #default="{ row }">
          <AmountDisplay v-if="row.direction === 'credit'" :value="row.amount" :show-color="false" />
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in auxColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.name"
        :width="widths[col.prop] || 100"
      />
      <el-table-column
        v-if="getColVisible('maker_name')"
        label="制单人"
        prop="maker_name"
        :width="widths['maker_name'] || 80"
      />
      <el-table-column
        v-if="getColVisible('auditor_name')"
        label="审核人"
        prop="auditor_name"
        :width="widths['auditor_name'] || 80"
      />
      <el-table-column
        v-if="getColVisible('poster_name')"
        label="记账人"
        prop="poster_name"
        :width="widths['poster_name'] || 80"
      />
      <el-table-column v-if="getColVisible('status')" label="状态" prop="status" :width="widths['status'] || 80">
        <template #default="{ row }">
          <StatusTag :status="row.status" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="printVoucher(row)">打印</el-button>
          <el-button
            v-if="row.status !== 'posted'"
            link
            type="danger"
            size="small"
            @click="handleDelete(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <span class="pagination-text">共 {{ pagination.total }} 条</span>
      <el-select v-model="pagination.pageSize" style="width: 95px" @change="onPageSizeChange">
        <el-option label="10条" :value="10" />
        <el-option label="20条" :value="20" />
        <el-option label="50条" :value="50" />
        <el-option label="100条" :value="100" />
        <el-option label="全部" :value="-1" />
      </el-select>
      <el-pagination
        v-model:current-page="pagination.page"
        :total="pagination.total"
        :page-size="pagination.pageSize"
        layout="prev, pager, next, jumper"
        :pager-count="5"
        @current-change="onPageChange"
      />
    </div>

    <!-- 日期范围对话框 -->
    <el-dialog v-model="showDateDialog" title="选择日期范围" width="300px">
      <el-form label-width="80px">
        <el-form-item label="开始日期">
          <el-date-picker
            v-model="tempDateRange[0]"
            type="date"
            placeholder="选择开始日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker
            v-model="tempDateRange[1]"
            type="date"
            placeholder="选择结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDateDialog = false">取消</el-button>
        <el-button @click="clearDateRange">清空</el-button>
        <el-button type="primary" @click="confirmDateRange">确定</el-button>
      </template>
    </el-dialog>

    <PrintDialog
      v-model="printDialogVisible"
      :voucher-ids="printVoucherIds"
      :mode="printMode"
    />

    <BatchPrintDialog
      v-model="batchPrintVisible"
      :default-date-range="filters.dateRange"
      :default-voucher-type-ids="filters.voucherTypeIds"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '@/api/request'
import { Setting, Calendar, Printer } from '@element-plus/icons-vue'
import printJS from 'print-js'
import StatusTag from '@/components/StatusTag.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import PrintDialog from '@/components/print/PrintDialog.vue'
import BatchPrintDialog from '@/components/print/BatchPrintDialog.vue'
import { useDeleteConfirm } from '@/composables/useConfirm'
import { showSuccess, showOperationError } from '@/composables/useMessage'
import { formatAmount } from '@/utils/format'
import { useSearchMemory } from '@/composables/useSearchMemory'
import { useOperationHistory } from '@/composables/useOperationHistory'
import { performanceMonitor } from '@/utils/performanceMonitor'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'

const route = useRoute()
const router = useRouter()
const list = ref<any[]>([])
const loading = ref(false)
const auxCategories = ref<any[]>([])
const voucherTypes = ref<any[]>([])
const accounts = ref<any[]>([])
const auxItemsMap = ref<Record<string, any[]>>({}) // 存储每个类别的项目列表

// 搜索条件记忆
const filters = useSearchMemory('voucher-query-filters', {
  keyword: '',
  status: '',
  year: null as number | null,
  period: null as number | null,
  dateRange: [],
  voucherTypeIds: [] as string[],
  accountIds: [] as number[],
  auxItems: {} as Record<string, number[]>, // 辅助核算项目筛选 { categoryId: [itemId1, itemId2] }
  auxFields: {} as Record<string, string>, // 辅助核算自定义字段筛选 { categoryId_fieldKey: value }
})

const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

// 操作历史
const { addRecord } = useOperationHistory()

const statusText: Record<string, string> = { draft: '草稿', audited: '已审核', posted: '已记账' }
const tableRef = ref()
const VIS_COL_KEY = 'voucher-query-cols-visible'
const { widths, onDragEnd } = useColumnWidthMemory('voucher_query')

// 日期对话框
const showDateDialog = ref(false)
const tempDateRange = ref<[string, string]>(['', ''])

// 列可见性配置
const visibleCols = ref([
  { prop: 'voucher_no', label: '凭证号', visible: true },
  { prop: 'voucher_date', label: '日期', visible: true },
  { prop: 'summary', label: '摘要', visible: true },
  { prop: 'account_code', label: '科目编码', visible: true },
  { prop: 'account_name', label: '科目名称', visible: true },
  { prop: 'debit_amt', label: '借方金额', visible: true },
  { prop: 'credit_amt', label: '贷方金额', visible: true },
  { prop: 'maker_name', label: '制单人', visible: true },
  { prop: 'auditor_name', label: '审核人', visible: true },
  { prop: 'poster_name', label: '记账人', visible: true },
  { prop: 'status', label: '状态', visible: true },
])

// 恢复列可见性
function restoreVisibleCols() {
  const saved = JSON.parse(localStorage.getItem(VIS_COL_KEY) || 'null')
  if (saved && Array.isArray(saved)) {
    for (const s of saved) {
      const col = visibleCols.value.find(c => c.prop === s.prop)
      if (col) col.visible = s.visible
    }
  }
}

function saveVisibleCols() {
  localStorage.setItem(
    VIS_COL_KEY,
    JSON.stringify(visibleCols.value.map(c => ({ prop: c.prop, visible: c.visible })))
  )
}

function getColVisible(prop: string) {
  return visibleCols.value.find(c => c.prop === prop)?.visible ?? true
}

// 凭证类型简称映射
const typeAbbr: Record<string, string> = {
  记账凭证: '记',
  收款凭证: '收',
  付款凭证: '付',
  转账凭证: '转',
}

// 提取凭证号中的序号部分并去掉前导零，如 202604-0001 → 1
function getVoucherSeq(voucherNo: string) {
  const idx = voucherNo.indexOf('-')
  const seq = idx >= 0 ? voucherNo.slice(idx + 1) : voucherNo
  return String(parseInt(seq, 10))
}

// 凭证类型简称
function getTypeAbbr(name: string) {
  return typeAbbr[name] || name.charAt(0) || '凭'
}

// 解析 aux_data JSON，提取辅助项目名称和自定义字段值
function parseAuxData(entry: any): Record<string, string> {
  const result: Record<string, string> = {}
  if (!entry.aux_data) return result
  try {
    const auxData = typeof entry.aux_data === 'string' ? JSON.parse(entry.aux_data) : entry.aux_data
    for (const [code, val] of Object.entries(auxData)) {
      if (val && typeof val === 'object') {
        // 提取辅助项目名称
        if ((val as any).name) {
          result[`_aux_${code}`] = (val as any).name
        }
        // 提取自定义字段值
        if ((val as any).field_values && typeof (val as any).field_values === 'object') {
          for (const [fieldKey, fieldValue] of Object.entries((val as any).field_values)) {
            if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
              result[`_aux_${code}_${fieldKey}`] = String(fieldValue)
            }
          }
        }
      }
    }
  } catch { /* ignore */ }
  return result
}

const flatList = computed(() => {
  const rows: any[] = []
  for (const [index, v] of list.value.entries()) {
    const seq = getVoucherSeq(v.voucher_no)
    const abbr = getTypeAbbr(v.voucher_type_name || '记')
    const voucherLabel = `${abbr}-${seq}`
    const entries = (v.entries && v.entries.length) ? v.entries : [null]
    const entryCount = entries.length
    for (const [entryIdx, e] of entries.entries()) {
      rows.push({
        ...v,
        ...(e || {}),
        ...(e ? parseAuxData(e) : {}),
        voucher_no: voucherLabel,
        _voucherId: v.id,
        _stripeGroup: index % 2,
        _voucherRowIndex: entryIdx,
        _voucherEntryCount: entryCount,
      })
    }
  }
  return rows
})

// 动态辅助列：从 aux_data 中提取出现过的辅助类别和自定义字段
const auxColumns = computed(() => {
  const colMap = new Map<string, { name: string; order: number }>()
  
  for (const row of flatList.value) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_aux_') && row[key]) {
        if (!colMap.has(key)) {
          const parts = key.slice(5).split('_') // 去掉 _aux_ 前缀后分割
          const code = parts[0]
          const cat = auxCategories.value.find(c => c.code === code)
          
          if (parts.length === 1) {
            // 辅助项目列：_aux_{code}
            colMap.set(key, { 
              name: cat?.name || code, 
              order: (cat?.id || 0) * 1000 
            })
          } else {
            // 自定义字段列：_aux_{code}_{fieldKey}
            const fieldKey = parts.slice(1).join('_')
            const field = cat?.fields?.find((f: any) => f.field_key === fieldKey)
            colMap.set(key, { 
              name: field?.field_name || fieldKey, 
              order: (cat?.id || 0) * 1000 + (field?.id || 0)
            })
          }
        }
      }
    }
  }
  
  // 按 order 排序，确保同一类别的列聚合在一起
  return Array.from(colMap.entries())
    .map(([prop, { name, order }]) => ({ prop, name, order }))
    .sort((a, b) => a.order - b.order)
})

function getRowClass({ row }: { row: any }) {
  return row._stripeGroup === 0 ? 'voucher-group-even' : 'voucher-group-odd'
}

function voucherSpanMethod({ row, column }: { row: any; column: any }) {
  if (column.property === 'voucher_no' || column.property === 'voucher_date') {
    if (row._voucherRowIndex === 0) {
      return { rowspan: row._voucherEntryCount, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
}

function applyRouteFilters() {
  const year = Number(route.query.year)
  const period = Number(route.query.period)
  const keyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''

  if (Number.isFinite(year) && year > 0) filters.year = year
  if (Number.isFinite(period) && period > 0) filters.period = period
  filters.keyword = keyword
}

async function fetchData() {
  loading.value = true
  try {
    await performanceMonitor.measure('fetchVoucherQuery', async () => {
      const params: any = { page: pagination.page, pageSize: pagination.pageSize }
      if (filters.keyword) params.keyword = filters.keyword
      if (filters.status) params.status = filters.status
      if (filters.year) params.year = filters.year
      if (filters.period) params.period = filters.period
      if (filters.dateRange?.length) {
        params.start_date = filters.dateRange[0]
        params.end_date = filters.dateRange[1]
      }
      // 凭证类型筛选：如果选中了"全部类型"(空字符串)，则不传参数；否则传选中的类型ID数组
      const typeIds = filters.voucherTypeIds.filter((id: string) => id !== '')
      if (typeIds.length > 0) {
        params.voucher_type_ids = typeIds.join(',')
      }
      // 辅助核算项目筛选
      for (const [categoryId, itemId] of Object.entries(filters.auxItems)) {
        if (itemId) {
          params[`aux_${categoryId}`] = itemId
        }
      }
      // 辅助核算自定义字段筛选
      for (const [key, value] of Object.entries(filters.auxFields)) {
        if (value) {
          params[`aux_field_${key}`] = value
        }
      }
      const res = await request.get<any[]>('/voucher/vouchers', { params })
      list.value = res.data
      pagination.total = res.total ?? 0
    })
  } finally {
    loading.value = false
  }
}

function onPageChange(page: number) {
  pagination.page = page
  fetchData()
}

function onPageSizeChange(size: number) {
  pagination.pageSize = size
  pagination.page = 1
  fetchData()
}

function printVoucher(row: any) {
  const voucherId = row._voucherId || row.id
  if (!voucherId) return
  printVoucherIds.value = [voucherId]
  printMode.value = 'single'
  printDialogVisible.value = true
}

const printDialogVisible = ref(false)
const printVoucherIds = ref<number[]>([])
const printMode = ref<'single' | 'batch'>('batch')
const batchPrintVisible = ref(false)

function handleBatchPrint() {
  batchPrintVisible.value = true
}


async function exportData() {
  const { utils } = await import('xlsx')
  const rows: any[] = []
  for (const v of list.value) {
    if (!v.entries || v.entries.length === 0) {
      rows.push({
        凭证号: v.voucher_no,
        日期: v.voucher_date,
        类型: v.voucher_type_name,
        摘要: v.summary,
        科目: '',
        方向: '',
        金额: v.total_amount,
        部门: '',
        项目: '',
        制单人: v.maker_name,
        审核人: v.auditor_name,
        记账人: v.poster_name,
        状态: statusText[v.status] || v.status,
      })
    } else {
      for (const e of v.entries) {
        rows.push({
          凭证号: v.voucher_no,
          日期: v.voucher_date,
          类型: v.voucher_type_name,
          摘要: e.summary,
          科目: `${e.account_code} ${e.account_name}`,
          方向: e.direction === 'debit' ? '借' : '贷',
          金额: e.amount,
          部门: e.dept_name || '',
          项目: e.project_name || '',
          制单人: v.maker_name,
          审核人: v.auditor_name,
          记账人: v.poster_name,
          状态: statusText[v.status] || v.status,
        })
      }
    }
  }
  const ws = utils.json_to_sheet(rows)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '凭证查询')
  const { writeFile } = await import('xlsx')
  writeFile(wb, `凭证查询_${Date.now()}.xlsx`)
}

async function handleDelete(row: any) {
  const voucher = list.value.find((v: any) => v.id === row._voucherId)
  if (!voucher) return

  const confirmed = await useDeleteConfirm(`凭证 ${voucher.voucher_no}`)
  if (!confirmed) return

  try {
    await request.delete(`/voucher/vouchers/${row._voucherId}`)
    showSuccess('删除成功')
    addRecord('delete', '凭证查询', `删除凭证：${voucher.voucher_no}`)
    fetchData()
  } catch (error) {
    showOperationError('删除', error)
  }
}

// 日期范围对话框操作
function confirmDateRange() {
  filters.dateRange = tempDateRange.value.filter(d => d) as any
  showDateDialog.value = false
}

function clearDateRange() {
  tempDateRange.value = ['', '']
  filters.dateRange = []
  showDateDialog.value = false
}

// 加载辅助核算项目
async function loadAuxItems(categoryId: string) {
  if (auxItemsMap.value[categoryId]) return // 已加载过
  try {
    const res = await request.get<any[]>('/base/aux-items', {
      params: { category_id: categoryId, status: 'active' }
    })
    auxItemsMap.value[categoryId] = res.data
  } catch (error) {
    console.error('加载辅助核算项目失败', error)
  }
}

// 加载科目列表
async function loadAccounts() {
  if (accounts.value.length > 0) return // 已加载过
  try {
    const res = await request.get<any[]>('/base/accounts', {
      params: { status: 'active' }
    })
    accounts.value = res.data
  } catch (error) {
    console.error('加载科目列表失败', error)
  }
}

// 解析字段选项
function parseFieldOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return []
  try {
    return JSON.parse(optionsJson)
  } catch {
    return []
  }
}

onMounted(async () => {
  applyRouteFilters()
  restoreVisibleCols()
  const [auxRes, typeRes] = await Promise.all([
    request.get<any[]>('/base/aux-categories'),
    request.get<any[]>('/base/voucher-types'),
  ])
  auxCategories.value = auxRes.data
  voucherTypes.value = typeRes.data
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
  flex-wrap: wrap;
}
</style>

<style>
.voucher-group-even td {
  background-color: #f0f5ff !important;
}
.voucher-group-odd td {
  background-color: #ffffff !important;
}

/* 缩小日期选择器弹出面板 */
.el-date-range-picker {
  width: 450px !important;
}
.el-date-range-picker .el-picker-panel__body {
  min-width: 400px !important;
}
.el-date-range-picker .el-date-table {
  font-size: 12px !important;
}
.el-date-range-picker .el-date-table td {
  width: 28px !important;
  height: 28px !important;
  padding: 2px !important;
}
.el-date-range-picker .el-date-table td span {
  width: 24px !important;
  height: 24px !important;
  line-height: 24px !important;
}
</style>
