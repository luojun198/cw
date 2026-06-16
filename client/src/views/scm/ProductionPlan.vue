<template>
  <div class="page scm-pp-page">
    
    <div class="filter-row" style="margin-bottom: 8px;">
      <el-button type="primary" size="small" @click="openAdd"><el-icon><Plus /></el-icon>新增计划</el-button>
    </div>

    <div class="page-body">
      <el-table ref="tableRef" :data="list" v-loading="loading" border stripe size="small" height="100%" @header-dragend="onDragEnd">
        <el-table-column label="计划号" prop="code" :width="cw('code', 160)" />
        <el-table-column label="成品" column-key="item" :width="cw('item', 200)">
          <template #default="{ row }">{{ row.item_code }} {{ row.item_name }}</template>
        </el-table-column>
        <el-table-column label="计划数量" prop="plan_qty" :width="cw('plan_qty', 100)" align="right" />
        <el-table-column label="开始" prop="start_date" :width="cw('start_date', 110)" />
        <el-table-column label="结束" prop="end_date" :width="cw('end_date', 110)" />
        <el-table-column label="状态" prop="status" :width="cw('status', 90)" />
        <el-table-column label="备注" prop="remark" min-width="150" :width="widths.remark" show-overflow-tooltip />
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新增生产计划" width="500px">
      <el-form :model="form" label-width="100px" size="small">
        <el-form-item label="计划号" required><el-input v-model="form.code" placeholder="计划唯一编号" /></el-form-item>
        <el-form-item label="成品物料" required><ItemPicker v-model="form.item_code" /></el-form-item>
        <el-form-item label="计划数量" required><el-input-number v-model="form.plan_qty" :min="1" style="width:100%" :controls="false" /></el-form-item>
        <el-form-item label="开始日期"><el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="结束日期"><el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'
import ItemPicker from '@/components/scm/ItemPicker.vue'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'

const { tableRef, colWidth, onDragEnd, widths } = useListColumnWidth('scm_production_plan')
function cw(key: string, fallback: number) { return colWidth(key, fallback) }

const list = ref<any[]>([]); const loading = ref(false)
const dialogVisible = ref(false); const saving = ref(false)
const form = ref<Record<string,any>>({ code:'', item_code:'', plan_qty:1, start_date:'', end_date:'' })

async function load() {
  loading.value = true
  try { const r = await scmApi.getProductionPlans(); if (r.code === 0) list.value = r.data } finally { loading.value = false }
}

function openAdd() {
  form.value = { code:'', item_code:'', plan_qty:1, start_date:'', end_date:'' }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.code || !form.value.item_code) return ElMessage.warning('计划号和成品不能为空')
  saving.value = true
  try { await scmApi.createProductionPlan(form.value); dialogVisible.value = false; ElMessage.success('保存成功'); load() } finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.scm-pp-page { display: flex; flex-direction: column; height: 100%; }
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color); flex-shrink: 0;
}

.page-body { flex: 1; overflow: hidden; padding: 12px 16px; }
</style>
