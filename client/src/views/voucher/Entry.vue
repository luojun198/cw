<template>
  <div class="page" v-loading="pageLoading" element-loading-text="加载凭证类型、科目等数据中...">
    <div class="page-header">
      <h3>凭证录入</h3>
      <div class="page-header-actions">
        <el-button type="success" plain :disabled="!selectedDraftId" @click="handleInsertDraft">插行</el-button>
        <el-button type="primary" plain :disabled="!selectedDraftId" @click="handleCopyDraft">复制新增</el-button>
        <el-button type="primary" plain :disabled="!selectedDraftId" @click="handleImportDraft">引入新增</el-button>
        <el-button type="warning" plain :disabled="!selectedDraftId" @click="handleTurnTemplate">转模版</el-button>
        <el-button type="warning" plain :disabled="!selectedDraftId" @click="handleImportTemplate">引模版</el-button>
        <el-divider direction="vertical" />
        <el-button type="primary" plain :disabled="!selectedDraftId" @click="handleEditDraft">编辑</el-button>
        <el-button type="danger" plain :disabled="!selectedDraftId" @click="handleDeleteDraftSelected">删除</el-button>
        <el-button type="info" plain :disabled="!selectedDraftId" @click="handlePrint">
          <el-icon><Printer /></el-icon>
          打印
        </el-button>
        <el-button type="info" plain @click="batchPrintVisible = true">
          <el-icon><Printer /></el-icon>
          批量打印
        </el-button>
        <el-button type="primary" @click="openVoucherDialog()">新增凭证</el-button>
      </div>
    </div>

    <VoucherDraftList
      ref="draftListRef"
      :vouchers="sortedVouchers"
      :loading="draftLoading"
      :sort-config="sortConfig"
      :aux-categories="auxCategories"
      @refresh="fetchDraftVouchers"
      @edit="handleEdit"
      @delete="handleDeleteDraft"
      @sort-change="handleSortChange"
      @row-click="handleDraftRowClick"
      @row-dblclick="handleDraftDblclick"
      @renumber="renumberDialogVisible = true"
      @batch-delete="batchDeleteVisible = true"
    />

    <VoucherBatchDelete
      v-model="batchDeleteVisible"
      :voucher-types="voucherTypes"
      @success="fetchDraftVouchers"
    />

    <PrintDialog
      v-model="printDialogVisible"
      :voucher-ids="printVoucherIds"
      mode="single"
    />

    <BatchPrintDialog v-model="batchPrintVisible" />

    <!-- 重新排号对话框 -->
    <el-dialog
      v-model="renumberDialogVisible"
      title="重新排号"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="年份">
          <el-input-number v-model="renumberForm.year" :min="2000" :max="2100" />
        </el-form-item>
        <el-form-item label="期间">
          <el-input-number v-model="renumberForm.period" :min="1" :max="12" />
        </el-form-item>
        <el-form-item label="凭证类型">
          <el-select v-model="renumberForm.voucher_type_id" clearable placeholder="全部类型" style="width: 100%">
            <el-option
              v-for="type in voucherTypes"
              :key="type.id"
              :label="type.name"
              :value="type.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="起始编号">
          <el-input-number v-model="renumberForm.start_no" :min="1" />
        </el-form-item>
        <el-alert
          title="提示"
          type="warning"
          :closable="false"
          show-icon
          style="margin-top: 12px"
        >
          <template #default>
            <div style="font-size: 13px; line-height: 1.6">
              <p style="margin: 0 0 8px 0">重新排号将按日期和创建时间顺序重新分配凭证编号</p>
              <p style="margin: 0">• 选择凭证类型：只对该类型的凭证重新排号</p>
              <p style="margin: 0">• 不选凭证类型：对所有类型的凭证统一排号</p>
            </div>
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="renumberDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleRenumber">确定</el-button>
      </template>
    </el-dialog>

    <VoucherEntryForm
      v-model="dialogVisible"
      :mode="dialogMode"
      :form="form"
      :current-entry="currentEntry"
      :voucher-types="voucherTypes"
      :accounts="accounts"
      :aux-categories="auxCategories"
      :total-debit="totalDebit"
      :total-credit="totalCredit"
      :is-balanced="isBalanced"
      :aux-items-by-category="auxItemsByCategory"
      :current-entry-aux-categories="currentEntryAuxCategories"
      :is-parent-account="isParentAccount"
      :get-aux-item-names="getAuxItemNames"
      :on-account-change="onAccountChange"
      :on-amount-change="onAmountChange"
      :add-entry="addEntry"
      :remove-entry="removeEntry"
      :set-current-entry="setCurrentEntry"
      :attachments="attachments"
      :update-attachments="updateAttachments"
      :submit-loading="submitLoading"
      :navigation-info="navigationInfo"
      @queue-upload="queuePendingUploads"
      @remove-queued-upload="removeQueuedUpload"
      @ai-summary="handleAiSummary"
      @submit="handleSubmit"
      @submit-and-add="handleSubmitAndAdd"
      @navigate="handleNavigate"
      @clear-current-entry="handleClearCurrentEntry"
      @add-aux-item="handleAddAuxItem"
      @quick-create-account="handleQuickCreateAccount"
      @print="handlePrintCurrent"
    />

    <AccountDialog
      v-model="quickAddAccountVisible"
      mode="add"
      title="快速新增科目"
      :form="accountForm"
      :parent-usage="parentUsage"
      :tree-select-data="treeSelectData"
      :get-available-cats="getAvailableCats"
      :get-aux-items-by-cat="getAuxItemsByCat"
      :on-aux-cat-change="onAuxCatChange"
      :add-aux="addAux"
      :remove-aux="removeAux"
      :saving="quickAccountSaving"
      @parent-change="handleQuickParentChange"
      @save="saveQuickAccount"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Printer } from '@element-plus/icons-vue'
import request from '@/api/request'
import VoucherDraftList from '@/components/voucher/VoucherDraftList.vue'
import VoucherBatchDelete from '@/components/voucher/VoucherBatchDelete.vue'
import VoucherEntryForm from '@/components/voucher/VoucherEntryForm.vue'
import AccountDialog from '@/components/base/AccountDialog.vue'
import PrintDialog from '@/components/print/PrintDialog.vue'
import BatchPrintDialog from '@/components/print/BatchPrintDialog.vue'
import { useVoucherForm } from '@/composables/useVoucherForm'
import { useAuxiliaryAccounting } from '@/composables/useAuxiliaryAccounting'
import { useAccountForm } from '@/composables/useAccountForm'
import { useAccountTree } from '@/composables/useAccountTree'
import { showSuccess, showError, showWarning, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm } from '@/composables/useConfirm'
import { useKeyboardShortcuts, commonShortcuts } from '@/composables/useKeyboardShortcuts'
import { useOperationHistory } from '@/composables/useOperationHistory'
import { performanceMonitor } from '@/utils/performanceMonitor'

const voucherTypes = ref<any[]>([])
const accounts = ref<any[]>([])
const auxCategories = ref<any[]>([])
const auxItems = ref<any[]>([])
const attachments = ref<any[]>([])
const queuedUploads = ref<Record<string, File>>({})
const draftVouchers = ref<any[]>([])
const draftLoading = ref(false)
const pageLoading = ref(false)
const submitLoading = ref(false)
const batchDeleteVisible = ref(false)
const printDialogVisible = ref(false)
const printVoucherIds = ref<number[]>([])
const batchPrintVisible = ref(false)
const draftListRef = ref<any>(null)
const selectedDraftId = ref<string>('')

function handleDraftRowClick(row: any) {
  // 点击行切换选中
  if (selectedDraftId.value === row._voucherId) {
    selectedDraftId.value = ''
  } else {
    selectedDraftId.value = row._voucherId
  }
}

function handleDraftDblclick(row: any) {
  // 双击直接打开编辑
  const voucher = sortedVouchers.value.find((v: any) => v.id === row._voucherId)
  if (voucher) handleEdit(voucher)
}

function handleEditDraft() {
  if (!selectedDraftId.value) return
  const row = sortedVouchers.value.find((v: any) => v.id === selectedDraftId.value)
  if (row) handleEdit(row)
}

function handleDeleteDraftSelected() {
  if (!selectedDraftId.value) return
  const row = sortedVouchers.value.find((v: any) => v.id === selectedDraftId.value)
  if (row) handleDeleteDraft(row)
}

function handlePrint() {
  if (!selectedDraftId.value) return
  const row = sortedVouchers.value.find((v: any) => v.id === selectedDraftId.value)
  if (row && row.id) {
    printVoucherIds.value = [row.id]
    printDialogVisible.value = true
  }
}

// 在编辑对话框内打印当前凭证
function handlePrintCurrent() {
  if (form.value.id) {
    printVoucherIds.value = [form.value.id]
    printDialogVisible.value = true
  }
}

async function handleInsertDraft() {
  if (!selectedDraftId.value) return
  const targetVoucher = sortedVouchers.value.find((v: any) => v.id === selectedDraftId.value)
  if (!targetVoucher) return

  // 直接设置插入模式，不走 openVoucherDialog（避免 resetForm 覆盖）
  dialogMode.value = 'insert'
  resetForm()
  attachments.value = []
  queuedUploads.value = {}
  currentVoucherIndex.value = sortedVouchers.value.indexOf(targetVoucher)
  insertTargetId.value = targetVoucher.id
  // 预填目标凭证的信息
  form.value.voucher_date = targetVoucher.voucher_date
  form.value.voucher_type_id = targetVoucher.voucher_type_id || ''
  form.value.voucher_no = targetVoucher.voucher_no || ''
  dialogVisible.value = true
}

function handleCopyDraft() {
  // TODO: 复制新增功能
}

function handleImportDraft() {
  // TODO: 引入新增功能
}

function handleTurnTemplate() {
  // TODO: 转模版功能
}

function handleImportTemplate() {
  // TODO: 引模版功能
}
const dialogVisible = ref(false)
const dialogMode = ref<'add' | 'edit' | 'insert'>('add')
const renumberDialogVisible = ref(false)
const renumberForm = ref({
  year: new Date().getFullYear(),
  period: new Date().getMonth() + 1,
  start_no: 1,
  voucher_type_id: null as string | null,
})

// ========== 导航相关状态 ==========
const currentVoucherIndex = ref(-1)
const insertTargetId = ref('')

// 排序配置
const sortConfig = ref({
  field: 'voucher_date' as 'voucher_no' | 'voucher_date' | 'created_at' | 'updated_at',
  order: 'asc' as 'asc' | 'desc',
})

// 提取凭证号序号（用于排序）
function extractVoucherSeq(voucherNo: string): number {
  if (!voucherNo) return 0
  const dashIndex = voucherNo.indexOf('-')
  if (dashIndex < 0) return parseInt(voucherNo, 10) || 0
  const seqStr = voucherNo.substring(dashIndex + 1)
  return parseInt(seqStr, 10) || 0
}

// 排序后的凭证列表
const sortedVouchers = computed(() => {
  const list = [...draftVouchers.value]
  const { field, order } = sortConfig.value

  list.sort((a, b) => {
    let aVal = a[field]
    let bVal = b[field]

    // 凭证号特殊处理：提取数字部分比较
    if (field === 'voucher_no') {
      aVal = extractVoucherSeq(aVal)
      bVal = extractVoucherSeq(bVal)
    }

    if (aVal < bVal) return order === 'asc' ? -1 : 1
    if (aVal > bVal) return order === 'asc' ? 1 : -1
    return 0
  })

  return list
})

// 导航信息
const navigationInfo = computed(() => {
  if (currentVoucherIndex.value < 0 || sortedVouchers.value.length === 0) return null
  return {
    current: currentVoucherIndex.value + 1,
    total: sortedVouchers.value.length,
    isFirst: currentVoucherIndex.value === 0,
    isLast: currentVoucherIndex.value === sortedVouchers.value.length - 1,
  }
})

const {
  form,
  currentEntry,
  totalDebit,
  totalCredit,
  isBalanced,
  addEntry,
  removeEntry,
  setCurrentEntry,
  resetForm,
  loadVoucher,
  ensureAuxFields,
} = useVoucherForm(auxCategories)

const {
  auxItemsByCategory,
  currentEntryAuxCategories,
  isParentAccount,
  getAuxItemNames,
  onAccountChange,
  onAmountChange,
  getAuxCategoryIds,
} = useAuxiliaryAccounting(accounts, auxCategories, auxItems, currentEntry)

// 快速新增科目
const tableRefForTree = ref<any>(null)
const {
  form: accountForm,
  parentUsage,
  getAvailableCats,
  getAuxItemsByCat,
  onAuxCatChange,
  addAux,
  removeAux,
  onParentChange,
  createAddForm,
  buildSavePayload,
} = useAccountForm(auxCategories, auxItems)
const { treeData, getTreeSelectData, flattenRows: treeFlattenRows } = useAccountTree(accounts, tableRefForTree)
const treeSelectData = computed(() => getTreeSelectData(accountForm.value.id))
const quickAddAccountVisible = ref(false)
const quickAddRow = ref<any>(null)
const quickAccountSaving = ref(false)

function handleQuickParentChange(parentId: string) {
  onParentChange(parentId, treeData.value, treeFlattenRows)
}

// 操作历史记录
const { addRecord } = useOperationHistory()

async function loadVoucherData(voucher: any) {
  loadVoucher(voucher)
  // 加载附件
  if (voucher.id) {
    await fetchAttachments(voucher.id)
  } else {
    attachments.value = []
  }
}

async function fetchAttachments(voucherId: string) {
  try {
    const res = await request.get<any[]>(`/voucher/vouchers/${voucherId}/attachments`)
    attachments.value = res.data || []
  } catch (error) {
    console.error('Failed to fetch attachments:', error)
    attachments.value = []
  }
}

function updateAttachments(newAttachments: any[]) {
  attachments.value = newAttachments
}

function queuePendingUploads(files: File[]) {
  const next = { ...queuedUploads.value }
  files.forEach(file => {
    const fileKey = `${file.name}_${file.size}_${file.lastModified}`
    next[fileKey] = file
  })
  queuedUploads.value = next
}

function removeQueuedUpload(fileKey: string) {
  if (!queuedUploads.value[fileKey]) {
    return
  }
  const next = { ...queuedUploads.value }
  delete next[fileKey]
  queuedUploads.value = next
}

async function uploadQueuedAttachments(voucherId: string) {
  const files = Object.values(queuedUploads.value)
  if (files.length === 0) {
    return
  }

  const failedNames: string[] = []

  for (const file of files) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      await request.post<any[]>(`/voucher/vouchers/${voucherId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    } catch (error) {
      failedNames.push(file.name)
      console.error('Queued attachment upload failed:', error)
    }
  }

  queuedUploads.value = {}

  if (failedNames.length === 0) {
    showSuccess(`已自动上传 ${files.length} 个附件`)
  } else {
    showWarning(`凭证已保存，但以下附件上传失败：${failedNames.join('、')}`)
  }
}

function openVoucherDialog(mode: 'add' | 'edit' | 'insert' = 'add', voucher?: any, index?: number) {
  dialogMode.value = mode
  if (mode === 'add' || mode === 'insert' || !voucher) {
    resetForm()
    attachments.value = []
    queuedUploads.value = {}
    currentVoucherIndex.value = -1
    if (mode === 'insert') insertTargetId.value = ''

    // 新增凭证时预填：取上一张凭证的类型，凭证号预览为同类型草稿最大号+1
    if (mode === 'add') {
      // 默认凭证类型：取上一张凭证（列表最后一个）的类型
      if (sortedVouchers.value.length > 0) {
        const lastVoucher = sortedVouchers.value[sortedVouchers.value.length - 1]
        form.value.voucher_type_id = lastVoucher.voucher_type_id || ''
      } else if (voucherTypes.value.length > 0) {
        form.value.voucher_type_id = voucherTypes.value[voucherTypes.value.length - 1].id
      }
      // 预览凭证号：取同凭证类型的草稿凭证最大号+1
      const typeId = form.value.voucher_type_id
      const sameTypeDrafts = sortedVouchers.value.filter((v: any) =>
        v.voucher_type_id === typeId && v.status === 'draft'
      )
      if (sameTypeDrafts.length > 0) {
        // 取最大序号
        let maxSeq = 0
        let prefix = ''
        let seqLen = 3
        for (const v of sameTypeDrafts) {
          const no = v.voucher_no || ''
          const dashIdx = no.indexOf('-')
          const seqStr = dashIdx >= 0 ? no.substring(dashIdx + 1) : no
          const seq = parseInt(seqStr, 10)
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq
            prefix = dashIdx >= 0 ? no.substring(0, dashIdx + 1) : ''
            seqLen = seqStr.length
          }
        }
        if (maxSeq > 0) {
          form.value.voucher_no = `${prefix}${String(maxSeq + 1).padStart(seqLen, '0')}`
        }
      }
    }
  } else {
    queuedUploads.value = {}

    // 编辑场景优先使用草稿列表中的完整凭证对象（而不是列表展平后的行数据）
    const sourceVoucher = mode === 'edit'
      ? sortedVouchers.value.find(v => v.id === voucher.id) || voucher
      : voucher

    loadVoucherData(sourceVoucher)

    const resolvedIndex = typeof index === 'number'
      ? index
      : sortedVouchers.value.findIndex(v => v.id === sourceVoucher.id)

    currentVoucherIndex.value = resolvedIndex
  }
  dialogVisible.value = true
}

function handleEdit(row: any) {
  const index = sortedVouchers.value.findIndex(v => v.id === row.id)
  const voucher = sortedVouchers.value[index] || row
  openVoucherDialog('edit', voucher, index)
}

// ========== 导航功能 ==========

// 加载指定索引的凭证
function loadVoucherAtIndex(index: number) {
  if (index < 0 || index >= sortedVouchers.value.length) return
  currentVoucherIndex.value = index
  const voucher = sortedVouchers.value[index]
  loadVoucherData(voucher)
}

// 导航到指定索引（带未保存检测）
async function navigateToVoucher(index: number) {
  if (index < 0 || index >= sortedVouchers.value.length) return

  // 简化版：直接导航，不检测未保存（后续可以增强）
  loadVoucherAtIndex(index)
}

// 首张
function goToFirst() {
  navigateToVoucher(0)
}

// 上一张
function goToPrevious() {
  if (currentVoucherIndex.value > 0) {
    navigateToVoucher(currentVoucherIndex.value - 1)
  }
}

// 下一张
function goToNext() {
  if (currentVoucherIndex.value < sortedVouchers.value.length - 1) {
    navigateToVoucher(currentVoucherIndex.value + 1)
  }
}

// 末张
function goToLast() {
  navigateToVoucher(sortedVouchers.value.length - 1)
}

// 处理导航事件
function handleNavigate(direction: 'first' | 'previous' | 'next' | 'last') {
  switch (direction) {
    case 'first':
      goToFirst()
      break
    case 'previous':
      goToPrevious()
      break
    case 'next':
      goToNext()
      break
    case 'last':
      goToLast()
      break
  }
}

// 切换排序方向
function toggleSortOrder() {
  sortConfig.value.order = sortConfig.value.order === 'asc' ? 'desc' : 'asc'
}

// 处理排序变化
function handleSortChange(config: { field: string; order: string }) {
  sortConfig.value.field = config.field as 'voucher_no' | 'voucher_date' | 'created_at' | 'updated_at'
  sortConfig.value.order = config.order as 'asc' | 'desc'
}

// 复制当前凭证
function handleClearCurrentEntry() {
  currentEntry.value = null
}

async function handleAddAuxItem(item: { id: string; name: string; type: string }, catCode: string) {
  // 刷新辅助项目列表
  const res = await request.get<any[]>('/base/aux-items')
  auxItems.value = res.data
  // 自动选中新建的项目
  if (currentEntry.value) {
    currentEntry.value[`_${catCode}_id`] = item.id
  }
}

function handleQuickCreateAccount(row: any) {
  quickAddRow.value = row
  accountForm.value = createAddForm()
  quickAddAccountVisible.value = true
}

async function saveQuickAccount() {
  quickAccountSaving.value = true
  try {
    const payload = buildSavePayload()
    await request.post('/base/accounts', payload)
    quickAddAccountVisible.value = false
    // 刷新科目列表
    await fetchOptions()
    // 自动选中新科目
    const acc = accounts.value.find((a: any) => a.code === payload.code)
    if (acc && quickAddRow.value) {
      quickAddRow.value.account_id = acc.id
      quickAddRow.value.account_code = acc.code
      quickAddRow.value.account_name = acc.name
      onAccountChange(quickAddRow.value)
      setCurrentEntry(quickAddRow.value)
    }
    showSuccess('科目新增成功')
  } catch (error: any) {
    showOperationError('新增科目', error)
  } finally {
    quickAccountSaving.value = false
  }
}

async function handleAiSummary() {
  try {
    const res = await request.post<{ summary: string }>('/voucher/vouchers/ai/summary', {
      entries: form.value.entries,
    })
    form.value.entries.forEach((e: any) => {
      if (!e.summary) e.summary = res.data.summary
    })
    showSuccess('AI 摘要已生成')
  } catch {
    /* ignore */
  }
}

async function handleSubmit() {
  if (!form.value.voucher_date) {
    showWarning('请选择凭证日期')
    return
  }
  if (Math.abs(totalDebit.value - totalCredit.value) > 0.01) {
    showError('借贷不平衡')
    return
  }

  const validEntries = form.value.entries.filter(
    (e: any) => e.account_id && ((e.debit_amount || 0) !== 0 || (e.credit_amount || 0) !== 0)
  )

  if (validEntries.length === 0) {
    showError('请填写完整的分录')
    return
  }

  for (const entry of validEntries) {
    const acc = accounts.value.find(a => a.id === entry.account_id)
    if (!acc?.is_aux) {
      continue
    }

    const requiredCategoryIds = getAuxCategoryIds(acc)
    const missingCategory = requiredCategoryIds.find(categoryId => {
      const category = auxCategories.value.find(cat => cat.id === categoryId)
      if (!category) {
        return false
      }
      return !entry[`_${category.code}_id`]
    })

    if (missingCategory) {
      const category = auxCategories.value.find(cat => cat.id === missingCategory)
      showError(
        `科目"${entry.account_name}"必须选择辅助核算项目：${category?.name || missingCategory}`
      )
      // 将焦点切换到出现问题的分录，便于用户修改
      setCurrentEntry(entry)
      return
    }

    // 校验自定义字段 required_in_voucher
    for (const categoryId of requiredCategoryIds) {
      const category = auxCategories.value.find(cat => cat.id === categoryId)
      if (!category || !entry[`_${category.code}_id`]) continue
      const requiredFields = (category.fields || []).filter((f: any) => f.is_enabled !== 0 && f.required_in_voucher)
      for (const field of requiredFields) {
        const fvKey = `_${category.code}_fv_${field.field_key}`
        if (!entry[fvKey] || String(entry[fvKey]).trim() === '') {
          showError(`科目"${entry.account_name}"的${category.name}→"${field.field_name}"为必填项`)
          setCurrentEntry(entry)
          return
        }
      }
    }
  }

  const payload = {
    ...form.value,
    entries: validEntries.map((e: any) => {
      const debit = e.debit_amount || 0
      const credit = e.credit_amount || 0
      return {
        ...e,
        direction: debit !== 0 ? 'debit' : 'credit',
        amount: debit !== 0 ? debit : credit,
      }
    }),
  }

  submitLoading.value = true
  try {
    if (dialogMode.value === 'insert' && insertTargetId.value) {
      // 插入模式
      const res = await request.post<{ id: string; voucher_no: string; updated_count: number }>(
        '/voucher/vouchers/insert',
        {
          target_voucher_id: insertTargetId.value,
          voucher: payload,
        }
      )
      const createdVoucherId = res.data?.id
      showSuccess(`插入成功，已更新 ${res.data?.updated_count || 0} 张凭证的编号`)
      addRecord('create', '凭证录入', `插入凭证：${form.value.voucher_date}`)
      if (createdVoucherId) {
        await uploadQueuedAttachments(createdVoucherId)
      }
    } else if (dialogMode.value === 'edit' && form.value.id) {
      // 编辑模式
      await request.put(`/voucher/vouchers/${form.value.id}`, payload)
      showSuccess('凭证修改成功')
      addRecord('update', '凭证录入', `修改凭证：${form.value.voucher_date}`)
    } else {
      // 新增模式
      const created = await request.post<{ id: string; voucherNo: string }>('/voucher/vouchers', payload)
      const createdVoucherId = created.data?.id
      showSuccess('凭证保存成功')
      addRecord('create', '凭证录入', `新增凭证：${form.value.voucher_date}`)
      if (createdVoucherId) {
        await uploadQueuedAttachments(createdVoucherId)
      }
    }

    dialogVisible.value = false
    resetForm()
    attachments.value = []
    queuedUploads.value = {}
    currentVoucherIndex.value = -1
    insertTargetId.value = ''
    await fetchDraftVouchers()
  } catch (error) {
    showOperationError(dialogMode.value === 'edit' ? '修改凭证' : '保存凭证', error)
  } finally {
    submitLoading.value = false
  }
}

async function handleSubmitAndAdd() {
  await handleSubmit()
  // handleSubmit 成功后 dialogVisible 会变为 false，再重新打开新增
  if (!dialogVisible.value) {
    await nextTick()
    openVoucherDialog('add')
  }
}

async function fetchDraftVouchers() {
  draftLoading.value = true
  try {
    await performanceMonitor.measure('fetchDraftVouchers', async () => {
      const res = await request.get<any[]>('/voucher/vouchers', {
        params: {
          status: 'draft',
          page: 1,
          pageSize: 100,
        },
      })
      draftVouchers.value = res.data || []
    })
  } finally {
    draftLoading.value = false
  }
}

async function handleDeleteDraft(row: any) {
  const confirmed = await useDeleteConfirm(`未审核凭证「${row.voucher_no}」`)
  if (!confirmed) return

  try {
    await request.delete(`/voucher/vouchers/${row.id}`)
    showSuccess('删除成功')
    addRecord('delete', '凭证录入', `删除凭证：${row.voucher_no}`)
    await fetchDraftVouchers()
  } catch (error) {
    showOperationError('删除', error)
  }
}

async function handleRenumber() {
  try {
    const res = await request.post<{ updated: number }>('/voucher/vouchers/renumber', renumberForm.value)
    showSuccess(res.data ? `已完成 ${res.data.updated} 张凭证的重新排号` : '重新排号成功')
    renumberDialogVisible.value = false
    await fetchDraftVouchers()
    addRecord('update', '凭证录入', `重新排号：${renumberForm.value.year}年${renumberForm.value.period}期`)
  } catch (error) {
    showOperationError('重新排号', error)
  }
}

async function fetchOptions() {
  await performanceMonitor.measure('fetchOptions', async () => {
    const [typeRes, accRes, catRes, auxRes] = await Promise.all([
      request.get<any[]>('/base/voucher-types'),
      request.get<any[]>('/base/accounts', { params: { is_enabled: 1 } }),
      request.get<any[]>('/base/aux-categories'),
      request.get<any[]>('/base/aux-items'),
    ])
    voucherTypes.value = typeRes.data
    accounts.value = accRes.data
    auxCategories.value = catRes.data
    auxItems.value = auxRes.data

    // 加载完辅助核算类别后，为现有分录补充动态字段
    ensureAuxFields()
  })
}

const route = useRoute()
const router = useRouter()

function handleActionQuery() {
  if (route.query.action === 'add') {
    router.replace({ query: {} })
    nextTick(() => {
      openVoucherDialog('add')
    })
  }
}

onMounted(async () => {
  pageLoading.value = true
  try {
    await Promise.all([fetchOptions(), fetchDraftVouchers()])
  } finally {
    pageLoading.value = false
  }
  handleActionQuery()
})

onActivated(() => {
  fetchOptions()
  fetchDraftVouchers()
  handleActionQuery()
})

// 键盘快捷键
useKeyboardShortcuts([
  commonShortcuts.add(() => openVoucherDialog('add')),
  commonShortcuts.refresh(() => fetchDraftVouchers()),
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
</style>
