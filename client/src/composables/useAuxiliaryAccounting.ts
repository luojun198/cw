import { computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { isAuxCategoryExcludedFromAccount } from '@/utils/accountCashFlow'

export function useAuxiliaryAccounting(
  accounts: Ref<any[]>,
  auxCategories: Ref<any[]>,
  auxItems: Ref<any[]>,
  currentEntry: Ref<any | null>
) {
  const auxItemsByCategory: ComputedRef<Record<string, any[]>> = computed(() => {
    const map: Record<string, any[]> = {}
    for (const cat of auxCategories.value) {
      map[cat.id] = auxItems.value.filter(i => i.type === cat.id)
    }
    return map
  })

  const currentEntryAuxCategories = computed(() => {
    if (!currentEntry.value) {
      return []
    }
    return auxCategories.value.filter(cat => hasAux(currentEntry.value, cat.id))
  })

  const parentIdSet = computed(
    () => new Set(accounts.value.filter((a: any) => a.parent_id).map((a: any) => a.parent_id))
  )

  function isParentAccount(id: string) {
    return parentIdSet.value.has(id)
  }

  function isAccountAuxCategory(categoryId: string): boolean {
    const cat = auxCategories.value.find(c => c.id === categoryId)
    return !isAuxCategoryExcludedFromAccount(cat?.code)
  }

  function hasAux(entry: any, categoryId: string) {
    if (!isAccountAuxCategory(categoryId)) return false
    const acc = accounts.value.find(a => a.id === entry.account_id)
    if (!acc?.is_aux) return false
    const linkedIds = getAuxCategoryIds(acc)
    if (linkedIds.length === 0) return false
    return linkedIds.includes(categoryId)
  }

  function getAuxCategoryIds(acc: any): string[] {
    if (!acc.aux_types) return []
    try {
      const parsed = typeof acc.aux_types === 'string' ? JSON.parse(acc.aux_types) : acc.aux_types
      let ids: string[] = []
      if (Array.isArray(parsed)) {
        ids = parsed
      } else if (parsed && typeof parsed === 'object') {
        ids = Object.keys(parsed)
      }
      return ids.filter(id => isAccountAuxCategory(id))
    } catch {
      return []
    }
  }

  function getAuxItemIds(acc: any): string[] {
    return getAuxCategoryIds(acc)
  }

  function getAuxItemNames(acc: any): string[] {
    const ids = getAuxItemIds(acc)
    return ids
      .map(id => {
        const item = auxItems.value.find(i => i.id === id)
        if (item) {
          const cat = auxCategories.value.find(c => c.id === item.type)
          return cat ? `${cat.name}:${item.name}` : item.name
        }
        const typeNames: Record<string, string> = {
          dept: '部门',
          project: '项目',
          supplier: '往来单位',
          person: '人员',
          func_class: '功能分类',
        }
        if (typeNames[id]) return typeNames[id]
        return ''
      })
      .filter(Boolean)
  }

  function getAuxSelectionCount(entry: any) {
    return auxCategories.value.reduce((count, cat) => {
      const key = `_${cat.code}_id`
      return entry?.[key] ? count + 1 : count
    }, 0)
  }

  function onAccountChange(entry: any) {
    const acc = accounts.value.find(a => a.id === entry.account_id)
    if (acc) {
      entry.account_code = acc.code
      entry.account_name = acc.name
      entry.is_cash = acc.is_cash || 0
      entry.is_bank = acc.is_bank || 0
      entry.require_cash_flow = acc.require_cash_flow || 0
      // 只在借贷双方都没有金额时才初始化，不清空已有的金额（如自动平衡设置的值）
    } else {
      for (const cat of auxCategories.value) {
        entry[`_${cat.code}_id`] = ''
      }
      entry.cash_flow_code = ''
      entry.cash_flow_name = ''
    }
  }

  function onAmountChange(entry: any, side: 'debit' | 'credit') {
    if (side === 'debit' && entry.debit_amount > 0) {
      entry.credit_amount = null
    } else if (side === 'credit' && entry.credit_amount > 0) {
      entry.debit_amount = null
    }
  }

  return {
    auxItemsByCategory,
    currentEntryAuxCategories,
    isParentAccount,
    hasAux,
    getAuxCategoryIds,
    getAuxItemNames,
    getAuxSelectionCount,
    onAccountChange,
    onAmountChange,
  }
}
