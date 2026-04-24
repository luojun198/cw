<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="aside">
      <!-- Logo: 点击回到首页 -->
      <div class="logo" :title="'回到首页'" @click="goToHome">
        <span class="logo-text">RCsoft</span>
        <span v-show="!isCollapsed" class="logo-sub">行政事业专版</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        :openeds="openeds"
        background-color="#0d2b4e"
        text-color="#b8c9db"
        active-text-color="#f0c040"
        router
        @open="onGroupOpen"
        @close="onGroupClose"
      >
        <el-sub-menu v-for="group in menuGroups" :key="group.title" :index="group.title">
          <template #title>
            <el-icon><component :is="group.icon" /></el-icon>
            <span>{{ group.title }}</span>
          </template>
          <el-menu-item v-for="item in group.children" :key="item.path" :index="item.path">
            {{ item.title }}
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
            <Expand v-if="isCollapsed" />
            <Fold v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-if="currentParent">{{ currentParent }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <span class="account-info">
            <el-icon><OfficeBuilding /></el-icon>
            {{ userStore.accountSetName || '未选账套' }}
          </span>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-icon><User /></el-icon>
              {{ userStore.userInfo?.nickname || userStore.userInfo?.username }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="changeAccount" divided>切换账套</el-dropdown-item>
                <el-dropdown-item command="closeBrowser">退出</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容 -->
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { logout } from '@/api/auth'
import { Expand, Fold, OfficeBuilding, User, ArrowDown } from '@element-plus/icons-vue'
import request from '@/api/request'

const dynamicReportMenuItems = ref<{ path: string; title: string }[]>([])

async function fetchReportTemplates() {
  try {
    const res = await request.get<any[]>('/report/templates')
    if (res.data && Array.isArray(res.data)) {
      dynamicReportMenuItems.value = res.data.map((t: any) => ({
        path: `/report/run/${t.code}`,
        title: t.name,
      }))
    }
  } catch {
    // 获取失败时使用默认列表
    dynamicReportMenuItems.value = [
      { path: '/report/run/1', title: '资产负债表' },
      { path: '/report/run/2', title: '收入费用表' },
      { path: '/report/run/3', title: '净资产变动表' },
      { path: '/report/run/4', title: '现金流量表' },
      { path: '/report/run/7', title: '财政拨款收入支出表' },
    ]
  }
}

fetchReportTemplates()

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isCollapsed = ref(false)

const openGroups = ref<string[]>([])

// Logo 点击：回到首页
function goToHome() {
  router.push('/dashboard')
}

// el-sub-menu 展开时
function onGroupOpen(index: string | number) {
  const key = String(index)
  if (!openGroups.value.includes(key)) {
    openGroups.value.push(key)
  }
}

// el-sub-menu 收拢时
function onGroupClose(index: string | number) {
  const key = String(index)
  openGroups.value = openGroups.value.filter(k => k !== key)
}

const openeds = computed(() => openGroups.value)

const menuGroups = computed(() => [
  {
    title: '基础设置',
    icon: 'Coin',
    children: [
      { path: '/base/account', title: '会计科目' },
      { path: '/base/voucher-type', title: '凭证类型' },
      { path: '/base/transfer-type', title: '结转维护' },
      { path: '/report/dynamic', title: '报表维护' },
      { path: '/base/project', title: '核算项目' },
      { path: '/base/init-balance', title: '期初余额' },
    ],
  },
  {
    title: '凭证管理',
    icon: 'EditPen',
    children: [
      { path: '/voucher/entry', title: '凭证录入' },
      { path: '/voucher/audit', title: '凭证管理' },
      { path: '/voucher/auto-transfer', title: '凭证结转' },
      { path: '/voucher/query', title: '凭证查询' },
    ],
  },
  {
    title: '账簿管理',
    icon: 'List',
    children: [
      { path: '/ledger/balance', title: '总分类账' },
      { path: '/ledger/detail', title: '明细账' },
      { path: '/ledger/general', title: '科目余额表' },
      { path: '/ledger/cash-journal', title: '日记账' },
      { path: '/ledger/aux-balance', title: '辅助项目余额表' },
      { path: '/ledger/aux-detail', title: '辅助项目明细账' },
    ],
  },
  {
    title: '辅助核算',
    icon: 'FolderOpened',
    children: [{ path: '/base/project', title: '核算项目' }],
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
])

const activeMenu = computed(() => route.path)

const currentTitle = computed(() => {
  const item = menuGroups.value.flatMap(g => g.children).find(c => c.path === route.path)
  return item?.title || ''
})

const currentParent = computed(() => {
  const group = menuGroups.value.find(g => g.children.some(c => c.path === route.path))
  return group?.title || ''
})

async function handleCommand(cmd: string) {
  if (cmd === 'closeBrowser') {
    // 关闭浏览器
    window.close()
  } else if (cmd === 'changeAccount') {
    // 退出登录，跳转到登录页
    await logout()
    userStore.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.aside {
  background: #0d2b4e;
  transition: width 0.3s;
  overflow-x: hidden;
  overflow-y: auto;
}

.logo {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  color: #fff;
  border-bottom: 1px solid #1a3d6d;
  padding: 0 16px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
  background: linear-gradient(135deg, #0a1f3a 0%, #0d2b4e 100%);
}

.logo:hover {
  background: linear-gradient(135deg, #0e2544 0%, #123660 100%);
}

.logo-text {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 4px;
  line-height: 1;
  background: linear-gradient(135deg, #f0c040 0%, #e8a810 50%, #f5d060 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 1px 2px rgba(240, 192, 64, 0.3));
}

.logo-sub {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 3px;
  color: #8ba4be;
}

.aside :deep(.el-menu) {
  border: none;
}

.aside :deep(.el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  border-radius: 6px;
  margin: 2px 8px;
  font-weight: 600;
  font-size: 13px;
}

.aside :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  border-radius: 6px;
  margin: 2px 8px;
  font-size: 13px;
}

.aside :deep(.el-menu-item.is-active) {
  background: #1a3d6d !important;
  color: #f0c040 !important;
  font-weight: 600;
}

.aside :deep(.el-sub-menu.is-active .el-sub-menu__title) {
  color: #f0c040 !important;
}

.aside :deep(.el-sub-menu__title:hover),
.aside :deep(.el-menu-item:hover) {
  background: #153560 !important;
}

.header {
  background: #fff;
  border-bottom: 2px solid #1a4b8c;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 48px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-btn {
  font-size: 20px;
  cursor: pointer;
  color: #606266;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.account-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
  font-size: 13px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #303133;
  cursor: pointer;
}

.main {
  padding: 16px;
  background: #f5f7fa;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
