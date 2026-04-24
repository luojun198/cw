import { ref, watch } from 'vue'

/**
 * 搜索条件记忆 composable
 *
 * @example
 * const filters = useSearchMemory('voucher-query', {
 *   year: 2026,
 *   period: 1,
 *   keyword: ''
 * })
 */
export function useSearchMemory<T extends Record<string, any>>(
  key: string,
  defaultFilters: T
): T {
  const storageKey = `search_filters_${key}`
  const filters = ref<T>({ ...defaultFilters }) as any

  /**
   * 加载保存的搜索条件
   */
  function loadFilters() {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        // 合并默认值和保存的值
        filters.value = { ...defaultFilters, ...parsed }
      }
    } catch (error) {
      console.warn('Failed to load search filters:', error)
    }
  }

  /**
   * 保存搜索条件
   */
  function saveFilters() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters.value))
    } catch (error) {
      console.warn('Failed to save search filters:', error)
    }
  }

  /**
   * 重置搜索条件
   */
  function resetFilters() {
    filters.value = { ...defaultFilters }
    saveFilters()
  }

  /**
   * 清除保存的搜索条件
   */
  function clearFilters() {
    localStorage.removeItem(storageKey)
    filters.value = { ...defaultFilters }
  }

  // 初始化时加载
  loadFilters()

  // 监听变化并自动保存
  watch(
    filters,
    () => {
      saveFilters()
    },
    { deep: true }
  )

  return filters.value
}
