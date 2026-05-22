<template>
  <div class="page report-page">
    <div class="page-header report-header">
      <div class="filter-row">
        <el-select
          v-if="!isDirectReportMode"
          v-model="selectedCode"
          placeholder="请选择报表模板"
          style="width: 220px"
          @change="handleTemplateChange"
        >
          <el-option
            v-for="item in templates"
            :key="item.code"
            :label="`${item.name} (${item.code})`"
            :value="item.code"
          />
        </el-select>
        <el-select v-model="filters.year" style="width: 110px">
          <el-option v-for="year in years" :key="year" :label="`${year}年`" :value="year" />
        </el-select>
        <el-select v-model="filters.period" style="width: 90px">
          <el-option v-for="period in 12" :key="period" :label="`${period}月`" :value="period" />
        </el-select>
        <el-switch
          v-model="showExecutionResult"
          inline-prompt
          active-text="结果"
          inactive-text="公式"
        />
        <el-switch
          v-model="showZeroValue"
          inline-prompt
          active-text="显示0值"
          inactive-text="隐藏0值"
        />
        <el-button :loading="loading" @click="fetchTemplateDetail">刷新</el-button>
        <el-button v-if="!isDirectReportMode" type="primary" :loading="saving" @click="saveTemplateChanges"
          >保存模板</el-button
        >
        <el-button type="success" :loading="executing" @click="() => promptAndExecuteTemplate()">生成报表</el-button>
        <el-button v-if="isDirectReportMode" @click="handlePrint">打印</el-button>
        <el-button v-if="selectedCode" @click="handleExport">导出 Excel</el-button>
        <el-switch
          v-if="!isDirectReportMode && selectedCode"
          v-model="isEnabledModel"
          inline-prompt
          active-text="启用"
          inactive-text="停用"
          :loading="enabledSwitching"
          @change="handleEnabledChange"
        />
        <el-button v-if="!isDirectReportMode" type="warning" @click="triggerImport">导入 Excel</el-button>
        <el-button v-if="!isDirectReportMode" type="primary" plain @click="openCreateReportDialog">
          新增报表
        </el-button>
        <el-button v-if="!isDirectReportMode && selectedCode" plain @click="openEditMetaDialog">修改编码</el-button>
        <el-button v-if="!isDirectReportMode && selectedCode" type="danger" plain @click="handleDeleteTemplate">删除模板</el-button>
        <input
          v-if="!isDirectReportMode"
          ref="fileInputRef"
          type="file"
          accept=".xls,.xlsx"
          style="display: none"
          @change="handleFileImport"
        />
      </div>
      <el-alert
        v-if="isCashFlowTemplate && isDirectReportMode"
        type="info"
        :closable="false"
        show-icon
        class="cash-flow-hint"
        title="正式报送以本表为准；可用「科目估算」页核对静态口径与分录差异"
      >
        <template #default>
          <el-button
            type="primary"
            link
            @click="
              router.push({
                path: '/report/cash-flow',
                query: {
                  year: String(filters.year),
                  period: String(filters.period),
                  scope: 'month',
                },
              })
            "
          >
            打开现金流量表(估算)对比
          </el-button>
        </template>
      </el-alert>
      <div v-if="!isDirectReportMode" class="formula-edit-row">
        <span class="formula-label">单元格 {{ selectedPositionLabel || '-' }}</span>
        <el-input
          v-model="topEditorValue"
          type="textarea"
          :rows="1"
          resize="none"
          :autosize="{ minRows: 1, maxRows: 3 }"
          class="formula-editor-input"
          :placeholder="selectedPosition ? '请输入公式或文本' : '请先选择单元格'"
          :disabled="!selectedPosition"
          @keydown.enter.exact.prevent="applyTopEditorEdit"
        />
        <el-button type="primary" size="small" :disabled="!selectedPosition" @click="applyTopEditorEdit">应用</el-button>
      </div>
      <div v-if="!isDirectReportMode" class="toolbar-row">
        <div class="toolbar-group">
          <span class="toolbar-group-label">对齐</span>
          <el-button-group size="small">
            <el-button @click="applyAlignmentToSelection('left')">左</el-button>
            <el-button @click="applyAlignmentToSelection('center')">中</el-button>
            <el-button @click="applyAlignmentToSelection('right')">右</el-button>
            <el-button @click="applyVerticalAlignToSelection('top')">上</el-button>
            <el-button @click="applyVerticalAlignToSelection('middle')">中</el-button>
            <el-button @click="applyVerticalAlignToSelection('bottom')">下</el-button>
          </el-button-group>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">字体</span>
          <el-button-group size="small">
            <el-dropdown trigger="click" @command="(cmd: string) => applyFontFamilyToSelection(cmd)">
              <el-button>字体<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="">默认</el-dropdown-item>
                  <el-dropdown-item command="SimSun">宋体</el-dropdown-item>
                  <el-dropdown-item command="KaiTi">楷体</el-dropdown-item>
                  <el-dropdown-item command="SimHei">黑体</el-dropdown-item>
                  <el-dropdown-item command="FangSong">仿宋</el-dropdown-item>
                  <el-dropdown-item command="Microsoft YaHei">微软雅黑</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown trigger="click" @command="(cmd: number) => applyFontSizeToSelection(cmd)">
              <el-button>字号<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="12">12</el-dropdown-item>
                  <el-dropdown-item :command="13">13 (默认)</el-dropdown-item>
                  <el-dropdown-item :command="14">14</el-dropdown-item>
                  <el-dropdown-item :command="16">16</el-dropdown-item>
                  <el-dropdown-item :command="18">18</el-dropdown-item>
                  <el-dropdown-item :command="22">22</el-dropdown-item>
                  <el-dropdown-item :command="28">28</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button @click="adjustFontSizeToSelection(-1)">A-</el-button>
            <el-button @click="adjustFontSizeToSelection(1)">A+</el-button>
            <el-button @click="toggleBoldToSelection"><strong>B</strong></el-button>
            <el-button @click="toggleUnderlineToSelection"><u>U</u></el-button>
          </el-button-group>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">边框</span>
          <el-button-group size="small">
            <el-dropdown trigger="click" @command="(cmd: string) => applyBorderToSelection(cmd)">
              <el-button :disabled="!hasStyleSelection">边框<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="all">全边框</el-dropdown-item>
                  <el-dropdown-item command="outer">外边框</el-dropdown-item>
                  <el-dropdown-item command="none">无边框</el-dropdown-item>
                  <el-dropdown-item command="bottom">下边框</el-dropdown-item>
                  <el-dropdown-item command="top">上边框</el-dropdown-item>
                  <el-dropdown-item command="left">左边框</el-dropdown-item>
                  <el-dropdown-item command="right">右边框</el-dropdown-item>
                  <el-dropdown-item command="header">标题线</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown trigger="click" @command="(cmd: string) => applyBorderColorToSelection(cmd)">
              <el-button>颜色<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="">默认</el-dropdown-item>
                  <el-dropdown-item command="303030">黑色</el-dropdown-item>
                  <el-dropdown-item command="909399">灰色</el-dropdown-item>
                  <el-dropdown-item command="409eff">蓝色</el-dropdown-item>
                  <el-dropdown-item command="67c23a">绿色</el-dropdown-item>
                  <el-dropdown-item command="e6a23c">橙色</el-dropdown-item>
                  <el-dropdown-item command="f56c6c">红色</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown trigger="click" @command="(cmd: string) => applyBorderWidthToSelection(cmd)">
              <el-button>粗细<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="">默认(1px)</el-dropdown-item>
                  <el-dropdown-item command="2">2px</el-dropdown-item>
                  <el-dropdown-item command="3">3px</el-dropdown-item>
                  <el-dropdown-item command="4">4px</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-button-group>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">格式</span>
          <el-button-group size="small">
            <el-dropdown trigger="click" @command="(cmd: string) => applyFormatToSelection(cmd)">
              <el-button>数字格式<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="">默认</el-dropdown-item>
                  <el-dropdown-item command="integer">整数</el-dropdown-item>
                  <el-dropdown-item command="2decimal">两位小数</el-dropdown-item>
                  <el-dropdown-item command="4decimal">四位小数</el-dropdown-item>
                  <el-dropdown-item command="percent">百分比</el-dropdown-item>
                  <el-dropdown-item command="thousands">千分位</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-button-group>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">行列</span>
          <el-button-group size="small">
            <el-button @click="insertRow" :disabled="!selectedPosition">插行</el-button>
            <el-button @click="deleteRow" :disabled="!selectedPosition">删行</el-button>
            <el-button @click="insertCol" :disabled="!selectedPosition">插列</el-button>
            <el-button @click="deleteCol" :disabled="!selectedPosition">删列</el-button>
          </el-button-group>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">合并</span>
          <el-button-group size="small">
            <el-button @click="mergeSelection" :disabled="!canMergeSelection">合并</el-button>
            <el-button @click="unmergeSelection" :disabled="!canUnmergeSelection">取消</el-button>
          </el-button-group>
        </div>
      </div>
    </div>

    <el-card v-loading="loading">
      <template v-if="templateData">
        <div class="editor-layout">
          <div class="grid-panel">
            <el-tabs
              v-model="activeSheetName"
              class="sheet-tabs sheet-tabs-no-header"
              @tab-change="handleSheetChange"
              @edit="handleSheetEdit"
            >
              <el-tab-pane
                v-for="sheet in templateData.sheets"
                :key="sheet.id"
                :label="sheet.sheet_name"
                :name="sheet.id"
                :closable="templateData.sheets.length > 1"
              >
                <div class="sheet-grid-wrap" @paste="handleGridPaste">
                  <div
                    :class="['sheet-grid', { 'sheet-grid-balance': isBalanceTemplate }]"
                    :style="{ width: `${getSheetGridWidth(sheet.id, sheet.metrics.colCount)}px` }"
                  >
                    <div
                      class="sheet-grid-header-row"
                      :style="{
                        gridTemplateColumns: getGridTemplateColumns(
                          sheet.id,
                          sheet.metrics.colCount
                        ),
                      }"
                    >
                      <button
                        type="button"
                        class="row-index row-index-header select-all-corner"
                        :class="{ active: bulkSelectionMode === 'all' }"
                        aria-label="全选后批量调整列宽或行高"
                        @click="toggleSelectAll"
                      >
                        <span class="select-all-corner-mark"></span>
                      </button>
                      <div
                        v-for="colIndex in Math.max(sheet.metrics.colCount, 1)"
                        :key="`header-${sheet.id}-${colIndex - 1}`"
                        class="column-header-cell"
                        :class="{
                          active:
                            bulkSelectionMode === 'column' && selectedColIndex === colIndex - 1,
                        }"
                        @click="selectColumn(colIndex - 1)"
                      >
                        <div class="column-header-content">
                          <span>{{ toColumnName(colIndex - 1) }}</span>
                          <button
                            type="button"
                            class="column-resize-handle"
                            :aria-label="`调整第 ${colIndex} 列宽度`"
                            @dblclick.stop="autoFitColumn(sheet.id, colIndex - 1)"
                            @mousedown.prevent="startColumnResize(sheet.id, colIndex - 1, $event)"
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      v-for="row in buildSheetRows(sheet)"
                      :key="row.rowIndex"
                      class="sheet-grid-row"
                      :style="{
                        gridTemplateColumns: getGridTemplateColumns(
                          sheet.id,
                          sheet.metrics.colCount
                        ),
                        minHeight: `${row.rowHeight}px`,
                      }"
                    >
                      <div
                        class="row-index"
                        :class="{
                          active: bulkSelectionMode === 'row' && selectedRowIndex === row.rowIndex,
                        }"
                        :style="{
                          minHeight: `${row.rowHeight}px`,
                        }"
                        @click="selectRow(row.rowIndex)"
                      >
                        <div class="row-index-content">
                          <span>{{ row.rowIndex + 1 }}</span>
                          <button
                            type="button"
                            class="row-resize-handle"
                            :aria-label="`调整第 ${row.rowIndex + 1} 行高度`"
                            @dblclick.stop="autoFitRow(sheet.id, row.rowIndex)"
                            @mousedown.prevent="startRowResize(sheet.id, row.rowIndex, $event)"
                          />
                        </div>
                      </div>
                      <template v-for="cell in row.cells" :key="`${row.rowIndex}-${cell.colIndex}`">
                        <div
                          :style="{
                            height: `${row.rowHeight}px`,
                            minHeight: `${row.rowHeight}px`,
                            textAlign: cell.textAlign as 'left' | 'center' | 'right',
                            verticalAlign: cell.verticalAlign !== 'top' ? (cell.verticalAlign as 'middle' | 'bottom') : undefined,
                            gridColumn: `${cell.colIndex + 2} / span ${cell.colSpan}`,
                            gridRow: cell.rowSpan > 1 ? `span ${cell.rowSpan}` : undefined,
                            fontSize: cell.fontSize !== 13 ? `${cell.fontSize}px` : undefined,
                            fontWeight: cell.bold ? 700 : undefined,
                            textDecoration: cell.underline ? 'underline' : undefined,
                            fontFamily: cell.fontFamily || undefined,
                            borderColor: cell.borderColor ? `#${cell.borderColor}` : undefined,
                            borderWidth: cell.borderWidth ? `${cell.borderWidth}px` : undefined,
                          }"
                          :class="[
                            'cell',
                            `cell-${cell.cell_type}`,
                            `cell-border-${cell.borderStyle}`,
                            {
                              empty: !cell.displayValue,
                              selected: cell.isSelected,
                              editing: cell.isEditing,
                              error: cell.executionStatus === 'error',
                              'bulk-selected': isCellStructureSelected(cell.rowIndex, cell.colIndex),
                              merged: cell.colSpan > 1 || cell.rowSpan > 1,
                            },
                          ]"
                          :title="cell.tooltip"
                          @click="selectGridCell(cell, $event)"
                          @mousedown.prevent="startDragSelection(cell, $event)"
                        >
                          <template v-if="cell.isEditing">
                            <textarea
                              ref="setActiveEditorRef"
                              :value="cell.editorValue"
                              class="cell-editor-input"
                              @click.stop
                              @input="handleInlineInput(cell, $event)"
                              @keydown.enter.exact.prevent="applyInlineEdit(cell)"
                              @keydown.esc.stop.prevent="cancelInlineEdit()"
                              @blur="applyInlineEdit(cell)"
                            />
                          </template>
                          <div v-else class="cell-content">{{ cell.displayValue || ' ' }}</div>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </template>

      <EmptyState v-else-if="!loading" type="data" description="请选择一个已导入的报表模板" />
    </el-card>

    <el-dialog
      v-model="createDialogVisible"
      title="新增报表"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
      @closed="resetCreateReportForm"
    >
      <el-form label-width="96px" class="create-report-form" @submit.prevent>
        <el-form-item label="报表编码" required>
          <el-input
            v-model="createForm.code"
            placeholder="自动编号，可修改"
            maxlength="32"
            clearable
          />
          <div class="form-tip">新建时自动取当前最大编码 +1，仅支持字母与数字</div>
        </el-form-item>
        <el-form-item label="报表名称" required>
          <el-input
            v-model="createForm.name"
            placeholder="选择文件后自动填入，可修改"
            maxlength="100"
            clearable
          />
        </el-form-item>
        <el-form-item label="模板文件" required>
          <el-upload
            class="create-report-upload"
            drag
            :auto-upload="false"
            :limit="1"
            accept=".xls,.xlsx"
            :file-list="createFileList"
            :on-change="handleCreateFileChange"
            :on-remove="handleCreateFileRemove"
            :on-exceed="handleCreateFileExceed"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">将 Excel 拖到此处，或<em>点击上传</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 .xls / .xlsx，名称默认取文件名（不含扩展名）</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="submitCreateReport">
          确定导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editMetaDialogVisible"
      title="修改报表编码"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="96px" @submit.prevent>
        <el-form-item label="报表编码" required>
          <el-input
            v-model="editMetaForm.code"
            placeholder="字母 / 数字 / 下划线"
            maxlength="32"
            clearable
          />
          <div class="form-tip">
            导航栏按编码升序排列，修改编码即可改变报表的显示顺序。<br />
            若新编码已被其他报表使用，两者编码将自动互换。
          </div>
        </el-form-item>
        <el-form-item label="报表名称">
          <el-input
            v-model="editMetaForm.name"
            placeholder="留空则不修改名称"
            maxlength="100"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editMetaDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editMetaSubmitting" @click="submitEditMeta">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/api/request'
import {
  getTemplateDetail,
  saveTemplateCells,
  REPORT_LONG_REQUEST_TIMEOUT,
  REPORT_EXECUTE_REQUEST_TIMEOUT,
  type TemplateDetailData,
  type UpdateReportCellPayload,
} from '@/api/reportTemplate'
import EmptyState from '@/components/EmptyState.vue'
import { useDynamicReportEditor } from '@/composables/useDynamicReportEditor'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { showOperationError, showSuccess, showError } from '@/composables/useMessage'
import { ArrowDown, UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile, UploadUserFile } from 'element-plus'

type TemplateListItem = {
  id: string
  code: string
  name: string
  source: string
  source_file: string | null
  sort_order: number
  is_enabled: boolean
}

type TemplateCell = {
  id: string
  report_sheet_id: string
  row_index: number
  col_index: number
  cell_type: string
  text_value: string | null
  formula_text: string | null
  format_text: string | null
  style_key: string | null
  side: string | null
  col_width: number | null
  row_height: number | null
  merge_info: string | null
}

type TemplateSheet = {
  id: string
  report_definition_id: string
  sheet_key: string
  sheet_name: string
  sheet_index: number
  default_col_width: number | null
  default_row_height: number | null
  col_widths: string | null
  row_heights: string | null
  metrics: {
    cellCount: number
    rowCount: number
    colCount: number
    errorCount?: number
  }
  cells: TemplateCell[]
}

type TemplateDetail = TemplateDetailData

type ExecutionCell = {
  id: string
  display_value: string
  error: string | null
  status: 'ok' | 'error'
}

type ExecuteResponse = {
  definition: TemplateListItem
  filters: { year: number; period: number }
  sheets: Array<{
    id: string
    metrics: {
      cellCount: number
      rowCount: number
      colCount: number
      errorCount: number
    }
    cells: Array<ExecutionCell>
  }>
}

type ExecuteTaskResponse = {
  taskId: string
  pollUrl?: string
}

type ExecuteTaskStatusResponse = {
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  result?: ExecuteResponse
  error?: string
}

type SheetDisplayCell = {
  id: string
  rowIndex: number
  colIndex: number
  cell_type: string
  displayValue: string
  tooltip: string
  executionStatus: 'ok' | 'error' | ''
  isSelected: boolean
  isEditing: boolean
  editorValue: string
  textAlign: CellTextAlign
  verticalAlign: string
  colSpan: number
  rowSpan: number
  fontSize: number
  bold: boolean
  underline: boolean
  fontFamily: string
  borderStyle: string
  borderColor: string
  borderWidth: string
  formatType: string
}

type BulkSelectionMode = 'none' | 'all' | 'row' | 'column' | 'range'
type CellTextAlign = 'left' | 'center' | 'right'
type CellRange = { startRow: number; startCol: number; endRow: number; endCol: number }
type YearPeriodForm = {
  year: number
  period: number
}

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const executing = ref(false)
const showExecutionResult = ref(false)
const showZeroValue = ref(false)
const templates = ref<TemplateListItem[]>([])
const templateData = ref<TemplateDetail | null>(null)
const selectedCode = ref('')
const activeSheetName = ref('')
const yearPeriodForm = ref<YearPeriodForm>({
  year: new Date().getFullYear(),
  period: new Date().getMonth() + 1,
})
const filters = ref({ year: new Date().getFullYear(), period: new Date().getMonth() + 1 })
const years = Array.from({ length: 10 }, (_, index) => new Date().getFullYear() - index)
const inlineEditingPosition = ref<{ rowIndex: number; colIndex: number } | null>(null)
const inlineEditorValue = ref('')
const topEditorValue = ref('')
const bulkSelectionMode = ref<BulkSelectionMode>('none')
const selectedRowIndex = ref<number | null>(null)
const selectedColIndex = ref<number | null>(null)
const selectedRanges = ref<CellRange[]>([])
const isDraggingSelection = ref(false)
const justFinishedDrag = ref(false)
const dragSelectionStart = ref<{ rowIndex: number; colIndex: number } | null>(null)
const dragSelectionEnd = ref<{ rowIndex: number; colIndex: number } | null>(null)
const activeEditorRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const resizingColumn = ref<{
  sheetId: string
  colIndex: number
  startX: number
  startWidth: number
  applyToAll: boolean
  initialWidths: number[]
} | null>(null)
const resizingRow = ref<{
  sheetId: string
  rowIndex: number
  startY: number
  startHeight: number
  applyToAll: boolean
  initialHeights: number[]
} | null>(null)
const {
  getColumnWidth: getStoredColumnWidth,
  saveColumnWidth,
  getRowHeight: getStoredRowHeight,
  saveRowHeight,
} = useColumnWidthMemory('dynamic-report-grid')

const {
  selectedCellId,
  selectedPosition,
  selectedCell,
  draftCells,
  executionCells,
  selectCell,
  selectPosition,
  updateDraftCell,
  applyGridPaste,
  copyCellToPosition,
  moveCellToPosition,
  clearDrafts,
  buildSavePayload,
  applyExecutionResult,
  resetExecutionResult,
} = useDynamicReportEditor(
  computed(() => templateData.value?.sheets || []),
  activeSheetName
)

const formulaFunctionNames = computed(() => {
  const names = templateData.value?.formulaFunctions?.map(item => item.function_name) || []
  return names.join(' / ')
})

const hasInlineEditing = computed(() => Boolean(inlineEditingPosition.value))

const hasStyleSelection = computed(() => {
  if (bulkSelectionMode.value === 'all') return true
  if (bulkSelectionMode.value === 'row' && selectedRowIndex.value !== null) return true
  if (bulkSelectionMode.value === 'column' && selectedColIndex.value !== null) return true
  if (bulkSelectionMode.value === 'range' && selectedRanges.value.length > 0) return true
  return Boolean(selectedPosition.value)
})

const selectedPositionLabel = computed(() => {
  if (bulkSelectionMode.value === 'all') return '全部'
  if (bulkSelectionMode.value === 'row' && selectedRowIndex.value !== null) {
    return `第 ${selectedRowIndex.value + 1} 行`
  }
  if (bulkSelectionMode.value === 'column' && selectedColIndex.value !== null) {
    return `${toColumnName(selectedColIndex.value)} 列`
  }
  if (bulkSelectionMode.value === 'range' && selectedRanges.value.length > 0) {
    const r = selectedRanges.value[0]
    const count = (r.endRow - r.startRow + 1) * (r.endCol - r.startCol + 1)
    if (selectedRanges.value.length === 1 && count === 1) {
      return `${toColumnName(r.startCol)}${r.startRow + 1}`
    }
    return `${toColumnName(r.startCol)}${r.startRow + 1}:${toColumnName(r.endCol)}${r.endRow + 1}`
  }
  if (!selectedPosition.value) return ''
  return `${toColumnName(selectedPosition.value.colIndex)}${selectedPosition.value.rowIndex + 1}`
})

const directReportMeta = computed(() => {
  // 来自侧边栏报表管理的 ?view=1 快速查看模式
  if (route.query.view === '1' && route.params.code) {
    const template = templates.value.find(t => t.code === route.params.code)
    return { title: template?.name || '报表查看', code: String(route.params.code), autoRun: true }
  }
  const meta = route.meta || {}
  const title = typeof meta.title === 'string' ? meta.title : ''
  const code = typeof meta.dynamicReportCode === 'string' ? meta.dynamicReportCode : ''
  const autoRun = meta.autoRun === true
  return title && code && autoRun ? { title, code } : null
})

const isDirectReportMode = computed(() => Boolean(directReportMeta.value))
const pageTitle = computed(() => directReportMeta.value?.title || templateData.value?.definition.name || '动态报表设计器')
const hasPromptedDirectExecution = ref(false)
const hasTriggeredAutoRunForPath = ref('')
const reportGeneratePromptVisible = ref(false)

const summaryText = computed(() => {
  if (!templateData.value) return ''
  const totalCells = templateData.value.sheets.reduce(
    (sum, sheet) => sum + sheet.metrics.cellCount,
    0
  )
  return `当前已加载 ${templateData.value.sheets.length} 个工作表，共 ${totalCells} 个单元格。支持像 Excel 一样点击单元格直接编辑，并可拖动调整列宽、行高且保存记忆；结果模式下优先显示执行结果。`
})

const isBalanceTemplate = computed(() => selectedCode.value === '1')
const isCashFlowTemplate = computed(() => selectedCode.value === '3')

const canMergeSelection = computed(() => {
  if (bulkSelectionMode.value !== 'range' || selectedRanges.value.length === 0) return false
  // 单个连续矩形（拖选 / Shift）
  if (selectedRanges.value.length === 1) {
    const r = selectedRanges.value[0]
    return r.endRow > r.startRow || r.endCol > r.startCol
  }
  // 多个独立单格（Ctrl+点击）：只要超过 1 个格就可以合并
  return true
})

const canUnmergeSelection = computed(() => {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return false
  if (bulkSelectionMode.value === 'range' && selectedRanges.value.length > 0) {
    const r = selectedRanges.value[0]
    return sheet.cells.some(c =>
      c.row_index >= r.startRow && c.row_index <= r.endRow &&
      c.col_index >= r.startCol && c.col_index <= r.endCol &&
      c.merge_info
    )
  }
  if (selectedPosition.value) {
    const cell = sheet.cells.find(
      c => c.row_index === selectedPosition.value!.rowIndex && c.col_index === selectedPosition.value!.colIndex
    )
    return Boolean(cell?.merge_info)
  }
  return false
})

function toColumnName(colIndex: number) {
  let col = colIndex
  let name = ''
  do {
    name = String.fromCharCode(65 + (col % 26)) + name
    col = Math.floor(col / 26) - 1
  } while (col >= 0)
  return name
}

function clearStructureSelection() {
  bulkSelectionMode.value = 'none'
  selectedRowIndex.value = null
  selectedColIndex.value = null
  selectedRanges.value = []
  topEditorValue.value = ''
}

function isCellStructureSelected(rowIndex: number, colIndex: number) {
  if (bulkSelectionMode.value === 'all') return true
  if (bulkSelectionMode.value === 'row') return selectedRowIndex.value === rowIndex
  if (bulkSelectionMode.value === 'column') return selectedColIndex.value === colIndex
  if (bulkSelectionMode.value === 'range') {
    return selectedRanges.value.some(r =>
      rowIndex >= r.startRow && rowIndex <= r.endRow &&
      colIndex >= r.startCol && colIndex <= r.endCol
    )
  }
  return false
}

type CellStyleSource = {
  style_key?: string | null
}

function getCellTextAlign(cell: CellStyleSource | null | undefined) {
  const styleKey = cell?.style_key || ''
  if (styleKey.includes('align-right')) return 'right'
  if (styleKey.includes('align-center')) return 'center'
  return 'left'
}

function getCellVerticalAlign(cell: CellStyleSource | null | undefined): string {
  const styleKey = cell?.style_key || ''
  if (styleKey.includes('valign-middle')) return 'middle'
  if (styleKey.includes('valign-bottom')) return 'bottom'
  return 'top'
}

function buildCellStyleKey(alignment: CellTextAlign, cell: CellStyleSource | null) {
  const baseStyleKey = (cell?.style_key || '').replace(/\balign-(left|center|right)\b/g, '').trim()
  return [baseStyleKey, `align-${alignment}`].filter(Boolean).join(' ')
}

function getCellFontSize(cell: CellStyleSource | null | undefined): number {
  const match = (cell?.style_key || '').match(/\bfont-size-(\d+)\b/)
  return match ? parseInt(match[1], 10) : 13
}

function getCellBold(cell: CellStyleSource | null | undefined): boolean {
  return (cell?.style_key || '').includes('font-bold')
}

function getCellBorderStyle(cell: CellStyleSource | null | undefined): string {
  const styleKey = cell?.style_key || ''
  const match = styleKey.match(/\bborder-(all|none|bottom|top|left|right|outer|header)\b/)
  return match ? match[1] : 'all'
}

function getCellFormatType(cell: { format_text?: string | null } | null | undefined): string {
  return cell?.format_text || ''
}

function getCellUnderline(cell: CellStyleSource | null | undefined): boolean {
  return (cell?.style_key || '').includes('font-underline')
}

function getCellFontFamily(cell: CellStyleSource | null | undefined): string {
  const styleKey = cell?.style_key || ''
  const match = styleKey.match(/\bfont-family-([^\s]+)/)
  if (!match) return ''
  const token = match[1]
  const fontMap: Record<string, string> = {
    SimSun: 'SimSun',
    NSimSun: 'NSimSun',
    KaiTi: 'KaiTi',
    SimHei: 'SimHei',
    FangSong: 'FangSong',
    'Microsoft-YaHei': 'Microsoft YaHei',
    Microsoft: 'Microsoft YaHei',
  }
  return fontMap[token] || token.replace(/-/g, ' ')
}

function getCellBorderColor(cell: CellStyleSource | null | undefined): string {
  const match = (cell?.style_key || '').match(/\bborder-color-([a-fA-F0-9]+)\b/)
  return match ? match[1] : ''
}

function getCellBorderWidth(cell: CellStyleSource | null | undefined): string {
  const match = (cell?.style_key || '').match(/\bborder-width-(\d+)\b/)
  return match ? match[1] : ''
}

const FONT_SIZE_STEPS = [12, 13, 14, 16, 18, 22, 28]

function formatNumberValue(value: string, formatType: string): string {
  if (!formatType || !value) return value
  const num = parseFloat(value)
  if (isNaN(num)) return value
  switch (formatType) {
    case 'integer': return Math.round(num).toString()
    case '2decimal': return num.toFixed(2)
    case '4decimal': return num.toFixed(4)
    case 'percent': return (num * 100).toFixed(2) + '%'
    case 'thousands': return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    default: return value
  }
}

function applyVerticalAlignToSelection(valign: string) {
  const count = applyStyleToSelection(styleKey => {
    const base = styleKey.replace(/\bvalign-(top|middle|bottom)\b/g, '').trim()
    return valign !== 'top' ? `${base} valign-${valign}`.trim() : base
  })
  if (count > 0) {
    const labels: Record<string, string> = { top: '顶端', middle: '居中', bottom: '底端' }
    showSuccess(`已将 ${count} 个单元格垂直设为${labels[valign] || valign}`)
  }
}

function applyAlignmentToSelection(alignment: CellTextAlign) {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return

  const existingCellMap = new Map(
    sheet.cells.map(cell => [`${cell.row_index}:${cell.col_index}`, cell])
  )

  const shouldUpdate = (rowIndex: number, colIndex: number) => {
    if (bulkSelectionMode.value === 'all') return true
    if (bulkSelectionMode.value === 'row') return selectedRowIndex.value === rowIndex
    if (bulkSelectionMode.value === 'column') return selectedColIndex.value === colIndex
    return (
      selectedPosition.value?.rowIndex === rowIndex && selectedPosition.value?.colIndex === colIndex
    )
  }

  let updatedCount = 0
  for (let rowIndex = 0; rowIndex < Math.max(sheet.metrics.rowCount, 1); rowIndex += 1) {
    for (let colIndex = 0; colIndex < Math.max(sheet.metrics.colCount, 1); colIndex += 1) {
      if (!shouldUpdate(rowIndex, colIndex)) continue
      const draft = draftCells.value[getDraftKey(sheet.id, rowIndex, colIndex)]
      const cell = existingCellMap.get(`${rowIndex}:${colIndex}`) || null
      const mergedCell = draft ? { ...cell, ...draft } : cell
      updateDraftCell({
        id: mergedCell?.id || undefined,
        row_index: rowIndex,
        col_index: colIndex,
        cell_type: mergedCell?.cell_type || 'text',
        text_value: mergedCell?.text_value ?? null,
        formula_text: mergedCell?.formula_text ?? null,
        format_text: mergedCell?.format_text ?? null,
        style_key: buildCellStyleKey(alignment, mergedCell),
      })
      updatedCount += 1
    }
  }

  if (updatedCount > 0) {
    showSuccess(
      `已将 ${updatedCount} 个单元格设置为${alignment === 'left' ? '左对齐' : alignment === 'center' ? '居中' : '右对齐'}`
    )
  }
}

function applyStyleToSelection(
  styleModifier: (styleKey: string) => string,
  formatModifier?: (formatText: string | null) => string | null
) {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return 0

  const existingCellMap = new Map(
    sheet.cells.map(cell => [`${cell.row_index}:${cell.col_index}`, cell])
  )

  const shouldUpdate = (rowIndex: number, colIndex: number) => {
    if (bulkSelectionMode.value === 'all') return true
    if (bulkSelectionMode.value === 'row') return selectedRowIndex.value === rowIndex
    if (bulkSelectionMode.value === 'column') return selectedColIndex.value === colIndex
    return (
      selectedPosition.value?.rowIndex === rowIndex && selectedPosition.value?.colIndex === colIndex
    )
  }

  let updatedCount = 0
  for (let rowIndex = 0; rowIndex < Math.max(sheet.metrics.rowCount, 1); rowIndex += 1) {
    for (let colIndex = 0; colIndex < Math.max(sheet.metrics.colCount, 1); colIndex += 1) {
      if (!shouldUpdate(rowIndex, colIndex)) continue
      const draft = draftCells.value[getDraftKey(sheet.id, rowIndex, colIndex)]
      const cell = existingCellMap.get(`${rowIndex}:${colIndex}`) || null
      const mergedCell = draft ? { ...cell, ...draft } : cell
      const newStyleKey = styleModifier(mergedCell?.style_key || '')
      const newFormatText = formatModifier
        ? formatModifier(mergedCell?.format_text ?? null)
        : (mergedCell?.format_text ?? null)
      updateDraftCell({
        id: mergedCell?.id || undefined,
        row_index: rowIndex,
        col_index: colIndex,
        cell_type: mergedCell?.cell_type || 'text',
        text_value: mergedCell?.text_value ?? null,
        formula_text: mergedCell?.formula_text ?? null,
        format_text: newFormatText,
        style_key: newStyleKey,
      })
      updatedCount += 1
    }
  }
  return updatedCount
}

function getSelectedStyleKey(): string {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return ''

  // 单个单元格选中
  if (selectedPosition.value && bulkSelectionMode.value === 'none') {
    const draft = draftCells.value[getDraftKey(sheet.id, selectedPosition.value.rowIndex, selectedPosition.value.colIndex)]
    const cell = sheet.cells.find(c => c.row_index === selectedPosition.value!.rowIndex && c.col_index === selectedPosition.value!.colIndex)
    const merged = draft ? { ...cell, ...draft } : cell
    return merged?.style_key || ''
  }

  // 批量选择：取选中范围内第一个有 style_key 的单元格
  const shouldCheck = (rowIndex: number, colIndex: number) => {
    if (bulkSelectionMode.value === 'all') return true
    if (bulkSelectionMode.value === 'row') return selectedRowIndex.value === rowIndex
    if (bulkSelectionMode.value === 'column') return selectedColIndex.value === colIndex
    return false
  }
  for (const cell of sheet.cells) {
    if (shouldCheck(cell.row_index, cell.col_index)) {
      const draft = draftCells.value[getDraftKey(sheet.id, cell.row_index, cell.col_index)]
      const merged = draft ? { ...cell, ...draft } : cell
      if (merged?.style_key) return merged.style_key
    }
  }
  return ''
}

function applyFontSizeToSelection(size: number) {
  const count = applyStyleToSelection(styleKey => {
    const base = styleKey.replace(/\bfont-size-\d+\b/g, '').trim()
    return size !== 13 ? `${base} font-size-${size}`.trim() : base
  })
  if (count > 0) showSuccess(`已将 ${count} 个单元格字体设为 ${size}px`)
}

function adjustFontSizeToSelection(delta: number) {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return
  const existingCellMap = new Map(sheet.cells.map(cell => [`${cell.row_index}:${cell.col_index}`, cell]))
  const shouldUpdate = (rowIndex: number, colIndex: number) => {
    if (bulkSelectionMode.value === 'all') return true
    if (bulkSelectionMode.value === 'row') return selectedRowIndex.value === rowIndex
    if (bulkSelectionMode.value === 'column') return selectedColIndex.value === colIndex
    return selectedPosition.value?.rowIndex === rowIndex && selectedPosition.value?.colIndex === colIndex
  }
  let updatedCount = 0
  for (let rowIndex = 0; rowIndex < Math.max(sheet.metrics.rowCount, 1); rowIndex += 1) {
    for (let colIndex = 0; colIndex < Math.max(sheet.metrics.colCount, 1); colIndex += 1) {
      if (!shouldUpdate(rowIndex, colIndex)) continue
      const draft = draftCells.value[getDraftKey(sheet.id, rowIndex, colIndex)]
      const cell = existingCellMap.get(`${rowIndex}:${colIndex}`) || null
      const mergedCell = draft ? { ...cell, ...draft } : cell
      const currentSize = getCellFontSize(mergedCell)
      const currentIdx = FONT_SIZE_STEPS.indexOf(currentSize)
      const nextIdx = Math.max(0, Math.min(FONT_SIZE_STEPS.length - 1, currentIdx >= 0 ? currentIdx + delta : (delta > 0 ? 1 : 0)))
      const nextSize = FONT_SIZE_STEPS[nextIdx]
      const newStyleKey = (mergedCell?.style_key || '').replace(/\bfont-size-\d+\b/g, '').trim()
      const finalStyleKey = nextSize !== 13 ? `${newStyleKey} font-size-${nextSize}`.trim() : newStyleKey
      updateDraftCell({
        id: mergedCell?.id || undefined,
        row_index: rowIndex,
        col_index: colIndex,
        cell_type: mergedCell?.cell_type || 'text',
        text_value: mergedCell?.text_value ?? null,
        formula_text: mergedCell?.formula_text ?? null,
        format_text: mergedCell?.format_text ?? null,
        style_key: finalStyleKey,
      })
      updatedCount += 1
    }
  }
  if (updatedCount > 0) showSuccess(`已将 ${updatedCount} 个单元格字号${delta > 0 ? '加大' : '减小'}`)
}

function toggleBoldToSelection() {
  const isBold = getSelectedStyleKey().includes('font-bold')
  const count = applyStyleToSelection(styleKey => {
    if (isBold) return styleKey.replace(/\bfont-bold\b/g, '').trim()
    return `${styleKey} font-bold`.trim()
  })
  if (count > 0) showSuccess(`已将 ${count} 个单元格${isBold ? '取消加粗' : '设为加粗'}`)
}

function toggleUnderlineToSelection() {
  const isUnderline = getSelectedStyleKey().includes('font-underline')
  const count = applyStyleToSelection(styleKey => {
    if (isUnderline) return styleKey.replace(/\bfont-underline\b/g, '').trim()
    return `${styleKey} font-underline`.trim()
  })
  if (count > 0) showSuccess(`已将 ${count} 个单元格${isUnderline ? '取消下划线' : '设为下划线'}`)
}

function applyFontFamilyToSelection(family: string) {
  const count = applyStyleToSelection(styleKey => {
    const base = styleKey.replace(/\bfont-family-[a-zA-Z0-9-]+\b/g, '').trim()
    return family ? `${base} font-family-${family}`.trim() : base
  })
  if (count > 0) {
    const labels: Record<string, string> = { '': '默认', SimSun: '宋体', KaiTi: '楷体', SimHei: '黑体', FangSong: '仿宋', 'Microsoft YaHei': '微软雅黑' }
    showSuccess(`已将 ${count} 个单元格字体设为${labels[family] || family}`)
  }
}

function applyBorderColorToSelection(color: string) {
  const count = applyStyleToSelection(styleKey => {
    const base = styleKey.replace(/\bborder-color-[a-fA-F0-9]+\b/g, '').trim()
    return color ? `${base} border-color-${color}`.trim() : base
  })
  if (count > 0) {
    const labels: Record<string, string> = { '': '默认', '303030': '黑色', '909399': '灰色', '409eff': '蓝色', '67c23a': '绿色', 'e6a23c': '橙色', 'f56c6c': '红色' }
    showSuccess(`已将 ${count} 个单元格边框颜色设为${labels[color] || color}`)
  }
}

function applyBorderWidthToSelection(width: string) {
  const count = applyStyleToSelection(styleKey => {
    const base = styleKey.replace(/\bborder-width-\d+\b/g, '').trim()
    return width ? `${base} border-width-${width}`.trim() : base
  })
  if (count > 0) {
    showSuccess(`已将 ${count} 个单元格边框粗细设为${width ? `${width}px` : '默认'}`)
  }
}

function applyBorderToSelection(borderStyle: string) {
  if (!hasStyleSelection.value) {
    ElMessage.warning('请先选择单元格、行、列或全选后再设置边框')
    return
  }
  const count = applyStyleToSelection(styleKey => {
    const base = styleKey.replace(/\bborder-(all|none|bottom|top|left|right|outer|header)\b/g, '').trim()
    return borderStyle !== 'all' ? `${base} border-${borderStyle}`.trim() : base
  })
  if (count > 0) {
    const labels: Record<string, string> = { all: '全边框', none: '无边框', bottom: '下边框', top: '上边框', left: '左边框', right: '右边框', outer: '外边框', header: '标题线' }
    showSuccess(`已将 ${count} 个单元格设为${labels[borderStyle] || borderStyle}`)
  }
}

function applyFormatToSelection(formatType: string) {
  const count = applyStyleToSelection(
    styleKey => styleKey,
    () => formatType || null
  )
  if (count > 0) {
    const labels: Record<string, string> = { '': '默认', integer: '整数', '2decimal': '两位小数', '4decimal': '四位小数', percent: '百分比', thousands: '千分位' }
    showSuccess(`已将 ${count} 个单元格设为${labels[formatType] || formatType}格式`)
  }
}

function getDraftKey(sheetId: string, rowIndex: number, colIndex: number) {
  return `${sheetId}:${rowIndex}:${colIndex}`
}

function getColumnStorageKey(sheetId: string, colIndex: number) {
  return `column:${selectedCode.value || 'default'}:${sheetId}:${colIndex}`
}

function getRowStorageKey(sheetId: string, rowIndex: number) {
  return `row:${selectedCode.value || 'default'}:${sheetId}:${rowIndex}`
}

function getDefaultColumnWidth(colIndex: number) {
  if (isBalanceTemplate.value) {
    if (colIndex === 0 || colIndex === 4) return 260
    if (colIndex === 1 || colIndex === 5) return 72
    if (colIndex === 2 || colIndex === 3 || colIndex === 6 || colIndex === 7) return 170
  }
  return 160
}

function getColumnWidth(sheetId: string, colIndex: number) {
  const sheet = templateData.value?.sheets.find(s => s.id === sheetId)
  const stored = getStoredColumnWidth(getColumnStorageKey(sheetId, colIndex))

  if (stored != null) {
    return stored
  }

  // Priority 2: Cell-level col_width override
  const cellColWidth = sheet?.cells.find(
    c => c.col_index === colIndex && c.col_width != null && c.col_width > 0
  )?.col_width
  if (cellColWidth != null) {
    return cellColWidth
  }

  // Priority 3: Database col_widths (JSON array)
  if (sheet?.col_widths) {
    try {
      const widths = JSON.parse(sheet.col_widths) as number[]
      if (widths[colIndex] != null && widths[colIndex] > 0) {
        return widths[colIndex]
      }
    } catch {
      // Invalid JSON, continue to next priority
    }
  }

  // Priority 4: Database default_col_width
  if (sheet?.default_col_width != null && sheet.default_col_width > 0) {
    return sheet.default_col_width
  }

  // Priority 5: Default
  return getDefaultColumnWidth(colIndex)
}

function getGridTemplateColumns(sheetId: string, colCount: number) {
  const resolvedColCount = Math.max(colCount, 1)
  return ['56px']
    .concat(
      Array.from(
        { length: resolvedColCount },
        (_, colIndex) => `${getColumnWidth(sheetId, colIndex)}px`
      )
    )
    .join(' ')
}

function getSheetGridWidth(sheetId: string, colCount: number) {
  const resolvedColCount = Math.max(colCount, 1)
  const contentWidth = Array.from({ length: resolvedColCount }, (_, colIndex) =>
    getColumnWidth(sheetId, colIndex)
  ).reduce((sum, width) => sum + width, 0)
  return contentWidth + 56
}

function getDefaultRowHeight(rowIndex: number) {
  return rowIndex === 0 ? 40 : 34
}

function getRowHeight(sheetId: string, rowIndex: number) {
  const sheet = templateData.value?.sheets.find(s => s.id === sheetId)
  const stored = getStoredRowHeight(getRowStorageKey(sheetId, rowIndex))

  if (stored != null) {
    return stored
  }

  // Priority 2: Cell-level row_height override
  const cellRowHeight = sheet?.cells.find(
    c => c.row_index === rowIndex && c.row_height != null && c.row_height > 0
  )?.row_height
  if (cellRowHeight != null) {
    return cellRowHeight
  }

  // Priority 3: Database row_heights (JSON array)
  if (sheet?.row_heights) {
    try {
      const heights = JSON.parse(sheet.row_heights) as number[]
      if (heights[rowIndex] != null && heights[rowIndex] > 0) {
        return heights[rowIndex]
      }
    } catch {
      // Invalid JSON, continue to next priority
    }
  }

  // Priority 4: Database default_row_height
  if (sheet?.default_row_height != null && sheet.default_row_height > 0) {
    return sheet.default_row_height
  }

  // Priority 5: Default
  return getDefaultRowHeight(rowIndex)
}

function persistColumnWidth(sheetId: string, colIndex: number, width: number) {
  saveColumnWidth(getColumnStorageKey(sheetId, colIndex), Math.max(72, Math.round(width)))
}

function persistAllColumnWidths(sheetId: string, widths: number[]) {
  widths.forEach((width, colIndex) => {
    persistColumnWidth(sheetId, colIndex, width)
  })
}

function persistRowHeight(sheetId: string, rowIndex: number, height: number) {
  saveRowHeight(getRowStorageKey(sheetId, rowIndex), Math.max(28, Math.round(height)))
}

function persistAllRowHeights(sheetId: string, heights: number[]) {
  heights.forEach((height, rowIndex) => {
    persistRowHeight(sheetId, rowIndex, height)
  })
}

function estimateTextWidth(value: string) {
  const normalized = value || ''
  return normalized.split('\n').reduce((maxWidth, line) => {
    const latinWidth = Array.from(line).reduce(
      (sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 14 : 8),
      0
    )
    return Math.max(maxWidth, latinWidth)
  }, 0)
}

function estimateTextHeight(value: string, width: number) {
  const normalized = value || ' '
  const availableWidth = Math.max(width - 16, 56)
  const lineCount = normalized.split('\n').reduce((sum, line) => {
    const estimatedWidth = Math.max(estimateTextWidth(line), 8)
    return sum + Math.max(1, Math.ceil(estimatedWidth / availableWidth))
  }, 0)
  return Math.max(34, lineCount * 22 + 12)
}

function autoFitColumn(sheetId: string, colIndex: number) {
  const sheet = templateData.value?.sheets.find(item => item.id === sheetId)
  if (!sheet) return

  let maxWidth = getDefaultColumnWidth(colIndex)
  for (let rowIndex = 0; rowIndex < Math.max(sheet.metrics.rowCount, 1); rowIndex += 1) {
    const cell = sheet.cells.find(
      item => item.row_index === rowIndex && item.col_index === colIndex
    )
    const value = cell ? getDisplayCellValue(cell, sheet.id) : ''
    maxWidth = Math.max(maxWidth, estimateTextWidth(value) + 24)
  }

  persistColumnWidth(sheetId, colIndex, Math.min(480, Math.max(72, maxWidth)))
}

function autoFitRow(sheetId: string, rowIndex: number) {
  const sheet = templateData.value?.sheets.find(item => item.id === sheetId)
  if (!sheet) return

  let maxHeight = getDefaultRowHeight(rowIndex)
  for (let colIndex = 0; colIndex < Math.max(sheet.metrics.colCount, 1); colIndex += 1) {
    const cell = sheet.cells.find(
      item => item.row_index === rowIndex && item.col_index === colIndex
    )
    const value = cell ? getDisplayCellValue(cell, sheet.id) : ''
    maxHeight = Math.max(maxHeight, estimateTextHeight(value, getColumnWidth(sheetId, colIndex)))
  }

  persistRowHeight(sheetId, rowIndex, Math.min(240, Math.max(28, maxHeight)))
}

type CellDisplaySource = {
  id?: string
  row_index: number
  col_index: number
  text_value?: string | null
  formula_text?: string | null
  format_text?: string | null
}

function getDisplayCellValue(cell: CellDisplaySource, sheetId: string) {
  const executionCell = cell.id ? executionCells.value[cell.id] : undefined
  const formatType = getCellFormatType(cell as { format_text?: string | null })
  if (showExecutionResult.value && executionCell?.display_value) {
    const raw = executionCell.display_value
    const formatted = formatType ? formatNumberValue(raw, formatType) : raw
    if (!showZeroValue.value && isZeroValue(formatted)) return ''
    return formatted
  }
  const draft = draftCells.value[getDraftKey(sheetId, cell.row_index, cell.col_index)]
  const rawValue = draft?.text_value || draft?.formula_text || cell.text_value || cell.formula_text || ''
  const effectiveFormat = getCellFormatType({ format_text: draft?.format_text ?? cell.format_text })
  const formatted = effectiveFormat ? formatNumberValue(rawValue, effectiveFormat) : rawValue
  if (!showZeroValue.value && isZeroValue(formatted)) return ''
  return formatted
}

function isZeroValue(value: string): boolean {
  if (!value || value.trim() === '') return false
  const num = parseFloat(value.replace(/,/g, '').replace(/%/g, ''))
  return !isNaN(num) && num === 0
}

function getCellEditorValue(cell: TemplateCell | null) {
  if (!cell) return ''
  return cell.formula_text || cell.text_value || ''
}

function setActiveEditorRef(el: Element | null) {
  if (!(el instanceof HTMLTextAreaElement)) return
  activeEditorRef.value = el
  nextTick(() => {
    el.focus()
    el.select()
  })
}

function startInlineEdit(rowIndex: number, colIndex: number) {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return
  const cell =
    sheet.cells.find(item => item.row_index === rowIndex && item.col_index === colIndex) || null
  inlineEditingPosition.value = { rowIndex, colIndex }
  inlineEditorValue.value = getCellEditorValue(cell)
}

function cancelInlineEdit() {
  inlineEditingPosition.value = null
  inlineEditorValue.value = ''
  activeEditorRef.value = null
}

function handleColumnResizeMouseMove(event: MouseEvent) {
  const current = resizingColumn.value
  if (!current) return
  const deltaX = event.clientX - current.startX
  if (current.applyToAll) {
    persistAllColumnWidths(
      current.sheetId,
      current.initialWidths.map(width => width + deltaX)
    )
    return
  }
  persistColumnWidth(current.sheetId, current.colIndex, current.startWidth + deltaX)
}

function handleRowResizeMouseMove(event: MouseEvent) {
  const current = resizingRow.value
  if (!current) return
  const deltaY = event.clientY - current.startY
  if (current.applyToAll) {
    persistAllRowHeights(
      current.sheetId,
      current.initialHeights.map(height => height + deltaY)
    )
    return
  }
  persistRowHeight(current.sheetId, current.rowIndex, current.startHeight + deltaY)
}

function stopColumnResize() {
  resizingColumn.value = null
  window.removeEventListener('mousemove', handleColumnResizeMouseMove)
  window.removeEventListener('mouseup', stopColumnResize)
}

function stopRowResize() {
  resizingRow.value = null
  window.removeEventListener('mousemove', handleRowResizeMouseMove)
  window.removeEventListener('mouseup', stopRowResize)
}

function startColumnResize(sheetId: string, colIndex: number, event: MouseEvent) {
  const sheet = templateData.value?.sheets.find(item => item.id === sheetId)
  const resolvedColCount = Math.max(sheet?.metrics.colCount || 1, 1)
  const applyToAll = bulkSelectionMode.value === 'all'
  const initialWidths = Array.from({ length: resolvedColCount }, (_, index) =>
    getColumnWidth(sheetId, index)
  )

  if (
    bulkSelectionMode.value === 'column' &&
    selectedColIndex.value !== null &&
    selectedColIndex.value !== colIndex
  ) {
    return
  }

  resizingColumn.value = {
    sheetId,
    colIndex,
    startX: event.clientX,
    startWidth: getColumnWidth(sheetId, colIndex),
    applyToAll,
    initialWidths,
  }
  window.addEventListener('mousemove', handleColumnResizeMouseMove)
  window.addEventListener('mouseup', stopColumnResize)
}

function startRowResize(sheetId: string, rowIndex: number, event: MouseEvent) {
  const sheet = templateData.value?.sheets.find(item => item.id === sheetId)
  const resolvedRowCount = Math.max(sheet?.metrics.rowCount || 1, 1)
  const applyToAll = bulkSelectionMode.value === 'all'
  const initialHeights = Array.from({ length: resolvedRowCount }, (_, index) =>
    getRowHeight(sheetId, index)
  )

  if (
    bulkSelectionMode.value === 'row' &&
    selectedRowIndex.value !== null &&
    selectedRowIndex.value !== rowIndex
  ) {
    return
  }

  resizingRow.value = {
    sheetId,
    rowIndex,
    startY: event.clientY,
    startHeight: getRowHeight(sheetId, rowIndex),
    applyToAll,
    initialHeights,
  }
  window.addEventListener('mousemove', handleRowResizeMouseMove)
  window.addEventListener('mouseup', stopRowResize)
}

function buildSheetRows(sheet: TemplateSheet) {
  const existingCellMap = new Map(
    sheet.cells.map(cell => [`${cell.row_index}:${cell.col_index}`, cell])
  )

  // Build set of cells that are covered by a merge (should be hidden)
  const coveredCells = new Set<string>()
  const rowMaxRowSpan = new Map<number, number>() // track max rowSpan for each row
  for (const cell of sheet.cells) {
    if (!cell.merge_info) continue
    try {
      const merge = JSON.parse(cell.merge_info) as { colSpan?: number; rowSpan?: number }
      const cs = merge.colSpan || 1
      const rs = merge.rowSpan || 1
      for (let r = 0; r < rs; r++) {
        for (let c = 0; c < cs; c++) {
          if (r === 0 && c === 0) continue
          coveredCells.add(`${cell.row_index + r}:${cell.col_index + c}`)
        }
      }
      // Track max rowSpan for the merge origin row
      const currentMax = rowMaxRowSpan.get(cell.row_index) || 1
      if (rs > currentMax) {
        rowMaxRowSpan.set(cell.row_index, rs)
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return Array.from({ length: Math.max(sheet.metrics.rowCount, 1) }, (_, rowIndex) => {
    const maxRowSpan = rowMaxRowSpan.get(rowIndex) || 1
    return {
      rowIndex,
      rowHeight: getRowHeight(sheet.id, rowIndex),
      rowSpan: maxRowSpan,
      cells: Array.from({ length: Math.max(sheet.metrics.colCount, 1) }, (_, colIndex) => {
        const existingCell = existingCellMap.get(`${rowIndex}:${colIndex}`)
        const draft = draftCells.value[getDraftKey(sheet.id, rowIndex, colIndex)]
        const cell = draft ? { ...existingCell, ...draft } : existingCell
        const executionCell = cell?.id ? executionCells.value[cell.id] : undefined
        const isEditing =
          inlineEditingPosition.value?.rowIndex === rowIndex &&
          inlineEditingPosition.value?.colIndex === colIndex &&
          activeSheetName.value === sheet.id

        // Parse merge info
        const isMerged = coveredCells.has(`${rowIndex}:${colIndex}`)
        let colSpan = 1
        let rowSpan = 1
        if (!isMerged && cell?.merge_info) {
          try {
            const merge = JSON.parse(cell.merge_info) as { colSpan?: number; rowSpan?: number }
            colSpan = merge.colSpan || 1
            rowSpan = merge.rowSpan || 1
          } catch {
            // Invalid JSON, use defaults
          }
        }

        return {
          id: cell?.id || '',
          rowIndex,
          colIndex,
          cell_type: isMerged ? 'merged' : (cell?.cell_type || 'empty'),
          displayValue: cell ? getDisplayCellValue(cell, sheet.id) : '',
          tooltip: executionCell?.error || cell?.formula_text || cell?.text_value || '',
          executionStatus: executionCell?.status || '',
          isSelected:
            selectedPosition.value?.rowIndex === rowIndex &&
            selectedPosition.value?.colIndex === colIndex &&
            activeSheetName.value === sheet.id,
          isEditing,
          editorValue: isEditing ? inlineEditorValue.value : '',
          textAlign: (showExecutionResult.value && executionCell?.numeric_value != null)
            ? 'right'
            : getCellTextAlign(cell),
          verticalAlign: getCellVerticalAlign(cell),
          colSpan,
          rowSpan,
          fontSize: getCellFontSize(cell),
          bold: getCellBold(cell),
          underline: getCellUnderline(cell),
          fontFamily: getCellFontFamily(cell),
          borderStyle: getCellBorderStyle(cell),
          borderColor: getCellBorderColor(cell),
          borderWidth: getCellBorderWidth(cell),
          formatType: getCellFormatType(cell),
        } satisfies SheetDisplayCell
      }),
    }
  })
}

function getSelectedCellDraftOrSource() {
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet || !selectedPosition.value) return null

  const { rowIndex, colIndex } = selectedPosition.value
  const draft = draftCells.value[getDraftKey(sheet.id, rowIndex, colIndex)]
  const source = sheet.cells.find(item => item.row_index === rowIndex && item.col_index === colIndex)

  return draft ? { ...source, ...draft } : source || draft || null
}

function syncTopEditorValue() {
  const cell = getSelectedCellDraftOrSource()
  topEditorValue.value = cell ? (cell.formula_text || cell.text_value || '') : ''
}

function parseClipboardText(rawText: string) {
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(row => row.length > 0)
    .map(row => row.split('\t'))
}

function toggleSelectAll() {
  if (bulkSelectionMode.value === 'all') {
    clearStructureSelection()
    return
  }
  bulkSelectionMode.value = 'all'
  selectedRowIndex.value = null
  selectedColIndex.value = null
  cancelInlineEdit()
  selectedCellId.value = ''
  selectedPosition.value = null
}

function selectRow(rowIndex: number) {
  bulkSelectionMode.value =
    bulkSelectionMode.value === 'row' && selectedRowIndex.value === rowIndex ? 'none' : 'row'
  selectedRowIndex.value = bulkSelectionMode.value === 'row' ? rowIndex : null
  selectedColIndex.value = null
  cancelInlineEdit()
  selectedCellId.value = ''
  selectedPosition.value = null
  topEditorValue.value = ''
}

function selectColumn(colIndex: number) {
  bulkSelectionMode.value =
    bulkSelectionMode.value === 'column' && selectedColIndex.value === colIndex ? 'none' : 'column'
  selectedColIndex.value = bulkSelectionMode.value === 'column' ? colIndex : null
  selectedRowIndex.value = null
  cancelInlineEdit()
  selectedCellId.value = ''
  selectedPosition.value = null
  topEditorValue.value = ''
}

function clearBulkSelection() {
  clearStructureSelection()
}

function startDragSelection(cell: SheetDisplayCell, event: MouseEvent) {
  // 只响应左键，且不是Ctrl/Shift
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return
  isDraggingSelection.value = true
  dragSelectionStart.value = { rowIndex: cell.rowIndex, colIndex: cell.colIndex }
  dragSelectionEnd.value = { rowIndex: cell.rowIndex, colIndex: cell.colIndex }
  window.addEventListener('mousemove', handleDragSelectionMove)
  window.addEventListener('mouseup', stopDragSelection)
}

function handleDragSelectionMove(event: MouseEvent) {
  if (!isDraggingSelection.value) return
  // 通过 event.target 找到最近的 cell 元素
  const target = event.target as HTMLElement
  const cellEl = target.closest('.cell') as HTMLElement | null
  if (!cellEl) return
  // 从 DOM 中读取 row/col 信息 - 通过遍历找到对应的 cell
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet || !dragSelectionStart.value) return

  // 找到鼠标位置对应的单元格坐标
  const gridWrap = cellEl.closest('.sheet-grid-wrap')
  if (!gridWrap) return
  const gridRect = gridWrap.getBoundingClientRect()
  const x = event.clientX - gridRect.left + gridWrap.scrollLeft
  const y = event.clientY - gridRect.top + gridWrap.scrollTop

  // 计算列和行
  let colIndex = 0
  let xOffset = 56 // row-index width
  for (let c = 0; c < sheet.metrics.colCount; c++) {
    const w = getColumnWidth(sheet.id, c)
    if (x < xOffset + w) { colIndex = c; break }
    xOffset += w
    if (c === sheet.metrics.colCount - 1) colIndex = c
  }

  let rowIndex = 0
  let yOffset = 0
  for (let r = 0; r < sheet.metrics.rowCount; r++) {
    const h = getRowHeight(sheet.id, r)
    if (y < yOffset + h) { rowIndex = r; break }
    yOffset += h
    if (r === sheet.metrics.rowCount - 1) rowIndex = r
  }

  dragSelectionEnd.value = { rowIndex, colIndex }
  // 实时更新选中范围
  const start = dragSelectionStart.value
  selectedRanges.value = [{
    startRow: Math.min(start.rowIndex, rowIndex),
    startCol: Math.min(start.colIndex, colIndex),
    endRow: Math.max(start.rowIndex, rowIndex),
    endCol: Math.max(start.colIndex, colIndex),
  }]
  bulkSelectionMode.value = 'range'
  selectedPosition.value = null
  selectedCellId.value = ''
  topEditorValue.value = ''
}

function stopDragSelection() {
  if (isDraggingSelection.value && dragSelectionStart.value && dragSelectionEnd.value) {
    const start = dragSelectionStart.value
    const end = dragSelectionEnd.value
    if (start.rowIndex === end.rowIndex && start.colIndex === end.colIndex) {
      // 没有拖动，恢复单选（让 click 事件处理）
      selectedRanges.value = []
      bulkSelectionMode.value = 'none'
    } else {
      // 拖选了多个单元格，标记一下，阻止后续 click 清空选区
      justFinishedDrag.value = true
      setTimeout(() => { justFinishedDrag.value = false }, 100)
    }
  }
  isDraggingSelection.value = false
  dragSelectionStart.value = null
  dragSelectionEnd.value = null
  window.removeEventListener('mousemove', handleDragSelectionMove)
  window.removeEventListener('mouseup', stopDragSelection)
}

function selectGridCell(cell: SheetDisplayCell, event?: MouseEvent) {
  const ctrlKey = event?.ctrlKey || event?.metaKey
  const shiftKey = event?.shiftKey

  if (ctrlKey) {
    // Ctrl+点击：追加到多选
    if (bulkSelectionMode.value !== 'range') {
      // 从单选切换到range模式，保留当前选中
      if (selectedPosition.value) {
        selectedRanges.value = [{
          startRow: selectedPosition.value.rowIndex,
          startCol: selectedPosition.value.colIndex,
          endRow: selectedPosition.value.rowIndex,
          endCol: selectedPosition.value.colIndex,
        }]
      } else {
        selectedRanges.value = []
      }
      bulkSelectionMode.value = 'range'
    }
    // 切换当前单元格的选中状态
    const existingIdx = selectedRanges.value.findIndex(r =>
      r.startRow === cell.rowIndex && r.startCol === cell.colIndex &&
      r.endRow === cell.rowIndex && r.endCol === cell.colIndex
    )
    if (existingIdx >= 0) {
      selectedRanges.value.splice(existingIdx, 1)
      if (selectedRanges.value.length === 0) {
        bulkSelectionMode.value = 'none'
      }
    } else {
      selectedRanges.value.push({
        startRow: cell.rowIndex, startCol: cell.colIndex,
        endRow: cell.rowIndex, endCol: cell.colIndex,
      })
    }
    cancelInlineEdit()
    selectedCellId.value = ''
    selectedPosition.value = null
    topEditorValue.value = ''
    return
  }

  if (shiftKey && selectedPosition.value) {
    // Shift+点击：范围选择
    const startRow = Math.min(selectedPosition.value.rowIndex, cell.rowIndex)
    const endRow = Math.max(selectedPosition.value.rowIndex, cell.rowIndex)
    const startCol = Math.min(selectedPosition.value.colIndex, cell.colIndex)
    const endCol = Math.max(selectedPosition.value.colIndex, cell.colIndex)
    selectedRanges.value = [{ startRow, startCol, endRow, endCol }]
    bulkSelectionMode.value = 'range'
    cancelInlineEdit()
    selectedCellId.value = ''
    selectedPosition.value = null
    topEditorValue.value = ''
    return
  }

  // 普通点击：单选（如果刚完成拖选则跳过，保留选区）
  if (justFinishedDrag.value) return
  clearStructureSelection()
  selectedRanges.value = []

  // 如果点击的是 merged 单元格，找到所属合并区域并选中
  if (cell.cell_type === 'merged') {
    const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
    if (sheet) {
      for (const c of sheet.cells) {
        if (!c.merge_info) continue
        try {
          const merge = JSON.parse(c.merge_info) as { colSpan?: number; rowSpan?: number }
          const cs = merge.colSpan || 1
          const rs = merge.rowSpan || 1
          if (
            cell.rowIndex >= c.row_index && cell.rowIndex < c.row_index + rs &&
            cell.colIndex >= c.col_index && cell.colIndex < c.col_index + cs
          ) {
            selectedRanges.value = [{
              startRow: c.row_index,
              startCol: c.col_index,
              endRow: c.row_index + rs - 1,
              endCol: c.col_index + cs - 1,
            }]
            bulkSelectionMode.value = 'range'
            if (c.id) selectCell(c.id, c.row_index, c.col_index)
            else selectPosition(c.row_index, c.col_index)
            syncTopEditorValue()
            cancelInlineEdit()
            return
          }
        } catch { /* skip */ }
      }
    }
    selectPosition(cell.rowIndex, cell.colIndex)
    syncTopEditorValue()
    cancelInlineEdit()
    return
  }

  // 如果点击的是有 merge_info 的单元格（合并源），选中整个合并区域
  if (cell.colSpan > 1 || cell.rowSpan > 1) {
    selectedRanges.value = [{
      startRow: cell.rowIndex,
      startCol: cell.colIndex,
      endRow: cell.rowIndex + cell.rowSpan - 1,
      endCol: cell.colIndex + cell.colSpan - 1,
    }]
    bulkSelectionMode.value = 'range'
    if (cell.id) selectCell(cell.id, cell.rowIndex, cell.colIndex)
    else selectPosition(cell.rowIndex, cell.colIndex)
    syncTopEditorValue()
    cancelInlineEdit()
    return
  }

  if (cell.id) {
    selectCell(cell.id, cell.rowIndex, cell.colIndex)
  } else {
    selectPosition(cell.rowIndex, cell.colIndex)
  }
  syncTopEditorValue()

  if (
    hasInlineEditing.value &&
    inlineEditingPosition.value?.rowIndex === cell.rowIndex &&
    inlineEditingPosition.value?.colIndex === cell.colIndex
  ) {
    return
  }

  startInlineEdit(cell.rowIndex, cell.colIndex)
}

function handleInlineInput(cell: SheetDisplayCell, event: Event) {
  const target = event.target as HTMLTextAreaElement | null
  inlineEditorValue.value = target?.value || ''
  if (
    !selectedPosition.value ||
    selectedPosition.value.rowIndex !== cell.rowIndex ||
    selectedPosition.value.colIndex !== cell.colIndex
  ) {
    selectPosition(cell.rowIndex, cell.colIndex)
  }
}

function applyInlineEdit(cell: SheetDisplayCell) {
  const nextValue = inlineEditorValue.value.trim()
  const cellType =
    nextValue.startsWith('=') || nextValue.startsWith('@') || nextValue.startsWith('＝')
      ? 'formula'
      : nextValue
        ? 'text'
        : 'empty'

  updateDraftCell({
    id: cell.id || undefined,
    row_index: cell.rowIndex,
    col_index: cell.colIndex,
    cell_type: cellType,
    text_value: cellType === 'formula' || cellType === 'empty' ? null : nextValue,
    formula_text: cellType === 'formula' ? nextValue : null,
    format_text: selectedCell.value?.format_text ?? null,
  })

  selectPosition(cell.rowIndex, cell.colIndex)
  syncTopEditorValue()
  cancelInlineEdit()
}

function applyTopEditorEdit() {
  if (!selectedPosition.value) return

  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return

  const { rowIndex, colIndex } = selectedPosition.value
  const source = getSelectedCellDraftOrSource()
  const nextValue = topEditorValue.value.trim()
  const cellType =
    nextValue.startsWith('=') || nextValue.startsWith('@') || nextValue.startsWith('＝')
      ? 'formula'
      : nextValue
        ? 'text'
        : 'empty'

  updateDraftCell({
    id: source?.id,
    row_index: rowIndex,
    col_index: colIndex,
    cell_type: cellType,
    text_value: cellType === 'formula' || cellType === 'empty' ? null : nextValue,
    formula_text: cellType === 'formula' ? nextValue : null,
    format_text: source?.format_text ?? null,
    style_key: source?.style_key ?? null,
  })

  if (hasInlineEditing.value) {
    cancelInlineEdit()
  }
  syncTopEditorValue()
}

function handleGridPaste(event: ClipboardEvent) {
  if (!selectedPosition.value) return
  const rawText = event.clipboardData?.getData('text/plain') || ''
  if (!rawText.trim()) return

  const rows = parseClipboardText(rawText)
  if (rows.length === 0) return

  event.preventDefault()
  const updatedCount = applyGridPaste(
    selectedPosition.value.rowIndex,
    selectedPosition.value.colIndex,
    rows
  )
  if (updatedCount > 0) {
    showSuccess(`已写入 ${updatedCount} 个单元格到草稿`)
  }
}

async function fetchTemplateList() {
  const res = await request.get<TemplateListItem[]>('/report/templates')
  templates.value = res.data || []

  const routeCode = directReportMeta.value?.code || String(route.params.code || '')
  if (routeCode && templates.value.some(item => item.code === routeCode)) {
    selectedCode.value = routeCode
  } else if (!selectedCode.value && templates.value.length > 0) {
    selectedCode.value = templates.value[0].code
  }
}

async function fetchTemplateDetail() {
  if (!selectedCode.value) {
    templateData.value = null
    return
  }

  loading.value = true
  try {
    const data = await getTemplateDetail(selectedCode.value)
    templateData.value = data
    activeSheetName.value = data.sheets[0]?.id || ''
    clearDrafts()
    resetExecutionResult()
    cancelInlineEdit()
    selectedCellId.value = ''
    selectedPosition.value = null
    topEditorValue.value = ''
    if (!isDirectReportMode.value && route.params.code !== selectedCode.value) {
      router.replace({ name: 'DynamicReport', params: { code: selectedCode.value } })
    }
  } catch (error) {
    showOperationError('加载动态报表模板', error)
  } finally {
    loading.value = false
  }
}

async function saveTemplateChanges() {
  cancelInlineEdit()
  const payload = buildSavePayload()
  if (!payload.sheetId || payload.cells.length === 0) {
    showSuccess('当前工作表没有待保存的修改')
    return
  }

  saving.value = true
  try {
    await saveTemplateCells(selectedCode.value, {
      sheetId: payload.sheetId,
      cells: payload.cells as UpdateReportCellPayload[],
    })
    showSuccess('模板保存成功')
    await fetchTemplateDetail()
  } catch (error) {
    showOperationError('保存动态报表模板', error)
  } finally {
    saving.value = false
  }
}

async function pollExecuteTask(taskId: string) {
  const maxAttempts = 60
  const intervalMs = 1000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const taskRes = await request.get<ExecuteTaskStatusResponse>(`/report/tasks/${taskId}`, {
      timeout: REPORT_EXECUTE_REQUEST_TIMEOUT,
    })
    const task = taskRes.data

    if (!task) {
      throw new Error('报表任务不存在或已过期')
    }

    if (task.status === 'completed') {
      if (!task.result) {
        throw new Error('报表任务已完成，但未返回结果')
      }
      return task.result
    }

    if (task.status === 'failed') {
      throw new Error(task.error || task.message || '报表生成失败')
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error('报表生成超时，请稍后重试')
}

async function executeTemplate() {
  if (!selectedCode.value) return false
  executing.value = true
  try {
    const taskRes = await request.post<ExecuteTaskResponse>(
      `/report/templates/${selectedCode.value}/execute`,
      filters.value,
      { timeout: REPORT_EXECUTE_REQUEST_TIMEOUT }
    )
    const taskId = taskRes.data?.taskId
    if (!taskId) {
      throw new Error('报表任务创建失败')
    }

    const result = await pollExecuteTask(taskId)
    const sheets = result.sheets || []
    const cells = sheets.flatMap((sheet: ExecuteResponse['sheets'][number]) => sheet.cells || [])
    applyExecutionResult(cells)
    showExecutionResult.value = true
    return true
  } catch (error) {
    showOperationError('执行动态报表', error)
    return false
  } finally {
    executing.value = false
  }
}

async function promptAndExecuteTemplate(forcePrompt = true) {
  if (!selectedCode.value) return false
  if (forcePrompt && reportGeneratePromptVisible.value) return false
  if (executing.value) return false

  if (forcePrompt) {
    reportGeneratePromptVisible.value = true
    yearPeriodForm.value = {
      year: filters.value.year,
      period: filters.value.period,
    }

    try {
      await ElMessageBox.confirm(
        `
          <div class="report-generate-dialog">
            <div class="report-generate-dialog__hero">
              <div class="report-generate-dialog__icon">报</div>
              <div>
                <div class="report-generate-dialog__title">生成${pageTitle.value || '动态报表'}</div>
                <div class="report-generate-dialog__desc">请选择报表期间后立即生成结果</div>
              </div>
            </div>
            <div class="report-generate-dialog__fields">
              <label class="report-generate-field" for="dynamic-report-year">
                <span class="report-generate-field__label">会计年度</span>
                <select id="dynamic-report-year" class="report-generate-field__select">
                  ${years
                    .map(
                      year =>
                        `<option value="${year}"${year === yearPeriodForm.value.year ? ' selected' : ''}>${year}年</option>`
                    )
                    .join('')}
                </select>
              </label>
              <label class="report-generate-field" for="dynamic-report-period">
                <span class="report-generate-field__label">会计期间</span>
                <select id="dynamic-report-period" class="report-generate-field__select">
                  ${Array.from({ length: 12 }, (_, index) => index + 1)
                    .map(
                      period =>
                        `<option value="${period}"${period === yearPeriodForm.value.period ? ' selected' : ''}>${period}月</option>`
                    )
                    .join('')}
                </select>
              </label>
            </div>
          </div>
        `,
        `${pageTitle.value || '动态报表'}生成`,
        {
          confirmButtonText: '生成报表',
          cancelButtonText: '取消',
          dangerouslyUseHTMLString: true,
          customClass: 'report-generate-message-box',
          beforeClose: (action, instance, done) => {
            if (action !== 'confirm') {
              done()
              return
            }

            const yearInput = document.getElementById('dynamic-report-year') as HTMLSelectElement | null
            const periodInput = document.getElementById('dynamic-report-period') as HTMLSelectElement | null
            const year = Number(yearInput?.value || '')
            const period = Number(periodInput?.value || '')

            if (!Number.isInteger(year) || year < 2000 || year > 2099) {
              instance.message = '请输入 2000 到 2099 之间的年份'
              return
            }

            if (!Number.isInteger(period) || period < 1 || period > 12) {
              instance.message = '请输入 1 到 12 的月份'
              return
            }

            filters.value.year = year
            filters.value.period = period
            done()
          },
        }
      )
    } catch {
      return false
    } finally {
      reportGeneratePromptVisible.value = false
    }
  }

  return executeTemplate()
}

async function requestDirectReportExecution() {
  const currentPath = route.fullPath
  if (
    !isDirectReportMode.value ||
    !selectedCode.value ||
    !templateData.value ||
    templateData.value.definition.code !== selectedCode.value ||
    hasTriggeredAutoRunForPath.value === currentPath ||
    reportGeneratePromptVisible.value ||
    executing.value
  ) {
    return
  }

  hasPromptedDirectExecution.value = true
  hasTriggeredAutoRunForPath.value = currentPath
  await promptAndExecuteTemplate(true)
}

async function insertRow() {
  if (!selectedCode.value || !selectedPosition.value) return
  try {
    await request.post(`/report/templates/${selectedCode.value}/rowcol`, {
      sheetId: activeSheetName.value,
      action: 'insert_row',
      index: selectedPosition.value.rowIndex,
    })
    showSuccess('插入行成功')
    await fetchTemplateDetail()
  } catch (error) {
    showOperationError('插入行', error)
  }
}

async function deleteRow() {
  if (!selectedCode.value || !selectedPosition.value) return
  try {
    await request.post(`/report/templates/${selectedCode.value}/rowcol`, {
      sheetId: activeSheetName.value,
      action: 'delete_row',
      index: selectedPosition.value.rowIndex,
    })
    showSuccess('删除行成功')
    await fetchTemplateDetail()
  } catch (error) {
    showOperationError('删除行', error)
  }
}

async function insertCol() {
  if (!selectedCode.value || !selectedPosition.value) return
  try {
    await request.post(`/report/templates/${selectedCode.value}/rowcol`, {
      sheetId: activeSheetName.value,
      action: 'insert_col',
      index: selectedPosition.value.colIndex,
    })
    showSuccess('插入列成功')
    await fetchTemplateDetail()
  } catch (error) {
    showOperationError('插入列', error)
  }
}

async function deleteCol() {
  if (!selectedCode.value || !selectedPosition.value) return
  try {
    await request.post(`/report/templates/${selectedCode.value}/rowcol`, {
      sheetId: activeSheetName.value,
      action: 'delete_col',
      index: selectedPosition.value.colIndex,
    })
    showSuccess('删除列成功')
    await fetchTemplateDetail()
  } catch (error) {
    showOperationError('删除列', error)
  }
}

async function mergeSelection() {
  if (!selectedCode.value || selectedRanges.value.length === 0) return

  // 计算所有选中 range 的最小包围矩形
  const allRanges = selectedRanges.value
  const r = {
    startRow: Math.min(...allRanges.map(x => x.startRow)),
    startCol: Math.min(...allRanges.map(x => x.startCol)),
    endRow:   Math.max(...allRanges.map(x => x.endRow)),
    endCol:   Math.max(...allRanges.map(x => x.endCol)),
  }
  const colSpan = r.endCol - r.startCol + 1
  const rowSpan = r.endRow - r.startRow + 1
  if (colSpan <= 1 && rowSpan <= 1) return

  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return

  // 找到左上角单元格，不存在时用空单元格占位
  const originCell = sheet.cells.find(
    c => c.row_index === r.startRow && c.col_index === r.startCol
  ) ?? null

  // 先取消该区域内已有的合并
  for (const cell of sheet.cells) {
    if (
      cell.row_index >= r.startRow && cell.row_index <= r.endRow &&
      cell.col_index >= r.startCol && cell.col_index <= r.endCol &&
      cell.merge_info
    ) {
      updateDraftCell({
        id: cell.id,
        row_index: cell.row_index,
        col_index: cell.col_index,
        cell_type: cell.cell_type,
        text_value: cell.text_value,
        formula_text: cell.formula_text,
        format_text: cell.format_text,
        style_key: cell.style_key,
        merge_info: null,
      })
    }
  }

  // 设置左上角的 merge_info
  updateDraftCell({
    id: originCell?.id,
    row_index: r.startRow,
    col_index: r.startCol,
    cell_type: originCell?.cell_type || 'text',
    text_value: originCell?.text_value ?? null,
    formula_text: originCell?.formula_text ?? null,
    format_text: originCell?.format_text ?? null,
    style_key: originCell?.style_key ?? null,
    merge_info: JSON.stringify({ colSpan, rowSpan }),
  })

  // 将被覆盖的单元格设为 merged 类型
  for (let row = r.startRow; row <= r.endRow; row++) {
    for (let col = r.startCol; col <= r.endCol; col++) {
      if (row === r.startRow && col === r.startCol) continue
      const coveredCell = sheet.cells.find(c => c.row_index === row && c.col_index === col)
      updateDraftCell({
        id: coveredCell?.id || undefined,
        row_index: row,
        col_index: col,
        cell_type: 'merged',
        text_value: null,
        formula_text: null,
        format_text: coveredCell?.format_text ?? null,
        style_key: coveredCell?.style_key ?? null,
        merge_info: null,
      })
    }
  }

  showSuccess(`已合并 ${rowSpan} 行 × ${colSpan} 列单元格`)
}

async function unmergeSelection() {
  if (!selectedCode.value) return
  const sheet = templateData.value?.sheets.find(item => item.id === activeSheetName.value)
  if (!sheet) return

  let unmergedCount = 0

  // 确定要检查的范围
  const cellsToCheck: TemplateCell[] = []
  if (bulkSelectionMode.value === 'range' && selectedRanges.value.length > 0) {
    const r = selectedRanges.value[0]
    cellsToCheck.push(...sheet.cells.filter(c =>
      c.row_index >= r.startRow && c.row_index <= r.endRow &&
      c.col_index >= r.startCol && c.col_index <= r.endCol
    ))
  } else if (selectedPosition.value) {
    const cell = sheet.cells.find(
      c => c.row_index === selectedPosition.value!.rowIndex && c.col_index === selectedPosition.value!.colIndex
    )
    if (cell) cellsToCheck.push(cell)
  }

  for (const cell of cellsToCheck) {
    if (!cell.merge_info) continue
    try {
      const merge = JSON.parse(cell.merge_info) as { colSpan?: number; rowSpan?: number }
      const colSpan = merge.colSpan || 1
      const rowSpan = merge.rowSpan || 1

      // 取消左上角的 merge_info
      updateDraftCell({
        id: cell.id,
        row_index: cell.row_index,
        col_index: cell.col_index,
        cell_type: cell.cell_type === 'merged' ? 'text' : cell.cell_type,
        text_value: cell.text_value,
        formula_text: cell.formula_text,
        format_text: cell.format_text,
        style_key: cell.style_key,
        merge_info: null,
      })

      // 恢复被覆盖的单元格
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          if (dr === 0 && dc === 0) continue
          const coveredCell = sheet.cells.find(
            c => c.row_index === cell.row_index + dr && c.col_index === cell.col_index + dc
          )
          updateDraftCell({
            id: coveredCell?.id || undefined,
            row_index: cell.row_index + dr,
            col_index: cell.col_index + dc,
            cell_type: coveredCell?.cell_type === 'merged' ? 'empty' : (coveredCell?.cell_type || 'empty'),
            text_value: coveredCell?.text_value ?? null,
            formula_text: coveredCell?.formula_text ?? null,
            format_text: coveredCell?.format_text ?? null,
            style_key: coveredCell?.style_key ?? null,
            merge_info: null,
          })
        }
      }
      unmergedCount += 1
    } catch {
      // Invalid merge_info, skip
    }
  }

  if (unmergedCount > 0) {
    showSuccess(`已取消 ${unmergedCount} 个合并单元格`)
  }
}

function triggerImport() {
  fileInputRef.value?.click()
}

function suggestNextReportCode() {
  let maxNum = 0
  for (const item of templates.value) {
    const parsed = Number.parseInt(item.code, 10)
    if (Number.isFinite(parsed) && parsed > maxNum) {
      maxNum = parsed
    }
  }
  return String(maxNum + 1)
}

function fileNameToReportName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base || fileName.trim()
}

function resetCreateReportForm() {
  createForm.value = { code: '', name: '' }
  createFile.value = null
  createFileList.value = []
  createSubmitting.value = false
}

function openCreateReportDialog() {
  createForm.value = {
    code: suggestNextReportCode(),
    name: '',
  }
  createFile.value = null
  createFileList.value = []
  createDialogVisible.value = true
}

function handleCreateFileChange(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return
  createFile.value = file
  createFileList.value = [uploadFile]
  createForm.value.name = fileNameToReportName(file.name)
}

function handleCreateFileRemove() {
  createFile.value = null
  createFileList.value = []
}

function handleCreateFileExceed() {
  ElMessage.warning('只能选择一个 Excel 文件')
}

async function submitCreateReport() {
  const code = createForm.value.code.trim()
  const name = createForm.value.name.trim()
  if (!code) {
    ElMessage.warning('请输入报表编码')
    return
  }
  if (!/^[a-zA-Z0-9]+$/.test(code)) {
    ElMessage.warning('编码只能包含字母和数字')
    return
  }
  if (templates.value.some(item => item.code === code)) {
    ElMessage.warning('报表编码已存在，请修改编码')
    return
  }
  if (!name) {
    ElMessage.warning('请输入报表名称')
    return
  }
  if (!createFile.value) {
    ElMessage.warning('请选择 Excel 模板文件')
    return
  }

  createSubmitting.value = true
  try {
    const formData = new FormData()
    formData.append('file', createFile.value)
    formData.append('reportCode', code)
    formData.append('reportName', name)
    const res = await request.post<{ code: number }>('/report/templates/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: REPORT_LONG_REQUEST_TIMEOUT,
    })
    if (res.code === 0) {
      showSuccess('新增报表成功')
      createDialogVisible.value = false
      selectedCode.value = code
      await fetchTemplateList()
      await router.replace({ name: 'DynamicReport', params: { code } })
      await fetchTemplateDetail()
      window.dispatchEvent(new Event('report-templates-changed'))
    }
  } catch (error) {
    showOperationError('新增报表', error)
  } finally {
    createSubmitting.value = false
  }
}

const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createForm = ref({ code: '', name: '' })
const createFile = ref<File | null>(null)
const createFileList = ref<UploadUserFile[]>([])

const editMetaDialogVisible = ref(false)
const editMetaSubmitting = ref(false)
const editMetaForm = ref<{ code: string; name: string }>({ code: '', name: '' })

const enabledSwitching = ref(false)
const isEnabledModel = computed<boolean>({
  get: () => {
    const def = templateData.value?.definition
    if (!def) return true
    // 兼容后端可能返回 0/1 或 true/false
    return def.is_enabled === false || (def.is_enabled as unknown) === 0 ? false : true
  },
  set: (value: boolean) => {
    // 立即更新本地状态，让 UI 切换立即生效；@change 中调 API 失败时再回滚
    if (templateData.value?.definition) {
      templateData.value.definition.is_enabled = value
    }
  },
})

async function handleEnabledChange(value: boolean) {
  if (!selectedCode.value || !templateData.value) return
  const previous = !value // setter 已经把当前值改成了 value，所以旧值是 !value
  enabledSwitching.value = true
  try {
    const { updateReportTemplateMeta } = await import('@/api/reportTemplate')
    const { data } = await updateReportTemplateMeta(selectedCode.value, {
      is_enabled: value,
    })
    templateData.value.definition.is_enabled = data.is_enabled
    // 同步本地列表中的 is_enabled 字段
    const item = templates.value.find(t => t.code === selectedCode.value)
    if (item) item.is_enabled = data.is_enabled
    showSuccess(data.is_enabled ? '已启用' : '已停用')
    window.dispatchEvent(new Event('report-templates-changed'))
  } catch (error) {
    // 回滚
    if (templateData.value?.definition) {
      templateData.value.definition.is_enabled = previous
    }
    showOperationError('切换启用状态', error)
  } finally {
    enabledSwitching.value = false
  }
}

function openEditMetaDialog() {
  if (!selectedCode.value || !templateData.value) {
    showError('请先选择一个报表模板')
    return
  }
  editMetaForm.value = {
    code: templateData.value.definition.code || selectedCode.value,
    name: templateData.value.definition.name || '',
  }
  editMetaDialogVisible.value = true
}

async function submitEditMeta() {
  if (!selectedCode.value) return
  const nextCode = (editMetaForm.value.code || '').trim()
  const nextName = (editMetaForm.value.name || '').trim()
  if (!nextCode) {
    showError('请输入报表编码')
    return
  }
  if (!/^[a-zA-Z0-9_]+$/.test(nextCode)) {
    showError('编码只能包含字母、数字、下划线')
    return
  }

  editMetaSubmitting.value = true
  try {
    const { updateReportTemplateMeta } = await import('@/api/reportTemplate')
    const { data, message } = await updateReportTemplateMeta(selectedCode.value, {
      code: nextCode,
      name: nextName,
    })

    if (data.swapped && data.swapWith) {
      showSuccess(`编码已与「${data.swapWith.name}」(${data.swapWith.originalCode}) 互换`)
    } else {
      showSuccess(message || '更新成功')
    }

    editMetaDialogVisible.value = false

    // 刷新模板列表 + 选中新 code + 同步路由
    await fetchTemplateList()
    selectedCode.value = data.code
    if (!isDirectReportMode.value && route.params.code !== data.code) {
      router.replace({ name: 'DynamicReport', params: { code: data.code } })
    } else {
      await fetchTemplateDetail()
    }
    // 通知 Layout 刷新导航栏
    window.dispatchEvent(new Event('report-templates-changed'))
  } catch (error) {
    showOperationError('修改报表编码', error)
  } finally {
    editMetaSubmitting.value = false
  }
}

function handleDeleteTemplate() {
  const name = templateData.value?.definition.name || selectedCode.value
  ElMessageBox.confirm(
    `确定要删除报表模板「${name}」吗？删除后不可恢复。`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(async () => {
      try {
        await request.delete(`/report/templates/${selectedCode.value}`)
        showSuccess('删除成功')
        // 刷新列表，跳转到第一个模板或空页面
        await fetchTemplateList()
        if (templates.value.length > 0) {
          selectedCode.value = templates.value[0].code
          await fetchTemplateDetail()
        } else {
          templateData.value = null
          router.replace({ name: 'DynamicReport' })
        }
        window.dispatchEvent(new Event('report-templates-changed'))
      } catch (error) {
        showOperationError('删除模板', error)
      }
    })
    .catch(() => {})
}

async function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reportCode = selectedCode.value
  if (!reportCode) {
    showOperationError('导入 Excel', new Error('请先选择一个报表模板，或先输入报表编码'))
    target.value = ''
    return
  }

  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('reportCode', reportCode)
    const effectiveName = templateData.value?.definition.name || ''
    if (effectiveName) {
      formData.append('reportName', effectiveName)
    }
    const res = await request.post<{ code: number }>('/report/templates/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: REPORT_LONG_REQUEST_TIMEOUT,
    })
    if (res.code === 0) {
      showSuccess('导入成功')
      await fetchTemplateList()
      await fetchTemplateDetail()
    }
  } catch (error) {
    showOperationError('导入 Excel', error)
  } finally {
    target.value = ''
  }
}

function handleTemplateChange() {
  clearStructureSelection()
  topEditorValue.value = ''
  fetchTemplateDetail()
}

function handleSheetChange(name: string | number) {
  activeSheetName.value = String(name || '')
  clearStructureSelection()
  cancelInlineEdit()
  syncTopEditorValue()
}

async function handleSheetEdit(targetName: string | number | undefined, action: 'remove' | 'add') {
  if (action === 'remove' && typeof targetName === 'string') {
    await deleteSheet(targetName)
  }
}

async function deleteSheet(sheetId: string) {
  if (!selectedCode.value) return
  try {
    await request.delete(`/report/templates/${selectedCode.value}/sheets/${sheetId}`)
    showSuccess('删除工作表成功')
    await fetchTemplateDetail()
  } catch (error) {
    showOperationError('删除工作表', error)
  }
}

function handlePrint() {
  try {
    // 关掉可能遮挡的弹窗
    document.querySelectorAll('.el-overlay').forEach(el => el.remove())
    const card = document.querySelector('.el-card') as HTMLElement | null
    const grid = document.querySelector('.sheet-grid') as HTMLElement | null
    if (grid && card) {
      const a4Width = 718 // A4 可用宽度 190mm ≈ 718px
      const gridWidth = grid.scrollWidth
      if (gridWidth > a4Width) {
        const scale = a4Width / gridWidth
        card.style.zoom = String(scale)
      }
    }
    window.print()
  } catch (_) { /* 打印出错不影响 */ }
  // 恢复
  const card = document.querySelector('.el-card') as HTMLElement | null
  if (card) card.style.zoom = ''
}

async function handleExport() {
  if (!selectedCode.value || !templateData.value) return
  try {
    const { downloadReportExport } = await import('@/api/reportTemplate')
    const blob = await downloadReportExport(selectedCode.value, {
      year: filters.value.year,
      period: filters.value.period,
    })
    const defName = (templateData.value.definition.name || '报表').replace(/[\\/:*?"<>|]/g, '_')
    const fileName = `${defName}_${filters.value.year}年${filters.value.period}月.xlsx`
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已按原模板格式导出 Excel')
  } catch (error) {
    showOperationError('导出报表', error)
  }
}

watch(
  () => route.fullPath,
  async () => {
    const nextCode = directReportMeta.value?.code || String(route.params.code || '')
    if (!nextCode) return
    hasTriggeredAutoRunForPath.value = ''
    hasPromptedDirectExecution.value = false
    if (nextCode !== selectedCode.value) {
      cancelInlineEdit()
      selectedCode.value = nextCode
      await fetchTemplateDetail()
    }

    await requestDirectReportExecution()
  }
)

watch(
  () => route.params.code,
  async code => {
    const nextCode = directReportMeta.value?.code || String(code || '')
    hasPromptedDirectExecution.value = false
    if (nextCode && nextCode !== selectedCode.value) {
      cancelInlineEdit()
      selectedCode.value = nextCode
      await fetchTemplateDetail()
      await requestDirectReportExecution()
    }
  }
)

watch(
  () => templateData.value?.definition.code,
  async code => {
    if (
      !code ||
      !isDirectReportMode.value ||
      hasPromptedDirectExecution.value ||
      code !== selectedCode.value ||
      hasTriggeredAutoRunForPath.value === route.fullPath ||
      reportGeneratePromptVisible.value
    ) {
      return
    }
    await requestDirectReportExecution()
  }
)

onBeforeUnmount(() => {
  stopColumnResize()
  stopRowResize()
})

onMounted(async () => {
  loading.value = true
  try {
    await fetchTemplateList()
    await fetchTemplateDetail()
    if (
      isDirectReportMode.value &&
      !hasPromptedDirectExecution.value &&
      selectedCode.value &&
      hasTriggeredAutoRunForPath.value !== route.fullPath
    ) {
      await requestDirectReportExecution()
    }
  } catch (error) {
    showOperationError('加载动态报表模板列表', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page {
  padding: 16px;
  background: #f5f7fb;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.page-header h3 {
  margin: 0;
}

.sub-title {
  margin: 8px 0 0;
  color: #606266;
}

.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e4e8ed;
  border-radius: 10px;
  justify-content: flex-start;
}

.formula-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: #ffffff;
  border: 1px solid #e4e8ed;
  border-radius: 10px;
}

.formula-label {
  color: #5d6678;
  font-size: 13px;
  min-width: 110px;
  font-weight: 600;
}

.formula-editor-input {
  width: min(980px, calc(100vw - 360px));
  min-width: 460px;
}

.formula-edit-row :deep(.el-textarea__inner) {
  border-radius: 8px;
  line-height: 1.45;
}

.formula-edit-row :deep(.el-textarea.is-disabled .el-textarea__inner) {
  color: #a0a8b8;
  background: #f5f7fa;
}

.toolbar-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-top: 2px;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e4e8ed;
  border-radius: 10px;
  justify-content: flex-start;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #edf1f6;
  border-radius: 8px;
  background: #fafbfd;
}

.toolbar-group-label {
  font-size: 11px;
  color: #8b95a7;
  font-weight: 600;
  letter-spacing: 0.5px;
  line-height: 1;
}

.toolbar-sep {
  display: inline-block;
  width: 1px;
  height: 20px;
  background: #dcdfe6;
  margin: 0 4px;
  vertical-align: middle;
}

.editor-layout {
  display: block;
}

.report-page {
  height: calc(100vh - 48px);
  overflow-y: auto;
}

.report-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #f0f2f5;
  padding: 0 2px 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e4e8ed;
  align-items: flex-start !important;
}

.grid-panel {
  min-width: 0;
  width: 100%;
}

.sheet-tabs :deep(.el-tabs__content) {
  overflow: visible;
}

.sheet-tabs :deep(.el-tabs__item) {
  font-size: 18px;
  font-weight: 500;
}

.sheet-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 2px;
}

.sheet-tabs-no-header :deep(.el-tabs__header) {
  display: none;
}

.report-title-lg {
  font-size: 22px;
  font-weight: 600;
  color: #303030;
  margin-bottom: 4px;
}

.report-subtitle {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.report-info-row {
  display: flex;
  gap: 32px;
  font-size: 13px;
  color: #606266;
}

.report-info-val {
  color: #303030;
}

.report-footer {
  display: flex;
  justify-content: flex-end;
  gap: 40px;
  padding-top: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
  border-top: 1px solid #303030;
}

.report-footer-item {
  min-width: 100px;
}

.sheet-grid-wrap {
  overflow: auto;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.sheet-grid {
  display: flex;
  flex-direction: column;
  background: #fff;
}

.sheet-grid-header-row,
.sheet-grid-row {
  display: grid;
}

.sheet-grid-balance {
}

.sheet-grid-balance .cell,
.sheet-grid-balance .column-header-cell,
.sheet-grid-balance .row-index {
  box-sizing: border-box;
}

.sheet-grid-balance .row-index {
  min-width: 56px;
  width: 56px;
}

.row-index {
  background: #f5f7fa;
  min-width: 56px;
  width: 56px;
  min-height: 28px;
  border: 1px solid #ebeef5;
  border-top: none;
  border-right-color: #dcdfe6;
  text-align: center;
  color: #909399;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 6px;
  box-sizing: border-box;
  overflow: visible;
  position: relative;
}

.row-index-header {
  top: 0;
  z-index: 4;
  border-top: 1px solid #ebeef5;
}

.select-all-corner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}

.select-all-corner-mark {
  width: 12px;
  height: 12px;
  border-top: 2px solid #c0c4cc;
  border-left: 2px solid #c0c4cc;
  transform: rotate(45deg);
}

.select-all-corner.active,
.select-all-corner:hover {
  background: #ecf5ff;
}

.select-all-corner.active .select-all-corner-mark,
.select-all-corner:hover .select-all-corner-mark {
  border-color: #409eff;
}

.column-header-cell {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #f5f7fa;
  color: #909399;
  font-weight: 500;
  text-align: center;
  padding: 0;
  border: 1px solid #ebeef5;
  border-top: none;
  border-left: none;
  overflow: visible;
}

.column-header-content {
  position: relative;
  overflow: visible;
}

.column-header-cell.active,
.row-index.active {
  background: #ecf5ff;
  color: #409eff;
}

.column-header-cell.active .column-header-content,
.row-index.active .row-index-content {
  font-weight: 600;
}

.row-index-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  overflow: visible;
}

.row-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -4px;
  height: 8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: row-resize;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.row-index:hover .row-resize-handle,
.row-index:focus-within .row-resize-handle {
  opacity: 1;
}

.row-resize-handle::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  top: 3px;
  height: 2px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.45);
}

.row-resize-handle:hover::after,
.row-resize-handle:focus-visible::after {
  background: #409eff;
}

.cell {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #ebeef5;
  border-top: none;
  border-left: none;
  padding: 6px 8px;
  vertical-align: top;
  box-sizing: border-box;
}

.cell.merged {
  display: flex;
  align-items: center;
}

.cell.merged .cell-content {
  flex: 1;
  min-width: 0;
}

.cell-content {
  min-height: 20px;
}

.cell-formula {
  background: #fdf6ec;
  color: #b88230;
}

.cell-merged {
  display: none;
}

.cell-text,
.cell-number {
  background: #fff;
}

.cell.selected,
.cell.bulk-selected {
  outline: 2px solid #2f7df5;
  outline-offset: -2px;
}

.cell.editing {
  padding: 0;
  background: #eef5ff;
}

.cell-editor-input {
  width: 100%;
  height: 100%;
  min-height: 56px;
  border: none;
  outline: none;
  resize: vertical;
  padding: 8px;
  box-sizing: border-box;
  font: inherit;
  line-height: 1.5;
  background: #f7fbff;
}

.cell.error {
  background: #fef0f0;
  color: #c45656;
}

.cell.empty {
  background: #fafafa;
}

.column-resize-handle {
  position: absolute;
  top: 0;
  right: -6px;
  width: 12px;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.column-header-cell:hover .column-resize-handle,
.column-header-cell:focus-within .column-resize-handle {
  opacity: 1;
}

.column-resize-handle::after {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 5px;
  width: 2px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.5);
}

.column-resize-handle:hover::after,
.column-resize-handle:focus-visible::after {
  background: #409eff;
}

@media (max-width: 1200px) {
  .formula-editor-input {
    width: 100%;
    min-width: 0;
  }

  .toolbar-row {
    gap: 8px;
  }

  .toolbar-group {
    flex: 1 1 260px;
    min-width: 240px;
  }

  .sheet-grid-balance {
  }
}
</style>

<style>
.report-generate-message-box {
  width: 460px;
  border-radius: 18px;
  overflow: hidden;
}

.report-generate-message-box .el-message-box__header {
  padding: 18px 22px 0;
}

.report-generate-message-box .el-message-box__title {
  font-size: 18px;
  font-weight: 700;
}

.report-generate-message-box .el-message-box__content {
  padding: 14px 22px 8px;
}

.report-generate-message-box .el-message-box__message {
  margin: 0;
}

.report-generate-message-box .el-message-box__btns {
  padding: 10px 22px 22px;
}

.report-generate-message-box .el-message-box__btns .el-button,
.report-generate-message-box .el-message-box__btns .el-button--primary {
  min-width: 96px;
  border-radius: 10px;
}

.report-generate-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.report-generate-dialog__hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 16px;
  background: linear-gradient(135deg, #ecf5ff 0%, #f4f9ff 100%);
}

.report-generate-dialog__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #409eff;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(64, 158, 255, 0.24);
}

.report-generate-dialog__title {
  font-size: 16px;
  font-weight: 700;
  color: #303133;
  line-height: 1.4;
}

.report-generate-dialog__desc {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

.report-generate-dialog__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.report-generate-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-generate-field__label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.report-generate-field__select {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid #dcdfe6;
  border-radius: 12px;
  background: #fff;
  color: #303133;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.report-generate-field__select:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.12);
}

.cell-border-all {
  /* 默认边框，继承 .cell 的 border */
}

.cell-border-none {
  border: none !important;
}

.cell-border-bottom {
  border: none !important;
  border-bottom: 1px solid #ebeef5 !important;
}

.cell-border-top {
  border: none !important;
  border-top: 1px solid #ebeef5 !important;
}

.cell-border-left {
  border: none !important;
  border-left: 1px solid #ebeef5 !important;
}

.cell-border-right {
  border: none !important;
  border-right: 1px solid #ebeef5 !important;
}

@media print {
  @page {
    margin: 5mm;
    size: A4 portrait;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  :deep(.el-aside),
  :deep(.el-header),
  .page-header,
  .el-card :deep(.el-card__header) {
    display: none !important;
  }
  .page {
    padding: 0 !important;
    background: #fff !important;
  }
  .el-card {
    box-shadow: none !important;
    border: none !important;
    background: transparent !important;
  }
  :deep(.el-tabs__nav-wrap) {
    display: none !important;
  }
  .row-index,
  .column-header-cell,
  .select-all-corner {
    display: none !important;
  }
  :deep(.el-tabs__content) {
    overflow: visible !important;
  }
  :deep(.sheet-grid-wrap) {
    overflow: visible !important;
  }
  :deep(.sheet-grid) {
    width: 100% !important;
  }
  :deep(.cell) {
    font-size: 7.5pt !important;
    line-height: 1.3 !important;
    padding: 1px 2px !important;
    border-color: #000 !important;
  }
  :deep(.cell-content) {
    white-space: nowrap !important;
  }
  :deep(.el-tab-pane) {
    page-break-after: auto;
  }
}

.cell-border-outer {
  border: 1px solid #303030 !important;
}

.cell-border-header {
  border: none !important;
  border-bottom: 2px solid #303030 !important;
}

.create-report-form .form-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.create-report-upload {
  width: 100%;
}

.create-report-upload :deep(.el-upload-dragger) {
  width: 100%;
  padding: 20px 12px;
}
</style>
