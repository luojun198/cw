<template>
  <div class="page scm-bom-page">
    <div class="page-header">
      <h3>物料清单(BOM)</h3>
      <div class="filter-row">
        <el-button type="success" @click="openAdd"><el-icon><Plus /></el-icon>新增</el-button>
        <span class="total-hint">共 {{ list.length }} 条</span>
      </div>
    </div>
    <el-table :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 200px)">
      <el-table-column label="编码" prop="code" width="140" />
      <el-table-column label="名称" prop="name" min-width="150" />
      <el-table-column label="成品物料" prop="item_code" width="130" />
      <el-table-column label="物料名称" prop="item_name" width="150" />
      <el-table-column label="状态" prop="status" width="80" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑BOM' : '新增BOM'" width="700px" draggable>
      <el-form :model="form" label-width="80px" size="small">
        <el-row :gutter="10">
          <el-col :span="8"><el-form-item label="编码" required><el-input v-model="form.code" :disabled="!!editId" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="名称"><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="成品物料" required><el-input v-model="form.item_code" placeholder="物料编号" /></el-form-item></el-col>
        </el-row>
        <div style="margin-top:8px">
          <el-button size="small" @click="addLine"><el-icon><Plus /></el-icon>添加组件</el-button>
          <el-table :data="form.lines" border size="small" max-height="280" style="margin-top:4px" @cell-click="handleCellClick" class="compact-data-table">
            <el-table-column label="物料" width="150" prop="item_code">
              <template #default="{row, $index}">
                <el-input v-if="isEditing($index, 'item_code')" v-model="row.item_code" size="small" v-focus @blur="stopEdit" />
                <div v-else class="editable-cell">{{ row.item_code }}</div>
              </template>
            </el-table-column>
            <el-table-column label="用量" width="90" align="right" prop="qty">
              <template #default="{row, $index}">
                <el-input-number v-if="isEditing($index, 'qty')" v-model="row.qty" :min="0" :precision="4" size="small" :controls="false" style="width:100%" v-focus @blur="stopEdit" />
                <div v-else class="editable-cell">{{ row.qty }}</div>
              </template>
            </el-table-column>
            <el-table-column label="单位" width="80" prop="unit">
              <template #default="{row, $index}">
                <el-input v-if="isEditing($index, 'unit')" v-model="row.unit" size="small" v-focus @blur="stopEdit" />
                <div v-else class="editable-cell">{{ row.unit }}</div>
              </template>
            </el-table-column>
            <el-table-column label="损耗率%" width="80" align="right" prop="scrap_rate">
              <template #default="{row, $index}">
                <el-input-number v-if="isEditing($index, 'scrap_rate')" v-model="row.scrap_rate" :min="0" :precision="2" size="small" :controls="false" style="width:100%" v-focus @blur="stopEdit" />
                <div v-else class="editable-cell">{{ row.scrap_rate }}</div>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="120" prop="remark">
              <template #default="{row, $index}">
                <el-input v-if="isEditing($index, 'remark')" v-model="row.remark" size="small" v-focus @blur="stopEdit" />
                <div v-else class="editable-cell">{{ row.remark }}</div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="50"><template #default="{$index}"><el-button link type="danger" size="small" @click="form.lines.splice($index,1)">删</el-button></template></el-table-column>
          </el-table>
        </div>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="handleSave">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'

const list = ref<any[]>([]); const loading = ref(false)
async function load() { loading.value = true; try { const r = await scmApi.getBoms(); if (r.code === 0) list.value = r.data } finally { loading.value = false } }
onMounted(load)

const dialogVisible = ref(false); const editId = ref<string | null>(null); const saving = ref(false)
const form = ref<Record<string, any>>({ code: '', name: '', item_code: '', lines: [] })

const editingCell = ref<{rowIndex: number, field: string} | null>(null)
const vFocus = {
  mounted: (el: HTMLElement) => {
    const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null
    if (input) {
      input.focus()
      input.select()
    }
  }
}

function isEditing(rowIndex: number, field: string) {
  return editingCell.value?.rowIndex === rowIndex && editingCell.value?.field === field
}

function handleCellClick(row: any, column: any) {
  const rowIndex = form.value.lines.indexOf(row)
  const field = column.property
  if (['item_code', 'qty', 'unit', 'scrap_rate', 'remark'].includes(field)) {
    editingCell.value = { rowIndex, field }
  }
}

function stopEdit() {
  editingCell.value = null
}

function openAdd() { editId.value = null; form.value = { code: '', name: '', item_code: '', lines: [{ item_code: '', qty: 1, unit: '', scrap_rate: 0, remark: '' }] }; dialogVisible.value = true; stopEdit() }
async function openEdit(row: any) { editId.value = row.id; const r = await scmApi.getBom(row.id); if (r.code === 0) { const d = r.data as any; form.value = { code: d.code, name: d.name, item_code: d.item_code, lines: d.lines || [] } }; dialogVisible.value = true }
function addLine() { form.value.lines.push({ item_code: '', qty: 1, unit: '', scrap_rate: 0, remark: '' }) }
async function handleSave() {
  if (!form.value.code || !form.value.item_code) return ElMessage.warning('编码和成品物料不能为空')
  saving.value = true
  try { if (editId.value) await scmApi.updateBom(editId.value, form.value); else await scmApi.createBom(form.value); dialogVisible.value = false; ElMessage.success('保存成功'); load() } finally { saving.value = false }
}
async function handleDelete(row: any) { await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' }); await scmApi.deleteBom(row.id); ElMessage.success('已删除'); load() }
</script>
<style scoped>
.scm-bom-page { padding: 12px 16px; } 
.page-header h3 { margin: 0 0 8px; font-size: 15px; } 
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; } 
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }

.compact-data-table :deep(.el-table__cell) {
  padding: 0;
}
.compact-data-table :deep(.cell) {
  padding: 0 4px;
  line-height: 28px;
}
.editable-cell {
  min-height: 28px;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editable-cell:hover {
  background-color: var(--el-fill-color-light);
}
</style>
