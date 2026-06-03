export interface NavItem {
  path: string
  title: string
  /** 任一权限满足即显示；省略表示登录即可见 */
  permission?: string | string[]
  requiresCashFlow?: boolean
}

export interface NavGroup {
  title: string
  icon: string
  children: NavItem[]
}

/** 路由白名单：登录即可访问，不做权限校验 */
export const ROUTE_PERMISSION_WHITELIST = ['/login', '/forbidden', '/activate'] as const

/** 主页查看权限码 */
export const DASHBOARD_PERMISSION = 'system:dashboard'

/** 精确路径 → 权限码（任一满足即可） */
const ROUTE_PERMISSION_MAP: Record<string, string | string[]> = {
  '/dashboard': DASHBOARD_PERMISSION,
  '/base/account': 'base:account',
  '/base/init-balance': 'period:init',
  '/base/init-balance/aux': 'period:init',
  '/base/voucher-type': 'base:vtype',
  '/voucher/template': 'base:template',
  '/base/transfer-type': 'base:transfer',
  '/report/dynamic': 'report:define',
  '/base/print-template': 'system:print',
  '/base/cash-flow-items': 'base:cashitem',
  '/base/fund-source': 'base:project',
  '/voucher/entry': 'voucher:entry',
  '/voucher/audit': ['voucher:audit', 'voucher:post', 'voucher:unpost'],
  '/voucher/auto-transfer': 'period:carry',
  '/voucher/query': 'voucher:query',
  '/voucher/period-close': ['period:close', 'period:unclose'],
  '/ledger/general': 'ledger:balance',
  '/ledger/detail': 'ledger:detail',
  '/ledger/balance': 'ledger:general',
  '/ledger/cash-journal': ['ledger:cash', 'ledger:bank'],
  '/ledger/cash-flow-trial-balance': 'ledger:cashflow',
  '/ledger/chronological': 'ledger:detail',
  '/base/project': 'base:project',
  '/ledger/aux-balance': 'ledger:aux',
  '/ledger/aux-detail': 'ledger:aux',
  '/system/account-set': 'system:account',
  '/system/user': 'system:user',
  '/system/role': 'system:role',
  '/system/param': 'system:init',
  '/system/log': 'period:log',
  '/security/backup': ['system:backup', 'system:restore'],
  '/cashier/journal': 'cashier:journal',
  '/cashier/init-balance': 'cashier:initbal',
  '/cashier/reconciliation': 'cashier:reconcile',
  '/cashier/flow-query': 'cashier:journal',
  '/cashier/daily-report': 'cashier:journal',
  '/cashier/bank-import': 'cashier:reconcile',
  '/cashier/reset': 'cashier:initbal',
  '/asset/list': 'asset:view',
  '/asset/depreciation': 'asset:edit',
  '/asset/report': 'asset:view',
  '/asset/inventory': 'asset:edit',
  '/asset/dict': 'asset:dict',
  '/report/cash-flow': 'ledger:cashflow',
  '/aux/dept': 'base:dept',
  '/aux/project': 'base:project',
  '/aux/supplier': 'base:customer',
  '/aux/person': 'base:person',
  '/aux/func-class': 'base:aux',
}

export function normalizePath(path: string): string {
  const raw = path.split('?')[0] || path
  return raw.startsWith('/') ? raw : `/${raw}`
}

function toPermissionList(permission?: string | string[]): string[] {
  if (!permission) return []
  return Array.isArray(permission) ? permission : [permission]
}

function hasAnyPermissionInList(permissions: string[], required: string[]): boolean {
  if (permissions.includes('*')) return true
  if (required.length === 0) return true
  return required.some(p => permissions.includes(p))
}

/** 判断用户是否拥有指定权限集合中的任一权限 */
export function matchPermissions(permissions: string[], required: string | string[]): boolean {
  return hasAnyPermissionInList(permissions, toPermissionList(required))
}

/** 判断单个 NavItem 是否可见 */
export function isNavItemVisible(item: NavItem, permissions: string[], enableCashFlow: boolean): boolean {
  if (item.requiresCashFlow && !enableCashFlow) return false
  if (!item.permission) return true
  return matchPermissions(permissions, item.permission)
}

function filterNavItems(items: NavItem[], permissions: string[], enableCashFlow: boolean): NavItem[] {
  return items.filter(item => isNavItemVisible(item, permissions, enableCashFlow))
}

/** 静态菜单分组定义（不含动态报表子项） */
function getStaticMenuGroups(enableCashFlow: boolean): NavGroup[] {
  const baseSettingChildren: NavItem[] = [
    { path: '/base/account', title: '会计科目', permission: 'base:account' },
    { path: '/base/init-balance', title: '期初余额', permission: 'period:init' },
    { path: '/base/voucher-type', title: '凭证类型', permission: 'base:vtype' },
    { path: '/voucher/template', title: '凭证模版', permission: 'base:template' },
    { path: '/base/transfer-type', title: '结转维护', permission: 'base:transfer' },
    { path: '/report/dynamic', title: '报表维护', permission: 'report:define' },
    { path: '/base/print-template', title: '打印模版', permission: 'system:print' },
  ]
  baseSettingChildren.push(
    { path: '/asset/dict', title: '资产档案', permission: 'asset:dict' },
  )
  if (enableCashFlow) {
    baseSettingChildren.push(
      { path: '/base/cash-flow-items', title: '现金流量项目', permission: 'base:cashitem', requiresCashFlow: true },
      { path: '/base/fund-source', title: '资金来源', permission: 'base:project', requiresCashFlow: true }
    )
  }

  const ledgerChildren: NavItem[] = [
    { path: '/ledger/general', title: '科目余额表', permission: 'ledger:balance' },
    { path: '/ledger/detail', title: '明细账', permission: 'ledger:detail' },
    { path: '/ledger/balance', title: '总分类账', permission: 'ledger:general' },
    { path: '/ledger/cash-journal', title: '日记账', permission: ['ledger:cash', 'ledger:bank'] },
  ]
  if (enableCashFlow) {
    ledgerChildren.push({
      path: '/ledger/cash-flow-trial-balance',
      title: '现金流量试算平衡表',
      permission: 'ledger:cashflow',
      requiresCashFlow: true,
    })
  }
  ledgerChildren.push({ path: '/ledger/chronological', title: '序时账', permission: 'ledger:detail' })

  return [
    {
      title: '凭证管理',
      icon: 'EditPen',
      children: [
        { path: '/voucher/entry', title: '凭证录入', permission: 'voucher:entry' },
        {
          path: '/voucher/audit',
          title: '凭证管理',
          permission: ['voucher:audit', 'voucher:post', 'voucher:unpost'],
        },
        { path: '/voucher/auto-transfer', title: '凭证结转', permission: 'period:carry' },
        { path: '/voucher/query', title: '凭证查询', permission: 'voucher:query' },
        { path: '/voucher/period-close', title: '期间结账', permission: ['period:close', 'period:unclose'] },
      ],
    },
    { title: '账簿管理', icon: 'List', children: ledgerChildren },
    {
      title: '辅助核算',
      icon: 'FolderOpened',
      children: [
        { path: '/base/project', title: '核算项目', permission: 'base:project' },
        { path: '/ledger/aux-balance', title: '辅助项目余额表', permission: 'ledger:aux' },
        { path: '/ledger/aux-detail', title: '辅助项目明细账', permission: 'ledger:aux' },
      ],
    },
    { title: '报表管理', icon: 'TrendCharts', children: [] },
    {
      title: '出纳管理',
      icon: 'CreditCard',
      children: [
        { path: '/cashier/journal', title: '出纳单据', permission: 'cashier:journal' },
        { path: '/cashier/daily-report', title: '出纳日报', permission: 'cashier:journal' },
        { path: '/cashier/flow-query', title: '出纳流水账', permission: 'cashier:journal' },
        { path: '/cashier/init-balance', title: '出纳期初', permission: 'cashier:initbal' },
        { path: '/cashier/bank-import', title: '对账单导入', permission: 'cashier:reconcile' },
        { path: '/cashier/reconciliation', title: '余额调节表', permission: 'cashier:reconcile' },
        { path: '/cashier/reset', title: '出纳初始化', permission: 'cashier:initbal' },
      ],
    },
    {
      title: '固定资产',
      icon: 'OfficeBuilding',
      children: [
        { path: '/asset/list', title: '资产卡片', permission: 'asset:view' },
        { path: '/asset/depreciation', title: '折旧计提', permission: 'asset:edit' },
        { path: '/asset/report', title: '资产报表', permission: 'asset:view' },
        { path: '/asset/inventory', title: '资产盘点', permission: 'asset:edit' },
      ],
    },
    { title: '基础设置', icon: 'Coin', children: baseSettingChildren },
    {
      title: '系统管理',
      icon: 'Setting',
      children: [
        { path: '/system/account-set', title: '账套管理', permission: 'system:account' },
        { path: '/system/user', title: '用户管理', permission: 'system:user' },
        { path: '/system/role', title: '角色管理', permission: 'system:role' },
        { path: '/system/param', title: '系统参数', permission: 'system:init' },
        { path: '/system/log', title: '操作日志', permission: 'period:log' },
      ],
    },
    {
      title: '数据安全',
      icon: 'Box',
      children: [{ path: '/security/backup', title: '备份恢复', permission: ['system:backup', 'system:restore'] }],
    },
  ]
}

/** 过滤菜单分组（保留 enableCashFlow 逻辑 + 权限过滤） */
export function buildMenuGroups(
  permissions: string[],
  enableCashFlow: boolean,
  dynamicReportItems: NavItem[]
): NavGroup[] {
  const groups = getStaticMenuGroups(enableCashFlow).map(group => {
    if (group.title === '报表管理') {
      return {
        ...group,
        children: filterNavItems(dynamicReportItems, permissions, enableCashFlow),
      }
    }
    return {
      ...group,
      children: filterNavItems(group.children, permissions, enableCashFlow),
    }
  })

  return groups.filter(group => group.children.length > 0)
}

/** 路由守卫用：根据 path 查权限，支持动态路由段 */
export function getRoutePermissions(path: string): string[] | undefined {
  const normalized = normalizePath(path)

  if ((ROUTE_PERMISSION_WHITELIST as readonly string[]).includes(normalized)) {
    return undefined
  }

  const exact = ROUTE_PERMISSION_MAP[normalized]
  if (exact) {
    return toPermissionList(exact)
  }

  // 动态报表查看：/report/dynamic/:code
  const dynamicReportMatch = normalized.match(/^\/report\/dynamic\/[^/]+$/)
  if (dynamicReportMatch) {
    return ['report:view']
  }

  // 兼容 Dashboard 等使用的 /report/run/:code
  const reportRunMatch = normalized.match(/^\/report\/run\/[^/]+$/)
  if (reportRunMatch) {
    return ['report:view']
  }

  // 资产明细账：/asset/detail/:id
  const assetDetailMatch = normalized.match(/^\/asset\/detail\/[^/]+$/)
  if (assetDetailMatch) {
    return ['asset:view']
  }

  return undefined
}

/** 判断用户是否有权访问指定路由 */
export function canAccessRoute(path: string, permissions: string[]): boolean {
  const normalized = normalizePath(path)

  if ((ROUTE_PERMISSION_WHITELIST as readonly string[]).includes(normalized)) {
    return true
  }

  const required = getRoutePermissions(normalized)
  if (!required || required.length === 0) {
    return true
  }

  return matchPermissions(permissions, required)
}

/** 登录后默认落地页：有主页权限则 /dashboard，否则取第一个可访问菜单 */
export function getDefaultLandingPath(permissions: string[], enableCashFlow = false): string {
  if (canAccessRoute('/dashboard', permissions)) {
    return '/dashboard'
  }
  const groups = buildMenuGroups(permissions, enableCashFlow, [])
  const first = groups.flatMap(g => g.children)[0]
  return first?.path.split('?')[0] || '/forbidden'
}

/** 无路由权限时落到可访问首页，避免停留在无权限页并触发 403 提示 */
export function resolveAccessiblePath(
  targetPath: string,
  permissions: string[],
  enableCashFlow = false
): string {
  const normalized = normalizePath(targetPath)
  if (canAccessRoute(normalized, permissions)) {
    return normalized
  }
  return getDefaultLandingPath(permissions, enableCashFlow)
}

/** 后端 requirePermission 返回的 403 文案（与 accountScope 等业务 403 区分） */
export const API_ROUTE_PERMISSION_DENIED_MESSAGE = '无此操作权限'

export function isApiRoutePermissionDenied(message?: string): boolean {
  return message === API_ROUTE_PERMISSION_DENIED_MESSAGE
}
