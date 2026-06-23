<template>
  <div class="item-picker" ref="pickerRef">
    <el-input
      v-model="display"
      :placeholder="placeholder"
      :readonly="autoOpen"
      size="small"
      clearable
      @click="onMainInputClick"
      @focus="onMainInputFocus"
      @input="handleMainInput"
      @clear="clearItem"
      @keydown.esc="showPanel = false"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
      <template v-if="browsable" #suffix>
        <el-icon
          class="ip-browse-btn"
          title="浏览选择物料"
          @mousedown.prevent.stop
          @click.stop="openBrowse"
        ><Grid /></el-icon>
      </template>
    </el-input>

    <!-- 系统通用物料选择模态框（浏览按钮调起） -->
    <ItemBatchPicker
      v-if="browsable"
      v-model="browseVisible"
      :multiple="browseMultiple"
      @confirm="onBrowseConfirm"
    />

    <Teleport to="body">
      <div
        v-if="showPanel"
        ref="dropdownRef"
        class="item-picker-dropdown"
        :style="dropdownStyle"
        @mousedown.stop
        @click.stop
      >
        <div class="item-picker-search">
          <el-input
            ref="searchInputRef"
            v-model="keyword"
            placeholder="编号/名称/规格"
            size="small"
            clearable
            @input="handleSearchInput"
            @keydown.esc="showPanel = false"
          />
        </div>
        <el-table
          v-loading="loading"
          :data="candidates"
          size="small"
          highlight-current-row
          max-height="340"
          border
          :row-class-name="rowClassName"
          @row-click="pickItem"
          class="compact-table"
        >
          <el-table-column label="编号" prop="code" width="120">
            <template #default="{ row }">
              <span :style="{ paddingLeft: indentOf(row) }">
                {{ row.code }}
                <el-tag v-if="isCategory(row)" size="small" type="info" effect="plain" class="cat-tag">目录</el-tag>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="名称" prop="name" min-width="120" show-overflow-tooltip />
          <el-table-column label="规格" prop="spec" width="100" show-overflow-tooltip />
          <el-table-column label="单位" prop="unit" width="60" />
          <el-table-column label="存量" width="80" align="right">
            <template #default="{ row }">
              <span v-if="!isCategory(row)" :class="row._stock_qty > 0 ? 'text-success' : 'text-muted'">
                {{ (row._stock_qty || 0).toFixed(2) }}
              </span>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="candidates.length === 0 && !loading" class="no-data">
          未找到匹配物料
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { ElInput } from 'element-plus'
import { scmApi } from '@/api/scm'
import { Search, Grid } from '@element-plus/icons-vue'
import ItemBatchPicker from '@/components/scm/ItemBatchPicker.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  warehouseCode?: string
  placeholder?: string
  /** 挂载即展开候选面板：用于"点击单元格进入编辑"的场景 */
  autoOpen?: boolean
  /** 展开后聚焦下拉内检索框（双击物料单元格时使用） */
  focusSearch?: boolean
  /** 是否显示「浏览」按钮调起系统模态框（默认显示） */
  browsable?: boolean
  /** 浏览模态框是否多选（默认单选，返回一个物料） */
  browseMultiple?: boolean
}>(), { modelValue: '', placeholder: '输入编号/名称进行搜索', autoOpen: false, focusSearch: false, browsable: true, browseMultiple: false })

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'pick', item: any): void
  /** 浏览模态框多选确认时返回多个物料 */
  (e: 'pick-multiple', items: any[]): void
}>()

const browseVisible = ref(false)
function openBrowse() {
  showPanel.value = false
  browseVisible.value = true
}
function onBrowseConfirm(items: any[]) {
  if (!items || !items.length) return
  if (props.browseMultiple) {
    emit('pick-multiple', items)
    return
  }
  const it = items[0]
  display.value = `${it.code} ${it.name}`
  keyword.value = it.code
  emit('update:modelValue', it.code)
  emit('pick', it)
  showPanel.value = false
}

const pickerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<InstanceType<typeof ElInput> | null>(null)
const showPanel = ref(false)
const loading = ref(false)
const candidates = ref<any[]>([])
const display = ref('')
const keyword = ref('')
const dropdownStyle = ref<Record<string, string>>({})
let debounce: any = null
/** 打开面板后短暂忽略外部 click（含双击的第二次 click） */
let suppressOutsideClick = false

function updateDropdownPosition() {
  if (!pickerRef.value) return
  const rect = pickerRef.value.getBoundingClientRect()
  const panelWidth = 560
  let left = rect.left
  if (left + panelWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - panelWidth - 8)
  }
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
    zIndex: '3000',
  }
}

function syncKeywordFromDisplay() {
  const text = display.value.trim()
  keyword.value = text.includes(' ') ? text.split(' ')[0] : text
}

async function openPanel(opts?: { focusSearch?: boolean }) {
  suppressOutsideClick = true
  showPanel.value = true
  syncKeywordFromDisplay()
  search(keyword.value)
  await nextTick()
  updateDropdownPosition()
  if (opts?.focusSearch) {
    await focusSearchInput()
  }
  // 双击第二次 click 会在 ~50ms 内到达，需足够窗口
  setTimeout(() => { suppressOutsideClick = false }, 400)
}

onMounted(async () => {
  if (props.modelValue) resolveDisplay(props.modelValue)
  window.addEventListener('scroll', updateDropdownPosition, true)
  window.addEventListener('resize', updateDropdownPosition)
  await nextTick()
  document.addEventListener('click', handleClickOutside)
  if (props.autoOpen) {
    await openPanel({ focusSearch: props.focusSearch })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', updateDropdownPosition, true)
  window.removeEventListener('resize', updateDropdownPosition)
})

watch(showPanel, async (open) => {
  if (!open) return
  await nextTick()
  updateDropdownPosition()
})

watch(() => props.modelValue, v => {
  if (v) resolveDisplay(v)
  else display.value = ''
})

watch(() => props.focusSearch, async (v) => {
  if (!v) return
  await openPanel({ focusSearch: true })
})

async function resolveDisplay(code: string) {
  if (!code) return
  if (display.value.startsWith(code + ' ')) return

  const res = await scmApi.getItems({ keyword: code, page_size: 1 })
  if (res.code === 0 && res.data.list.length > 0) {
    const item = res.data.list[0]
    display.value = `${item.code} ${item.name}`
  } else {
    display.value = code
  }
}

function handleClickOutside(e: MouseEvent) {
  if (suppressOutsideClick) return
  const target = e.target as Node
  if (pickerRef.value?.contains(target)) return
  if (dropdownRef.value?.contains(target)) return
  showPanel.value = false
}

async function focusSearchInput() {
  await nextTick()
  const input = searchInputRef.value?.input as HTMLInputElement | undefined
  input?.focus()
  input?.select()
}

function onMainInputClick() {
  if (props.autoOpen && !showPanel.value) {
    openPanel({ focusSearch: false })
  }
}

function onMainInputFocus() {
  if (!props.autoOpen) {
    openPanel({ focusSearch: true })
  }
}

function handleMainInput(val: string) {
  if (props.autoOpen) return
  keyword.value = val.includes(' ') ? val.split(' ')[0] : val
  openPanel({ focusSearch: false })
  search(keyword.value)
}

function handleSearchInput(val: string) {
  showPanel.value = true
  search(val)
}

function clearItem() {
  display.value = ''
  keyword.value = ''
  emit('update:modelValue', '')
  candidates.value = []
}

async function search(kw: string) {
  clearTimeout(debounce)
  debounce = setTimeout(async () => {
    loading.value = true
    try {
      const searchKw = kw.trim()
      // 全量加载（与批量选择器一致），避免成品等编码靠后的物料因分页被截断而选不到
      const res = await scmApi.getItems({ keyword: searchKw || undefined, all: '1' })
      if (res.code === 0) {
        const items = res.data.list as any[]
        if (props.warehouseCode) {
          const stockRes = await scmApi.getStock({ warehouse_code: props.warehouseCode })
          if (stockRes.code === 0) {
            const stockMap = new Map((stockRes.data as any[]).map(s => [s.item_code, s.qty]))
            items.forEach(i => i._stock_qty = stockMap.get(i.code) || 0)
          }
        }
        candidates.value = items
      }
    } finally {
      loading.value = false
    }
  }, 200)
}

function isCategory(row: any) {
  return row && (row.is_leaf === 0 || row.is_leaf === '0')
}
function indentOf(row: any) {
  const lv = Number(row?.level) || 1
  return `${(lv - 1) * 12}px`
}
function rowClassName({ row }: { row: any }) {
  return isCategory(row) ? 'category-row' : ''
}

function pickItem(row: any) {
  if (isCategory(row)) return
  display.value = `${row.code} ${row.name}`
  keyword.value = row.code
  emit('update:modelValue', row.code)
  emit('pick', row)
  showPanel.value = false
}

defineExpose({ openPanel })
</script>

<style scoped>
.item-picker { position: relative; width: 100%; }
.ip-browse-btn {
  cursor: pointer;
  color: var(--el-text-color-placeholder);
  transition: color 0.15s;
}
.ip-browse-btn:hover {
  color: var(--el-color-primary);
}
.item-picker-dropdown {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 4px;
}
.item-picker-search { margin-bottom: 6px; }
.no-data {
  padding: 20px; text-align: center; color: var(--el-text-color-secondary); font-size: 13px;
}
.text-success { color: var(--el-color-success); }
.text-muted { color: var(--el-text-color-placeholder); }

.compact-table :deep(.el-table__cell) {
  padding: 4px 0;
}
.cat-tag { margin-left: 4px; transform: scale(0.85); transform-origin: left center; }

.compact-table :deep(.category-row) {
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-lighter);
  cursor: not-allowed;
}
.compact-table :deep(.category-row:hover > td.el-table__cell) {
  background: var(--el-fill-color-lighter) !important;
}
.compact-table :deep(.category-row .cell) {
  font-weight: 600;
}
</style>
