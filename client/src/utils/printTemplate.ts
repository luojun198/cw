/**
 * 打印模版工具函数
 */

import type { PrintTemplateElements } from '@/types/print'

/**
 * 获取默认打印模版元素配置
 */
export function getDefaultTemplateElements(): PrintTemplateElements {
  return {
    title: {
      type: 'title',
      text: '记账凭证',
      fontSize: 20,
      fontWeight: 'bold',
      align: 'center',
      marginBottom: 10,
    },
    info: {
      type: 'info',
      fields: ['voucher_no', 'date', 'voucher_type', 'attachments'],
      fontSize: 12,
      marginBottom: 10,
    },
    table: {
      type: 'table',
      columns: [
        { field: 'summary', label: '摘要', width: '30%' },
        { field: 'account', label: '会计科目', width: '30%' },
        { field: 'debit', label: '借方金额', width: '20%', align: 'right' },
        { field: 'credit', label: '贷方金额', width: '20%', align: 'right' },
      ],
      fontSize: 12,
      borderWidth: 1,
      marginBottom: 10,
    },
    total: {
      type: 'total',
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 15,
    },
    signature: {
      type: 'signature',
      fields: [
        { label: '制单', field: 'created_by' },
        { label: '审核', field: 'auditor' },
        { label: '记账', field: 'poster' },
        { label: '主管', field: 'supervisor' },
      ],
      fontSize: 12,
    },
  }
}

/**
 * 格式化金额（保留两位小数，千分位分隔）
 */
export function formatAmount(amount: number): string {
  if (amount === 0) return '0.00'
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化日期
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}年${month}月${day}日`
}

/**
 * 获取纸张尺寸（mm）
 */
export function getPaperSize(size: string): { width: number; height: number } {
  switch (size) {
    case 'A4':
      return { width: 210, height: 297 }
    case 'A5':
      return { width: 148, height: 210 }
    default:
      return { width: 220, height: 140 }
  }
}

/**
 * 触发浏览器打印
 */
export function triggerPrint() {
  window.print()
}
