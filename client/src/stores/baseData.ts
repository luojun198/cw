import { defineStore } from 'pinia'
import { ref } from 'vue'
import request from '@/api/request'
import type { VoucherType, Account, AuxCategory, AuxItem } from '@/types/base'
import { filterAuxCategoriesForAccount } from '@/utils/accountCashFlow'

export const useBaseDataStore = defineStore('baseData', () => {
  const voucherTypes = ref<VoucherType[]>([])
  const accounts = ref<Account[]>([])
  const auxCategories = ref<AuxCategory[]>([])
  const auxItems = ref<AuxItem[]>([])

  const voucherTypesLoaded = ref(false)
  const accountsLoaded = ref(false)
  const auxCategoriesLoaded = ref(false)
  const auxItemsLoaded = ref(false)

  async function loadVoucherTypes(force = false) {
    if (voucherTypesLoaded.value && !force) return
    const res = await request.get<VoucherType[]>('/base/voucher-types')
    voucherTypes.value = res.data
    voucherTypesLoaded.value = true
  }

  async function loadAccounts(force = false) {
    if (accountsLoaded.value && !force) return
    const res = await request.get<Account[]>('/base/accounts', { params: { is_enabled: 1 } })
    accounts.value = res.data
    accountsLoaded.value = true
  }

  async function loadAuxCategories(force = false) {
    if (auxCategoriesLoaded.value && !force) return
    const res = await request.get<AuxCategory[]>('/base/aux-categories')
    auxCategories.value = filterAuxCategoriesForAccount(res.data || [])
    auxCategoriesLoaded.value = true
  }

  async function loadAuxItems(force = false) {
    if (auxItemsLoaded.value && !force) return
    const res = await request.get<AuxItem[]>('/base/aux-items')
    auxItems.value = res.data
    auxItemsLoaded.value = true
  }

  function invalidate() {
    voucherTypesLoaded.value = false
    accountsLoaded.value = false
    auxCategoriesLoaded.value = false
    auxItemsLoaded.value = false
  }

  return {
    voucherTypes,
    accounts,
    auxCategories,
    auxItems,
    voucherTypesLoaded,
    accountsLoaded,
    auxCategoriesLoaded,
    auxItemsLoaded,
    loadVoucherTypes,
    loadAccounts,
    loadAuxCategories,
    loadAuxItems,
    invalidate,
  }
})
