<template>
  <div class="page scm-cat-page">
    <div class="cat-bar">
      <span class="cat-title">库位档案</span>
      <el-select v-model="filterWh" clearable filterable placeholder="按仓库筛选" size="small" style="width:180px" @change="load">
        <el-option v-for="w in warehouses" :key="w.code" :value="w.code" :label="`${w.code} ${w.name}`" />
      </el-select>
      <el-button type="primary" size="small" @click="openAdd"><el-icon><Plus /></el-icon>新增库位</el-button>
      <el-button size="small" :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      <span class="cat-hint">共 {{ rows.length }} 个库位（参考用，不参与库存结存）</span>
    </div>
    <div class="cat-body">
      <el-table :data="rows" v-loading="loading" border stripe size="small" height="100%">
        <el-table-column type="index" label="#" width="48" align="center" />
        <el-table-column label="仓库" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.warehouse_name || row.warehouse_code }}</template>
        </el-table-column>
        <el-table-column label="库位编码" prop="code" width="150" />
        <el-table-column label="库位名称" prop="name" min-width="180" show-overflow-tooltip />
        <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled === 0 ? 'info' : 'success'" size="small">{{ row.enabled === 0 ? '停用' : '启用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑库位' : '新增库位'" width="420px" append-to-body>
      <el-form label-width="90px" size="small">
        <el-form-item label="仓库" required>
          <el-select v-model="form.warehouse_code" :disabled="!!editId" filterable placeholder="选择仓库" style="width:100%">
            <el-option v-for="w in warehouses" :key="w.code" :value="w.code" :label="`${w.code} ${w.name}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="库位编码" required>
          <el-input v-model="form.code" :disabled="!!editId" placeholder="如 A-01-01" />
        </el-form-item>
        <el-form-item label="库位名称" required>
          <el-input v-model="form.name" placeholder="库位名称" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { scmApi } from '@/api/scm'

const rows = ref<any[]>([])
const warehouses = ref<any[]>([])
const loading = ref(false)
const filterWh = ref('')
const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref<string | null>(null)
const form = ref<{ warehouse_code: string; code: string; name: string; remark: string; enabled: number }>({ warehouse_code: '', code: '', name: '', remark: '', enabled: 1 })

async function load() {
  loading.value = true
  try { const r = await scmApi.getBins(filterWh.value || undefined); if (r.code === 0) rows.value = r.data || [] }
  finally { loading.value = false }
}
function openAdd() { editId.value = null; form.value = { warehouse_code: filterWh.value || '', code: '', name: '', remark: '', enabled: 1 }; dialogVisible.value = true }
function openEdit(row: any) { editId.value = row.id; form.value = { warehouse_code: row.warehouse_code, code: row.code, name: row.name, remark: row.remark || '', enabled: row.enabled ?? 1 }; dialogVisible.value = true }
async function onSave() {
  if (!form.value.warehouse_code || !form.value.code || !form.value.name) return ElMessage.warning('仓库、编码、名称不能为空')
  saving.value = true
  try {
    const r = editId.value
      ? await scmApi.updateBin(editId.value, { name: form.value.name, remark: form.value.remark, enabled: form.value.enabled })
      : await scmApi.createBin(form.value)
    if (r.code === 0) { ElMessage.success('保存成功'); dialogVisible.value = false; load() }
    else ElMessage.error(r.message || '保存失败')
  } catch (e: any) { ElMessage.error(e?.response?.data?.message || '保存失败') }
  finally { saving.value = false }
}
async function onDelete(row: any) {
  try { await ElMessageBox.confirm(`确认删除库位「${row.name}」？`, '提示', { type: 'warning' }) } catch { return }
  try { const r = await scmApi.deleteBin(row.id); if (r.code === 0) { ElMessage.success('已删除'); load() } else ElMessage.error(r.message || '删除失败') }
  catch (e: any) { ElMessage.error(e?.response?.data?.message || '删除失败') }
}
onMounted(async () => {
  try { const w = await scmApi.getWarehouses(); if (w.code === 0) warehouses.value = w.data || [] } catch {}
  load()
})
</script>

<style scoped>
.scm-cat-page { display: flex; flex-direction: column; height: 100%; padding: 12px 16px; }
.cat-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.cat-title { font-size: 15px; font-weight: 600; margin-right: 4px; }
.cat-hint { margin-left: auto; font-size: 13px; color: var(--el-text-color-secondary); }
.cat-body { flex: 1; min-height: 0; }
</style>
