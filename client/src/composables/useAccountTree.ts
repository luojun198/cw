import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Ref, ComputedRef } from 'vue'

export function useAccountTree(list: Ref<any[]>, tableRef: Ref<any>) {
  const expandedSet = ref<Set<string>>(new Set())
  const currentRow = ref<any>(null)

  const expandedKeys: ComputedRef<string[]> = computed(() => [...expandedSet.value].map(String))

  // 扁平化所有行（含 children 嵌套）
  function flattenRows(nodes: any[], result: any[] = []): any[] {
    for (const node of nodes) {
      result.push(node)
      if (node.children?.length) flattenRows(node.children, result)
    }
    return result
  }

  function addDepth(nodes: any[], depth: number = 1): any[] {
    return nodes.map(node => ({
      ...node,
      _depth: depth,
      children: node.children?.length ? addDepth(node.children, depth + 1) : [],
    }))
  }

  // 简单树形转换（按编码前缀，去重）
  const treeData: ComputedRef<any[]> = computed(() => {
    const map: Record<string, any> = {}
    const roots: any[] = []
    const seen = new Set<string>()
    for (const item of list.value) {
      if (!item.id || seen.has(item.id)) continue
      seen.add(item.id)
      map[item.id] = { ...item, children: [] }
    }
    for (const item of list.value) {
      if (!item.id || !seen.has(item.id)) continue
      if (item.parent_id && map[item.parent_id]) {
        map[item.parent_id].children.push(map[item.id])
      } else {
        roots.push(map[item.id])
      }
    }
    return addDepth(roots)
  })

  // 平铺列表（带 _depth，按 code 排序）
  const flatList: ComputedRef<any[]> = computed(() => flattenRows(treeData.value))

  // tree-select 数据（禁用已选中的节点，避免循环引用）
  function getTreeSelectData(formId?: string): any[] {
    return treeData.value.map((r: any) => ({
      ...r,
      disabled: formId ? r.id === formId : false,
    }))
  }

  function handleCurrentChange(row: any) {
    currentRow.value = row || null
  }

  function handleRowClick(row: any) {
    currentRow.value = row || null
  }

  async function restoreCurrentRow() {
    const currentRowId = currentRow.value?.id
    if (!currentRowId) return

    await new Promise(resolve => setTimeout(resolve, 0))
    const flat = flattenRows(treeData.value)
    const matchedRow = flat.find((row: any) => row?.id === currentRowId)
    if (matchedRow) {
      currentRow.value = matchedRow
      tableRef.value?.setCurrentRow?.(matchedRow)
    } else {
      currentRow.value = null
      tableRef.value?.setCurrentRow?.(null)
    }
  }

  // 全部展开
  function expandAll() {
    const all = flattenRows(treeData.value)
    expandedSet.value = new Set(all.filter(r => r.children?.length).map(r => r.id))
  }

  // 全部收拢
  function collapseAll() {
    expandedSet.value = new Set()
  }

  // 上一级：折叠当前展开的节点
  function goUpLevel() {
    collapseAll()
  }

  // 下一级：展开所有当前可见的子节点（展开到下一级）
  function goDownLevel() {
    const flat = flattenRows(treeData.value)
    const parentIds = expandedSet.value
    const toExpand = flat.filter(
      r => r.children?.length && parentIds.has(r.parent_id) && !expandedSet.value.has(r.id)
    )
    if (toExpand.length > 0) {
      expandedSet.value = new Set([...expandedSet.value, ...toExpand.map(r => r.id)])
    }
  }

  // 键盘快捷键
  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === '\\') {
      e.preventDefault()
      collapseAll()
      return
    }
    if (e.ctrlKey && e.shiftKey && e.key === '\\') {
      e.preventDefault()
      expandAll()
      return
    }
    if (e.ctrlKey && e.key === 'ArrowUp') {
      e.preventDefault()
      goUpLevel()
      return
    }
    if (e.ctrlKey && e.key === 'ArrowDown') {
      e.preventDefault()
      goDownLevel()
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    treeData,
    flatList,
    expandedKeys,
    currentRow,
    expandAll,
    collapseAll,
    goUpLevel,
    goDownLevel,
    handleCurrentChange,
    handleRowClick,
    restoreCurrentRow,
    flattenRows,
    getTreeSelectData,
  }
}
