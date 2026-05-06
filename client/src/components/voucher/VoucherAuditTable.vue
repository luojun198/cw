<template>
  <el-table :data="flatList" border height="100%" :row-class-name="getRowClass" :span-method="voucherSpanMethod" @selection-change="onSelect" @row-dblclick="handleRowDblclick">
    <el-table-column type="selection" width="40" :selectable="isSelectableRow" />
    <el-table-column prop="voucher_no" label="凭证号" width="100" align="center" />
    <el-table-column prop="voucher_date" label="日期" width="100" />
    <el-table-column prop="voucher_type_name" label="类型" width="100" />
    <el-table-column prop="summary" label="摘要" />
    <el-table-column prop="account_code" label="科目编码" width="100" />
    <el-table-column prop="account_name" label="科目名称" width="160" />
    <el-table-column label="借方金额" width="130" align="right">
      <template #default="{ row }">
        <span v-if="row.direction === 'debit'">{{ formatMoney(row.amount) }}</span>
      </template>
    </el-table-column>
    <el-table-column label="贷方金额" width="130" align="right">
      <template #default="{ row }">
        <span v-if="row.direction === 'credit'">{{ formatMoney(row.amount) }}</span>
      </template>
    </el-table-column>
    <el-table-column
      v-for="col in allAuxColumns"
      :key="col.code"
      :prop="col.prop"
      :label="col.name"
      width="100"
    />
    <el-table-column prop="maker_name" label="制单人" width="100" />
    <el-table-column prop="auditor_name" label="审核人" width="100" />
    <el-table-column label="状态" width="80">
      <template #default="{ row }">
        <el-tag :type="statusType[row.status]" size="small">{{ statusText[row.status] }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="280" fixed="right">
      <template #default="{ row }">
        <el-button link type="primary" size="small" @click="emit('view-detail', row)">查看</el-button>
        <el-button
          v-if="row.status === 'draft'"
          link
          type="success"
          size="small"
          @click="emit('audit', row)"
          >审核</el-button
        >
        <el-button
          v-if="row.status === 'audited'"
          link
          type="warning"
          size="small"
          @click="emit('unaudit', row)"
          >反审核</el-button
        >
        <el-button
          v-if="row.status !== 'posted'"
          link
          type="primary"
          size="small"
          @click="emit('post', row)"
          >记账</el-button
        >
        <el-button
          v-if="row.status === 'posted'"
          link
          type="warning"
          size="small"
          @click="emit('unpost', row)"
          >反记账</el-button
        >
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney, statusType, statusText } from '@/composables/useVoucherAuditData'

interface Props {
  flatList: any[]
  isSelectableRow: (row: any) => boolean
  getRowClass: (params: { row: any }) => string
  auxCategories?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  auxCategories: () => [],
})

const emit = defineEmits<{
  'selection-change': [rows: any[]]
  'view-detail': [row: any]
  audit: [row: any]
  unaudit: [row: any]
  post: [row: any]
  unpost: [row: any]
  'row-dblclick': [row: any]
}>()

function onSelect(rows: any[]) {
  emit('selection-change', rows)
}

// 检查固定辅助列（部门、项目）是否在凭证中被使用
const hasUsedDept = computed(() => {
  return props.flatList.some(row => row.dept_name && String(row.dept_name).trim() !== '')
})

const hasUsedProject = computed(() => {
  return props.flatList.some(row => row.project_name && String(row.project_name).trim() !== '')
})

// 动态辅助列：从 flatList 中提取实际使用的辅助类别，排除已有固定列的 dept/project
const auxColumns = computed(() => {
  const fixedCodes = new Set(['dept', 'project', 'supplier', 'person', 'func_class'])
  const colMap = new Map<string, string>()
  for (const row of props.flatList) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_aux_')) {
        const value = row[key]
        // 只有当值存在且不为空字符串时才认为该辅助项目被使用
        if (!value || (typeof value === 'string' && value.trim() === '')) continue

        const code = key.slice(5)
        if (fixedCodes.has(code) || colMap.has(code)) continue

        // 只显示在 auxCategories 中且启用的类别
        const cat = props.auxCategories.find(c => c.code === code)
        if (cat) {
          colMap.set(code, cat.name || code)
        }
      }
    }
  }
  return Array.from(colMap.entries()).map(([code, name]) => ({
    code,
    name,
    prop: `_aux_${code}`,
  }))
})

// 合并所有辅助列：固定列（部门、项目）+ 动态辅助列
const allAuxColumns = computed(() => {
  const columns: Array<{ code: string; name: string; prop: string }> = []

  // 添加部门列（如果被使用）
  if (hasUsedDept.value) {
    columns.push({ code: 'dept', name: '部门', prop: 'dept_name' })
  }

  // 添加项目列（如果被使用）
  if (hasUsedProject.value) {
    columns.push({ code: 'project', name: '项目', prop: 'project_name' })
  }

  // 添加其他动态辅助列
  columns.push(...auxColumns.value)

  return columns
})

function handleRowDblclick(row: any) {
  emit('view-detail', row)
}

function voucherSpanMethod({ row, column }: { row: any; column: any }) {
  // 这些列同一个凭证的多行分录合并显示
  const mergeProps = ['voucher_no', 'voucher_date', 'voucher_type_name', 'maker_name', 'auditor_name']
  if (mergeProps.includes(column.property) || column.label === '状态' || column.label === '操作' || column.type === 'selection') {
    if (row._voucherRowIndex === 0) {
      return { rowspan: row._voucherEntryCount, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
}
</script>

<style>
.voucher-group-even td {
  background-color: #f0f5ff;
}
.voucher-group-odd td {
  background-color: #ffffff;
}
.voucher-selected td {
  background-color: #d9ecff !important;
}
</style>
