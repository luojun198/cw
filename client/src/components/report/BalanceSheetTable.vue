<template>
  <el-card v-if="reportData" class="report-card">
    <div class="report-title-area">
      <h2 class="report-title">资产负债表</h2>
      <p class="report-subtitle">{{ reportData.reportDate }}</p>
    </div>

    <table class="bs-table">
      <thead>
        <tr>
          <th class="col-name">资产</th>
          <th class="col-num">行次</th>
          <th class="col-amt">期末余额</th>
          <th class="col-amt">年初余额</th>
          <th class="col-name">负债和净资产</th>
          <th class="col-num">行次</th>
          <th class="col-amt">期末余额</th>
          <th class="col-amt">年初余额</th>
        </tr>
      </thead>
      <tbody>
        <!-- 资产：流动资产 -->
        <tr class="section-header">
          <td colspan="8"><strong>一、流动资产</strong></td>
        </tr>
        <tr v-for="item in assetItemsByGroup['流动资产']" :key="item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 资产：非流动资产 -->
        <tr class="section-header">
          <td colspan="8"><strong>二、非流动资产</strong></td>
        </tr>
        <tr v-for="item in assetItemsByGroup['非流动资产']" :key="item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 固定资产净值 -->
        <tr v-if="netValueItems['固定资产'].length" class="section-header">
          <td colspan="8"><strong>固定资产净值</strong></td>
        </tr>
        <tr v-for="item in netValueItems['固定资产']" :key="item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 无形资产净值 -->
        <tr v-if="netValueItems['无形资产'].length" class="section-header">
          <td colspan="8"><strong>无形资产净值</strong></td>
        </tr>
        <tr v-for="item in netValueItems['无形资产']" :key="item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 公共基础设施净值 -->
        <tr v-if="netValueItems['公共基础设施'].length" class="section-header">
          <td colspan="8"><strong>公共基础设施净值</strong></td>
        </tr>
        <tr v-for="item in netValueItems['公共基础设施']" :key="item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 其他非流动资产 -->
        <tr v-for="item in assetItemsByGroup['其他非流动资产']" :key="item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 资产总计 -->
        <tr class="total-row">
          <td>资产总计</td>
          <td></td>
          <td class="amount">{{ fmt(reportData.totalAssets) }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 负债部分 -->
        <tr class="section-header">
          <td colspan="8"><strong>负债：</strong></td>
        </tr>
        <tr class="section-header">
          <td colspan="4"><strong>（一）流动负债</strong></td>
          <td colspan="4"><strong>（二）非流动负债</strong></td>
        </tr>
        <tr
          v-for="item in liabilityItems.filter(i => i.type === '流动负债')"
          :key="'l' + item.code"
          class="data-row"
        >
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr
          v-for="item in liabilityItems.filter(i => i.type === '非流动负债')"
          :key="'n' + item.code"
          class="data-row"
        >
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
        </tr>

        <!-- 负债合计 -->
        <tr class="subtotal-row">
          <td><strong>负债合计</strong></td>
          <td></td>
          <td class="amount">
            <strong>{{ fmt(reportData.totalLiabilities) }}</strong>
          </td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 净资产部分 -->
        <tr class="section-header">
          <td colspan="8"><strong>净资产：</strong></td>
        </tr>
        <tr v-for="item in equityItems" :key="'e' + item.code" class="data-row">
          <td class="account-name">{{ item.name }}</td>
          <td class="line-num">{{ item.num }}</td>
          <td class="amount">{{ item.formatted }}</td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 净资产合计 -->
        <tr class="subtotal-row">
          <td><strong>净资产合计</strong></td>
          <td></td>
          <td class="amount">
            <strong>{{ fmt(reportData.totalEquity) }}</strong>
          </td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>

        <!-- 负债和净资产总计 -->
        <tr class="total-row">
          <td><strong>负债和净资产总计</strong></td>
          <td></td>
          <td class="amount">
            <strong>{{ fmt(reportData.totalLiabilitiesAndEquity) }}</strong>
          </td>
          <td class="amount">—</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <!-- 备抵科目提示 -->
    <div v-if="deductionTotal > 0" class="deduction-info">
      <el-icon><InfoFilled /></el-icon>
      备抵科目已从相关资产原值中扣除：
      <span v-for="(val, code) in deductions" :key="code">
        {{ deductionNames[code] || code }} {{ fmt(val) }}
      </span>
      合计扣减 {{ fmt(deductionTotal) }}
    </div>

    <!-- 平衡校验 -->
    <div class="report-check">
      <el-tag :type="reportData.balanced ? 'success' : 'danger'" size="large">
        {{
          reportData.balanced
            ? '√ 报表平衡（资产 = 负债 + 净资产）'
            : '✗ 报表不平衡！差异: ' +
              fmt(Math.abs(reportData.totalAssets - reportData.totalLiabilitiesAndEquity))
        }}
      </el-tag>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { InfoFilled } from '@element-plus/icons-vue'
import { formatAmount, deductionNames } from '@/composables/useBalanceSheetData'

interface Props {
  reportData: any
  assetItemsByGroup: Record<string, any[]>
  netValueItems: Record<string, any[]>
  liabilityItems: any[]
  equityItems: any[]
  deductions: Record<string, number>
  deductionTotal: number
}

defineProps<Props>()

function fmt(val: number | null | undefined): string {
  return formatAmount(val)
}
</script>

<style scoped>
.report-card {
  max-width: 100%;
  overflow-x: auto;
}

.report-title-area {
  text-align: center;
  margin-bottom: 16px;
}

.report-title {
  font-size: 20px;
  margin: 0 0 4px;
}

.report-subtitle {
  color: #666;
  margin: 0;
}

.bs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 900px;
}

.bs-table th,
.bs-table td {
  border: 1px solid #dcdfe6;
  padding: 5px 8px;
  vertical-align: middle;
}

.bs-table th {
  background: #f5f7fa;
  font-weight: bold;
  text-align: center;
}

.col-name {
  width: 22%;
  text-align: left;
}

.col-num {
  width: 5%;
  text-align: center;
}

.col-amt {
  width: 11%;
  text-align: right;
}

.section-header td {
  background: #f0f0f0;
  font-weight: bold;
}

.data-row td {
  background: #fff;
}

.account-name {
  text-align: left;
}

.line-num {
  text-align: center;
  color: #909399;
  font-size: 12px;
}

.amount {
  text-align: right;
  font-family: 'Courier New', monospace;
}

.subtotal-row td {
  background: #fafafa;
  font-weight: bold;
  border-top: 2px solid #dcdfe6;
}

.total-row td {
  background: #ecf5ff;
  font-weight: bold;
  border-top: 2px solid #409eff;
}

.deduction-info {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fdf6ec;
  border-radius: 4px;
  font-size: 12px;
  color: #e6a23c;
  display: flex;
  align-items: center;
  gap: 6px;
}

.report-check {
  text-align: center;
  margin-top: 16px;
}
</style>
