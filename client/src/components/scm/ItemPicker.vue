<template>
  <div class="item-picker">
    <el-input
      v-model="display"
      :placeholder="placeholder"
      size="small"
      clearable
      @focus="showPanel = true"
      @clear="clearItem"
    />
    <div v-if="showPanel" class="item-picker-dropdown">
      <div class="item-picker-search">
        <el-input v-model="keyword" placeholder="编号/名称/规格" size="small" clearable @input="search" />
      </div>
      <el-table
        :data="candidates"
        size="small"
        highlight-current-row
        max-height="200"
        @row-click="pickItem"
        @row-dblclick="pickItem"
      >
        <el-table-column label="编号" prop="code" width="100" />
        <el-table-column label="名称" prop="name" min-width="120" show-overflow-tooltip />
        <el-table-column label="规格" prop="spec" width="100" show-overflow-tooltip />
        <el-table-column label="单位" prop="unit" width="60" />
        <el-table-column label="存货科目" prop="inv_account" width="90" />
        <el-table-column label="存量" width="80" align="right">
          <template #default="{ row }">{{ (row._stock_qty || 0).toFixed(2) }}</template>
        </el-table-column>
      </el-table>
      <div class="item-picker-close">
        <el-button link size="small" @click="showPanel = false">收起</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { scmApi } from '@/api/scm'

const props = withDefaults(defineProps<{
  modelValue?: string
  warehouseCode?: string
  placeholder?: string
}>(), { modelValue: '', placeholder: '选择物料' })

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'pick', item: any): void }>()

const showPanel = ref(false)
const keyword = ref('')
const candidates = ref<any[]>([])
const display = ref('')
let debounce: any = null

onMounted(() => {
  if (props.modelValue) resolveDisplay(props.modelValue)
})
watch(() => props.modelValue, v => { if (v) resolveDisplay(v) })

async function resolveDisplay(code: string) {
  const res = await scmApi.getItems({ keyword: code, page_size: 1 })
  if (res.code === 0 && res.data.list.length > 0) {
    display.value = `${res.data.list[0].code} ${res.data.list[0].name}`
  } else {
    display.value = code
  }
}

function clearItem() { display.value = ''; emit('update:modelValue', '') }

async function search() {
  clearTimeout(debounce)
  debounce = setTimeout(async () => {
    const kw = keyword.value.trim()
    const res = await scmApi.getItems({ keyword: kw || undefined, page_size: 50 })
    if (res.code === 0) {
      // 查库存量
      const items = res.data.list as any[]
      if (props.warehouseCode) {
        try {
          const stockRes = await scmApi.getStock({ warehouse_code: props.warehouseCode })
          if (stockRes.code === 0) {
            const stockMap = new Map((stockRes.data as any[]).map(s => [s.item_code, s.qty]))
            items.forEach(i => (i as any)._stock_qty = stockMap.get(i.code) || 0)
          }
        } catch {}
      }
      candidates.value = items
    }
  }, 200)
}

function pickItem(row: any) {
  display.value = `${row.code} ${row.name}`
  emit('update:modelValue', row.code)
  emit('pick', row)
  showPanel.value = false
}
</script>

<style scoped>
.item-picker { position: relative; }
.item-picker-dropdown {
  position: absolute; z-index: 2000; background: #fff; border: 1px solid var(--el-border-color);
  border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.12); width: 520px; padding: 8px;
}
.item-picker-search { margin-bottom: 6px; }
.item-picker-close { text-align: right; margin-top: 4px; }
</style>
