<template>
  <div class="page">
    <div class="page-header">
      <h3>凭证查询</h3>
      <el-button type="primary" @click="router.push('/voucher/entry')">新增</el-button>
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
      </div>
    </div>

    <el-card style="margin-bottom: 12px">
      <div class="filter-row">
        <el-input
          v-model="filters.keyword"
          placeholder="凭证号/摘要"
          style="width: 180px"
          clearable
          @keyup.enter="fetchData"
        />
        <el-select v-model="filters.status" placeholder="状态" style="width: 120px" clearable>
          <el-option label="已审核" value="audited" />
          <el-option label="已过账" value="posted" />
        </el-select>
        <el-select v-model="filters.year" placeholder="年度" style="width: 100px">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" placeholder="月份" style="width: 100px">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
        <el-button type="primary" @click="fetchData">查询</el-button>
      </div>
    </el-card>

    <el-table
      ref="tableRef"
      :data="flatList"
      border
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
        :key="col.code"
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
        label="过账人"
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

    <el-pagination
      v-model:current-page="pagination.page"
      v-model:page-size="pagination.pageSize"
      :total="pagination.total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="fetchData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '@/api/request'
import { Setting } from '@element-plus/icons-vue'
import printJS from 'print-js'
import StatusTag from '@/components/StatusTag.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
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

// 搜索条件记忆
const filters = useSearchMemory('voucher-query-filters', {
  keyword: '',
  status: 'audited',
  year: new Date().getFullYear(),
  period: new Date().getMonth() + 1,
  dateRange: [],
})

const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

// 操作历史
const { addRecord } = useOperationHistory()

const statusText: Record<string, string> = { draft: '草稿', audited: '已审核', posted: '已过账' }
const tableRef = ref()
const VIS_COL_KEY = 'voucher-query-cols-visible'
const { widths, onDragEnd } = useColumnWidthMemory('voucher_query')

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
  { prop: 'poster_name', label: '过账人', visible: true },
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

function formatMoney(val: number) {
  return formatAmount(val)
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

// 解析 aux_data JSON，提取辅助项目名称
function parseAuxData(entry: any): Record<string, string> {
  const result: Record<string, string> = {}
  if (!entry.aux_data) return result
  try {
    const auxData = typeof entry.aux_data === 'string' ? JSON.parse(entry.aux_data) : entry.aux_data
    for (const [code, val] of Object.entries(auxData)) {
      if (val && typeof val === 'object' && (val as any).name) {
        result[`_aux_${code}`] = (val as any).name
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

// 动态辅助列：从 aux_data 中提取出现过的辅助类别
const auxColumns = computed(() => {
  const colMap = new Map<string, string>()
  for (const row of flatList.value) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_aux_') && row[key]) {
        const code = key.slice(5) // 去掉 _aux_ 前缀
        if (!colMap.has(code)) {
          // 从 auxCategories 中找到对应的名称
          const cat = auxCategories.value.find(c => c.code === code)
          colMap.set(code, cat?.name || code)
        }
      }
    }
  }
  return Array.from(colMap.entries()).map(([code, name]) => ({
    code,
    name,
    prop: `_aux_${code}`,
  }))
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
      const res = await request.get<any[]>('/voucher/vouchers', { params })
      list.value = res.data
      pagination.total = res.total ?? 0
    })
  } finally {
    loading.value = false
  }
}

function printVoucher(row: any) {
  const voucher = list.value.find((v: any) => v.id === row._voucherId)
  if (!voucher) return
  const html = `
    <h2 style="text-align:center">记 账 凭 证</h2>
    <p style="text-align:center">${voucher.voucher_date} &nbsp; 凭证号: ${voucher.voucher_no}</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><th>#</th><th>摘要</th><th>科目</th><th>借方</th><th>贷方</th></tr>
      ${voucher.entries
        .map(
          (e: any) => `<tr>
        <td>${e.seq}</td><td>${e.summary}</td><td>${e.account_name}</td>
        <td>${e.direction === 'debit' ? formatMoney(e.amount) : ''}</td>
        <td>${e.direction === 'credit' ? formatMoney(e.amount) : ''}</td>
      </tr>`
        )
        .join('')}
      <tr><td colspan="3">合计</td><td>${formatMoney(voucher.total_amount)}</td><td>${formatMoney(voucher.total_amount)}</td></tr>
    </table>
    <p>制单: ${voucher.maker_name} &nbsp; 审核: ${voucher.auditor_name} &nbsp; 过账: ${voucher.poster_name}</p>
  `
  printJS({ printable: html, type: 'raw-html' })
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
        过账人: v.poster_name,
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
          过账人: v.poster_name,
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

onMounted(async () => {
  applyRouteFilters()
  restoreVisibleCols()
  const res = await request.get<any[]>('/base/aux-categories')
  auxCategories.value = res.data
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
</style>
