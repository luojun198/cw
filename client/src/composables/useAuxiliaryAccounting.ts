import { computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'

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

  function hasAux(entry: any, categoryId: string) {
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
      if (Array.isArray(parsed)) {
        return parsed
      }
      if (parsed && typeof parsed === 'object') {
        return Object.keys(parsed)
      }
      return []
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
      if (acc.direction === 'debit') {
        entry.debit_amount = entry.debit_amount || 0
        if (entry.credit_amount > 0) entry.credit_amount = 0
      } else {
        entry.credit_amount = entry.credit_amount || 0
        if (entry.debit_amount > 0) entry.debit_amount = 0
      }
    } else {
      for (const cat of auxCategories.value) {
        entry[`_${cat.code}_id`] = ''
      }
    }
  }

  function onAmountChange(entry: any, side: 'debit' | 'credit') {
    if (side === 'debit' && entry.debit_amount > 0) {
      entry.credit_amount = 0
    } else if (side === 'credit' && entry.credit_amount > 0) {
      entry.debit_amount = 0
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
