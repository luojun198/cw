<template>
  <div class="page scm-stock-page">
        <el-table ref="tableRef" :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 200px)"
      empty-text="暂无库存（可通过采购入库/期初库存产生）" @header-dragend="onDragEnd">
      <el-table-column label="仓库" column-key="warehouse" :width="cw('warehouse', 130)">
        <template #default="{ row }">{{ row.warehouse_code }} {{ row.warehouse_name || '' }}</template>
      </el-table-column>
      <el-table-column label="物料编号" prop="item_code" :width="cw('item_code', 120)" />
      <el-table-column label="名称" prop="item_name" min-width="140" :width="widths.item_name" show-overflow-tooltip />
      <el-table-column label="规格" prop="spec" :width="cw('spec', 120)" show-overflow-tooltip />
      <el-table-column label="单位" prop="unit" :width="cw('unit', 70)" />
      <el-table-column label="数量" prop="qty" :width="cw('qty', 110)" align="right">
        <template #default="{ row }">{{ fmt(row.qty) }}</template>
      </el-table-column>
      <el-table-column label="销售未出货" prop="unshipped_sales_qty" :width="cw('unshipped_sales_qty', 120)" align="right">
        <template #header>
          销售未出货
          <el-tooltip content="已审核销售订单中尚未下推发货的数量" placement="top">
            <el-icon style="margin-left: 4px; cursor: help"><InfoFilled /></el-icon>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <span :style="{ color: row.unshipped_sales_qty > 0 ? '#e6a23c' : 'inherit' }">
            {{ fmt(row.unshipped_sales_qty) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="金额" prop="amount" :width="cw('amount', 120)" align="right">
        <template #default="{ row }">{{ fmt(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="平均成本" prop="avg_cost" :width="cw('avg_cost', 110)" align="right">
        <template #default="{ row }">{{ fmt(row.avg_cost, 4) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, InfoFilled } from '@element-plus/icons-vue'
import { scmApi } from '@/api/scm'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'

const { tableRef, colWidth, onDragEnd, widths } = useListColumnWidth('scm_stock')
function cw(key: string, fallback: number) { return colWidth(key, fallback) }

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
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
</style>
