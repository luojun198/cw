import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { hasPermission } from '@/utils/permission'
import { showWarning } from '@/composables/useMessage'

export type LedgerVoucherRow = {
  voucher_id?: string
  voucher_status?: string
  is_opening_balance?: boolean
  is_carry_forward?: boolean
}

export function resolveLedgerVoucherId(row: LedgerVoucherRow): string | null {
  const id = row.voucher_id
  return id ? String(id) : null
}

/** 账簿行是否可双击跳转编辑凭证 */
export function canNavigateToEditVoucher(row: LedgerVoucherRow): boolean {
  if (!hasPermission('voucher:entry')) return false
  if (row.is_opening_balance || row.is_carry_forward) return false
  return Boolean(resolveLedgerVoucherId(row))
}

/**
 * 日记账 / 明细账 / 序时账：有凭证录入权限时，双击草稿凭证行跳转编辑
 */
export function useLedgerVoucherNavigate() {
  const router = useRouter()
  const canEditVoucher = computed(() => hasPermission('voucher:entry'))

  function handleLedgerRowDblClick(row: LedgerVoucherRow) {
    if (!canNavigateToEditVoucher(row)) return

    const voucherId = resolveLedgerVoucherId(row)!
    if (row.voucher_status && row.voucher_status !== 'draft') {
      showWarning('仅草稿凭证可编辑')
      return
    }

    router.push({
      path: '/voucher/entry',
      query: { editVoucherId: voucherId },
    })
  }

  return { canEditVoucher, handleLedgerRowDblClick }
}
