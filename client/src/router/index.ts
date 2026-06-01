import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useSystemParamsStore } from '@/stores/systemParams'
import { useLicenseStore } from '@/stores/license'
import {
  canAccessRoute,
  getDefaultLandingPath,
  normalizePath,
  resolveAccessiblePath,
} from '@/config/navigation'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/activate',
    name: 'LicenseActivate',
    component: () => import('@/views/LicenseActivate.vue'),
    meta: { title: '软件激活', requiresAuth: false },
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
      {
        path: 'forbidden',
        name: 'Forbidden',
        component: () => import('@/views/Forbidden.vue'),
        meta: { title: '无权限', icon: 'Warning' },
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
        path: 'report/cash-flow',
        name: 'CashFlowReport',
        component: () => import('@/views/report/CashFlow.vue'),
        meta: { title: '现金流量表(估算)', icon: 'Money', parent: '账簿查询' },
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
        path: 'base/init-balance/aux',
        name: 'InitBalanceAux',
        component: () => import('@/views/base/InitBalanceAux.vue'),
        meta: { title: '辅助期初录入', parent: '基础设置' },
      },
      {
        path: 'base/print-template',
        name: 'PrintTemplate',
        component: () => import('@/views/base/PrintTemplate.vue'),
        meta: { title: '打印模版', icon: 'Printer', parent: '基础设置' },
      },
      {
        path: 'base/cash-flow-items',
        name: 'CashFlowItems',
        component: () => import('@/views/base/CashFlowItems.vue'),
        meta: { title: '现金流量项目', icon: 'Money', parent: '基础设置', requiresCashFlow: true },
      },
      {
        path: 'base/fund-source',
        name: 'FundSource',
        component: () => import('@/views/base/FundSource.vue'),
        meta: { title: '资金来源', icon: 'Wallet', parent: '基础设置', requiresCashFlow: true },
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
        path: 'voucher/period-close',
        name: 'VoucherPeriodClose',
        component: () => import('@/views/voucher/PeriodClose.vue'),
        meta: { title: '期间结账', icon: 'Calendar', parent: '凭证管理' },
      },
      {
        path: 'voucher/query',
        name: 'VoucherQuery',
        component: () => import('@/views/voucher/Query.vue'),
        meta: { title: '凭证查询', icon: 'Search', parent: '凭证管理' },
      },
      {
        path: 'voucher/template',
        name: 'VoucherTemplate',
        component: () => import('@/views/voucher/Template.vue'),
        meta: { title: '凭证模版', icon: 'DocumentCopy', parent: '基础设置' },
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
        path: 'ledger/cash-flow-trial-balance',
        name: 'CashFlowTrialBalance',
        component: () => import('@/views/ledger/CashFlowTrialBalance.vue'),
        meta: {
          title: '现金流量试算平衡表',
          icon: 'Money',
          parent: '账簿管理',
          requiresCashFlow: true,
        },
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
      // 出纳管理
      {
        path: 'cashier/journal',
        name: 'CashierJournal',
        component: () => import('@/views/cashier/Journal.vue'),
        meta: { title: '出纳日记账', icon: 'CreditCard', parent: '出纳管理' },
      },
      {
        path: 'cashier/init-balance',
        name: 'CashierInitBalance',
        component: () => import('@/views/cashier/InitBalance.vue'),
        meta: { title: '出纳期初', icon: 'Wallet', parent: '出纳管理' },
      },
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

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const systemParamsStore = useSystemParamsStore()
  const licenseStore = useLicenseStore()

  await licenseStore.ensureStatus()

  if (to.path !== '/activate' && licenseStore.needsActivation) {
    next('/activate')
    return
  }
  if (to.path === '/activate' && licenseStore.isValid) {
    next('/login')
    return
  }

  await userStore.bootstrapAuth()
  // 带 targetAccountSetId 参数的登录请求，跳转前先清除 token
  if (to.path === '/login' && to.query.targetAccountSetId && userStore.token) {
    userStore.token = ''
    userStore.userInfo = null
    userStore.accountSetId = ''
    userStore.accountSetName = ''
    userStore.authBootstrapped = false
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    localStorage.removeItem('accountSetId')
    localStorage.removeItem('accountSetName')
    systemParamsStore.reset()
    next()
  } else if (to.meta.requiresAuth !== false && !userStore.token) {
    // 如果不记住密码，清除保存的登录信息
    if (localStorage.getItem('rememberMe') !== 'true') {
      localStorage.removeItem('rememberedUsername')
      userStore.rememberMe = false
    }
    next('/login')
  } else if (to.path === '/login' && userStore.token) {
    await systemParamsStore.load()
    next(getDefaultLandingPath(userStore.permissions, systemParamsStore.enableCashFlow))
  } else if (to.meta.requiresCashFlow) {
    await systemParamsStore.load()
    if (!systemParamsStore.enableCashFlow) {
      next('/system/param')
    } else if (!canAccessRoute(to.path, userStore.permissions)) {
      const landing = resolveAccessiblePath(
        to.path,
        userStore.permissions,
        systemParamsStore.enableCashFlow
      )
      next(landing === normalizePath(to.path) ? '/forbidden' : { path: landing, replace: true })
    } else {
      next()
    }
  } else if (
    to.meta.requiresAuth !== false &&
    userStore.token &&
    to.path !== '/forbidden' &&
    !canAccessRoute(to.path, userStore.permissions)
  ) {
    await systemParamsStore.load()
    const landing = resolveAccessiblePath(
      to.path,
      userStore.permissions,
      systemParamsStore.enableCashFlow
    )
    next(landing === normalizePath(to.path) ? '/forbidden' : { path: landing, replace: true })
  } else {
    next()
  }
})

export default router
