<template>
  <div class="page">
    <div class="page-header">
      <h3>凭证结转</h3>
    </div>

    <el-card class="section-card action-card">
      <template #header>
        <div class="card-header">结转操作</div>
      </template>
      <div class="filter-row">
        <el-select v-model="form.year" placeholder="年度" style="width: 120px">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="form.period" placeholder="期间" style="width: 120px">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <el-button :loading="loading" @click="loadStatus">查询状态</el-button>
        <el-button type="primary" :loading="previewLoading" @click="loadPreview"
          >预览结转</el-button
        >
        <el-button
          type="success"
          :loading="running"
          :disabled="!canRunTransfer"
          @click="runTransfer"
        >
          生成结转凭证
        </el-button>
      </div>
      <div class="action-help-text">
        建议先查询状态，再预览本期结转结果，确认无误后生成结转凭证（将自动审核并过账）。
        <el-tag type="info" size="small" style="margin-left: 8px">每个结转类型生成一张凭证</el-tag>
      </div>
      <el-alert
        v-if="runDisabledReason"
        :title="runDisabledReason"
        type="info"
        :closable="false"
        class="run-disabled-alert"
      />
    </el-card>

    <!-- 结转预览（按类型分组显示） -->
    <el-card v-if="previewResult" class="section-card preview-card">
      <template #header>
        <div class="card-header">结转预览</div>
      </template>
      <el-alert
        v-if="previewResult.blockedReason"
        :title="previewResult.blockedReason"
        type="warning"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <div v-if="filteredPreviews.length > 0">
        <div
          v-for="(preview, index) in filteredPreviews"
          :key="preview.transferTypeCode"
          class="preview-type-section"
        >
          <div class="preview-type-header">
            <h4>{{ preview.transferTypeName }}</h4>
            <el-tag v-if="preview.alreadyGenerated" type="success" size="small">已生成</el-tag>
            <el-tag v-else type="warning" size="small">待生成</el-tag>
            <span class="voucher-type-label">凭证类型：{{ preview.voucherType }}</span>
          </div>
          <div v-if="preview.alreadyGenerated" class="preview-existing-info">
            已生成凭证号：{{ preview.existingRun?.voucher_no || '-' }}
          </div>
          <div v-else-if="preview.entries.length > 0" class="preview-meta">
            <div>分录数：{{ preview.entries.length }}</div>
            <div>借方合计：{{ formatMoney(preview.totals.debitTotal) }}</div>
            <div>贷方合计：{{ formatMoney(preview.totals.creditTotal) }}</div>
          </div>
          <el-table
            v-if="!preview.alreadyGenerated && preview.entries.length > 0"
            :data="preview.entries"
            border
            size="small"
            style="margin-top: 8px"
          >
            <el-table-column prop="summary" label="摘要" min-width="150" />
            <el-table-column prop="account_code" label="科目编码" width="110" />
            <el-table-column prop="account_name" label="科目名称" min-width="150" />
            <el-table-column label="方向" width="70">
              <template #default="{ row }">{{ row.direction === 'debit' ? '借' : '贷' }}</template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
            </el-table-column>
          </el-table>
          <el-divider v-if="index < filteredPreviews.length - 1" />
        </div>
      </div>
      <el-empty v-else description="暂无结转预览数据" />
    </el-card>

    <!-- 撤销操作区域 -->
    <el-card v-if="hasGeneratedVouchers" class="section-card revoke-card">
      <template #header>
        <div class="card-header">撤销结转</div>
      </template>
      <div class="revoke-info">
        <el-alert
          title="该期间已生成结转凭证，如需重新生成，请先撤销现有凭证"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-button
          type="danger"
          :loading="revoking"
          :disabled="previewResult?.closed"
          @click="revokeTransfer"
          style="margin-top: 12px"
        >
          撤销所有结转凭证
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import request from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

interface TransferPreview {
  transferTypeCode: string
  transferTypeName: string
  voucherType: string
  alreadyGenerated: boolean
  existingRun: any
  entries: Array<{
    account_code: string
    account_name: string
    direction: 'debit' | 'credit'
    amount: number
    summary: string
  }>
  totals: {
    debitTotal: number
    creditTotal: number
  }
}

interface PreviewResult {
  closed: boolean
  blockedReason: string | null
  previews: TransferPreview[]
}

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

const form = ref({
  year: currentYear,
  period: new Date().getMonth() + 1,
})

const loading = ref(false)
const previewLoading = ref(false)
const running = ref(false)
const revoking = ref(false)
const previewResult = ref<PreviewResult | null>(null)

const hasGeneratedVouchers = computed(() => {
  return previewResult.value?.previews?.some(p => p.alreadyGenerated) || false
})

const filteredPreviews = computed(() => {
  if (!previewResult.value?.previews) return []
  // 只显示已生成的或有数据的结转类型
  return previewResult.value.previews.filter(
    p => p.alreadyGenerated || p.entries.length > 0
  )
})

const runDisabledReason = computed(() => {
  if (!previewResult.value) return '请先点击"预览结转"生成分录预览'
  if (previewResult.value.blockedReason) return previewResult.value.blockedReason
  if (hasGeneratedVouchers.value) return '该期间已生成结转凭证，请先撤销后再生成'
  const hasData = previewResult.value.previews?.some(p => p.entries.length > 0)
  if (!hasData) return '当前没有可生成的结转分录'
  return ''
})

const canRunTransfer = computed(() => !runDisabledReason.value)

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

async function loadStatus() {
  loading.value = true
  try {
    const res = await request.get('/voucher/auto-transfer/status', {
      params: { year: form.value.year, period: form.value.period },
    })
    ElMessage.success('状态查询成功')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '查询状态失败')
  } finally {
    loading.value = false
  }
}

async function loadPreview() {
  previewLoading.value = true
  try {
    const res = await request.post<PreviewResult>('/voucher/auto-transfer/preview', {
      year: form.value.year,
      period: form.value.period,
    })
    previewResult.value = res.data
    ElMessage.success(res.message || '预览加载成功')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '预览失败')
  } finally {
    previewLoading.value = false
  }
}

async function runTransfer() {
  if (!previewResult.value) return

  const pendingCount = previewResult.value.previews.filter(
    p => !p.alreadyGenerated && p.entries.length > 0
  ).length

  try {
    await ElMessageBox.confirm(
      `确认生成 ${form.value.year}年${form.value.period}期 的结转凭证吗？\n\n将生成 ${pendingCount} 张凭证（每个结转类型一张），凭证将自动审核并过账。`,
      '确认生成结转凭证',
      {
        confirmButtonText: '确认生成',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  running.value = true
  try {
    const res = await request.post('/voucher/auto-transfer/run', {
      year: form.value.year,
      period: form.value.period,
    })
    ElMessage.success(res.message || '结转凭证生成成功')
    await loadPreview()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '生成结转凭证失败')
  } finally {
    running.value = false
  }
}

async function revokeTransfer() {
  try {
    await ElMessageBox.confirm(
      `确认撤销 ${form.value.year}年${form.value.period}期 的所有结转凭证吗？\n\n此操作将删除所有结转凭证并反过账，不可恢复。`,
      '确认撤销结转',
      {
        confirmButtonText: '确认撤销',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  revoking.value = true
  try {
    const res = await request.post('/voucher/auto-transfer/revoke', {
      year: form.value.year,
      period: form.value.period,
    })
    ElMessage.success(res.message || '撤销成功')
    await loadPreview()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '撤销失败')
  } finally {
    revoking.value = false
  }
}

onMounted(() => {
  loadPreview()
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
}
.section-card {
  margin-bottom: 16px;
}
.card-header {
  font-weight: 600;
  font-size: 15px;
}
.filter-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.action-help-text {
  margin-top: 12px;
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
}
.run-disabled-alert {
  margin-top: 12px;
}

.preview-type-section {
  margin-bottom: 24px;
}
.preview-type-section:last-child {
  margin-bottom: 0;
}
.preview-type-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.preview-type-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.voucher-type-label {
  margin-left: auto;
  font-size: 13px;
  color: #909399;
}
.preview-existing-info {
  padding: 8px 12px;
  background-color: #f0f9ff;
  border-radius: 4px;
  font-size: 13px;
  color: #409eff;
}
.preview-meta {
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.revoke-info {
  padding: 12px 0;
}
</style>
