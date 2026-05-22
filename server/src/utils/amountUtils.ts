/**
 * 金额转换工具函数
 * 用于在元（REAL）和分（INTEGER）之间转换
 */

/**
 * 元转分：将浮点数金额转换为整数分
 * @param yuan 金额（元）
 * @returns 金额（分）
 */
export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

/**
 * 分转元：将整数分转换为浮点数金额
 * @param cents 金额（分）
 * @returns 金额（元）
 */
export function centsToYuan(cents: number): number {
  return cents / 100
}

/**
 * 格式化金额显示（保留两位小数）
 * @param cents 金额（分）
 * @returns 格式化后的金额字符串
 */
export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * 验证金额精度（检查是否为有效的分值）
 * @param cents 金额（分）
 * @returns 是否为整数
 */
export function isValidCents(cents: number): boolean {
  return Number.isInteger(cents)
}

/**
 * 批量转换：元数组转分数组
 * @param yuanArray 金额数组（元）
 * @returns 金额数组（分）
 */
export function batchYuanToCents(yuanArray: number[]): number[] {
  return yuanArray.map(yuanToCents)
}

/**
 * 批量转换：分数组转元数组
 * @param centsArray 金额数组（分）
 * @returns 金额数组（元）
 */
export function batchCentsToYuan(centsArray: number[]): number[] {
  return centsArray.map(centsToYuan)
}

/**
 * 安全的金额加法（避免浮点误差）
 * @param cents1 金额1（分）
 * @param cents2 金额2（分）
 * @returns 相加结果（分）
 */
export function addCents(cents1: number, cents2: number): number {
  return cents1 + cents2
}

/**
 * 安全的金额减法（避免浮点误差）
 * @param cents1 金额1（分）
 * @param cents2 金额2（分）
 * @returns 相减结果（分）
 */
export function subtractCents(cents1: number, cents2: number): number {
  return cents1 - cents2
}

/**
 * 金额求和（分）
 * @param centsArray 金额数组（分）
 * @returns 总和（分）
 */
export function sumCents(centsArray: number[]): number {
  return centsArray.reduce((sum, cents) => sum + cents, 0)
}

/**
 * 比较两个金额是否相等（容忍 1 分的误差）
 * @param cents1 金额1（分）
 * @param cents2 金额2（分）
 * @returns 是否相等
 */
export function amountsEqual(cents1: number, cents2: number): boolean {
  return Math.abs(cents1 - cents2) <= 1
}
