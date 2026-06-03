<template>
  <div class="page page-cashier-initbal">
    <div class="page-header">
      <h3>出纳期初余额</h3>
      <div class="filter-row">
        <span class="label">期初日期：</span>
        <el-date-picker
          v-model="initDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="请选择期初日期"
          style="width:150px"
          :disabled="locked"
          @change="markDateDirty"
        />
        <el-button type="primary" @click="handleSaveAll" :loading="saving" :disabled="locked">
          <el-icon><Check /></el-icon>保存
        </el-button>
        <el-button plain @click="handleExport">
          <el-icon><Download /></el-icon>导出
        </el-button>
        <el-button plain @click="handleDownloadTemplate">
          <el-icon><Document /></el-icon>下载模版
        </el-button>
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :on-change="handleImport"
          :disabled="locked"
        >
          <el-button plain :disabled="locked">
            <el-icon><Upload /></el-icon>导入
          </el-button>
        </el-upload>
        <el-tag v-if="locked" type="warning" size="small">已有对账单据，不可修改</el-tag>
      </div>
    </div>

    <div ref="tableContainerRef" class="table-container">
      <el-table ref="tableRef" :data="rows" :height="tableHeight" border size="small">
        <el-table-column label="科目编码" prop="account_code" width="120" />
        <el-table-column label="科目名称" prop="account_name" min-width="160" />
        <el-table-column label="币别" prop="currency" width="80" />
        <el-table-column label="期初余额" width="160" align="right">
          <template #default="{ row }">
            <el-input-number
              v-model="row.balance"
              :precision="2"
              :controls="false"
              style="width:100%"
              size="small"
              :disabled="locked"
              @change="row._dirty = true"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Download, Upload, Document } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import { cashierApi } from '@/api/cashier'
import { useFillHeightTable } from '@/composables/useFillHeightTable'

const { tableRef, containerRef: tableContainerRef, tableHeight } = useFillHeightTable()

interface Row {
  account_code: string
  account_name?: string
  currency: string
  balance: number
  _dirty?: boolean
}

const rows = ref<Row[]>([])
const saving = ref(false)
const initDate = ref<string | null>(null)
const locked = ref(false)
let dateDirty = false

function markDateDirty() { dateDirty = true }

onMounted(async () => {
  const [ibRes, acRes] = await Promise.all([
    cashierApi.getInitBalances(),
    cashierApi.getAccounts(),
  ])
  const acMap = new Map((acRes.data ?? []).map((a: any) => [a.code, a.name]))
  const { rows: ibRows, init_date, locked: isLocked } = ibRes.data as any
  initDate.value = init_date ?? null
  locked.value = !!isLocked

  const existing = new Map((ibRows ?? []).map((r: any) => [`${r.account_code}::${r.currency}`, r.balance]))
  rows.value = (acRes.data ?? []).map((a: any) => ({
    account_code: a.code,
    account_name: acMap.get(a.code) as string | undefined,
    currency: 'RMB',
    balance: existing.get(`${a.code}::RMB`) ?? 0,
    _dirty: false,
  }))
})

async function handleSaveAll() {
  const dirty = rows.value.filter(r => r._dirty)
  if (!dirty.length && !dateDirty) return ElMessage.info('没有修改')
  saving.value = true
  try {
    for (const r of dirty) {
      await cashierApi.upsertInitBalance({
        account_code: r.account_code,
        currency: r.currency,
        balance: r.balance,
        init_date: initDate.value ?? undefined,
      })
      r._dirty = false
    }
    if (!dirty.length && dateDirty && rows.value.length) {
      const r = rows.value[0]
      await cashierApi.upsertInitBalance({
        account_code: r.account_code,
        currency: r.currency,
        balance: r.balance,
        init_date: initDate.value ?? undefined,
      })
    }
    dateDirty = false
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

// ── 导出 ──────────────────────────────────────────────────
function handleExport() {
  const data = [
    ['科目编码', '科目名称', '币别', '期初余额'],
    ...rows.value.map(r => [r.account_code, r.account_name ?? '', r.currency, r.balance]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '出纳期初余额')
  XLSX.writeFile(wb, `出纳期初余额_${initDate.value ?? '未设置'}.xlsx`)
}

// ── 下载模版 ───────────────────────────────────────────────
function handleDownloadTemplate() {
  const data = [
    ['科目编码', '科目名称', '币别', '期初余额'],
    ['1001', '库存现金', 'RMB', 0],
    ['1002', '银行存款', 'RMB', 0],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '出纳期初余额')
  XLSX.writeFile(wb, '出纳期初余额导入模版.xlsx')
}

// ── 导入 ──────────────────────────────────────────────────
async function handleImport(file: any) {
  const raw: File = file.raw
  if (!raw) return
  const buf = await raw.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  // 找表头行（含"科目编码"的行）
  const headerIdx = data.findIndex(r => String(r[0]).includes('科目编码'))
  if (headerIdx < 0) return ElMessage.error('未找到表头行（需包含"科目编码"列）')
  const dataRows = data.slice(headerIdx + 1).filter(r => r[0])

  // 按科目编码更新余额
  const codeMap = new Map(rows.value.map(r => [r.account_code, r]))
  let updated = 0
  for (const r of dataRows) {
    const code = String(r[0]).trim()
    const balance = Number(r[3]) || 0
    const row = codeMap.get(code)
    if (row) {
      row.balance = balance
      row._dirty = true
      updated++
    }
  }
  if (!updated) return ElMessage.warning('未匹配到任何科目编码，请检查文件格式')
  ElMessage.success(`已导入 ${updated} 条，请点击保存`)
}
</script>

<style scoped>
.page-cashier-initbal { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.label { font-size: 13px; color: var(--el-text-color-regular); }
.table-container { flex: 1; overflow: hidden; padding: 0 16px 8px; }
</style>
