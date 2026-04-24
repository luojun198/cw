import { ElMessage } from 'element-plus'

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
