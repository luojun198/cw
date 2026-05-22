<template>
  <div class="page">
    <div class="page-header">
      <div class="header-title-block">
        <h3>期初余额录入</h3>
        <div class="year-context">
          <el-select v-model="selectedYear" class="year-select" size="small" @change="onYearChange">
            <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
          </el-select>
          <el-tag v-if="isMidYear" type="warning" size="small" effect="plain">
            年中开账 · 第{{ startMonth }}期
          </el-tag>
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-group toolbar-group--tree">
          <el-button-group>
            <el-button plain size="small" title="全部收拢 (Ctrl+\)" @click="collapseAll">
              <el-icon><Fold /></el-icon>
              顶层
            </el-button>
            <el-button plain size="small" title="上一级 (Ctrl+↑)" @click="goUpLevel">
              <el-icon><Top /></el-icon>
              上级
            </el-button>
            <el-button plain size="small" title="下一级 (Ctrl+↓)" @click="goDownLevel">
              <el-icon><Bottom /></el-icon>
              下级
            </el-button>
            <el-button plain size="small" title="全部展开 (Ctrl+Shift+\)" @click="expandAll">
              <el-icon><Expand /></el-icon>
              底层
            </el-button>
          </el-button-group>
        </div>

        <el-divider direction="vertical" class="toolbar-divider" />

        <div class="toolbar-group toolbar-group--filter">
          <el-input
            v-model="keyword"
            placeholder="科目编码 / 名称"
            class="search-input"
            size="small"
            clearable
            @input="onSearchInput"
            @clear="onSearchClear"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-badge
            v-if="auxLeafCount > 0"
            :value="auxLeafCount"
            :type="filterAuxOnly ? 'danger' : 'info'"
            class="aux-filter-badge"
          >
            <el-button
              :type="filterAuxOnly ? 'warning' : 'default'"
              :plain="!filterAuxOnly"
              size="small"
              @click="toggleAuxFilter"
            >
              <el-icon><Filter /></el-icon>
              辅助期初
            </el-button>
          </el-badge>
          <el-button
            v-else
            :type="filterAuxOnly ? 'warning' : 'default'"
            :plain="!filterAuxOnly"
            size="small"
            @click="toggleAuxFilter"
          >
            <el-icon><Filter /></el-icon>
            辅助期初
          </el-button>
          <el-checkbox v-model="showZeroValue" size="small" class="zero-filter-checkbox">
            零值显示
          </el-checkbox>
        </div>

        <el-divider direction="vertical" class="toolbar-divider" />

        <div class="toolbar-group toolbar-group--check">
          <el-button type="info" plain size="small" @click="fetchData">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button type="success" size="small" @click="checkBalance">
            <el-icon><CircleCheck /></el-icon>
            校验平衡
          </el-button>
        </div>

        <el-divider direction="vertical" class="toolbar-divider" />

        <div class="toolbar-group toolbar-group--import">
          <el-button plain size="small" :disabled="locked" @click="downloadTemplate">
            <el-icon><Download /></el-icon>
            下载模板
          </el-button>
          <el-button size="small" :disabled="locked" @click="importDialogVisible = true">
            <el-icon><Upload /></el-icon>
            导入
          </el-button>
        </div>

        <el-divider direction="vertical" class="toolbar-divider" />

        <div class="toolbar-group toolbar-group--export">
          <el-button plain size="small" :disabled="list.length === 0" @click="exportData">
            <el-icon><Download /></el-icon>
            导出
          </el-button>
          <el-button
            plain
            size="small"
            :disabled="auxLeafCount === 0"
            :loading="exportingAux"
            @click="exportAllAuxData"
          >
            <el-icon><Download /></el-icon>
            导出辅助期初
          </el-button>
        </div>

        <el-divider direction="vertical" class="toolbar-divider" />

        <div class="toolbar-group toolbar-group--save">
          <el-button type="primary" size="small" :disabled="locked" :loading="saving" @click="saveAll">
            <el-icon><DocumentChecked /></el-icon>
            保存全部
          </el-button>
        </div>
      </div>
    </div>

    <el-alert v-if="locked" type="warning" show-icon :closable="false" style="margin-bottom: 12px">
      {{ lockReason }}
    </el-alert>

    <div class="balance-check-bar">
      <div :class="['balance-check-inner', balanceCheck?.balanced ? 'balanced' : 'unbalanced']">
        <span class="balance-check-icon">{{
          balanceCheck ? (balanceCheck.balanced ? '✅' : '⚠️') : '📋'
        }}</span>
        <span class="balance-check-text">
          借贷平衡检验：借方合计 {{ formatMoney(balanceCheck?.totalDebit || 0) }} / 贷方合计
          {{ formatMoney(balanceCheck?.totalCredit || 0) }}
          <template v-if="balanceCheck">
            — {{ balanceCheck.balanced ? '平衡' : '不平衡' }}
            <template v-if="!balanceCheck.balanced">
              ，差额 {{ formatMoney(Math.abs((balanceCheck.totalDebit || 0) - (balanceCheck.totalCredit || 0))) }}
            </template>
          </template>
          <template v-else> — 点击"校验平衡"开始检验</template>
        </span>
      </div>
      <div
        v-if="balanceCheck"
        :class="[
          'balance-check-inner',
          'balance-check-inner--aux',
          balanceCheck.auxCategoryConsistent ? 'balanced' : 'unbalanced',
        ]"
      >
        <span class="balance-check-icon">{{
          balanceCheck.auxCategoryConsistent ? '✅' : '⚠️'
        }}</span>
        <div class="balance-check-text">
          <span>
            辅助类目检验：
            <template v-if="balanceCheck.auxCategoryConsistent">各科目不同辅助类目合计一致</template>
            <template v-else>
              {{ balanceCheck.auxCategoryMismatches?.length || 0 }} 个科目不一致
            </template>
          </span>
          <ul
            v-if="!balanceCheck.auxCategoryConsistent && balanceCheck.auxCategoryMismatches?.length"
            class="aux-mismatch-list"
          >
            <li v-for="item in balanceCheck.auxCategoryMismatches" :key="item.account_id">
              {{ formatAuxMismatchSummary(item) }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="table-summary-scroll">
    <el-table
      ref="tableRef"
      :data="displayData"
      stripe
      border
      size="small"
      highlight-current-row
      :row-style="{ height: '30px' }"
      :cell-style="{ padding: '0' }"
      :header-cell-style="{ padding: '4px 0' }"
      row-key="id"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :expand-row-keys="expandedKeys"
      :class="['balance-table', summaryBalanceClass]"
      show-summary
      :summary-method="getSummaries"
      @current-change="handleCurrentRowChange"
      @expand-change="handleExpandChange"
      @row-dblclick="handleRowDblClick"
    >
      <el-table-column prop="code" label="编码" width="124" fixed>
        <template #default="{ row }">
          <span
            :style="{
              paddingLeft: `${((row._depth || row.level || 1) - 1) * 14}px`,
              display: 'inline-block',
            }"
            class="account-code"
            >{{ row.code }}</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="name" label="科目" fixed min-width="180">
        <template #default="{ row }">
          <span
            :style="{
              paddingLeft: `${((row._depth || row.level || 1) - 1) * 14}px`,
              display: 'inline-block',
            }"
            class="account-name"
            >{{ row.name }}</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="direction" label="方向" width="60" align="center">
        <template #default="{ row }">
          <el-tag :type="row.direction === 'debit' ? 'primary' : 'warning'" size="small" effect="plain">{{
            row.direction === 'debit' ? '借' : '贷'
          }}</el-tag>
        </template>
      </el-table-column>

      <!-- 年初借方 -->
      <el-table-column label="年初借" width="122" align="right" class-name="col-opening-debit">
        <template #default="{ row }">
          <template v-if="parentIdSet.has(row.id)">
            <span class="computed-value" style="cursor: default">{{
              formatAmount(row.opening_debit || 0)
            }}</span>
          </template>
          <template v-else-if="isAuxLeafAccount(row)">
            <span class="computed-value" :title="auxCellTitle(row)">{{
              formatAmount(row.opening_debit || 0)
            }}</span>
          </template>
          <template v-else>
            <span
              v-if="editingCell?.rowId !== row.id || editingCell?.field !== 'opening_debit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.id === row.id &&
                  activeField === 'opening_debit' &&
                  editingCell?.rowId !== row.id,
                'cell-dirty': isCellDirty(row, 'opening_debit'),
                'cell-unsaved': unsavedSet.has(row.id + '_opening_debit'),
              }"
              @click="!locked && startEdit(row, 'opening_debit')"
              >{{ formatAmount(row.opening_debit || 0) }}</span
            >
            <input
              v-else
              :ref="el => setEditInputRef(row.id, 'opening_debit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'opening_debit')"
              @keydown="handleCellKeydown($event, row, 'opening_debit')"
            />
          </template>
        </template>
      </el-table-column>
      <!-- 年初贷方 -->
      <el-table-column label="年初贷" width="122" align="right" class-name="col-opening-credit">
        <template #default="{ row }">
          <template v-if="parentIdSet.has(row.id)">
            <span class="computed-value" style="cursor: default">{{
              formatAmount(row.opening_credit || 0)
            }}</span>
          </template>
          <template v-else-if="isAuxLeafAccount(row)">
            <span class="computed-value" :title="auxCellTitle(row)">{{
              formatAmount(row.opening_credit || 0)
            }}</span>
          </template>
          <template v-else>
            <span
              v-if="editingCell?.rowId !== row.id || editingCell?.field !== 'opening_credit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.id === row.id &&
                  activeField === 'opening_credit' &&
                  editingCell?.rowId !== row.id,
                'cell-dirty': isCellDirty(row, 'opening_credit'),
                'cell-unsaved': unsavedSet.has(row.id + '_opening_credit'),
              }"
              @click="!locked && startEdit(row, 'opening_credit')"
              >{{ formatAmount(row.opening_credit || 0) }}</span
            >
            <input
              v-else
              :ref="el => setEditInputRef(row.id, 'opening_credit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'opening_credit')"
              @keydown="handleCellKeydown($event, row, 'opening_credit')"
            />
          </template>
        </template>
      </el-table-column>

      <!-- 帐前发生额（年中开账时显示） -->
      <el-table-column v-if="isMidYear" label="账前借" width="122" align="right" class-name="col-pre-book-debit">
        <template #default="{ row }">
          <template v-if="parentIdSet.has(row.id)">
            <span class="computed-value" style="cursor: default">{{
              formatAmount(row.pre_book_debit || 0)
            }}</span>
          </template>
          <template v-else-if="isAuxLeafAccount(row)">
            <span class="computed-value">{{ formatAmount(row.pre_book_debit || 0) }}</span>
          </template>
          <template v-else>
            <span
              v-if="editingCell?.rowId !== row.id || editingCell?.field !== 'pre_book_debit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.id === row.id &&
                  activeField === 'pre_book_debit' &&
                  editingCell?.rowId !== row.id,
                'cell-dirty': isCellDirty(row, 'pre_book_debit'),
                'cell-unsaved': unsavedSet.has(row.id + '_pre_book_debit'),
              }"
              @click="!locked && startEdit(row, 'pre_book_debit')"
              >{{ formatAmount(row.pre_book_debit || 0) }}</span
            >
            <input
              v-else
              :ref="el => setEditInputRef(row.id, 'pre_book_debit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'pre_book_debit')"
              @keydown="handleCellKeydown($event, row, 'pre_book_debit')"
            />
          </template>
        </template>
      </el-table-column>
      <el-table-column v-if="isMidYear" label="账前贷" width="122" align="right" class-name="col-pre-book-credit">
        <template #default="{ row }">
          <template v-if="parentIdSet.has(row.id)">
            <span class="computed-value" style="cursor: default">{{
              formatAmount(row.pre_book_credit || 0)
            }}</span>
          </template>
          <template v-else-if="isAuxLeafAccount(row)">
            <span class="computed-value">{{ formatAmount(row.pre_book_credit || 0) }}</span>
          </template>
          <template v-else>
            <span
              v-if="editingCell?.rowId !== row.id || editingCell?.field !== 'pre_book_credit'"
              class="editable-cell"
              :class="{
                'cell-active':
                  currentRow?.id === row.id &&
                  activeField === 'pre_book_credit' &&
                  editingCell?.rowId !== row.id,
                'cell-dirty': isCellDirty(row, 'pre_book_credit'),
                'cell-unsaved': unsavedSet.has(row.id + '_pre_book_credit'),
              }"
              @click="!locked && startEdit(row, 'pre_book_credit')"
              >{{ formatAmount(row.pre_book_credit || 0) }}</span
            >
            <input
              v-else
              :ref="el => setEditInputRef(row.id, 'pre_book_credit', el)"
              v-model="editValue"
              type="text"
              class="cell-input"
              inputmode="decimal"
              @blur="onEditInputBlur(row, 'pre_book_credit')"
              @keydown="handleCellKeydown($event, row, 'pre_book_credit')"
            />
          </template>
        </template>
      </el-table-column>

      <!-- 期末余额 -->
      <el-table-column label="余向" width="54" align="center" class-name="col-balance-dir">
        <template #default="{ row }">
          <template v-if="getBalanceDisplay(row)">
            <el-tag
              :type="getBalanceDisplay(row)!.dir === '借' ? 'primary' : 'danger'"
              size="small"
              effect="dark"
              >{{ getBalanceDisplay(row)!.dir }}</el-tag
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column label="余额" width="128" align="right" class-name="col-balance-amount">
        <template #default="{ row }">
          <template v-if="getBalanceDisplay(row)">
            <span :class="getBalanceDisplay(row)!.dir === '借' ? 'balance-debit' : 'balance-credit'"
              >¥{{ formatAmount(getBalanceDisplay(row)!.amount) }}</span
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            v-if="isAuxLeafAccount(row)"
            type="warning"
            plain
            size="small"
            @click="openAuxDrawer(row)"
          >
            <el-icon><Filter /></el-icon>
            辅助期初
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <!-- 导入对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      title="导入期初余额"
      width="620px"
      @close="closeImportDialog"
    >
      <div class="import-tips">
        <p>
          1. 请先
          <el-link type="primary" @click="downloadTemplate">下载导入模板</el-link
          >，按模板格式填写数据
        </p>
        <p>2. 按科目编码匹配，已有数据将被覆盖</p>
        <p>
          3. 年初借方/贷方只能填一侧{{ isMidYear ? '；账前借方/贷方为年中开账时填写' : '' }}
        </p>
        <p>4. 已启用辅助核算的科目请进入「辅助期初」全页录入，本页 Excel 导入将自动跳过此类科目</p>
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
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx / .xls 格式</div>
        </template>
      </el-upload>

      <div v-if="importPreview.length > 0" class="import-preview">
        <el-alert
          :title="`解析成功：${importPreview.length} 条数据（匹配到 ${importMatched} 个科目）`"
          type="success"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <el-table :data="importPreview.slice(0, 10)" stripe border size="small" max-height="240">
          <el-table-column prop="code" label="科目编码" width="100" />
          <el-table-column prop="name" label="科目名称" min-width="140" />
          <el-table-column prop="opening_debit" label="年初借方" width="110" align="right" />
          <el-table-column prop="opening_credit" label="年初贷方" width="110" align="right" />
          <el-table-column
            v-if="isMidYear"
            prop="pre_book_debit"
            label="帐前借方"
            width="110"
            align="right"
          />
          <el-table-column
            v-if="isMidYear"
            prop="pre_book_credit"
            label="帐前贷方"
            width="110"
            align="right"
          />
          <el-table-column prop="matched" label="匹配" width="70" align="center">
            <template #default="{ row }">
              <el-tag :type="row.matched ? 'success' : 'danger'" size="small">{{
                row.matched ? '是' : '否'
              }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div
          v-if="importPreview.length > 10"
          style="color: #909399; font-size: 12px; margin-top: 4px"
        >
          仅展示前 10 条，共 {{ importPreview.length }} 条
        </div>
      </div>

      <template #footer>
        <el-button @click="closeImportDialog">取消</el-button>
        <el-button
          type="primary"
          :disabled="importMatched === 0"
          :loading="importing"
          @click="handleImport"
        >
          确认导入（{{ importMatched }} 条）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Upload,
  Download,
  Refresh,
  Search,
  Filter,
  Fold,
  Expand,
  Top,
  Bottom,
  CircleCheck,
  DocumentChecked,
} from '@element-plus/icons-vue'
import request from '@/api/request'
import { showSuccess, showError, showOperationError } from '@/composables/useMessage'
import { formatAmount } from '@/utils/format'
import { formatAuxMismatchSummary } from '@/utils/balanceCheckAlert'
import { normalizeOpeningDebitCredit } from '@/utils/initBalanceOpening'
import { exportStyledTable, exportStyledWorkbook } from '@/utils/exportStyledExcel'
import {
  buildInitBalanceExportColumns,
  buildInitBalanceAuxExportColumns,
} from '@/utils/ledgerExportBuilders'
import type { TableColumnCtx, UploadFile } from 'element-plus'

const router = useRouter()
const route = useRoute()

const list = ref<any[]>([])
const balanceCheck = ref<any>(null)
const isMidYear = ref(false)
const startMonth = ref(1)
const saving = ref(false)
const locked = ref(false)
const lockReason = ref('')
const keyword = ref('')
const filterAuxOnly = ref(false)
/** 勾选后显示全零科目；默认不勾选，仅显示有期初/账前金额的科目 */
const showZeroValue = ref(false)
const tableRef = ref<any>(null)

const expandedSet = ref<Set<string>>(new Set())
const expandedKeys = computed(() => [...expandedSet.value].map(String))
const currentRow = ref<any>(null)
const activeField = ref<BalanceField>('opening_debit')

// 年度选择
const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

// 导入相关
const importDialogVisible = ref(false)
const importPreview = ref<any[]>([])
const importUploadRef = ref<any>(null)
const importing = ref(false)
const exportingAux = ref(false)
const importMatched = computed(() => importPreview.value.filter(r => r.matched).length)

function formatMoney(val: number) {
  return '¥' + formatAmount(val || 0)
}

// 计算期末余额
function calcBalance(row: any) {
  const od = row.opening_debit || 0
  const oc = row.opening_credit || 0
  const pd = row.pre_book_debit || 0
  const pc = row.pre_book_credit || 0
  return od - oc + (pd - pc)
}

function getBalanceDisplay(row: any): { dir: '借' | '贷'; amount: number } | null {
  const net =
    (row.opening_debit || 0) +
    (row.pre_book_debit || 0) -
    (row.opening_credit || 0) -
    (row.pre_book_credit || 0)
  const abs = Math.abs(net)
  if (abs < 0.005) return null
  return { dir: net > 0 ? '借' : '贷', amount: abs }
}

/** 合计行参与累加的科目：树形取顶层（已含下级汇总），搜索列表取叶节点 */
function getSummaryRows(data: any[]): any[] {
  if (!data?.length) return []
  if (keyword.value) {
    return data.filter(row => !parentIdSet.value.has(row.id))
  }
  return data
}

function getSummaries(param: { columns: TableColumnCtx<any>[]; data: any[] }) {
  const { columns, data } = param
  const summaryRows = getSummaryRows(data)

  let totalOpeningDebit = 0
  let totalOpeningCredit = 0
  let totalPreBookDebit = 0
  let totalPreBookCredit = 0
  for (const row of summaryRows) {
    totalOpeningDebit += row.opening_debit || 0
    totalOpeningCredit += row.opening_credit || 0
    totalPreBookDebit += row.pre_book_debit || 0
    totalPreBookCredit += row.pre_book_credit || 0
  }

  const net =
    totalOpeningDebit + totalPreBookDebit - totalOpeningCredit - totalPreBookCredit
  const absNet = Math.abs(net)
  const balanceDir = absNet < 0.005 ? '平' : net > 0 ? '借' : '贷'
  summaryBalanceDir.value = balanceDir

  const sums: string[] = []
  columns.forEach((column, index) => {
    if (index === 0) {
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

const summaryBalanceDir = ref<'借' | '贷' | '平' | null>(null)

const summaryBalanceClass = computed(() => {
  const dir = summaryBalanceDir.value
  if (!dir || dir === '平') return ''
  return dir === '借' ? 'summary-balance-debit' : 'summary-balance-credit'
})

// ===================== 行内编辑 =====================

type BalanceField = 'opening_debit' | 'opening_credit' | 'pre_book_debit' | 'pre_book_credit'

interface EditingCell {
  rowId: string
  field: BalanceField
}

const FIELDS: BalanceField[] = [
  'opening_debit',
  'opening_credit',
  'pre_book_debit',
  'pre_book_credit',
]

const editingCell = ref<EditingCell | null>(null)
const editValue = ref('')
const unsavedSet = ref<Set<string>>(new Set())
const editInputRefs = ref<Record<string, HTMLInputElement | null>>({})
/** 方向键/Tab 切换单元格时抑制 blur 触发的 commit，避免刚进入编辑又被清掉 */
const isKeyboardNavigating = ref(false)

function setEditInputRef(rowId: string, field: string, el: any) {
  const key = rowId + '_' + field
  if (el) {
    editInputRefs.value[key] = el as HTMLInputElement
  } else {
    delete editInputRefs.value[key]
  }
}

function isCellDirty(row: any, field: BalanceField): boolean {
  const val = Number(editValue.value)
  return !isNaN(val) && val !== (row[field] || 0)
}

function focusEditInput(rowId: string, field: BalanceField, attempt = 0) {
  const key = rowId + '_' + field
  const inp = editInputRefs.value[key]
  if (inp) {
    inp.focus()
    inp.select()
    inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    return
  }
  if (attempt < 5) {
    nextTick(() => focusEditInput(rowId, field, attempt + 1))
  }
}

function onEditInputBlur(row: any, field: BalanceField) {
  if (isKeyboardNavigating.value) return
  if (
    !editingCell.value ||
    editingCell.value.rowId !== row.id ||
    editingCell.value.field !== field
  ) {
    return
  }
  commitEdit()
}

function startEdit(row: any, field: BalanceField) {
  if (locked.value || parentIdSet.value.has(row.id) || isAuxLeafAccount(row)) return
  activeField.value = field
  currentRow.value = row
  tableRef.value?.setCurrentRow(row)
  editingCell.value = { rowId: row.id, field }
  editValue.value = String(row[field] || 0)
  nextTick(() => focusEditInput(row.id, field))
}

function commitEdit() {
  if (!editingCell.value) return
  const { rowId, field } = editingCell.value
  const val = parseFloat(editValue.value)
  const numVal = isNaN(val) ? 0 : Math.round(val * 100) / 100

  const row = list.value.find(r => r.id === rowId)
  if (row) {
    const prevVal = row[field] || 0
    const fieldsToPersist: BalanceField[] = []

    if (field === 'opening_debit') {
      row.opening_debit = numVal
      if (numVal > 0.005 && (row.opening_credit || 0) > 0.005) {
        row.opening_credit = 0
        fieldsToPersist.push('opening_debit', 'opening_credit')
      } else if (prevVal !== numVal) {
        fieldsToPersist.push('opening_debit')
      }
    } else if (field === 'opening_credit') {
      row.opening_credit = numVal
      if (numVal > 0.005 && (row.opening_debit || 0) > 0.005) {
        row.opening_debit = 0
        fieldsToPersist.push('opening_credit', 'opening_debit')
      } else if (prevVal !== numVal) {
        fieldsToPersist.push('opening_credit')
      }
    } else if (prevVal !== numVal) {
      row[field] = numVal
      fieldsToPersist.push(field)
    }

    if (fieldsToPersist.length > 0) {
      row.balanceValue = calcBalance(row)
      const nextUnsaved = new Set(unsavedSet.value)
      for (const f of fieldsToPersist) {
        nextUnsaved.add(rowId + '_' + f)
      }
      unsavedSet.value = nextUnsaved
      recalcParentTotals()
      void persistRowCells(row, fieldsToPersist)
    }
  }

  editingCell.value = null
  editValue.value = ''
}

async function persistRowCells(row: any, fields: BalanceField[]) {
  const unique = [...new Set(fields)]
  for (const field of unique) {
    await saveCell(row, field)
  }
}

function cancelEdit() {
  editingCell.value = null
  editValue.value = ''
}

function getVisibleFields(): BalanceField[] {
  if (isMidYear.value) return FIELDS
  return ['opening_debit', 'opening_credit']
}

function navigateByKeyboard(
  row: any,
  field: BalanceField,
  direction: 'up' | 'down' | 'left' | 'right'
) {
  isKeyboardNavigating.value = true
  commitEdit()
  navigateFromCell(row, field, direction)
  nextTick(() => {
    isKeyboardNavigating.value = false
  })
}

function handleCellKeydown(e: KeyboardEvent, row: any, field: BalanceField) {
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

async function saveCell(row: any, field: BalanceField) {
  try {
    const opening = normalizeOpeningDebitCredit(row.opening_debit || 0, row.opening_credit || 0)
    row.opening_debit = opening.opening_debit
    row.opening_credit = opening.opening_credit
    await request.post('/base/init-balances', {
      account_id: row.id,
      direction: row.direction,
      year: selectedYear.value,
      opening_debit: opening.opening_debit,
      opening_credit: opening.opening_credit,
      pre_book_debit: row.pre_book_debit || 0,
      pre_book_credit: row.pre_book_credit || 0,
    })
    unsavedSet.value = new Set([...unsavedSet.value].filter(k => k !== row.id + '_' + field))
  } catch {
    // 静默失败，保留 unsaved 标记
  }
}

function getFlatNodes(): any[] {
  return flattenRows(treeData.value)
}

function recalcParentTotals() {
  const allNodes = getFlatNodes()
  const nodeMap = new Map<string, any>()
  for (const node of allNodes) {
    nodeMap.set(node.id, node)
  }

  function sumChildren(node: any) {
    if (!node.children || node.children.length === 0) {
      return
    }
    let od = 0,
      oc = 0,
      pd = 0,
      pc = 0
    for (const child of node.children) {
      sumChildren(child)
      od += child.opening_debit || 0
      oc += child.opening_credit || 0
      pd += child.pre_book_debit || 0
      pc += child.pre_book_credit || 0
    }
    node.opening_debit = od
    node.opening_credit = oc
    node.pre_book_debit = pd
    node.pre_book_credit = pc
    node.balanceValue = calcBalance(node)

    const listItem = list.value.find(item => item.id === node.id)
    if (listItem) {
      listItem.opening_debit = od
      listItem.opening_credit = oc
      listItem.pre_book_debit = pd
      listItem.pre_book_credit = pc
      listItem.balanceValue = node.balanceValue
    }
  }

  for (const root of treeData.value) {
    sumChildren(root)
  }
}

function onYearChange() {
  balanceCheck.value = null
  fetchData()
  checkCanEdit()
}

// ===================== 科目树形结构 =====================

function flattenRows(nodes: any[], result?: any[]): any[] {
  const arr = result ?? []
  for (const node of nodes) {
    arr.push(node)
    if (node.children?.length) flattenRows(node.children, arr)
  }
  return arr
}

function addDepth(nodes: any[], depth: number = 1): any[] {
  return nodes.map(node => ({
    ...node,
    _depth: depth,
    children: node.children?.length ? addDepth(node.children, depth + 1) : [],
  }))
}

const treeData = computed(() => {
  const map: Record<string, any> = {}
  const roots: any[] = []
  const seen = new Set<string>()
  for (const item of list.value) {
    if (!item.id || seen.has(item.id)) continue
    seen.add(item.id)
    map[item.id] = { ...item, children: [] }
  }
  const pushed = new Set<string>()
  for (const item of list.value) {
    if (!item.id || pushed.has(item.id)) continue
    if (!map[item.id]) continue
    pushed.add(item.id)
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id])
    } else {
      roots.push(map[item.id])
    }
  }
  return addDepth(roots)
})

const parentIdSet = computed(() => {
  const set = new Set<string>()
  for (const item of list.value) {
    if (item.parent_id) set.add(item.parent_id)
  }
  return set
})

function isAuxLeafAccount(row: any) {
  return !!(row.aux_readonly || row.has_aux) && !parentIdSet.value.has(row.id)
}

const auxLeafCount = computed(() => list.value.filter(r => isAuxLeafAccount(r)).length)

function filterTreeForAux(nodes: any[]): any[] {
  const result: any[] = []
  for (const node of nodes) {
    const children = node.children?.length ? filterTreeForAux(node.children) : []
    if (isAuxLeafAccount(node) || children.length > 0) {
      result.push({ ...node, children })
    }
  }
  return result
}

function rowHasAmount(row: any): boolean {
  return (
    (row.opening_debit || 0) > 0.005 ||
    (row.opening_credit || 0) > 0.005 ||
    (row.pre_book_debit || 0) > 0.005 ||
    (row.pre_book_credit || 0) > 0.005
  )
}

function filterTreeHideZero(nodes: any[]): any[] {
  const result: any[] = []
  for (const node of nodes) {
    const children = node.children?.length ? filterTreeHideZero(node.children) : []
    if (rowHasAmount(node) || children.length > 0) {
      result.push({ ...node, children })
    }
  }
  return result
}

function toggleAuxFilter() {
  filterAuxOnly.value = !filterAuxOnly.value
  if (filterAuxOnly.value && !keyword.value) {
    nextTick(() => {
      const filtered = filterTreeForAux(treeData.value)
      const all = flattenRows(filtered)
      expandedSet.value = new Set(all.filter(r => r.children?.length).map(r => r.id))
    })
  }
}

function auxCellTitle(row: any) {
  const count = row.aux_detail_count || 0
  return count > 0
    ? `已由 ${count} 条辅助期初汇总，请点击「辅助期初」修改`
    : '请点击「辅助期初」录入'
}

function openAuxDrawer(row: any) {
  router.push({
    name: 'InitBalanceAux',
    query: {
      account_id: row.id,
      year: String(selectedYear.value),
      mid_year: isMidYear.value ? '1' : '0',
    },
  })
}

const displayData = computed(() => {
  let data: any[]
  if (keyword.value) {
    if (filterAuxOnly.value) {
      data = list.value.filter(r => isAuxLeafAccount(r))
    } else {
      data = list.value
    }
  } else if (filterAuxOnly.value) {
    data = filterTreeForAux(treeData.value)
  } else {
    data = treeData.value
  }
  if (!showZeroValue.value) {
    data = keyword.value
      ? (data as any[]).filter(rowHasAmount)
      : filterTreeHideZero(data as any[])
  }
  return data
})

function handleCurrentRowChange(row: any) {
  currentRow.value = row
}

function flattenVisibleRows(nodes: any[], result: any[] = []): any[] {
  for (const node of nodes) {
    result.push(node)
    if (node.children?.length && expandedSet.value.has(node.id)) {
      flattenVisibleRows(node.children, result)
    }
  }
  return result
}

function getTableVisibleRows(): any[] {
  if (keyword.value) {
    const data = displayData.value
    return Array.isArray(data) ? (data as any[]) : []
  }
  return flattenVisibleRows(displayData.value as any[])
}

function isEditableBalanceRow(row: any): boolean {
  return !!row && !parentIdSet.value.has(row.id) && !isAuxLeafAccount(row)
}

function getEditableVisibleRows(): any[] {
  return getTableVisibleRows().filter(isEditableBalanceRow)
}

function scrollCurrentRowIntoView() {
  nextTick(() => {
    tableRef.value?.$el
      ?.querySelector('.el-table__row.current-row')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function resolveNavigationAnchor(): { row: any; field: BalanceField } | null {
  const editableRows = getEditableVisibleRows()
  const visibleFields = getVisibleFields()
  if (editableRows.length === 0) return null

  const field = (
    activeField.value && visibleFields.includes(activeField.value)
      ? activeField.value
      : visibleFields[0]
  ) as BalanceField

  if (currentRow.value && isEditableBalanceRow(currentRow.value)) {
    return { row: currentRow.value, field }
  }

  const visible = getTableVisibleRows()
  const pos = currentRow.value?.id
    ? visible.findIndex(r => r.id === currentRow.value.id)
    : -1

  if (pos >= 0) {
    for (let i = pos; i < visible.length; i++) {
      if (isEditableBalanceRow(visible[i])) return { row: visible[i], field }
    }
    for (let i = pos - 1; i >= 0; i--) {
      if (isEditableBalanceRow(visible[i])) return { row: visible[i], field }
    }
  }

  return { row: editableRows[0], field }
}

function navigateToBalanceCell(row: any, field: BalanceField) {
  if (!row) return
  if (!locked.value && isEditableBalanceRow(row)) {
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
  row: any,
  field: BalanceField,
  direction: 'up' | 'down' | 'left' | 'right'
) {
  const visibleFields = getVisibleFields()
  const editableRows = getEditableVisibleRows()
  if (editableRows.length === 0) return

  let rowIdx = editableRows.findIndex(r => r.id === row.id)
  let fieldIdx = visibleFields.indexOf(field)
  if (fieldIdx < 0) fieldIdx = 0
  if (rowIdx < 0) {
    navigateToBalanceCell(editableRows[0], visibleFields[fieldIdx])
    return
  }

  let nextRowIdx = rowIdx
  let nextFieldIdx = fieldIdx

  switch (direction) {
    case 'up':
      nextRowIdx = Math.max(0, rowIdx - 1)
      break
    case 'down':
      nextRowIdx = Math.min(editableRows.length - 1, rowIdx + 1)
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
        nextRowIdx = Math.min(editableRows.length - 1, rowIdx + 1)
        nextFieldIdx = 0
      }
      break
  }

  navigateToBalanceCell(editableRows[nextRowIdx], visibleFields[nextFieldIdx])
}

function moveCursor(delta: number) {
  const editableRows = getEditableVisibleRows()
  if (editableRows.length === 0) return
  const visibleFields = getVisibleFields()
  const field = (
    activeField.value && visibleFields.includes(activeField.value)
      ? activeField.value
      : visibleFields[0]
  ) as BalanceField

  if (currentRow.value && isEditableBalanceRow(currentRow.value)) {
    const idx = editableRows.findIndex(r => r.id === currentRow.value.id)
    const nextIdx = Math.max(0, Math.min(editableRows.length - 1, idx + delta))
    navigateToBalanceCell(editableRows[nextIdx], field)
    return
  }

  const visible = getTableVisibleRows()
  const pos = currentRow.value?.id
    ? visible.findIndex(r => r.id === currentRow.value.id)
    : delta > 0
      ? -1
      : visible.length
  const step = delta > 0 ? 1 : -1
  for (let i = pos + step; i >= 0 && i < visible.length; i += step) {
    if (isEditableBalanceRow(visible[i])) {
      navigateToBalanceCell(visible[i], field)
      return
    }
  }
  navigateToBalanceCell(
    editableRows[delta > 0 ? 0 : editableRows.length - 1],
    field
  )
}

function moveCursorHorizontal(delta: number) {
  const anchor = resolveNavigationAnchor()
  if (!anchor) return
  navigateFromCell(anchor.row, anchor.field, delta > 0 ? 'right' : 'left')
}

function toggleCurrentRowExpand() {
  const row = currentRow.value
  if (!row?.children?.length) return
  commitEdit()
  const next = new Set(expandedSet.value)
  if (next.has(row.id)) {
    next.delete(row.id)
  } else {
    next.add(row.id)
  }
  expandedSet.value = next
}

function handleExpandChange(row: any, expanded: boolean) {
  commitEdit()
  if (expanded) {
    expandedSet.value.add(row.id)
  } else {
    expandedSet.value.delete(row.id)
  }
}

function handleRowDblClick(row: any) {
  if (!row?.children?.length) return
  commitEdit()
  const nextExpandedSet = new Set(expandedSet.value)
  if (nextExpandedSet.has(row.id)) {
    nextExpandedSet.delete(row.id)
  } else {
    nextExpandedSet.add(row.id)
  }
  expandedSet.value = nextExpandedSet
}

function expandAll() {
  const all = flattenRows(treeData.value)
  expandedSet.value = new Set(all.filter(r => r.children?.length).map(r => r.id))
}

function collapseAll() {
  expandedSet.value = new Set()
}

function goUpLevel() {
  if (expandedSet.value.size === 0) return
  const flat = flattenRows(treeData.value)
  const expandedNodes = flat.filter(r => expandedSet.value.has(r.id))
  if (expandedNodes.length === 0) return
  const maxDepth = Math.max(...expandedNodes.map(r => r._depth || 1))
  const toCollapse = expandedNodes.filter(r => (r._depth || 1) === maxDepth)
  toCollapse.forEach(r => expandedSet.value.delete(r.id))
}

function goDownLevel() {
  const flat = flattenRows(treeData.value)
  if (expandedSet.value.size === 0) {
    const topLevel = treeData.value.filter(r => r.children?.length)
    topLevel.forEach(r => expandedSet.value.add(r.id))
    return
  }
  const expandedNodes = flat.filter(r => expandedSet.value.has(r.id))
  const maxDepth = Math.max(...expandedNodes.map(r => r._depth || 1))
  const toExpand = flat.filter(r => {
    if (!r.children?.length) return false
    if (expandedSet.value.has(r.id)) return false
    return (r._depth || 1) === maxDepth + 1 && r.parent_id && expandedSet.value.has(r.parent_id)
  })
  toExpand.forEach(r => expandedSet.value.add(r.id))
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
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

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === '\\') {
    e.preventDefault()
    commitEdit()
    collapseAll()
    return
  }
  if (e.ctrlKey && e.shiftKey && e.key === '\\') {
    e.preventDefault()
    commitEdit()
    expandAll()
    return
  }
  if (e.ctrlKey && e.key === 'ArrowUp') {
    e.preventDefault()
    commitEdit()
    goUpLevel()
    return
  }
  if (e.ctrlKey && e.key === 'ArrowDown') {
    e.preventDefault()
    commitEdit()
    goDownLevel()
    return
  }

  // 无修饰键的方向键/回车：行光标导航（input 焦点时跳过，由 handleCellKeydown 接管）
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
    toggleCurrentRowExpand()
    return
  }
}

async function fetchData() {
  try {
    const params: any = { year: selectedYear.value }
    if (keyword.value) params.keyword = keyword.value
    const res = await request.get<any[]>('/base/init-balances', { params })
    isMidYear.value = (res as any).isMidYear || false
    startMonth.value = (res as any).startMonth || 1
    list.value = res.data.map((r: any) => {
      const opening = normalizeOpeningDebitCredit(r.opening_debit || 0, r.opening_credit || 0)
      r.opening_debit = opening.opening_debit
      r.opening_credit = opening.opening_credit
      r.pre_book_debit = r.pre_book_debit || 0
      r.pre_book_credit = r.pre_book_credit || 0
      r.balanceValue = calcBalance(r)
      return r
    })
    await nextTick()
    recalcParentTotals()
  } catch (error) {
    showOperationError('获取期初余额', error)
  }
}

async function checkCanEdit() {
  try {
    const res = (await request.get('/base/init-balances/can-edit', {
      params: { year: selectedYear.value },
    })) as any
    locked.value = !res.canEdit
    lockReason.value = res.reason || ''
  } catch {
    // 接口失败时不锁定
    locked.value = false
  }
}

async function checkBalance() {
  commitEdit()
  recalcParentTotals()
  await nextTick()
  const flatNodes = getFlatNodes()
  const leafNodes = flatNodes.filter(n => !parentIdSet.value.has(n.id))
  let totalDebit = 0
  let totalCredit = 0
  for (const n of leafNodes) {
    totalDebit += (n.opening_debit || 0) + (n.pre_book_debit || 0)
    totalCredit += (n.opening_credit || 0) + (n.pre_book_credit || 0)
  }
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01

  let auxCategoryConsistent = true
  let auxCategoryMismatches: any[] = []
  try {
    const res = (await request.get('/base/init-balances/check', {
      params: { year: selectedYear.value },
    })) as any
    auxCategoryConsistent = res.auxCategoryConsistent ?? true
    auxCategoryMismatches = res.auxCategoryMismatches || []
  } catch {
    auxCategoryConsistent = true
    auxCategoryMismatches = []
  }

  balanceCheck.value = {
    balanced,
    totalDebit,
    totalCredit,
    auxCategoryConsistent,
    auxCategoryMismatches,
  }
}

async function saveAll() {
  if (locked.value) return
  saving.value = true
  try {
    commitEdit()
    recalcParentTotals()
    await nextTick()
    const flatNodes = getFlatNodes()
    const items = flatNodes
      .filter(r => !parentIdSet.value.has(r.id))
      .filter(r => !isAuxLeafAccount(r))
      .filter(
        r =>
          (r.opening_debit || 0) !== 0 ||
          (r.opening_credit || 0) !== 0 ||
          (r.pre_book_debit || 0) !== 0 ||
          (r.pre_book_credit || 0) !== 0
      )
      .map(r => {
        const opening = normalizeOpeningDebitCredit(r.opening_debit || 0, r.opening_credit || 0)
        return {
          account_id: r.id,
          direction: r.direction,
          opening_debit: opening.opening_debit,
          opening_credit: opening.opening_credit,
          pre_book_debit: r.pre_book_debit || 0,
          pre_book_credit: r.pre_book_credit || 0,
        }
      })

    if (items.length === 0) {
      showError('没有需要保存的数据')
      return
    }

    await request.post('/base/init-balances/batch', {
      year: selectedYear.value,
      items,
    })
    await checkBalance()
    showSuccess(`期初余额保存成功，共 ${items.length} 条`)
  } catch (error) {
    showOperationError('保存期初余额', error)
  } finally {
    saving.value = false
  }
}

// ===================== 导入导出 =====================

function buildInitBalanceExportRows(leafNodes: any[]) {
  return leafNodes.map(r => {
    const row: Record<string, string | number> = {
      科目编码: r.code,
      科目名称: r.name,
      方向: r.direction === 'debit' ? '借' : '贷',
      年初借方: r.opening_debit || 0,
      年初贷方: r.opening_credit || 0,
    }
    if (isMidYear.value) {
      row['帐前借方'] = r.pre_book_debit || 0
      row['帐前贷方'] = r.pre_book_credit || 0
    }
    return row
  })
}

function buildAuxDetailsExportRows(
  account: { code: string; name: string },
  data: {
    categories?: Array<{ id: string; name: string }>
    items?: Record<string, Array<{ id: string; code?: string; name?: string }>>
    lines?: Array<{
      selection: Record<string, string>
      opening_debit?: number
      opening_credit?: number
      pre_book_debit?: number
      pre_book_credit?: number
    }>
    isMidYear?: boolean
  }
) {
  const categories = data.categories || []
  return (data.lines || []).map(line => {
    const row: Record<string, string | number> = {
      科目编码: account.code,
      科目名称: account.name,
    }
    for (const cat of categories) {
      const itemId = line.selection?.[cat.id]
      const item = (data.items?.[cat.id] || []).find(i => i.id === itemId)
      row[`${cat.name}编码`] = item?.code || ''
      row[`${cat.name}名称`] = item?.name || ''
    }
    row['年初借方'] = line.opening_debit || 0
    row['年初贷方'] = line.opening_credit || 0
    if (data.isMidYear) {
      row['帐前借方'] = line.pre_book_debit || 0
      row['帐前贷方'] = line.pre_book_credit || 0
    }
    return row
  })
}

function uniqueSheetName(base: string, used: Set<string>) {
  let name = base.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || '辅助期初'
  let candidate = name
  let index = 1
  while (used.has(candidate)) {
    const suffix = `_${index++}`
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`
  }
  used.add(candidate)
  return candidate
}

async function exportData() {
  commitEdit()
  recalcParentTotals()
  await nextTick()

  const leafNodes = getFlatNodes().filter(n => !parentIdSet.value.has(n.id))
  if (leafNodes.length === 0) {
    showError('没有可导出的数据')
    return
  }

  const rows = leafNodes
  await exportStyledTable({
    fileName: `期初余额_${selectedYear.value}年.xlsx`,
    sheetName: '期初余额',
    title: '期初余额',
    subtitle: `${selectedYear.value}年`,
    columns: buildInitBalanceExportColumns(isMidYear.value),
    rows,
  })
  showSuccess(`已导出 ${rows.length} 条期初余额`)
}

async function exportAllAuxData() {
  const auxAccounts = list.value.filter(r => isAuxLeafAccount(r))
  if (auxAccounts.length === 0) {
    showError('当前没有需要辅助期初录入的科目')
    return
  }

  exportingAux.value = true
  try {
    const usedSheetNames = new Set<string>()
    const sheets: Array<{
      sheetName: string
      title: string
      subtitle: string
      columns: ReturnType<typeof buildInitBalanceAuxExportColumns>
      rows: Record<string, string | number>[]
    }> = []
    let exportedCount = 0
    let exportedLines = 0

    for (const account of auxAccounts) {
      const res = await request.get<any>('/base/init-balances/aux-details', {
        params: { year: selectedYear.value, account_id: account.id },
      })
      const rows = buildAuxDetailsExportRows(
        { code: account.code, name: account.name },
        res.data || {}
      )
      if (rows.length === 0) continue

      sheets.push({
        sheetName: uniqueSheetName(`${account.code}_${account.name}`, usedSheetNames),
        title: '辅助期初余额',
        subtitle: `${account.code} ${account.name} · ${selectedYear.value}年`,
        columns: buildInitBalanceAuxExportColumns(
          (res.data?.categories || []).map((cat: any) => ({ id: cat.id, name: cat.name })),
          Boolean(res.data?.isMidYear ?? isMidYear.value),
          { code: account.code, name: account.name }
        ),
        rows,
      })
      exportedCount++
      exportedLines += rows.length
    }

    if (exportedCount === 0) {
      showError('没有可导出的辅助期初数据')
      return
    }

    await exportStyledWorkbook(`全部辅助期初_${selectedYear.value}年.xlsx`, sheets)
    showSuccess(`已导出 ${exportedCount} 个科目、共 ${exportedLines} 条辅助期初`)
  } catch (error) {
    showOperationError('导出辅助期初', error)
  } finally {
    exportingAux.value = false
  }
}

async function downloadTemplate() {
  const { utils, writeFile } = await import('xlsx')

  const baseColumns: Record<string, any> = {
    科目编码: '1001',
    科目名称: '库存现金',
    方向: '借',
    年初借方: 10000,
    年初贷方: 0,
  }
  if (isMidYear.value) {
    baseColumns['帐前借方'] = 5000
    baseColumns['帐前贷方'] = 0
  }

  const row2: Record<string, any> = {
    科目编码: '1002',
    科目名称: '银行存款',
    方向: '借',
    年初借方: 50000,
    年初贷方: 0,
  }
  if (isMidYear.value) {
    row2['帐前借方'] = 20000
    row2['帐前贷方'] = 0
  }

  const templateData = [baseColumns, row2]
  const ws = utils.json_to_sheet(templateData)

  // 设置列宽
  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 6 },
    { wch: 14 },
    { wch: 14 },
    ...(isMidYear.value ? [{ wch: 14 }, { wch: 14 }] : []),
  ]

  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '期初余额模板')
  writeFile(wb, `期初余额导入模板_${selectedYear.value}年.xlsx`)
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

    // 建立科目编码 -> 科目的映射
    const codeMap = new Map(list.value.map(a => [String(a.code).trim(), a]))

    const parsed = rawData
      .map((row: any) => {
        const code = String(row['科目编码'] || '').trim()
        const account = codeMap.get(code)
        if (account && isAuxLeafAccount(account)) {
          return null
        }
        let opening_debit = Number(row['年初借方']) || 0
        let opening_credit = Number(row['年初贷方']) || 0
        let matched = !!account
        let error = ''
        if (account && opening_debit > 0.005 && opening_credit > 0.005) {
          matched = false
          error = '年初借方与年初贷方不能同时填写'
        }
        if (matched) {
          const opening = normalizeOpeningDebitCredit(opening_debit, opening_credit)
          opening_debit = opening.opening_debit
          opening_credit = opening.opening_credit
        }
        return {
          code,
          name: row['科目名称'] || account?.name || '',
          direction: account?.direction || '',
          opening_debit,
          opening_credit,
          pre_book_debit: Number(row['帐前借方']) || 0,
          pre_book_credit: Number(row['帐前贷方']) || 0,
          matched,
          error,
          account_id: account?.id,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null && !!r.code)

    importPreview.value = parsed
  } catch (error) {
    showError('文件解析失败，请检查文件格式')
    console.error('Import parse error:', error)
  }
}

async function handleImport() {
  const matched = importPreview.value.filter(r => r.matched)
  if (matched.length === 0) return
  importing.value = true

  try {
    const items = matched.map(r => {
      const opening = normalizeOpeningDebitCredit(r.opening_debit, r.opening_credit)
      return {
        account_id: r.account_id,
        direction: r.direction,
        opening_debit: opening.opening_debit,
        opening_credit: opening.opening_credit,
        pre_book_debit: r.pre_book_debit,
        pre_book_credit: r.pre_book_credit,
      }
    })

    await request.post('/base/init-balances/batch', {
      year: selectedYear.value,
      items,
    })

    showSuccess(`导入成功，共 ${matched.length} 条`)
    closeImportDialog()
    await fetchData()
    await checkBalance()
  } catch (error) {
    showOperationError('导入期初余额', error)
  } finally {
    importing.value = false
  }
}

function closeImportDialog() {
  importDialogVisible.value = false
  importPreview.value = []
  importUploadRef.value?.clearFiles()
}

onMounted(() => {
  const qYear = Number(route.query.year)
  if (qYear) selectedYear.value = qYear
  fetchData()
  checkCanEdit()
  window.addEventListener('keydown', handleKeydown)
})
onActivated(() => {
  const qYear = Number(route.query.year)
  if (qYear) selectedYear.value = qYear
  fetchData()
  checkCanEdit()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
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
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
  padding: 8px 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}
.header-title-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.header-title-block h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
  color: #303133;
}
.year-context {
  display: flex;
  align-items: center;
  gap: 8px;
}
.year-select {
  width: 120px;
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 4px;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #ebeef5;
}
.toolbar-group--tree {
  border-color: #dcdfe6;
}
.toolbar-group--filter {
  border-color: #faecd8;
  background: #fffcf5;
}
.toolbar-group--check {
  border-color: #d1edc4;
  background: #f6ffed;
}
.toolbar-group--import {
  border-color: #d9ecff;
  background: #f0f9ff;
}
.toolbar-group--save {
  border: none;
  background: transparent;
  padding: 0 4px;
  margin-left: auto;
}
.toolbar-divider {
  height: 24px;
  margin: 0 2px;
}
.search-input {
  width: 190px;
}
.aux-filter-badge {
  margin-left: 2px;
}
.zero-filter-checkbox {
  margin-left: 4px;
  white-space: nowrap;
}
.toolbar-group--save .el-button {
  min-width: 108px;
  font-weight: 600;
}
.balance-check-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  margin-bottom: 6px;
  flex-shrink: 0;
}
.balance-check-inner {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}
.balance-check-inner--aux {
  margin-top: 6px;
}
.aux-mismatch-list {
  margin: 4px 0 0;
  padding-left: 18px;
  font-weight: 500;
  line-height: 1.5;
}
.aux-mismatch-list li + li {
  margin-top: 2px;
}
.balance-check-inner.balanced {
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
  color: #67c23a;
}
.balance-check-inner.unbalanced {
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  color: #f56c6c;
}
.balance-check-icon {
  font-size: 14px;
}
.balance-debit {
  font-weight: 600;
  color: #409eff;
}
.balance-credit {
  font-weight: 600;
  color: #f56c6c;
}
.computed-value {
  font-weight: 600;
  color: #409eff;
  font-size: 12px;
}
.editable-cell {
  display: inline-block;
  width: 100%;
  min-height: 24px;
  line-height: 24px;
  padding: 0 6px;
  text-align: right;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: text;
  font-size: 12px;
  color: #303133;
  transition:
    border-color 0.2s,
    background 0.2s;
}
.editable-cell:hover {
  border-color: #c0c4cc;
  background: #f5f7fa;
}
.editable-cell.cell-unsaved {
  color: #e6a23c;
}
.editable-cell.cell-dirty {
  color: #409eff;
}
.editable-cell.cell-active {
  border-color: #409eff;
  background: #ecf5ff;
}
.cell-input {
  width: 100%;
  height: 24px;
  padding: 0 6px;
  text-align: right;
  border: 1px solid #409eff;
  border-radius: 4px;
  outline: none;
  font-size: 12px;
  color: #303133;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
  box-sizing: border-box;
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

.balance-table {
  border-radius: 6px;
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

:deep(.balance-table .el-table__cell) {
  padding: 2px 0 !important;
}

:deep(.balance-table th.el-table__cell) {
  padding: 5px 0 !important;
  background: var(--el-fill-color-light) !important;
  color: var(--el-text-color-regular);
  font-weight: 600;
}

:deep(.balance-table .el-table__footer-wrapper td.el-table__cell) {
  background: var(--el-fill-color-light) !important;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

:deep(.balance-table .el-table__footer-wrapper td.col-opening-debit .cell),
:deep(.balance-table .el-table__footer-wrapper td.col-opening-credit .cell),
:deep(.balance-table .el-table__footer-wrapper td.col-pre-book-debit .cell),
:deep(.balance-table .el-table__footer-wrapper td.col-pre-book-credit .cell) {
  color: #409eff;
  font-weight: 600;
}

:deep(.balance-table.summary-balance-debit .el-table__footer-wrapper td.col-balance-dir .cell),
:deep(.balance-table.summary-balance-debit .el-table__footer-wrapper td.col-balance-amount .cell) {
  color: #409eff;
  font-weight: 600;
}

:deep(.balance-table.summary-balance-credit .el-table__footer-wrapper td.col-balance-dir .cell),
:deep(.balance-table.summary-balance-credit .el-table__footer-wrapper td.col-balance-amount .cell) {
  color: #f56c6c;
  font-weight: 600;
}

:deep(.balance-table .el-table__row) {
  height: 30px;
}

:deep(.balance-table .cell) {
  min-height: 24px;
  line-height: 24px;
  padding: 0 6px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.balance-table .el-tag) {
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.balance-table .el-button--small) {
  height: 22px;
  padding: 0 4px;
}

:deep(.balance-table .el-table__expand-icon) {
  width: 18px;
  height: 18px;
  margin-right: 2px;
}
</style>
