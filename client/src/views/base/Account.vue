<template>
  <div class="page account-page">
    <div class="page-header account-header">
      <div class="account-title">
        <h3>会计科目</h3>
        <span>{{ accountCountLabel }}</span>
      </div>
      <div class="account-toolbar">
        <el-button-group class="level-actions">
          <el-button size="small" title="全部收拢 (Ctrl+\)" @click="collapseAll">顶层</el-button>
          <el-button size="small" title="上一级 (Ctrl+↑)" @click="goUpLevel">上级</el-button>
          <el-button size="small" title="下一级 (Ctrl+↓)" @click="goDownLevel">下级</el-button>
          <el-button size="small" title="全部展开 (Ctrl+Shift+\)" @click="expandAll">底层</el-button>
        </el-button-group>
        <el-input
          v-model="keyword"
          placeholder="搜索科目编码或名称"
          class="account-search"
          size="small"
          clearable
          @input="onSearchInput"
          @clear="onSearchClear"
        />
        <div
          class="account-quick-filter-wrap"
          :class="{ 'is-active': quickFilterValues.length > 0 }"
        >
          <span class="account-quick-filter-badge" aria-hidden="true">
            <el-icon><Filter /></el-icon>
            <em v-if="quickFilterValues.length > 0">{{ quickFilterValues.length }}</em>
          </span>
          <el-select
            v-model="quickFilterValues"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="1"
            clearable
            filterable
            placeholder="快速筛选"
            class="account-quick-filter"
            popper-class="account-quick-filter-popper"
            size="small"
            @change="handleQuickFilterChange"
          >
            <el-option
              v-for="option in ACCOUNT_QUICK_FILTER_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            >
              <div class="quick-filter-option">
                <span :class="['quick-filter-option__icon', `is-${option.tone}`]">
                  <el-icon>
                    <Money v-if="option.value === 'cash'" />
                    <CreditCard v-else-if="option.value === 'bank'" />
                    <WarningFilled v-else />
                  </el-icon>
                </span>
                <span class="quick-filter-option__label">{{ option.label }}</span>
              </div>
            </el-option>
            <el-option-group v-if="auxCategories.length > 0" label="辅助核算">
              <el-option
                v-for="cat in auxCategories"
                :key="cat.id"
                :label="cat.name"
                :value="buildAuxQuickFilterValue(cat.id)"
              >
                <div class="quick-filter-option">
                  <span class="quick-filter-option__icon is-aux">
                    <el-icon><CollectionTag /></el-icon>
                  </span>
                  <span class="quick-filter-option__label">{{ cat.name }}</span>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
        </div>
        <el-dropdown trigger="click" @command="handleAddAccountCommand">
          <el-button type="primary" size="small">
            <el-icon><Plus /></el-icon>
            新增科目
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="sibling">增加同级科目</el-dropdown-item>
              <el-dropdown-item command="child" :disabled="!canAddChildAccount">
                增加子科目
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-button plain size="small" :disabled="list.length === 0" @click="exportData">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
        <el-button plain size="small" @click="importDialogVisible = true">
          <el-icon><Upload /></el-icon>
          导入
        </el-button>
        <el-switch
          v-model="showDisabled"
          active-text="显示禁用"
          inactive-text=""
          class="disabled-switch"
          @change="fetchData"
        />
      </div>
    </div>

    <el-table
      ref="tableRef"
      :data="displayData"
      stripe
      border
      size="small"
      highlight-current-row
      height="calc(100vh - 108px)"
      :row-style="{ height: '30px' }"
      :cell-style="{ padding: '0' }"
      :header-cell-style="{ padding: '4px 0' }"
      row-key="id"
      class="account-table"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :expand-row-keys="expandedKeys"
      @current-change="handleCurrentChange"
      @row-click="handleRowClick"
      @row-dblclick="handleRowDblClick"
      @header-dragend="onDragEnd"
      @expand-change="handleExpandChange"
    >
      <el-table-column prop="code" label="科目编码" :width="getColumnWidth('code', 120)">
        <template #default="{ row }">
          <span
            :style="{
              paddingLeft: `${((row._depth || row.level || 1) - 1) * 14}px`,
              display: 'inline-block',
            }"
            class="account-code"
            >{{ getDisplayText(row.code) }}</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="name" label="科目名称" :width="getColumnWidth('name')">
        <template #default="{ row }">
          <span
            :style="{
              paddingLeft: `${((row._depth || row.level || 1) - 1) * 14}px`,
              display: 'inline-block',
            }"
            class="account-name"
            >{{ getDisplayText(row.name) }}</span
          >
        </template>
      </el-table-column>
      <el-table-column label="方向" width="76">
        <template #default="{ row }">
          <el-tag :type="row.direction === 'debit' ? 'primary' : 'warning'" size="small" effect="plain">
            {{ row.direction === 'debit' ? '借方' : '贷方' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="现金" width="52" align="center">
        <template #default="{ row }">
          <span v-if="row.is_cash" class="mini-flag">是</span>
        </template>
      </el-table-column>
      <el-table-column label="银行" width="52" align="center">
        <template #default="{ row }">
          <span v-if="row.is_bank" class="mini-flag bank">是</span>
        </template>
      </el-table-column>
      <el-table-column label="辅助核算" min-width="220">
        <template #default="{ row }">
          <div v-if="row.is_aux" class="aux-tags">
            <el-tag
              v-for="name in getAuxNames(row)"
              :key="name"
              type="info"
              size="small"
              >{{ name }}</el-tag
            >
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="68">
        <template #default="{ row }">
          <el-tag :type="row.is_enabled ? 'success' : 'info'" size="small" effect="plain">{{
            row.is_enabled ? '启用' : '禁用'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="112" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog('edit', row)"
            >编辑</el-button
          >
          <el-button
            link
            type="danger"
            size="small"
            :disabled="!row.allow_delete"
            @click="handleDelete(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <AccountDialog
      v-model="dialogVisible"
      :mode="dialogType"
      :title="dialogTitle"
      :form="form"
      :parent-usage="parentUsage"
      :children-count="childrenCount"
      :tree-select-data="treeSelectData"
      :get-available-cats="getAvailableCats"
      :get-aux-items-by-cat="getAuxItemsByCat"
      :on-aux-cat-change="onAuxCatChange"
      :add-aux="addAux"
      :remove-aux="removeAux"
      :saving="saving"
      @parent-change="handleParentChange"
      @save="handleSave"
      @save-and-add="handleSaveAndAdd"
    />

    <!-- 批量导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="批量导入会计科目" width="600px">
      <div class="import-tips">
        <p>
          1. 请先
          <el-link type="primary" @click="downloadTemplate">下载导入模板</el-link
          >，按模板格式填写数据
        </p>
        <p>2. 科目编码、名称、余额方向为必填；上级科目编码需已存在</p>
        <p>3. 每个辅助类别有独立列：辅助-XXX 填"是/否"标识是否启用，默认项目-XXX 填项目名称</p>
      </div>
      <el-upload
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="onImportFileChange"
        :on-exceed="() => showError('只能上传一个文件')"
        drag
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">拖拽文件到此处，或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx / .xls 格式</div>
        </template>
      </el-upload>

      <div v-if="importPreview.length > 0" class="import-preview">
        <el-alert
          :title="`解析成功：${importPreview.length} 条数据`"
          type="success"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <el-table :data="importPreview.slice(0, 10)" stripe border size="small" max-height="240">
          <el-table-column prop="code" label="科目编码" width="100" />
          <el-table-column prop="name" label="科目名称" />
          <el-table-column prop="direction" label="余额方向" width="80" />
          <el-table-column prop="parent_code" label="上级编码" width="100" />
          <el-table-column prop="aux_desc" label="辅助核算" />
        </el-table>
        <div v-if="importPreview.length > 10" class="import-more-hint">
          仅展示前 10 条，共 {{ importPreview.length }} 条
        </div>
      </div>

      <template #footer>
        <el-button
          @click="importDialogVisible = false; importPreview = []"
          >取消</el-button
        >
        <el-button
          type="primary"
          :disabled="importPreview.length === 0"
          :loading="importing"
          @click="handleImport"
        >
          确认导入（{{ importPreview.length }} 条）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onBeforeUnmount } from 'vue'
import type { UploadFile } from 'element-plus'
import {
  Upload,
  Plus,
  Download,
  ArrowDown,
  Filter,
  Money,
  CreditCard,
  WarningFilled,
  CollectionTag,
} from '@element-plus/icons-vue'
import request from '@/api/request'
import AccountDialog from '@/components/base/AccountDialog.vue'
import { useAccountTree } from '@/composables/useAccountTree'
import { useAccountForm } from '@/composables/useAccountForm'
import { showSuccess, showError, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm } from '@/composables/useConfirm'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { useOperationHistory } from '@/composables/useOperationHistory'
import { performanceMonitor } from '@/utils/performanceMonitor'
import { useBaseDataStore } from '@/stores/baseData'
import { filterAuxCategoriesForAccount } from '@/utils/accountCashFlow'
import { exportStyledTable, type ExportColumnDef } from '@/utils/exportStyledExcel'
import {
  ACCOUNT_QUICK_FILTER_OPTIONS,
  buildAuxQuickFilterValue,
  filterAccountsWithAncestors,
} from '@/utils/accountQuickFilter'

const list = ref<any[]>([])
const keyword = ref('')
const quickFilterValues = ref<string[]>([])
const showDisabled = ref(false)
const tableRef = ref<any>(null)
const dialogVisible = ref(false)
const dialogType = ref<'add' | 'edit'>('add')
const saving = ref(false)
const auxCategories = ref<any[]>([])
const auxItems = ref<any[]>([])
const allAccountsForCode = ref<any[]>([])
const accountLevels = ref(6)
const accountCodeLengths = ref([4, 2, 2, 2, 2, 2, 2, 2, 2, 2])

type AddAccountCommand = 'sibling' | 'child'

const dialogTitle = computed(() => (dialogType.value === 'add' ? '新增科目' : '编辑科目'))

const effectiveList = computed(() => {
  let rows = list.value
  if (quickFilterValues.value.length > 0) {
    rows = filterAccountsWithAncestors(rows, quickFilterValues.value)
  }
  return rows
})

const {
  treeData,
  currentRow,
  expandedKeys,
  expandAll,
  collapseAll,
  goUpLevel,
  goDownLevel,
  handleCurrentChange,
  handleRowClick,
  restoreCurrentRow,
  flatList,
  getTreeSelectData,
  handleExpandChange,
} = useAccountTree(effectiveList, tableRef)

const {
  form,
  parentUsage,
  getAuxItemsByCat,
  getAvailableCats,
  onAuxCatChange,
  addAux,
  removeAux,
  getAuxNames,
  createAddForm,
  createEditForm,
  buildSavePayload,
} = useAccountForm(auxCategories, auxItems)

const treeSelectData = computed(() => getTreeSelectData(form.value.id))

// 计算当前编辑科目的子科目数量
const childrenCount = computed(() => {
  if (!form.value?.id) return 0
  return flatList.value.filter(row => row.parent_id === form.value.id).length
})

// 搜索时直接用后端数据（扁平），非搜索时用树形结构
const displayData = computed(() => (keyword.value ? effectiveList.value : treeData.value))

const accountCountLabel = computed(() => {
  const total = list.value.length
  const filtered = keyword.value || quickFilterValues.value.length > 0
  if (!filtered) return `${total} 个科目`
  const shown = keyword.value ? effectiveList.value.length : flatList.value.length
  return `${shown} / ${total} 个科目`
})

const canAddChildAccount = computed(() => {
  const row = getCurrentAccountForCode()
  return Boolean(row && getAccountLevel(row) < accountLevels.value)
})

// 列宽记忆
const { getColumnWidth, onDragEnd, load, bindTable } = useColumnWidthMemory('account-table')
bindTable(tableRef)

// 搜索防抖
let searchTimer: ReturnType<typeof setTimeout> | null = null
let fetchDataSeq = 0

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    fetchData()
  }, 300)
}

function onSearchClear() {
  if (searchTimer) clearTimeout(searchTimer)
  keyword.value = ''
  fetchData()
}

function handleQuickFilterChange() {
  if (quickFilterValues.value.length > 0) {
    expandAll()
  }
}

// 操作历史
const { addRecord } = useOperationHistory()

// 搜索高亮（移除 v-html 以保持树形缩进）
function getDisplayText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return ''
  return String(text)
}

async function fetchData() {
  const currentSeq = ++fetchDataSeq
  await performanceMonitor.measure('fetchAccountData', async () => {
    const params: any = { is_enabled: showDisabled.value ? '' : 1 }
    if (keyword.value) params.keyword = keyword.value
    const [accRes, catRes, auxRes, allAccRes, paramRes] = await Promise.all([
      request.get<any[]>('/base/accounts', { params }),
      request.get<any[]>('/base/aux-categories'),
      request.get<any[]>('/base/aux-items'),
      request.get<any[]>('/base/accounts', { params: { is_enabled: '' } }),
      request.get<any[]>('/system/params'),
    ])
    if (currentSeq !== fetchDataSeq) return
    list.value = accRes.data
    auxCategories.value = filterAuxCategoriesForAccount(catRes.data || [])
    auxItems.value = auxRes.data
    allAccountsForCode.value = allAccRes.data || []
    applyAccountCodeParams(paramRes.data || [])
    await restoreCurrentRow()
  })
}

async function fetchAuxOptions() {
  const [catRes, auxRes] = await Promise.all([
    request.get<any[]>('/base/aux-categories'),
    request.get<any[]>('/base/aux-items'),
  ])
  auxCategories.value = filterAuxCategoriesForAccount(catRes.data || [])
  auxItems.value = auxRes.data
}

function applyAccountCodeParams(params: any[]) {
  for (const p of params) {
    if (p.param_key === 'account_levels') {
      accountLevels.value = parseInt(p.param_value) || 6
    } else if (p.param_key === 'account_code_lengths') {
      try {
        const lengths = JSON.parse(p.param_value)
        if (Array.isArray(lengths) && lengths.length > 0) {
          accountCodeLengths.value = lengths.map((len: any) => Number(len) || 2)
        }
      } catch {
        /* 保持默认级次长度 */
      }
    }
  }
}

function getCurrentAccountForCode() {
  const id = currentRow.value?.id
  if (!id) return null
  return allAccountsForCode.value.find(row => row.id === id) || currentRow.value
}

function normalizeParentId(parentId: any) {
  return parentId || null
}

function findAccountById(id: string | null | undefined) {
  if (!id) return null
  return allAccountsForCode.value.find(row => row.id === id) || null
}

function getSegmentLength(level: number) {
  return accountCodeLengths.value[level - 1] || 2
}

function getCumulativeCodeLength(level: number) {
  return accountCodeLengths.value.slice(0, level).reduce((sum, len) => sum + (Number(len) || 0), 0)
}

function getLevelByCodeLength(code: string): number | null {
  for (let level = 1; level <= accountLevels.value; level++) {
    if (code.length === getCumulativeCodeLength(level)) return level
  }
  return null
}

function getCodeLengthDescription(level: number) {
  return accountCodeLengths.value.slice(0, level).join('-')
}

function validateAccountCodeByParams(): number | null {
  const code = String(form.value.code || '').trim()
  if (!code) {
    showError('请输入科目编码')
    return null
  }
  if (!/^\d+$/.test(code)) {
    showError('科目编码只能包含数字')
    return null
  }

  const parent = findAccountById(form.value.parent_id)
  const expectedLevel = parent ? getAccountLevel(parent) + 1 : getLevelByCodeLength(code)
  if (!expectedLevel || expectedLevel > accountLevels.value) {
    showError(`科目编码长度不符合当前科目长度设置（${accountCodeLengths.value.slice(0, accountLevels.value).join('-')}）`)
    return null
  }

  if (parent && !code.startsWith(String(parent.code || ''))) {
    showError('科目编码必须以上级科目编码开头')
    return null
  }

  const expectedLength = getCumulativeCodeLength(expectedLevel)
  if (code.length !== expectedLength) {
    showError(
      `第${expectedLevel}级科目编码长度应为${expectedLength}位（${getCodeLengthDescription(expectedLevel)}）`
    )
    return null
  }

  return expectedLevel
}

function getAccountLevel(row: any) {
  const explicitLevel = Number(row?.level)
  if (explicitLevel > 0) return explicitLevel

  const codeLength = String(row?.code || '').length
  let cumulative = 0
  for (let index = 0; index < accountCodeLengths.value.length; index++) {
    cumulative += Number(accountCodeLengths.value[index]) || 0
    if (codeLength <= cumulative) return index + 1
  }
  return 1
}

function getSiblingAccounts(parentId: string | null, level: number) {
  const expectedLength = getCumulativeCodeLength(level)
  return allAccountsForCode.value.filter(row => {
    const sameParent = normalizeParentId(row.parent_id) === normalizeParentId(parentId)
    if (!sameParent) return false
    const code = String(row.code || '')
    return getAccountLevel(row) === level || code.length === expectedLength
  })
}

function buildNextCode(parent: any | null, level: number) {
  const segmentLength = getSegmentLength(level)
  const parentId = parent?.id || null
  const prefix = parent?.code ? String(parent.code) : ''
  const siblings = getSiblingAccounts(parentId, level)
  const maxNo = siblings.reduce((max, row) => {
    const code = String(row.code || '')
    if (!code.startsWith(prefix)) return max
    const suffixNo = parseInt(code.slice(prefix.length), 10)
    return Number.isFinite(suffixNo) ? Math.max(max, suffixNo) : max
  }, 0)
  const nextNo = maxNo + 1
  const maxNoInLevel = Math.pow(10, segmentLength) - 1
  if (nextNo > maxNoInLevel) return ''
  return `${prefix}${String(nextNo).padStart(segmentLength, '0')}`
}

function buildNextRootSiblingCode(currentAccount: any) {
  const segmentLength = getSegmentLength(1)
  const currentNo = parseInt(String(currentAccount?.code || ''), 10)
  if (!Number.isFinite(currentNo)) return buildNextCode(null, 1)

  const usedCodes = new Set(allAccountsForCode.value.map(row => String(row.code || '')))
  const maxNoInLevel = Math.pow(10, segmentLength) - 1
  for (let nextNo = currentNo + 1; nextNo <= maxNoInLevel; nextNo++) {
    const code = String(nextNo).padStart(segmentLength, '0')
    if (!usedCodes.has(code)) return code
  }
  return ''
}

function buildNextSiblingCode(currentAccount: any | null, parent: any | null, level: number) {
  if (currentAccount && !currentAccount.parent_id) {
    return buildNextRootSiblingCode(currentAccount)
  }
  return buildNextCode(parent, level)
}

async function loadParentUsage(parentId: string | null) {
  parentUsage.value = null
  if (!parentId) return
  try {
    const res = await request.get<any>(`/base/accounts/${parentId}/usage`)
    if (res.code === 0 && res.data.voucherCount > 0) {
      parentUsage.value = res.data
    }
  } catch {
    /* 不阻塞新增科目 */
  }
}

async function handleAddAccountCommand(command: AddAccountCommand) {
  await openAddDialog(command)
}

async function openAddDialog(command: AddAccountCommand) {
  await fetchAuxOptions()
  dialogType.value = 'add'
  parentUsage.value = null

  const currentAccount = getCurrentAccountForCode()
  let parent: any | null = null
  let level = 1
  let direction = currentAccount?.direction || 'debit'

  if (command === 'child') {
    if (!currentAccount) {
      showError('请先选中一个科目')
      return
    }
    const currentLevel = getAccountLevel(currentAccount)
    if (currentLevel >= accountLevels.value) {
      showError('当前科目已经是最末级，不能再增加子科目')
      return
    }
    parent = currentAccount
    level = currentLevel + 1
    direction = currentAccount.direction || 'debit'
  } else if (currentAccount?.parent_id) {
    parent = findAccountById(currentAccount.parent_id)
    level = getAccountLevel(currentAccount)
    direction = currentAccount.direction || parent?.direction || 'debit'
  }

  const code =
    command === 'sibling'
      ? buildNextSiblingCode(currentAccount, parent, level)
      : buildNextCode(parent, level)
  if (!code) {
    showError('当前级次科目编码已用完')
    return
  }

  form.value = {
    ...createAddForm(parent?.id),
    parent_id: parent?.id || null,
    code,
    level,
    direction,
  }
  await loadParentUsage(parent?.id || null)
  dialogVisible.value = true
}

async function openDialog(type: 'edit', row?: any) {
  await fetchAuxOptions()
  dialogType.value = type
  parentUsage.value = null
  form.value = createEditForm(row)
  dialogVisible.value = true
}

function handleRowDblClick(row: any) {
  if (!row?.id) return
  currentRow.value = row
  tableRef.value?.setCurrentRow(row)
  openDialog('edit', row)
}

async function handleParentChange(parentId: string | null) {
  const parent = findAccountById(parentId)
  if (!parent) {
    form.value.parent_id = null
    form.value.code = buildNextCode(null, 1)
    form.value.level = 1
    await loadParentUsage(null)
    return
  }

  const parentLevel = getAccountLevel(parent)
  if (parentLevel >= accountLevels.value) {
    showError('当前科目已经是最末级，不能再增加子科目')
    form.value.parent_id = null
    return
  }

  const childLevel = parentLevel + 1
  const code = buildNextCode(parent, childLevel)
  if (!code) {
    showError('当前级次科目编码已用完')
    return
  }

  form.value.code = code
  form.value.direction = parent.direction || 'debit'
  form.value.level = childLevel
  await loadParentUsage(parent.id)
}

async function prepareNextAddFormAfterSave() {
  const savedParentId = form.value.parent_id || null
  const savedLevel = form.value.level
  const savedDirection = form.value.direction || 'debit'
  const savedCode = form.value.code
  const savedParent = findAccountById(savedParentId)

  const nextCode = buildNextSiblingCode(
    { code: savedCode, parent_id: savedParentId, level: savedLevel },
    savedParent,
    savedLevel
  )
  if (!nextCode) {
    showError('当前级次科目编码已用完')
    dialogVisible.value = false
    return
  }

  form.value = {
    ...createAddForm(savedParentId),
    parent_id: savedParentId,
    code: nextCode,
    level: savedLevel,
    direction: savedDirection,
    migrate_from_parent: false,
  }
  parentUsage.value = null
  await loadParentUsage(savedParentId)
}

async function handleSave(options?: { keepOpen?: boolean }) {
  saving.value = true
  try {
    const expectedLevel = dialogType.value === 'add' ? validateAccountCodeByParams() : null
    if (dialogType.value === 'add' && !expectedLevel) return

    const payload = buildSavePayload()
    if (dialogType.value === 'add' && expectedLevel) {
      payload.code = String(payload.code || '').trim()
      payload.level = expectedLevel
    }
    if (dialogType.value === 'add') {
      await request.post('/base/accounts', payload)
      showSuccess('科目新增成功')
      addRecord('create', '会计科目', `新增科目：${form.value.code} ${form.value.name}`)
      useBaseDataStore().invalidate()
      await fetchData()
      if (options?.keepOpen) {
        await prepareNextAddFormAfterSave()
      } else {
        dialogVisible.value = false
      }
    } else {
      await request.put(`/base/accounts/${form.value.id}`, payload)
      showSuccess('科目修改成功')
      addRecord('update', '会计科目', `修改科目：${form.value.code} ${form.value.name}`)
      useBaseDataStore().invalidate()
      dialogVisible.value = false
      await fetchData()
    }
  } catch (error) {
    showOperationError(dialogType.value === 'add' ? '新增科目' : '修改科目', error)
  } finally {
    saving.value = false
  }
}

async function handleSaveAndAdd() {
  if (dialogType.value !== 'add') return
  await handleSave({ keepOpen: true })
}

async function handleDelete(row: any) {
  const confirmed = await useDeleteConfirm(`科目「${row.code} ${row.name}」`)
  if (!confirmed) return

  try {
    await request.delete(`/base/accounts/${row.id}`)
    showSuccess('删除成功')
    addRecord('delete', '会计科目', `删除科目：${row.code} ${row.name}`)
    fetchData()
  } catch (error) {
    showOperationError('删除科目', error)
  }
}

// ========== 导入导出 ==========
const importDialogVisible = ref(false)
const importPreview = ref<any[]>([])
const importing = ref(false)

// 辅助：根据上级科目编码找到 parent_id
function findParentId(parentCode: string, flatList: any[]): string | null {
  if (!parentCode) return null
  const parent = flatList.find(a => a.code === parentCode)
  return parent?.id || null
}

// 辅助：解析科目 aux_types，返回 { catId: itemId } 中 catId 对应的类别名和项目名
function parseAuxTypes(row: any): Record<string, string | null> {
  if (!row.aux_types) return {}
  try {
    const parsed = typeof row.aux_types === 'string' ? JSON.parse(row.aux_types) : row.aux_types
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// 辅助：构建导出行的辅助类别列（每个类别一列"是/否" + 一列默认项目名）
function buildExportAuxCols(row: any): Record<string, string> {
  const auxMap = parseAuxTypes(row)
  const cols: Record<string, string> = {}
  for (const cat of auxCategories.value) {
    const enabled = cat.id in auxMap
    cols[`辅助-${cat.name}`] = enabled ? '是' : '否'
    if (enabled && auxMap[cat.id]) {
      const item = auxItems.value.find(i => i.id === auxMap[cat.id])
      cols[`默认项目-${cat.name}`] = item ? item.name : ''
    } else {
      cols[`默认项目-${cat.name}`] = ''
    }
  }
  return cols
}

// 辅助：从导入行中解析辅助类别列为 aux_types 对象
function parseImportAuxCols(row: any): Record<string, any> | null {
  const result: Record<string, any> = {}
  for (const cat of auxCategories.value) {
    const auxKey = `辅助-${cat.name}`
    const defaultKey = `默认项目-${cat.name}`
    const val = String(row[auxKey] || '').trim()
    if (val === '是' || val === '1' || val === 'true') {
      const defaultItemName = String(row[defaultKey] || '').trim()
      if (defaultItemName) {
        const item = auxItems.value.find(i => i.type === cat.id && i.name === defaultItemName)
        result[cat.id] = item?.id || cat.default_item_id || null
      } else {
        result[cat.id] = cat.default_item_id || null
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

async function exportData() {
  const allRes = await request.get<any[]>('/base/accounts', { params: { is_enabled: '' } })
  const allAccounts = allRes.data

  const columns: ExportColumnDef[] = [
    {
      label: '科目编码',
      width: getColumnWidth('code', 120),
      value: row => row.code,
      indent: row => Math.max(0, (row.level || 1) - 1),
    },
    {
      label: '科目名称',
      width: getColumnWidth('name', 160),
      value: row => row.name,
      indent: row => Math.max(0, (row.level || 1) - 1),
    },
    {
      label: '方向',
      width: 76,
      align: 'center',
      value: row => (row.direction === 'debit' ? '借方' : '贷方'),
    },
    {
      label: '现金',
      width: 52,
      align: 'center',
      value: row => (row.is_cash ? '是' : ''),
    },
    {
      label: '银行',
      width: 52,
      align: 'center',
      value: row => (row.is_bank ? '是' : ''),
    },
    {
      label: '辅助核算',
      width: 220,
      value: row => getAuxNames(row).join('、'),
    },
    {
      label: '状态',
      width: 68,
      align: 'center',
      value: row => (row.is_enabled ? '启用' : '禁用'),
    },
  ]

  await exportStyledTable({
    fileName: '会计科目.xlsx',
    sheetName: '会计科目',
    title: '会计科目',
    columns,
    rows: allAccounts,
  })
}

async function downloadTemplate() {
  const { utils, writeFile } = await import('xlsx')
  // 基础列
  const baseCols: Record<string, string> = {
    科目编码: '1001',
    科目名称: '库存现金',
    余额方向: '借方',
    上级科目编码: '',
    现金: '是',
    银行: '',
  }
  // 动态辅助类别列
  for (const cat of auxCategories.value) {
    baseCols[`辅助-${cat.name}`] = '否'
    baseCols[`默认项目-${cat.name}`] = ''
  }
  baseCols['状态'] = '启用'

  const templateData = [baseCols]
  const ws = utils.json_to_sheet(templateData)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '导入模板')
  writeFile(wb, '会计科目导入模板.xlsx')
}

async function onImportFileChange(file: UploadFile) {
  if (!file.raw) return
  try {
    const { utils, read } = await import('xlsx')
    const arrayBuffer = await file.raw.arrayBuffer()
    const workbook = read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rawData: any[] = utils.sheet_to_json(sheet)

    if (rawData.length === 0) {
      showError('文件中没有数据')
      return
    }

    // 收集辅助类别列名用于预览
    const auxCatNames = auxCategories.value.map(c => c.name)

    const parsed = rawData
      .map((row: any) => {
        const code = String(row['科目编码'] || '').trim()
        const name = String(row['科目名称'] || '').trim()
        const directionStr = String(row['余额方向'] || '').trim()
        const direction = directionStr === '贷方' ? 'credit' : 'debit'
        const parentCode = String(row['上级科目编码'] || '').trim()
        const isCash = String(row['现金'] || '').trim() === '是' ? 1 : 0
        const isBank = String(row['银行'] || '').trim() === '是' ? 1 : 0
        const statusStr = String(row['状态'] || '').trim()
        const isEnabled = statusStr === '禁用' ? 0 : 1

        // 解析辅助类别列
        const auxTypes = parseImportAuxCols(row)
        // 构建辅助描述用于预览
        const auxDesc = auxCatNames
          .filter(catName => {
            const val = String(row[`辅助-${catName}`] || '').trim()
            return val === '是' || val === '1' || val === 'true'
          })
          .map(catName => {
            const defaultItem = String(row[`默认项目-${catName}`] || '').trim()
            return defaultItem ? `${catName}:${defaultItem}` : catName
          })
          .join(', ')

        return {
          code,
          name,
          direction,
          parent_code: parentCode,
          is_cash: isCash,
          is_bank: isBank,
          aux_types: auxTypes,
          aux_desc: auxDesc,
          is_enabled: isEnabled,
        }
      })
      .filter(item => item.code && item.name)

    importPreview.value = parsed
  } catch (error) {
    showError('文件解析失败，请检查文件格式')
    console.error('Import parse error:', error)
  }
}

async function handleImport() {
  if (importPreview.value.length === 0) return
  importing.value = true
  let successCount = 0
  let failCount = 0
  const errors: string[] = []

  // 获取最新的科目列表用于查找 parent_id
  const allRes = await request.get<any[]>('/base/accounts', { params: { is_enabled: '' } })
  const existingAccounts = allRes.data

  try {
    for (const item of importPreview.value) {
      try {
        const parentId = findParentId(item.parent_code, existingAccounts)
        const parent = parentId ? existingAccounts.find((a: any) => a.id === parentId) : null
        const level = parent ? (parent.level || 0) + 1 : 1
        const isAux = item.aux_types ? 1 : 0

        const payload = {
          code: item.code,
          name: item.name,
          direction: item.direction,
          level,
          parent_id: parentId,
          is_aux: isAux,
          aux_types: item.aux_types,
          is_enabled: item.is_enabled,
          is_cash: item.is_cash,
          is_bank: item.is_bank,
        }
        await request.post('/base/accounts', payload)
        successCount++
        // 加入已有列表，以便后续行能找到此科目作为上级
        existingAccounts.push({ ...payload, id: '__imported__' })
      } catch (error: any) {
        failCount++
        const msg = error.response?.data?.message || '未知错误'
        errors.push(`${item.code} ${item.name}: ${msg}`)
      }
    }

    if (successCount > 0) {
      showSuccess(
        `导入完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}`
      )
    }
    if (errors.length > 0) {
      showError(
        `以下科目导入失败：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...共 ${errors.length} 条` : ''}`
      )
    }

    importDialogVisible.value = false
    importPreview.value = []
    await fetchData()
  } catch (error) {
    showOperationError('批量导入', error)
  } finally {
    importing.value = false
  }
}

onMounted(fetchData)
onActivated(() => load())
</script>

<style scoped>
.page {
  height: calc(100vh - 60px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.page-header h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.account-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 150px;
}

.account-title span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.account-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.level-actions {
  flex-shrink: 0;
}

.account-search {
  width: 220px;
}

.account-quick-filter-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 196px;
  flex-shrink: 0;
}

.account-quick-filter-badge {
  position: absolute;
  left: 7px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  color: #007aff;
  background: rgba(0, 122, 255, 0.1);
  pointer-events: none;
  transition: all 0.2s ease;
}

.account-quick-filter-badge .el-icon {
  font-size: 11px;
}

.account-quick-filter-badge em {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: linear-gradient(135deg, #007aff 0%, #0056d6 100%);
  color: #fff;
  font-style: normal;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0, 122, 255, 0.35);
}

.account-quick-filter-wrap.is-active .account-quick-filter-badge {
  color: #fff;
  background: linear-gradient(135deg, #007aff 0%, #0056d6 100%);
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.28);
}

.account-quick-filter {
  width: 100%;
}

.account-quick-filter :deep(.el-select__wrapper) {
  min-height: 28px !important;
  height: 28px !important;
  padding: 0 24px 0 30px !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.92) !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transition: all 0.2s ease;
  font-size: 12px !important;
  line-height: 26px !important;
}

.account-quick-filter :deep(.el-select__wrapper:hover) {
  border-color: rgba(0, 122, 255, 0.28) !important;
}

.account-quick-filter :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(0, 122, 255, 0.45) !important;
  box-shadow:
    0 0 0 3px rgba(0, 122, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
}

.account-quick-filter-wrap.is-active :deep(.el-select__wrapper) {
  background: linear-gradient(180deg, rgba(0, 122, 255, 0.06) 0%, rgba(255, 255, 255, 0.96) 100%) !important;
  border-color: rgba(0, 122, 255, 0.24) !important;
}

.account-quick-filter :deep(.el-select__placeholder) {
  color: #86868b;
  font-size: 11px;
}

.account-quick-filter :deep(.el-select__selected-item .el-tag) {
  height: 18px;
  padding: 0 5px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
  font-size: 10px;
  font-weight: 600;
  line-height: 18px;
}

.account-quick-filter :deep(.el-select__selected-item .el-tag .el-tag__close) {
  color: #007aff;
}

.account-quick-filter :deep(.el-select__selection) {
  gap: 2px;
}

.quick-filter-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 24px;
}

.quick-filter-option__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  flex-shrink: 0;
}

.quick-filter-option__icon .el-icon {
  font-size: 12px;
}

.quick-filter-option__icon.is-success {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.quick-filter-option__icon.is-primary {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.quick-filter-option__icon.is-warning {
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.quick-filter-option__icon.is-aux {
  background: rgba(175, 82, 222, 0.12);
  color: #af52de;
}

.quick-filter-option__label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #1d1d1f;
  font-weight: 500;
}

.disabled-switch {
  margin-left: 2px;
}

.account-table {
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
}

.account-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  color: var(--el-color-primary);
  font-weight: 600;
  line-height: 1.2;
}

.account-name {
  color: var(--el-text-color-primary);
  font-weight: 500;
  line-height: 1.2;
}

.mini-flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  font-size: 12px;
  line-height: 1;
}

.mini-flag.bank {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.aux-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.import-tips {
  margin-bottom: 16px;
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
}
.import-tips p {
  margin: 0;
}
.import-preview {
  margin-top: 16px;
}
.import-more-hint {
  text-align: center;
  color: #909399;
  font-size: 12px;
  margin-top: 8px;
}

:deep(.el-table .el-table__cell) {
  overflow: hidden;
}

:deep(.account-table .el-table__cell) {
  padding: 2px 0 !important;
}

:deep(.account-table th.el-table__cell) {
  padding: 5px 0 !important;
  background: var(--el-fill-color-light) !important;
  color: var(--el-text-color-regular);
  font-size: 12px;
  font-weight: 600;
}

:deep(.account-table .el-table__row) {
  height: 30px;
}

:deep(.account-table .cell) {
  min-height: 24px;
  line-height: 24px;
  padding: 0 6px !important;
}

:deep(.account-table .el-tag) {
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.account-table .el-button--small) {
  height: 22px;
  padding: 0 4px;
}

:deep(.account-table .el-table__expand-icon) {
  width: 18px;
  height: 18px;
  margin-right: 2px;
}

:deep(.el-table .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1100px) {
  .page-header {
    align-items: flex-start;
  }

  .account-toolbar {
    justify-content: flex-start;
  }

  .account-search {
    width: 180px;
  }

  .account-quick-filter-wrap {
    width: 168px;
  }
}
</style>

<style>
.account-quick-filter-popper.el-popper {
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 10px !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1) !important;
  overflow: hidden;
  padding: 4px !important;
}

.account-quick-filter-popper .el-select-dropdown__list {
  padding: 0;
}

.account-quick-filter-popper .el-select-group__title {
  padding: 4px 8px 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #86868b;
  line-height: 1.2;
}

.account-quick-filter-popper .el-select-dropdown__item {
  height: auto;
  min-height: 30px;
  padding: 2px 6px;
  margin: 1px 0;
  border-radius: 6px;
  line-height: 1.2;
}

.account-quick-filter-popper .el-select-dropdown__item.is-selected {
  background: rgba(0, 122, 255, 0.08) !important;
  color: inherit !important;
  font-weight: 500;
}

.account-quick-filter-popper .el-select-dropdown__item.is-selected::after {
  color: #007aff !important;
  font-size: 12px !important;
  right: 8px !important;
}

.account-quick-filter-popper .el-select-dropdown__item.hover,
.account-quick-filter-popper .el-select-dropdown__item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

.account-quick-filter-popper .el-select-dropdown__item.is-selected.hover,
.account-quick-filter-popper .el-select-dropdown__item.is-selected:hover {
  background: rgba(0, 122, 255, 0.12) !important;
}
</style>
