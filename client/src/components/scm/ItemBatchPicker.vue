<template>
  <el-dialog
    v-model="visible"
    title="批量选择物料"
    fullscreen
    :close-on-click-modal="false"
    destroy-on-close
    class="item-batch-picker-dialog"
    @open="onOpen"
  >
    <!-- 对话框头部工具栏 -->
    <div class="ibp-toolbar">
      <div class="ibp-toolbar__left">
        <el-input
          v-model="keyword"
          placeholder="搜索编号 / 名称 / 规格"
          clearable
          style="width: 280px"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select
          v-model="filterType"
          placeholder="全部属性"
          clearable
          style="width: 130px"
        >
          <el-option
            v-for="(label, key) in itemTypeMap"
            :key="key"
            :label="label"
            :value="key"
          />
        </el-select>
        <span class="ibp-hint">仅显示明细物料，双击行可快速选中</span>
      </div>
      <div class="ibp-toolbar__right">
        <el-tag v-if="selected.length" type="primary" size="large" effect="plain" class="ibp-count-tag">
          已选 {{ selected.length }} 项
        </el-tag>
        <el-button @click="clearSelection">清空选择</el-button>
        <el-button type="primary" :disabled="selected.length === 0" @click="confirm">
          确认添加 {{ selected.length > 0 ? `(${selected.length}项)` : '' }}
        </el-button>
      </div>
    </div>

    <!-- 主体：左侧树形分类 + 右侧物料列表 -->
    <div class="ibp-body">
      <!-- 左侧分类导航（目录层级） -->
      <div class="ibp-sidebar">
        <div class="ibp-sidebar__title">物料分类</div>
        <el-scrollbar height="calc(100vh - 160px)">
          <div
            class="ibp-cat-item"
            :class="{ 'is-active': !filterCategory }"
            @click="filterCategory = ''"
          >全部物料</div>
          <div
            v-for="cat in categories"
            :key="cat.id"
            class="ibp-cat-item"
            :class="{ 'is-active': filterCategory === cat.id }"
            :style="{ paddingLeft: `${14 + ((cat.level || 1) - 1) * 12}px` }"
            @click="filterCategory = cat.id"
          >
            <span class="ibp-cat-code">{{ cat.code }}</span>
            <span class="ibp-cat-name">{{ cat.name }}</span>
          </div>
        </el-scrollbar>
      </div>

      <!-- 右侧物料列表 -->
      <div class="ibp-main">
        <el-table
          ref="tableRef"
          v-loading="loading"
          :data="list"
          border
          size="small"
          height="calc(100vh - 160px)"
          row-key="id"
          @selection-change="onSelectionChange"
          @row-dblclick="onRowDblClick"
          class="ibp-table"
        >
          <el-table-column type="selection" width="46" :selectable="isSelectable" reserve-selection />
          <el-table-column label="编号" prop="code" width="140" sortable />
          <el-table-column label="名称" prop="name" min-width="160" show-overflow-tooltip />
          <el-table-column label="规格" prop="spec" width="120" show-overflow-tooltip />
          <el-table-column label="单位" width="70">
            <template #default="{ row }">{{ row.unit_name || row.unit }}</template>
          </el-table-column>
          <el-table-column label="属性" width="90">
            <template #default="{ row }">{{ itemTypeMap[row.item_type] || row.item_type }}</template>
          </el-table-column>
          <el-table-column label="进价" prop="purchase_price" width="90" align="right">
            <template #default="{ row }">{{ row.purchase_price ? row.purchase_price.toFixed(4) : '' }}</template>
          </el-table-column>
          <el-table-column label="售价" prop="sale_price" width="90" align="right">
            <template #default="{ row }">{{ row.sale_price ? row.sale_price.toFixed(4) : '' }}</template>
          </el-table-column>
          <el-table-column label="备注" prop="remark" min-width="120" show-overflow-tooltip />
        </el-table>

        <!-- 分页 -->
        <div class="ibp-pagination">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[50, 100, 200, 500]"
            layout="total, sizes, prev, pager, next"
            background
            small
          />
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElTable } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { scmApi, type ScmItem } from '@/api/scm'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', items: ScmItem[]): void
}>()

const visible = ref(false)

watch(() => props.modelValue, v => { visible.value = v })
watch(visible, v => emit('update:modelValue', v))

// ──────────────────────────── 数据 ────────────────────────────
const tableRef = ref<InstanceType<typeof ElTable> | null>(null)
const loading = ref(false)
const allList = ref<ScmItem[]>([])
const categories = ref<ScmItem[]>([])
const filteredList = ref<ScmItem[]>([])
const list = ref<ScmItem[]>([])

const total = ref(0)
const page = ref(1)
const pageSize = ref(100)
const keyword = ref('')
const filterType = ref('')
const filterCategory = ref('') // 分类目录 ID
const selected = ref<ScmItem[]>([])

const itemTypeMap: Record<string, string> = {
  raw: '原材料',
  semi: '半成品',
  finished: '成品',
  auxiliary: '辅料',
  tool: '工具',
  other: '其他',
}

// ──────────────────────────── 事件 ────────────────────────────
function onOpen() {
  keyword.value = ''
  filterType.value = ''
  filterCategory.value = ''
  page.value = 1
  selected.value = []
  clearSelection()
  loadAllData()
}

function onSelectionChange(rows: ScmItem[]) {
  selected.value = rows
}

function onRowDblClick(row: ScmItem) {
  if (!isSelectable(row)) return
  tableRef.value?.toggleRowSelection(row)
}

function isSelectable(row: ScmItem) {
  return row.is_leaf === 1 || row.is_leaf === undefined
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selected.value = []
}

function confirm() {
  emit('confirm', [...selected.value])
  visible.value = false
}

// ──────────────────────────── 数据加载与过滤 ────────────────────────────
async function loadAllData() {
  loading.value = true
  try {
    const res = await (scmApi.getItems as any)({ all: '1' })
    if (res.code === 0) {
      allList.value = res.data.list || []
      // 提取目录作为左侧分类
      categories.value = allList.value.filter(i => i.is_leaf === 0)
      updateFilteredList()
    }
  } catch (e) {
    console.error('加载物料数据失败:', e)
  } finally {
    loading.value = false
  }
}

function updateFilteredList() {
  // 只取明细物料
  let items = allList.value.filter(i => i.is_leaf === 1 || i.is_leaf === undefined)

  // 1. 左侧分类树回溯过滤
  if (filterCategory.value) {
    const catId = filterCategory.value
    const idMap = new Map(allList.value.map(i => [i.id, i]))
    items = items.filter(item => {
      let cur = item
      while (cur && cur.parent_id) {
        if (cur.parent_id === catId) return true
        cur = idMap.get(cur.parent_id) as ScmItem
      }
      return false
    })
  }

  // 2. 属性过滤
  if (filterType.value) {
    items = items.filter(i => i.item_type === filterType.value)
  }

  // 3. 关键字过滤
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase()
    items = items.filter(i =>
      (i.code && i.code.toLowerCase().includes(kw)) ||
      (i.name && i.name.toLowerCase().includes(kw)) ||
      (i.spec && i.spec.toLowerCase().includes(kw))
    )
  }

  filteredList.value = items
  total.value = items.length

  const maxPage = Math.ceil(total.value / pageSize.value) || 1
  if (page.value > maxPage) {
    page.value = maxPage
  }

  paginate()
}

function paginate() {
  const start = (page.value - 1) * pageSize.value
  const end = page.value * pageSize.value
  list.value = filteredList.value.slice(start, end)
}

// 监听过滤条件，当改变时回到第一页并重新过滤
watch([keyword, filterType, filterCategory, pageSize], () => {
  page.value = 1
  updateFilteredList()
})

// 监听页码改变，仅做切片
watch(page, () => {
  paginate()
})
</script>

<style>
/* 全局样式（非 scoped），确保 fullscreen dialog 的内部不裁剪 */
.item-batch-picker-dialog .el-dialog__body {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 54px); /* 减去 dialog header 高度 */
  overflow: hidden;
}
</style>

<style scoped>
/* 工具栏 */
.ibp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}
.ibp-toolbar__left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ibp-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ibp-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.ibp-count-tag {
  font-size: 13px;
  padding: 0 12px;
  height: 30px;
  line-height: 28px;
}

/* 主体布局 */
.ibp-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 左侧分类 */
.ibp-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-lighter);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ibp-sidebar__title {
  padding: 10px 14px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 1px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.ibp-cat-item {
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.ibp-cat-item:hover {
  background: var(--el-fill-color);
}
.ibp-cat-item.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}
.ibp-cat-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.ibp-cat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧主体 */
.ibp-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ibp-table {
  flex: 1;
}

/* 表格行双击视觉提示 */
.ibp-table :deep(.el-table__row) {
  cursor: pointer;
}

/* 分页 */
.ibp-pagination {
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-light);
  display: flex;
  justify-content: flex-end;
  background: var(--el-bg-color);
  flex-shrink: 0;
}
</style>
