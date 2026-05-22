<template>
  <el-container class="layout-container apple-layout">
    <!-- 侧边栏 - 苹果风格 -->
    <el-aside :width="isCollapsed ? '72px' : '240px'" class="aside">
      <!-- Logo -->
      <div class="logo" :title="'回到首页'" @click="goToHome">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.51c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.43z"/>
          </svg>
        </div>
        <div v-show="!isCollapsed" class="logo-text-wrap">
          <span class="logo-text">RCsoft</span>
          <span class="logo-sub">行政事业专版</span>
        </div>
      </div>

      <!-- 菜单 -->
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        :openeds="openeds"
        background-color="transparent"
        text-color="rgba(255, 255, 255, 0.7)"
        active-text-color="#ffd700"
        router
        class="apple-menu"
        @open="onGroupOpen"
        @close="onGroupClose"
      >
        <el-sub-menu v-for="group in menuGroups" :key="group.title" :index="group.title" :popper-class="'apple-menu-popper'">
          <template #title>
            <div class="menu-icon-wrap">
              <component :is="group.icon" />
            </div>
            <span>{{ group.title }}</span>
          </template>
          <el-menu-item v-for="item in group.children" :key="item.path" :index="item.path">
            {{ item.title }}
          </el-menu-item>
        </el-sub-menu>
      </el-menu>

      <!-- 底部折叠按钮 -->
      <div class="aside-footer">
        <button class="collapse-btn" @click="isCollapsed = !isCollapsed">
          <svg v-if="isCollapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>
    </el-aside>

    <el-container>
      <!-- 顶栏 - 苹果风格 -->
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/" class="apple-breadcrumb">
            <el-breadcrumb-item v-if="currentParent">{{ currentParent }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <div class="account-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>{{ userStore.accountSetName || '未选账套' }}</span>
          </div>
          <button class="theme-btn" @click="toggleTheme" :title="currentTheme === 'light' ? '切换到暗色模式' : '切换到浅色模式'">
            <svg v-if="currentTheme === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </button>
          <el-dropdown @command="handleCommand" trigger="click" popper-class="apple-dropdown">
            <button class="user-btn">
              <div class="user-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
              </div>
              <span class="user-name">{{ userStore.userInfo?.nickname || userStore.userInfo?.username }}</span>
              <svg class="user-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="switchOperator" divided>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                  切换操作员
                </el-dropdown-item>
                <el-dropdown-item command="changeAccount">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                  切换账套
                </el-dropdown-item>
                <el-dropdown-item command="closeBrowser" divided>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  退出
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容 -->
      <el-main class="main">
        <router-view v-slot="{ Component, route: viewRoute }">
          <keep-alive :key="viewCacheKey">
            <component :is="Component" :key="getViewKey(viewRoute.fullPath)" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- 切换操作员对话框 -->
    <el-dialog
      v-model="switchOperatorVisible"
      title="切换操作员"
      width="420px"
      :close-on-click-modal="false"
      class="apple-dialog"
      @closed="resetSwitchOperatorForm"
    >
      <el-form
        ref="switchOperatorFormRef"
        :model="switchOperatorForm"
        :rules="switchOperatorRules"
        label-width="84px"
        @submit.prevent
      >
        <el-form-item label="当前账套">
          <el-input :model-value="userStore.accountSetName || '未选账套'" disabled />
        </el-form-item>
        <el-form-item label="操作员" prop="username">
          <el-select
            v-model="switchOperatorForm.username"
            filterable
            placeholder="请选择操作员"
            style="width: 100%"
            :loading="operatorLoading"
          >
            <el-option
              v-for="item in operatorUsers"
              :key="item.username"
              :label="`${item.nickname || item.username}（${item.username}）`"
              :value="item.username"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="switchOperatorForm.password"
            type="password"
            placeholder="请输入密码"
            show-password
            @keyup.enter="confirmSwitchOperator"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="switchOperatorVisible = false">取消</el-button>
        <el-button type="primary" :loading="switchOperatorLoading" @click="confirmSwitchOperator">
          登录
        </el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getUsersByAccountSet, logout, switchOperator } from '@/api/auth'
import type { UserItem } from '@/api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import request from '@/api/request'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useTheme } from '@/composables/useTheme'
import { useSystemParamsStore } from '@/stores/systemParams'

const { currentTheme, toggleTheme, initTheme } = useTheme()

const systemParamsStore = useSystemParamsStore()

onMounted(() => {
  initTheme()
  void systemParamsStore.load()
})

const dynamicReportMenuItems = ref<{ path: string; title: string }[]>([])

async function fetchReportTemplates() {
  try {
    const res = await request.get<any[]>('/report/templates')
    if (res.data && Array.isArray(res.data)) {
      dynamicReportMenuItems.value = res.data
        .filter((t: any) => t.is_enabled)
        .map((t: any) => ({
          path: `/report/dynamic/${t.code}?view=1`,
          title: t.name,
        }))
    }
  } catch (error) {
    console.error('获取报表模板列表失败:', error)
    dynamicReportMenuItems.value = []
  }
}

fetchReportTemplates()

// 报表模板增删改后，由 DynamicReport 触发该事件 → 刷新导航栏
function handleReportTemplatesChanged() {
  fetchReportTemplates()
}
window.addEventListener('report-templates-changed', handleReportTemplatesChanged)
onBeforeUnmount(() => {
  window.removeEventListener('report-templates-changed', handleReportTemplatesChanged)
})

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isCollapsed = ref(false)
const switchOperatorVisible = ref(false)
const switchOperatorLoading = ref(false)
const operatorLoading = ref(false)
const operatorUsers = ref<UserItem[]>([])
const switchOperatorFormRef = ref<FormInstance>()
const switchOperatorForm = ref({
  username: '',
  password: '',
})
const switchOperatorRules: FormRules = {
  username: [{ required: true, message: '请选择操作员', trigger: 'change' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const openGroups = ref<string[]>([])

useKeyboardShortcuts([
  {
    key: 'F12',
    shift: true,
    handler: () => {
      router.push('/base/keyboard-shortcuts')
    },
    description: 'Shift+F12 打开快捷键维护',
  },
])

function goToHome() {
  router.push('/dashboard')
}

function onGroupOpen(index: string | number) {
  const key = String(index)
  if (!openGroups.value.includes(key)) {
    openGroups.value.push(key)
  }
}

function onGroupClose(index: string | number) {
  const key = String(index)
  openGroups.value = openGroups.value.filter(k => k !== key)
}

const openeds = computed(() => openGroups.value)

const menuGroups = computed(() => {
  const baseSettingChildren: { path: string; title: string }[] = [
    { path: '/base/account', title: '会计科目' },
    { path: '/base/init-balance', title: '期初余额' },
    { path: '/base/voucher-type', title: '凭证类型' },
    { path: '/voucher/template', title: '凭证模版' },
    { path: '/base/transfer-type', title: '结转维护' },
    { path: '/report/dynamic', title: '报表维护' },
    { path: '/base/print-template', title: '打印模版' },
  ]
  if (systemParamsStore.enableCashFlow) {
    baseSettingChildren.push(
      { path: '/base/cash-flow-items', title: '现金流量项目' },
      { path: '/base/fund-source', title: '资金来源' }
    )
  }

  const groups = [
    {
      title: '基础设置',
      icon: 'Coin',
      children: baseSettingChildren,
    },
    {
      title: '凭证管理',
      icon: 'EditPen',
      children: [
        { path: '/voucher/entry', title: '凭证录入' },
        { path: '/voucher/audit', title: '凭证管理' },
        { path: '/voucher/auto-transfer', title: '凭证结转' },
        { path: '/voucher/query', title: '凭证查询' },
        { path: '/voucher/period-close', title: '期间结账' },
      ],
    },
    {
      title: '账簿管理',
      icon: 'List',
      children: [
        { path: '/ledger/general', title: '科目余额表' },
        { path: '/ledger/detail', title: '明细账' },
        { path: '/ledger/balance', title: '总分类账' },
        { path: '/ledger/cash-journal', title: '日记账' },
        { path: '/ledger/chronological', title: '序时账' },
      ],
    },
    {
      title: '辅助核算',
      icon: 'FolderOpened',
      children: [
        { path: '/base/project', title: '核算项目' },
        { path: '/ledger/aux-balance', title: '辅助项目余额表' },
        { path: '/ledger/aux-detail', title: '辅助项目明细账' },
      ],
    },
    {
      title: '报表管理',
      icon: 'TrendCharts',
      children: dynamicReportMenuItems.value,
    },
    {
      title: '系统管理',
      icon: 'Setting',
      children: [
        { path: '/system/account-set', title: '账套管理' },
        { path: '/system/user', title: '用户管理' },
        { path: '/system/role', title: '角色管理' },
        { path: '/system/param', title: '系统参数' },
        { path: '/system/log', title: '操作日志' },
      ],
    },
    {
      title: '数据安全',
      icon: 'Box',
      children: [{ path: '/security/backup', title: '备份恢复' }],
    },
  ]

  return groups.filter(group => group.children && group.children.length > 0)
})

const activeMenu = computed(() => route.path)
const viewCacheKey = computed(() => userStore.accountSetId || 'no-account-set')

function getViewKey(fullPath: string) {
  // 仅用 path 作为缓存键，避免 query 变化（如 editVoucherId）导致 keep-alive 组件整页重挂载
  const path = fullPath.split('?')[0] || fullPath
  return `${viewCacheKey.value}:${path}`
}

const currentTitle = computed(() => {
  const item = menuGroups.value.flatMap(g => g.children).find(c => (c.path.split('?')[0]) === route.path)
  return item?.title || ''
})

const currentParent = computed(() => {
  const group = menuGroups.value.find(g => g.children.some(c => (c.path.split('?')[0]) === route.path))
  return group?.title || ''
})

async function handleCommand(cmd: string) {
  if (cmd === 'closeBrowser') {
    try {
      await logout()
    } catch (error) {
      console.error('退出登录失败:', error)
    }
    userStore.logout()
    router.push('/login')
  } else if (cmd === 'switchOperator') {
    await openSwitchOperatorDialog()
  } else if (cmd === 'changeAccount') {
    try {
      await logout()
    } catch (error) {
      console.error('退出登录失败:', error)
    }
    userStore.logout()
    router.push('/login')
  }
}

async function openSwitchOperatorDialog() {
  if (!userStore.accountSetId) {
    ElMessage.warning('当前未选择账套，无法切换操作员')
    return
  }
  switchOperatorVisible.value = true
  switchOperatorForm.value.username = userStore.userInfo?.username || ''
  switchOperatorForm.value.password = ''
  await loadOperatorUsers()
}

async function loadOperatorUsers() {
  if (!userStore.accountSetId) return
  operatorLoading.value = true
  try {
    const res = await getUsersByAccountSet(userStore.accountSetId)
    operatorUsers.value = res.data || []
  } catch (error) {
    console.error('加载操作员列表失败:', error)
    ElMessage.error('加载操作员列表失败')
  } finally {
    operatorLoading.value = false
  }
}

function resetSwitchOperatorForm() {
  switchOperatorForm.value.password = ''
  switchOperatorFormRef.value?.clearValidate()
}

async function confirmSwitchOperator() {
  await switchOperatorFormRef.value?.validate()
  switchOperatorLoading.value = true
  try {
    const res = await switchOperator({
      username: switchOperatorForm.value.username,
      password: switchOperatorForm.value.password,
    })
    userStore.applyLoginResponse(res)
    switchOperatorVisible.value = false
    ElMessage.success(`已切换为操作员：${res.user.nickname || res.user.username}`)
    await reloadCurrentView()
  } catch (error: any) {
    const response = error?.response?.data
    if (response?.code === 40901) {
      const ip = response.data?.activeLoginIp || response.data?.activeLoginAt || '其他终端'
      try {
        await ElMessageBox.confirm(
          `该操作员已在 ${ip} 登录，是否强制登录并切换到当前电脑？`,
          '确认强制登录',
          {
            confirmButtonText: '强制登录',
            cancelButtonText: '取消',
            type: 'warning',
          }
        )
        const forced = await switchOperator({
          username: switchOperatorForm.value.username,
          password: switchOperatorForm.value.password,
          forceLogin: true,
        })
        userStore.applyLoginResponse(forced)
        switchOperatorVisible.value = false
        ElMessage.success(`已切换为操作员：${forced.user.nickname || forced.user.username}`)
        await reloadCurrentView()
      } catch (confirmError: any) {
        if (confirmError !== 'cancel') {
          ElMessage.error(confirmError?.response?.data?.message || confirmError?.message || '切换操作员失败')
        }
      }
    } else {
      ElMessage.error(response?.message || error?.message || '切换操作员失败')
    }
  } finally {
    switchOperatorLoading.value = false
  }
}

async function reloadCurrentView() {
  await fetchReportTemplates()
  const currentPath = route.fullPath
  await router.replace('/dashboard')
  if (currentPath !== '/dashboard') {
    await router.replace(currentPath)
  }
}
</script>

<style scoped>
@import './Layout.styles.css';
</style>
