<template>
  <div class="page scm-partner-page">
    <div class="page-header">
      <h3>{{ tabLabel }}</h3>
      <div class="filter-row">
        <el-input v-model="keyword" placeholder="编号/名称" clearable style="width:200px" @keyup.enter="load" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <el-button type="success" @click="openAdd"><el-icon><Plus /></el-icon>新增{{ tabLabel }}</el-button>
        <span class="total-hint">共 {{ list.length }} 条</span>
      </div>
    </div>

    <div v-if="!propType" class="partner-tabs">
      <el-radio-group v-model="activeTab" size="small" @change="onTabChange">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="supplier"><el-icon><Sell /></el-icon>供应商</el-radio-button>
        <el-radio-button value="customer"><el-icon><User /></el-icon>客户</el-radio-button>
      </el-radio-group>
    </div>

    <el-table :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 260px)" class="compact-data-table">
      <el-table-column label="编号" prop="code" width="110" />
      <el-table-column label="名称" prop="name" min-width="180" show-overflow-tooltip />
      <el-table-column label="属性" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.partner_type === 'supplier'" type="warning" size="small">供应商</el-tag>
          <el-tag v-else-if="row.partner_type === 'customer'" type="success" size="small">客户</el-tag>
          <el-tag v-else type="" size="small">双向</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="应收科目" prop="ar_account" width="100" />
      <el-table-column label="应付科目" prop="ap_account" width="100" />
      <el-table-column label="业务员" prop="salesman" width="90" />
      <el-table-column label="电话" prop="phone" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑往来单位' : '新增往来单位'" width="600px" draggable @keydown="onDialogKeydown">
      <el-form :model="form" label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="编号" required><el-input v-model="form.code" :disabled="!!editId" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="属性" required>
              <el-radio-group v-model="form.partner_type">
                <el-radio value="supplier">供应商</el-radio>
                <el-radio value="customer">客户</el-radio>
                <el-radio value="both">双向（既是客户又是供应商）</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="简称"><el-input v-model="form.short_name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="应收科目"><AccountSelect v-model="form.ar_account" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="应付科目"><AccountSelect v-model="form.ap_account" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="信用额度"><el-input-number v-model="form.credit_limit" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="税率%"><el-input-number v-model="form.tax_rate" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="业务员"><el-input v-model="form.salesman" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="税号"><el-input v-model="form.tax_no" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="地址"><el-input v-model="form.address" /></el-form-item></el-col>
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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Sell, User } from '@element-plus/icons-vue'
import { scmApi, type ScmPartner } from '@/api/scm'
import AccountSelect from '@/components/base/AccountSelect.vue'

const route = useRoute()
const propType = computed(() => (route.query.partner_type as string) || '')

const list = ref<ScmPartner[]>([])
const loading = ref(false)
const keyword = ref('')
const activeTab = ref(propType.value)

const tabLabel = computed(() => {
  if (propType.value === 'supplier') return '供应商档案'
  if (propType.value === 'customer') return '客户档案'
  if (activeTab.value === 'supplier') return '供应商'
  if (activeTab.value === 'customer') return '客户'
  return '往来单位'
})

// 从导航固定类型进入时，锁定类型
watch(propType, v => { activeTab.value = v; load() })

async function load() {
  loading.value = true
  try {
    const res = await scmApi.getPartners({
      keyword: keyword.value || undefined,
      partner_type: activeTab.value || undefined,
    })
    if (res.code === 0) list.value = res.data
  } finally { loading.value = false }
}

function onTabChange() { load() }

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const form = ref<Partial<ScmPartner>>({})

async function openAdd() {
  editId.value = null
  form.value = { partner_type: propType.value || 'both', credit_limit: 0, tax_rate: 0 }
  dialogVisible.value = true
  try { const r = await scmApi.getPartnerNextNo(propType.value || undefined); if (r.code === 0) form.value.code = r.data.next_no } catch {}
}
function openEdit(row: ScmPartner) { editId.value = row.id; form.value = { ...row }; dialogVisible.value = true }

async function handleSave(continueAdd = false) {
  if (!form.value.code || !form.value.name) return ElMessage.warning('编号和名称不能为空')
  saving.value = true
  try {
    if (editId.value) await scmApi.updatePartner(editId.value, form.value)
    else await scmApi.createPartner(form.value)
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

async function handleDelete(row: ScmPartner) {
  await ElMessageBox.confirm(`确认删除「${row.name}」？`, '提示', { type: 'warning' })
  await scmApi.deletePartner(row.id); ElMessage.success('已删除'); load()
}

onMounted(load)
</script>

<style scoped>
.scm-partner-page { padding: 12px 16px; }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.total-hint { font-size: 13px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
