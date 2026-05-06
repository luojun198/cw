<template>
  <div class="page">
    <div class="page-header">
      <h3>核算项目</h3>
      <div>
        <el-button type="primary" @click="openCatDialog('add')">新增类别</el-button>
        <el-button type="primary" :disabled="!activeTab" @click="openItemDialog('add')"
          >新增项目</el-button
        >
        <el-button
          :disabled="!activeTab"
          @click="openCatDialog('edit', categories.find(c => c.id === activeTab))"
          >字段配置</el-button
        >
        <el-button :disabled="!activeTab || filteredList.length === 0" @click="exportData"
          >导出</el-button
        >
        <el-button type="success" :disabled="!activeTab" @click="openImportDialog"
          >导入</el-button
        >
        <el-button
          type="warning"
          :disabled="selectedRows.length === 0"
          @click="batchStatusVisible = true"
          >批量设置状态</el-button
        >
        <el-button
          type="danger"
          :disabled="selectedRows.length === 0"
          @click="openBatchDelete"
          >批量删除</el-button
        >
        <el-switch
          v-model="showClosed"
          active-text="显示已完结"
          inactive-text=""
          style="margin-left: 8px"
        />
      </div>
    </div>

    <el-tabs v-if="categories.length > 0" v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane v-for="cat in categories" :key="cat.id" :name="cat.id">
        <template #label>
          <span class="cat-tab-label">
            {{ cat.name }}
            <el-icon
              class="cat-tab-icon"
              title="编辑类别"
              @click.stop="openCatDialog('edit', cat)"
            >
              <Edit />
            </el-icon>
            <el-icon
              class="cat-tab-icon cat-tab-icon-danger"
              title="删除类别"
              @click.stop="handleDeleteCat(cat)"
            >
              <Close />
            </el-icon>
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>
    <div v-else style="padding: 20px; color: #909399; text-align: center">
      暂无核算类别，请先添加核算类别
    </div>

    <el-table
      ref="tableRef"
      :data="filteredList"
      stripe
      border
      height="100%"
      style="margin-top: 8px"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="45" />
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{
            row.status === 'active' ? '进行中' : '已完结'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openItemDialog('edit', row)"
            >编辑</el-button
          >
          <el-button link type="danger" size="small" @click="handleDeleteItem(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 核算类别对话框 -->
    <el-dialog v-model="catDialogVisible" :title="catDialogTitle" width="720px">
      <el-form :model="catForm" label-width="100px">
        <el-form-item label="类别名称" required><el-input v-model="catForm.name" /></el-form-item>
        <el-form-item label="默认项目">
          <el-select
            v-model="catForm.default_item_id"
            placeholder="选择默认辅助项目"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="item in catFormItems"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <!-- 字段配置 -->
        <el-divider content-position="left">字段配置</el-divider>
        <el-table :data="catForm.fields" border size="small" style="width: 100%">
          <el-table-column label="字段名称" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.field_name" placeholder="字段名称" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="字段编码" width="120">
            <template #default="{ row }">
              <el-input v-model="row.field_key" placeholder="自动生成" size="small" :disabled="!!row._persisted" />
            </template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-select v-model="row.field_type" size="small">
                <el-option label="文本" value="text" />
                <el-option label="数字" value="number" />
                <el-option label="日期" value="date" />
                <el-option label="下拉" value="select" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="下拉选项" width="140">
            <template #default="{ row }">
              <el-input
                v-if="row.field_type === 'select'"
                v-model="row.options_text"
                placeholder="选项用逗号分隔"
                size="small"
              />
              <span v-else style="color: #c0c4cc; font-size: 12px">-</span>
            </template>
          </el-table-column>
          <el-table-column label="凭证显示" width="70" align="center">
            <template #default="{ row }">
              <el-checkbox v-model="row.show_in_voucher" />
            </template>
          </el-table-column>
          <el-table-column label="凭证必填" width="70" align="center">
            <template #default="{ row }">
              <el-checkbox v-model="row.required_in_voucher" />
            </template>
          </el-table-column>
          <el-table-column label="档案必填" width="70" align="center">
            <template #default="{ row }">
              <el-checkbox v-model="row.required_in_archive" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="60" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="catForm.fields.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button style="margin-top: 8px" size="small" @click="addCatField">+ 添加字段</el-button>
      </el-form>
      <template #footer>
        <el-button @click="catDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="catSaving" @click="handleSaveCat">保存</el-button>
      </template>
    </el-dialog>

    <!-- 核算项目对话框 -->
    <el-dialog v-model="itemDialogVisible" :title="itemDialogTitle" width="520px">
      <el-form :model="itemForm" label-width="100px">
        <el-form-item label="所属类别" required>
          <el-select
            v-model="itemForm.type"
            :disabled="itemDialogType === 'edit'"
            style="width: 100%"
          >
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目编码" required>
          <el-input v-model="itemForm.code" disabled />
        </el-form-item>
        <el-form-item label="项目名称" required><el-input v-model="itemForm.name" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="itemForm.status" style="width: 100%">
            <el-option label="进行中" value="active" />
            <el-option label="已完结" value="closed" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"
          ><el-input v-model="itemForm.remark" type="textarea" :rows="2"
        /></el-form-item>

        <!-- 动态自定义字段 -->
        <template v-if="currentItemFields.length > 0">
          <el-divider content-position="left">扩展信息</el-divider>
          <el-form-item
            v-for="field in currentItemFields"
            :key="field.field_key"
            :label="field.field_name"
            :required="!!field.required_in_archive"
          >
            <!-- 文本 -->
            <el-input v-if="field.field_type === 'text'" v-model="itemForm.field_values[field.field_key]" />
            <!-- 数字 -->
            <el-input-number v-else-if="field.field_type === 'number'" v-model="itemForm.field_values[field.field_key]" :controls="false" style="width: 100%" />
            <!-- 日期 -->
            <el-date-picker v-else-if="field.field_type === 'date'" v-model="itemForm.field_values[field.field_key]" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            <!-- 下拉 -->
            <el-select v-else-if="field.field_type === 'select'" v-model="itemForm.field_values[field.field_key]" clearable style="width: 100%">
              <el-option v-for="opt in parseFieldOptions(field.options_json)" :key="opt" :label="opt" :value="opt" />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="itemSaving" @click="handleSaveItem">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="批量导入核算项目" width="560px">
      <div class="import-tips">
        <p>1. 请先 <el-link type="primary" @click="downloadTemplate">下载导入模板</el-link>，按模板格式填写数据</p>
        <p>2. 导入将向当前选中的类别「{{ activeCatName }}」下批量新增项目</p>
        <p>3. 编码为空时将自动生成，名称为必填</p>
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
          :title="`解析成功：${importPreview.length} 条数据`"
          type="success"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <el-table :data="importPreview.slice(0, 10)" stripe border size="small" max-height="240">
          <el-table-column prop="code" label="编码" width="100" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              {{ row.status === 'active' ? '进行中' : '已完结' }}
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" />
        </el-table>
        <div v-if="importPreview.length > 10" class="import-more-hint">
          仅展示前 10 条，共 {{ importPreview.length }} 条
        </div>
      </div>

      <template #footer>
        <el-button @click="closeImportDialog">取消</el-button>
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

    <!-- 批量删除对话框 -->
    <el-dialog v-model="batchDeleteVisible" title="批量删除" width="400px">
      <p style="margin-bottom: 12px; color: #606266">
        已选择 <strong>{{ selectedRows.length }}</strong> 个项目
      </p>
      <p style="color: #909399; font-size: 13px">
        系统将自动跳过已被科目或凭证使用的项目，仅删除未使用的项目。
      </p>
      <template #footer>
        <el-button @click="batchDeleteVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="batchDeleteSaving"
          @click="handleBatchDelete"
          >确认删除</el-button
        >
      </template>
    </el-dialog>
    <el-dialog v-model="batchStatusVisible" title="批量设置状态" width="400px">
      <p style="margin-bottom: 12px; color: #606266">
        已选择 <strong>{{ selectedRows.length }}</strong> 个项目，将统一设置为：
      </p>
      <el-select v-model="batchStatusValue" style="width: 100%">
        <el-option label="进行中" value="active" />
        <el-option label="已完结" value="closed" />
      </el-select>
      <template #footer>
        <el-button @click="batchStatusVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchStatusSaving" @click="handleBatchStatus"
          >确定</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { TabPaneName, UploadFile } from 'element-plus'
import { Edit, Close, Upload } from '@element-plus/icons-vue'
import request from '@/api/request'
import { showSuccess, showError, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm, useConfirm } from '@/composables/useConfirm'

const PUNCTUATION_MAP: Record<string, string> = {
  '\uff0c': ',',
  '\u3002': '.',
  '\uff1b': ';',
  '\uff1a': ':',
  '\uff08': '(',
  '\uff09': ')',
  '\u3010': '[',
  '\u3011': ']',
  '\u300c': '{',
  '\u300d': '}',
  '\u201c': '"',
  '\u201d': '"',
  '\u2018': "'",
  '\u2019': "'",
  '\u300a': '<',
  '\u300b': '>',
  '\uff01': '!',
  '\uff1f': '?',
  '\u3001': ',',
  '\u2014\u2014': '-',
  '\u2014': '-',
  '\uff0d': '-',
  '\uff5e': '~',
}

function normalizePunctuation(value: string) {
  return value.replace(
    /\u2014\u2014|[\uff0c\u3002\uff1b\uff1a\uff08\uff09\u3010\u3011\u300c\u300d\u201c\u201d\u2018\u2019\u300a\u300b\uff01\uff1f\u3001\u2014\uff0d\uff5e]/g,
    match => PUNCTUATION_MAP[match] ?? match
  )
}

function normalizeDuplicateKey(value: string) {
  return normalizePunctuation(value)
    .replace(/[\s,.;:()\[\]{}"'<>?!~\-]/g, '')
    .toLowerCase()
}

const categories = ref<any[]>([])
const allItems = ref<any[]>([])
const activeTab = ref('')
const catDialogVisible = ref(false)
const catDialogType = ref('add')
const catDialogTitle = computed(() =>
  catDialogType.value === 'add' ? '新增核算类别' : '编辑核算类别'
)
const catForm = ref<any>({ sort_order: 0 })
const catSaving = ref(false)

// 类别对话框中可选的项目（当前编辑类别的项目）
const catFormItems = computed(() =>
  catForm.value.id
    ? allItems.value.filter(i => i.type === catForm.value.id)
    : []
)

const itemDialogVisible = ref(false)
const itemDialogType = ref('add')
const itemDialogTitle = computed(() =>
  itemDialogType.value === 'add' ? '新增核算项目' : '编辑核算项目'
)
const itemForm = ref<any>({ status: 'active' })
const itemSaving = ref(false)

// 当前项目编辑弹窗对应的类别字段配置
const currentItemFields = computed(() => {
  if (!itemForm.value.type) return []
  const cat = categories.value.find(c => c.id === itemForm.value.type)
  return (cat?.fields || []).filter((f: any) => f.is_enabled !== 0)
})

const filteredList = computed(() =>
  allItems.value.filter(i => i.type === activeTab.value && (showClosed.value ? true : i.status !== 'closed'))
)
const activeCatName = computed(() => categories.value.find(c => c.id === activeTab.value)?.name || '')

// ========== 状态过滤 & 多选 ==========
const showClosed = ref(false)
const tableRef = ref<any>(null)
const selectedRows = ref<any[]>([])
const batchStatusVisible = ref(false)
const batchStatusValue = ref<'active' | 'closed'>('closed')
const batchStatusSaving = ref(false)

const batchDeleteVisible = ref(false)
const batchDeleteSaving = ref(false)

function handleSelectionChange(rows: any[]) {
  selectedRows.value = rows
}

// ========== 导入相关 ==========
const importDialogVisible = ref(false)
const importPreview = ref<any[]>([])
const importUploadRef = ref<any>(null)
const importing = ref(false)

async function fetchData() {
  const [catRes, itemRes] = await Promise.all([
    request.get<any[]>('/base/aux-categories'),
    request.get<any[]>('/base/aux-items'),
  ])
  categories.value = catRes.data
  allItems.value = itemRes.data
  // 默认选中第一个类别
  if (!activeTab.value && categories.value.length > 0) {
    activeTab.value = categories.value[0].id
  }
}

function onTabChange(tabId: TabPaneName) {
  activeTab.value = String(tabId)
}

function openCatDialog(t: string, row?: any) {
  catDialogType.value = t
  if (t === 'add') {
    const maxCodeNum = categories.value.reduce((max, cat) => {
      const m = String(cat.code || '').match(/CAT(\d+)/)
      return m ? Math.max(max, Number.parseInt(m[1], 10)) : max
    }, 0)
    catForm.value = {
      code: `CAT${String(maxCodeNum + 1).padStart(3, '0')}`,
      sort_order: categories.value.length,
      default_item_id: null,
      fields: [],
    }
  } else {
    // 编辑时从 categories 数据中带出已有字段
    const existingFields = (row?.fields || []).map((f: any) => ({
      ...f,
      show_in_voucher: !!f.show_in_voucher,
      required_in_voucher: !!f.required_in_voucher,
      required_in_archive: !!f.required_in_archive,
      options_text: parseFieldOptionsText(f.options_json),
      _persisted: true,
    }))
    catForm.value = { ...row, fields: existingFields }
  }
  catDialogVisible.value = true
}

function addCatField() {
  if (!catForm.value.fields) catForm.value.fields = []
  const idx = catForm.value.fields.length + 1
  catForm.value.fields.push({
    field_key: `field_${idx}`,
    field_name: '',
    field_type: 'text',
    options_json: null,
    options_text: '',
    show_in_voucher: false,
    required_in_voucher: false,
    required_in_archive: false,
    sort_order: catForm.value.fields.length,
    _persisted: false,
  })
}

function parseFieldOptionsText(optionsJson: string | null): string {
  if (!optionsJson) return ''
  try {
    const arr = JSON.parse(optionsJson)
    return Array.isArray(arr) ? arr.join(',') : ''
  } catch {
    return ''
  }
}

function parseFieldOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return []
  try {
    const arr = JSON.parse(optionsJson)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function buildFieldsForSave(fields: any[]): any[] {
  return (fields || []).map((f: any, i: number) => {
    let optionsJson = null
    if (f.field_type === 'select' && f.options_text) {
      optionsJson = JSON.stringify(f.options_text.split(',').map((s: string) => s.trim()).filter(Boolean))
    }
    return {
      field_key: f.field_key,
      field_name: f.field_name,
      field_type: f.field_type || 'text',
      options_json: optionsJson,
      show_in_voucher: f.show_in_voucher ? 1 : 0,
      required_in_voucher: f.required_in_voucher ? 1 : 0,
      required_in_archive: f.required_in_archive ? 1 : 0,
      sort_order: i,
    }
  })
}

async function handleSaveCat() {
  catSaving.value = true
  try {
    const payload = {
      ...catForm.value,
      fields: buildFieldsForSave(catForm.value.fields),
    }
    if (catDialogType.value === 'add') {
      await request.post('/base/aux-categories', payload)
      showSuccess('类别创建成功')
    } else {
      await request.put(`/base/aux-categories/${catForm.value.id}`, payload)
      showSuccess('类别更新成功')
    }
    catDialogVisible.value = false
    await fetchData()
  } catch (error) {
    showOperationError(catDialogType.value === 'add' ? '创建类别' : '更新类别', error)
  } finally {
    catSaving.value = false
  }
}

async function handleDeleteCat(row: any) {
  const confirmed = await useDeleteConfirm(`类别「${row.name}」`)
  if (!confirmed) return

  try {
    await request.delete(`/base/aux-categories/${row.id}`)
    showSuccess('删除成功')
    // 如果删除的是当前选中的tab，切换到第一个
    if (activeTab.value === row.id) {
      activeTab.value = categories.value[0]?.id || ''
    }
    await fetchData()
  } catch (error) {
    showOperationError('删除类别', error)
  }
}

function openItemDialog(t: string, row?: any) {
  itemDialogType.value = t
  if (t === 'add') {
    const currentCategoryItems = allItems.value.filter(item => item.type === activeTab.value)
    const nextCode =
      currentCategoryItems.reduce((max, item) => {
        const codeNum = Number.parseInt(String(item.code || ''), 10)
        return Number.isNaN(codeNum) ? max : Math.max(max, codeNum)
      }, 0) + 1

    itemForm.value = {
      type: activeTab.value,
      code: String(nextCode).padStart(6, '0'),
      status: 'active',
      field_values: {},
    }
  } else {
    // 编辑时解析 field_values
    let fv = {}
    try {
      fv = row.field_values ? (typeof row.field_values === 'string' ? JSON.parse(row.field_values) : row.field_values) : {}
    } catch { /* ignore */ }
    itemForm.value = { ...row, field_values: { ...fv } }
  }
  itemDialogVisible.value = true
}

async function handleSaveItem() {
  itemSaving.value = true
  try {
    itemForm.value.name = normalizePunctuation(itemForm.value.name?.trim?.() || '')

    const exactDuplicate = allItems.value.find(item => {
      if (item.type !== itemForm.value.type) {
        return false
      }
      if (itemDialogType.value === 'edit' && item.id === itemForm.value.id) {
        return false
      }
      return (item.name || '') === itemForm.value.name
    })

    if (exactDuplicate) {
      showError(
        `项目名称已存在，不允许存盘。编码：${exactDuplicate.code}；名称：${exactDuplicate.name}`
      )
      return
    }

    const duplicateTarget = allItems.value.find(item => {
      if (item.type !== itemForm.value.type) {
        return false
      }
      if (itemDialogType.value === 'edit' && item.id === itemForm.value.id) {
        return false
      }
      if ((item.name || '') === itemForm.value.name) {
        return false
      }
      return normalizeDuplicateKey(item.name || '') === normalizeDuplicateKey(itemForm.value.name)
    })

    if (duplicateTarget) {
      const confirmed = await useConfirm({
        message: `检测到近似项目 "编码：${duplicateTarget.code}；名称：${duplicateTarget.name}" ，保存后会形成近似重复，是否继续？`,
        title: '重复提醒',
        confirmButtonText: '继续保存',
        cancelButtonText: '取消',
      })
      if (!confirmed) return
    }

    if (itemDialogType.value === 'add') {
      await request.post('/base/aux-items', itemForm.value)
      showSuccess('项目创建成功')
    } else {
      await request.put(`/base/aux-items/${itemForm.value.id}`, itemForm.value)
      showSuccess('项目更新成功')
    }
    itemDialogVisible.value = false
    await fetchData()
  } catch (error) {
    showOperationError(itemDialogType.value === 'add' ? '创建项目' : '更新项目', error)
  } finally {
    itemSaving.value = false
  }
}

async function handleDeleteItem(row: any) {
  const confirmed = await useDeleteConfirm(`项目「${row.name}」`)
  if (!confirmed) return

  try {
    await request.delete(`/base/aux-items/${row.id}`)
    showSuccess('删除成功')
    await fetchData()
  } catch (error) {
    showOperationError('删除项目', error)
  }
}

// ========== 批量设置状态 ==========
async function handleBatchStatus() {
  batchStatusSaving.value = true
  let successCount = 0
  let failCount = 0

  try {
    for (const row of selectedRows.value) {
      try {
        await request.put(`/base/aux-items/${row.id}`, {
          ...row,
          status: batchStatusValue.value,
        })
        successCount++
      } catch {
        failCount++
      }
    }

    if (successCount > 0) {
      const statusLabel = batchStatusValue.value === 'active' ? '进行中' : '已完结'
      showSuccess(`已将 ${successCount} 个项目设为「${statusLabel}」${failCount > 0 ? `，${failCount} 个失败` : ''}`)
    }

    batchStatusVisible.value = false
    selectedRows.value = []
    // 清除表格选中状态
    tableRef.value?.clearSelection()
    await fetchData()
  } catch (error) {
    showOperationError('批量设置状态', error)
  } finally {
    batchStatusSaving.value = false
  }
}

// ========== 批量删除 ==========
function openBatchDelete() {
  batchDeleteVisible.value = true
}

async function handleBatchDelete() {
  batchDeleteSaving.value = true
  let successCount = 0
  let failCount = 0

  try {
    for (const row of selectedRows.value) {
      try {
        await request.delete(`/base/aux-items/${row.id}`)
        successCount++
      } catch {
        failCount++
      }
    }

    if (successCount > 0) {
      showSuccess(`已删除 ${successCount} 个项目${failCount > 0 ? `，${failCount} 个因已使用而跳过` : ''}`)
    } else if (failCount > 0) {
      showError('所选项目全部已被科目或凭证使用，无法删除')
    }

    batchDeleteVisible.value = false
    selectedRows.value = []
    tableRef.value?.clearSelection()
    await fetchData()
  } catch (error) {
    showOperationError('批量删除', error)
  } finally {
    batchDeleteSaving.value = false
  }
}

// ========== 导出功能 ==========
async function exportData() {
  const { utils, writeFile } = await import('xlsx')
  const catName = activeCatName.value
  const cat = categories.value.find(c => c.id === activeTab.value)
  const customFields = (cat?.fields || []).filter((f: any) => f.is_enabled !== 0)

  const data = filteredList.value.map((item: any) => {
    const row: Record<string, string> = {
      编码: item.code,
      名称: item.name,
      状态: item.status === 'active' ? '进行中' : '已完结',
      备注: item.remark || '',
    }
    // 动态字段列
    let fv: Record<string, string> = {}
    try {
      fv = item.field_values ? (typeof item.field_values === 'string' ? JSON.parse(item.field_values) : item.field_values) : {}
    } catch { /* ignore */ }
    for (const field of customFields) {
      row[field.field_name] = String(fv[field.field_key] ?? '')
    }
    return row
  })
  const ws = utils.json_to_sheet(data)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, catName || '核算项目')
  writeFile(wb, `核算项目_${catName}.xlsx`)
}

// ========== 导入功能 ==========
function openImportDialog() {
  importPreview.value = []
  importDialogVisible.value = true
}

function closeImportDialog() {
  importPreview.value = []
  importDialogVisible.value = false
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

    const currentCategoryItems = allItems.value.filter(item => item.type === activeTab.value)
    const maxCode = currentCategoryItems.reduce((max, item) => {
      const codeNum = Number.parseInt(String(item.code || ''), 10)
      return Number.isNaN(codeNum) ? max : Math.max(max, codeNum)
    }, 0)

    // 获取当前类别字段配置，建立 field_name → field_key 映射
    const cat = categories.value.find(c => c.id === activeTab.value)
    const customFields = (cat?.fields || []).filter((f: any) => f.is_enabled !== 0)
    const fieldNameToKey = new Map(customFields.map((f: any) => [f.field_name, f.field_key]))

    const parsed = rawData.map((row: any, index: number) => {
      const name = normalizePunctuation(String(row['名称'] || '').trim())
      const code = String(row['编码'] || '').trim() || String(maxCode + index + 1).padStart(6, '0')
      const statusStr = String(row['状态'] || '').trim()
      const status = statusStr === '已完结' || statusStr === 'closed' ? 'closed' : 'active'
      const remark = String(row['备注'] || '').trim()

      // 解析动态字段值
      const fieldValues: Record<string, string> = {}
      for (const field of customFields) {
        const val = String(row[field.field_name] ?? '').trim()
        if (val) fieldValues[field.field_key] = val
      }

      return { code, name, status, remark, field_values: fieldValues }
    }).filter(item => item.name) // 名称必填，跳过空行

    importPreview.value = parsed
  } catch (error) {
    showError('文件解析失败，请检查文件格式')
    console.error('Import parse error:', error)
  }
}

async function downloadTemplate() {
  const { utils, writeFile } = await import('xlsx')
  const cat = categories.value.find(c => c.id === activeTab.value)
  const customFields = (cat?.fields || []).filter((f: any) => f.is_enabled !== 0)

  // 固定列 + 动态列
  const baseRow: Record<string, string> = {
    编码: '000001',
    名称: '示例项目1',
    状态: '进行中',
    备注: '',
  }
  for (const field of customFields) {
    baseRow[field.field_name] = ''
  }

  const templateData = [baseRow, { ...baseRow, 编码: '000002', 名称: '示例项目2', 状态: '已完结', 备注: '备注信息' }]
  const ws = utils.json_to_sheet(templateData)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '导入模板')
  writeFile(wb, '核算项目导入模板.xlsx')
}

async function handleImport() {
  if (importPreview.value.length === 0) return
  importing.value = true
  let successCount = 0
  let failCount = 0
  const errors: string[] = []

  try {
    for (const item of importPreview.value) {
      try {
        await request.post('/base/aux-items', {
          type: activeTab.value,
          code: item.code,
          name: item.name,
          status: item.status,
          remark: item.remark,
          field_values: item.field_values || {},
        })
        successCount++
      } catch (error: any) {
        failCount++
        const msg = error.response?.data?.message || '未知错误'
        errors.push(`编码${item.code} ${item.name}: ${msg}`)
      }
    }

    if (successCount > 0) {
      showSuccess(`导入完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}`)
    }

    if (errors.length > 0) {
      showError(`以下项目导入失败：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...共 ${errors.length} 条` : ''}`)
    }

    closeImportDialog()
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
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
}
.cat-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.cat-tab-icon {
  font-size: 12px;
  color: #909399;
  cursor: pointer;
  margin-left: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}
.cat-tab-label:hover .cat-tab-icon {
  opacity: 1;
}
.cat-tab-icon:hover {
  color: #409eff;
}
.cat-tab-icon-danger:hover {
  color: #f56c6c;
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
</style>