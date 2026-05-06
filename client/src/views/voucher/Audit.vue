<template>
  <div class="page">
    <div class="page-header">
      <h3>凭证管理</h3>
      <div class="filter-row">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
        <el-input
          v-model="searchKeyword"
          placeholder="搜索凭证号、摘要、科目、金额..."
          clearable
          @clear="clearSearch"
          @keydown.enter="onSearch"
          style="width: 240px"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="sortField" placeholder="排序字段" style="width: 130px" @change="(val: string) => onSortChange(val, sortOrder)">
          <el-option label="凭证日期" value="voucher_date" />
          <el-option label="凭证号" value="voucher_no" />
          <el-option label="借方金额" value="debit_amount" />
          <el-option label="贷方金额" value="credit_amount" />
          <el-option label="创建时间" value="created_at" />
        </el-select>
        <el-select v-model="sortOrder" placeholder="排序方式" style="width: 100px" @change="(val: string) => onSortChange(sortField, val)">
          <el-option label="升序" value="asc" />
          <el-option label="降序" value="desc" />
        </el-select>
        <el-button type="primary" @click="onSearch">查询</el-button>
      </div>
    </div>

    <VoucherAuditTable
      style="flex: 1; min-height: 0; overflow: hidden"
      :flat-list="flatList"
      :is-selectable-row="isSelectableRow"
      :get-row-class="getRowClass"
      :aux-categories="auxCategories"
      @selection-change="onSelect"
      @view-detail="viewDetail"
      @audit="audit"
      @unaudit="unAudit"
      @post="post"
      @unpost="unPost"
    />

    <div style="margin-top: 12px; flex-shrink: 0">
      <el-button type="success" :disabled="!selected.length" @click="handleSelectedBatchAudit"
        >批量审核</el-button
      >
      <el-button
        type="warning"
        :disabled="!selected.length"
        :loading="batchUnauditing"
        @click="handleBatchUnAudit"
        >批量反审核</el-button
      >
      <el-button
        type="primary"
        :disabled="!selected.length"
        :loading="batchPosting"
        @click="handleBatchPost"
        >批量记账</el-button
      >
      <el-button
        type="info"
        plain
        :disabled="!selected.length"
        @click="handlePrint"
      >
        <el-icon><Printer /></el-icon>
        打印
      </el-button>
      <el-button type="info" plain @click="batchPrintVisible = true">
        <el-icon><Printer /></el-icon>
        批量打印
      </el-button>
      <span style="margin-left: 12px; color: #909399">已选 {{ selected.length }} 张</span>
    </div>

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

    <BatchAuditDialog
      v-model="batchAuditVisible"
      :form="batchAuditForm"
      :voucher-types="voucherTypes"
      :auditing="batchAuditing"
      :previewing="batchAuditPreviewing"
      :preview-count="batchAuditPreviewCount"
      :preview-first-voucher-no="batchAuditPreviewFirstVoucherNo"
      :preview-last-voucher-no="batchAuditPreviewLastVoucherNo"
      :preview-blocked-voucher-no="batchAuditPreviewBlockedVoucherNo"
      @preview="handleBatchAuditPreview"
      @confirm="handleBatchAuditConfirm"
    />

    <VoucherDetailDialog
      v-model="detailVisible"
      :detail="detail"
      @audit="handleDetailAudit"
      @unaudit="handleDetailUnAudit"
      @post="handleDetailPost"
      @unpost="handleDetailUnPost"
      @edit="handleDetailEdit"
    />

    <PrintDialog
      v-model="printDialogVisible"
      :voucher-ids="printVoucherIds"
      :mode="printMode"
    />

    <BatchPrintDialog
      v-model="batchPrintVisible"
      :default-date-range="dateRange || []"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onActivated, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Printer } from '@element-plus/icons-vue'
import request from '@/api/request'
import VoucherAuditTable from '@/components/voucher/VoucherAuditTable.vue'
import BatchAuditDialog from '@/components/voucher/BatchAuditDialog.vue'
import VoucherDetailDialog from '@/components/voucher/VoucherDetailDialog.vue'
import PrintDialog from '@/components/print/PrintDialog.vue'
import BatchPrintDialog from '@/components/print/BatchPrintDialog.vue'
import { useVoucherAuditData } from '@/composables/useVoucherAuditData'
import { useVoucherAuditActions } from '@/composables/useVoucherAuditActions'
import { useBatchAuditDialog } from '@/composables/useBatchAuditDialog'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const {
  selected,
  dateRange,
  voucherTypes,
  flatList,
  searchKeyword,
  sortField,
  sortOrder,
  pagination,
  clearSearch,
  isSelectableRow,
  getRowClass,
  onSelect,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onSearch,
  fetchData,
  fetchVoucherTypes,
  fetchSystemParams,
} = useVoucherAuditData()

const auxCategories = ref<any[]>([])

async function fetchAuxCategories() {
  try {
    const res = await request.get<any[]>('/base/aux-categories')
    auxCategories.value = res.data || []
  } catch { /* ignore */ }
}

const {
  detail,
  detailVisible,
  batchPosting,
  batchUnposting,
  batchUnauditing,
  viewDetail,
  audit,
  unAudit,
  post,
  unPost,
  batchAudit,
  batchUnAudit,
  batchPost,
  batchUnpost,
} = useVoucherAuditActions(fetchData)

const {
  batchAuditVisible,
  batchAuditing,
  batchAuditPreviewing,
  batchAuditPreviewCount,
  batchAuditPreviewFirstVoucherNo,
  batchAuditPreviewLastVoucherNo,
  batchAuditPreviewBlockedVoucherNo,
  batchAuditForm,
  handleBatchAuditPreview,
  handleBatchAudit,
} = useBatchAuditDialog(fetchData)

const router = useRouter()

async function handleDetailAudit(row: any) {
  await audit(row)
  detailVisible.value = false
  await fetchData()
}

async function handleDetailUnAudit(row: any) {
  await unAudit(row)
  detailVisible.value = false
  await fetchData()
}

async function handleDetailPost(row: any) {
  await post(row)
  detailVisible.value = false
  await fetchData()
}

async function handleDetailUnPost(row: any) {
  await unPost(row)
  detailVisible.value = false
  await fetchData()
}

function handleDetailEdit(row: any) {
  // 跳转到凭证录入页面编辑
  detailVisible.value = false
  router.push({ path: '/voucher/entry', query: { editVoucherId: row.id || row._voucherId } })
}

async function handleBatchUnAudit() {
  await batchUnAudit(selected.value)
  selected.value = []
}

async function handleBatchPost() {
  await batchPost(selected.value)
  selected.value = []
}

async function handleBatchUnpost() {
  await batchUnpost(selected.value)
  selected.value = []
}

const printDialogVisible = ref(false)
const printVoucherIds = ref<number[]>([])
const printMode = ref<'single' | 'batch'>('batch')
const batchPrintVisible = ref(false)

function handlePrint() {
  if (!selected.value.length) return
  printVoucherIds.value = selected.value.map((v: any) => v.id || v._voucherId).filter(Boolean)
  printMode.value = 'batch'
  printDialogVisible.value = true
}

async function handleSelectedBatchAudit() {
  await batchAudit(selected.value)
  selected.value = []
}

async function handleBatchAuditConfirm() {
  const [start_date, end_date] = batchAuditForm.value.dateRange || []
  const hasFilterCondition =
    Boolean(start_date) && Boolean(end_date) && Boolean(batchAuditForm.value.voucher_type_ids?.length)

  if (!hasFilterCondition && selected.value.length > 0) {
    await batchAudit(selected.value)
    selected.value = []
    batchAuditVisible.value = false
    return
  }

  await handleBatchAudit()
}

onMounted(async () => {
  await Promise.all([fetchVoucherTypes(), fetchSystemParams(), fetchAuxCategories()])
  await fetchData()
})

onActivated(async () => {
  await Promise.all([fetchVoucherTypes(), fetchSystemParams(), fetchAuxCategories()])
  await fetchData()
})

useKeyboardShortcuts([
  { key: 'e', ctrl: true, handler: () => { batchAuditVisible.value = true }, description: 'Ctrl+E 批量操作' },
  { key: 'd', ctrl: true, handler: () => handleBatchUnpost(), description: 'Ctrl+D 批量反记账' },
])
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
