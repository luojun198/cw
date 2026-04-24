import { ref } from 'vue'

/**
 * 防抖函数
 * 在事件被触发 n 秒后再执行回调，如果在这 n 秒内又被触发，则重新计时
 *
 * @example
 * const debouncedSearch = useDebounceFn(handleSearch, 500)
 */
export function useDebounceFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args)
      timeoutId = null
    }, delay)
  }
}

/**
 * 节流函数
 * 规定在一个单位时间内，只能触发一次函数。如果这个单位时间内触发多次函数，只有一次生效
 *
 * @example
 * const throttledScroll = useThrottleFn(handleScroll, 100)
 */
export function useThrottleFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  let lastTime = 0

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now()

    if (now - lastTime >= delay) {
      fn.apply(this, args)
      lastTime = now
    }
  }
}

/**
 * 防抖 ref
 * 返回一个防抖后的响应式值
 *
 * @example
 * const searchKeyword = ref('')
 * const debouncedKeyword = useDebounce(searchKeyword, 500)
 */
export function useDebounce<T>(value: T, delay: number = 300) {
  const debouncedValue = ref<T>(value) as any
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const updateValue = (newValue: T) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      debouncedValue.value = newValue
      timeoutId = null
    }, delay)
  }

  // 如果传入的是 ref，监听它的变化
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const { watch } = require('vue')
    watch(
      () => (value as any).value,
      (newValue: T) => {
        updateValue(newValue)
      }
    )
  }

  return debouncedValue
}

/**
 * 请求防抖 composable
 * 用于搜索、自动保存等场景
 *
 * @example
 * const { execute, cancel, isPending } = useDebouncedRequest(
 *   async (keyword: string) => {
 *     return await api.search(keyword)
 *   },
 *   500
 * )
 */
export function useDebouncedRequest<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 300
) {
  const isPending = ref(false)
  const isExecuting = ref(false)
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

  const execute = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve, reject) => {
      // 取消之前的请求
      if (abortController) {
        abortController.abort()
      }

      // 清除之前的定时器
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      isPending.value = true

      timeoutId = setTimeout(async () => {
        try {
          isExecuting.value = true
          abortController = new AbortController()

          const result = await fn(...args)

          isPending.value = false
          isExecuting.value = false
          resolve(result)
        } catch (error) {
          isPending.value = false
          isExecuting.value = false
          reject(error)
        } finally {
          timeoutId = null
          abortController = null
        }
      }, delay)
    })
  }

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isPending.value = false
    isExecuting.value = false
  }

  return {
    execute,
    cancel,
    isPending,
    isExecuting,
  }
}

/**
 * 请求节流 composable
 * 用于滚动加载、频繁点击等场景
 *
 * @example
 * const { execute, canExecute } = useThrottledRequest(
 *   async () => {
 *     return await api.loadMore()
 *   },
 *   1000
 * )
 */
export function useThrottledRequest<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 300
) {
  const isExecuting = ref(false)
  const canExecute = ref(true)
  let lastTime = 0

  const execute = async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    const now = Date.now()

    if (now - lastTime < delay) {
      canExecute.value = false
      return null
    }

    try {
      isExecuting.value = true
      canExecute.value = false
      lastTime = now

      const result = await fn(...args)

      return result
    } catch (error) {
      throw error
    } finally {
      isExecuting.value = false
      setTimeout(() => {
        canExecute.value = true
      }, delay)
    }
  }

  return {
    execute,
    isExecuting,
    canExecute,
  }
}
