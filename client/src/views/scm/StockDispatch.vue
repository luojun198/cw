<template>
  <div class="page sd-page">
    <!-- 顶部导航 -->
    <div class="sd-header">
      <div class="sd-header__left">
        <el-button link size="small" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <span class="sd-header__sep">/</span>
        <span class="sd-header__title">缺货分析 / 智能下推</span>
        <el-tag v-if="docInfo?.doc_no" size="small" style="margin-left:8px">{{ docInfo.doc_no }}</el-tag>
        <el-tag v-if="docInfo?.partner_code" type="info" size="small" effect="plain" style="margin-left:4px">
          {{ docInfo.partner_code }}
        </el-tag>
      </div>
      <div class="sd-header__right">
        <el-radio-group v-model="mode" size="small" @change="load">
          <el-radio-button value="fg">成品缺口</el-radio-button>
          <el-radio-button value="bom">BOM展开材料缺口</el-radio-button>
        </el-radio-group>
        <el-button v-if="mode === 'fg'" type="success" :loading="shipping" :disabled="totalShip <= 0" @click="handleShip">
          充足部分发货（{{ shipRowCount }} 行）
        </el-button>
        <el-button type="primary" :loading="generatingMr" :disabled="totalShort <= 0" @click="handleGenShortage">
          生成缺料单
        </el-button>
      </div>
    </div>

    <div class="sd-body">
      <div class="sd-hint">
        <template v-if="mode === 'fg'">
          <b>可用库存 = 现存量 − 其它已审核未发货销售订单占用</b>（不含本单）。
          库存充足的部分可<b>直接发货</b>，不足的<b>缺口</b>可下推<b>生产计划</b>、<b>委外计划</b>，或<b>生成缺料单</b>（再按供应商拆采购订单）。
        </template>
        <template v-else>
          <b>BOM 展开</b>：成品缺口按<b>多级 BOM 逐级净额</b>展开，每层先扣该料现有库存，只把净缺口继续往下拆，最终直接列出<b>需采购的原材料/外购件</b>缺口。可一次「生成缺料单」，省去「成品→生产→再算缺料」的重复。
        </template>
      </div>

      <el-table v-loading="loading" :data="rows" size="small" border stripe height="100%" class="sd-table">
        <el-table-column type="index" label="#" width="46" align="center" />
        <el-table-column label="编号" prop="item_code" width="120" show-overflow-tooltip />
        <el-table-column label="名称" prop="item_name" min-width="160" show-overflow-tooltip />
        <el-table-column label="规格" prop="spec" width="110" show-overflow-tooltip />
        <!-- 成品模式列 -->
        <template v-if="mode === 'fg'">
          <el-table-column label="仓位" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.warehouse_name || row.warehouse_code || '-' }}</template>
          </el-table-column>
          <el-table-column label="订单数量" width="100" align="right">
            <template #default="{ row }">{{ num(row.order_qty) }}</template>
          </el-table-column>
          <el-table-column label="已下推" width="90" align="right">
            <template #default="{ row }">{{ num(row.pushed_qty) }}</template>
          </el-table-column>
          <el-table-column label="剩余" width="90" align="right">
            <template #default="{ row }">{{ num(row.remain) }}</template>
          </el-table-column>
          <el-table-column label="可用库存" width="100" align="right">
            <template #default="{ row }"><span :class="{ 'sd-neg': row.available < 0 }">{{ num(row.available) }}</span></template>
          </el-table-column>
          <el-table-column label="可发数量" width="100" align="right">
            <template #default="{ row }"><span class="sd-ship">{{ num(row.ship_qty) }}</span></template>
          </el-table-column>
        </template>
        <!-- BOM 展开（材料缺口）模式列 -->
        <template v-else>
          <el-table-column label="单位" prop="unit" width="70" />
          <el-table-column label="需求量" width="110" align="right">
            <template #default="{ row }">{{ num(row.required) }}</template>
          </el-table-column>
          <el-table-column label="现有库存" width="110" align="right">
            <template #default="{ row }">{{ num(row.available) }}</template>
          </el-table-column>
        </template>
        <el-table-column :label="mode === 'fg' ? '缺口' : '缺口(需采购)'" width="120" align="right">
          <template #default="{ row }"><span :class="{ 'sd-short': row.short_qty > 0 }">{{ num(row.short_qty) }}</span></template>
        </el-table-column>
      </el-table>
    </div>

    <div class="sd-footer">
      <el-tag v-if="mode === 'fg'" type="success" effect="plain">可发合计 {{ num(totalShip) }}</el-tag>
      <el-tag :type="totalShort > 0 ? 'danger' : 'info'" effect="plain">{{ mode === 'fg' ? '缺口合计' : '材料缺口合计' }} {{ num(totalShort) }}</el-tag>
      <span class="sd-tip" v-if="totalShort > 0">{{ mode === 'fg' ? '缺口生成缺料单后，按物料来源下推采购/委外/生产' : '材料缺口可直接生成缺料单，再按供应商拆采购订单' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { scmApi, type ScmStockAvailLine } from '@/api/scm'

const route = useRoute()
const router = useRouter()
const docId = computed(() => route.params.id as string)

const loading = ref(false)
const shipping = ref(false)
const generatingMr = ref(false)
/** 缺口分析模式：fg=成品缺口（默认）；bom=BOM 展开材料缺口 */
const mode = ref<'fg' | 'bom'>('fg')
const rows = ref<ScmStockAvailLine[]>([])
const docInfo = ref<any>(null)
// 本单已生成的缺料单（防重复下推）
const shortageDocs = ref<Array<{ id: string; doc_no: string; status: string }>>([])

const num = (v: number) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}
const round = (n: number) => Math.round(n * 1000000) / 1000000

const totalShip = computed(() => round(rows.value.reduce((s, r) => s + (Number(r.ship_qty) || 0), 0)))
const totalShort = computed(() => round(rows.value.reduce((s, r) => s + (Number(r.short_qty) || 0), 0)))
const shipRowCount = computed(() => rows.value.filter(r => (Number(r.ship_qty) || 0) > 0).length)

function goBack() {
  router.push({ name: 'ScmDocView', params: { id: docId.value } })
}

async function load() {
  loading.value = true
  try {
    const res = await scmApi.getDocAvailability(docId.value, mode.value === 'bom')
    if (res.code === 0) {
      rows.value = res.data.lines || []
      docInfo.value = res.data.doc || null
      shortageDocs.value = res.data.shortage_docs || []
    }
  } finally {
    loading.value = false
  }
}

async function handleShip() {
  const shipLines = rows.value.filter(r => (Number(r.ship_qty) || 0) > 0)
  if (!shipLines.length) return ElMessage.warning('没有可发货数量')
  shipping.value = true
  try {
    const lines = shipLines.map(r => {
      const qty = Number(r.ship_qty) || 0
      const price = Number(r.price) || 0
      return {
        item_code: r.item_code,
        item_name: r.item_name || '',
        warehouse_code: r.warehouse_code || docInfo.value?.warehouse_code || '',
        qty,
        price,
        amount: Math.round(qty * price * 100) / 100,
        unit_cost: Number(r.unit_cost) || 0,
        tax_rate: 0,
        tax_amount: 0,
        source_line_id: r.line_id,
      }
    })
    const headerWh = docInfo.value?.warehouse_code || shipLines[0]?.warehouse_code || ''
    const res = await scmApi.createDoc({
      doc_type: 'SO',
      source_doc_id: docId.value,
      partner_code: docInfo.value?.partner_code || '',
      warehouse_code: headerWh,
      lines,
    })
    if (res.code === 0) {
      ElMessage.success(`已生成销售出库草稿 ${res.data.doc_no}，请复核后审核发货`)
      router.push({ name: 'ScmDocView', params: { id: res.data.id } })
    }
  } finally {
    shipping.value = false
  }
}

async function handleGenShortage() {
  const shortLines = rows.value.filter(r => (Number(r.short_qty) || 0) > 0)
  if (!shortLines.length) return ElMessage.warning('没有缺口数量')
  // 防重复下推：本单已生成过缺料单时，二次生成需确认（缺口已扣减已生成数量）
  if (shortageDocs.value.length) {
    const nos = shortageDocs.value.map(d => d.doc_no).join('、')
    try {
      await ElMessageBox.confirm(
        `该销售订单已生成缺料单 ${nos}，本次缺口已扣减已生成数量。确定再次生成缺料单吗？`,
        '重复生成确认',
        { type: 'warning', confirmButtonText: '仍然生成', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }
  generatingMr.value = true
  try {
    // 缺料单：每行带物料默认供应商（缺料单上可再改），不写 source_line_id（缺口由计划/采购补货，不占用销售订单下推）
    const lines = shortLines.map(r => ({
      item_code: r.item_code,
      item_name: r.item_name || '',
      warehouse_code: r.warehouse_code || docInfo.value?.warehouse_code || '',
      qty: Number(r.short_qty) || 0,
      price: 0,
      amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      supplier_code: r.supplier_code || '',
      source_type: r.source_type || 'purchase',
      remark: `销售订单 ${docInfo.value?.doc_no || ''} 缺口`,
    }))
    const res = await scmApi.createDoc({
      doc_type: 'MR',
      source_doc_id: docId.value,
      partner_code: '',
      lines,
    })
    if (res.code === 0) {
      ElMessage.success(`已生成缺料单 ${res.data.doc_no}，可调整来源/供应商后保存`)
      router.push({ name: 'ScmDocEdit', params: { id: res.data.id } })
    }
  } finally {
    generatingMr.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.sd-page { display: flex; flex-direction: column; height: 100%; padding: 0; }
.sd-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-lighter); flex-wrap: wrap; gap: 8px;
}
.sd-header__left { display: flex; align-items: center; }
.sd-header__sep { margin: 0 8px; color: var(--el-text-color-placeholder); }
.sd-header__title { font-size: 15px; font-weight: 600; }
.sd-header__right { display: flex; align-items: center; gap: 8px; }
.sd-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px 16px 0; }
.sd-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 10px; line-height: 1.6; }
.sd-table { flex: 1; min-height: 0; }
.sd-footer {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px; border-top: 1px solid var(--el-border-color-lighter);
}
.sd-tip { margin-left: auto; font-size: 13px; color: var(--el-text-color-secondary); }
.sd-short { color: var(--el-color-danger); font-weight: 600; }
.sd-neg { color: var(--el-color-danger); }
.sd-ship { color: var(--el-color-success); font-weight: 600; }
</style>
