<template>
  <div class="page scm-pp-page">
    
    <div class="filter-row" style="margin-bottom: 8px;">
      <el-button type="primary" size="small" @click="openAdd"><el-icon><Plus /></el-icon>新增{{ pageLabel }}</el-button>
      <span style="margin-left:auto;font-size:13px;color:var(--el-text-color-secondary)">共 {{ displayList.length }} 条</span>
    </div>

    <div class="page-body">
      <el-table ref="tableRef" :data="displayList" v-loading="loading" border stripe size="small" height="100%" @header-dragend="onDragEnd">
        <el-table-column label="计划号" prop="code" :width="cw('code', 160)" />
        <el-table-column label="类型" column-key="plan_type" :width="cw('plan_type', 80)" align="center">
          <template #default="{ row }">
            <el-tag :type="row.plan_type === 'outsource' ? 'warning' : 'success'" size="small" effect="plain">
              {{ row.plan_type === 'outsource' ? '委外' : '自制' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="编号" column-key="item_code" :width="cw('item_code', 120)">
          <template #default="{ row }">{{ row.item_code }}</template>
        </el-table-column>
        <el-table-column label="名称" column-key="item_name" :width="cw('item_name', 160)">
          <template #default="{ row }">{{ row.item_name }}</template>
        </el-table-column>
        <el-table-column label="规格" column-key="spec" :width="cw('spec', 120)" show-overflow-tooltip>
          <template #default="{ row }">{{ row.spec || '' }}</template>
        </el-table-column>
        <el-table-column label="计划数" prop="plan_qty" :width="cw('plan_qty', 80)" align="right" />
        <el-table-column label="进度" :width="cw('progress', 90)" align="center">
          <template #default="{ row }">{{ num(row.finished_qty) }} / {{ num(row.plan_qty) }}</template>
        </el-table-column>
        <el-table-column label="供应商" prop="supplier_code" :width="cw('supplier_code', 110)" show-overflow-tooltip />
        <el-table-column label="状态" :width="cw('status', 90)" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status] || 'info'" size="small" effect="plain">{{ STATUS_LABEL[row.status] || row.status || '草稿' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="120" :width="widths.remark" show-overflow-tooltip />
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openOrder(row)">工单</el-button>
            <el-button v-if="(row.status || 'draft') === 'draft'" link type="danger" size="small" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="`新增${pageLabel}`" width="500px">
      <el-form :model="form" label-width="100px" size="small">
        <el-form-item label="计划号" required><el-input v-model="form.code" placeholder="计划唯一编号" /></el-form-item>
        <el-form-item label="成品物料" required><ItemPicker v-model="form.item_code" /></el-form-item>
        <el-form-item label="计划数量" required><el-input-number v-model="form.plan_qty" :min="1" style="width:100%" :controls="false" /></el-form-item>
        <el-form-item v-if="form.plan_type === 'outsource'" label="委外厂">
          <el-select v-model="form.supplier_code" filterable clearable placeholder="选择委外厂" style="width:100%">
            <el-option v-for="p in outsourcePartners" :key="p.code" :label="`${p.code} ${p.name}`" :value="p.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="BOM">
          <el-select v-model="form.bom_id" clearable filterable placeholder="选择物料清单" style="width:100%">
            <el-option v-for="b in boms" :key="b.id" :label="`${b.code} ${b.item_code}`" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生产部门"><el-input v-model="form.dept_code" placeholder="可留空" /></el-form-item>
        <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="0" :precision="0" :controls="false" style="width:100%" /></el-form-item>
        <el-form-item label="原料仓">
          <el-select v-model="form.yl_warehouse" clearable filterable style="width:100%">
            <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="成品仓">
          <el-select v-model="form.fp_warehouse" clearable filterable style="width:100%">
            <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
          </el-select>
        </el-form-item>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'
import ItemPicker from '@/components/scm/ItemPicker.vue'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'

const { tableRef, colWidth, onDragEnd, widths } = useListColumnWidth('scm_production_plan')
function cw(key: string, fallback: number) { return colWidth(key, fallback) }

const route = useRoute()
const router = useRouter()
const STATUS_LABEL: Record<string, string> = { draft: '草稿', released: '已下达', closed: '已关闭' }
const STATUS_TYPE: Record<string, 'success' | 'info' | 'warning'> = { draft: 'info', released: 'warning', closed: 'success' }
const num = (v: any) => { const n = Number(v) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '') }
function openOrder(row: any) { router.push({ name: 'ScmProductionOrder', params: { id: row.id } }) }
async function onDelete(row: any) {
  try { await ElMessageBox.confirm(`确认删除${pageLabel.value} ${row.code}？`, '提示', { type: 'warning' }) } catch { return }
  const r = await scmApi.deleteProductionPlan(row.id)
  if (r.code === 0) { ElMessage.success('已删除'); load() }
}
// 来源类型过滤：?plan_type=outsource 委外计划 / self 生产计划 / 空=全部
const planTypeFilter = computed(() => (route.query.plan_type as string) || '')
const pageLabel = computed(() => planTypeFilter.value === 'outsource' ? '委外计划' : '生产计划')

const list = ref<any[]>([]); const loading = ref(false)
const dialogVisible = ref(false); const saving = ref(false)
const boms = ref<any[]>([]); const warehouses = ref<any[]>([]); const partners = ref<any[]>([])
const outsourcePartners = computed(() => partners.value.filter((p: any) => p.enabled !== 0 && p.is_outsource === 1))
const displayList = computed(() => planTypeFilter.value
  ? list.value.filter((p: any) => (p.plan_type || 'self') === planTypeFilter.value)
  : list.value)
const emptyForm = () => ({ code:'', item_code:'', plan_qty:1, start_date:'', end_date:'', bom_id:'', dept_code:'', priority:0, yl_warehouse:'', fp_warehouse:'', plan_type: planTypeFilter.value || 'self', supplier_code:'' })
const form = ref<Record<string,any>>(emptyForm())

async function load() {
  loading.value = true
  try { const r = await scmApi.getProductionPlans(); if (r.code === 0) list.value = r.data } finally { loading.value = false }
}

async function loadMeta() {
  const [b, w, p] = await Promise.all([scmApi.getBoms(), scmApi.getWarehouses(), scmApi.getPartners({})])
  if (b.code === 0) boms.value = b.data
  if (w.code === 0) warehouses.value = w.data
  if (p.code === 0) partners.value = p.data as any[]
}

async function openAdd() {
  form.value = emptyForm()
  // 委外计划自动取计划号前缀 OP，生产计划 PP
  try { const r = await scmApi.getProductionPlanNextNo(form.value.plan_type); if (r.code === 0) form.value.code = r.data.next_no } catch {}
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.code || !form.value.item_code) return ElMessage.warning('计划号和成品不能为空')
  saving.value = true
  try { await scmApi.createProductionPlan(form.value); dialogVisible.value = false; ElMessage.success('保存成功'); load() } finally { saving.value = false }
}
onMounted(() => { load(); loadMeta() })
</script>

<style scoped>
.scm-pp-page { display: flex; flex-direction: column; height: 100%; }
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color); flex-shrink: 0;
}

.page-body { flex: 1; overflow: hidden; padding: 12px 16px; }
</style>
