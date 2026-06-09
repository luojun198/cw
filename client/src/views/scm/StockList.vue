<template>
  <div class="page scm-stock-page">
    <div class="page-header">
      <h3>库存查询</h3>
      <div class="filter-row">
        <el-select v-model="warehouse" placeholder="仓库" clearable filterable style="width:160px">
          <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
        </el-select>
        <el-input v-model="keyword" placeholder="物料编号/名称" clearable style="width:200px" @keyup.enter="load" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <span class="total-hint">共 {{ list.length }} 条　库存金额合计 ¥{{ totalAmount }}</span>
      </div>
    </div>
    <el-table :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 200px)"
      empty-text="暂无库存（可通过采购入库/期初库存产生）">
      <el-table-column label="仓库" width="130">
        <template #default="{ row }">{{ row.warehouse_code }} {{ row.warehouse_name || '' }}</template>
      </el-table-column>
      <el-table-column label="物料编号" prop="item_code" width="120" />
      <el-table-column label="名称" prop="item_name" min-width="140" show-overflow-tooltip />
      <el-table-column label="规格" prop="spec" width="120" show-overflow-tooltip />
      <el-table-column label="单位" prop="unit" width="70" />
      <el-table-column label="数量" prop="qty" width="110" align="right">
        <template #default="{ row }">{{ fmt(row.qty) }}</template>
      </el-table-column>
      <el-table-column label="金额" prop="amount" width="120" align="right">
        <template #default="{ row }">{{ fmt(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="平均成本" prop="avg_cost" width="110" align="right">
        <template #default="{ row }">{{ fmt(row.avg_cost, 4) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'

const list = ref<any[]>([])
const warehouses = ref<any[]>([])
const loading = ref(false)
const keyword = ref('')
const warehouse = ref('')

const fmt = (v: number, p = 2) => (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: p, maximumFractionDigits: p })
const totalAmount = computed(() => fmt(list.value.reduce((s, r) => s + (r.amount || 0), 0)))

async function load() {
  loading.value = true
  try {
    const res = await scmApi.getStock({ keyword: keyword.value || undefined, warehouse_code: warehouse.value || undefined })
    if (res.code === 0) list.value = res.data
  } finally { loading.value = false }
}

onMounted(async () => {
  const w = await scmApi.getWarehouses()
  if (w.code === 0) warehouses.value = w.data
  load()
})
</script>

<style scoped>
.scm-stock-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
