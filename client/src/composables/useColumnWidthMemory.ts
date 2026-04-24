import { ref, onMounted, nextTick } from 'vue'

export interface SizeMemory {
  [key: string]: number
}

/**
 * 表格列宽记忆 composable
 * 使用方法：
 * 1. const { widths, onDragEnd } = useColumnWidthMemory('table_key')
 * 2. 在表格上添加 @header-dragend="onDragEnd"
 * 3. 在列上使用 :width="widths.columnKey || defaultWidth"
 */
export function useColumnWidthMemory(tableKey: string) {
  const storageKey = `table_column_width_${tableKey}`
  const rowHeightStorageKey = `table_row_height_${tableKey}`
  const widths = ref<SizeMemory>({})
  const heights = ref<SizeMemory>({})

  // 从 localStorage 加载列宽和行高
  function load() {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        widths.value = parsed
        console.log(`[${tableKey}] 加载列宽:`, parsed)
      }
    } catch (error) {
      console.warn('加载列宽失败:', error)
    }

    try {
      const stored = localStorage.getItem(rowHeightStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        heights.value = parsed
        console.log(`[${tableKey}] 加载行高:`, parsed)
      }
    } catch (error) {
      console.warn('加载行高失败:', error)
    }
  }

  // 保存列宽和行高到 localStorage
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths.value))
    } catch (error) {
      console.warn('保存列宽失败:', error)
    }

    try {
      localStorage.setItem(rowHeightStorageKey, JSON.stringify(heights.value))
    } catch (error) {
      console.warn('保存行高失败:', error)
    }
  }

  // 处理列拖动事件
  function onDragEnd(newWidth: number, _oldWidth: number, column: any) {
    const key = column.property || column.columnKey || column.label
    if (!key) return

    widths.value[key] = newWidth
    save()
    console.log(`[${tableKey}] 保存列宽 ${key}:`, newWidth)
  }

  // 清除所有列宽和行高
  function clear() {
    widths.value = {}
    heights.value = {}
    localStorage.removeItem(storageKey)
    localStorage.removeItem(rowHeightStorageKey)
  }

  // 获取列宽
  function getColumnWidth(columnKey: string, defaultWidth?: number): number | undefined {
    return widths.value[columnKey] || defaultWidth
  }

  // 保存列宽
  function saveColumnWidth(columnKey: string, width: number) {
    widths.value[columnKey] = width
    save()
    console.log(`[${tableKey}] 保存列宽 ${columnKey}:`, width)
  }

  // 获取行高
  function getRowHeight(rowKey: string, defaultHeight?: number): number | undefined {
    return heights.value[rowKey] || defaultHeight
  }

  // 保存行高
  function saveRowHeight(rowKey: string, height: number) {
    heights.value[rowKey] = height
    save()
    console.log(`[${tableKey}] 保存行高 ${rowKey}:`, height)
  }

  // 组件挂载时加载
  onMounted(() => {
    load()
  })

  return {
    widths,
    heights,
    onDragEnd,
    clear,
    getColumnWidth,
    saveColumnWidth,
    getRowHeight,
    saveRowHeight,
  }
}
