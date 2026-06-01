import type { Database } from 'better-sqlite3'

export const ACCOUNTING_STANDARD_PARAM_KEY = 'accounting_standard'
export const DASHBOARD_CATEGORY_RULES_PARAM_KEY = 'dashboard_category_rules'

export const ACCOUNTING_STANDARD_OPTIONS = [
  'auto',
  'government',
  'small_business',
  'enterprise',
  'custom',
] as const

export type AccountingStandardParam = (typeof ACCOUNTING_STANDARD_OPTIONS)[number]

export type DashboardCategoryRule = {
  codeRoots: string[]
  nameKeywords: string[]
}

export type DashboardCategoryRules = {
  income: DashboardCategoryRule
  pureExpense: DashboardCategoryRule
  fee: DashboardCategoryRule
  cost: DashboardCategoryRule
}

export type DashboardRuleMode = 'preset' | 'custom' | 'auto'

const CODE_ROOT_PATTERN = /^[A-Za-z0-9]{1,20}$/

export const DEFAULT_DASHBOARD_CATEGORY_RULES: DashboardCategoryRules = {
  income: { codeRoots: [], nameKeywords: ['收入'] },
  pureExpense: { codeRoots: [], nameKeywords: ['支出'] },
  fee: { codeRoots: [], nameKeywords: ['费用'] },
  cost: { codeRoots: [], nameKeywords: ['成本'] },
}

export const ACCOUNTING_STANDARD_LABELS: Record<AccountingStandardParam, string> = {
  auto: '自动识别',
  government: '政府会计制度',
  small_business: '小企业会计准则',
  enterprise: '新企业会计准则',
  custom: '自定义',
}

export function isAccountingStandardParam(value: unknown): value is AccountingStandardParam {
  return (
    typeof value === 'string' &&
    (ACCOUNTING_STANDARD_OPTIONS as readonly string[]).includes(value)
  )
}

export function normalizeCodeRoots(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const roots = input
    .map(item => String(item ?? '').trim())
    .filter(item => item.length > 0)
  return [...new Set(roots)]
}

export function normalizeNameKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const keywords = input
    .map(item => String(item ?? '').trim())
    .filter(item => item.length > 0)
  return [...new Set(keywords)]
}

export function normalizeDashboardCategoryRule(input: unknown): DashboardCategoryRule {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Partial<DashboardCategoryRule>)
      : {}
  return {
    codeRoots: normalizeCodeRoots(source.codeRoots),
    nameKeywords: normalizeNameKeywords(source.nameKeywords),
  }
}

export function normalizeDashboardCategoryRules(input: unknown): DashboardCategoryRules {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Partial<DashboardCategoryRules>)
      : {}
  return {
    income: normalizeDashboardCategoryRule(source.income),
    pureExpense: normalizeDashboardCategoryRule(source.pureExpense),
    fee: normalizeDashboardCategoryRule(source.fee),
    cost: normalizeDashboardCategoryRule(source.cost),
  }
}

export function parseDashboardCategoryRulesJson(raw: unknown): DashboardCategoryRules {
  if (raw == null || raw === '') {
    return normalizeDashboardCategoryRules(DEFAULT_DASHBOARD_CATEGORY_RULES)
  }
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  return normalizeDashboardCategoryRules(parsed)
}

export function hasConfiguredDashboardRule(rule: DashboardCategoryRule): boolean {
  return rule.codeRoots.length > 0 || rule.nameKeywords.length > 0
}

export function hasAnyCodeRoots(rules: DashboardCategoryRules): boolean {
  return [rules.income, rules.pureExpense, rules.fee, rules.cost].some(
    rule => rule.codeRoots.length > 0
  )
}

export function validateDashboardCategoryRules(rules: DashboardCategoryRules): string | null {
  const allRules = [rules.income, rules.pureExpense, rules.fee, rules.cost]
  for (const rule of allRules) {
    for (const root of rule.codeRoots) {
      if (!CODE_ROOT_PATTERN.test(root)) {
        return `科目编码根「${root}」格式无效，仅允许 1-20 位字母或数字`
      }
    }
  }
  const hasAny = allRules.some(hasConfiguredDashboardRule)
  if (!hasAny) {
    return '自定义取数规则至少需配置一类科目的编码根或名称关键字'
  }
  return null
}

export function validateAccountingStandardParamValue(value: unknown): string | null {
  if (value == null || value === '') return null
  if (!isAccountingStandardParam(value)) {
    return '会计准则参数值无效'
  }
  return null
}

export function validateSystemParamEntry(
  paramKey: string,
  paramValue: string,
  allParams: Array<{ param_key: string; param_value: string }>
): string | null {
  if (paramKey === ACCOUNTING_STANDARD_PARAM_KEY) {
    const error = validateAccountingStandardParamValue(paramValue)
    if (error) return error
    if (paramValue === 'custom') {
      const rulesRaw = allParams.find(item => item.param_key === DASHBOARD_CATEGORY_RULES_PARAM_KEY)
        ?.param_value
      try {
        const rules = parseDashboardCategoryRulesJson(rulesRaw)
        return validateDashboardCategoryRules(rules)
      } catch {
        return '自定义取数规则 JSON 格式无效'
      }
    }
    return null
  }

  if (paramKey === DASHBOARD_CATEGORY_RULES_PARAM_KEY) {
    const standard = allParams.find(item => item.param_key === ACCOUNTING_STANDARD_PARAM_KEY)
      ?.param_value
    try {
      const rules = parseDashboardCategoryRulesJson(paramValue)
      if (standard === 'custom') {
        return validateDashboardCategoryRules(rules)
      }
      if (hasAnyCodeRoots(rules)) {
        return validateDashboardCategoryRules(rules)
      }
      return null
    } catch {
      return '自定义取数规则 JSON 格式无效'
    }
  }

  return null
}

export function getAccountingStandardParam(
  db: Database,
  accountSetId: string
): AccountingStandardParam {
  const row = db
    .prepare(
      `SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ? LIMIT 1`
    )
    .get(accountSetId, ACCOUNTING_STANDARD_PARAM_KEY) as { param_value?: string } | undefined
  const value = row?.param_value?.trim()
  return isAccountingStandardParam(value) ? value : 'auto'
}

export function getDashboardCategoryRulesParam(
  db: Database,
  accountSetId: string
): DashboardCategoryRules {
  const row = db
    .prepare(
      `SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ? LIMIT 1`
    )
    .get(accountSetId, DASHBOARD_CATEGORY_RULES_PARAM_KEY) as { param_value?: string } | undefined
  try {
    return parseDashboardCategoryRulesJson(row?.param_value)
  } catch {
    return normalizeDashboardCategoryRules(DEFAULT_DASHBOARD_CATEGORY_RULES)
  }
}

export function inferAccountingStandardFromTemplateId(templateId: string): AccountingStandardParam {
  const normalized = templateId.trim()
  if (normalized.includes('行政事业') || normalized.includes('政府')) return 'government'
  if (normalized.includes('小企业')) return 'small_business'
  if (normalized.includes('新企业') || normalized.includes('企业会计')) return 'enterprise'
  return 'auto'
}

export function serializeDashboardCategoryRules(rules: DashboardCategoryRules): string {
  return JSON.stringify(normalizeDashboardCategoryRules(rules))
}
