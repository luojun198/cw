<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h2>行政事业单位财务记账系统</h2>
        <p>Government Finance Accounting System</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="accountSetId">
          <el-select
            v-model="form.accountSetId"
            placeholder="请选择账套"
            prefix-icon="OfficeBuilding"
            size="large"
            style="width: 100%"
            filterable
            @change="handleAccountSetChange"
          >
            <el-option
              v-for="item in accountSets"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            >
              <span style="float: left">{{ item.name }}</span>
              <span style="float: right; color: #8492a6; font-size: 12px">{{ item.code }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item prop="captcha">
          <el-input
            v-model="form.captcha"
            placeholder="验证码"
            prefix-icon="CircleCheck"
            size="large"
            style="width: 60%"
            @keyup.enter="handleLogin"
          />
          <img :src="captchaUrl" class="captcha-img" alt="验证码" @click="refreshCaptcha" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="rememberMe">记住账号密码</el-checkbox>
          <el-button
            type="primary"
            :loading="loading"
            size="large"
            style="width: 100%"
            @click="handleLogin"
            >登 录</el-button
          >
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <el-button text size="small" @click="showImportDialog = true">
          <el-icon style="margin-right: 4px"><Upload /></el-icon>导入账套
        </el-button>
        <el-button text size="small" @click="showAcdImportDialog = true">
          <el-icon style="margin-right: 4px"><Document /></el-icon>导入ACD账套
        </el-button>
      </div>
    </div>

    <!-- 备份导入弹窗 -->
    <el-dialog
      v-model="showImportDialog"
      title="导入账套"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="importFormRef" :model="importForm" :rules="importRules" label-width="90px">
        <el-form-item label="备份文件" prop="file">
          <div class="file-pick-area">
            <input
              ref="fileInputRef"
              type="file"
              accept=".db"
              style="display: none"
              @change="onFileInputChange"
            />
            <el-button type="default" @click="fileInputRef?.click()">
              <el-icon style="margin-right: 4px"><UploadFilled /></el-icon>选择 .db 文件
            </el-button>
            <span v-if="importForm.file" class="file-name">{{ importForm.file.name }}</span>
            <span v-else class="file-hint">（最大 100MB）</span>
          </div>
          <div v-if="!importForm.file" style="color: #909399; font-size: 12px; margin-top: 4px">
            请先选择备份文件
          </div>
        </el-form-item>

        <el-form-item label="账套名称" prop="name">
          <el-input v-model="importForm.name" placeholder="例如：2025年度财务账套" maxlength="50" />
        </el-form-item>

        <el-form-item label="账套编码" prop="code">
          <el-input v-model="importForm.code" placeholder="例如：CW2025" maxlength="20" />
        </el-form-item>

        <el-form-item label="账套启用日">
          <el-date-picker
            v-model="importForm.startDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showImportDialog = false">取 消</el-button>
        <el-button type="primary" :loading="importing" @click="handleImport">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- ACD导入弹窗 -->
    <el-dialog
      v-model="showAcdImportDialog"
      title="导入润衡ACD账套"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="info"
        :closable="false"
        style="margin-bottom: 16px"
      >
        <template #title>
          一键导入润衡财务软件备份，包括科目、期初余额、结转关系、报表模板和凭证
        </template>
      </el-alert>

      <el-form ref="acdFormRef" :model="acdImportForm" :rules="acdImportRules" label-width="90px">
        <el-form-item label="ACD文件" prop="file">
          <div class="file-pick-area">
            <input
              ref="acdFileInputRef"
              type="file"
              accept=".acd"
              style="display: none"
              @change="onAcdFileInputChange"
            />
            <el-button type="default" @click="acdFileInputRef?.click()">
              <el-icon style="margin-right: 4px"><UploadFilled /></el-icon>选择 .acd 文件
            </el-button>
            <span v-if="acdImportForm.file" class="file-name">{{ acdImportForm.file.name }}</span>
            <span v-else class="file-hint">（最大 50MB）</span>
          </div>
        </el-form-item>

        <el-form-item label="账套名称" prop="name">
          <el-input v-model="acdImportForm.name" placeholder="例如：2025年度财务账套" maxlength="50" />
        </el-form-item>

        <el-form-item label="账套编码" prop="code">
          <el-input v-model="acdImportForm.code" placeholder="例如：CW2025" maxlength="20" />
        </el-form-item>

        <el-form-item label="账套启用日">
          <el-date-picker
            v-model="acdImportForm.startDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAcdImportDialog = false">取 消</el-button>
        <el-button type="primary" :loading="acdImporting" @click="handleAcdImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getCaptcha, getAccountSets, backupImport, acdImport, type AccountSetItem } from '@/api/auth'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { UploadFilled, Upload, Document } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const importFormRef = ref<FormInstance>()
const fileInputRef = ref<HTMLInputElement>()
const loading = ref(false)
const captchaId = ref('')
const captchaUrl = ref('')
const accountSets = ref<AccountSetItem[]>([])

// 导入相关
const showImportDialog = ref(false)
const importing = ref(false)
const importForm = reactive({
  file: null as File | null,
  name: '',
  code: '',
  startDate: '',
})

const importRules: FormRules = {
  file: [{ required: true, message: '请上传备份文件', trigger: 'change' }],
  name: [{ required: true, message: '请输入账套名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入账套编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '编码只能包含字母、数字和下划线', trigger: 'blur' },
  ],
}

// ACD导入相关
const showAcdImportDialog = ref(false)
const acdImporting = ref(false)
const acdFileInputRef = ref<HTMLInputElement>()
const acdFormRef = ref<FormInstance>()
const acdImportForm = reactive({
  file: null as File | null,
  name: '',
  code: '',
  startDate: '',
})

const acdImportRules: FormRules = {
  file: [{ required: true, message: '请上传ACD文件', trigger: 'change' }],
  name: [{ required: true, message: '请输入账套名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入账套编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '编码只能包含字母、数字和下划线', trigger: 'blur' },
  ],
}

const form = reactive({
  accountSetId: '',
  username: '',
  password: '',
  captcha: '',
})

const rememberMe = ref(userStore.rememberMe)

const rules = {
  accountSetId: [{ required: true, message: '请选择账套', trigger: 'change' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captcha: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
}

async function fetchAccountSets() {
  const res = await getAccountSets()
  accountSets.value = res.data || []
  const querySetId = route.query.targetAccountSetId as string
  if (querySetId) {
    form.accountSetId = querySetId
  }
}

async function refreshCaptcha() {
  const res = await getCaptcha()
  captchaId.value = res.captchaId
  captchaUrl.value = res.captchaUrl
}

function handleAccountSetChange() {
  refreshCaptcha()
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await userStore.loginAction({
      username: form.username,
      password: form.password,
      captcha: form.captcha,
      captchaId: captchaId.value,
      targetAccountSetId: form.accountSetId,
    })

    // 处理记住账号密码逻辑
    if (rememberMe.value) {
      localStorage.setItem('rememberedUsername', form.username)
      userStore.rememberMe = true
      localStorage.setItem('rememberMe', 'true')
    } else {
      localStorage.removeItem('rememberedUsername')
      userStore.rememberMe = false
      localStorage.removeItem('rememberMe')
    }

    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}

// 文件选择（原生 input，避免 el-upload 内部 iframe）
function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  importForm.file = input.files?.[0] || null
  importFormRef.value?.validateField('file')
}

// ACD文件选择
function onAcdFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  acdImportForm.file = input.files?.[0] || null
  acdFormRef.value?.validateField('file')
}

// 导入账套
async function handleImport() {
  const valid = await importFormRef.value?.validate().catch(() => false)
  if (!valid) return

  if (!importForm.file) {
    ElMessage.warning('请上传备份文件')
    return
  }

  importing.value = true
  try {
    const result = await backupImport(
      importForm.file,
      importForm.name,
      importForm.code,
      importForm.startDate ? parseInt(importForm.startDate.substring(0, 4), 10) : undefined,
      importForm.startDate || undefined
    )

    const data = result.data
    ElMessage.success(
      `导入成功！已导入 ${data.imported.accounts} 个科目、${data.imported.vouchers} 张凭证（共 ${data.imported.entries} 条分录）`
    )

    // 关闭弹窗
    showImportDialog.value = false
    importFormRef.value?.resetFields()
    importForm.file = null
    // 重置 file input
    if (fileInputRef.value) fileInputRef.value.value = ''

    // 刷新账套列表
    await fetchAccountSets()

    // 自动选中新导入的账套
    form.accountSetId = data.id
    refreshCaptcha()

    ElMessage.info('已自动选中导入的账套，请输入管理员账号登录')
  } catch {
    // 错误已在 axios interceptor 中处理
  } finally {
    importing.value = false
  }
}

// ACD导入
async function handleAcdImport() {
  const valid = await acdFormRef.value?.validate().catch(() => false)
  if (!valid) return

  if (!acdImportForm.file) {
    ElMessage.warning('请上传ACD文件')
    return
  }

  acdImporting.value = true
  try {
    const result = await acdImport(
      acdImportForm.file,
      acdImportForm.name,
      acdImportForm.code,
      acdImportForm.startDate ? parseInt(acdImportForm.startDate.substring(0, 4), 10) : undefined,
      acdImportForm.startDate || undefined
    )

    const data = result.data
    const parts = []
    if (data.imported.accounts) parts.push(`${data.imported.accounts} 个科目`)
    if (data.imported.initBalances) parts.push(`${data.imported.initBalances} 条期初余额`)
    if (data.imported.transferTypes) parts.push(`${data.imported.transferTypes} 种结转类型（${data.imported.transferItems} 条分录）`)
    if (data.imported.vouchers) parts.push(`${data.imported.vouchers} 张凭证（${data.imported.voucherEntries} 条分录）`)
    if (data.imported.reportDefinitions) parts.push(`${data.imported.reportDefinitions} 个报表模板`)

    ElMessage.success(`ACD导入成功！已导入：${parts.join('、') || '无数据'}`)

    if (data.warnings?.length) {
      data.warnings.forEach((w: string) => ElMessage.warning(w))
    }

    // 关闭弹窗
    showAcdImportDialog.value = false
    acdFormRef.value?.resetFields()
    acdImportForm.file = null
    if (acdFileInputRef.value) acdFileInputRef.value.value = ''

    // 刷新账套列表
    await fetchAccountSets()

    // 自动选中新导入的账套
    form.accountSetId = data.id
    refreshCaptcha()

    ElMessage.info('已自动选中导入的账套，请使用 admin/123456 登录')
  } catch {
    // 错误已在 axios interceptor 中处理
  } finally {
    acdImporting.value = false
  }
}

onMounted(() => {
  fetchAccountSets()
  refreshCaptcha()

  // 如果有保存的用户名，自动填充
  const savedUsername = localStorage.getItem('rememberedUsername')
  if (savedUsername) {
    form.username = savedUsername
    rememberMe.value = userStore.rememberMe
  }
})
</script>

<style scoped>
.login-container {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a1f3a 0%, #0d2b4e 50%, #1a4b8c 100%);
}

.login-box {
  width: 420px;
  padding: 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header h2 {
  font-size: 22px;
  color: #0d2b4e;
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: 2px;
}

.login-header p {
  font-size: 12px;
  color: #8ba4be;
  letter-spacing: 1px;
}

.captcha-img {
  width: 120px;
  height: 40px;
  margin-left: 12px;
  border-radius: 4px;
  cursor: pointer;
  vertical-align: middle;
}

.login-footer {
  text-align: center;
  margin-top: -8px;
}

.file-pick-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-name {
  color: #67c23a;
  font-size: 13px;
  word-break: break-all;
}

.file-hint {
  color: #909399;
  font-size: 13px;
}
</style>
