<template>
  <div class="page scm-partner-page">
    
    <div v-if="!propType" class="partner-tabs">
      <el-radio-group v-model="activeTab" size="small" @change="onTabChange">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="supplier"><el-icon><Sell /></el-icon>供应商</el-radio-button>
        <el-radio-button value="customer"><el-icon><User /></el-icon>客户</el-radio-button>
      </el-radio-group>
    </div>

    <el-table ref="tableRef" :data="list" v-loading="loading" border stripe size="small" height="calc(100vh - 260px)" class="compact-data-table" @header-dragend="onDragEnd">
      <el-table-column label="编号" prop="code" :width="cw('code', 110)" />
      <el-table-column label="名称" prop="name" min-width="180" :width="widths.name" show-overflow-tooltip />
      <el-table-column label="属性" column-key="partner_type" :width="cw('partner_type', 100)" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.partner_type === 'supplier'" type="warning" size="small">供应商</el-tag>
          <el-tag v-else-if="row.partner_type === 'customer'" type="success" size="small">客户</el-tag>
          <el-tag v-else type="" size="small">双向</el-tag>
          <el-tag v-if="row.is_outsource === 1" type="danger" size="small" effect="plain" style="margin-left:4px">委外厂</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="应收科目" prop="ar_account" :width="cw('ar_account', 100)" />
      <el-table-column label="应付科目" prop="ap_account" :width="cw('ap_account', 100)" />
      <el-table-column label="业务员" prop="salesman" :width="cw('salesman', 90)" />
      <el-table-column label="电话" prop="phone" min-width="120" :width="widths.phone" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑往来单位' : '新增往来单位'" width="760px" draggable @keydown="onDialogKeydown">
      <el-form :model="form" label-width="90px" size="small">
        <div class="form-sector">
          <div class="form-sector-title">基本身份</div>
          <el-row :gutter="16">
            <el-col :span="8"><el-form-item label="单位编号" required><el-input v-model="form.code" :disabled="!!editId" /></el-form-item></el-col>
            <el-col :span="16"><el-form-item label="单位全称" required><el-input v-model="form.name" /></el-form-item></el-col>
            <el-col :span="12">
              <el-form-item label="单位属性" required>
                <el-radio-group v-model="form.partner_type">
                  <el-radio value="supplier">供应商</el-radio>
                  <el-radio value="customer">客户</el-radio>
                  <el-radio value="both">双向</el-radio>
                </el-radio-group>
                <el-checkbox
                  :model-value="form.is_outsource === 1"
                  :disabled="form.partner_type === 'customer'"
                  style="margin-left:12px"
                  @update:model-value="(v:any) => form.is_outsource = v ? 1 : 0"
                >委外厂</el-checkbox>
              </el-form-item>
            </el-col>
            <el-col :span="6"><el-form-item label="简称"><el-input v-model="form.short_name" /></el-form-item></el-col>
            <el-col :span="6"><el-form-item label="税号"><el-input v-model="form.tax_no" /></el-form-item></el-col>
          </el-row>
        </div>

        <div class="form-sector">
          <div class="form-sector-title">业务与财务</div>
          <el-row :gutter="16">
            <el-col :span="8"><el-form-item label="业务员"><el-input v-model="form.salesman" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="信用额度"><el-input-number v-model="form.credit_limit" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="默认税率%"><el-input-number v-model="form.tax_rate" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
            <el-col :span="8">
              <el-form-item label="付款方式">
                <el-select v-model="form.payment_type" clearable style="width:100%">
                  <el-option label="现金" value="cash" />
                  <el-option label="转账" value="transfer" />
                  <el-option label="挂账" value="credit" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8"><el-form-item label="账期(天)"><el-input-number v-model="form.credit_days" :min="0" :precision="0" :controls="false" style="width:100%" /></el-form-item></el-col>
            <el-col :span="8">
              <el-form-item label="价格等级">
                <el-select v-model="form.price_level" style="width:100%">
                  <el-option :value="1" label="1 级售价（默认）" />
                  <el-option :value="2" label="2 级售价" />
                  <el-option :value="3" label="3 级售价" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8"><el-form-item label="应收科目"><AccountSelect v-model="form.ar_account" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="应付科目"><AccountSelect v-model="form.ap_account" /></el-form-item></el-col>
          </el-row>
        </div>

        <div class="form-sector">
          <div class="form-sector-title">联系方式</div>
          <el-row :gutter="16">
            <el-col :span="8"><el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="联系电话"><el-input v-model="form.phone" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="QQ"><el-input v-model="form.qq" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="微信"><el-input v-model="form.wechat" /></el-form-item></el-col>
            <el-col :span="24"><el-form-item label="详细地址"><el-input v-model="form.address" type="textarea" :rows="1" /></el-form-item></el-col>
          </el-row>
        </div>

        <div class="form-sector">
          <div class="form-sector-title">收货信息</div>
          <el-row :gutter="16">
            <el-col :span="8"><el-form-item label="收货联系人"><el-input v-model="form.ship_contact" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="收货电话"><el-input v-model="form.ship_phone" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="国家"><el-input v-model="form.country" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="省"><el-input v-model="form.province" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="市"><el-input v-model="form.city" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="区/县"><el-input v-model="form.county" /></el-form-item></el-col>
            <el-col :span="24"><el-form-item label="收货地址"><el-input v-model="form.ship_address" type="textarea" :rows="1" /></el-form-item></el-col>
          </el-row>
        </div>
      </el-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-if="!editId" :loading="saving" @click="handleSave(true)">保存并新增 (Ctrl+Enter)</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave(false)">确认保存 (Enter)</el-button>
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
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'

const { tableRef, colWidth, onDragEnd, widths } = useListColumnWidth('scm_partner')
function cw(key: string, fallback: number) { return colWidth(key, fallback) }

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
  form.value = { partner_type: propType.value || 'both', credit_limit: 0, tax_rate: 0, price_level: 1 }
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
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
</style>
