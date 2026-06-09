<template>
  <div class="page scm-pp-page">
    <div class="page-header">
      <h3>生产计划</h3>
      <div class="filter-row">
        <el-button type="success" @click="dialogVisible = true"><el-icon><Plus /></el-icon>新增</el-button>
        <span class="total-hint">共 {{ list.length }} 条</span>
      </div>
    </div>
    <el-table :data="list" v-loading="loading" border stripe size="small">
      <el-table-column label="计划号" prop="code" width="160" />
      <el-table-column label="成品" width="200">
        <template #default="{ row }">{{ row.item_code }} {{ row.item_name }}</template>
      </el-table-column>
      <el-table-column label="计划数量" prop="plan_qty" width="100" align="right" />
      <el-table-column label="开始" prop="start_date" width="110" />
      <el-table-column label="结束" prop="end_date" width="110" />
      <el-table-column label="状态" prop="status" width="90" />
      <el-table-column label="备注" prop="remark" min-width="150" show-overflow-tooltip />
    </el-table>

    <el-dialog v-model="dialogVisible" title="新增生产计划" width="500px">
      <el-form :model="form" label-width="80px" size="small">
        <el-form-item label="计划号" required><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="成品物料" required><ItemPicker v-model="form.item_code" /></el-form-item>
        <el-form-item label="计划数量" required><el-input-number v-model="form.plan_qty" :min="1" style="width:100%" /></el-form-item>
        <el-form-item label="开始日期"><el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="结束日期"><el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="handleSave">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'
import ItemPicker from '@/components/scm/ItemPicker.vue'

const list = ref<any[]>([]); const loading = ref(false)
const dialogVisible = ref(false); const saving = ref(false)
const form = ref<Record<string,any>>({ code:'', item_code:'', plan_qty:1, start_date:'', end_date:'' })

async function load() {
  loading.value = true
  try { const r = await scmApi.getProductionPlans(); if (r.code === 0) list.value = r.data } finally { loading.value = false }
}
async function handleSave() {
  if (!form.value.code || !form.value.item_code) return ElMessage.warning('计划号和成品不能为空')
  saving.value = true
  try { await scmApi.createProductionPlan(form.value); dialogVisible.value = false; ElMessage.success('保存成功'); load() } finally { saving.value = false }
}
onMounted(load)
</script>
<style scoped>
.scm-pp-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
