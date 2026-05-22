<template>
  <div class="dashboard apple-dashboard">
    <!-- 登录安全提示卡片 -->
    <transition name="security-notice">
      <div v-if="loginSecurityNotice.visible" class="security-notice">
        <div class="security-notice__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <div class="security-notice__content">
          <div class="security-notice__title">欢迎回来，请确认上次登录信息</div>
          <div class="security-notice__info">
            <span>上次登录：{{ loginSecurityNotice.time }}</span>
            <span>IP：{{ loginSecurityNotice.ip }}</span>
          </div>
        </div>
        <button class="security-notice__close" @click="hideLastLoginNotice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </transition>

    <!-- Hero 区域 - 苹果风格毛玻璃效果 -->
    <section class="hero-section">
      <div class="hero-bg">
        <div class="hero-gradient"></div>
        <div class="hero-pattern"></div>
      </div>
      <div class="hero-content">
        <div class="hero-header">
          <div class="hero-eyebrow">
            <span class="eyebrow-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.77-1.58C7.53 15.9 9.68 15 12 15s4.47.9 6.23 2.19c.49.38.77.96.77 1.58V19z"/>
              </svg>
            </span>
            财务驾驶舱 · 行政事业专版
          </div>
          <h1 class="hero-title">{{ greeting }}</h1>
          <p class="hero-subtitle">{{ currentDateTimeText }}</p>
          <div class="hero-context">
            <div class="context-item">
              <span class="context-label">当前账套</span>
              <span class="context-value">{{ accountSetName }}</span>
            </div>
            <div class="context-item">
              <span class="context-label">当前用户</span>
              <span class="context-value">{{ userName || '未识别' }}</span>
            </div>
            <div class="context-item">
              <span class="context-label">会计区间</span>
              <span class="context-value">{{ currentYear }} 年第 {{ currentPeriod }} 期</span>
            </div>
          </div>
        </div>
        <div class="hero-shortcuts">
          <button v-for="item in heroShortcuts" :key="item.label" class="shortcut-card" @click="router.push(item.path)">
            <div class="shortcut-icon" :style="{ background: item.bg }">
              <el-icon><component :is="item.icon" /></el-icon>
            </div>
            <div class="shortcut-content">
              <span class="shortcut-label">{{ item.label }}</span>
              <span class="shortcut-desc">{{ item.desc }}</span>
            </div>
            <svg class="shortcut-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <!-- 统计指标卡片 - 苹果风格 -->
    <section class="metrics-section">
      <div class="metrics-grid">
        <button v-for="card in statCards" :key="card.label" class="metric-card" @click="goMetric(card.path)">
          <div class="metric-icon" :style="{ background: card.bg, color: card.color }">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-content">
            <span class="metric-label">{{ card.label }}</span>
            <span class="metric-value">{{ card.value }}</span>
            <span class="metric-hint">{{ card.hint }}</span>
          </div>
          <div class="metric-badge" v-if="card.badge">{{ card.badge }}</div>
        </button>
      </div>
    </section>

    <!-- 主内容区域 -->
    <section class="content-section">
      <!-- 趋势分析 -->
      <div class="content-panel panel-trend">
        <div class="panel-header">
          <div class="panel-title">
            <div class="panel-icon trend-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.4-2.4-4.3 4.3"/>
              </svg>
            </div>
            <div><span class="panel-eyebrow">趋势分析</span><h3>近 6 期收支与结余</h3></div>
          </div>
          <div class="chart-legend">
            <span class="legend-item"><i class="legend-dot income"></i>收入</span>
            <span class="legend-item"><i class="legend-dot expense"></i>支出</span>
            <span class="legend-item"><i class="legend-dot surplus"></i>结余</span>
          </div>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>

      <!-- 待办风险 -->
      <div class="content-panel panel-todo">
        <div class="panel-header">
          <div class="panel-title">
            <div class="panel-icon todo-icon" :class="{ 'has-warning': riskSummaryCount > 0 }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div><span class="panel-eyebrow">待办风险</span><h3>处理提醒</h3></div>
          </div>
          <span class="risk-badge" :class="riskSummaryType">{{ riskSummaryText }}</span>
        </div>
        <div class="risk-list">
          <div v-for="item in insights.riskItems" :key="item.key" class="risk-item" :class="`risk-${item.level}`">
            <span class="risk-status"></span>
            <span class="risk-name">{{ item.title }}</span>
            <span class="risk-count">{{ item.count }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部三栏 -->
    <section class="bottom-section">
      <!-- 近期凭证 -->
      <div class="content-panel panel-recent">
        <div class="panel-header">
          <div class="panel-title">
            <div class="panel-icon recent-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div><span class="panel-eyebrow">业务流水</span><h3>近期凭证</h3></div>
          </div>
          <button class="view-all-btn" @click="router.push('/voucher/query')">
            查看全部<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div class="voucher-list">
          <button v-for="row in recentVouchers" :key="row.id" class="voucher-item" @click="router.push('/voucher/query')">
            <div class="voucher-main">
              <span class="voucher-date">{{ formatShortDate(row.voucherDate) }}</span>
              <span class="voucher-no">{{ row.voucherNo }}</span>
              <span class="voucher-abstract" v-if="row.abstract">{{ row.abstract }}</span>
            </div>
            <div class="voucher-meta">
              <span class="voucher-status" :class="row.status">{{ getStatusText(row.status) }}</span>
              <span class="voucher-amount">{{ formatMoney(row.totalAmount) }}</span>
            </div>
          </button>
          <div v-if="!recentVouchers.length" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>暂无近期凭证</span>
          </div>
        </div>
      </div>

      <!-- 现金银行结构 -->
      <div class="content-panel panel-cash">
        <div class="panel-header">
          <div class="panel-title">
            <div class="panel-icon cash-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div><span class="panel-eyebrow">资金洞察</span><h3>现金银行结构</h3></div>
          </div>
        </div>
        <div class="cash-structure">
          <div v-for="item in cashStructureWithRatio" :key="item.name" class="cash-group">
            <div class="cash-header">
              <span class="cash-name">{{ item.name }}</span>
              <span class="cash-total">{{ formatMoney(item.balance) }}</span>
            </div>
            <div class="cash-body">
              <div class="cash-pie-wrap">
                <div :ref="el => setCashPieRef(el, item.name)" class="cash-pie"></div>
              </div>
              <div class="cash-children">
                <div v-for="child in item.children" :key="child.code" class="cash-row">
                  <span class="cash-row-name">
                    <i class="cash-row-dot" :style="{ background: child.color }"></i>
                    <span :title="`${child.code} ${child.name}`">{{ child.code }} {{ child.name }}</span>
                  </span>
                  <span class="cash-row-value" :class="{ negative: child.balance < 0 }">
                    <strong>{{ formatMoney(child.balance) }}</strong>
                    <em>{{ formatSignedPercent(child.ratio) }}</em>
                  </span>
                </div>
                <div v-if="!item.children.length" class="cash-empty">暂无{{ item.name }}子科目</div>
              </div>
            </div>
          </div>
          <div v-if="!cashStructureWithRatio.length" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>暂无现金/银行数据</span>
          </div>
        </div>
      </div>

      <!-- 科目活跃度 -->
      <div class="content-panel panel-activity">
        <div class="panel-header">
          <div class="panel-title">
            <div class="panel-icon activity-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
              </svg>
            </div>
            <div><span class="panel-eyebrow">科目活跃度</span><h3>本期发生额 Top 5</h3></div>
          </div>
        </div>
        <div class="activity-list">
          <div v-for="item in activityTopWithRatio" :key="item.code" class="activity-item">
            <div class="activity-header">
              <span class="activity-name">{{ item.code }} {{ item.name }}</span>
              <span class="activity-amount">{{ formatMoney(item.amount) }}</span>
            </div>
            <div class="activity-bar">
              <span class="activity-bar-fill" :style="{ width: `${item.ratio}%` }"></span>
            </div>
          </div>
          <div v-if="!activityTopWithRatio.length" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
            </svg>
            <span>暂无本期发生额数据</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部装饰 -->
    <div class="footer-decoration">
      <div class="footer-pattern"></div>
      <div class="footer-text">
        <span class="footer-brand">RCsoft</span>
        <span class="footer-divider">|</span>
        <span class="footer-edition">行政事业财务管理专版</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CircleCheck, DataAnalysis, Document, EditPen, List, Money, Tickets, Wallet } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useUserStore } from '@/stores/user'
import request from '@/api/request'
import { formatAmount } from '@/utils/format'

interface TrendItem { month: string; income: number; expense: number }
interface RiskItem { key: string; title: string; count: number; level: 'normal' | 'warning' | 'danger'; actionPath: string }
interface CashStructureItem { name: string; balance: number; children: Array<{ code: string; name: string; balance: number }> }
interface CashStructureDisplayItem extends CashStructureItem { totalAbs: number; palette: string[]; children: Array<{ code: string; name: string; balance: number; ratio: number; absRatio: number; color: string }> }
interface ActivityTopItem { code: string; name: string; amount: number }

const router = useRouter()
const userStore = useUserStore()
const userName = computed(() => userStore.userInfo?.nickname || userStore.userInfo?.username || '')
const accountSetName = computed(() => userStore.accountSetName || '未选账套')

const stats = ref({ currentYear: 0, currentPeriod: 0, voucherCount: 0, unpostedVoucherCount: 0, pendingVoucherCount: 0, auditPending: 0, cashBalance: 0, monthlyIncome: 0, monthlyExpense: 0, monthlySurplus: 0 })
const recentVouchers = ref<any[]>([])
const trend = ref<TrendItem[]>([])
const insights = ref({ riskItems: [] as RiskItem[], cashStructure: [] as CashStructureItem[], activityTop: [] as ActivityTopItem[] })
const loginSecurityNotice = ref({ visible: false, time: '', ip: '' })
let loginSecurityNoticeTimer: ReturnType<typeof window.setTimeout> | null = null
let clockTimer: ReturnType<typeof window.setInterval> | null = null

const trendChartRef = ref<HTMLElement>()
const cashPieRefs = new Map<string, HTMLElement>()
let trendChart: echarts.ECharts | null = null
const cashPieCharts = new Map<string, echarts.ECharts>()

const currentTime = ref(new Date())
const currentYear = computed(() => stats.value.currentYear || currentTime.value.getFullYear())
const currentPeriod = computed(() => stats.value.currentPeriod || currentTime.value.getMonth() + 1)

const greeting = computed(() => {
  const h = currentTime.value.getHours()
  if (h < 6) return '夜深了，注意休息'
  if (h < 9) return '早上好，新的一天开始了'
  if (h < 12) return '上午好，工作顺利'
  if (h < 14) return '中午好，记得休息'
  if (h < 18) return '下午好，继续加油'
  if (h < 22) return '晚上好，辛苦了'
  return '夜深了，注意休息'
})

const currentDateTimeText = computed(() => {
  const date = currentTime.value
  const pad = (v: number) => String(v).padStart(2, '0')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

const statCards = computed(() => [
  { label: '本月凭证', value: stats.value.voucherCount, hint: `${currentYear.value} 年第 ${currentPeriod.value} 期`, color: '#007AFF', bg: 'rgba(0, 122, 255, 0.12)', icon: Tickets, path: '/voucher/query' },
  { label: '未记账凭证', value: stats.value.unpostedVoucherCount, hint: '草稿 + 已审核', color: '#FF3B30', bg: 'rgba(255, 59, 48, 0.12)', icon: Document, path: '/voucher/audit', badge: stats.value.unpostedVoucherCount > 0 ? `${stats.value.unpostedVoucherCount}` : undefined },
  { label: '货币资金', value: formatMoney(stats.value.cashBalance), hint: '现金与银行余额', color: '#34C759', bg: 'rgba(52, 199, 89, 0.12)', icon: Wallet, path: '/ledger/cash-journal' },
  { label: '本月收入', value: formatMoney(stats.value.monthlyIncome), hint: '收入类发生额', color: '#5856D6', bg: 'rgba(88, 86, 214, 0.12)', icon: Money, path: '/ledger/detail' },
  { label: '本月支出', value: formatMoney(stats.value.monthlyExpense), hint: '支出费用发生额', color: '#FF9500', bg: 'rgba(255, 149, 0, 0.12)', icon: DataAnalysis, path: '/ledger/detail' },
  { label: '本月结余', value: formatMoney(stats.value.monthlySurplus), hint: stats.value.monthlySurplus >= 0 ? '收支结余为正' : '支出大于收入', color: stats.value.monthlySurplus >= 0 ? '#34C759' : '#FF3B30', bg: stats.value.monthlySurplus >= 0 ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 59, 48, 0.12)', icon: CircleCheck, path: '/report/run/2' },
])

const cashStructure = computed(() => insights.value.cashStructure)
const cashStructureWithRatio = computed<CashStructureDisplayItem[]>(() => {
  const palettes = [['#007AFF', '#5856D6', '#34C759', '#FF9500', '#FF3B30', '#AF52DE'], ['#5856D6', '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE']]
  return cashStructure.value.map((group, gi) => {
    const palette = palettes[gi % palettes.length]
    const totalAbs = group.children.reduce((s, c) => s + Math.abs(c.balance || 0), 0)
    return { ...group, totalAbs, palette, children: group.children.map((c, ci) => ({ ...c, ratio: totalAbs > 0 ? (c.balance || 0) / totalAbs : 0, absRatio: totalAbs > 0 ? Math.abs(c.balance || 0) / totalAbs : 0, color: palette[ci % palette.length] })) }
  })
})

const activityTopWithRatio = computed(() => {
  const max = Math.max(...insights.value.activityTop.map(i => Math.abs(i.amount)), 1)
  return insights.value.activityTop.map(i => ({ ...i, ratio: Math.round((Math.abs(i.amount) / max) * 100) }))
})

const riskSummaryCount = computed(() => insights.value.riskItems.filter(i => i.count > 0).length)
const riskSummaryType = computed(() => riskSummaryCount.value > 0 ? 'warning' : 'success')
const riskSummaryText = computed(() => riskSummaryCount.value > 0 ? `${riskSummaryCount.value} 项需关注` : '运行平稳')

const heroShortcuts = [
  { label: '凭证录入', desc: '新增凭证', path: '/voucher/entry?action=add', icon: EditPen, color: '#007AFF', bg: 'rgba(0, 122, 255, 0.15)' },
  { label: '凭证管理', desc: '审核与记账', path: '/voucher/audit', icon: CircleCheck, color: '#34C759', bg: 'rgba(52, 199, 89, 0.15)' },
  { label: '余额表', desc: '打开科目余额表', path: '/ledger/general', icon: DataAnalysis, color: '#FF9500', bg: 'rgba(255, 149, 0, 0.15)' },
  { label: '日记账', desc: '现金银行流水', path: '/ledger/cash-journal', icon: List, color: '#5856D6', bg: 'rgba(88, 86, 214, 0.15)' },
]

function goMetric(path?: string) { if (path) router.push(path) }
function formatMoney(val: number) { return '¥' + formatAmount(val || 0) }
function formatSignedPercent(v: number) { if (!v) return '0%'; const a = `${Math.round(Math.abs(v) * 1000) / 10}%`; return v < 0 ? `-${a}` : a }
function setCashPieRef(el: Element | null, name: string) { if (el instanceof HTMLElement) cashPieRefs.set(name, el); else cashPieRefs.delete(name) }
function formatShortDate(d?: string) { return d ? d.slice(5) : '--' }
function getStatusText(s: string) { return ({ draft: '草稿', audited: '已审核', posted: '已记账' } as any)[s] || s }

function showLastLoginNotice() {
  const raw = sessionStorage.getItem('lastLoginNotice')
  if (!raw) return
  sessionStorage.removeItem('lastLoginNotice')
  try {
    const data = JSON.parse(raw)
    loginSecurityNotice.value = { visible: true, time: data.lastLoginTime || '无记录', ip: data.lastLoginIp || '无记录' }
    if (loginSecurityNoticeTimer) window.clearTimeout(loginSecurityNoticeTimer)
    loginSecurityNoticeTimer = window.setTimeout(() => { loginSecurityNotice.value.visible = false }, 5000)
  } catch { sessionStorage.removeItem('lastLoginNotice') }
}

function hideLastLoginNotice() {
  loginSecurityNotice.value.visible = false
  if (loginSecurityNoticeTimer) { window.clearTimeout(loginSecurityNoticeTimer); loginSecurityNoticeTimer = null }
}

function renderTrendChart() {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)
  trendChart.setOption({
    color: ['#34C759', '#FF9500', '#007AFF'],
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderRadius: 12, padding: [12, 16], textStyle: { color: '#1d1d1f', fontSize: 13 }, formatter: (p: any) => p.map((i: any) => `${i.marker}${i.seriesName}：${formatMoney(i.value)}`).join('<br/>') },
    grid: { left: 48, right: 24, top: 48, bottom: 32 },
    xAxis: { type: 'category', data: trend.value.map(i => i.month.slice(5) + '期'), axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } }, axisLabel: { color: '#86868b', fontSize: 12 }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#86868b', fontSize: 12, formatter: (v: number) => `${Math.round(v / 10000)}万` }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } }, axisTick: { show: false }, axisLine: { show: false } },
    series: [
      { name: '收入', type: 'bar', data: trend.value.map(i => i.income), barWidth: 20, itemStyle: { borderRadius: [8, 8, 0, 0] } },
      { name: '支出', type: 'bar', data: trend.value.map(i => i.expense), barWidth: 20, itemStyle: { borderRadius: [8, 8, 0, 0] } },
      { name: '结余', type: 'line', data: trend.value.map(i => i.income - i.expense), smooth: true, symbolSize: 8, lineStyle: { width: 3 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(0,122,255,0.15)' }, { offset: 1, color: 'rgba(0,122,255,0)' }]) } },
    ],
  })
}

function renderCashPieCharts() {
  cashStructureWithRatio.value.forEach(group => {
    const el = cashPieRefs.get(group.name)
    if (!el) return
    let chart = cashPieCharts.get(group.name)
    if (!chart) { chart = echarts.init(el); cashPieCharts.set(group.name, chart) }
    const data = group.children.filter(c => Math.abs(c.balance) > 0).map(c => ({ name: `${c.code} ${c.name}`, value: Math.abs(c.balance), rawBalance: c.balance, signedRatio: c.ratio, itemStyle: { color: c.color } }))
    chart.setOption({
      color: group.palette,
      tooltip: { trigger: 'item', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderRadius: 12, padding: [10, 14], textStyle: { color: '#1d1d1f', fontSize: 12 }, formatter: (p: any) => `${p.name}<br/>${formatMoney(p.data?.rawBalance || 0)} · ${formatSignedPercent(p.data?.signedRatio || 0)}` },
      title: { text: group.name, subtext: formatMoney(group.balance), left: 'center', top: 'center', textStyle: { color: '#1d1d1f', fontSize: 13, fontWeight: 600 }, subtextStyle: { color: '#86868b', fontSize: 11, fontWeight: 500 }, itemGap: 4 },
      series: [{ type: 'pie', radius: ['60%', '80%'], center: ['50%', '50%'], minAngle: 6, avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 8 }, emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.15)' } }, data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#f5f5f7' } }] }],
    })
  })
}

function resizeCharts() { trendChart?.resize(); cashPieCharts.forEach(c => c.resize()) }

async function loadDashboard() {
  const [s, v, tr, insight] = await Promise.allSettled([request.get<any>('/dashboard/stats'), request.get<any>('/dashboard/recent-vouchers'), request.get<any>('/dashboard/trend'), request.get<any>('/dashboard/insights')])
  if (s.status === 'fulfilled' && s.value.code === 0) Object.assign(stats.value, s.value.data)
  if (v.status === 'fulfilled' && v.value.code === 0) recentVouchers.value = v.value.data
  if (tr.status === 'fulfilled' && tr.value.code === 0) trend.value = tr.value.data
  if (insight.status === 'fulfilled' && insight.value.code === 0) insights.value = { riskItems: insight.value.data?.riskItems || [], cashStructure: insight.value.data?.cashStructure || [], activityTop: insight.value.data?.activityTop || insight.value.data?.expenseTop || [] }
  await nextTick(); renderTrendChart(); renderCashPieCharts()
}

onMounted(async () => {
  clockTimer = window.setInterval(() => { currentTime.value = new Date() }, 30000)
  showLastLoginNotice()
  await loadDashboard()
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null }
  window.removeEventListener('resize', resizeCharts)
  trendChart?.dispose()
  cashPieCharts.forEach(c => c.dispose())
  cashPieCharts.clear()
})

watch([trend, cashStructureWithRatio], async () => { await nextTick(); renderTrendChart(); renderCashPieCharts() })
</script>

<style scoped>
@import './Dashboard.styles.css';
</style>
