import { ref } from 'vue'
import request from '@/api/request'
import { useConfirm, useBatchConfirm } from './useConfirm'
import { showSuccess, showError, showOperationSuccess } from './useMessage'
import { useOperationHistory } from './useOperationHistory'

export function useVoucherAuditActions(fetchData: () => Promise<void>) {
  const detail = ref<any>(null)
  const detailVisible = ref(false)
  const batchAuditing = ref(false)
  const batchPosting = ref(false)
  const batchUnposting = ref(false)
  const batchUnauditing = ref(false)
  const { addRecord } = useOperationHistory()

  async function viewDetail(row: any) {
    const voucherId = row._voucherId || row.id
    const res = await request.get(`/voucher/vouchers/${voucherId}`)
    detail.value = res.data
    detailVisible.value = true
  }

  async function audit(row: any) {
    const voucherId = row._voucherId || row.id
    await request.post(`/voucher/vouchers/${voucherId}/audit`)
    showSuccess('审核成功')
    addRecord('update', '凭证审核', `审核凭证 ${row.voucher_no || voucherId}`)
    await fetchData()
  }

  async function unAudit(row: any, options?: { silent?: boolean; skipConfirm?: boolean }) {
    const voucherId = row._voucherId || row.id
    if (!options?.skipConfirm) {
      const confirmed = await useConfirm({
        message: '确认反审核此凭证？',
        type: 'warning',
      })
      if (!confirmed) return
    }
    await request.post(`/voucher/vouchers/${voucherId}/unaudit`)
    if (!options?.silent) {
      showSuccess('反审核成功')
    }
    addRecord('update', '凭证审核', `反审核凭证 ${row.voucher_no || voucherId}`)
    await fetchData()
  }

  async function post(row: any, options?: { silent?: boolean; skipRefresh?: boolean }) {
    const voucherId = row._voucherId || row.id
    await request.post(`/voucher/vouchers/${voucherId}/post`)
    if (!options?.silent) {
      showSuccess('记账成功')
    }
    addRecord('update', '凭证记账', `记账凭证 ${row.voucher_no || voucherId}`)
    if (!options?.skipRefresh) {
      await fetchData()
    }
  }

  async function unPost(row: any, options?: { silent?: boolean; skipConfirm?: boolean }) {
    const voucherId = row._voucherId || row.id
    if (!options?.skipConfirm) {
      const confirmed = await useConfirm({
        message: '确认反记账此凭证？',
        type: 'warning',
      })
      if (!confirmed) return
    }
    await request.post(`/voucher/vouchers/${voucherId}/unpost`)
    if (!options?.silent) {
      showSuccess('反记账成功')
    }
    addRecord('update', '凭证记账', `反记账凭证 ${row.voucher_no || voucherId}`)
    await fetchData()
  }

  async function batchAudit(selected: any[]) {
    const auditableVouchers = selected.filter(r => r.status === 'draft')

    if (!auditableVouchers.length) {
      showError('当前所选凭证中没有可审核的凭证')
      return
    }

    batchAuditing.value = true
    try {
      // 注意：表格按分录展平时 row.id 会被 entry.id 覆盖；必须先取 _voucherId
      // 同时按 voucher 去重，多条分录展平不要重复提交同一张凭证
      const voucherIds = Array.from(
        new Set(
          auditableVouchers
            .map(r => r._voucherId || r.id)
            .filter(Boolean)
        )
      )
      const res = await request.post<{
        total?: number
        success?: number
        fail?: number
        details?: Array<{ id: string; success: boolean; error?: string }>
      }>('/voucher/vouchers/batch-audit', { voucherIds })
      const data = res.data
      const successCount = data?.success ?? voucherIds.length
      const failCount = data?.fail ?? 0
      if (failCount > 0 && successCount === 0) {
        const firstError = data?.details?.find(d => !d.success)?.error
        showError(`批量审核失败：${firstError || `${failCount} 张全部失败`}`)
      } else if (failCount > 0) {
        showError(`批量审核完成：成功 ${successCount} 张，失败 ${failCount} 张`)
      } else {
        showOperationSuccess('批量审核', res.message || `共审核 ${successCount} 张凭证`)
      }
      await fetchData()
    } finally {
      batchAuditing.value = false
    }
  }

  async function batchUnAudit(selected: any[]) {
    const unauditableVouchers = selected.filter(r => r.status === 'audited')

    if (!unauditableVouchers.length) {
      showError('当前所选凭证中没有可反审核的凭证')
      return
    }

    const voucherNos = unauditableVouchers.map(v => v.voucher_no || '未知凭证号')
    const confirmed = await useBatchConfirm('反审核', voucherNos, '此操作将取消凭证的审核状态')
    if (!confirmed) return

    batchUnauditing.value = true
    try {
      for (const r of unauditableVouchers) {
        await unAudit(r, { silent: true, skipConfirm: true })
      }
      showOperationSuccess('批量反审核', `共反审核 ${unauditableVouchers.length} 张凭证`)
    } finally {
      batchUnauditing.value = false
    }
  }

  async function batchPost(selected: any[]) {
    const postableVouchers = selected.filter(r => r.status !== 'posted')

    if (!postableVouchers.length) {
      showError('当前所选凭证中没有可记账的凭证')
      return
    }

    batchPosting.value = true
    try {
      for (const r of postableVouchers) {
        await post(r, { silent: true, skipRefresh: true })
      }
      await fetchData()
      showOperationSuccess('批量记账', `共记账 ${postableVouchers.length} 张凭证`)
    } finally {
      batchPosting.value = false
    }
  }

  async function batchUnpost(selected: any[]) {
    const unpostableVouchers = selected.filter(r => r.status === 'posted')

    if (!unpostableVouchers.length) {
      showError('当前所选凭证中没有可反记账的凭证')
      return
    }

    const voucherNos = unpostableVouchers.map(v => v.voucher_no || '未知凭证号')
    const confirmed = await useBatchConfirm('反记账', voucherNos, '此操作将取消凭证的记账状态')
    if (!confirmed) return

    batchUnposting.value = true
    try {
      for (const r of unpostableVouchers) {
        await unPost(r, { silent: true, skipConfirm: true })
      }
      showOperationSuccess('批量反记账', `共反记账 ${unpostableVouchers.length} 张凭证`)
    } finally {
      batchUnposting.value = false
    }
  }

  return {
    detail,
    detailVisible,
    batchAuditing,
    batchPosting,
    batchUnposting,
    batchUnauditing,
    addRecord,
    viewDetail,
    audit,
    unAudit,
    post,
    unPost,
    batchAudit,
    batchUnAudit,
    batchPost,
    batchUnpost,
  }
}
