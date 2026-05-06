<template>
  <div class="page">
    <div class="page-header">
      <h3>期初余额录入</h3>
      <div style="display: flex; align-items: center; gap: 8px">
        <el-select v-model="selectedYear" style="width: 120px" @change="onYearChange">
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <span v-if="isMidYear" style="color: #e6a23c">（中途开账，第{{ startMonth }}期）</span>
        <el-button @click="fetchData">刷新</el-button>
        <el-button type="success" @click="checkBalance" :disabled="locked">校验平衡</el-button>
        <el-button @click="downloadTemplate" :disabled="locked">下载模板</el-button>
        <el-button @click="importDialogVisible = true" :disabled="locked">导入</el-button>
        <el-button type="primary" @click="saveAll" :disabled="locked" :loading="saving">保存全部</el-button>
      </div>
    </div>

    <el-alert
      v-if="locked"
      type="warning"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    >
      {{ lockReason }}
    </el-alert>

    <el-alert
      v-if="balanceCheck"
      :type="balanceCheck.balanced ? 'success' : 'error'"
      show-icon
      style="margin-bottom: 12px"
    >
      借贷平衡检验: 借方合计 {{ formatMoney(balanceCheck.totalDebit) }} / 贷方合计
      {{ formatMoney(balanceCheck.totalCredit) }} — {{ balanceCheck.balanced ? '平衡' : '不平衡' }}
    </el-alert>

    <el-table :data="list" stripe border height="100%" class="balance-table">
      <el-table-column prop="code" label="科目编码" width="120" fixed />
      <el-table-column prop="name" label="科目名称" fixed min-width="180" />
      <el-table-column prop="direction" label="方向" width="80">
        <template #default="{ row }">
          <el-tag :type="row.direction === 'debit' ? 'primary' : 'warning'" size="small">{{
            row.direction === 'debit' ? '借' : '贷'
          }}</el-tag>
        </template>
      </el-table-column>

      <!-- 年初余额 -->
      <el-table-column label="年初借方" width="140" align="right">
        <template #default="{ row }">
          <el-input-number
            v-model="row.opening_debit"
            :precision="2"
            :step="100"
            :controls="false"
            :disabled="locked"
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
            :disabled="locked"
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
            :disabled="locked"
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
            :disabled="locked"
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

    <!-- 导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入期初余额" width="620px" @close="closeImportDialog">
      <div class="import-tips">
        <p>1. 请先 <el-link type="primary" @click="downloadTemplate">下载导入模板</el-link>，按模板格式填写数据</p>
        <p>2. 按科目编码匹配，已有数据将被覆盖</p>
        <p>3. 年初借方/贷方为必填{{ isMidYear ? '，账前借方/贷方为中途开账时填写' : '' }}</p>
      </div>
      <el-upload
        ref="importUploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="onImportFileChange"
        :on-exceed="() => showError('只能上传一个文件')"
        drag
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">拖拽文件到此处，或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx / .xls 格式</div>
        </template>
      </el-upload>

      <div v-if="importPreview.length > 0" class="import-preview">
        <el-alert
          :title="`解析成功：${importPreview.length} 条数据（匹配到 ${importMatched} 个科目）`"
          type="success" :closable="false" show-icon style="margin-bottom: 12px"
        />
        <el-table :data="importPreview.slice(0, 10)" stripe border size="small" max-height="240">
          <el-table-column prop="code" label="科目编码" width="100" />
          <el-table-column prop="name" label="科目名称" min-width="140" />
          <el-table-column prop="opening_debit" label="年初借方" width="110" align="right" />
          <el-table-column prop="opening_credit" label="年初贷方" width="110" align="right" />
          <el-table-column v-if="isMidYear" prop="pre_book_debit" label="帐前借方" width="110" align="right" />
          <el-table-column v-if="isMidYear" prop="pre_book_credit" label="帐前贷方" width="110" align="right" />
          <el-table-column prop="matched" label="匹配" width="70" align="center">
            <template #default="{ row }">
              <el-tag :type="row.matched ? 'success' : 'danger'" size="small">{{ row.matched ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="importPreview.length > 10" style="color: #909399; font-size: 12px; margin-top: 4px">
          仅展示前 10 条，共 {{ importPreview.length }} 条
        </div>
      </div>

      <template #footer>
        <el-button @click="closeImportDialog">取消</el-button>
        <el-button
          type="primary"
          :disabled="importMatched === 0"
          :loading="importing"
          @click="handleImport"
        >
          确认导入（{{ importMatched }} 条）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import request from '@/api/request'
import { showSuccess, showError, showOperationError } from '@/composables/useMessage'
import { formatAmount } from '@/utils/format'
import type { UploadFile } from 'element-plus'

const list = ref<any[]>([])
const balanceCheck = ref<any>(null)
const isMidYear = ref(false)
const startMonth = ref(1)
const saving = ref(false)
const locked = ref(false)
const lockReason = ref('')

// 年度选择
const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

// 导入相关
const importDialogVisible = ref(false)
const importPreview = ref<any[]>([])
const importUploadRef = ref<any>(null)
const importing = ref(false)
const importMatched = computed(() => importPreview.value.filter(r => r.matched).length)

function formatMoney(val: number) {
  return '¥' + formatAmount(val || 0)
}

// 计算期末余额
function calcBalance(row: any) {
  const od = row.opening_debit || 0
  const oc = row.opening_credit || 0
  const pd = row.pre_book_debit || 0
  const pc = row.pre_book_credit || 0
  return (od - oc) + (pd - pc)
}

function onBalanceChange(row: any) {
  row.balanceValue = calcBalance(row)
}

function onYearChange() {
  balanceCheck.value = null
  fetchData()
  checkCanEdit()
}

async function fetchData() {
  try {
    const res = await request.get<any[]>('/base/init-balances', { params: { year: selectedYear.value } })
    isMidYear.value = (res as any).isMidYear || false
    startMonth.value = (res as any).startMonth || 1
    list.value = res.data.map((r: any) => {
      r.opening_debit = r.opening_debit || 0
      r.opening_credit = r.opening_credit || 0
      r.pre_book_debit = r.pre_book_debit || 0
      r.pre_book_credit = r.pre_book_credit || 0
      r.balanceValue = calcBalance(r)
      return r
    })
  } catch (error) {
    showOperationError('获取期初余额', error)
  }
}

async function checkCanEdit() {
  try {
    const res = await request.get('/base/init-balances/can-edit', { params: { year: selectedYear.value } }) as any
    locked.value = !res.canEdit
    lockReason.value = res.reason || ''
  } catch {
    // 接口失败时不锁定
    locked.value = false
  }
}

async function checkBalance() {
  try {
    const res = await request.get('/base/init-balances/check', { params: { year: selectedYear.value } })
    balanceCheck.value = res as any
  } catch (error) {
    showOperationError('校验平衡', error)
  }
}

async function saveAll() {
  if (locked.value) return
  saving.value = true
  try {
    // 只保存有数据的行（至少有一个金额不为0）
    const items = list.value
      .filter(r => (r.opening_debit || 0) !== 0 || (r.opening_credit || 0) !== 0
        || (r.pre_book_debit || 0) !== 0 || (r.pre_book_credit || 0) !== 0)
      .map(r => ({
        account_id: r.id,
        direction: r.direction,
        opening_debit: r.opening_debit || 0,
        opening_credit: r.opening_credit || 0,
        pre_book_debit: r.pre_book_debit || 0,
        pre_book_credit: r.pre_book_credit || 0,
      }))

    if (items.length === 0) {
      showError('没有需要保存的数据')
      return
    }

    await request.post('/base/init-balances/batch', {
      year: selectedYear.value,
      items,
    })
    await checkBalance()
    showSuccess(`期初余额保存成功，共 ${items.length} 条`)
  } catch (error) {
    showOperationError('保存期初余额', error)
  } finally {
    saving.value = false
  }
}

// ===================== 导入功能 =====================

async function downloadTemplate() {
  const { utils, writeFile } = await import('xlsx')

  const baseColumns: Record<string, any> = {
    '科目编码': '1001',
    '科目名称': '库存现金',
    '方向': '借',
    '年初借方': 10000,
    '年初贷方': 0,
  }
  if (isMidYear.value) {
    baseColumns['帐前借方'] = 5000
    baseColumns['帐前贷方'] = 0
  }

  const row2: Record<string, any> = {
    '科目编码': '1002',
    '科目名称': '银行存款',
    '方向': '借',
    '年初借方': 50000,
    '年初贷方': 0,
  }
  if (isMidYear.value) {
    row2['帐前借方'] = 20000
    row2['帐前贷方'] = 0
  }

  const templateData = [baseColumns, row2]
  const ws = utils.json_to_sheet(templateData)

  // 设置列宽
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 6 },
    { wch: 14 }, { wch: 14 },
    ...(isMidYear.value ? [{ wch: 14 }, { wch: 14 }] : []),
  ]

  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, '期初余额模板')
  writeFile(wb, `期初余额导入模板_${selectedYear.value}年.xlsx`)
}

async function onImportFileChange(file: UploadFile) {
  if (!file.raw) return
  try {
    const { utils, read } = await import('xlsx')
    const arrayBuffer = await file.raw.arrayBuffer()
    const workbook = read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rawData: any[] = utils.sheet_to_json(sheet)

    if (rawData.length === 0) {
      showError('文件中没有数据')
      return
    }

    // 建立科目编码 -> 科目的映射
    const codeMap = new Map(list.value.map(a => [String(a.code).trim(), a]))

    const parsed = rawData.map((row: any) => {
      const code = String(row['科目编码'] || '').trim()
      const account = codeMap.get(code)
      return {
        code,
        name: row['科目名称'] || account?.name || '',
        direction: account?.direction || '',
        opening_debit: Number(row['年初借方']) || 0,
        opening_credit: Number(row['年初贷方']) || 0,
        pre_book_debit: Number(row['帐前借方']) || 0,
        pre_book_credit: Number(row['帐前贷方']) || 0,
        matched: !!account,
        account_id: account?.id,
      }
    }).filter(r => r.code) // 跳过空行

    importPreview.value = parsed
  } catch (error) {
    showError('文件解析失败，请检查文件格式')
    console.error('Import parse error:', error)
  }
}

async function handleImport() {
  const matched = importPreview.value.filter(r => r.matched)
  if (matched.length === 0) return
  importing.value = true

  try {
    const items = matched.map(r => ({
      account_id: r.account_id,
      direction: r.direction,
      opening_debit: r.opening_debit,
      opening_credit: r.opening_credit,
      pre_book_debit: r.pre_book_debit,
      pre_book_credit: r.pre_book_credit,
    }))

    await request.post('/base/init-balances/batch', {
      year: selectedYear.value,
      items,
    })

    showSuccess(`导入成功，共 ${matched.length} 条`)
    closeImportDialog()
    await fetchData()
    await checkBalance()
  } catch (error) {
    showOperationError('导入期初余额', error)
  } finally {
    importing.value = false
  }
}

function closeImportDialog() {
  importDialogVisible.value = false
  importPreview.value = []
  importUploadRef.value?.clearFiles()
}

onMounted(() => {
  fetchData()
  checkCanEdit()
})
onActivated(() => {
  fetchData()
  checkCanEdit()
})
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
  flex-shrink: 0;
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
.import-tips {
  margin-bottom: 16px;
  color: #606266;
  font-size: 13px;
  line-height: 1.8;
}
.import-tips p {
  margin: 0;
}
.import-preview {
  margin-top: 16px;
}
</style>
