<template>
  <div class="page page-cashier-initbal">
    <div class="page-header">
      <h3>出纳期初余额</h3>
      <div class="filter-row">
        <el-button type="primary" @click="handleSaveAll" :loading="saving">
          <el-icon><Check /></el-icon>保存
        </el-button>
      </div>
    </div>

    <div ref="tableContainerRef" class="table-container">
      <el-table
        ref="tableRef"
        :data="rows"
        :height="tableHeight"
        border
        size="small"
      >
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
import { Check } from '@element-plus/icons-vue'
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

onMounted(async () => {
  const [ibRes, acRes] = await Promise.all([
    cashierApi.getInitBalances(),
    cashierApi.getAccounts(),
  ])
  const acMap = new Map((acRes.data ?? []).map((a: any) => [a.code, a.name]))

  // 从科目列表生成行（保留已有余额）
  const existing = new Map((ibRes.data ?? []).map((r: any) => [`${r.account_code}::${r.currency}`, r.balance]))
  const accounts: any[] = acRes.data ?? []
  rows.value = accounts.map(a => ({
    account_code: a.code,
    account_name: acMap.get(a.code) as string | undefined,
    currency: 'RMB',
    balance: existing.get(`${a.code}::RMB`) ?? 0,
    _dirty: false,
  }))
})

async function handleSaveAll() {
  const dirty = rows.value.filter(r => r._dirty)
  if (!dirty.length) return ElMessage.info('没有修改')
  saving.value = true
  try {
    for (const r of dirty) {
      await cashierApi.upsertInitBalance({ account_code: r.account_code, currency: r.currency, balance: r.balance })
      r._dirty = false
    }
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page-cashier-initbal { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; gap: 8px; }
.table-container { flex: 1; overflow: hidden; padding: 0 16px 8px; }
</style>
