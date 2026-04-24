<template>
  <div class="page">
    <div class="page-header">
      <h3>会计科目</h3>
      <div>
        <el-button-group style="margin-right: 12px">
          <el-button title="全部收拢 (Ctrl+\)" @click="collapseAll">顶层</el-button>
          <el-button title="上一级 (Ctrl+↑)" @click="goUpLevel">上级</el-button>
          <el-button title="下一级 (Ctrl+↓)" @click="goDownLevel">下级</el-button>
          <el-button title="全部展开 (Ctrl+Shift+\)" @click="expandAll">底层</el-button>
        </el-button-group>
        <el-input
          v-model="keyword"
          placeholder="搜索科目"
          style="width: 200px; margin-right: 12px"
          clearable
          @input="fetchData"
        />
        <el-button type="primary" @click="openDialog('add')">新增科目</el-button>
        <el-button :disabled="list.length === 0" @click="exportData">导出</el-button>
        <el-button type="success" @click="importDialogVisible = true">导入</el-button>
        <el-button type="warning" @click="fillMissingParents">补充父科目</el-button>
        <el-switch
          v-model="showDisabled"
          active-text="显示禁用"
          inactive-text=""
          style="margin-left: 12px"
          @change="fetchData"
        />
      </div>
    </div>

    <el-table
      ref="tableRef"
      :data="flatList"
      row-key="id"
      stripe
      border
      highlight-current-row
      :row-style="{ height: '40px' }"
      height="calc(100vh - 120px)"
      @current-change="handleCurrentChange"
      @row-click="handleRowClick"
      @header-dragend="handleColumnResize"
    >
      <el-table-column prop="code" label="科目编码" :width="getColumnWidth('code', 120)">
        <template #default="{ row }">
          <span :style="{ paddingLeft: `${((row._depth || row.level || 1) - 1) * 20}px`, display: 'inline-block' }">{{ getDisplayText(row.code) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="科目名称" :width="getColumnWidth('name')">
        <template #default="{ row }">
          <span :style="{ paddingLeft: `${((row._depth || row.level || 1) - 1) * 20}px`, display: 'inline-block' }">{{ getDisplayText(row.name) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="direction" label="余额方向" width="100">
        <template #default="{ row }">
          <el-tag :type="row.direction === 'debit' ? 'primary' : 'warning'" size="small">
            {{ row.direction === 'debit' ? '借方' : '贷方' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="is_cash" label="现金" width="60" align="center">
        <template #default="{ row }">
          <span v-if="row.is_cash">是</span>
        </template>
      </el-table-column>
      <el-table-column prop="is_bank" label="银行" width="60" align="center">
        <template #default="{ row }">
          <span v-if="row.is_bank">是</span>
        </template>
      </el-table-column>
      <el-table-column prop="is_aux" label="辅助核算" min-width="240">
        <template #default="{ row }">
          <template v-if="row.is_aux">
            <el-tag
              v-for="name in getAuxNames(row)"
              :key="name"
              type="info"
              size="small"
              style="margin-right: 4px; margin-bottom: 0"
              >{{ name }}</el-tag
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="is_enabled" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_enabled ? 'success' : 'info'" size="small">{{
            row.is_enabled ? '启用' : '禁用'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
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
    />

    <!-- 批量导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="批量导入会计科目" width="600px">
      <div class="import-tips">
        <p>1. 请先 <el-link type="primary" @click="downloadTemplate">下载导入模板</el-link>，按模板格式填写数据</p>
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
        <el-button @click="importDialogVisible = false; importPreview = []">取消</el-button>
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
import { ref, computed, onMounted } from 'vue'
import type { UploadFile } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import request from '@/api/request'
import AccountDialog from '@/components/base/AccountDialog.vue'
import { useAccountTree } from '@/composables/useAccountTree'
import { useAccountForm } from '@/composables/useAccountForm'
import { showSuccess, showError, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm } from '@/composables/useConfirm'
import { useColumnWidthMemory } from '@/composables/useColumnWidthMemory'
import { useOperationHistory } from '@/composables/useOperationHistory'
import { performanceMonitor } from '@/utils/performanceMonitor'

const list = ref<any[]>([])
const keyword = ref('')
const showDisabled = ref(false)
const tableRef = ref<any>(null)
const dialogVisible = ref(false)
const dialogType = ref<'add' | 'edit'>('add')
const saving = ref(false)
const auxCategories = ref<any[]>([])
const auxItems = ref<any[]>([])

const dialogTitle = computed(() => (dialogType.value === 'add' ? '新增科目' : '编辑科目'))

const {
  treeData,
  expandedKeys,
  currentRow,
  expandAll,
  collapseAll,
  goUpLevel,
  goDownLevel,
  handleCurrentChange,
  handleRowClick,
  restoreCurrentRow,
  flattenRows,
  flatList,
  getTreeSelectData,
} = useAccountTree(list, tableRef)

const {
  form,
  parentUsage,
  getAuxItemsByCat,
  getAvailableCats,
  onAuxCatChange,
  addAux,
  removeAux,
  getAuxNames,
  onParentChange,
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

// 列宽记忆
const { getColumnWidth, saveColumnWidth } = useColumnWidthMemory('account-table')

// 操作历史
const { addRecord } = useOperationHistory()

// 搜索高亮（移除 v-html 以保持树形缩进）
function getDisplayText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return ''
  return String(text)
}

// 列宽调整
function handleColumnResize(newWidth: number, _oldWidth: number, column: any) {
  if (column.property) {
    saveColumnWidth(column.property, newWidth)
  }
}

async function fetchData() {
  await performanceMonitor.measure('fetchAccountData', async () => {
    const params: any = { is_enabled: showDisabled.value ? '' : 1 }
    if (keyword.value) params.keyword = keyword.value
    const [accRes, catRes, auxRes] = await Promise.all([
      request.get<any[]>('/base/accounts', { params }),
      request.get<any[]>('/base/aux-categories'),
      request.get<any[]>('/base/aux-items'),
    ])
    list.value = accRes.data
    auxCategories.value = catRes.data
    auxItems.value = auxRes.data
    await restoreCurrentRow()
  })
}

async function fetchAuxOptions() {
  const [catRes, auxRes] = await Promise.all([
    request.get<any[]>('/base/aux-categories'),
    request.get<any[]>('/base/aux-items'),
  ])
  auxCategories.value = catRes.data
  auxItems.value = auxRes.data
}

async function openDialog(type: 'add' | 'edit', row?: any) {
  await fetchAuxOptions()
  dialogType.value = type
  parentUsage.value = null
  
  if (type === 'add') {
    form.value = createAddForm(currentRow.value?.id)
    if (form.value.parent_id) {
      void handleParentChange(form.value.parent_id)
    }
  } else {
    form.value = createEditForm(row)
  }
  
  dialogVisible.value = true
}

async function handleParentChange(parentId: string) {
  await onParentChange(parentId, treeData.value, flattenRows)
}

async function handleSave() {
  saving.value = true
  try {
    const payload = buildSavePayload()
    if (dialogType.value === 'add') {
      await request.post('/base/accounts', payload)
      showSuccess('科目新增成功')
      addRecord('create', '会计科目', `新增科目：${form.value.code} ${form.value.name}`)
    } else {
      await request.put(`/base/accounts/${form.value.id}`, payload)
      showSuccess('科目修改成功')
      addRecord('update', '会计科目', `修改科目：${form.value.code} ${form.value.name}`)
    }
    dialogVisible.value = false
    fetchData()
  } catch (error) {
    showOperationError(dialogType.value === 'add' ? '新增科目' : '修改科目', error)
  } finally {
    saving.value = false
  }
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

async function fillMissingParents() {
  try {
    await ElMessageBox.confirm(
      '此操作将检查所有科目，并自动补充缺失的上级科目（名称用"-"占位）。是否继续？',
      '补充父科目',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    const res = await request.post<any>('/base/accounts/fill-missing-parents')
    if (res.code === 0) {
      const { checked, created, details } = res.data
      if (created > 0) {
        const detailText = details.map((d: any) => `${d.code} (${d.level}级)`).join('、')
        await ElMessageBox.alert(
          `共检查 ${checked} 个科目，补充了 ${created} 个父科目：\n${detailText}`,
          '补充完成',
          { type: 'success' }
        )
      } else {
        showSuccess(`检查完成：共检查 ${checked} 个科目，无需补充父科目`)
      }
      addRecord('update', '会计科目', `补充缺失父科目：新增 ${created} 个`)
      fetchData()
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      showOperationError('补充父科目', error)
    }
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
  const { utils, writeFile } = await import('xlsx')
  // 导出全部科目（含禁用），用平铺列表
  const allRes = await request.get<any[]>('/base/accounts', { params: { is_enabled: '' } })
  const allAccounts = allRes.data
  const data = allAccounts.map((row: any) => ({
    科目编码: row.code,
    科目名称: row.name,
    余额方向: row.direction === 'debit' ? '借方' : '贷方',
    上级科目编码: allAccounts.find((a: any) => a.id === row.parent_id)?.code || '',
    现金: row.is_cash ? '是' : '',
    银行: row.is_bank ? '是' : '',
    ...buildExportAuxCols(row),
    状态: row.is_enabled ? '启用' : '禁用',
  }))
  const ws = utils.json_to_sheet(data)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '会计科目')
  writeFile(wb, '会计科目.xlsx')
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

    const parsed = rawData.map((row: any) => {
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

      return { code, name, direction, parent_code: parentCode, is_cash: isCash, is_bank: isBank, aux_types: auxTypes, aux_desc: auxDesc, is_enabled: isEnabled }
    }).filter(item => item.code && item.name)

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
      showSuccess(`导入完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}`)
    }
    if (errors.length > 0) {
      showError(`以下科目导入失败：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...共 ${errors.length} 条` : ''}`)
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
</script>

<style scoped>
.page {
  padding: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;}

.page-header h3 {
  margin: 0;
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

:deep(.el-table .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
