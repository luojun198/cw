import { ElMessage, ElMessageBox } from 'element-plus'
import {
  buildNoNegativeBalanceAlertHtml,
  type NoNegativeBalanceViolation,
} from '@/utils/noNegativeBalanceAlert'

/**
 * 成功提示
 */
export function showSuccess(message: string, duration = 2000) {
  ElMessage.success({
    message,
    duration,
    showClose: true,
  })
}

/**
 * 错误提示
 */
export function showError(message: string, duration = 3000) {
  ElMessage.error({
    message,
    duration,
    showClose: true,
  })
}

/**
 * 警告提示
 */
export function showWarning(message: string, duration = 2500) {
  ElMessage.warning({
    message,
    duration,
    showClose: true,
  })
}

/**
 * 信息提示
 */
export function showInfo(message: string, duration = 2000) {
  ElMessage.info({
    message,
    duration,
    showClose: true,
  })
}

/**
 * 操作成功提示（带详情）
 */
export function showOperationSuccess(operation: string, details?: string) {
  const message = details ? `${operation}成功：${details}` : `${operation}成功`
  showSuccess(message)
}

/**
 * 操作失败提示（带详情）
 */
export function showOperationError(operation: string, error: any) {
  const message = error?.response?.data?.message || error?.message || '操作失败'
  showError(`${operation}失败：${message}`)
}

/**
 * 从请求错误对象中提取可读消息
 */
export function extractErrorMessage(error: any, fallback = '操作失败'): string {
  return error?.response?.data?.message || error?.message || fallback
}

/** 是否为「余额不允许为负数 / 保存后余额试算」类校验错误 */
export function isNoNegativeBalanceMessage(message: string, codeType?: string): boolean {
  if (codeType === 'NO_NEGATIVE_BALANCE') return true
  return message.includes('余额不允许为负数') || message.includes('保存后余额将为')
}

/** 科目负数试算：弹框提醒，需用户手动关闭 */
export function showNoNegativeBalanceAlert(
  violations?: NoNegativeBalanceViolation[],
  fallbackMessage?: string
) {
  const html =
    violations && violations.length > 0
      ? buildNoNegativeBalanceAlertHtml(violations)
      : `<div style="font-size:13px;line-height:1.8;color:#606266;">${escapeAlertFallback(fallbackMessage || '余额不允许为负数，无法保存凭证。')}</div>`

  return ElMessageBox.alert(html, '科目余额负数试算提醒', {
    type: 'warning',
    confirmButtonText: '我知道了',
    closeOnClickModal: false,
    closeOnPressEscape: false,
    dangerouslyUseHTMLString: true,
    customClass: 'no-negative-balance-messagebox',
  })
}

function escapeAlertFallback(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/【([^】]+)】/g, '<span style="color:#409eff;font-weight:600;">【$1】</span>')
    .replace(
      /(-?\d+\.\d{2})/g,
      '<span style="color:#f56c6c;font-weight:700;">$1</span>'
    )
    .replace(/余额不允许为负数/g, '<span style="color:#e6a23c;font-weight:600;">余额不允许为负数</span>')
}
