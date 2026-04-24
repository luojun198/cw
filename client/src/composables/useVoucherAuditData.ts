import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import request from '@/api/request'
import { useTableSearch } from '@/composables/useTableSearch'
import { performanceMonitor } from '@/utils/performanceMonitor'

export function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(val || 0)
}

export function getVoucherSeq(voucherNo: string) {
  const idx = voucherNo.indexOf('-')
  const seq = idx >= 0 ? voucherNo.slice(idx + 1) : voucherNo
  return String(parseInt(seq, 10))
}

const typeAbbr: Record<string, string> = {
  记账凭证: '记',
  收款凭证: '收',
  付款凭证: '付',
  转账凭证: '转',
}

export function getTypeAbbr(name: string) {
  return typeAbbr[name] || name.charAt(0) || '凭'
}

export const statusType: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
  draft: 'info',
  audited: 'success',
  posted: 'warning',
}

export const statusText: Record<string, string> = {
  draft: '草稿',
  audited: '已审核',
  posted: '已过账'
}

export function useVoucherAuditData() {
  const list = ref<any[]>([])
  const selected = ref<any[]>([])
  const dateRange = ref<any[]>([])
  const voucherTypes = ref<any[]>([])
  const allowDirectPost = ref(false)
  const requireAudit = ref(true)
  const sortField = ref<string>('voucher_date')
  const sortOrder = ref<'asc' | 'desc'>('asc')

  async function fetchData(params?: any) {
    return performanceMonitor.measure('voucherAudit fetchData', async () => {
      const queryParams: any = {}
      if (dateRange.value?.length) {
        queryParams.start_date = dateRange.value[0]
        queryParams.end_date = dateRange.value[1]
      }
      if (params) {
        Object.assign(queryParams, params)
      }
      const res = await request.get<any[]>('/voucher/vouchers', { params: queryParams })
      list.value = res.data
    })
  }

  // 提取凭证号序号（用于排序）
  function extractVoucherSeq(voucherNo: string): number {
    if (!voucherNo) return 0
    const dashIndex = voucherNo.indexOf('-')
    if (dashIndex < 0) return parseInt(voucherNo, 10) || 0
    const seqStr = voucherNo.substring(dashIndex + 1)
    return parseInt(seqStr, 10) || 0
  }

  // 排序后的凭证列表
  const sortedList = computed(() => {
    const sorted = [...list.value]
    const field = sortField.value
    const order = sortOrder.value

    sorted.sort((a, b) => {
      let aVal: any
      let bVal: any

      if (field === 'voucher_no') {
        aVal = extractVoucherSeq(a.voucher_no)
        bVal = extractVoucherSeq(b.voucher_no)
      } else if (field === 'debit_amount') {
        // 计算凭证的借方总额
        aVal = (a.entries || []).reduce((sum: number, e: any) => sum + (e.direction === 'debit' ? e.amount : 0), 0)
        bVal = (b.entries || []).reduce((sum: number, e: any) => sum + (e.direction === 'debit' ? e.amount : 0), 0)
      } else if (field === 'credit_amount') {
        // 计算凭证的贷方总额
        aVal = (a.entries || []).reduce((sum: number, e: any) => sum + (e.direction === 'credit' ? e.amount : 0), 0)
        bVal = (b.entries || []).reduce((sum: number, e: any) => sum + (e.direction === 'credit' ? e.amount : 0), 0)
      } else {
        aVal = a[field]
        bVal = b[field]
      }

      if (aVal < bVal) return order === 'asc' ? -1 : 1
      if (aVal > bVal) return order === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  })

  const flatList: ComputedRef<any[]> = computed(() => {
    const rows: any[] = []
    for (const [index, v] of sortedList.value.entries()) {
      const seq = getVoucherSeq(v.voucher_no)
      const abbr = getTypeAbbr(v.voucher_type_name || '记')
      const voucherLabel = `${abbr}-${seq}`
      const entries = v.entries?.length ? v.entries : [null]
      const entryCount = entries.length
      for (const [entryIndex, e] of entries.entries()) {
        // 解析 aux_data，提取辅助项目名称
        const auxFields: Record<string, string> = {}
        if (e?.aux_data) {
          try {
            const auxData = typeof e.aux_data === 'string' ? JSON.parse(e.aux_data) : e.aux_data
            for (const [code, val] of Object.entries(auxData)) {
              if (val && typeof val === 'object' && (val as any).name) {
                auxFields[`_aux_${code}`] = (val as any).name
              }
            }
          } catch { /* ignore */ }
        }
        rows.push({
          ...v,
          ...(e || {}),
          ...auxFields,
          voucher_no: voucherLabel,
          summary: e ? (e.summary || v.remark || '') : (v.remark || ''),
          _voucherId: v.id,
          _stripeGroup: index % 2,
          _isFirstEntryRow: entryIndex === 0,
          _voucherRowIndex: entryIndex,
          _voucherEntryCount: entryCount,
        })
      }
    }
    return rows
  })

  function isVoucherSelected(row: any) {
    const voucherId = row._voucherId || row.id
    return selected.value.some(item => item.id === voucherId)
  }

  function isSelectableRow(row: any) {
    return row._isFirstEntryRow === true
  }

  function getRowClass({ row }: { row: any }) {
    const classes = [row._stripeGroup === 0 ? 'voucher-group-even' : 'voucher-group-odd']
    if (isVoucherSelected(row)) {
      classes.push('voucher-selected')
    }
    return classes.join(' ')
  }

  function onSelect(rows: any[]) {
    const voucherStatusMap = new Map(sortedList.value.map(v => [v.id, v.status]))
    const map = new Map<string, any>()
    for (const row of rows) {
      const voucherId = row._voucherId || row.id
      if (!map.has(voucherId)) {
        map.set(voucherId, {
          ...row,
          id: voucherId,
          status: voucherStatusMap.get(voucherId) ?? row.status,
        })
      }
    }
    selected.value = Array.from(map.values())
  }

  // Table search with highlighting - 添加金额搜索
  const searchKeyword = ref('')

  const filteredData = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    if (!keyword) return flatList.value

    return flatList.value.filter(row => {
      // 搜索凭证号、摘要、科目名称
      const textMatch =
        row.voucher_no?.toLowerCase().includes(keyword) ||
        row.summary?.toLowerCase().includes(keyword) ||
        row.account_name?.toLowerCase().includes(keyword) ||
        row.remark?.toLowerCase().includes(keyword)

      // 搜索金额（支持数字搜索）
      const amountMatch =
        row.amount?.toString().includes(keyword) ||
        (row.direction === 'debit' && row.amount?.toString().includes(keyword)) ||
        (row.direction === 'credit' && row.amount?.toString().includes(keyword))

      return textMatch || amountMatch
    })
  })

  function clearSearch() {
    searchKeyword.value = ''
  }

  async function fetchVoucherTypes() {
    const res = await request.get<any[]>('/base/voucher-types')
    voucherTypes.value = res.data
  }

  async function fetchSystemParams() {
    const res = await request.get<any[]>('/system/params')
    for (const p of res.data || []) {
      if (p.param_key === 'allow_direct_post') allowDirectPost.value = p.param_value === 'true'
      if (p.param_key === 'require_audit') requireAudit.value = p.param_value === 'true'
    }
  }

  return {
    list,
    selected,
    dateRange,
    voucherTypes,
    allowDirectPost,
    requireAudit,
    sortField,
    sortOrder,
    flatList,
    filteredData,
    searchKeyword,
    clearSearch,
    isVoucherSelected,
    isSelectableRow,
    getRowClass,
    onSelect,
    fetchData,
    fetchVoucherTypes,
    fetchSystemParams,
  }
}
