<template>
  <div class="page mr-preview-page">
    <div class="mr-preview-header">
      <div class="mr-preview-header__left">
        <el-button link size="small" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <span class="mr-preview-header__sep">/</span>
        <span class="mr-preview-header__title">缺料下推预览</span>
        <el-tag v-if="doc?.doc_no" size="small">{{ doc.doc_no }}</el-tag>
        <el-tag v-if="doc?.status" :type="doc.status === 'audited' ? 'success' : 'info'" size="small" effect="plain">
          {{ doc.status === 'audited' ? '已审核' : '草稿' }}
        </el-tag>
      </div>
      <div class="mr-preview-header__right">
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" size="small" :loading="generating" :disabled="!canGenerate" @click="handleGenerate">
          生成已选下游单据
        </el-button>
      </div>
    </div>

    <div class="mr-preview-body" v-loading="loading">
      <div class="mr-summary">
        <div class="mr-summary-card">
          <span class="mr-summary-label">下游类型</span>
          <b>{{ activeGroups.length }}</b>
        </div>
        <div class="mr-summary-card">
          <span class="mr-summary-label">可下推行数</span>
          <b>{{ totalRows }}</b>
        </div>
        <div class="mr-summary-card">
          <span class="mr-summary-label">数量合计</span>
          <b>{{ num(totalQty) }}</b>
        </div>
        <div class="mr-summary-note">
          可自由选择要生成的下游类型；「本次下推」数量可手工修改，允许多买（大于缺口标「多买」）；改为 0 的行不生成。
        </div>
      </div>

      <el-empty v-if="!loading && !activeGroups.length" description="当前缺料单没有可下推明细，可能已经全部下推。" />

      <div v-else class="mr-groups">
        <section v-for="group in groups" :key="group.key" class="mr-group" :class="{ 'is-empty': !group.rows.length }">
          <div class="mr-group__header">
            <div class="mr-group__title">
              <el-checkbox
                :model-value="selectedTargets.includes(group.key)"
                :disabled="!group.rows.length"
                @change="value => toggleTarget(group.key, Boolean(value))"
              />
              <div>
              <h3>{{ group.target }}</h3>
              <span>{{ group.title }}，{{ group.rows.length }} 行</span>
              </div>
            </div>
            <el-tag :type="group.rows.length ? group.tagType : 'info'" effect="plain">
              {{ num(groupTotal(group)) }}
            </el-tag>
          </div>

          <el-table :data="group.rows" size="small" border stripe class="mr-table">
            <el-table-column type="index" label="#" width="48" align="center" />
            <el-table-column label="编号" prop="item_code" width="120" show-overflow-tooltip />
            <el-table-column label="名称" prop="item_name" min-width="160" show-overflow-tooltip />
            <el-table-column label="规格" prop="spec" width="120" show-overflow-tooltip />
            <el-table-column label="仓库" width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.warehouse_code || '-' }}</template>
            </el-table-column>
            <el-table-column label="原数量" width="100" align="right">
              <template #default="{ row }">{{ num(row.qty) }}</template>
            </el-table-column>
            <el-table-column label="已下推" width="100" align="right">
              <template #default="{ row }">{{ num(row.pushed_qty) }}</template>
            </el-table-column>
            <el-table-column label="本次下推" width="170" align="right">
              <template #default="{ row }">
                <div class="mr-qty-edit">
                  <el-input-number v-model="row.remain_qty" :min="0" :precision="3" :controls="false" size="small" style="width:96px" />
                  <el-tag v-if="(Number(row.remain_qty) || 0) > row.base_remain" type="warning" size="small" effect="plain">多买</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="group.key === 'self' ? '来源' : '供应商/外协厂'" width="170" show-overflow-tooltip>
              <template #default="{ row }">
                {{ group.key === 'self' ? group.title : (effSupplier(row) || '未设置（请到物料档案设默认供应商）') }}
              </template>
            </el-table-column>
            <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
          </el-table>
        </section>
      </div>
    </div>

    <div class="mr-preview-footer">
      <span>预计生成：</span>
      <el-tag :type="selectedTargets.includes('purchase') ? 'success' : 'info'" effect="plain">采购订单 {{ countByKey.purchase }} 行</el-tag>
      <el-tag :type="selectedTargets.includes('outsource') ? 'warning' : 'info'" effect="plain">委外计划 {{ countByKey.outsource }} 行</el-tag>
      <el-tag :type="selectedTargets.includes('self') ? 'primary' : 'info'" effect="plain">生产计划 {{ countByKey.self }} 行</el-tag>
      <el-button type="primary" size="small" :loading="generating" :disabled="!canGenerate" @click="handleGenerate">
        生成已选
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { scmApi, type ScmDoc, type ScmDocLine } from '@/api/scm'

type GroupKey = 'purchase' | 'outsource' | 'self'
// base_remain=原缺口（数量−已下推）；remain_qty=本次下推（可人工改，允许>base_remain 多买）
type PreviewRow = ScmDocLine & { remain_qty: number; base_remain: number }
type PreviewGroup = {
  key: GroupKey
  title: string
  target: string
  tagType: 'success' | 'warning' | 'primary'
  rows: PreviewRow[]
}

const route = useRoute()
const router = useRouter()
const docId = computed(() => route.params.id as string)

const loading = ref(false)
const generating = ref(false)
const doc = ref<(ScmDoc & { lines: ScmDocLine[] }) | null>(null)
const selectedTargets = ref<GroupKey[]>(['purchase', 'outsource', 'self'])
/** 供应商编码→名称，用于把有效供应商显示为「编码 名称」 */
const supplierMap = ref<Record<string, string>>({})

/** 有效供应商 = 行供应商 ‖ 物料档案默认供应商；返回「编码 名称」 */
function effSupplier(row: ScmDocLine): string {
  const code = row.supplier_code || row.item_supplier || ''
  if (!code) return ''
  const name = supplierMap.value[code]
  return name ? `${code} ${name}` : code
}

const num = (v: number) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}
const round = (n: number) => Math.round(n * 1000000) / 1000000

const groups = ref<PreviewGroup[]>([])
function buildGroups() {
  const base: PreviewGroup[] = [
    { key: 'purchase', title: '采购来源', target: '采购订单', tagType: 'success', rows: [] },
    { key: 'outsource', title: '委外来源', target: '委外计划', tagType: 'warning', rows: [] },
    { key: 'self', title: '自制来源', target: '生产计划', tagType: 'primary', rows: [] },
  ]
  const map = new Map<GroupKey, PreviewGroup>(base.map(group => [group.key, group]))
  for (const line of doc.value?.lines || []) {
    const remain = round((Number(line.qty) || 0) - (Number(line.pushed_qty) || 0))
    if (remain <= 0) continue
    const sourceType: GroupKey = line.source_type === 'outsource' || line.source_type === 'self'
      ? line.source_type
      : 'purchase'
    const group = map.get(sourceType)
    if (!group) continue
    group.rows.push({ ...line, base_remain: remain, remain_qty: remain })
  }
  groups.value = base
}
// 组内本次下推合计（实时随编辑变化）
const groupTotal = (group: PreviewGroup) => round(group.rows.reduce((s, r) => s + (Number(r.remain_qty) || 0), 0))

const activeGroups = computed(() => groups.value.filter(group => group.rows.length > 0))
const totalRows = computed(() => activeGroups.value.reduce((sum, group) => sum + group.rows.length, 0))
const totalQty = computed(() => round(activeGroups.value.reduce((sum, group) => sum + groupTotal(group), 0)))
const selectedGroups = computed(() => activeGroups.value.filter(group => selectedTargets.value.includes(group.key)))
const selectedRows = computed(() => selectedGroups.value.reduce((sum, group) => sum + group.rows.length, 0))
const canGenerate = computed(() => !!doc.value && doc.value.status === 'audited' && selectedRows.value > 0)
const countByKey = computed<Record<GroupKey, number>>(() => ({
  purchase: groups.value.find(group => group.key === 'purchase')?.rows.length || 0,
  outsource: groups.value.find(group => group.key === 'outsource')?.rows.length || 0,
  self: groups.value.find(group => group.key === 'self')?.rows.length || 0,
}))

function toggleTarget(key: GroupKey, checked: boolean) {
  if (checked) {
    if (!selectedTargets.value.includes(key)) selectedTargets.value.push(key)
  } else {
    selectedTargets.value = selectedTargets.value.filter(target => target !== key)
  }
}

function goBack() {
  const from = route.query.from
  if (from === 'view') {
    router.push({ name: 'ScmDocView', params: { id: docId.value } })
  } else {
    router.push({ name: 'ScmDocList', query: { doc_type: 'MR' } })
  }
}

async function load() {
  loading.value = true
  try {
    const [res, supRes] = await Promise.all([
      scmApi.getDoc(docId.value),
      scmApi.getPartners({ partner_type: 'supplier' }).catch(() => ({ code: -1, data: [] as any[] })),
    ])
    if (res.code === 0) {
      doc.value = res.data
      buildGroups()
    }
    if ((supRes as any).code === 0) {
      const map: Record<string, string> = {}
      for (const p of (supRes as any).data as any[]) map[p.code] = p.name
      supplierMap.value = map
    }
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  if (!canGenerate.value) {
    ElMessage.warning(selectedTargets.value.length ? '选中的类型没有可下推明细' : '请至少选择一类下游单据')
    return
  }
  generating.value = true
  try {
    // 收集选中分组各行的「本次下推」数量（允许多买），按行id传给后端
    const quantities: Record<string, number> = {}
    for (const group of selectedGroups.value) {
      for (const row of group.rows) {
        if (row.id) quantities[row.id] = Number(row.remain_qty) || 0
      }
    }
    const res = await scmApi.genDownstream(docId.value, selectedTargets.value, quantities)
    if (res.code === 0) {
      const { po, outsource_plans, self_plans } = res.data
      ElMessage.success(`已生成 采购单 ${po} 张 / 委外计划 ${outsource_plans} 条 / 生产计划 ${self_plans} 条`)
      await load()
    }
  } finally {
    generating.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.mr-preview-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
}
.mr-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}
.mr-preview-header__left,
.mr-preview-header__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mr-preview-header__sep {
  color: var(--el-text-color-placeholder);
}
.mr-preview-header__title {
  font-size: 15px;
  font-weight: 600;
}
.mr-preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
  overflow: auto;
}
.mr-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 180px)) minmax(280px, 1fr);
  gap: 10px;
  align-items: stretch;
}
.mr-summary-card,
.mr-summary-note {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: #fff;
}
.mr-summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}
.mr-summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mr-summary-card b {
  font-size: 22px;
  line-height: 1;
}
.mr-summary-note {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.mr-groups {
  display: grid;
  gap: 12px;
}
.mr-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.mr-group.is-empty {
  opacity: .62;
}
.mr-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.mr-group__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mr-group__header h3 {
  margin: 0 0 4px;
  font-size: 14px;
}
.mr-group__header span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mr-table {
  width: 100%;
}
.mr-qty {
  color: var(--el-color-primary);
  font-weight: 600;
}
.mr-qty-edit {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.mr-preview-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: #fff;
}
.mr-preview-footer .el-button {
  margin-left: auto;
}
@media (max-width: 900px) {
  .mr-summary {
    grid-template-columns: 1fr;
  }
  .mr-preview-footer .el-button {
    margin-left: 0;
  }
}
</style>
