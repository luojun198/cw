/** 将操作日志详情中的 JSON 转为可读文案 */
export function formatLogDetail(detail?: string | null): string {
  if (!detail?.trim()) return '—'

  const trimmed = detail.trim()
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const data = parsed.data as Record<string, unknown> | undefined
      if (typeof data?.blockedReason === 'string' && data.blockedReason) {
        return data.blockedReason
      }
      if (typeof parsed.message === 'string' && parsed.message) {
        return parsed.message
      }
      if (data && typeof data.voucherNo === 'string') {
        return `凭证号：${data.voucherNo}`
      }
    }
  } catch {
    // 非 JSON 或截断 JSON，尝试正则提取 message
    const msgMatch = trimmed.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (msgMatch) {
      return msgMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }
    const reasonMatch = trimmed.match(/"blockedReason"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (reasonMatch) {
      return reasonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }
  }

  return trimmed
}

/** 操作日志 IP 显示（本机回环地址友好展示） */
export function formatLogIp(ip?: string | null): string {
  const value = (ip || '').trim()
  if (!value) return '—'
  if (value === '::1' || value === '0:0:0:0:0:0:0:1' || value === '127.0.0.1') {
    return '本机（127.0.0.1）'
  }
  if (value.startsWith('::ffff:')) {
    return value.replace('::ffff:', '')
  }
  return value
}
