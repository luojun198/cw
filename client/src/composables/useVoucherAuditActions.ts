import { ref } from 'vue'
import request from '@/api/request'
import { useConfirm, useBatchConfirm } from './useConfirm'
import { showSuccess, showError, showOperationSuccess } from './useMessage'
import { useOperationHistory } from './useOperationHistory'
import { useGlobalOperationHistory } from './useOperationHistory'

export function useVoucherAuditActions(fetchData: () => Promise<void>) {
  const detail = ref<any>(null)
  const detailVisible = ref(false)
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
      showSuccess('过账成功')
    }
    addRecord('update', '凭证过账', `过账凭证 ${row.voucher_no || voucherId}`)
    if (!options?.skipRefresh) {
      await fetchData()
    }
  }

  async function unPost(row: any, options?: { silent?: boolean; skipConfirm?: boolean }) {
    const voucherId = row._voucherId || row.id
    if (!options?.skipConfirm) {
      const confirmed = await useConfirm({
        message: '确认反过账此凭证？',
        type: 'warning',
      })
      if (!confirmed) return
    }
    await request.post(`/voucher/vouchers/${voucherId}/unpost`)
    if (!options?.silent) {
      showSuccess('反过账成功')
    }
    addRecord('update', '凭证过账', `反过账凭证 ${row.voucher_no || voucherId}`)
    await fetchData()
  }

  async function batchAudit(selected: any[]) {
    for (const r of selected) {
      if (r.status === 'draft') {
        await audit(r)
      }
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
      showError('当前所选凭证中没有可过账的凭证')
      return
    }

    batchPosting.value = true
    try {
      for (const r of postableVouchers) {
        await post(r, { silent: true, skipRefresh: true })
      }
      await fetchData()
      showOperationSuccess('批量过账', `共过账 ${postableVouchers.length} 张凭证`)
    } finally {
      batchPosting.value = false
    }
  }

  async function batchUnpost(selected: any[]) {
    const unpostableVouchers = selected.filter(r => r.status === 'posted')

    if (!unpostableVouchers.length) {
      showError('当前所选凭证中没有可反过账的凭证')
      return
    }

    const voucherNos = unpostableVouchers.map(v => v.voucher_no || '未知凭证号')
    const confirmed = await useBatchConfirm('反过账', voucherNos, '此操作将取消凭证的过账状态')
    if (!confirmed) return

    batchUnposting.value = true
    try {
      for (const r of unpostableVouchers) {
        await unPost(r, { silent: true, skipConfirm: true })
      }
      showOperationSuccess('批量反过账', `共反过账 ${unpostableVouchers.length} 张凭证`)
    } finally {
      batchUnposting.value = false
    }
  }

  return {
    detail,
    detailVisible,
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
