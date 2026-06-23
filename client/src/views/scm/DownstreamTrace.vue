<template>
  <div class="page dt-page">
    <div class="dt-header">
      <div class="dt-header__left">
        <el-button link size="small" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <span class="dt-header__sep">/</span>
        <span class="dt-header__title">上下游单据追溯</span>
        <el-tag v-if="doc?.doc_type" size="small" type="info" effect="plain">{{ typeName(doc.doc_type) }}</el-tag>
        <el-tag v-if="doc?.doc_no" size="small">{{ doc.doc_no }}</el-tag>
        <el-tag v-if="doc?.status" :type="doc.status === 'audited' ? 'success' : 'info'" size="small" effect="plain">
          {{ doc.status === 'audited' ? '已审核' : '草稿' }}
        </el-tag>
      </div>
      <div class="dt-header__right">
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="dt-body" v-loading="loading">
      <el-empty v-if="!loading && !hasAny" description="该单据暂无上下游关联单据" />

      <template v-else>
        <!-- 上游来源 -->
        <section v-if="upstreamDocs.length" class="dt-group">
          <div class="dt-group__header">
            <h3>上游来源</h3>
            <span>{{ upstreamDocs.length }} 张</span>
          </div>
          <el-table :data="upstreamDocs" size="small" border stripe class="dt-table" @row-dblclick="viewDoc">
            <el-table-column type="index" label="#" width="44" align="center" />
            <el-table-column label="类型" width="84">
              <template #default="{ row }">{{ typeName(row.doc_type) }}</template>
            </el-table-column>
            <el-table-column label="单号" prop="doc_no" min-width="150" show-overflow-tooltip />
            <el-table-column label="往来单位" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.partner_name || row.partner_code || '-' }}</template>
            </el-table-column>
            <el-table-column label="日期" prop="doc_date" width="110" />
            <el-table-column label="数量" width="90" align="right">
              <template #default="{ row }">{{ num(row.total_qty) }}</template>
            </el-table-column>
            <el-table-column label="金额" width="110" align="right">
              <template #default="{ row }">{{ fmt(row.total_amount) }}</template>
            </el-table-column>
            <el-table-column label="下推进度" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="isPushProgressDoc(row.doc_type)" :type="(row.pushed_qty||0) >= (row.total_qty||0) && (row.total_qty||0) > 0 ? 'success' : ((row.pushed_qty||0) > 0 ? 'warning' : 'info')" size="small">
                  {{ row.pushed_qty || 0 }} / {{ row.total_qty || 0 }}
                </el-tag>
                <span v-else class="dt-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="84" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'audited' ? 'success' : 'info'" size="small">
                  {{ row.status === 'audited' ? '已审核' : '草稿' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" align="center">
              <template #default="{ row }"><ScmDocActions :row="row" @changed="load" /></template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 下游单据（采购订单等），按类型分组 -->
        <section v-for="grp in docGroups" :key="grp.type" class="dt-group">
          <div class="dt-group__header">
            <h3>{{ typeName(grp.type) }}</h3>
            <span>{{ grp.rows.length }} 张</span>
          </div>
          <el-table :data="grp.rows" size="small" border stripe class="dt-table" @row-dblclick="viewDoc">
            <el-table-column type="index" label="#" width="44" align="center" />
            <el-table-column label="单号" prop="doc_no" min-width="150" show-overflow-tooltip />
            <el-table-column label="往来单位" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.partner_name || row.partner_code || '默认供应商' }}</template>
            </el-table-column>
            <el-table-column label="日期" prop="doc_date" width="110" />
            <el-table-column label="数量" width="90" align="right">
              <template #default="{ row }">{{ num(row.total_qty) }}</template>
            </el-table-column>
            <el-table-column label="金额" width="110" align="right">
              <template #default="{ row }">{{ fmt(row.total_amount) }}</template>
            </el-table-column>
            <el-table-column label="下推进度" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="isPushProgressDoc(row.doc_type)" :type="(row.pushed_qty||0) >= (row.total_qty||0) && (row.total_qty||0) > 0 ? 'success' : ((row.pushed_qty||0) > 0 ? 'warning' : 'info')" size="small">
                  {{ row.pushed_qty || 0 }} / {{ row.total_qty || 0 }}
                </el-tag>
                <span v-else class="dt-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="84" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'audited' ? 'success' : 'info'" size="small">
                  {{ row.status === 'audited' ? '已审核' : '草稿' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" align="center">
              <template #default="{ row }"><ScmDocActions :row="row" @changed="load" /></template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 委外计划 -->
        <section v-if="outsourcePlans.length" class="dt-group">
          <div class="dt-group__header">
            <h3>委外计划</h3>
            <span>{{ outsourcePlans.length }} 条</span>
            <el-link class="dt-group__more" type="primary" :underline="false" @click="goPlans('outsource')">查看全部委外计划</el-link>
          </div>
          <el-table :data="outsourcePlans" size="small" border stripe class="dt-table">
            <el-table-column type="index" label="#" width="48" align="center" />
            <el-table-column label="计划号" prop="code" min-width="160" show-overflow-tooltip />
            <el-table-column label="编号" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.item_code }}</template>
            </el-table-column>
            <el-table-column label="名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.item_name || '' }}</template>
            </el-table-column>
            <el-table-column label="规格" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.spec || '' }}</template>
            </el-table-column>
            <el-table-column label="数量" prop="plan_qty" width="100" align="right" />
            <el-table-column label="委外厂" prop="supplier_code" width="120" show-overflow-tooltip />
            <el-table-column label="状态" prop="status" width="90" align="center" />
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-link v-if="isPlanDraft(row)" type="danger" :underline="false" @click="handleDeletePlan(row)">删除</el-link>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 生产计划 -->
        <section v-if="selfPlans.length" class="dt-group">
          <div class="dt-group__header">
            <h3>生产计划</h3>
            <span>{{ selfPlans.length }} 条</span>
            <el-link class="dt-group__more" type="primary" :underline="false" @click="goPlans('self')">查看全部生产计划</el-link>
          </div>
          <el-table :data="selfPlans" size="small" border stripe class="dt-table">
            <el-table-column type="index" label="#" width="48" align="center" />
            <el-table-column label="计划号" prop="code" min-width="160" show-overflow-tooltip />
            <el-table-column label="编号" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.item_code }}</template>
            </el-table-column>
            <el-table-column label="名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.item_name || '' }}</template>
            </el-table-column>
            <el-table-column label="规格" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.spec || '' }}</template>
            </el-table-column>
            <el-table-column label="数量" prop="plan_qty" width="100" align="right" />
            <el-table-column label="状态" prop="status" width="90" align="center" />
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-link v-if="isPlanDraft(row)" type="danger" :underline="false" @click="handleDeletePlan(row)">删除</el-link>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { scmApi, type ScmDoc } from '@/api/scm'
import ScmDocActions from '@/components/scm/ScmDocActions.vue'
import { typeName, isPushProgressDoc } from '@/utils/scmDoc'

type DownstreamPlan = { id: string; code: string; plan_type: string; item_code: string; item_name?: string; plan_qty: number; supplier_code?: string; status?: string }

const route = useRoute()
const router = useRouter()
const docId = computed(() => route.params.id as string)

const loading = ref(false)
const doc = ref<ScmDoc | null>(null)
const upstreamDocs = ref<ScmDoc[]>([])
const downstreamDocs = ref<ScmDoc[]>([])
const downstreamPlans = ref<DownstreamPlan[]>([])

const num = (v: any) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}
const fmt = (v: any) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const docGroups = computed(() => {
  const map = new Map<string, ScmDoc[]>()
  for (const d of downstreamDocs.value) {
    if (!map.has(d.doc_type)) map.set(d.doc_type, [])
    map.get(d.doc_type)!.push(d)
  }
  return [...map.entries()].map(([type, rows]) => ({ type, rows }))
})
const outsourcePlans = computed(() => downstreamPlans.value.filter(p => p.plan_type === 'outsource'))
const selfPlans = computed(() => downstreamPlans.value.filter(p => (p.plan_type || 'self') !== 'outsource'))
const hasAny = computed(() => upstreamDocs.value.length > 0 || downstreamDocs.value.length > 0 || downstreamPlans.value.length > 0)

function goBack() {
  router.push({ name: 'ScmDocList', query: { doc_type: doc.value?.doc_type || 'MR' } })
}
function viewDoc(row: ScmDoc) {
  router.push({ name: 'ScmDocView', params: { id: row.id } })
}
function goPlans(planType: 'outsource' | 'self') {
  router.push({ name: 'ScmProductionPlan', query: { plan_type: planType } })
}

// 计划草稿（未审核）判定
const isPlanDraft = (row: DownstreamPlan) => (row.status || 'draft') !== 'audited'

// 删除草稿委外/生产计划
async function handleDeletePlan(row: DownstreamPlan) {
  try {
    await ElMessageBox.confirm(`确定删除草稿计划 ${row.code}？`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  const r = await scmApi.deleteProductionPlan(row.id)
  if (r.code === 0) { ElMessage.success('已删除'); load() }
}

async function load() {
  loading.value = true
  try {
    const res = await scmApi.getDocDownstream(docId.value)
    if (res.code === 0) {
      doc.value = res.data.doc
      upstreamDocs.value = res.data.upstream_docs || []
      downstreamDocs.value = res.data.downstream_docs || []
      downstreamPlans.value = res.data.downstream_plans || []
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.dt-page { display: flex; flex-direction: column; height: 100%; padding: 0; }
.dt-header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-lighter); flex-wrap: wrap;
}
.dt-header__left, .dt-header__right { display: flex; align-items: center; gap: 8px; }
.dt-header__sep { color: var(--el-text-color-placeholder); }
.dt-header__title { font-size: 15px; font-weight: 600; }
.dt-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px 16px; overflow: auto; }
.dt-group { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #fff; overflow: hidden; }
.dt-group__header {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: var(--el-fill-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter);
}
.dt-group__header h3 { margin: 0; font-size: 14px; }
.dt-group__header span { font-size: 12px; color: var(--el-text-color-secondary); }
.dt-group__more { margin-left: auto; font-size: 13px; }
.dt-table { width: 100%; }
.dt-muted { color: var(--el-text-color-placeholder); }
</style>
