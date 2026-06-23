<template>
  <div class="page scm-rpt-page">
    <div class="rpt-bar">
      <span class="rpt-title">{{ isSales ? '销售报表' : '采购报表' }}</span>
      <el-date-picker v-model="startDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" size="small" style="width:140px" />
      <el-date-picker v-model="endDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" size="small" style="width:140px" />
      <el-button type="primary" plain size="small" :loading="loading" @click="load"><el-icon><Search /></el-icon>查询</el-button>
      <span class="rpt-hint">{{ rows.length }} 行 · 金额合计 {{ fmt(totalAmount) }}<template v-if="isSales"> · 毛利合计 {{ fmt(totalProfit) }}（{{ profitRate }}）</template></span>
    </div>
    <div class="rpt-body">
      <el-table :data="rows" v-loading="loading" border stripe size="small" height="100%" show-summary :summary-method="summary">
        <el-table-column type="index" label="#" width="48" align="center" />
        <el-table-column label="日期" prop="doc_date" width="110" />
        <el-table-column label="单号" prop="doc_no" width="150" show-overflow-tooltip />
        <el-table-column :label="isSales ? '客户' : '供应商'" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.partner_name || row.partner_code || '-' }}</template>
        </el-table-column>
        <el-table-column label="编号" prop="item_code" width="120" show-overflow-tooltip />
        <el-table-column label="名称" prop="item_name" min-width="150" show-overflow-tooltip />
        <el-table-column label="规格" prop="spec" width="110" show-overflow-tooltip />
        <el-table-column label="数量" prop="qty" width="90" align="right" />
        <el-table-column label="单价" prop="price" width="100" align="right" />
        <el-table-column :label="isSales ? '收入' : '金额'" width="120" align="right"><template #default="{ row }">{{ fmt(row.amount) }}</template></el-table-column>
        <el-table-column v-if="isSales" label="成本" width="120" align="right"><template #default="{ row }">{{ fmt(row.cost) }}</template></el-table-column>
        <el-table-column v-if="isSales" label="毛利" width="120" align="right"><template #default="{ row }"><span :class="{ 'rpt-danger': row.profit < 0 }">{{ fmt(row.profit) }}</span></template></el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'

const route = useRoute()
const isSales = computed(() => (route.query.kind as string) !== 'purchase')
const rows = ref<any[]>([]); const loading = ref(false)
const startDate = ref(''); const endDate = ref('')
const fmt = (v: any) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const totalAmount = computed(() => rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))
const totalCost = computed(() => rows.value.reduce((s, r) => s + (Number(r.cost) || 0), 0))
const totalProfit = computed(() => rows.value.reduce((s, r) => s + (Number(r.profit) || 0), 0))
const profitRate = computed(() => totalAmount.value > 0 ? (totalProfit.value / totalAmount.value * 100).toFixed(1) + '%' : '-')

function summary({ columns }: { columns: any[] }) {
  const out: string[] = []
  columns.forEach((c, i) => {
    if (i === 0) { out[i] = '合计'; return }
    const p = c.property
    if (p === 'qty') out[i] = fmt(rows.value.reduce((s, r) => s + (Number(r.qty) || 0), 0))
    else if (c.label === '收入' || c.label === '金额') out[i] = fmt(totalAmount.value)
    else if (c.label === '成本') out[i] = fmt(totalCost.value)
    else if (c.label === '毛利') out[i] = fmt(totalProfit.value)
    else out[i] = ''
  })
  return out
}

async function load() {
  loading.value = true
  try {
    const params = { start_date: startDate.value || undefined, end_date: endDate.value || undefined }
    const r = isSales.value ? await scmApi.getSalesReport(params) : await scmApi.getPurchaseReport(params)
    if (r.code === 0) rows.value = r.data || []
  } finally { loading.value = false }
}
watch(isSales, load)
onMounted(load)
</script>

<style scoped>
.scm-rpt-page { display: flex; flex-direction: column; height: 100%; padding: 12px 16px; }
.rpt-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.rpt-title { font-size: 15px; font-weight: 600; margin-right: 4px; }
.rpt-hint { margin-left: auto; font-size: 13px; color: var(--el-text-color-secondary); }
.rpt-body { flex: 1; min-height: 0; }
.rpt-danger { color: var(--el-color-danger); }
</style>
