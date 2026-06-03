<template>
  <div class="page page-cashier-journal">
    <div class="page-header">
      <h3>出纳单据</h3>
      <div class="filter-row">
        <el-select
          v-model="filters.account_code"
          filterable
          placeholder="选择科目"
          style="width: 220px"
          @change="handleQuery"
        >
          <el-option-group label="现金科目">
            <el-option
              v-for="a in cashAccounts"
              :key="a.code"
              :label="`${a.code} ${a.name}`"
              :value="a.code"
            />
          </el-option-group>
          <el-option-group label="银行存款">
            <el-option
              v-for="a in bankAccounts"
              :key="a.code"
              :label="`${a.code} ${a.name}`"
              :value="a.code"
            />
          </el-option-group>
        </el-select>
        <el-date-picker
          v-model="filters.start_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          style="width: 140px"
        />
        <el-date-picker
          v-model="filters.end_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          style="width: 140px"
        />
        <el-button type="primary" @click="handleQuery">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="openAddDialog">
          <el-icon><Plus /></el-icon>录入
        </el-button>
        <el-button plain @click="showReconcile = true" :disabled="!filters.account_code">
          <el-icon><Connection /></el-icon>银行对账
        </el-button>
        <el-button type="success" plain :disabled="!filters.account_code" :loading="generating" @click="handleGenerateVoucher">
          <el-icon><DocumentAdd /></el-icon>生成凭证
        </el-button>
      </div>
    </div>

    <!-- 期初/期末余额摘要 -->
    <div v-if="journalResult" class="balance-summary">
      <span>期初余额：<b>{{ fmt(journalResult.opening) }}</b></span>
      <span>本期借方：<b class="debit">{{ fmt(journalResult.totalDebit) }}</b></span>
      <span>本期贷方：<b class="credit">{{ fmt(journalResult.totalCredit) }}</b></span>
      <span>期末余额：<b>{{ fmt(journalResult.closing) }}</b></span>
    </div>

    <!-- 日记账表格 -->
    <div ref="tableContainerRef" class="table-container">
      <el-table
        ref="tableRef"
        :data="rows"
        :height="tableHeight"
        border
        stripe
        highlight-current-row
        size="small"
        @row-dblclick="openEditDialog"
      >
        <el-table-column label="日期" prop="biz_date" width="100" />
        <el-table-column label="序号" prop="seq" width="55" align="center" />
        <el-table-column label="摘要" prop="summary" min-width="140" show-overflow-tooltip />
        <el-table-column label="结算方式" prop="settle_type" width="90" />
        <el-table-column label="票据号" prop="bill_no" width="110" show-overflow-tooltip />
        <el-table-column label="对方单位" prop="counter_unit" width="130" show-overflow-tooltip />
        <el-table-column label="对方科目" width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatCounterAccount(row.counter_account) }}
          </template>
        </el-table-column>
        <el-table-column label="借方(收入)" prop="debit" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.debit" class="debit">{{ fmt(row.debit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方(支出)" prop="credit" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.credit" class="credit">{{ fmt(row.credit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="余额" prop="balance" width="120" align="right">
          <template #default="{ row }">{{ fmt(row.balance ?? 0) }}</template>
        </el-table-column>
        <el-table-column label="已对账" width="70" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.reconciled" color="#67c23a"><CircleCheck /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="关联凭证" width="110">
          <template #default="{ row }">
            <span v-if="row.voucher_no">
              {{ row.voucher_year }}-{{ String(row.voucher_month).padStart(2,'0') }} #{{ row.voucher_no }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click.stop="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 录入/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editRow ? '修改日记账' : '录入日记账'" width="580px" draggable>
      <el-form :model="form" label-width="90px" size="small">
        <el-form-item label="日期" required>
          <el-date-picker v-model="form.biz_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" />
        </el-form-item>
        <el-form-item label="借方(收入)">
          <el-input-number v-model="form.debit" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="贷方(支出)">
          <el-input-number v-model="form.credit" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="结算方式">
          <el-select v-model="form.settle_type" clearable style="width:100%">
            <el-option v-for="s in settleTypes" :key="s.code" :label="s.name" :value="s.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="票据号">
          <el-input v-model="form.bill_no" />
        </el-form-item>
        <el-form-item label="对方单位">
          <el-input v-model="form.counter_unit" />
        </el-form-item>
        <el-form-item label="对方科目">
          <el-select
            v-model="form.counter_account"
            filterable
            clearable
            placeholder="输入编码或名称检索"
            style="width:100%"
            popper-class="counter-account-popper"
            :filter-method="onCounterFilter"
            @visible-change="onCounterVisibleChange"
            @change="onCounterAccountChange"
          >
            <el-option
              v-for="a in filteredCounterAccounts"
              :key="a.code"
              :label="`${a.code} ${a.name}`"
              :value="a.isParent ? '' : a.code"
              :disabled="a.isParent"
              :class="{ 'parent-option': a.isParent }"
            />
          </el-select>
        </el-form-item>
        <template v-if="counterAccountAuxCategoryIds.length > 0">
          <el-form-item
            v-for="catId in counterAccountAuxCategoryIds"
            :key="catId"
            :label="getAuxCategoryName(catId)"
          >
            <el-select
              v-model="counterAuxSelections[catId]"
              filterable
              clearable
              placeholder="选择辅助项目（可选）"
              style="width:100%"
              @visible-change="(v: boolean) => v && auxItems.onDropdownOpen(catId)"
            >
              <el-option
                v-for="item in auxItems.getAuxOptions(catId)"
                :key="item.id"
                :label="`${item.code ?? ''} ${item.name}`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item label="开户行">
          <el-input v-model="form.bank_name" />
        </el-form-item>
        <el-form-item label="账号">
          <el-input v-model="form.bank_account" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 银行对账面板 -->
    <el-dialog v-model="showReconcile" title="银行对账" width="520px" draggable>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <el-date-picker v-model="reconDate[0]" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:145px" />
        <el-date-picker v-model="reconDate[1]" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:145px" />
        <el-button type="primary" :loading="reconciling" @click="handleAutoReconcile">自动勾对</el-button>
      </div>
      <el-table :data="unmatched" size="small" border max-height="320">
        <el-table-column label="日期" prop="biz_date" width="100" />
        <el-table-column label="借方" prop="debit" width="110" align="right">
          <template #default="{row}"><span v-if="row.debit">{{ fmt(row.debit) }}</span></template>
        </el-table-column>
        <el-table-column label="贷方" prop="credit" width="110" align="right">
          <template #default="{row}"><span v-if="row.credit">{{ fmt(row.credit) }}</span></template>
        </el-table-column>
        <el-table-column label="票据号" prop="bill_no" min-width="100" show-overflow-tooltip />
        <el-table-column label="状态" width="70" align="center">
          <template #default="{row}">
            <el-tag :type="row.matched ? 'success' : 'info'" size="small">{{ row.matched ? '已对' : '未对' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Connection, CircleCheck, DocumentAdd } from '@element-plus/icons-vue'
import { cashierApi, type JournalRow, type JournalResult, type SettleType, type BankStatement } from '@/api/cashier'
import { useBaseDataStore } from '@/stores/baseData'
import { useFillHeightTable } from '@/composables/useFillHeightTable'
import { useVoucherAuxItems } from '@/composables/useVoucherAuxItems'

const { tableRef, containerRef: tableContainerRef, tableHeight } = useFillHeightTable()
const baseData = useBaseDataStore()
const auxItems = useVoucherAuxItems()

const accounts = ref<{ code: string; name: string; is_cash: number; is_bank: number }[]>([])
const cashAccounts = computed(() => accounts.value.filter(a => a.is_cash))
const bankAccounts = computed(() => accounts.value.filter(a => a.is_bank && !a.is_cash))
const settleTypes = ref<SettleType[]>([])
const journalResult = ref<JournalResult | null>(null)
const rows = computed(() => journalResult.value?.rows ?? [])

const firstDay = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
const lastDayStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
const filters = ref({ account_code: '', start_date: firstDay, end_date: lastDayStr })

const dialogVisible = ref(false)
const editRow = ref<JournalRow | null>(null)
const saving = ref(false)
const form = ref<Partial<JournalRow>>({})
const counterAuxSelections = ref<Record<string, string>>({})

/** 对方科目启用的辅助核算类别 ID 列表 */
const counterAccountAuxCategoryIds = computed((): string[] => {
  const code = form.value.counter_account
  if (!code) return []
  const acc = (baseData.accounts as any[]).find(a => a.code === code)
  if (!acc?.is_aux || !acc?.aux_types) return []
  try {
    const parsed = typeof acc.aux_types === 'string' ? JSON.parse(acc.aux_types) : acc.aux_types
    if (Array.isArray(parsed)) return parsed as string[]
    if (parsed && typeof parsed === 'object') return Object.keys(parsed)
  } catch { /* ignore */ }
  return []
})

const auxCategoryMap = computed(() => {
  const map = new Map<string, string>()
  for (const cat of baseData.auxCategories) map.set(String(cat.id), cat.name)
  return map
})
function getAuxCategoryName(catId: string) {
  return auxCategoryMap.value.get(catId) || '辅助项目'
}

async function onCounterAccountChange(_code: string | undefined) {
  counterAuxSelections.value = {}
  const catIds = counterAccountAuxCategoryIds.value
  for (const catId of catIds) {
    await auxItems.onDropdownOpen(catId)
  }
}

/** 对方科目候选：全部启用科目，父科目标记不可选（虚拟上级） */
const counterAccounts = computed(() => {
  const all = baseData.accounts
  if (!all.length) return [] as { code: string; name: string; isParent: boolean }[]
  const parentIds = new Set(all.filter(a => a.parent_id).map(a => String(a.parent_id)))
  return all
    .filter(a => a.is_enabled !== 0)
    .map(a => ({
      code: a.code,
      name: a.name,
      isParent: parentIds.has(String(a.id)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
})

const counterFilter = ref('')
const filteredCounterAccounts = computed(() => {
  const q = counterFilter.value.trim().toLowerCase()
  if (!q) return counterAccounts.value
  // 匹配末级 + 其父科目（父科目始终跟在匹配的末级前）
  const matched = counterAccounts.value.filter(
    a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  )
  // 对于匹配到的末级科目，把它们的直接父级也带出来
  if (q) {
    const ids = new Set(matched.map(a => a.code))
    for (const a of matched) {
      if (!a.isParent) {
        const parent = counterAccounts.value.find(
          p => p.isParent && a.code.startsWith(p.code) && a.code !== p.code
        )
        if (parent && !ids.has(parent.code)) {
          matched.unshift(parent)
          ids.add(parent.code)
        }
      }
    }
  }
  return matched
})
function onCounterFilter(val: string) { counterFilter.value = val }
function onCounterVisibleChange(visible: boolean) { if (!visible) counterFilter.value = '' }

const counterAccountMap = computed(() => {
  const map = new Map<string, string>()
  for (const a of counterAccounts.value) map.set(a.code, a.name || '')
  return map
})
function formatCounterAccount(code: string | null) {
  if (!code) return ''
  const name = counterAccountMap.value.get(code)
  return name ? `${code} ${name}` : code
}

const showReconcile = ref(false)
const reconciling = ref(false)
const generating = ref(false)
const reconDate = ref<string[]>(['', ''])
const unmatched = ref<BankStatement[]>([])

const now = new Date()
const fmt = (v: number) =>
  v === 0 ? '' : v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

onMounted(async () => {
  const [acRes, stRes] = await Promise.all([
    cashierApi.getAccounts(),
    cashierApi.getSettleTypes(),
    baseData.loadAccounts(),
    baseData.loadAuxCategories(),
  ])
  if (acRes.code === 0) accounts.value = acRes.data
  if (stRes.code === 0) settleTypes.value = stRes.data
  if (accounts.value.length) {
    filters.value.account_code = accounts.value[0].code
    handleQuery()
  }
})

async function handleQuery() {
  if (!filters.value.account_code) return
  const res = await cashierApi.getJournal({
    account_code: filters.value.account_code,
    start_date: filters.value.start_date || undefined,
    end_date: filters.value.end_date || undefined,
  })
  if (res.code === 0) journalResult.value = res.data
}

function openAddDialog() {
  editRow.value = null
  form.value = { biz_date: new Date().toISOString().slice(0, 10), debit: 0, credit: 0 }
  counterAuxSelections.value = {}
  dialogVisible.value = true
}

function openEditDialog(row: JournalRow) {
  editRow.value = row
  form.value = { ...row }
  counterAuxSelections.value = {}
  if (row.counter_aux_item_id) {
    try { Object.assign(counterAuxSelections.value, JSON.parse(row.counter_aux_item_id)) } catch { /* ignore */ }
  }
  dialogVisible.value = true
  if (row.counter_account) {
    nextTick(async () => {
      for (const catId of counterAccountAuxCategoryIds.value) {
        await auxItems.onDropdownOpen(catId)
      }
    })
  }
}

async function handleSave() {
  if (!form.value.biz_date) return ElMessage.warning('请填写日期')
  const selected = Object.fromEntries(Object.entries(counterAuxSelections.value).filter(([, v]) => v))
  const counter_aux_item_id = Object.keys(selected).length > 0 ? JSON.stringify(selected) : null
  saving.value = true
  try {
    if (editRow.value) {
      await cashierApi.updateJournal(editRow.value.id, { ...form.value, counter_aux_item_id })
    } else {
      await cashierApi.createJournal({ ...form.value, account_code: filters.value.account_code, counter_aux_item_id })
    }
    dialogVisible.value = false
    handleQuery()
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确认删除该条记录？', '提示', { type: 'warning' })
  await cashierApi.deleteJournal(id)
  handleQuery()
}

async function loadUnmatched() {
  const res = await cashierApi.getBankStatements({
    account_code: filters.value.account_code,
    start_date: reconDate.value[0] || undefined,
    end_date: reconDate.value[1] || undefined,
  })
  if (res.code === 0) unmatched.value = res.data
}

async function handleAutoReconcile() {
  reconciling.value = true
  try {
    const res = await cashierApi.autoReconcile({
      account_code: filters.value.account_code,
      start_date: reconDate.value[0] || undefined,
      end_date: reconDate.value[1] || undefined,
    })
    if (res.code === 0) {
      ElMessage.success(`自动勾对完成，匹配 ${res.data.matched} 条`)
      await Promise.all([loadUnmatched(), handleQuery()])

async function handleGenerateVoucher() {
  // 当前会计期间（当年当月）
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const start = `${y}-${String(m).padStart(2,'0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`

  try {
    await ElMessageBox.confirm(
      `将当前会计期间（${start} 至 ${end}）已对账的出纳记录生成为会计凭证，确定继续？`,
      '生成凭证', { type: 'info' }
    )
  } catch { return }
  generating.value = true
  try {
    const res = await cashierApi.generateVoucher({
      account_code: filters.value.account_code,
      start_date: start,
      end_date: end,
    })
    if (res.code === 0) {
      ElMessage.success(`凭证 ${res.data.voucherNo} 已生成，同步 ${res.data.syncedCount} 条记录`)
      handleQuery()
    }
  } finally { generating.value = false }
}
    }
  } finally {
    reconciling.value = false
  }
}

// 打开对账面板时加载对账单
watch(showReconcile, v => { if (v) loadUnmatched() })
</script>

<style scoped>
.page-cashier-journal { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.balance-summary { display: flex; gap: 24px; padding: 6px 16px; background: var(--el-fill-color-lighter); font-size: 13px; }
.balance-summary b { font-weight: 600; }
.debit { color: #409eff; }
.credit { color: #f56c6c; }
.table-container { flex: 1; overflow: hidden; padding: 0 16px 8px; }
:deep(.parent-option) { color: #c0c4cc; font-style: italic; }
</style>

<style>
/* 对方科目下拉：键盘+鼠标焦点深蓝色（非 scoped，因 el-select popper teleport 到 body，scoped 无效） */
.counter-account-popper .el-select-dropdown__item.selected:not(.is-disabled),
.counter-account-popper .el-select-dropdown__item.is-hovering:not(.is-disabled),
.counter-account-popper .el-select-dropdown__item:hover:not(.is-disabled) {
  background-color: #1d4ed8 !important;
  color: #fff;
}
.counter-account-popper .el-select-dropdown__item.selected .parent-option,
.counter-account-popper .el-select-dropdown__item.is-hovering .parent-option,
.counter-account-popper .el-select-dropdown__item:hover .parent-option {
  color: #93c5fd;
}
</style>
