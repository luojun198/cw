<template>
  <div class="page">
    <div class="page-header">
      <h3>期初余额录入</h3>
      <div>
        <span style="margin-right: 12px">
          会计年度: {{ currentYear }}
          <span v-if="isMidYear" style="color: #e6a23c; margin-left: 8px"
            >（中途开账，第{{ startMonth }}期）</span
          >
        </span>
        <el-button style="margin-right: 8px" @click="fetchData">刷新</el-button>
        <el-button type="success" @click="checkBalance">校验平衡</el-button>
        <el-button type="primary" @click="saveAll">保存全部</el-button>
      </div>
    </div>

    <el-alert
      v-if="balanceCheck"
      :type="balanceCheck.balanced ? 'success' : 'error'"
      show-icon
      style="margin-bottom: 12px"
    >
      借贷平衡检验: 借方合计 {{ formatMoney(balanceCheck.totalDebit) }} / 贷方合计
      {{ formatMoney(balanceCheck.totalCredit) }} — {{ balanceCheck.balanced ? '平衡' : '不平衡' }}
    </el-alert>

    <el-table :data="list" stripe border height="calc(100vh - 240px)" class="balance-table">
      <el-table-column prop="code" label="科目编码" width="120" fixed />
      <el-table-column prop="name" label="科目名称" fixed min-width="180" />
      <el-table-column prop="direction" label="方向" width="80">
        <template #default="{ row }">
          <el-tag :type="row.direction === 'debit' ? 'primary' : 'warning'" size="small">{{
            row.direction === 'debit' ? '借' : '贷'
          }}</el-tag>
        </template>
      </el-table-column>

      <!-- 年初余额（1月份开账或中途开账的年初列） -->
      <el-table-column label="年初借方" width="140" align="right">
        <template #default="{ row }">
          <el-input-number
            v-model="row.opening_debit"
            :precision="2"
            :step="100"
            :controls="false"
            style="width: 110px; text-align: right"
            @change="onBalanceChange(row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="年初贷方" width="140" align="right">
        <template #default="{ row }">
          <el-input-number
            v-model="row.opening_credit"
            :precision="2"
            :step="100"
            :controls="false"
            style="width: 110px; text-align: right"
            @change="onBalanceChange(row)"
          />
        </template>
      </el-table-column>

      <!-- 帐前发生额（中途开账时显示） -->
      <el-table-column v-if="isMidYear" label="帐前借方" width="140" align="right">
        <template #default="{ row }">
          <el-input-number
            v-model="row.pre_book_debit"
            :precision="2"
            :step="100"
            :controls="false"
            style="width: 110px; text-align: right"
            @change="onBalanceChange(row)"
          />
        </template>
      </el-table-column>
      <el-table-column v-if="isMidYear" label="帐前贷方" width="140" align="right">
        <template #default="{ row }">
          <el-input-number
            v-model="row.pre_book_credit"
            :precision="2"
            :step="100"
            :controls="false"
            style="width: 110px; text-align: right"
            @change="onBalanceChange(row)"
          />
        </template>
      </el-table-column>

      <!-- 期末余额 -->
      <el-table-column label="期末余额" width="160" align="right">
        <template #default="{ row }">
          <span :class="['balance-value', row.balanceValue < 0 ? 'negative' : '']">{{
            formatMoney(row.balanceValue)
          }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, computed } from 'vue'
import request from '@/api/request'
import { showSuccess, showOperationError } from '@/composables/useMessage'

const list = ref<any[]>([])
const balanceCheck = ref<any>(null)
const currentYear = new Date().getFullYear()
const isMidYear = ref(false)
const startMonth = ref(1)

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(val || 0)
}

// 计算期末余额
function calcBalance(row: any) {
  const od = row.opening_debit || 0
  const oc = row.opening_credit || 0
  const pd = row.pre_book_debit || 0
  const pc = row.pre_book_credit || 0
  const netOpening = od - oc // 净借方为正，净贷方为负
  const netPreBook = pd - pc
  // 期末余额 = 年初净余额 + 帐前净发生额
  return netOpening + netPreBook
}

function onBalanceChange(row: any) {
  // 自动计算期末余额
  row.balanceValue = calcBalance(row)
}

async function fetchData() {
  try {
    const res = await request.get<any[]>('/base/init-balances', { params: { year: currentYear } })
    isMidYear.value = (res as any).isMidYear || false
    startMonth.value = (res as any).startMonth || 1
    list.value = res.data.map((r: any) => {
      r.balanceValue = calcBalance(r)
      return r
    })
  } catch (error) {
    showOperationError('获取期初余额', error)
  }
}

async function checkBalance() {
  try {
    const res = await request.get('/base/init-balances/check', { params: { year: currentYear } })
    balanceCheck.value = res as any
  } catch (error) {
    showOperationError('校验平衡', error)
  }
}

async function saveAll() {
  try {
    for (const r of list.value) {
      await request.post('/base/init-balances', {
        account_id: r.id,
        direction: r.direction,
        init_balance: r.balanceValue || 0,
        init_debit: r.balanceValue > 0 ? r.balanceValue : 0,
        init_credit: r.balanceValue < 0 ? Math.abs(r.balanceValue) : 0,
        year: currentYear,
        opening_debit: r.opening_debit || 0,
        opening_credit: r.opening_credit || 0,
        pre_book_debit: r.pre_book_debit || 0,
        pre_book_credit: r.pre_book_credit || 0,
      })
    }
    await checkBalance()
    showSuccess('期初余额保存成功')
  } catch (error) {
    showOperationError('保存期初余额', error)
  }
}

onMounted(fetchData)
onActivated(fetchData)
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
}
.balance-table :deep(.el-input-number .el-input__inner) {
  text-align: right !important;
}
.balance-value {
  font-weight: 600;
  color: #303133;
}
.balance-value.negative {
  color: #f56c6c;
}
</style>
