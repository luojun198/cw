<template>
  <div class="page page-asset-depr">
    <div class="page-header">
      <h3>固定资产折旧</h3>
      <div class="filter-row">
        <el-date-picker
          v-model="period"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择期间"
          style="width: 140px"
        />
        <el-button type="primary" :loading="previewing" @click="handlePreview">
          <el-icon><Search /></el-icon>预览折旧
        </el-button>
        <template v-if="previewLines.length > 0 && !executed">
          <el-divider direction="vertical" />
          <el-checkbox v-model="generateVoucher">同时生成凭证</el-checkbox>
          <div v-if="generateVoucher" class="header-acc-select">
            <span class="tip-label">默认累计折旧科目：</span>
            <el-select 
              v-model="accumAccount" 
              filterable 
              placeholder="选择科目" 
              style="width: 240px" 
              clearable
            >
              <el-option
                v-for="a in baseData.accounts.filter(acc => !acc.is_parent)"
                :key="a.code"
                :label="`${a.code} ${a.name}`"
                :value="a.code"
              />
            </el-select>
          </div>
          <el-button
            type="success"
            :loading="executing"
            :disabled="!!priorUnvouchered"
            :title="priorUnvouchered ? `请先为 ${priorUnvouchered} 折旧生成凭证` : ''"
            @click="handleExecute"
          >
            <el-icon><Check /></el-icon>确认计提
          </el-button>
        </template>
        <el-divider direction="vertical" />
        <el-button plain @click="openWorkloadDialog">
          <el-icon><Edit /></el-icon>录入工作量
        </el-button>
        <el-button plain @click="switchTab('history')">
          <el-icon><List /></el-icon>历史记录
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="depr-tabs">
      <!-- 预览 Tab -->
      <el-tab-pane label="折旧预览" name="preview">
        <el-alert
          v-if="priorUnvouchered"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 10px"
          :title="`${priorUnvouchered} 折旧尚未生成凭证，无法计提 ${period}`"
          description="已设置折旧起始期间，须从起始期间起逐月计提并生成凭证。请先到「历史记录」页为上述期间补生成折旧凭证。"
        />
        <div v-if="executed" class="result-banner">
          <el-result
            icon="success"
            :title="`${resultPeriod} 折旧计提完成`"
            :sub-title="`共 ${resultCount} 条，合计 ¥${fmtAmt(resultTotal)}`"
          >
            <template #extra>
              <div v-if="resultVoucher" class="voucher-tip">
                已生成凭证：{{ resultVoucher.voucherNo }}（共 {{ resultVoucher.entryCount }} 行分录）
              </div>
            </template>
          </el-result>
        </div>

        <div v-else ref="tableContainerRef" class="table-container">
          <!-- 合计摘要 -->
          <div v-if="previewLines.length > 0" class="summary-bar">
            <span>本期应计提资产：<b>{{ previewLines.length }}</b> 条</span>
            <span>折旧合计：<b class="total-amt">¥{{ fmtAmt(previewTotal) }}</b></span>
          </div>
          <el-table
            ref="tableRef"
            :data="previewLines"
            :height="tableHeight"
            border
            stripe
            size="small"
            empty-text="点击「预览折旧」查看本期应计提明细"
          >
            <el-table-column label="资产编号" prop="asset_no" width="110" />
            <el-table-column label="资产名称" prop="asset_name" min-width="140" show-overflow-tooltip />
            <el-table-column label="折旧方法" width="110">
              <template #default="{ row }">{{ DEPR_METHODS[row.depr_method] || row.depr_method }}</template>
            </el-table-column>
            <el-table-column label="折旧费用科目" width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ formatAccount(row.expense_account) }}</template>
            </el-table-column>
            <el-table-column label="累计折旧科目" width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ formatAccount(row.depr_account_code || accumAccount) }}</template>
            </el-table-column>
            <el-table-column label="原值" prop="original_value" width="110" align="right">
              <template #default="{ row }">{{ fmtAmt(row.original_value) }}</template>
            </el-table-column>
            <el-table-column label="计提前累计折旧" prop="accum_depr_before" width="130" align="right">
              <template #default="{ row }">{{ fmtAmt(row.accum_depr_before) }}</template>
            </el-table-column>
            <el-table-column label="本月折旧额" prop="month_depr" width="115" align="right">
              <template #default="{ row }">
                <span class="depr-amt">{{ fmtAmt(row.month_depr) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="计提后累计折旧" prop="accum_depr_after" width="130" align="right">
              <template #default="{ row }">{{ fmtAmt(row.accum_depr_after) }}</template>
            </el-table-column>
            <el-table-column label="计提后净值" prop="net_value_after" width="110" align="right">
              <template #default="{ row }">{{ fmtAmt(row.net_value_after) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 历史 Tab -->
      <el-tab-pane label="历史记录" name="history">
        <div class="history-filter">
          <el-date-picker
            v-model="historyPeriod"
            type="month"
            value-format="YYYY-MM"
            placeholder="筛选期间"
            clearable
            style="width: 140px"
            @change="loadHistory"
          />
          <span class="history-total" v-if="historyRows.length">
            共 {{ historyRows.length }} 条，合计 ¥{{ fmtAmt(historyRows.reduce((s,r)=>s+r.month_depr,0)) }}
          </span>
        </div>

        <!-- 按期间汇总 + 操作（补生成凭证 / 反折旧） -->
        <div v-if="historyPeriods.length" class="period-summary">
          <div class="period-summary-title">期间汇总</div>
          <el-table :data="historyPeriods" size="small" border stripe max-height="200">
            <el-table-column label="期间" prop="period" width="100" />
            <el-table-column label="资产数" prop="count" width="80" align="right" />
            <el-table-column label="折旧合计" width="130" align="right">
              <template #default="{ row }">¥{{ fmtAmt(row.total) }}</template>
            </el-table-column>
            <el-table-column label="折旧凭证" min-width="160">
              <template #default="{ row }">
                <el-tag v-if="row.voucherNo" type="success" size="small" effect="plain">
                  已生成：{{ row.voucherNo }}
                </el-tag>
                <el-tag v-else type="info" size="small" effect="plain">未生成</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220" align="center">
              <template #default="{ row }">
                <el-button
                  v-if="!row.voucherNo"
                  link
                  type="primary"
                  size="small"
                  :loading="periodActing === row.period"
                  @click="handleGenerateVoucherForPeriod(row)"
                >生成凭证</el-button>
                <el-button
                  link
                  type="danger"
                  size="small"
                  :loading="periodActing === row.period"
                  @click="handleReverseDepr(row)"
                >反折旧</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-table :data="historyRows" size="small" border stripe max-height="480">
          <el-table-column label="期间" width="90">
            <template #default="{ row }">{{ row.year }}-{{ String(row.month).padStart(2,'0') }}</template>
          </el-table-column>
          <el-table-column label="资产编号" prop="asset_no" width="110" />
          <el-table-column label="资产名称" prop="asset_name" min-width="130" show-overflow-tooltip />
          <el-table-column label="折旧方法" width="110">
            <template #default="{ row }">{{ DEPR_METHODS[row.depr_method] || row.depr_method }}</template>
          </el-table-column>
          <el-table-column label="使用部门" prop="dept_name" width="100" />
          <el-table-column label="折旧费用科目" prop="expense_account" width="120" />
          <el-table-column label="本月折旧" prop="month_depr" width="110" align="right">
            <template #default="{ row }">{{ fmtAmt(row.month_depr) }}</template>
          </el-table-column>
          <el-table-column label="累计折旧" prop="accum_depr" width="110" align="right">
            <template #default="{ row }">{{ fmtAmt(row.accum_depr) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 工作量录入弹窗 -->
    <el-dialog v-model="workloadVisible" title="录入工作量" width="700px" draggable>
      <div class="workload-hint">
        仅显示使用<b>工作量法</b>折旧的资产，录入本期实际工作量后点击「保存」即可。
      </div>
      <el-table :data="workloadAssets" size="small" border stripe max-height="360">
        <el-table-column label="资产编号" prop="asset_no" width="110" />
        <el-table-column label="资产名称" prop="asset_name" min-width="150" show-overflow-tooltip />
        <el-table-column label="总工作量" prop="total_workload" width="110" align="right">
          <template #default="{ row }">{{ row.total_workload ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="已录入工作" prop="workload_value" width="130" align="center">
          <template #default="{ row }">
            <el-input-number v-model="workloadValues[row.asset_no]" :min="0" :precision="2" size="small" style="width:120px" />
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!workloadAssets.length" description="没有使用工作量法的资产" />
      <template #footer>
        <el-button @click="workloadVisible = false">取消</el-button>
        <el-button type="primary" :loading="workloadSaving" @click="handleSaveWorkload">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Check, List, Edit } from '@element-plus/icons-vue'
import { fixedAssetApi, type DeprLine, DEPR_METHODS } from '@/api/fixedAsset'
import { useFillHeightTable } from '@/composables/useFillHeightTable'
import AccountSelect from '@/components/base/AccountSelect.vue'
import { useBaseDataStore } from '@/stores/baseData'
import { confirmRenumberAfterDelete } from '@/composables/useRenumberPrompt'

const { tableRef, containerRef: tableContainerRef, tableHeight } = useFillHeightTable()
const baseData = useBaseDataStore()

const now = new Date()
const period = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const activeTab = ref('preview')
const previewing = ref(false)
const executing = ref(false)
const previewLines = ref<DeprLine[]>([])
const previewTotal = ref(0)
const generateVoucher = ref(false)
const accumAccount = ref('1602')

// 顺序控制：设置了折旧起始期间后，从起始期间起到本期之前的每月都必须已生成折旧凭证
const priorUnvouchered = ref<string | null>(null)
const deprStartPeriod = ref<string>('')

async function checkPriorVoucher() {
  try {
    // 1. 读取折旧起始期间（未设置则不启用约束）
    const pres = await fixedAssetApi.getAssetParams()
    if (pres.code === 0) {
      deprStartPeriod.value =
        (pres.data || []).find(x => x.param_key === 'asset:depr_start_period')?.param_value || ''
    }
    const start = deprStartPeriod.value
    const target = period.value
    if (!start || !target || target <= start) {
      priorUnvouchered.value = null
      return
    }
    // 2. 已生成折旧凭证的期间集合
    const res = await fixedAssetApi.getDeprHistory({})
    const vouchered = new Set<string>()
    if (res.code === 0) {
      const seen = new Map<string, boolean>()
      for (const r of res.data as any[]) {
        const key = `${r.year}-${String(r.month).padStart(2, '0')}`
        if (!seen.has(key)) seen.set(key, true)
        if (!r.voucher_no) seen.set(key, false)
      }
      for (const [k, ok] of seen) if (ok) vouchered.add(k)
    }
    // 3. 从起始期间逐月迭代到本期前一月，找第一个未生成凭证的月份
    let [py, pm] = start.split('-').map(Number)
    let found: string | null = null
    while (true) {
      const key = `${py}-${String(pm).padStart(2, '0')}`
      if (key >= target) break
      if (!vouchered.has(key)) {
        found = key
        break
      }
      pm++
      if (pm > 12) { pm = 1; py++ }
    }
    priorUnvouchered.value = found
  } catch {
    priorUnvouchered.value = null
  }
}

watch(period, () => {
  checkPriorVoucher()
})

const executed = ref(false)
const resultPeriod = ref('')
const resultCount = ref(0)
const resultTotal = ref(0)
const resultVoucher = ref<any>(null)

const historyPeriod = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const historyRows = ref<any[]>([])
const periodActing = ref('')

// 按 year-month 分组历史明细，供「补生成凭证 / 反折旧」操作
const historyPeriods = computed(() => {
  const map = new Map<string, { period: string; year: number; month: number; count: number; total: number; voucherNo: string | null }>()
  for (const r of historyRows.value) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`
    if (!map.has(key)) {
      map.set(key, { period: key, year: r.year, month: r.month, count: 0, total: 0, voucherNo: r.voucher_no || null })
    }
    const g = map.get(key)!
    g.count++
    g.total += r.month_depr || 0
    if (r.voucher_no) g.voucherNo = r.voucher_no
  }
  return [...map.values()].sort((a, b) => b.period.localeCompare(a.period))
})

async function handleGenerateVoucherForPeriod(row: { period: string; year: number; month: number; total: number }) {
  await ElMessageBox.confirm(
    `确认为 ${row.period} 补生成折旧凭证（合计 ¥${fmtAmt(row.total)}）？累计折旧科目默认取资产类别配置，未配置时用「${accumAccount.value || '1602'}」。`,
    '补生成凭证', { type: 'info' }
  )
  periodActing.value = row.period
  try {
    const res = await fixedAssetApi.generateDeprVoucherForPeriod({
      year: row.year, month: row.month, accum_account: accumAccount.value || '1602',
    })
    if (res.code === 0) {
      ElMessage.success(`已生成凭证：${res.data.voucher?.voucherNo || ''}`)
      await loadHistory()
      await checkPriorVoucher()
    }
  } finally {
    periodActing.value = ''
  }
}

async function handleReverseDepr(row: { period: string; year: number; month: number; count: number; total: number; voucherNo: string | null }) {
  await ElMessageBox.confirm(
    `确认反折旧 ${row.period}？将删除该期 ${row.count} 条折旧记录、回退资产累计折旧与净值${row.voucherNo ? `、并删除该期折旧凭证「${row.voucherNo}」` : ''}。此操作不可恢复。`,
    '反折旧确认', { type: 'warning', confirmButtonText: '确认反折旧', confirmButtonClass: 'el-button--danger' }
  )
  periodActing.value = row.period
  try {
    const res = await fixedAssetApi.reverseDepr({ year: row.year, month: row.month })
    if (res.code === 0) {
      const nos = res.data.deletedVoucherNos || []
      ElMessage.success(`已反折旧 ${row.period}，回退 ${res.data.assetCount} 项资产${nos.length ? `，删除凭证 ${nos.join('、')}` : ''}`)
      await loadHistory()
      await checkPriorVoucher()
      // 删除折旧凭证可能造成断号，提示是否重新排号
      await confirmRenumberAfterDelete(res.data.affectedGroups, nos.length)
    }
  } finally {
    periodActing.value = ''
  }
}

const fmtAmt = (v: number) =>
  (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const accountMap = computed(() => {
  const map = new Map<string, string>()
  for (const a of baseData.accounts) map.set(a.code, a.name)
  return map
})

function formatAccount(code: string | null | undefined) {
  if (!code) return ''
  const name = accountMap.value.get(code)
  return name ? `${code} ${name}` : code
}

function parsePeriod(p: string) {
  const [y, m] = p.split('-').map(Number)
  return { year: y, month: m }
}

async function handlePreview() {
  if (!period.value) return ElMessage.warning('请选择期间')
  previewing.value = true
  executed.value = false
  try {
    const { year, month } = parsePeriod(period.value)
    const res = await fixedAssetApi.previewDepr(year, month)
    if (res.code === 0) {
      previewLines.value = res.data.lines
      previewTotal.value = res.data.totalDepr
      if (!res.data.lines.length) ElMessage.info('本期无应计提资产')
    }
  } finally {
    previewing.value = false
  }
}

async function handleExecute() {
  if (!previewLines.value.length) return
  await ElMessageBox.confirm(
    `确认对 ${period.value} 计提折旧（共 ${previewLines.value.length} 条，合计 ¥${fmtAmt(previewTotal.value)}）？此操作不可撤销。`,
    '计提确认', { type: 'warning' }
  )
  executing.value = true
  try {
    const { year, month } = parsePeriod(period.value)
    const res = await fixedAssetApi.executeDepr({
      year, month,
      generate_voucher: generateVoucher.value,
      accum_account: accumAccount.value || '1602',
    })
    if (res.code === 0) {
      executed.value = true
      resultPeriod.value = period.value
      resultCount.value = res.data.assetCount
      resultTotal.value = res.data.totalDepr
      resultVoucher.value = res.data.voucher
      ElMessage.success('折旧计提成功')
      await checkPriorVoucher()
    }
  } finally {
    executing.value = false
  }
}

async function loadHistory() {
  const params: any = {}
  if (historyPeriod.value) {
    const { year, month } = parsePeriod(historyPeriod.value)
    params.year = year
    params.month = month
  }
  const res = await fixedAssetApi.getDeprHistory(params)
  if (res.code === 0) historyRows.value = res.data
}

function switchTab(tab: string) {
  activeTab.value = tab
  if (tab === 'history') loadHistory()
}

// ── 工作量录入 ──────────────────────────────────────────
const workloadVisible = ref(false)
const workloadSaving = ref(false)
const workloadAssets = ref<any[]>([])
const workloadValues = ref<Record<string, number>>({})

async function openWorkloadDialog() {
  if (!period.value) return ElMessage.warning('请选择期间')
  
  try {
    const { year: y, month: m } = parsePeriod(period.value)
    // 获取工作量法资产列表
    const res = await fixedAssetApi.getCards({ page_size: 999 })
    if (res.code === 0) {
      workloadAssets.value = (res.data.list as any[]).filter(
        (a: any) => a.depr_method === '2' && !a.scrap_date
      )
    }
    // 加载已有的工作量
    const wRes = await fixedAssetApi.getWorkload(y, m)
    if (wRes.code === 0) {
      workloadValues.value = { ...wRes.data }
    }
    // 初始化未录入项
    for (const a of workloadAssets.value) {
      if (!(a.asset_no in workloadValues.value)) {
        workloadValues.value[a.asset_no] = 0
      }
    }
    workloadVisible.value = true
  } catch (e: any) {
    ElMessage.error('加载工作量失败: ' + e.message)
  }
}

async function handleSaveWorkload() {
  workloadSaving.value = true
  try {
    const { year: y, month: m } = parsePeriod(period.value)
    await fixedAssetApi.saveWorkload({ year: y, month: m, workloads: workloadValues.value })
    workloadVisible.value = false
    ElMessage.success('工作量已保存，请重新预览折旧')
  } finally {
    workloadSaving.value = false
  }
}

onMounted(() => {
  baseData.loadAccounts()
  loadHistory()
  checkPriorVoucher()
})
</script>

<style scoped>
.page-asset-depr { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.depr-tabs { flex: 1; display: flex; flex-direction: column; padding: 0 16px; overflow: hidden; }
.depr-tabs :deep(.el-tabs__content) { flex: 1; overflow: hidden; }
.summary-bar { display: flex; gap: 24px; padding: 6px 0 8px; font-size: 13px; }
.summary-bar b { font-weight: 600; }
.total-amt { color: #e6a23c; }
.depr-amt { color: #409eff; font-weight: 600; }
.table-container { display: flex; flex-direction: column; height: 100%; }
.result-banner { padding: 32px 0; }
.voucher-tip { color: #67c23a; font-size: 13px; margin-top: 8px; }
.history-filter { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
.history-total { font-size: 13px; color: var(--el-text-color-secondary); }
.period-summary { margin-bottom: 14px; }
.period-summary-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--el-text-color-regular); }
.workload-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 10px; }
.header-acc-select { display: inline-flex; align-items: center; margin-left: 12px; }
.header-acc-select .tip-label { font-size: 13px; color: var(--el-text-color-regular); margin-right: 4px; }
</style>
