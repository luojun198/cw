<template>
  <div class="period-close-page">
    <section class="page-toolbar">
      <div>
        <div class="toolbar-kicker">期间管理</div>
        <h2>期间结账</h2>
        <p>按会计年度查看 12 个期间的结账状态，并执行月结、年度结账和反结账。</p>
      </div>
      <div class="toolbar-actions">
        <el-select v-model="selectedYear" class="year-select" @change="loadOverview(true)">
          <el-option v-for="year in years" :key="year" :label="`${year}年`" :value="year" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="loadOverview(true)">刷新</el-button>
      </div>
    </section>

    <section class="summary-strip">
      <div class="summary-item">
        <span>已结账期间</span>
        <strong>{{ closedCount }}</strong>
      </div>
      <div class="summary-item">
        <span>未结账期间</span>
        <strong>{{ openCount }}</strong>
      </div>
      <div class="summary-item">
        <span>年度结账</span>
        <strong>{{ yearClosed ? '已完成' : '未完成' }}</strong>
      </div>
      <div class="summary-item">
        <span>下一年期初</span>
        <strong>{{ openingBalanceText }}</strong>
      </div>
    </section>

    <el-alert
      class="rule-alert"
      type="info"
      :closable="false"
      show-icon
      title="结账前需完成本期凭证记账；12 月年度结账会生成下一年度第 1 期期初余额。反结账按后进先出执行，年度反结账会撤销下一年度期初余额。"
    />

    <section v-loading="loading" class="period-grid">
      <article
        v-for="month in months"
        :key="month.period"
        class="period-card"
        :class="{ 'is-closed': month.status === 'closed', 'is-year-end': month.period === 12 }"
      >
        <div class="period-card__head">
          <div>
            <span class="period-label">第 {{ month.period }} 期</span>
            <strong>{{ month.period === 12 ? '年度结账' : `${month.period}月月结` }}</strong>
          </div>
          <el-tag :type="month.status === 'closed' ? 'success' : 'info'" effect="plain">
            {{ month.status === 'closed' ? '已结账' : '未结账' }}
          </el-tag>
        </div>

        <div class="period-meta">
          <span>{{ month.closedAt ? `结账时间：${formatDateTime(month.closedAt)}` : '尚未执行结账' }}</span>
          <span v-if="month.period === 12 && overview?.yearEnd">
            已生成 {{ overview.yearEnd.nextYear }} 年期初余额 {{ overview.yearEnd.openingBalanceRowCount }} 条
          </span>
          <span v-else-if="month.period === 12">完成后会生成 {{ selectedYear + 1 }} 年期初余额</span>
        </div>

        <div class="period-actions">
          <el-button
            v-if="month.status !== 'closed'"
            type="primary"
            :icon="Lock"
            :loading="actionKey === getActionKey(month.period, 'close')"
            @click="confirmClose(month.period)"
          >
            {{ month.period === 12 ? '年度结账' : '结账' }}
          </el-button>
          <el-button
            v-else
            type="danger"
            plain
            :icon="Unlock"
            :loading="actionKey === getActionKey(month.period, 'open')"
            @click="confirmOpen(month.period)"
          >
            {{ month.period === 12 ? '年度反结账' : '反结账' }}
          </el-button>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, Refresh, Unlock } from '@element-plus/icons-vue'
import request from '@/api/request'
import { formatDate } from '@/utils/format'

type PeriodStatus = 'open' | 'closed'
type PeriodAction = 'close' | 'open'

interface PeriodMonth {
  period: number
  status: PeriodStatus
  closedAt?: string | null
}

interface PeriodOverview {
  year: number
  months: PeriodMonth[]
  yearEnd?: {
    nextYear: number
    openingBalanceRowCount: number
  }
}

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const years = Array.from({ length: 12 }, (_, index) => currentYear + 1 - index)
const loading = ref(false)
const actionKey = ref('')
const overview = ref<PeriodOverview | null>(null)

const months = computed<PeriodMonth[]>(() => {
  if (overview.value?.months?.length) return overview.value.months
  return Array.from({ length: 12 }, (_, index) => ({
    period: index + 1,
    status: 'open' as PeriodStatus,
  }))
})

const closedCount = computed(() => months.value.filter(month => month.status === 'closed').length)
const openCount = computed(() => months.value.length - closedCount.value)
const yearClosed = computed(() => months.value[11]?.status === 'closed')
const openingBalanceText = computed(() => {
  if (!overview.value?.yearEnd) return '未生成'
  return `${overview.value.yearEnd.openingBalanceRowCount} 条`
})

function getActionKey(period: number, action: PeriodAction) {
  return `${action}:${period}`
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  return formatDate(value, 'YYYY-MM-DD HH:mm')
}

async function loadOverview(showMessage = false) {
  loading.value = true
  try {
    const res = await request.get<PeriodOverview>(`/voucher/periods/${selectedYear.value}/overview`)
    overview.value = res.data
    if (showMessage) {
      ElMessage.success('期间状态已刷新')
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载期间状态失败')
  } finally {
    loading.value = false
  }
}

async function confirmClose(period: number) {
  const isYearEnd = period === 12
  const message = isYearEnd
    ? `${selectedYear.value} 年第 12 期将执行年度结账，并生成 ${selectedYear.value + 1} 年第 1 期期初余额。确认继续吗？`
    : `确认对 ${selectedYear.value} 年第 ${period} 期执行结账吗？`

  try {
    await ElMessageBox.confirm(message, isYearEnd ? '确认年度结账' : '确认结账', {
      confirmButtonText: isYearEnd ? '年度结账' : '结账',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  await runPeriodAction(period, 'close')
}

async function confirmOpen(period: number) {
  const isYearEnd = period === 12
  const message = isYearEnd
    ? `${selectedYear.value} 年度反结账会打开第 12 期，并撤销 ${selectedYear.value + 1} 年第 1 期期初余额；若下一年已有凭证，后端会阻止本次操作。确认继续吗？`
    : `确认对 ${selectedYear.value} 年第 ${period} 期执行反结账吗？若后续期间已结账，后端会阻止本次操作。`

  try {
    await ElMessageBox.confirm(message, isYearEnd ? '确认年度反结账' : '确认反结账', {
      confirmButtonText: isYearEnd ? '年度反结账' : '反结账',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  await runPeriodAction(period, 'open')
}

async function runPeriodAction(period: number, action: PeriodAction) {
  actionKey.value = getActionKey(period, action)
  try {
    const res = await request.post(`/voucher/periods/${selectedYear.value}/${period}/${action}`)
    ElMessage.success(res.message || (action === 'close' ? '结账成功' : '反结账成功'))
    await loadOverview(false)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || (action === 'close' ? '结账失败' : '反结账失败'))
  } finally {
    actionKey.value = ''
  }
}

onMounted(() => {
  loadOverview(false)
})
</script>

<style scoped>
.period-close-page {
  display: grid;
  gap: 14px;
  color: #172033;
}

.page-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid #dbe4ef;
  border-radius: 8px;
  background: #fff;
}

.toolbar-kicker {
  margin-bottom: 5px;
  color: #2f6f92;
  font-size: 12px;
  font-weight: 700;
}

.page-toolbar h2 {
  margin: 0;
  color: #0f172a;
  font-size: 24px;
  font-weight: 760;
}

.page-toolbar p {
  margin: 7px 0 0;
  color: #64748b;
  font-size: 13px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.year-select {
  width: 128px;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-item {
  display: grid;
  gap: 6px;
  min-height: 78px;
  padding: 13px 14px;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #fff;
}

.summary-item span {
  color: #64748b;
  font-size: 12px;
}

.summary-item strong {
  color: #0f172a;
  font-size: 22px;
  font-weight: 780;
}

.rule-alert {
  border-radius: 8px;
}

.period-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-height: 280px;
}

.period-card {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  min-height: 170px;
  padding: 14px;
  border: 1px solid #dce5f0;
  border-radius: 8px;
  background: #fff;
}

.period-card.is-closed {
  border-color: #b8dfc6;
  background: #fbfffc;
}

.period-card.is-year-end {
  border-color: #d6bd7f;
}

.period-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.period-label {
  display: block;
  margin-bottom: 4px;
  color: #64748b;
  font-size: 12px;
}

.period-card__head strong {
  color: #0f172a;
  font-size: 16px;
}

.period-meta {
  display: grid;
  align-content: start;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.period-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1200px) {
  .period-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .page-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions {
    justify-content: flex-start;
    width: 100%;
  }

  .summary-strip,
  .period-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .summary-strip,
  .period-grid {
    grid-template-columns: 1fr;
  }

  .year-select,
  .toolbar-actions .el-button {
    width: 100%;
  }
}
</style>
