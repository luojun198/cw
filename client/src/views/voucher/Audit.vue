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
          style="width: 240px"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="sortField" placeholder="排序字段" style="width: 130px">
          <el-option label="凭证日期" value="voucher_date" />
          <el-option label="凭证号" value="voucher_no" />
          <el-option label="借方金额" value="debit_amount" />
          <el-option label="贷方金额" value="credit_amount" />
          <el-option label="创建时间" value="created_at" />
        </el-select>
        <el-select v-model="sortOrder" placeholder="排序方式" style="width: 100px">
          <el-option label="升序" value="asc" />
          <el-option label="降序" value="desc" />
        </el-select>
        <el-button type="primary" @click="fetchData">查询</el-button>
        <el-button type="success" plain @click="batchAuditVisible = true">批量操作</el-button>
      </div>
    </div>

    <VoucherAuditTable
      :flat-list="filteredData"
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

    <div style="margin-top: 12px">
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
        >批量过账</el-button
      >
      <el-button
        type="warning"
        :disabled="!selected.length"
        :loading="batchUnposting"
        @click="handleBatchUnpost"
        >批量反过账</el-button
      >
      <span style="margin-left: 12px; color: #909399">已选 {{ selected.length }} 张</span>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import request from '@/api/request'
import VoucherAuditTable from '@/components/voucher/VoucherAuditTable.vue'
import BatchAuditDialog from '@/components/voucher/BatchAuditDialog.vue'
import VoucherDetailDialog from '@/components/voucher/VoucherDetailDialog.vue'
import { useVoucherAuditData } from '@/composables/useVoucherAuditData'
import { useVoucherAuditActions } from '@/composables/useVoucherAuditActions'
import { useBatchAuditDialog } from '@/composables/useBatchAuditDialog'

const {
  selected,
  dateRange,
  voucherTypes,
  filteredData,
  searchKeyword,
  sortField,
  sortOrder,
  clearSearch,
  isSelectableRow,
  getRowClass,
  onSelect,
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
