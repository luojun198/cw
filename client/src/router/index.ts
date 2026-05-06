import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const dynamicReportEntries = [
  { code: '1', name: '资产负债表', path: '/report/run/1' },
  { code: '2', name: '收入费用表', path: '/report/run/2' },
  { code: '3', name: '净资产变动表', path: '/report/run/3' },
  { code: '4', name: '现金流量表', path: '/report/run/4' },
  { code: '7', name: '财政拨款收入支出表', path: '/report/run/7' },
]

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台', icon: 'Odometer' },
      },
      // 系统管理
      {
        path: 'system/account-set',
        name: 'AccountSet',
        component: () => import('@/views/system/AccountSet.vue'),
        meta: { title: '账套管理', icon: 'Coin', parent: '系统管理' },
      },
      {
        path: 'system/user',
        name: 'User',
        component: () => import('@/views/system/User.vue'),
        meta: { title: '用户管理', icon: 'User', parent: '系统管理' },
      },
      {
        path: 'system/role',
        name: 'Role',
        component: () => import('@/views/system/Role.vue'),
        meta: { title: '角色管理', icon: 'UserFilled', parent: '系统管理' },
      },
      {
        path: 'system/param',
        name: 'Param',
        component: () => import('@/views/system/Param.vue'),
        meta: { title: '系统参数', icon: 'Setting', parent: '系统管理' },
      },
      {
        path: 'system/log',
        name: 'Log',
        component: () => import('@/views/system/Log.vue'),
        meta: { title: '操作日志', icon: 'Document', parent: '系统管理' },
      },
      // 基础设置
      {
        path: 'base/account',
        name: 'Account',
        component: () => import('@/views/base/Account.vue'),
        meta: { title: '会计科目', icon: 'Notebook', parent: '基础设置' },
      },
      {
        path: 'base/voucher-type',
        name: 'VoucherType',
        component: () => import('@/views/base/VoucherType.vue'),
        meta: { title: '凭证类型', icon: 'Tickets', parent: '基础设置' },
      },
      {
        path: 'base/transfer-type',
        name: 'TransferType',
        component: () => import('@/views/system/TransferType.vue'),
        meta: { title: '结转维护', icon: 'Connection', parent: '基础设置' },
      },
      {
        path: 'report/dynamic/:code?',
        name: 'DynamicReport',
        component: () => import('@/views/report/DynamicReport.vue'),
        meta: { title: '报表维护', icon: 'TrendCharts', parent: '基础设置' },
      },
      {
        path: 'base/project',
        name: 'Project',
        component: () => import('@/views/base/Project.vue'),
        meta: { title: '核算项目', icon: 'FolderOpened', parent: '基础设置' },
      },
      {
        path: 'base/init-balance',
        name: 'InitBalance',
        component: () => import('@/views/base/InitBalance.vue'),
        meta: { title: '期初余额', icon: 'Coin', parent: '基础设置' },
      },
      {
        path: 'base/print-template',
        name: 'PrintTemplate',
        component: () => import('@/views/base/PrintTemplate.vue'),
        meta: { title: '打印模版', icon: 'Printer', parent: '基础设置' },
      },
      // 凭证管理
      {
        path: 'voucher/entry',
        name: 'VoucherEntry',
        component: () => import('@/views/voucher/Entry.vue'),
        meta: { title: '凭证录入', icon: 'EditPen', parent: '凭证管理' },
      },
      {
        path: 'voucher/audit',
        name: 'VoucherAudit',
        component: () => import('@/views/voucher/Audit.vue'),
        meta: { title: '凭证管理', icon: 'CircleCheck', parent: '凭证管理' },
      },
      {
        path: 'voucher/auto-transfer',
        name: 'VoucherAutoTransfer',
        component: () => import('@/views/voucher/AutoTransfer.vue'),
        meta: { title: '凭证结转', icon: 'RefreshRight', parent: '凭证管理' },
      },
      {
        path: 'voucher/query',
        name: 'VoucherQuery',
        component: () => import('@/views/voucher/Query.vue'),
        meta: { title: '凭证查询', icon: 'Search', parent: '凭证管理' },
      },
      // 账簿管理
      {
        path: 'ledger/general',
        name: 'GeneralLedger',
        component: () => import('@/views/ledger/General.vue'),
        meta: { title: '科目余额表', icon: 'DataAnalysis', parent: '账簿管理' },
      },
      {
        path: 'ledger/detail',
        name: 'DetailLedger',
        component: () => import('@/views/ledger/Detail.vue'),
        meta: { title: '明细账', icon: 'Document', parent: '账簿管理' },
      },
      {
        path: 'ledger/balance',
        name: 'BalanceTable',
        component: () => import('@/views/ledger/Balance.vue'),
        meta: { title: '总分类账', icon: 'List', parent: '账簿管理' },
      },
      {
        path: 'ledger/cash-journal',
        name: 'CashJournal',
        component: () => import('@/views/ledger/CashJournal.vue'),
        meta: { title: '日记账', icon: 'Wallet', parent: '账簿管理' },
      },
      {
        path: 'ledger/chronological',
        name: 'Chronological',
        component: () => import('@/views/ledger/Chronological.vue'),
        meta: { title: '序时账', icon: 'Clock', parent: '账簿管理' },
      },
      {
        path: 'ledger/aux-balance',
        name: 'LedgerAuxBalance',
        component: () => import('@/views/ledger/AuxBalance.vue'),
        meta: { title: '辅助项目余额表', icon: 'DataAnalysis', parent: '账簿管理' },
      },
      {
        path: 'ledger/aux-detail',
        name: 'LedgerAuxDetail',
        component: () => import('@/views/ledger/AuxDetail.vue'),
        meta: { title: '辅助项目明细账', icon: 'Document', parent: '账簿管理' },
      },
      // 辅助核算
      {
        path: 'aux/dept',
        name: 'AuxDept',
        component: () => import('@/views/_aux/Dept.vue'),
        meta: { title: '部门核算', icon: 'OfficeBuilding', parent: '辅助核算' },
      },
      {
        path: 'aux/project',
        name: 'AuxProject',
        component: () => import('@/views/_aux/AuxProject.vue'),
        meta: { title: '项目核算', icon: 'Suitcase', parent: '辅助核算' },
      },
      {
        path: 'aux/supplier',
        name: 'AuxSupplier',
        component: () => import('@/views/_aux/Supplier.vue'),
        meta: { title: '往来单位', icon: 'OfficeBuilding', parent: '辅助核算' },
      },
      {
        path: 'aux/person',
        name: 'AuxPerson',
        component: () => import('@/views/_aux/Person.vue'),
        meta: { title: '人员核算', icon: 'User', parent: '辅助核算' },
      },
      {
        path: 'aux/func-class',
        name: 'AuxFuncClass',
        component: () => import('@/views/_aux/FuncClass.vue'),
        meta: { title: '功能分类', icon: 'Collection', parent: '辅助核算' },
      },
      // 报表管理
      ...dynamicReportEntries.map(item => ({
        path: `report/run/${item.code}`,
        name: `DynamicReportRun${item.code}`,
        component: () => import('@/views/report/DynamicReport.vue'),
        meta: {
          title: item.name,
          icon: 'TrendCharts',
          parent: '报表管理',
          dynamicReportCode: item.code,
          autoRun: true,
        },
      })),
      // 数据安全
      {
        path: 'security/backup',
        name: 'Backup',
        component: () => import('@/views/security/Backup.vue'),
        meta: { title: '备份恢复', icon: 'Box', parent: '数据安全' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  // 带 targetAccountSetId 参数的登录请求，跳转前先清除 token
  if (to.path === '/login' && to.query.targetAccountSetId && userStore.token) {
    userStore.token = ''
    userStore.userInfo = null
    userStore.accountSetId = ''
    userStore.accountSetName = ''
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    localStorage.removeItem('accountSetId')
    localStorage.removeItem('accountSetName')
    next()
  } else if (to.meta.requiresAuth !== false && !userStore.token) {
    // 如果不记住密码，清除保存的登录信息
    if (localStorage.getItem('rememberMe') !== 'true') {
      localStorage.removeItem('rememberedUsername')
      userStore.rememberMe = false
    }
    next('/login')
  } else if (to.path === '/login' && userStore.token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
