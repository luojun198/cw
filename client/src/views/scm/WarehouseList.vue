<template>
  <div class="page scm-wh-page">
    <div class="page-header">
      <h3>仓库档案</h3>
      <div class="filter-row">
        <el-button type="success" @click="openAdd"><el-icon><Plus /></el-icon>新增</el-button>
        <span class="total-hint">共 {{ list.length }} 条</span>
      </div>
    </div>
    <el-table :data="list" v-loading="loading" border stripe size="small" max-height="560">
      <el-table-column label="编号" prop="code" width="120" />
      <el-table-column label="名称" prop="name" min-width="160" />
      <el-table-column label="属性" prop="attr" width="100" />
      <el-table-column label="负责人" prop="keeper" width="120" />
      <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑仓库' : '新增仓库'" width="440px" draggable @keydown="onDialogKeydown">
      <el-form :model="form" label-width="80px" size="small">
        <el-form-item label="编号" required><el-input v-model="form.code" :disabled="!!editId" /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="属性"><el-input v-model="form.attr" /></el-form-item>
        <el-form-item label="负责人"><el-input v-model="form.keeper" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: nowrap;">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-if="!editId" :loading="saving" @click="handleSave(true)">保存并新增 (Ctrl+Enter)</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave(false)">保存 (Enter)</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { scmApi, type ScmWarehouse } from '@/api/scm'

const list = ref<ScmWarehouse[]>([])
const loading = ref(false)
async function load() {
  loading.value = true
  try { const res = await scmApi.getWarehouses(); if (res.code === 0) list.value = res.data } finally { loading.value = false }
}

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const form = ref<Partial<ScmWarehouse>>({})
async function openAdd() {
  editId.value = null
  form.value = {}
  dialogVisible.value = true
  try { const r = await scmApi.getWarehouseNextNo(); if (r.code === 0) form.value.code = r.data.next_no } catch {}
}
function openEdit(row: ScmWarehouse) { editId.value = row.id; form.value = { ...row }; dialogVisible.value = true }
async function handleSave(continueAdd = false) {
  if (!form.value.code || !form.value.name) return ElMessage.warning('编号和名称不能为空')
  saving.value = true
  try {
    if (editId.value) await scmApi.updateWarehouse(editId.value, form.value)
    else await scmApi.createWarehouse(form.value)
    ElMessage.success(continueAdd ? '保存成功，可继续新增' : '保存成功')
    load()
    if (continueAdd) {
      await openAdd()
    } else {
      dialogVisible.value = false
    }
  } finally { saving.value = false }
}

function onDialogKeydown(e: KeyboardEvent) {
  if (!dialogVisible.value || saving.value) return
  if (e.key !== 'Enter') return
  const target = e.target as HTMLElement
  if (target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    if (!editId.value) handleSave(true)
    else handleSave(false)
  } else {
    handleSave(false)
  }
}

async function handleDelete(row: ScmWarehouse) {
  await ElMessageBox.confirm(`确认删除仓库「${row.name}」？`, '提示', { type: 'warning' })
  await scmApi.deleteWarehouse(row.id); ElMessage.success('已删除'); load()
}
onMounted(load)
</script>

<style scoped>
.scm-wh-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
