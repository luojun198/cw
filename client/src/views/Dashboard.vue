<template>
  <div class="dashboard">
    <!-- 顶部欢迎横幅 -->
    <div class="welcome-banner">
      <div class="welcome-left">
        <h1 class="welcome-title">工作台</h1>
        <p class="welcome-sub">{{ greeting }}<template v-if="userName">，{{ userName }}</template><template v-if="accountSetName"> · {{ accountSetName }}</template></p>
      </div>
      <div class="welcome-right">
        <div class="period-badge">
          <span class="period-badge-year">{{ currentYear }}</span>
          <span class="period-badge-sep">年</span>
          <span class="period-badge-month">{{ currentPeriod }}</span>
          <span class="period-badge-sep">期</span>
        </div>
      </div>
    </div>

    <!-- 核心指标卡片 -->
    <div class="stat-row">
      <div class="stat-card" v-for="card in statCards" :key="card.label">
        <div class="stat-card-inner">
          <div class="apple-icon" :style="{ background: card.gradient }">
            <el-icon size="24"><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </div>
        <div class="stat-bar" :style="{ background: card.color }"></div>
      </div>
    </div>

    <!-- 快捷操作 + 趋势图 -->
    <div class="main-row">
      <!-- 快捷操作 -->
      <div class="quick-section">
        <div class="section-title">常用功能</div>
        <div class="quick-grid">
          <div class="quick-entry" v-for="q in quickLinks" :key="q.label" @click="handleQuickLink(q)">
            <div class="apple-icon-lg" :style="{ background: q.gradient }">
              <el-icon size="26"><component :is="q.icon" /></el-icon>
            </div>
            <span class="quick-label">{{ q.label }}</span>
          </div>
        </div>
      </div>

      <!-- 趋势图 -->
      <div class="trend-section">
        <div class="section-title">近6个月收支趋势</div>
        <div class="trend-chart">
          <div class="trend-legend">
            <span class="legend-dot" style="background:#1a4b8c"></span>借方
            <span class="legend-dot" style="background:#2e7d32;margin-left:16px"></span>贷方
          </div>
          <div class="bar-group-wrap">
            <div class="bar-group" v-for="item in trend" :key="item.month">
              <div class="bars">
                <div class="bar debit" :style="{ height: barHeight(item.debit) + 'px' }" :title="formatMoney(item.debit)"></div>
                <div class="bar credit" :style="{ height: barHeight(item.credit) + 'px' }" :title="formatMoney(item.credit)"></div>
              </div>
              <div class="bar-label">{{ item.month.slice(5) }}月</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 近期凭证 + 期间进度/科目余额 -->
    <div class="bottom-row">
      <!-- 近期凭证 -->
      <div class="recent-section">
        <div class="section-header-row">
          <div class="section-title">近期凭证</div>
          <el-button type="primary" size="small" round @click="router.push({ path: '/voucher/entry', query: { action: 'add' } })">新增凭证</el-button>
        </div>
        <el-table :data="recentVouchers" stripe size="small" class="recent-table">
          <el-table-column prop="voucherNo" label="凭证号" width="90" />
          <el-table-column prop="voucherDate" label="日期" width="100" />
          <el-table-column prop="abstract" label="摘要" show-overflow-tooltip />
          <el-table-column prop="totalAmount" label="金额" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="72">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)" size="small" round>{{ getStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 期间进度 + 科目余额 -->
      <div class="side-section">
        <!-- 期间进度 -->
        <div class="period-card">
          <div class="section-title">当前期间</div>
          <div class="period-title">{{ currentYear }}年 第{{ currentPeriod }}期</div>
          <el-progress :percentage="periodProgress" :stroke-width="10" status="success" />
          <div class="period-sub">本年已完成 {{ currentPeriod }}/12 期</div>
          <div class="period-stat-row">
            <div class="period-stat">
              <div class="ps-val">{{ stats.voucherCount }}</div>
              <div class="ps-label">本期凭证</div>
            </div>
            <div class="period-stat">
              <div class="ps-val warning">{{ stats.auditPending }}</div>
              <div class="ps-label">待审核</div>
            </div>
          </div>
        </div>

        <!-- 科目余额 Top5 -->
        <div class="top-card">
          <div class="section-title">科目余额 Top 5</div>
          <div class="top-accounts">
            <div class="account-row" v-for="(item, idx) in topAccounts" :key="item.code">
              <span class="rank" :class="'rank-' + (idx+1)">{{ idx+1 }}</span>
              <div class="account-name-wrap">
                <span class="account-code">{{ item.code }}</span>
                <span class="account-name">{{ item.name }}</span>
              </div>
              <span class="account-balance" :class="item.balance < 0 ? 'red' : ''">
                {{ formatMoney(Math.abs(item.balance)) }}
              </span>
            </div>
            <div v-if="!topAccounts.length" class="empty-tip">暂无数据</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Money, Tickets, Wallet, Document, EditPen, CircleCheck, DataAnalysis, TrendCharts, List, Setting } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import request from '@/api/request'

const router = useRouter()
const userStore = useUserStore()
const userName = computed(() => userStore.userInfo?.nickname || userStore.userInfo?.username || '')
const accountSetName = computed(() => userStore.accountSetName || '未选账套')

const stats = ref({ voucherCount: 0, debitTotal: 0, creditTotal: 0, auditPending: 0 })
const recentVouchers = ref<any[]>([])
const trend = ref<{ month: string; debit: number; credit: number }[]>([])
const topAccounts = ref<{ code: string; name: string; balance: number }[]>([])

const now = new Date()
const currentYear = now.getFullYear()
const currentPeriod = now.getMonth() + 1
const periodProgress = Math.round((currentPeriod / 12) * 100)

const greeting = computed(() => {
  const h = now.getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const statCards = computed(() => [
  { label: '本月凭证', value: stats.value.voucherCount, color: '#1a4b8c', gradient: 'linear-gradient(135deg, #1a4b8c, #2e6bc4)', icon: Tickets },
  { label: '本月借方合计', value: formatMoney(stats.value.debitTotal), color: '#2e7d32', gradient: 'linear-gradient(135deg, #2e7d32, #43a047)', icon: Money },
  { label: '本月贷方合计', value: formatMoney(stats.value.creditTotal), color: '#c17b1a', gradient: 'linear-gradient(135deg, #c17b1a, #d49520)', icon: Wallet },
  { label: '待审核凭证', value: stats.value.auditPending, color: '#c0392b', gradient: 'linear-gradient(135deg, #c0392b, #d44637)', icon: Document },
])

const quickLinks = [
  { label: '凭证录入', path: '/voucher/entry', icon: EditPen, gradient: 'linear-gradient(135deg, #1a4b8c, #2e6bc4)', action: 'add' },
  { label: '凭证管理', path: '/voucher/audit', icon: CircleCheck, gradient: 'linear-gradient(135deg, #2e7d32, #43a047)' },
  { label: '余额表', path: '/ledger/balance', icon: DataAnalysis, gradient: 'linear-gradient(135deg, #c17b1a, #d49520)' },
  { label: '资产负债表', path: '/report/run/1', icon: TrendCharts, gradient: 'linear-gradient(135deg, #c0392b, #d44637)' },
  { label: '凭证查询', path: '/voucher/query', icon: List, gradient: 'linear-gradient(135deg, #7b1fa2, #9c27b0)' },
  { label: '系统参数', path: '/system/param', icon: Setting, gradient: 'linear-gradient(135deg, #607d8b, #78909c)' },
]

function handleQuickLink(link: any) {
  if (link.action === 'add') {
    // 凭证录入：直接跳转到凭证录入页面并触发新增
    router.push({ path: link.path, query: { action: 'add' } })
  } else {
    router.push(link.path)
  }
}

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(val || 0)
}

function getStatusType(s: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  return ({ draft: 'info', audited: 'success', posted: 'warning' } as any)[s] || 'info'
}
function getStatusText(s: string) {
  return ({ draft: '草稿', audited: '已审核', posted: '已过账' } as any)[s] || s
}

const trendMax = computed(() => Math.max(...trend.value.flatMap(t => [t.debit, t.credit]), 1))
function barHeight(val: number) {
  return Math.max(4, Math.round((val / trendMax.value) * 120))
}

onMounted(async () => {
  const [s, v, tr, ta] = await Promise.allSettled([
    request.get<any>('/dashboard/stats'),
    request.get<any>('/dashboard/recent-vouchers'),
    request.get<any>('/dashboard/trend'),
    request.get<any>('/dashboard/top-accounts'),
  ])
  if (s.status === 'fulfilled' && s.value.code === 0) Object.assign(stats.value, s.value.data)
  if (v.status === 'fulfilled' && v.value.code === 0) recentVouchers.value = v.value.data
  if (tr.status === 'fulfilled' && tr.value.code === 0) trend.value = tr.value.data
  if (ta.status === 'fulfilled' && ta.value.code === 0) topAccounts.value = ta.value.data
})
</script>

<style scoped>
.dashboard {
  min-height: 100%;
}

/* 欢迎横幅 */
.welcome-banner {
  background: linear-gradient(135deg, #0d2b4e 0%, #1a4b8c 100%);
  border-radius: 10px;
  padding: 20px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  box-shadow: 0 3px 12px rgba(13, 43, 78, 0.25);
}

.welcome-title {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px 0;
  letter-spacing: 1px;
}

.welcome-sub {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
  margin: 0;
}

.period-badge {
  background: rgba(240, 192, 64, 0.15);
  border: 1px solid rgba(240, 192, 64, 0.3);
  border-radius: 8px;
  padding: 8px 16px;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.period-badge-year {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.period-badge-month {
  font-size: 24px;
  font-weight: 700;
  color: #f0c040;
}

.period-badge-sep {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 2px;
}

/* 统计卡片行 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.stat-card-inner {
  display: flex;
  align-items: center;
  padding: 20px;
  gap: 16px;
}

.stat-bar {
  height: 3px;
  width: 100%;
}

/* 苹果风格图标 */
.apple-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

/* 主行：快捷操作 + 趋势图 */
.main-row {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}

/* 快捷操作 */
.quick-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.quick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.quick-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 8px;
  border-radius: 14px;
  background: #f8f9fb;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.quick-entry:hover {
  background: #fff;
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.apple-icon-lg {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.quick-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

/* 趋势图 */
.trend-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.trend-chart {
  padding: 8px 0;
}

.trend-legend {
  font-size: 12px;
  color: #606266;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
}

.bar-group-wrap {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 140px;
  border-bottom: 1px solid #ebeef5;
}

.bar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
}

.bar {
  width: 20px;
  border-radius: 4px 4px 0 0;
  transition: height 0.4s;
}

.bar.debit { background: linear-gradient(180deg, #1a4b8c, #2e6bc4); }
.bar.credit { background: linear-gradient(180deg, #2e7d32, #43a047); }

.bar-label {
  font-size: 11px;
  color: #909399;
  margin-top: 6px;
}

/* 底部行 */
.bottom-row {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
}

/* 近期凭证 */
.recent-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header-row .section-title {
  margin-bottom: 0;
}

/* 侧边区 */
.side-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.period-card,
.top-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 期间进度 */
.period-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 16px;
}

.period-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  margin-bottom: 16px;
}

.period-stat-row {
  display: flex;
  justify-content: space-around;
}

.period-stat {
  text-align: center;
}

.ps-val {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.ps-val.warning {
  color: #e6a23c;
}

.ps-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 科目余额 */
.top-accounts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  background: #c0c4cc;
}

.rank-1 { background: #f56c6c; }
.rank-2 { background: #e6a23c; }
.rank-3 { background: #409eff; }

.account-name-wrap {
  flex: 1;
  min-width: 0;
}

.account-code {
  font-size: 11px;
  color: #909399;
  margin-right: 4px;
}

.account-name {
  font-size: 13px;
  color: #303133;
}

.account-balance {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
  white-space: nowrap;
}

.account-balance.red { color: #f56c6c; }

.empty-tip {
  color: #c0c4cc;
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}
</style>
