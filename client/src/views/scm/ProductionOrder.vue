<template>
  <div class="page wo-page">
    <div class="wo-header">
      <div class="wo-header__left">
        <el-button link size="small" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <span class="wo-header__sep">/</span>
        <span class="wo-header__title">工单</span>
        <el-tag v-if="plan?.code" size="small">{{ plan.code }}</el-tag>
        <el-tag v-if="plan" :type="STATUS_TYPE[plan.status] || 'info'" size="small" effect="plain">{{ STATUS_LABEL[plan.status] || plan.status }}</el-tag>
      </div>
      <div class="wo-header__right">
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="plan && plan.status === 'draft'" type="primary" size="small" :loading="busy" @click="onRelease">下达</el-button>
        <el-button v-if="plan && plan.status === 'released'" type="success" size="small" :loading="busy" @click="onGenIssue">{{ isOut ? '委外发货' : '生成领料单' }}</el-button>
        <el-button v-if="plan && plan.status === 'released'" type="warning" size="small" @click="openFinish">{{ isOut ? '委外入库' : '完工入库' }}</el-button>
        <el-button v-if="plan && plan.status === 'released'" size="small" :loading="busy" @click="onClose">关闭工单</el-button>
      </div>
    </div>

    <div class="wo-body" v-loading="loading">
      <!-- 汇总卡片 -->
      <div class="wo-cards" v-if="plan">
        <div class="wo-card"><span>成品</span><b>{{ plan.item_code }} {{ plan.item_name || '' }}</b></div>
        <div class="wo-card"><span>计划数 / 已完工</span><b>{{ num(plan.plan_qty) }} / {{ num(plan.finished_qty) }}</b></div>
        <div class="wo-card"><span>已领成本</span><b>{{ fmt(cost.issuedCost) }}</b></div>
        <div class="wo-card"><span>单位成本</span><b>{{ fmt(cost.unitCost) }}</b></div>
        <div class="wo-card" :class="{ 'wo-card--warn': Math.abs(cost.wip) > 0.01 }"><span>在制(WIP)</span><b>{{ fmt(cost.wip) }}</b></div>
        <div class="wo-card"><span>原料仓 / 成品仓</span><b>{{ plan.yl_warehouse || '-' }} / {{ plan.fp_warehouse || '-' }}</b></div>
      </div>

      <!-- BOM 用料 -->
      <section class="wo-section">
        <div class="wo-section__hd"><h3>BOM 用料</h3><span>{{ bomLines.length }} 项</span></div>
        <el-table :data="bomLines" size="small" border stripe>
          <el-table-column type="index" label="#" width="48" align="center" />
          <el-table-column label="编号" width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.item_code }}</template>
          </el-table-column>
          <el-table-column label="名称" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">{{ row.item_name || '' }}</template>
          </el-table-column>
          <el-table-column label="规格" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.spec || '' }}</template>
          </el-table-column>
          <el-table-column label="单位用量" prop="qty" width="100" align="right" />
          <el-table-column label="损耗率%" prop="scrap_rate" width="90" align="right" />
          <el-table-column label="计划总需" width="110" align="right">
            <template #default="{ row }">{{ num((Number(row.qty)||0) * (1 + (Number(row.scrap_rate)||0)/100) * (Number(plan?.plan_qty)||0)) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <!-- 关联单据 -->
      <section class="wo-section">
        <div class="wo-section__hd"><h3>关联单据（领料 / 完工）</h3><span>{{ docs.length }} 张</span></div>
        <el-empty v-if="!docs.length" description="暂无领料/完工单据" :image-size="60" />
        <el-table v-else :data="docs" size="small" border stripe @row-dblclick="openDoc">
          <el-table-column type="index" label="#" width="48" align="center" />
          <el-table-column label="类型" width="100"><template #default="{ row }">{{ typeName(row.doc_type) }}</template></el-table-column>
          <el-table-column label="单号" prop="doc_no" min-width="150" show-overflow-tooltip />
          <el-table-column label="日期" prop="doc_date" width="110" />
          <el-table-column label="数量" prop="total_qty" width="90" align="right" />
          <el-table-column label="金额" width="110" align="right"><template #default="{ row }">{{ fmt(row.total_amount) }}</template></el-table-column>
          <el-table-column label="状态" width="84" align="center">
            <template #default="{ row }"><el-tag :type="row.status === 'audited' ? 'success' : 'info'" size="small">{{ row.status === 'audited' ? '已审核' : '草稿' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center"><template #default="{ row }"><el-link type="primary" :underline="false" @click.stop="openDoc(row)">打开</el-link></template></el-table-column>
        </el-table>
      </section>
    </div>

    <el-dialog v-model="finishVisible" :title="isOut ? '委外入库' : '完工入库'" width="380px">
      <el-form label-width="100px" size="small">
        <el-form-item :label="isOut ? '入库数量' : '完工数量'"><el-input-number v-model="finishQty" :min="1" :precision="3" :controls="false" style="width:100%" /></el-form-item>
        <el-form-item v-if="isOut" label="加工费单价"><el-input-number v-model="finishFee" :min="0" :precision="2" :controls="false" style="width:100%" placeholder="每件委外加工费" /></el-form-item>
        <el-form-item label=" "><span style="font-size:12px;color:var(--el-text-color-secondary)">{{ isOut ? '成品成本=发料分摊+加工费；加工费生成委外厂应付。末批吸收料在制余额。' : '单位成本按已领成本/计划数结转，末批吸收在制余额。' }}</span></el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="finishVisible = false">取消</el-button>
        <el-button type="primary" size="small" :loading="busy" @click="onGenFinish">{{ isOut ? '生成委外入库' : '生成完工单' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'
import { typeName } from '@/utils/scmDoc'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)

const STATUS_LABEL: Record<string, string> = { draft: '草稿', released: '已下达', closed: '已关闭' }
const STATUS_TYPE: Record<string, 'success' | 'info' | 'warning'> = { draft: 'info', released: 'warning', closed: 'success' }

const loading = ref(false)
const busy = ref(false)
const plan = ref<any>(null)
const bomLines = ref<any[]>([])
const docs = ref<any[]>([])
const cost = ref<any>({ issuedCost: 0, finishedCost: 0, finishedQty: 0, wip: 0, unitCost: 0 })
const finishVisible = ref(false)
const finishQty = ref(1)
const finishFee = ref(0)
const isOut = computed(() => plan.value?.plan_type === 'outsource')

const num = (v: any) => { const n = Number(v) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '') }
const fmt = (v: any) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function load() {
  loading.value = true
  try {
    const r = await scmApi.getProductionPlan(id.value)
    if (r.code === 0) { plan.value = r.data.plan; bomLines.value = r.data.bom_lines || []; docs.value = r.data.docs || []; cost.value = r.data.cost }
  } finally { loading.value = false }
}
function goBack() { router.push({ name: 'ScmProductionPlan', query: { plan_type: plan.value?.plan_type || 'self' } }) }
function openDoc(row: any) { router.push({ name: 'ScmDocView', params: { id: row.id } }) }

async function onRelease() {
  busy.value = true
  try { const r = await scmApi.releaseProductionPlan(id.value); if (r.code === 0) { ElMessage.success('工单已下达'); load() } } finally { busy.value = false }
}
async function onGenIssue() {
  busy.value = true
  try {
    const r = await scmApi.genPlanIssue(id.value)
    if (r.code === 0) { ElMessage.success(`已生成${isOut.value ? '委外发货单' : '领料单'} ${r.data.doc_no}，请复核后审核`); router.push({ name: 'ScmDocView', params: { id: r.data.id } }) }
  } finally { busy.value = false }
}
function openFinish() {
  finishQty.value = Math.max(1, (Number(plan.value?.plan_qty) || 0) - (Number(plan.value?.finished_qty) || 0))
  finishVisible.value = true
}
async function onGenFinish() {
  busy.value = true
  try {
    const r = await scmApi.genPlanFinish(id.value, Number(finishQty.value) || 0, isOut.value ? (Number(finishFee.value) || 0) : 0)
    if (r.code === 0) { finishVisible.value = false; ElMessage.success(`已生成${isOut.value ? '委外入库' : '完工入库'} ${r.data.doc_no}，请复核后审核入库`); router.push({ name: 'ScmDocView', params: { id: r.data.id } }) }
  } finally { busy.value = false }
}
async function onClose() {
  busy.value = true
  try {
    const r = await scmApi.closeProductionPlan(id.value, false)
    if (r.code === 0) { ElMessage.success('工单已关闭'); load(); return }
    // 在制未结清 → 二次确认强制关闭
    if (r.code === 409) {
      await ElMessageBox.confirm(`${r.message}`, '关闭确认', { type: 'warning', confirmButtonText: '强制关闭', cancelButtonText: '取消' })
      const r2 = await scmApi.closeProductionPlan(id.value, true)
      if (r2.code === 0) { ElMessage.success('工单已强制关闭'); load() }
    } else { ElMessage.error(r.message || '关闭失败') }
  } catch { /* 取消 */ } finally { busy.value = false }
}
onMounted(load)
</script>

<style scoped>
.wo-page { display: flex; flex-direction: column; height: 100%; padding: 0; }
.wo-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-lighter); flex-wrap: wrap; }
.wo-header__left, .wo-header__right { display: flex; align-items: center; gap: 8px; }
.wo-header__sep { color: var(--el-text-color-placeholder); }
.wo-header__title { font-size: 15px; font-weight: 600; }
.wo-body { flex: 1; min-height: 0; overflow: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 14px; }
.wo-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.wo-card { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #fff; }
.wo-card span { font-size: 12px; color: var(--el-text-color-secondary); }
.wo-card b { font-size: 16px; }
.wo-card--warn b { color: var(--el-color-warning); }
.wo-section__hd { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.wo-section__hd h3 { margin: 0; font-size: 14px; }
.wo-section__hd span { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
