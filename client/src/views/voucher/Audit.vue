<template>
  <div class="page voucher-list-page">
    <div class="voucher-page-top">
      <h3 class="voucher-page-top-title">凭证管理</h3>
      <VoucherFilterBar
        layout="grouped"
        :filters="filters"
        :aux-categories="auxCategories"
        :voucher-types="voucherTypes"
        :accounts="accounts"
        :aux-items-map="auxItemsMap"
        enable-status
        enable-year-period
        enable-voucher-type
        enable-account
        enable-auxiliary
        enable-sort
        @search="fetchData"
        @sort-change="onSortChange"
        @load-accounts="loadAccounts"
        @load-aux-items="loadAuxItems"
      >
        <template #actions>
          <el-popover placement="bottom-start" :width="220" trigger="click">
            <template #reference>
              <el-button class="voucher-toolbar-btn" plain>
                <el-icon><Setting /></el-icon>
                列设置
              </el-button>
            </template>
            <div style="display: flex; flex-direction: column; gap: 8px">
              <div
                v-for="col in columnSettingsList"
                :key="col.prop"
                style="display: flex; align-items: center; gap: 8px"
              >
                <el-checkbox v-model="col.visible" @change="saveVisibleCols" />
                <span>{{ col.label }}</span>
              </div>
            </div>
          </el-popover>
          <el-button
            class="voucher-toolbar-btn"
            plain
            :loading="exporting"
            @click="exportData"
          >
            <el-icon><Download /></el-icon>
            导出 Excel
          </el-button>
          <el-button
            class="voucher-toolbar-btn"
            plain
            :disabled="!selected.length || selected.length > 1"
            @click="handleTurnTemplate"
          >
            转模版
          </el-button>
        </template>
      </VoucherFilterBar>
    </div>

    <VoucherAuditTable
      style="flex: 1; min-height: 0; overflow: hidden"
      :flat-list="flatList"
      :is-selectable-row="isSelectableRow"
      :get-row-class="getRowClass"
      :aux-categories="auxCategories"
      :selected-rows="selected"
      :can-unpost="canUnpostVoucher"
      :get-col-visible="getColVisible"
      :column-widths="columnWidths"
      @header-dragend="onColumnDragEnd"
      @selection-change="onSelect"
      @view-detail="viewDetail"
      @audit="audit"
      @unaudit="unAudit"
      @post="post"
      @unpost="unPost"
    />

    <div class="voucher-batch-bar">
      <!-- 正向操作 -->
      <el-button
        type="success"
        :disabled="!selected.length && !selectAllMode"
        @click="handleSelectedBatchAudit"
      >
        <el-icon><CircleCheck /></el-icon>
        批量审核
        <span v-if="selectAllMode" style="font-size: 12px">（全部 {{ pagination.total }} 条）</span>
      </el-button>
      <el-button
        type="success"
        :disabled="!selected.length && !selectAllMode"
        :loading="batchPosting"
        @click="handleBatchPost"
      >
        <el-icon><Checked /></el-icon>
        批量记账
        <span v-if="selectAllMode" style="font-size: 12px">（全部 {{ pagination.total }} 条）</span>
      </el-button>

      <el-divider direction="vertical" />

      <!-- 反向操作（危险） -->
      <el-button
        type="danger"
        plain
        :disabled="!selected.length && !selectAllMode"
        :loading="batchUnauditing"
        @click="handleBatchUnAudit"
      >
        <el-icon><CircleClose /></el-icon>
        批量反审核
        <span v-if="selectAllMode" style="font-size: 12px">（全部 {{ pagination.total }} 条）</span>
      </el-button>

      <el-divider direction="vertical" />

      <!-- 打印操作 -->
      <el-button-group>
        <el-button plain :disabled="!selected.length" @click="handlePrint">
          <el-icon><Printer /></el-icon>
          打印
        </el-button>
        <el-button plain @click="batchPrintVisible = true">
          <el-icon><Printer /></el-icon>
          批量打印
        </el-button>
      </el-button-group>

      <span class="batch-selected-text">
        {{
          selectAllMode
            ? `已选中全部 ${pagination.total} 条（跨所有分页）`
            : `已选 ${selected.length} 张`
        }}
      </span>
    </div>

    <div class="pagination-bar">
      <span class="pagination-text">共 {{ pagination.total }} 条</span>
      <el-select v-model="pagination.pageSize" style="width: 95px" @change="handlePageSizeChange">
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
      :can-unpost="canUnpostVoucher"
      @preview="handleBatchAuditPreviewWithPermission"
      @confirm="handleBatchAuditConfirm"
    />

    <VoucherDetailDialog
      v-model="detailVisible"
      :detail="detail"
      :can-unpost="canUnpostVoucher"
      @audit="handleDetailAudit"
      @unaudit="handleDetailUnAudit"
      @post="handleDetailPost"
      @unpost="handleDetailUnPost"
      @edit="handleDetailEdit"
    />

    <PrintDialog v-model="printDialogVisible" :voucher-ids="printVoucherIds" :mode="printMode" />

    <BatchPrintDialog v-model="batchPrintVisible" :default-date-range="filters.dateRange || []" />

    <!-- 任务进度对话框 -->
    <TaskProgressDialog
      v-model="taskProgressVisible"
      :task-id="currentTaskId"
      :task-type="currentTaskType"
      @completed="handleTaskCompleted"
    />

    <!-- 转模版对话框 -->
    <el-dialog v-model="templateDialogVisible" title="保存为模版" width="500px">
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模版编号" required>
          <el-input v-model="templateForm.template_no" placeholder="如：MB001" />
        </el-form-item>
        <el-form-item label="模版说明" required>
          <el-input v-model="templateForm.template_name" placeholder="如：差旅费报销" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="templateSaving" @click="handleTemplateConfirm"
          >确定</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onActivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Printer, CircleCheck, Checked, CircleClose, Download, Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/api/request'
import VoucherAuditTable from '@/components/voucher/VoucherAuditTable.vue'
import VoucherFilterBar from '@/components/voucher/VoucherFilterBar.vue'
import BatchAuditDialog from '@/components/voucher/BatchAuditDialog.vue'
import VoucherDetailDialog from '@/components/voucher/VoucherDetailDialog.vue'
import PrintDialog from '@/components/print/PrintDialog.vue'
import BatchPrintDialog from '@/components/print/BatchPrintDialog.vue'
import TaskProgressDialog from '@/components/task/TaskProgressDialog.vue'
import { useVoucherQuery } from '@/composables/useVoucherQuery'
import { useVoucherAuditActions } from '@/composables/useVoucherAuditActions'
import { useBatchAuditDialog } from '@/composables/useBatchAuditDialog'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { hasPermission } from '@/utils/permission'
import { exportVouchersToExcel, fetchAllVouchers } from '@/utils/voucherExport'
import { useSystemParamsStore } from '@/stores/systemParams'
import { extractErrorMessage } from '@/composables/useMessage'

const VIS_COL_KEY = 'voucher-audit-cols-visible'
const {
  widths: columnWidths,
  onDragEnd: onColumnDragEnd,
  load: reloadColumnWidths,
} = useColumnWidthMemory('voucher_audit')

interface ColSetting {
  prop: string
  label: string
  visible: boolean
  dynamic?: boolean
}

const baseVisibleCols: ColSetting[] = [
  { prop: 'voucher_date', label: '日期', visible: true },
  { prop: 'voucher_no', label: '凭证号', visible: true },
  { prop: 'voucher_type_name', label: '类型', visible: true },
  { prop: 'summary', label: '摘要', visible: true },
  { prop: 'account_code', label: '科目编码', visible: true },
  { prop: 'account_name', label: '科目名称', visible: true },
  { prop: 'debit_amt', label: '借方金额', visible: true },
  { prop: 'credit_amt', label: '贷方金额', visible: true },
  { prop: 'operator_info', label: '经办信息', visible: true },
  { prop: 'status', label: '状态', visible: true },
]

const visibleCols = ref<ColSetting[]>(baseVisibleCols.map(c => ({ ...c })))

function restoreVisibleCols() {
  const saved = JSON.parse(localStorage.getItem(VIS_COL_KEY) || 'null')
  if (!saved || !Array.isArray(saved)) return
  for (const s of saved) {
    const col = visibleCols.value.find(c => c.prop === s.prop)
    if (col) col.visible = s.visible
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

const columnSettingsList = computed(() => visibleCols.value)

const canUnpostVoucher = computed(() => hasPermission('voucher:unpost'))

// 使用 useVoucherQuery composable（启用排序功能）
const {
  filters,
  pagination,
  auxCategories,
  voucherTypes,
  accounts,
  auxItemsMap,
  flatList,
  fetchData,
  buildQueryParams,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  loadAuxCategories,
  loadVoucherTypes,
  loadAccounts,
  loadAuxItems,
} = useVoucherQuery({
  enableStatus: true,
  enableYearPeriod: true,
  enableVoucherType: true,
  enableAccount: true,
  enableAuxiliary: true,
  enableSort: true,
  enableSearchMemory: true,
  searchMemoryKey: 'voucher-audit-filters',
})

/** 从列表数据发现辅助列（computed 缓存，只在数据真正变化时重新计算） */
const discoveredDynamicCols = computed<ColSetting[]>(() => {
  const fixedCodes = new Set(['dept', 'project', 'supplier', 'person', 'func_class'])
  const result: ColSetting[] = []
  const seen = new Set<string>()

  const hasDept = flatList.value.some(
    row => row.dept_name && String(row.dept_name).trim() !== ''
  )
  const hasProject = flatList.value.some(
    row => row.project_name && String(row.project_name).trim() !== ''
  )
  if (hasDept && !seen.has('dept_name')) {
    seen.add('dept_name')
    result.push({ prop: 'dept_name', label: '部门', visible: true, dynamic: true })
  }
  if (hasProject && !seen.has('project_name')) {
    seen.add('project_name')
    result.push({ prop: 'project_name', label: '项目', visible: true, dynamic: true })
  }

  for (const row of flatList.value) {
    for (const key of Object.keys(row)) {
      if (!key.startsWith('_aux_') || !row[key]) continue
      if (seen.has(key)) continue
      const code = key.slice(5)
      if (fixedCodes.has(code)) continue
      const cat = auxCategories.value.find(c => c.code === code)
      if (!cat) continue
      seen.add(key)
      result.push({ prop: key, label: cat.name || code, visible: true, dynamic: true })
    }
  }
  return result
})

watch(discoveredDynamicCols, (dynamic) => {
  const kept = visibleCols.value.filter(c => !c.dynamic)
  const merged = [...kept]
  for (const col of dynamic) {
    const existing = visibleCols.value.find(c => c.prop === col.prop)
    merged.push(existing ? { ...existing } : { ...col })
  }
  visibleCols.value = merged
}, { immediate: true })

// 选择相关逻辑
const selected = ref<any[]>([])
const selectAllMode = ref(false) // 是否全选所有页

function isSelectableRow(row: any) {
  return row._voucherRowIndex === 0
}

function getRowClass({ row }: { row: any }) {
  const stripeClass = row._stripeGroup === 0 ? 'voucher-group-even' : 'voucher-group-odd'

  // 通过 _voucherId 检查当前凭证是否被选中
  const isSelected = selected.value.some((r: any) => r._voucherId === row._voucherId)

  // 返回斑马纹类名 + 选中类名
  return isSelected ? `${stripeClass} voucher-selected is-selected` : stripeClass
}

function onSelect(selection: any[]) {
  selected.value = selection

  // 判断是否全选了当前页
  const selectableRows = flatList.value.filter(isSelectableRow)
  const isCurrentPageFullSelected =
    selection.length > 0 && selection.length === selectableRows.length

  // 如果全选了当前页，且有多页数据，且不在全选模式，显示"全选所有页"的提示
  if (isCurrentPageFullSelected && pagination.total > pagination.pageSize && !selectAllMode.value) {
    // 显示提示：是否要全选所有页？
    showSelectAllPagesPrompt()
  } else if (selection.length === 0) {
    // 取消全选
    selectAllMode.value = false
  }
}

// 显示全选所有页的确认提示
function showSelectAllPagesPrompt() {
  ElMessageBox.confirm(
    `当前页已全选，是否要全选所有 ${pagination.total} 条凭证（跨所有分页）？`,
    '全选确认',
    {
      confirmButtonText: '全选所有',
      cancelButtonText: '仅当前页',
      type: 'info',
    }
  )
    .then(() => {
      // 用户确认全选所有
      selectAllMode.value = true
      ElMessage.success(`已选中全部 ${pagination.total} 条凭证（跨所有分页）`)
    })
    .catch(() => {
      // 用户取消，保持当前页全选
      selectAllMode.value = false
    })
}

const systemParamsStore = useSystemParamsStore()

const {
  detail,
  detailVisible,
  batchPosting,
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

// 转模版相关
const templateDialogVisible = ref(false)
const templateForm = ref({
  template_no: '',
  template_name: '',
})
const templateSaving = ref(false)

function handleTurnTemplate() {
  if (!selected.value.length || selected.value.length > 1) {
    ElMessage.warning('请先勾选一张凭证')
    return
  }
  templateForm.value = {
    template_no: '',
    template_name: '',
  }
  templateDialogVisible.value = true
}

async function handleTemplateConfirm() {
  if (!templateForm.value.template_no || !templateForm.value.template_name) {
    ElMessage.warning('请填写模版编号和模版说明')
    return
  }
  templateSaving.value = true
  try {
    await request.post('/voucher-templates', {
      template_no: templateForm.value.template_no,
      template_name: templateForm.value.template_name,
      voucher_id: selected.value[0].id || selected.value[0]._voucherId,
    })
    ElMessage.success('模版保存成功')
    templateDialogVisible.value = false
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '保存失败')
  } finally {
    templateSaving.value = false
  }
}

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
  if (!canUnpostVoucher.value) {
    ElMessage.warning('当前用户没有凭证反记账权限')
    return
  }

  await unPost(row)
  detailVisible.value = false
  await fetchData()
}

async function handleBatchAuditPreviewWithPermission() {
  if (batchAuditForm.value.operation === 'unpost' && !canUnpostVoucher.value) {
    ElMessage.warning('当前用户没有凭证反记账权限')
    batchAuditForm.value.operation = 'audit'
    return
  }

  await handleBatchAuditPreview()
}

function handleDetailEdit(row: any) {
  // 跳转到凭证录入页面编辑
  detailVisible.value = false
  router.push({ path: '/voucher/entry', query: { editVoucherId: row.id || row._voucherId } })
}

async function handleBatchUnAudit() {
  if (selectAllMode.value) {
    // 全选模式：二次确认
    try {
      await ElMessageBox.confirm(
        `即将批量反审核 ${pagination.total} 条凭证，此操作不可撤销，是否继续？`,
        '批量反审核确认',
        {
          confirmButtonText: '确认反审核',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )

      // 用户确认后，调用异步 API
      const params: any = {}
      if (filters.value.dateRange?.length === 2) {
        params.dateRange = filters.value.dateRange
      }
      if (filters.value.voucherTypeIds?.length > 0) {
        params.voucher_type_ids = filters.value.voucherTypeIds
      }

      const res = await request.post('/voucher/vouchers/batch-unaudit-async', params)
      currentTaskId.value = (res.data as any).taskId
      currentTaskType.value = 'batch-unaudit'
      taskProgressVisible.value = true
    } catch (error: any) {
      if (error === 'cancel') {
        // 用户取消操作
        return
      }
      ElMessage.error(extractErrorMessage(error,'创建批量反审核任务失败'))
    }
  } else {
    // 当前页模式：直接操作
    if (selected.value.length === 0) {
      ElMessage.warning('请先选择要反审核的凭证')
      return
    }
    await batchUnAudit(selected.value)
    // 当前页模式：操作完成后清空选中状态
    selected.value = []
  }

  // 注意：不清空 selectAllMode，让用户可以继续进行其他批量操作
  // 用户可以通过点击表头取消全选来退出全选模式
}

async function handleBatchPost() {
  if (selectAllMode.value) {
    // 全选模式：二次确认
    try {
      await ElMessageBox.confirm(
        `即将批量记账 ${pagination.total} 条凭证，此操作不可撤销，是否继续？`,
        '批量记账确认',
        {
          confirmButtonText: '确认记账',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )

      // 用户确认后，调用异步 API
      const params: any = {}
      if (filters.value.dateRange?.length === 2) {
        params.dateRange = filters.value.dateRange
      }
      if (filters.value.voucherTypeIds?.length > 0) {
        params.voucher_type_ids = filters.value.voucherTypeIds
      }

      const res = await request.post('/voucher/vouchers/batch-post-async', params)
      currentTaskId.value = (res.data as any).taskId
      currentTaskType.value = 'batch-post'
      taskProgressVisible.value = true
    } catch (error: any) {
      if (error === 'cancel') {
        // 用户取消操作
        return
      }
      ElMessage.error(extractErrorMessage(error,'创建批量记账任务失败'))
    }
  } else {
    // 当前页模式：直接操作
    if (selected.value.length === 0) {
      ElMessage.warning('请先选择要记账的凭证')
      return
    }
    await batchPost(selected.value)
    // 当前页模式：操作完成后清空选中状态
    selected.value = []
  }

  // 注意：不清空 selectAllMode，让用户可以继续进行其他批量操作
  // 用户可以通过点击表头取消全选来退出全选模式
}

async function handleBatchUnpost() {
  if (!canUnpostVoucher.value) {
    ElMessage.warning('当前用户没有凭证反记账权限')
    return
  }

  if (selectAllMode.value) {
    // 全选模式：二次确认
    try {
      await ElMessageBox.confirm(
        `即将批量反记账 ${pagination.total} 条凭证，此操作不可撤销，是否继续？`,
        '批量反记账确认',
        {
          confirmButtonText: '确认反记账',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )

      // 用户确认后，调用异步 API
      const params: any = {}
      if (filters.value.dateRange?.length === 2) {
        params.dateRange = filters.value.dateRange
      }
      if (filters.value.voucherTypeIds?.length > 0) {
        params.voucher_type_ids = filters.value.voucherTypeIds
      }

      const res = await request.post('/voucher/vouchers/batch-unpost-async', params)
      currentTaskId.value = (res.data as any).taskId
      currentTaskType.value = 'batch-unpost'
      taskProgressVisible.value = true
    } catch (error: any) {
      if (error === 'cancel') {
        // 用户取消操作
        return
      }
      ElMessage.error(extractErrorMessage(error,'创建批量反记账任务失败'))
    }
  } else {
    // 当前页模式：直接操作
    if (selected.value.length === 0) {
      ElMessage.warning('请先选择要反记账的凭证')
      return
    }
    await batchUnpost(selected.value)
    // 当前页模式：操作完成后清空选中状态
    selected.value = []
  }

  // 注意：不清空 selectAllMode，让用户可以继续进行其他批量操作
  // 用户可以通过点击表头取消全选来退出全选模式
}

const printDialogVisible = ref(false)
const printVoucherIds = ref<number[]>([])
const printMode = ref<'single' | 'batch'>('batch')
const batchPrintVisible = ref(false)
const exporting = ref(false)

// 任务进度对话框
const taskProgressVisible = ref(false)
const currentTaskId = ref('')
const currentTaskType = ref<'batch-audit' | 'batch-unaudit' | 'batch-post' | 'batch-unpost'>(
  'batch-audit'
)


function handlePrint() {
  if (!selected.value.length) return
  printVoucherIds.value = selected.value.map((v: any) => v.id || v._voucherId).filter(Boolean)
  printMode.value = 'batch'
  printDialogVisible.value = true
}

async function exportData() {
  exporting.value = true
  try {
    const vouchers = await fetchAllVouchers(buildQueryParams())
    await exportVouchersToExcel(vouchers, {
      sheetName: '凭证管理',
      filePrefix: '凭证管理',
    })
    ElMessage.success(`已导出 ${vouchers.length} 张凭证`)
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || error.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function handleSelectedBatchAudit() {
  if (selectAllMode.value) {
    // 全选模式：二次确认
    try {
      await ElMessageBox.confirm(
        `即将批量审核 ${pagination.total} 条凭证，此操作不可撤销，是否继续？`,
        '批量审核确认',
        {
          confirmButtonText: '确认审核',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )

      // 用户确认后，调用异步 API
      const params: any = {}
      if (filters.value.dateRange?.length === 2) {
        params.dateRange = filters.value.dateRange
      }
      if (filters.value.voucherTypeIds?.length > 0) {
        params.voucher_type_ids = filters.value.voucherTypeIds
      }
      // 注意：不传递 status 参数，让后端根据操作类型自动设置正确的状态

      const res = await request.post('/voucher/vouchers/batch-audit-async', params)
      currentTaskId.value = (res.data as any).taskId
      currentTaskType.value = 'batch-audit'
      taskProgressVisible.value = true
    } catch (error: any) {
      if (error === 'cancel') {
        // 用户取消操作
        return
      }
      ElMessage.error(extractErrorMessage(error,'创建批量审核任务失败'))
    }
  } else {
    // 当前页模式：直接操作
    if (selected.value.length === 0) {
      ElMessage.warning('请先选择要审核的凭证')
      return
    }
    await batchAudit(selected.value)
    // 当前页模式：操作完成后清空选中状态
    selected.value = []
  }

  // 注意：不清空 selectAllMode，让用户可以继续进行其他批量操作
  // 用户可以通过点击表头取消全选来退出全选模式
}

// 任务完成后的回调
function handleTaskCompleted() {
  // 刷新数据
  fetchData()
}

async function handleBatchAuditConfirm() {
  if (batchAuditForm.value.operation === 'unpost' && !canUnpostVoucher.value) {
    ElMessage.warning('当前用户没有凭证反记账权限')
    batchAuditForm.value.operation = 'audit'
    return
  }

  const [start_date, end_date] = batchAuditForm.value.dateRange || []
  const hasFilterCondition =
    Boolean(start_date) &&
    Boolean(end_date) &&
    Boolean(batchAuditForm.value.voucher_type_ids?.length)

  if (!hasFilterCondition && selected.value.length > 0) {
    await batchAudit(selected.value)
    selected.value = []
    batchAuditVisible.value = false
    return
  }

  await handleBatchAudit()
}

async function handlePageSizeChange(size: number) {
  if (size === -1 && pagination.total > 500) {
    try {
      await ElMessageBox.confirm(
        `当前共 ${pagination.total} 条记录，加载全部可能较慢，建议使用导出功能处理大量数据。是否继续？`,
        '加载全部',
        { type: 'warning', confirmButtonText: '继续加载', cancelButtonText: '取消' }
      )
    } catch {
      pagination.pageSize = 20
      return
    }
  }
  onPageSizeChange(size)
}

onMounted(async () => {
  restoreVisibleCols()
  await Promise.all([loadVoucherTypes(), systemParamsStore.load(), loadAuxCategories()])
  await fetchData()
})

onActivated(async () => {
  reloadColumnWidths()
  await Promise.all([loadVoucherTypes(), systemParamsStore.load(), loadAuxCategories()])
  await fetchData()
})

useKeyboardShortcuts([
  {
    key: 'e',
    ctrl: true,
    handler: () => {
      batchAuditVisible.value = true
    },
    description: 'Ctrl+E 批量操作',
  },
  { key: 'd', ctrl: true, handler: () => handleBatchUnpost(), description: 'Ctrl+D 批量反记账' },
])
</script>

<style src="./voucher.styles.css"></style>
