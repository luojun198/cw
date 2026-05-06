<template>
  <div class="page">
    <div class="page-header">
      <h3>结转类型维护</h3>
      <div class="page-header-toolbar">
        <span class="toolbar-label">快捷检索</span>
        <el-input
          v-model="searchKeyword"
          placeholder="搜索关键字、科目..."
          clearable
          style="width: 200px"
          prefix-icon="Search"
        />
      </div>
      <el-button type="primary" @click="handleSave">确定</el-button>
    </div>

    <el-card>
      <!-- 结转类型列表 -->
      <div class="transfer-type-section">
        <div class="section-header">
          <span class="section-title">结转类型</span>
          <el-button size="small" @click="addTransferType">增加类型</el-button>
        </div>
        <el-table
          :data="filteredTypes"
          border
          style="width: 100%; margin-bottom: 16px;"
          :highlight-current-row="true"
          @row-click="handleTypeClick"
          max-height="200"
        >
          <el-table-column type="index" label="序号" width="50" />
          <el-table-column prop="code" label="代码" width="80">
            <template #default="{ row }">
              <span v-html="highlightTypeText(row.code)"></span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="结转说明">
            <template #default="{ row }">
              <span v-html="highlightTypeText(row.name)"></span>
            </template>
          </el-table-column>
          <el-table-column prop="voucherType" label="凭证类型" width="100" />
          <el-table-column prop="periodType" label="结转周期" width="100">
            <template #default="{ row }">
              <el-select v-model="row.periodType" size="small" style="width: 80px">
                <el-option label="月度" value="monthly" />
                <el-option label="年末" value="yearly" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column width="80">
            <template #default="scope">
              <el-button size="small" @click.stop="deleteTransferType(scope.row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 结转内容配置 -->
        <div class="transfer-content-section">
          <div class="section-header">
            <span class="section-title">内容</span>
          </div>
          <el-table
            :data="selectedTypeItems"
            border
            style="width: 100%; margin-bottom: 16px;"
            :row-style="{ height: '48px' }"
            :cell-style="{ padding: '8px 0' }"
            :header-cell-style="{ padding: '10px 0' }"
            :row-class-name="getItemRowClass"
          >
            <el-table-column type="index" label="序号" width="60" />
            <el-table-column prop="summary" label="摘要" width="140" />
            <el-table-column prop="fromCode" label="转出科目" width="180">
              <template #default="scope">
                <el-select
                  v-model="scope.row.fromCode"
                  filterable
                  clearable
                  placeholder="选择"
                  class="account-select"
                  @change="updateFromName(scope.row)"
                >
                  <el-option
                    v-for="acc in allAccounts"
                    :key="acc.code"
                    :label="`${acc.code} ${accountFullPathMap[acc.code] || acc.name}`"
                    :value="acc.code"
                  />
                  <template #tag="{ option }">
                    <span v-html="highlightItemText(scope.row.fromCode)"></span>
                  </template>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="fromName" label="转出科目名称" min-width="180">
              <template #default="{ row }">
                <span v-html="highlightItemText(row.fromName)"></span>
              </template>
            </el-table-column>
            <el-table-column prop="toCode" label="转入科目" width="180">
              <template #default="scope">
                <el-select
                  v-model="scope.row.toCode"
                  filterable
                  clearable
                  placeholder="选择明细科目"
                  class="account-select"
                  @change="updateToName(scope.row)"
                >
                  <el-option
                    v-for="acc in detailAccounts"
                    :key="acc.code"
                    :label="`${acc.code} ${accountFullPathMap[acc.code] || acc.name}`"
                    :value="acc.code"
                  />
                  <template #tag="{ option }">
                    <span v-html="highlightItemText(scope.row.toCode)"></span>
                  </template>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="toName" label="转入科目名称" min-width="160">
              <template #default="{ row }">
                <span v-html="highlightItemText(row.toName)"></span>
              </template>
            </el-table-column>
            <el-table-column prop="transferType" label="转出类型" width="120">
              <template #default="scope">
                <el-select v-model="scope.row.transferType" class="transfer-type-select">
                  <el-option label="全部转出" value="all" />
                  <el-option label="部分转出" value="partial" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="ratio" label="转出比例" width="130">
              <template #default="scope">
                <span v-if="scope.row.transferType === 'all'">全部转出</span>
                <el-input-number
                  v-else
                  v-model="scope.row.ratio"
                  :min="0"
                  :max="100"
                  :precision="2"
                  style="width: 100px;"
                />%
              </template>
            </el-table-column>
            <el-table-column width="80">
              <template #default="scope">
                <el-button size="small" type="danger" @click="deleteItem(scope.row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 操作按钮 -->
          <div class="content-actions">
            <el-button size="small" @click="addItem">增加</el-button>
            <el-button size="small" @click="deleteSelectedItems">删除</el-button>
            <span class="warning-tip">
              <span class="warning-icon">⚠</span>
              温馨提示: 转出科目允许多个，转入科目只能是一个明细科目
            </span>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import request from '@/api/request'
import { showSuccess, showWarning, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm, useConfirm } from '@/composables/useConfirm'

interface AccountOption {
  id: string
  code: string
  name: string
}

interface TransferType {
  id: string
  code: string
  name: string
  voucherType: string
  periodType: string
}

interface TransferItem {
  id: string
  typeCode: string
  summary: string
  fromCode: string
  fromName: string
  toCode: string
  toName: string
  transferType: 'all' | 'partial'
  ratio?: number
}

const allAccounts = ref<AccountOption[]>([])
const allAccountsWithChildren = ref<any[]>([]) // 包含 children 信息的完整科目数据
const accountFullPathMap = ref<Record<string, string>>({}) // code -> 完整路径（如"资产/流动资产/现金"）
const transferTypes = ref<TransferType[]>([])
const transferItems = ref<TransferItem[]>([])
const selectedType = ref<TransferType | null>(null)

// 当前选中类型的配置项
const selectedTypeItems = computed(() => {
  if (!selectedType.value) return []
  return transferItems.value.filter(item => item.typeCode === selectedType.value?.code)
})

// 搜索功能 - 搜索结转类型和科目
const searchKeyword = ref('')

// 过滤结转类型：匹配类型本身或其明细项中的科目
const filteredTypes = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return transferTypes.value

  return transferTypes.value.filter(type => {
    // 匹配类型代码或名称
    if (type.code.toLowerCase().includes(keyword) || type.name.toLowerCase().includes(keyword)) {
      return true
    }

    // 匹配该类型下的明细项中的科目代码或科目名称
    const items = transferItems.value.filter(item => item.typeCode === type.code)
    return items.some(item => {
      const fromCodeMatch = item.fromCode && item.fromCode.toLowerCase().includes(keyword)
      const fromNameMatch = item.fromName && item.fromName.toLowerCase().includes(keyword)
      const toCodeMatch = item.toCode && item.toCode.toLowerCase().includes(keyword)
      const toNameMatch = item.toName && item.toName.toLowerCase().includes(keyword)
      return fromCodeMatch || fromNameMatch || toCodeMatch || toNameMatch
    })
  })
})

// 高亮文本函数
function highlightTypeText(text: string): string {
  const keyword = searchKeyword.value.trim()
  if (!keyword || !text) return text
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark style="background-color: #ffeb3b; padding: 0 2px;">$1</mark>')
}

// 判断明细行是否匹配搜索关键字
function isItemMatched(item: TransferItem): boolean {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return false

  const fromCodeMatch = item.fromCode && item.fromCode.toLowerCase().includes(keyword)
  const fromNameMatch = item.fromName && item.fromName.toLowerCase().includes(keyword)
  const toCodeMatch = item.toCode && item.toCode.toLowerCase().includes(keyword)
  const toNameMatch = item.toName && item.toName.toLowerCase().includes(keyword)
  return fromCodeMatch || fromNameMatch || toCodeMatch || toNameMatch
}

// 高亮明细项文本
function highlightItemText(text: string): string {
  const keyword = searchKeyword.value.trim()
  if (!keyword || !text) return text
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark style="background-color: #ffeb3b; padding: 0 2px;">$1</mark>')
}

// 监听搜索关键字变化，自动选中匹配的类型
watch(searchKeyword, () => {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    // 清空搜索时不改变选中项
    return
  }

  const filtered = filteredTypes.value

  // 如果只有一个匹配的类型，自动选中
  if (filtered.length === 1) {
    selectedType.value = filtered[0]
    return
  }

  // 如果当前选中的类型不在过滤结果中，选中第一个匹配的类型
  if (selectedType.value && !filtered.find(t => t.id === selectedType.value?.id)) {
    selectedType.value = filtered[0] || null
    return
  }

  // 如果没有选中类型，且有匹配结果，选中第一个
  if (!selectedType.value && filtered.length > 0) {
    selectedType.value = filtered[0]
  }
})

// 判断科目是否为明细科目（没有子科目）
function isDetailAccount(code: string): boolean {
  const account = allAccountsWithChildren.value.find(a => a.code === code)
  if (!account) return false
  // 明细科目：没有 children 或 children 为空数组
  return !account.children || account.children.length === 0
}

// 获取可选的转入科目列表（只包含明细科目）
const detailAccounts = computed(() => {
  return allAccounts.value.filter(acc => isDetailAccount(acc.code))
})

// 获取明细行的样式类名
function getItemRowClass({ row }: { row: TransferItem }): string {
  return isItemMatched(row) ? 'matched-item-row' : ''
}

function getAccountName(code: string): string {
  const acc = allAccounts.value.find(a => a.code === code)
  return acc?.name || ''
}

// 构建科目的完整路径（如"资产/流动资产/现金"）
function getAccountFullPath(code: string): string {
  return accountFullPathMap.value[code] || getAccountName(code)
}

function updateFromName(row: TransferItem) {
  row.fromName = getAccountFullPath(row.fromCode)
}

function updateToName(row: TransferItem) {
  row.toName = getAccountFullPath(row.toCode)

  // 验证转入科目是否为明细科目
  if (row.toCode && !isDetailAccount(row.toCode)) {
    showWarning('转入科目必须是明细科目，不能选择父级科目')
    row.toCode = ''
    row.toName = ''
    return
  }

  // 验证是否只有一个转入科目
  if (row.toCode && selectedType.value) {
    const otherItems = selectedTypeItems.value.filter(item => item.id !== row.id)
    const existingToCodes = new Set(otherItems.map(item => item.toCode).filter(Boolean))

    if (existingToCodes.size > 0 && !existingToCodes.has(row.toCode)) {
      showWarning('每个结转类型只能有一个转入科目')
      row.toCode = ''
      row.toName = ''
      return
    }
  }
}

function handleTypeClick(row: TransferType) {
  selectedType.value = row
}

function addTransferType() {
  const newType: TransferType = {
    id: Date.now().toString(),
    code: (transferTypes.value.length + 1).toString().padStart(2, '0'),
    name: '新结转类型',
    voucherType: '结转',
    periodType: 'monthly',
  }
  transferTypes.value.push(newType)
  selectedType.value = newType
  showSuccess('已添加新的结转类型')
}

async function deleteTransferType(row: TransferType) {
  const confirmed = await useConfirm({
    message: '确定要删除这个结转类型吗？相关的结转配置也会被删除。',
    title: '提示',
    type: 'warning',
  })
  if (!confirmed) return

  transferTypes.value = transferTypes.value.filter(t => t.id !== row.id)
  transferItems.value = transferItems.value.filter(i => i.typeCode !== row.code)
  if (selectedType.value?.id === row.id) {
    selectedType.value = transferTypes.value[0] || null
  }
  showSuccess('删除成功')
}

function addItem() {
  if (!selectedType.value) {
    showWarning('请先选择一个结转类型')
    return
  }

  const newItem: TransferItem = {
    id: Date.now().toString(),
    typeCode: selectedType.value.code,
    summary: '结转',
    fromCode: '',
    fromName: '',
    toCode: '',
    toName: '',
    transferType: 'all',
    ratio: 100
  }
  transferItems.value.push(newItem)
}

function deleteItem(row: TransferItem) {
  transferItems.value = transferItems.value.filter(i => i.id !== row.id)
  showSuccess('删除成功')
}

async function deleteSelectedItems() {
  if (!selectedType.value) {
    showWarning('请先选择一个结转类型')
    return
  }

  const confirmed = await useConfirm({
    message: '确定要删除当前结转类型的所有配置吗？',
    title: '提示',
    type: 'warning',
  })
  if (!confirmed) return

  transferItems.value = transferItems.value.filter(i => i.typeCode !== selectedType.value?.code)
  showSuccess('删除成功')
}

async function fetchData() {
  const [accountRes, typeRes, itemRes] = await Promise.all([
    request.get<any[]>('/base/accounts'),
    request.get<TransferType[]>('/system/transfer-types'),
    request.get<TransferItem[]>('/system/transfer-items'),
  ])

  // 保存完整的科目数据（包含 children 信息）
  allAccountsWithChildren.value = accountRes.data || []

  // 构建树形结构以判断是否有子科目
  const accountMap: Record<string, any> = {}
  for (const acc of allAccountsWithChildren.value) {
    accountMap[acc.id] = { ...acc, children: [] }
  }
  for (const acc of allAccountsWithChildren.value) {
    if (acc.parent_id && accountMap[acc.parent_id]) {
      accountMap[acc.parent_id].children.push(accountMap[acc.id])
    }
  }
  // 更新 allAccountsWithChildren 为包含 children 的数据
  allAccountsWithChildren.value = Object.values(accountMap)

  // 简化的科目列表（用于显示）
  allAccounts.value = allAccountsWithChildren.value.map(acc => ({
    id: acc.id,
    code: acc.code,
    name: acc.name,
  }))

  // 构建 code -> 完整路径 映射
  const fullPathMap: Record<string, string> = {}
  const originalAccounts = accountRes.data || []
  for (const acc of originalAccounts) {
    const pathParts: string[] = []
    let current: any = acc
    // 向上遍历收集所有上级科目的名称
    while (current) {
      pathParts.unshift(current.name)
      const parent = originalAccounts.find((a: any) => a.id === current.parent_id)
      current = parent || null
    }
    // 完整路径格式: "上级1/上级2/当前"（去掉根节点自身，只保留上级路径+当前科目名）
    const fullPath = pathParts.slice(1).join('/')
    fullPathMap[acc.code] = fullPath || acc.name
  }
  accountFullPathMap.value = fullPathMap

  if (typeRes.data && typeRes.data.length > 0) {
    transferTypes.value = typeRes.data
  } else {
    transferTypes.value = []
  }

  if (itemRes.data && itemRes.data.length > 0) {
    transferItems.value = itemRes.data
    // 补充科目名称（使用完整路径）
    for (const item of transferItems.value) {
      if (item.fromCode) {
        item.fromName = accountFullPathMap.value[item.fromCode] || getAccountName(item.fromCode)
      }
      if (item.toCode) {
        item.toName = accountFullPathMap.value[item.toCode] || getAccountName(item.toCode)
      }
    }
  }

  if (transferTypes.value.length > 0) {
    selectedType.value = transferTypes.value[0]
  }
}

async function handleSave() {
  try {
    // 验证每个结转类型的转入科目
    for (const type of transferTypes.value) {
      const items = transferItems.value.filter(item => item.typeCode === type.code)
      if (items.length === 0) continue

      // 收集所有转入科目
      const toCodes = items.map(item => item.toCode).filter(Boolean)

      // 验证1：检查是否只有一个转入科目
      const uniqueToCodes = new Set(toCodes)
      if (uniqueToCodes.size > 1) {
        showWarning(`结转类型「${type.name}」有多个不同的转入科目，每个结转类型只能有一个转入科目`)
        return
      }

      // 验证2：检查转入科目是否为明细科目
      for (const toCode of uniqueToCodes) {
        if (!isDetailAccount(toCode)) {
          const account = allAccounts.value.find(a => a.code === toCode)
          showWarning(`结转类型「${type.name}」的转入科目「${account?.name || toCode}」不是明细科目，转入科目必须是明细科目`)
          return
        }
      }
    }

    await request.put('/system/transfer-types', { types: transferTypes.value })
    await request.put('/system/transfer-items', { items: transferItems.value })
    showSuccess('配置已保存')
  } catch (error) {
    showOperationError('保存结转配置', error)
  }
}

onMounted(async () => {
  try {
    await fetchData()
  } catch (err: any) {
    showOperationError('加载结转配置', err)
    transferTypes.value = []
    selectedType.value = null
  }
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
}
.page-header h3 {
  margin: 0;
}
.page-header-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  margin-right: 16px;
}
.toolbar-label {
  font-weight: 600;
  color: var(--el-color-primary);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.transfer-type-section {
  margin-bottom: 24px;
}

.transfer-content-section {
  margin-bottom: 24px;
}

.content-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.warning-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e6a23c;
  font-size: 12px;
  margin-left: auto;
}
.warning-icon {
  font-size: 14px;
}

.account-select {
  width: 100%;
}
.transfer-type-select {
  width: 110px;
}

/* 匹配的明细行高亮样式 */
:deep(.matched-item-row) {
  background-color: #e6f7ff !important;
}
:deep(.matched-item-row:hover) {
  background-color: #bae7ff !important;
}
</style>
