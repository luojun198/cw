<template>
  <div class="page scm-arap-page">
    <div class="filter-row">
      <el-select v-model="partnerCode" filterable placeholder="选择往来单位" style="width:220px" size="small" @change="load">
        <el-option v-for="p in partners" :key="p.code" :label="`${p.code} ${p.name}`" :value="p.code" />
      </el-select>
      <el-date-picker v-model="startDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:140px" size="small" />
      <el-date-picker v-model="endDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:140px" size="small" />
      <el-button type="primary" plain size="small" :disabled="!partnerCode" @click="load"><el-icon><Search /></el-icon>查询</el-button>
      <span class="total-hint" v-if="partnerCode">期初 {{ fmt(opening) }}　期末 {{ fmt(closing) }}</span>
    </div>

    <div class="page-body">
      <el-empty v-if="!partnerCode" description="请选择往来单位查询应收应付明细" />
      <el-table v-else :data="detail" v-loading="loading" border stripe size="small" height="100%">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column label="日期" prop="doc_date" width="120" />
        <el-table-column label="单据类型" width="110">
          <template #default="{ row }">{{ typeName(row.doc_type) }}</template>
        </el-table-column>
        <el-table-column label="单号" prop="doc_no" min-width="150" show-overflow-tooltip />
        <el-table-column label="摘要/方向" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'in' ? 'warning' : 'success'" size="small" effect="plain">
              {{ row.direction === 'in' ? '应收应付增加' : '核销收付' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发生额" width="130" align="right">
          <template #default="{ row }">
            <span :class="row.direction === 'in' ? 'amt-in' : 'amt-out'">
              {{ row.direction === 'in' ? '+' : '-' }}{{ fmt(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="结存余额" width="130" align="right">
          <template #default="{ row }">{{ fmt(row.balance) }}</template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="140" show-overflow-tooltip />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { scmApi, type ScmPartner } from '@/api/scm'

const route = useRoute()
const partners = ref<ScmPartner[]>([])
const partnerCode = ref<string>((route.query.partner_code as string) || '')
const startDate = ref('')
const endDate = ref('')
const loading = ref(false)
const opening = ref(0)
const closing = ref(0)
const detail = ref<any[]>([])

const DOC_TYPE_NAMES: Record<string, string> = {
  IS: '期初入库', PI: '采购入库', PR: '采购退货', SO: '销售出库', SR: '销售退货', OI: '其他入库', OO: '其他出库',
  TR: '调拨单', CK: '盘点单', AS: '组装单', DS: '拆卸单', PQ: '采购询价单', PO: '采购订单',
  SQ: '销售报价单', SOa: '销售订单', RP: '采购发票', RS: '销售发票', PAY: '付款单', RCV: '收款单', MR: '缺料单',
}
function typeName(t: string) { return DOC_TYPE_NAMES[t] || t }
const fmt = (v: any) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function loadPartners() {
  const r = await scmApi.getPartners({})
  if (r.code === 0) partners.value = r.data as ScmPartner[]
}

async function load() {
  if (!partnerCode.value) return
  loading.value = true
  try {
    const r = await scmApi.getPartnerLedger(partnerCode.value, { start_date: startDate.value || undefined, end_date: endDate.value || undefined })
    if (r.code === 0) {
      opening.value = r.data.opening || 0
      closing.value = r.data.closing || 0
      detail.value = r.data.detail || []
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadPartners()
  if (partnerCode.value) load()
})
</script>

<style scoped>
.scm-arap-page { display: flex; flex-direction: column; height: 100%; padding: 12px 16px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { margin-left: auto; font-size: 13px; color: var(--el-text-color-secondary); }
.page-body { flex: 1; min-height: 0; }
.amt-in { color: var(--el-color-warning); font-weight: 600; }
.amt-out { color: var(--el-color-success); font-weight: 600; }
</style>
