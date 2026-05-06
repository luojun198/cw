<template>
  <div class="page">
    <div class="page-header">
      <h3>账套管理</h3>
      <el-button type="primary" @click="openDialog('add')">新增账套</el-button>
    </div>

    <el-table :data="list" stripe border height="100%">
      <el-table-column prop="name" label="单位名称" />
      <el-table-column prop="code" label="账套编码" width="120" />
      <el-table-column prop="credit_code" label="统一社会信用代码" width="180" />
      <el-table-column prop="start_date" label="启用日期" width="120" />
      <el-table-column prop="chief_accountant" label="财务负责人" width="100" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <div class="status-cell">
            <div class="status-tags">
              <el-tag
                :type="
                  row.status === 'active' ? 'success' : row.status === 'inactive' ? 'warning' : 'danger'
                "
                size="small"
                class="status-tag"
              >
                {{
                  ({ active: '启用', inactive: '停用' } as Record<string, string>)[
                    row.status
                  ] || row.status
                }}
              </el-tag>
              <el-tag 
                v-if="row.id === currentAccountSetId" 
                type="primary" 
                size="small" 
                class="current-tag"
              >
                当前
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.id !== currentAccountSetId" link type="success" size="small" @click="handleSelect(row)">选择</el-button>
          <el-button link type="primary" size="small" @click="openDialog('edit', row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="600px">
      <el-form :model="form" label-width="140px">
        <el-form-item label="单位名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="账套编码">
          <el-input v-model="form.code" disabled placeholder="自动生成" />
        </el-form-item>
        <el-form-item v-if="dialogType === 'add'" label="选择模版">
          <el-select v-model="form.template_id" placeholder="不使用模版（创建空账套）" clearable style="width: 100%">
            <el-option
              v-for="tpl in templates"
              :key="tpl.id"
              :label="tpl.name"
              :value="tpl.id"
            >
              <span>{{ tpl.name }}</span>
              <span style="color: var(--el-text-color-secondary); font-size: 12px; margin-left: 8px">{{ tpl.description }}</span>
            </el-option>
          </el-select>
          <div v-if="form.template_id" class="template-hint">
            将从模版预设会计科目、结转关系及报表模板（不含凭证和期初数）
          </div>
        </el-form-item>
        <el-form-item label="统一社会信用代码">
          <el-input v-model="form.credit_code" />
        </el-form-item>
        <el-form-item label="隶属财政部门">
          <el-input v-model="form.fiscal_dept" />
        </el-form-item>
        <el-form-item label="账套启用日期" required>
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="单位负责人">
          <el-input v-model="form.unit_leader" />
        </el-form-item>
        <el-form-item label="财务负责人">
          <el-input v-model="form.chief_accountant" />
        </el-form-item>
        <el-form-item label="科目级数">
          <el-input-number
            v-if="dialogType === 'add'"
            v-model="form.account_levels"
            :min="1" :max="10"
            :controls="false"
            style="width: 100px"
          />
          <span v-else class="readonly-value">{{ form.account_levels ?? 6 }} 级</span>
        </el-form-item>
        <el-form-item label="科目长度">
          <template v-if="dialogType === 'add'">
            <div class="code-lengths-row">
              <template v-for="(_, index) in Array(form.account_levels)" :key="index">
                <span v-if="index > 0" class="lengths-sep">-</span>
                <el-input-number
                  v-model="form.account_code_lengths[index]"
                  :min="1" :max="9"
                  :controls="false"
                  style="width: 52px"
                />
              </template>
            </div>
          </template>
          <span v-else class="readonly-value">
            {{ (form.account_code_lengths || []).slice(0, form.account_levels ?? 6).join(' - ') }}
          </span>
        </el-form-item>
        <el-form-item v-if="dialogType === 'edit'" label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/api/request'
import { useUserStore } from '@/stores/user'

interface Template {
  id: string
  name: string
  file: string
  description: string
}

const router = useRouter()
const userStore = useUserStore()
const currentAccountSetId = computed(() => userStore.accountSetId)

const list = ref<any[]>([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const saving = ref(false)
const dialogTitle = computed(() => dialogType.value === 'add' ? '新增账套' : '编辑账套')
const templates = ref<Template[]>([])

const form = ref<any>({})

async function fetchData() {
  const res = await request.get<any[]>('/system/account-sets')
  list.value = res.data
}

async function fetchTemplates() {
  try {
    const res = await request.get<Template[]>('/system/account-set-templates')
    templates.value = res.data || []
  } catch {
    templates.value = []
  }
}

function generateCode() {
  const count = list.value.length
  return `ZT${String(count + 1).padStart(3, '0')}`
}

function openDialog(type: string, row?: any) {
  dialogType.value = type
  if (type === 'edit' && row) {
    form.value = {
      ...row,
      account_levels: row.account_levels ?? 6,
      account_code_lengths: row.account_code_lengths ?? [4,2,2,2,2,2,2,2,2,2],
    }
  } else {
    form.value = {
      start_date: '', name: '', code: generateCode(), status: 'active', template_id: '',
      account_levels: 6,
      account_code_lengths: [4,2,2,2,2,2,2,2,2,2],
    }
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (saving.value) return
  // 前端名称重复校验
  const duplicate = list.value.find(item =>
    item.name === form.value.name && item.id !== form.value.id
  )
  if (duplicate) {
    ElMessage.warning('账套名称已存在，请使用其他名称')
    return
  }
  saving.value = true
  try {
    const payload = { ...form.value }
    // 自动从启用日期推算会计年度
    if (payload.start_date && !payload.fiscal_year) {
      payload.fiscal_year = parseInt(payload.start_date.substring(0, 4), 10)
    }
    if (!payload.fiscal_year) {
      payload.fiscal_year = new Date().getFullYear()
    }
    if (dialogType.value === 'add') {
      if (payload.template_id) {
        // Create from template
        const res = await request.post('/system/account-sets/from-template', payload)
        ElMessage.success(res.data?.message || '从模板创建成功')
      } else {
        await request.post('/system/account-sets', payload)
      }
    } else {
      await request.put(`/system/account-sets/${payload.id}`, payload)
    }
    dialogVisible.value = false
    fetchData()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleSelect(row: any) {
  router.push({
    path: '/login',
    query: {
      targetAccountSetId: row.id,
      targetAccountSetName: row.name
    }
  })
}

async function handleDelete(row: any) {
  try {
    const { value: password } = await ElMessageBox.prompt(
      `确定要删除账套「${row.name}」吗？此操作将删除该账套下的所有数据（科目、凭证、期初余额等），不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
        inputType: 'password',
        inputPlaceholder: '请输入管理员密码',
        inputValidator: (val: string) => {
          if (!val) return '请输入管理员密码'
          return true
        },
      }
    )
    await request.delete(`/system/account-sets/${row.id}`, { data: { password } })
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 用户取消
  }
}

onMounted(() => {
  fetchData()
  fetchTemplates()
})
</script>

<style scoped>
.page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h3 { margin: 0; }
.template-hint { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 4px; line-height: 1.4; }
.readonly-value { color: #606266; font-size: 14px; line-height: 32px; }
.code-lengths-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.lengths-sep { color: #909399; font-size: 14px; }

/* 状态列样式优化 */
.status-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 4px 0;
}

.status-tags {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 26px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  transition: all 0.2s ease;
  letter-spacing: 0.5px;
}

.current-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 22px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 3px;
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  border: none;
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.2);
  transition: all 0.2s ease;
  letter-spacing: 0.5px;
}

.current-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(64, 158, 255, 0.3);
}

/* 状态标签颜色优化 */
:deep(.el-tag--success) {
  background: linear-gradient(135deg, #67c23a 0%, #529b2e 100%);
  border: none;
  color: white;
  box-shadow: 0 2px 4px rgba(103, 194, 58, 0.2);
}

:deep(.el-tag--warning) {
  background: linear-gradient(135deg, #e6a23c 0%, #c78a2a 100%);
  border: none;
  color: white;
  box-shadow: 0 2px 4px rgba(230, 162, 60, 0.2);
}

:deep(.el-tag--danger) {
  background: linear-gradient(135deg, #f56c6c 0%, #d95454 100%);
  border: none;
  color: white;
  box-shadow: 0 2px 4px rgba(245, 108, 108, 0.2);
}

:deep(.el-tag--primary) {
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  border: none;
  color: white;
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.2);
}
</style>
