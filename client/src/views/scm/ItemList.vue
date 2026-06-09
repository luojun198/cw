<template>
  <div class="page scm-item-page">
    <div class="page-header">
      <h3>物料档案</h3>
      <div class="filter-row">
        <el-input v-model="filters.keyword" placeholder="编号/名称/规格" clearable style="width:200px" @keyup.enter="load" />
        <el-select v-model="filters.item_type" placeholder="属性" clearable style="width:120px">
          <el-option v-for="(n,k) in ITEM_TYPES" :key="k" :label="n" :value="k" />
        </el-select>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <el-button type="success" @click="() => openAdd(null)"><el-icon><Plus /></el-icon>新增顶级</el-button>
        <span class="level-nav">
          <el-button-group size="small">
            <el-button :disabled="expandedKeys.length === 0" @click="collapseAll" title="全部折叠 (Ctrl+\\)">顶层</el-button>
            <el-button @click="goUpLevel" title="上级 (Ctrl+Up)">上级</el-button>
            <el-button @click="goDownLevel" title="下级 (Ctrl+Down)">下级</el-button>
            <el-button @click="expandAll" title="全部展开 (Ctrl+Shift+\\)">底层</el-button>
          </el-button-group>
        </span>
        <span class="total-hint">共 {{ total }} 条</span>
      </div>
    </div>

    <el-table
      v-if="!hasSearch"
      :data="treeData"
      v-loading="loading"
      row-key="id"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :expand-row-keys="expandedKeys"
      border stripe size="small"
      height="calc(100vh - 200px)"
      class="compact-data-table"
      @expand-change="handleExpandChange"
    >
      <el-table-column label="编号" prop="code" width="120" />
      <el-table-column label="名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="规格" prop="spec" width="120" show-overflow-tooltip />
      <el-table-column label="单位" width="70">
        <template #default="{ row }">{{ row.unit_name || row.unit }}</template>
      </el-table-column>
      <el-table-column label="属性" width="90">
        <template #default="{ row }">{{ ITEM_TYPES[row.item_type] || row.item_type }}</template>
      </el-table-column>
      <el-table-column label="进价" prop="purchase_price" width="90" align="right" />
      <el-table-column label="售价" prop="sale_price" width="90" align="right" />
      <el-table-column label="资产" width="60" align="center">
        <template #default="{ row }"><el-tag v-if="row.is_asset" size="small" type="warning">资产</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="success" size="small" @click="openAdd(row)">加子</el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 搜索模式：扁平列表 -->
    <el-table
      v-else
      :data="list" v-loading="loading" border stripe size="small"
      height="calc(100vh - 200px)" class="compact-data-table"
    >
      <el-table-column label="编号" prop="code" width="120" />
      <el-table-column label="名称" prop="name" min-width="180" show-overflow-tooltip />
      <el-table-column label="规格" prop="spec" width="120" show-overflow-tooltip />
      <el-table-column label="单位" width="70">
        <template #default="{ row }">{{ row.unit_name || row.unit }}</template>
      </el-table-column>
      <el-table-column label="属性" width="90">
        <template #default="{ row }">{{ ITEM_TYPES[row.item_type] || row.item_type }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑物料' : '新增物料'" width="640px" draggable @keydown="onDialogKeydown">
      <el-form :model="form" label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="上级物料">
              <el-tree-select
                v-model="form.parent_id"
                :data="treeSelectData"
                :props="{ value: 'id', label: 'name', children: 'children' }"
                check-strictly filterable clearable
                placeholder="不选则为顶级"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12"></el-col>
          <el-col :span="12"><el-form-item label="编号" required><el-input v-model="form.code" :disabled="!!editId" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="规格"><el-input v-model="form.spec" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="主单位" required>
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.primary_unit_code" filterable placeholder="选择单位" style="flex:1" clearable>
                  <el-option v-for="u in unitOptions" :key="u.code" :label="u.name" :value="u.code" />
                </el-select>
                <el-button size="small" @click="showQuickUnit=true"><el-icon><Plus /></el-icon></el-button>
              </div>
              <div v-if="showQuickUnit" style="display:flex;gap:4px;margin-top:4px">
                <el-input v-model="quickUnitName" placeholder="新单位名称" size="small" style="width:100px" @keyup.enter="handleQuickAddUnit" />
                <el-button type="primary" size="small" :loading="quickUnitSaving" @click="handleQuickAddUnit">确定</el-button>
                <el-button size="small" @click="showQuickUnit=false">取消</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="副单位">
              <div v-for="(su, i) in form.secondary_units" :key="i" style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <el-select v-model="su.unit_code" filterable placeholder="单位" style="width:140px">
                  <el-option v-for="u in unitOptions" :key="u.code" :label="u.name" :value="u.code" />
                </el-select>
                <span style="font-size:12px;white-space:nowrap">1 主单位 =</span>
                <el-input-number v-model="su.conversion_rate" :min="0.0001" :precision="4" :controls="false" style="width:100px" placeholder="系数" />
                <span style="font-size:12px;white-space:nowrap">副单位</span>
                <el-button link type="danger" size="small" @click="removeSecondaryUnit(i)">×</el-button>
              </div>
              <el-button size="small" @click="addSecondaryUnit">+ 添加副单位</el-button>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="属性">
            <el-select v-model="form.item_type" clearable style="width:100%">
              <el-option v-for="(n,k) in ITEM_TYPES" :key="k" :label="n" :value="k" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="条码"><el-input v-model="form.barcode" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="进价"><el-input-number v-model="form.purchase_price" :precision="4" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="售价"><el-input-number v-model="form.sale_price" :precision="4" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="指定成本"><el-input-number v-model="form.fixed_cost" :precision="4" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="存货科目"><AccountSelect v-model="form.inv_account" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="销售科目"><AccountSelect v-model="form.sale_account" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="批号管理"><el-switch v-model="form.batch_flag" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="采购生成资产"><el-switch v-model="form.is_asset" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: nowrap;">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-if="!editId" :loading="saving" @click="handleSave(true)">保存并新增 (Ctrl+Enter)</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave(false)">保存 (Enter)</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { scmApi, ITEM_TYPES, type ScmItem, type ScmUnit } from '@/api/scm'
import AccountSelect from '@/components/base/AccountSelect.vue'

const allList = ref<ScmItem[]>([])  // 全量扁平数据
const list = ref<ScmItem[]>([])    // 搜索模式下的扁平结果
const total = ref(0)
const loading = ref(false)
const filters = reactive({ keyword: '', item_type: '' })
const unitOptions = ref<ScmUnit[]>([])
const hasSearch = computed(() => !!(filters.keyword || filters.item_type))

// 分级参数
const itemLevels = ref(4)
const itemCodeLengths = ref([2, 2, 2, 2])

async function loadParams() {
  try { const r = await scmApi.getParams()
    for (const p of r.data as any[]) {
      if (p.param_key === 'scm:item_levels') itemLevels.value = parseInt(p.param_value) || 4
      else if (p.param_key === 'scm:item_code_lengths') {
        try { itemCodeLengths.value = JSON.parse(p.param_value).map(Number) }
        catch { itemCodeLengths.value = (p.param_value || '2,2,2,2').split(',').map(Number) }
      }
    }
  } catch {}
}

async function load() {
  loading.value = true
  try {
    if (hasSearch.value) {
      // 搜索模式：分页查询
      const res = await scmApi.getItems({ keyword: filters.keyword || undefined, item_type: filters.item_type || undefined, page: 1, page_size: 100 })
      if (res.code === 0) { list.value = (res.data as any).list; total.value = (res.data as any).total }
    } else {
      // 树模式：全量加载
      const res = await (scmApi.getItems as any)({ all: '1' })
      if (res.code === 0) { allList.value = (res.data as any).list; total.value = allList.value.length }
    }
  } finally { loading.value = false }
}

// ── 树构建 ──
const treeData = computed(() => buildTree(allList.value))
function buildTree(items: any[]): any[] {
  const map = new Map<string, any>()
  for (const item of items) {
    map.set(item.id, { ...item, children: [] })
  }
  const roots: any[] = []
  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// 树选择器数据（排除编辑时自身及子孙）
const treeSelectData = computed(() => {
  if (!editId.value) return treeData.value
  // 排除自身
  return filterOutSelf(treeData.value, editId.value)
})
function filterOutSelf(nodes: any[], excludeId: string): any[] {
  return nodes.filter(n => n.id !== excludeId).map(n => ({
    ...n, children: filterOutSelf(n.children || [], excludeId)
  }))
}

// ── 展开/折叠 ──
const expandedSet = ref<Set<string>>(new Set())
const expandedKeys = computed(() => [...expandedSet.value])

function handleExpandChange(row: any, expanded: boolean) {
  const s = new Set(expandedSet.value)
  if (expanded) s.add(row.id); else s.delete(row.id)
  expandedSet.value = s
}

function collapseAll() { expandedSet.value = new Set() }
function expandAll() {
  const s = new Set<string>()
  function walk(nodes: any[]) { for (const n of nodes) { if (n.children?.length) { s.add(n.id); walk(n.children) } } }
  walk(treeData.value)
  expandedSet.value = s
}

function goUpLevel() {
  if (expandedSet.value.size === 0) return
  const nodes = flatten(treeData.value)
  const maxDepth = nodes.filter(n => expandedSet.value.has(n.id)).reduce((m, n) => Math.max(m, n.level || 1), 0)
  const s = new Set(expandedSet.value)
  for (const n of nodes) { if ((n.level || 1) === maxDepth) s.delete(n.id) }
  expandedSet.value = s
}

function goDownLevel() {
  if (expandedSet.value.size === 0) {
    // 展开第一层
    const s = new Set<string>()
    for (const n of treeData.value) { if (n.children?.length) s.add(n.id) }
    expandedSet.value = s
    return
  }
  const nodes = flatten(treeData.value)
  const maxDepth = nodes.filter(n => expandedSet.value.has(n.id)).reduce((m, n) => Math.max(m, n.level || 1), 0)
  const s = new Set(expandedSet.value)
  for (const n of nodes) {
    if (expandedSet.value.has(n.id) && n.children?.length) {
      for (const c of n.children) { if (c.children?.length) s.add(c.id) }
    }
  }
  expandedSet.value = s
}

function flatten(nodes: any[]): any[] {
  const res: any[] = []
  function walk(ns: any[]) { for (const n of ns) { res.push(n); if (n.children) walk(n.children) } }
  walk(nodes)
  return res
}

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const form = ref<Partial<ScmItem>>({})

async function openAdd(parent?: ScmItem | null) {
  editId.value = null
  form.value = { purchase_price: 0, sale_price: 0, fixed_cost: 0, batch_flag: 0, is_asset: 0, primary_unit_code: '', secondary_units: [], parent_id: parent?.id || '' }
  dialogVisible.value = true
  // 自动编号
  form.value.code = buildNextCode(parent?.id || null)
}

async function openEdit(row: ScmItem) {
  editId.value = row.id
  form.value = {
    ...row,
    parent_id: (row as any).parent_id || '',
    primary_unit_code: row.primary_unit_code || '',
    secondary_units: (row.secondary_units || []).map(s => ({ ...s })),
  }
  dialogVisible.value = true
}

// 自动编号逻辑
function buildNextCode(parentId: string | null): string {
  if (!parentId) {
    // 顶级：简单取前缀 + 最大编号
    const prefix = 'IT'
    const items = allList.value.filter(i => !i.parent_id)
    const maxNo = items.reduce((m, i) => {
      const n = parseInt(String(i.code).replace(/^\D+/,'')) || 0
      return Math.max(m, n)
    }, 0)
    return prefix + String(maxNo + 1).padStart(4, '0')
  }
  const parent = allList.value.find(i => i.id === parentId)
  if (!parent) return buildNextCode(null)
  const newLevel = ((parent as any).level || 1) + 1
  const segLen = itemCodeLengths.value[newLevel - 1] || 2
  const prefix = parent.code
  const siblings = allList.value.filter(i => (i as any).parent_id === parentId)
  const maxNo = siblings.reduce((m, s) => {
    const suffix = String(s.code).slice(prefix.length)
    return Math.max(m, parseInt(suffix) || 0)
  }, 0)
  const nextNo = maxNo + 1
  if (nextNo > Math.pow(10, segLen) - 1) return prefix + String(nextNo).padStart(segLen, '0')
  return prefix + String(nextNo).padStart(segLen, '0')
}

// 上级变更时重新编号（新增模式时）
watch(() => form.value.parent_id, (newPid) => {
  if (!editId.value) form.value.code = buildNextCode(newPid || null)
})
function addSecondaryUnit() {
  if (!form.value.secondary_units) form.value.secondary_units = []
  form.value.secondary_units.push({ unit_code: '', conversion_rate: 1 })
}
function removeSecondaryUnit(i: number) { form.value.secondary_units?.splice(i, 1) }

async function handleSave(continueAdd = false) {
  if (!form.value.code || !form.value.name) return ElMessage.warning('编号和名称不能为空')
  saving.value = true
  try {
    if (editId.value) await scmApi.updateItem(editId.value, form.value)
    else await scmApi.createItem(form.value)
    ElMessage.success(continueAdd ? '保存成功，可继续新增' : '保存成功')
    load()
    if (continueAdd) {
      await openAdd()
    } else {
      dialogVisible.value = false
    }
  } finally { saving.value = false }
}

function onDialogKeydown(e: KeyboardEvent) {
  if (!dialogVisible.value || saving.value) return
  if (e.key !== 'Enter') return
  const target = e.target as HTMLElement
  if (target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    if (!editId.value) handleSave(true)
    else handleSave(false)
  } else {
    handleSave(false)
  }
}

async function handleDelete(row: ScmItem) {
  await ElMessageBox.confirm(`确认删除物料「${row.name}」？`, '提示', { type: 'warning' })
  await scmApi.deleteItem(row.id)
  ElMessage.success('已删除')
  load()
}

async function loadUnits() {
  try { const r = await scmApi.getUnits(); if (r.code === 0) unitOptions.value = r.data } catch {}
}

// 快速新增单位
const showQuickUnit = ref(false)
const quickUnitName = ref('')
const quickUnitSaving = ref(false)
async function handleQuickAddUnit() {
  const name = quickUnitName.value.trim()
  if (!name) return ElMessage.warning('请输入单位名称')
  quickUnitSaving.value = true
  try {
    const r1 = await scmApi.getUnitNextNo()
    const code = r1.code === 0 ? r1.data.next_no : 'UN' + Date.now()
    const r2 = await scmApi.createUnit({ code, name, enabled: 1 })
    if (r2.code === 0) {
      ElMessage.success(`已新增单位：${name}`)
      await loadUnits()
      form.value.primary_unit_code = code
      showQuickUnit.value = false
      quickUnitName.value = ''
    }
  } catch {} finally { quickUnitSaving.value = false }
}

onMounted(async () => { await loadParams(); load(); loadUnits() })
</script>

<style scoped>
.scm-item-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
