<template>
  <div class="page">
    <div class="page-header">
      <div class="header-left">
        <el-button link type="primary" size="small" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回期初余额
        </el-button>
        <h3 v-if="currentAccount">
          辅助期初 — {{ currentAccount.code }} {{ currentAccount.name }}
          <el-tag
            :type="currentAccount.direction === 'debit' ? 'primary' : 'warning'"
            size="small"
            style="margin-left: 8px"
          >
            {{ currentAccount.direction === 'debit' ? '借' : '贷' }}
          </el-tag>
        </h3>
        <h3 v-else>辅助期初录入</h3>
      </div>
      <div class="header-actions">
        <el-select v-model="year" style="width: 112px" size="small" :disabled="loading" @change="onYearChange">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <span v-if="isMidYear" class="mid-year-hint">（年中开账）</span>
        <el-input
          v-model="keyword"
          placeholder="编号 / 名称 / 自定义字段"
          clearable
          class="search-input"
          size="small"
          :disabled="loading"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button size="small" :disabled="loading" @click="refresh">刷新</el-button>
        <el-button plain size="small" :disabled="loading" @click="downloadTemplate">
          <el-icon><Download /></el-icon>
          下载模板
        </el-button>
        <el-button
          plain
          size="small"
          :disabled="loading || gridRows.length === 0"
          @click="exportData"
        >
          <el-icon><Download /></el-icon>
          导出
        </el-button>
        <el-button size="small" :disabled="locked || loading" @click="importDialogVisible = true">导入</el-button>
        <el-button type="primary" size="small" :loading="saving" :disabled="locked" @click="handleSaveAll">
          保存全部
        </el-button>
      </div>
    </div>

    <el-alert v-if="locked" type="warning" show-icon :closable="false" style="margin-bottom: 12px">
      {{ lockReason }}
    </el-alert>

    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
      <template v-if="useCategoryTabs">
        多辅助类目分标签分别录入，互不交叉组合：每个标签只录该类目下的项目金额。各标签页合计应一致，科目期初余额不会重复累加。
      </template>
      <template v-else>
        表格已列出全部辅助项目；点击金额录入，失焦自动保存。
      </template>
    </el-alert>

    <div v-loading="loading" class="table-wrap">
      <el-tabs v-if="useCategoryTabs" v-model="activeCategoryId" class="category-tabs">
        <el-tab-pane
          v-for="cat in categories"
          :key="cat.id"
          :name="cat.id"
          :label="categoryTabLabel(cat)"
        />
      </el-tabs>

      <div class="table-summary-scroll">
      <el-table
        v-if="activeCategory"
        ref="tableRef"
        :data="displayRows"
        border
        stripe
        size="small"
        highlight-current-row
        :class="['aux-lines-table', summaryBalanceClass]"
        :row-key="row => row.key"
        :row-style="{ height: '30px' }"
        :cell-style="{ padding: '0' }"
        :header-cell-style="{ padding: '4px 0' }"
        show-summary
        :summary-method="getSummaries"
        @current-change="handleCurrentRowChange"
      >
        <el-table-column type="index" label="序" width="44" align="center" fixed :index="rowIndex" />
        <el-table-column label="编码" width="112" fixed show-overflow-tooltip class-name="col-code">
          <template #default="{ row }">
            {{ getItem(row, activeCategory.id)?.code || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="150" fixed show-overflow-tooltip class-name="col-name">
          <template #default="{ row }">
            <span class="current-cat-name">{{ getItem(row, activeCategory.id)?.name || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="年初借" width="122" align="right" class-name="col-opening-debit">
          <template #default="{ row }">
            <span
              v-if="editingCell?.rowKey !== row.key || editingCell?.field !== 'opening_debit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.key === row.key &&
                  activeField === 'opening_debit' &&
                  editingCell?.rowKey !== row.key,
                'cell-unsaved': unsavedSet.has(row.key + '_opening_debit'),
              }"
              @click="!locked && startEdit(row, 'opening_debit')"
            >
              {{ formatAmount(row.opening_debit || 0) }}
            </span>
            <input
              v-else
              :ref="el => setEditInputRef(row.key, 'opening_debit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'opening_debit')"
              @keydown="handleCellKeydown($event, row, 'opening_debit')"
            />
          </template>
        </el-table-column>
        <el-table-column label="年初贷" width="122" align="right" class-name="col-opening-credit">
          <template #default="{ row }">
            <span
              v-if="editingCell?.rowKey !== row.key || editingCell?.field !== 'opening_credit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.key === row.key &&
                  activeField === 'opening_credit' &&
                  editingCell?.rowKey !== row.key,
                'cell-unsaved': unsavedSet.has(row.key + '_opening_credit'),
              }"
              @click="!locked && startEdit(row, 'opening_credit')"
            >
              {{ formatAmount(row.opening_credit || 0) }}
            </span>
            <input
              v-else
              :ref="el => setEditInputRef(row.key, 'opening_credit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'opening_credit')"
              @keydown="handleCellKeydown($event, row, 'opening_credit')"
            />
          </template>
        </el-table-column>
        <el-table-column v-if="isMidYear" label="账前借" width="122" align="right" class-name="col-pre-book-debit">
          <template #default="{ row }">
            <span
              v-if="editingCell?.rowKey !== row.key || editingCell?.field !== 'pre_book_debit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.key === row.key &&
                  activeField === 'pre_book_debit' &&
                  editingCell?.rowKey !== row.key,
                'cell-unsaved': unsavedSet.has(row.key + '_pre_book_debit'),
              }"
              @click="!locked && startEdit(row, 'pre_book_debit')"
            >
              {{ formatAmount(row.pre_book_debit || 0) }}
            </span>
            <input
              v-else
              :ref="el => setEditInputRef(row.key, 'pre_book_debit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'pre_book_debit')"
              @keydown="handleCellKeydown($event, row, 'pre_book_debit')"
            />
          </template>
        </el-table-column>
        <el-table-column v-if="isMidYear" label="账前贷" width="122" align="right" class-name="col-pre-book-credit">
          <template #default="{ row }">
            <span
              v-if="editingCell?.rowKey !== row.key || editingCell?.field !== 'pre_book_credit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.key === row.key &&
                  activeField === 'pre_book_credit' &&
                  editingCell?.rowKey !== row.key,
                'cell-unsaved': unsavedSet.has(row.key + '_pre_book_credit'),
              }"
              @click="!locked && startEdit(row, 'pre_book_credit')"
            >
              {{ formatAmount(row.pre_book_credit || 0) }}
            </span>
            <input
              v-else
              :ref="el => setEditInputRef(row.key, 'pre_book_credit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'pre_book_credit')"
              @keydown="handleCellKeydown($event, row, 'pre_book_credit')"
            />
          </template>
        </el-table-column>
        <el-table-column label="余向" width="54" align="center" fixed="right" class-name="col-balance-dir">
          <template #default="{ row }">
            <template v-if="balanceOf(row)">
              <el-tag
                :type="balanceOf(row)!.dir === '借' ? 'primary' : 'danger'"
                size="small"
                effect="dark"
              >
                {{ balanceOf(row)!.dir }}
              </el-tag>
            </template>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="128" align="right" fixed="right" class-name="col-balance-amount">
          <template #default="{ row }">
            <template v-if="balanceOf(row)">
              <span :class="balanceOf(row)!.dir === '借' ? 'balance-debit' : 'balance-credit'">
                ¥{{ formatAmount(balanceOf(row)!.amount) }}
              </span>
            </template>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="64" align="center" fixed="right" class-name="col-actions">
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              size="small"
              :disabled="locked"
              @click="removeLineByKey(row.key)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>

      <div class="footer-bar">
        <span class="sum-hint">
          本标签合计：借方 {{ formatAmount(totals.debit) }} / 贷方 {{ formatAmount(totals.credit) }}
        </span>
        <template v-if="useCategoryTabs && categoryTotals.length > 1">
          <span
            v-for="ct in categoryTotals"
            :key="ct.id"
            class="sum-hint"
            :class="{ 'sum-mismatch': totalsMismatch }"
          >
            {{ ct.name }}期初余额 ¥{{ formatAmount(Math.abs(ct.initBalance)) }}
            {{ ct.initBalance > 0.005 ? '（贷）' : ct.initBalance < -0.005 ? '（借）' : '' }}
          </span>
        </template>
        <span v-if="totalsMismatch" class="incomplete-hint">
          各标签页期初余额合计不一致（{{ currentAccount?.direction === 'credit' ? '贷方科目请优先填年初贷方' : '借方科目请优先填年初借方' }}）
        </span>
        <span v-if="keyword.trim()" class="sum-hint">（关键字筛选）</span>
      </div>

      <div class="pagination-bar">
        <span class="pagination-text">共 {{ displayTotal }} 条</span>
        <el-select v-model="pageSize" style="width: 96px" size="small" @change="onPageSizeChange">
          <el-option label="20条/页" :value="20" />
          <el-option label="50条/页" :value="50" />
          <el-option label="100条/页" :value="100" />
          <el-option label="200条/页" :value="200" />
          <el-option label="全部" :value="-1" />
        </el-select>
        <el-pagination
          v-model:current-page="page"
          :total="displayTotal"
          :page-size="pageSize === -1 ? displayTotal || 1 : pageSize"
          layout="prev, pager, next, jumper"
          :pager-count="7"
          :disabled="pageSize === -1"
          @current-change="onPageChange"
        />
      </div>
    </div>

    <el-dialog
      v-model="importDialogVisible"
      title="导入辅助期初"
      width="680px"
      @close="closeImportDialog"
    >
      <div class="import-tips">
        <p>
          1. 请先
          <el-link type="primary" @click="downloadTemplate">下载导入模板</el-link>
          ，按模板填写各辅助类别的<strong>项目编码</strong>及金额
        </p>
        <p>2. 同一科目下组合不可重复；导入后请点击「保存全部」或逐格失焦保存</p>
        <p>3. 年初借方/贷方只能填一侧{{ isMidYear ? '；年中开账可填帐前借方/贷方' : '' }}</p>
      </div>
      <el-upload
        ref="importUploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="onImportFileChange"
        :on-exceed="() => showError('只能上传一个文件')"
        drag
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">拖拽文件到此处，或<em>点击上传</em></div>
      </el-upload>

      <div v-if="importPreview.length > 0" class="import-preview">
        <el-alert
          :title="`解析 ${importPreview.length} 行，有效 ${importMatchedCount} 行`"
          :type="importMatchedCount > 0 ? 'success' : 'warning'"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <el-table :data="importPreview.slice(0, 15)" stripe border size="small" max-height="280">
          <el-table-column prop="rowIndex" label="行号" width="60" />
          <el-table-column label="辅助组合" min-width="180">
            <template #default="{ row }">
              {{
                Object.values(row.selection_labels || {}).join(' / ') ||
                Object.values(row.selection || {}).join(',')
              }}
            </template>
          </el-table-column>
          <el-table-column prop="opening_debit" label="年初借方" width="100" align="right" />
          <el-table-column prop="opening_credit" label="年初贷方" width="100" align="right" />
          <el-table-column prop="matched" label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.matched ? 'success' : 'danger'" size="small">
                {{ row.matched ? '有效' : row.error || '无效' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button @click="closeImportDialog">取消</el-button>
        <el-button
          type="primary"
          :disabled="importMatchedCount === 0"
          :loading="importing"
          @click="confirmImport"
        >
          确认导入（{{ importMatchedCount }} 行）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Upload, Search, Download } from '@element-plus/icons-vue'
import type { TableColumnCtx, UploadFile } from 'element-plus'
import {
  useInitBalanceAux,
  applyOpeningCreditChange,
  applyOpeningDebitChange,
  type AuxImportPreviewRow,
  type InitBalanceAuxLine,
} from '@/composables/useInitBalanceAux'
import { formatAmount } from '@/utils/format'
import { showError, showSuccess } from '@/composables/useMessage'

const route = useRoute()
const router = useRouter()

const {
  loading,
  saving,
  locked,
  lockReason,
  currentAccount,
  categories,
  itemsByCategory,
  gridRows,
  displayRows,
  displayTotal,
  keyword,
  page,
  pageSize,
  useCategoryTabs,
  activeCategoryId,
  isMidYear,
  loadDetails,
  removeLineByKey,
  categoryTabStats,
  categoryTotalsList,
  validateCategoryTotalsMatch,
  save,
  saveLine,
  lineTotals,
  activeCategoryTotals,
  downloadTemplate,
  exportData,
  parseImportRows,
  applyImportPreview,
} = useInitBalanceAux()

function rowIndex(index: number) {
  if (pageSize.value === -1) return index + 1
  return (page.value - 1) * pageSize.value + index + 1
}

function onPageChange(p: number) {
  page.value = p
}

function onPageSizeChange() {
  page.value = 1
}

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 10 }, (_, i) => currentYear - i)
const year = ref(currentYear)

const importDialogVisible = ref(false)
const importPreview = ref<AuxImportPreviewRow[]>([])
const importUploadRef = ref<any>(null)
const importing = ref(false)

const accountId = computed(() => String(route.query.account_id || ''))
const totals = computed(() => lineTotals())
const importMatchedCount = computed(() => importPreview.value.filter(r => r.matched).length)
const categoryTotals = computed(() => categoryTotalsList())
const totalsMismatch = computed(() => !!validateCategoryTotalsMatch(true))

const activeCategory = computed(() =>
  categories.value.find(c => c.id === activeCategoryId.value) ||
  categories.value[0] ||
  null
)

function categoryTabLabel(cat: { id: string; name: string }) {
  const { filled, total } = categoryTabStats(cat.id)
  return `${cat.name}（${filled}/${total}）`
}

type AmountField = 'opening_debit' | 'opening_credit' | 'pre_book_debit' | 'pre_book_credit'
const AMOUNT_FIELDS: AmountField[] = [
  'opening_debit',
  'opening_credit',
  'pre_book_debit',
  'pre_book_credit',
]

interface EditingCell {
  rowKey: string
  field: AmountField
}

const editingCell = ref<EditingCell | null>(null)
const editValue = ref('')
const unsavedSet = ref<Set<string>>(new Set())
const editInputRefs = ref<Record<string, HTMLInputElement | null>>({})
const savingCell = ref(false)
const tableRef = ref<any>(null)
const currentRow = ref<InitBalanceAuxLine | null>(null)
const activeField = ref<AmountField>('opening_debit')
const isKeyboardNavigating = ref(false)

function getItem(row: InitBalanceAuxLine, catId: string) {
  const itemId = row.selection[catId]
  return itemsByCategory.value[catId]?.find(i => i.id === itemId)
}

function balanceOf(row: InitBalanceAuxLine): { dir: '借' | '贷'; amount: number } | null {
  const net =
    (row.opening_debit || 0) +
    (row.pre_book_debit || 0) -
    (row.opening_credit || 0) -
    (row.pre_book_credit || 0)
  const abs = Math.abs(net)
  if (abs < 0.005) return null
  return { dir: net > 0 ? '借' : '贷', amount: abs }
}

const summaryBalanceDir = ref<'借' | '贷' | '平' | null>(null)

const summaryBalanceClass = computed(() => {
  const dir = summaryBalanceDir.value
  if (!dir || dir === '平') return ''
  return dir === '借' ? 'summary-balance-debit' : 'summary-balance-credit'
})

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns } = param
  const t = activeCategoryTotals.value

  const totalOpeningDebit = t.opening_debit || 0
  const totalOpeningCredit = t.opening_credit || 0
  const totalPreBookDebit = t.pre_book_debit || 0
  const totalPreBookCredit = t.pre_book_credit || 0
  const net =
    totalOpeningDebit + totalPreBookDebit - totalOpeningCredit - totalPreBookCredit
  const absNet = Math.abs(net)
  const balanceDir = absNet < 0.005 ? '平' : net > 0 ? '借' : '贷'
  summaryBalanceDir.value = balanceDir

  const sums: string[] = []
  columns.forEach((column, index) => {
    if (column.label === '序' || index === 0) {
      sums[index] = '合计'
      return
    }
    switch (column.label) {
      case '年初借':
        sums[index] = formatAmount(totalOpeningDebit)
        break
      case '年初贷':
        sums[index] = formatAmount(totalOpeningCredit)
        break
      case '账前借':
        sums[index] = formatAmount(totalPreBookDebit)
        break
      case '账前贷':
        sums[index] = formatAmount(totalPreBookCredit)
        break
      case '余向':
        sums[index] = balanceDir
        break
      case '余额':
        sums[index] = absNet < 0.005 ? '' : `¥${formatAmount(absNet)}`
        break
      default:
        sums[index] = ''
    }
  })
  return sums
}

function getVisibleFields(): AmountField[] {
  if (isMidYear.value) return AMOUNT_FIELDS
  return ['opening_debit', 'opening_credit']
}

function setEditInputRef(rowKey: string, field: string, el: any) {
  const key = rowKey + '_' + field
  if (el) editInputRefs.value[key] = el as HTMLInputElement
  else delete editInputRefs.value[key]
}

function findRowByKey(rowKey: string) {
  return displayRows.value.find(r => r.key === rowKey) || gridRows.value.find(r => r.key === rowKey)
}

function focusEditInput(rowKey: string, field: AmountField, attempt = 0) {
  const key = rowKey + '_' + field
  const inp = editInputRefs.value[key]
  if (inp) {
    inp.focus()
    inp.select()
    inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    return
  }
  if (attempt < 5) {
    nextTick(() => focusEditInput(rowKey, field, attempt + 1))
  }
}

function handleCurrentRowChange(row: InitBalanceAuxLine | null) {
  currentRow.value = row
}

function startEdit(row: InitBalanceAuxLine, field: AmountField) {
  if (locked.value || savingCell.value) return
  activeField.value = field
  currentRow.value = row
  tableRef.value?.setCurrentRow(row)
  editingCell.value = { rowKey: row.key, field }
  editValue.value = String(row[field] || 0)
  nextTick(() => focusEditInput(row.key, field))
}

function cancelEdit() {
  editingCell.value = null
  editValue.value = ''
}

function applyOpeningExclusive(row: InitBalanceAuxLine, field: AmountField, numVal: number) {
  if (field === 'opening_debit') applyOpeningDebitChange(row, numVal)
  else if (field === 'opening_credit') applyOpeningCreditChange(row, numVal)
  else row[field] = numVal
}

function onEditInputBlur(row: InitBalanceAuxLine, field: AmountField) {
  if (isKeyboardNavigating.value) return
  if (
    !editingCell.value ||
    editingCell.value.rowKey !== row.key ||
    editingCell.value.field !== field
  ) {
    return
  }
  commitEdit()
}

async function persistEdit(row: InitBalanceAuxLine, field: AmountField) {
  savingCell.value = true
  const ok = await saveLine(row)
  savingCell.value = false
  if (ok === null) return
  if (ok) {
    unsavedSet.value.delete(row.key + '_' + field)
  } else {
    unsavedSet.value.add(row.key + '_' + field)
  }
}

function commitEdit() {
  if (!editingCell.value) return
  const { rowKey, field } = editingCell.value
  const row = findRowByKey(rowKey)
  if (!row) {
    editingCell.value = null
    editValue.value = ''
    return
  }

  const val = parseFloat(editValue.value)
  const numVal = isNaN(val) ? 0 : Math.round(val * 100) / 100
  const prev = row[field] || 0

  editingCell.value = null
  editValue.value = ''

  if (prev === numVal) return

  applyOpeningExclusive(row, field, numVal)
  void persistEdit(row, field)
}

function navigateByKeyboard(
  row: InitBalanceAuxLine,
  field: AmountField,
  direction: 'up' | 'down' | 'left' | 'right'
) {
  isKeyboardNavigating.value = true
  commitEdit()
  navigateFromCell(row, field, direction)
  nextTick(() => {
    isKeyboardNavigating.value = false
  })
}

function handleCellKeydown(e: KeyboardEvent, row: InitBalanceAuxLine, field: AmountField) {
  if (e.key === 'Enter') {
    e.preventDefault()
    navigateByKeyboard(row, field, 'down')
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    navigateByKeyboard(row, field, e.shiftKey ? 'left' : 'right')
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    navigateByKeyboard(row, field, 'up')
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    navigateByKeyboard(row, field, 'down')
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    navigateByKeyboard(row, field, 'left')
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    navigateByKeyboard(row, field, 'right')
    return
  }
}

function scrollCurrentRowIntoView() {
  nextTick(() => {
    tableRef.value?.$el
      ?.querySelector('.el-table__row.current-row')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function resolveNavigationAnchor(): { row: InitBalanceAuxLine; field: AmountField } | null {
  const rows = displayRows.value
  if (rows.length === 0 || locked.value) return null

  const visibleFields = getVisibleFields()
  const field = (
    activeField.value && visibleFields.includes(activeField.value)
      ? activeField.value
      : visibleFields[0]
  ) as AmountField

  if (currentRow.value) {
    const found = rows.find(r => r.key === currentRow.value!.key)
    if (found) return { row: found, field }
  }

  return { row: rows[0], field }
}

function navigateToCell(row: InitBalanceAuxLine, field: AmountField) {
  if (!row) return
  if (!locked.value) {
    if (editingCell.value) {
      isKeyboardNavigating.value = true
      commitEdit()
    }
    startEdit(row, field)
    if (editingCell.value) {
      nextTick(() => {
        isKeyboardNavigating.value = false
      })
    }
    return
  }
  activeField.value = field
  currentRow.value = row
  tableRef.value?.setCurrentRow(row)
  if (editingCell.value) commitEdit()
  scrollCurrentRowIntoView()
}

function navigateFromCell(
  row: InitBalanceAuxLine,
  field: AmountField,
  direction: 'up' | 'down' | 'left' | 'right'
) {
  const visibleFields = getVisibleFields()
  const rows = displayRows.value
  if (rows.length === 0) return

  let rowIdx = rows.findIndex(r => r.key === row.key)
  let fieldIdx = visibleFields.indexOf(field)
  if (fieldIdx < 0) fieldIdx = 0
  if (rowIdx < 0) {
    navigateToCell(rows[0], visibleFields[fieldIdx])
    return
  }

  let nextRowIdx = rowIdx
  let nextFieldIdx = fieldIdx

  switch (direction) {
    case 'up':
      nextRowIdx = Math.max(0, rowIdx - 1)
      break
    case 'down':
      nextRowIdx = Math.min(rows.length - 1, rowIdx + 1)
      break
    case 'left':
      if (fieldIdx > 0) {
        nextFieldIdx = fieldIdx - 1
      } else {
        nextRowIdx = Math.max(0, rowIdx - 1)
        nextFieldIdx = visibleFields.length - 1
      }
      break
    case 'right':
      if (fieldIdx < visibleFields.length - 1) {
        nextFieldIdx = fieldIdx + 1
      } else {
        nextRowIdx = Math.min(rows.length - 1, rowIdx + 1)
        nextFieldIdx = 0
      }
      break
  }

  navigateToCell(rows[nextRowIdx], visibleFields[nextFieldIdx])
}

function moveCursor(delta: number) {
  const rows = displayRows.value
  if (rows.length === 0 || locked.value) return

  const visibleFields = getVisibleFields()
  const field = (
    activeField.value && visibleFields.includes(activeField.value)
      ? activeField.value
      : visibleFields[0]
  ) as AmountField

  if (currentRow.value) {
    const idx = rows.findIndex(r => r.key === currentRow.value!.key)
    if (idx >= 0) {
      const nextIdx = Math.max(0, Math.min(rows.length - 1, idx + delta))
      navigateToCell(rows[nextIdx], field)
      return
    }
  }

  navigateToCell(rows[delta > 0 ? 0 : rows.length - 1], field)
}

function moveCursorHorizontal(delta: number) {
  const anchor = resolveNavigationAnchor()
  if (!anchor) return
  navigateFromCell(anchor.row, anchor.field, delta > 0 ? 'right' : 'left')
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  if (e.key === 'ArrowUp' && !e.ctrlKey) {
    e.preventDefault()
    moveCursor(-1)
    return
  }
  if (e.key === 'ArrowDown' && !e.ctrlKey) {
    e.preventDefault()
    moveCursor(1)
    return
  }
  if (e.key === 'ArrowLeft' && !e.ctrlKey) {
    e.preventDefault()
    moveCursorHorizontal(-1)
    return
  }
  if (e.key === 'ArrowRight' && !e.ctrlKey) {
    e.preventDefault()
    moveCursorHorizontal(1)
    return
  }
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault()
    const anchor = resolveNavigationAnchor()
    if (anchor && !locked.value) startEdit(anchor.row, anchor.field)
  }
}

function goBack() {
  router.push({
    path: '/base/init-balance',
    query: year.value ? { year: String(year.value) } : undefined,
  })
}

async function refresh() {
  if (!accountId.value) {
    showError('缺少科目参数')
    goBack()
    return
  }
  await loadDetails(accountId.value, year.value)
}

function onYearChange() {
  router.replace({
    query: {
      account_id: accountId.value,
      year: String(year.value),
      ...(route.query.mid_year ? { mid_year: route.query.mid_year } : {}),
    },
  })
  refresh()
}

async function handleSaveAll() {
  const summary = await save()
  if (summary) goBack()
}

function closeImportDialog() {
  importDialogVisible.value = false
  importPreview.value = []
  importUploadRef.value?.clearFiles()
}

async function onImportFileChange(file: UploadFile) {
  if (!file.raw) return
  try {
    const { utils, read } = await import('xlsx')
    const arrayBuffer = await file.raw.arrayBuffer()
    const workbook = read(arrayBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawData: any[] = utils.sheet_to_json(sheet)
    if (rawData.length === 0) {
      showError('文件中没有数据')
      return
    }
    importPreview.value = parseImportRows(rawData)
  } catch {
    showError('文件解析失败，请检查格式是否与模板一致')
  }
}

function confirmImport() {
  importing.value = true
  try {
    const count = applyImportPreview(importPreview.value)
    if (count > 0) {
      showSuccess(`已导入 ${count} 行到表格，失焦或「保存全部」写入数据库`)
      closeImportDialog()
    }
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  const qYear = Number(route.query.year)
  if (qYear) year.value = qYear
  if (!accountId.value) {
    showError('请先选择科目')
    goBack()
    return
  }
  await refresh()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(
  () => route.query.account_id,
  async id => {
    if (id && String(id) !== accountId.value) await refresh()
  }
)

watch(keyword, () => {
  page.value = 1
})
</script>

<style scoped>
.page {
  height: calc(100vh - 60px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
  box-sizing: border-box;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}
.header-left h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
}
.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.search-input {
  width: 210px;
}
.mid-year-hint {
  color: #e6a23c;
  font-size: 12px;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.table-wrap .table-summary-scroll {
  flex: 1 1 0;
  min-height: 0;
}
.editable-cell {
  display: block;
  width: 100%;
  min-height: 24px;
  line-height: 24px;
  padding: 0 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
  font-size: 12px;
}
.editable-cell:hover {
  background: #ecf5ff;
}
.editable-cell.cell-unsaved {
  color: #e6a23c;
}
.editable-cell.cell-active {
  border: 1px solid #409eff;
  background: #ecf5ff;
}
.cell-input {
  width: 100%;
  height: 24px;
  padding: 0 6px;
  border: 1px solid #409eff;
  border-radius: 4px;
  text-align: right;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.text-muted {
  color: #c0c4cc;
}
.footer-bar {
  margin-top: 6px;
  padding: 4px 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  flex-shrink: 0;
}
.sum-hint {
  color: #606266;
  font-size: 12px;
  font-weight: 500;
}
.balance-debit {
  font-weight: 600;
  color: #409eff;
}
.balance-credit {
  font-weight: 600;
  color: #f56c6c;
}
.import-tips {
  margin-bottom: 16px;
  color: #606266;
  font-size: 13px;
  line-height: 1.8;
}
.import-tips p {
  margin: 0;
}
.import-preview {
  margin-top: 16px;
}
.category-tabs {
  margin-bottom: 6px;
  flex-shrink: 0;
}
.category-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.category-tabs :deep(.el-tabs__item) {
  height: 32px;
  line-height: 32px;
  font-size: 13px;
}
.aux-lines-table {
  flex: 1;
  min-height: 0;
  margin-top: 6px;
  border-radius: 6px;
  overflow: hidden;
}
.current-cat-name {
  font-weight: 500;
  color: #303133;
}
.incomplete-hint {
  color: #e6a23c;
  font-size: 12px;
}
.sum-mismatch {
  color: #f56c6c;
}
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
  padding: 4px 0 0;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.pagination-text {
  color: #606266;
  font-size: 12px;
}

:deep(.aux-lines-table .el-table__cell) {
  padding: 2px 0 !important;
}

:deep(.aux-lines-table th.el-table__cell) {
  padding: 5px 0 !important;
  background: var(--el-fill-color-light) !important;
  color: var(--el-text-color-regular);
  font-weight: 600;
}

:deep(.aux-lines-table .el-table__footer-wrapper td.el-table__cell) {
  background: var(--el-fill-color-light) !important;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

:deep(.aux-lines-table.summary-balance-debit .el-table__footer-wrapper td.col-balance-dir .cell),
:deep(.aux-lines-table.summary-balance-debit .el-table__footer-wrapper td.col-balance-amount .cell) {
  color: #409eff;
  font-weight: 600;
}

:deep(.aux-lines-table.summary-balance-credit .el-table__footer-wrapper td.col-balance-dir .cell),
:deep(.aux-lines-table.summary-balance-credit .el-table__footer-wrapper td.col-balance-amount .cell) {
  color: #f56c6c;
  font-weight: 600;
}

:deep(.aux-lines-table .el-table__row) {
  height: 30px;
}

:deep(.aux-lines-table .cell) {
  min-height: 24px;
  line-height: 24px;
  padding: 0 6px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.aux-lines-table .el-tag) {
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.aux-lines-table .el-button--small) {
  height: 22px;
  padding: 0 4px;
}
</style>
