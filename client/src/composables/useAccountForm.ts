import { ref } from 'vue'
import type { Ref } from 'vue'
import request from '@/api/request'

export function useAccountForm(auxCategories: Ref<any[]>, auxItems: Ref<any[]>) {
  const form = ref<any>({ is_enabled: 1, no_negative: 0 })
  const parentUsage = ref<any>(null)

  // 根据类别ID获取项目列表
  function getAuxItemsByCat(catId: string) {
    if (!catId) return []
    return auxItems.value.filter(i => i.type === catId)
  }

  // 获取可选的类别（排除已选）
  function getAvailableCats(item: any) {
    return auxCategories.value.filter(cat => {
      return !form.value.aux_list.some((i: any) => i !== item && i.cat_id === cat.id)
    })
  }

  function onAuxCatChange(item: any, val: string) {
    item.item_id = null
    // 选择类别后自动带出该类别的默认项目
    if (val) {
      const cat = auxCategories.value.find(c => c.id === val)
      if (cat?.default_item_id) {
        item.item_id = cat.default_item_id
      }
    }
  }

  function addAux() {
    form.value.aux_list.push({ cat_id: null, item_id: null })
  }

  function removeAux(index: number) {
    if (form.value.aux_list.length > 1) {
      form.value.aux_list.splice(index, 1)
    }
  }

  // 获取科目关联的核算项目名称列表
  function getAuxNames(row: any): string[] {
    if (!row.aux_types) return []
    try {
      const parsed = typeof row.aux_types === 'string' ? JSON.parse(row.aux_types) : row.aux_types
      if (!parsed) return []
      const names: string[] = []
      for (const [catId, itemId] of Object.entries(parsed)) {
        const cat = auxCategories.value.find(c => c.id === catId)
        if (!cat) continue
        if (itemId) {
          const item = auxItems.value.find(i => i.id === itemId)
          names.push(item ? `${cat.name}:${item.name}` : cat.name)
        } else {
          names.push(cat.name)
        }
      }
      return names
    } catch {
      return []
    }
  }

  // 上级科目变化时：自动补全编码 + 检查是否被使用
  async function onParentChange(parentId: string, treeData: any[], flattenRows: (nodes: any[]) => any[]) {
    parentUsage.value = null
    if (!parentId) {
      form.value.code = ''
      return
    }
    const flat = flattenRows(treeData)
    const parent = flat.find((r: any) => r.id === parentId)
    if (!parent) return

    const children = flat.filter((r: any) => r.parent_id === parentId)
    if (children.length > 0) {
      const childCodes = children.map((c: any) => c.code).sort()
      const lastCode = childCodes[childCodes.length - 1]
      const baseLen = parent.code.length + 1
      const lastSuffix = parseInt(lastCode.slice(baseLen)) || 0
      form.value.code = parent.code + String(lastSuffix + 1).padStart(lastCode.length - baseLen, '0')
    } else {
      form.value.code = parent.code + '01'
    }
    form.value.direction = parent.direction
    form.value.level = (parent.level || 0) + 1

    try {
      const res = await request.get<any>(`/base/accounts/${parentId}/usage`)
      if (res.code === 0 && res.data.voucherCount > 0) {
        parentUsage.value = res.data
      }
    } catch (e) {
      // ignore
    }
  }

  function createAddForm(currentRowId?: string) {
    return {
      is_enabled: 1,
      is_cash: 0,
      is_bank: 0,
      direction: 'debit',
      no_negative: 0,
      aux_list: [{ cat_id: null, item_id: null }],
      parent_id: currentRowId || null,
    }
  }

  function createEditForm(row: any) {
    const aux_list: any[] = []
    try {
      const parsed = typeof row.aux_types === 'string' ? JSON.parse(row.aux_types) : row.aux_types
      if (parsed && typeof parsed === 'object') {
        for (const [catId, itemId] of Object.entries(parsed)) {
          aux_list.push({ cat_id: catId, item_id: itemId || null })
        }
      }
    } catch {
      /* ignore */
    }
    if (aux_list.length === 0) {
      aux_list.push({ cat_id: null, item_id: null })
    }
    return {
      ...row,
      aux_list,
      is_cash: row.is_cash ? 1 : 0,
      is_bank: row.is_bank ? 1 : 0,
      no_negative: row.no_negative ? 1 : 0,
    }
  }

  function buildSavePayload() {
    const aux_types: Record<string, any> = {}
    for (const item of form.value.aux_list) {
      if (item.cat_id) {
        aux_types[item.cat_id] = item.item_id || null
      }
    }
    const payload = {
      ...form.value,
      aux_types: Object.keys(aux_types).length > 0 ? aux_types : null,
    }
    delete payload.aux_list
    return payload
  }

  return {
    form,
    parentUsage,
    getAuxItemsByCat,
    getAvailableCats,
    onAuxCatChange,
    addAux,
    removeAux,
    getAuxNames,
    onParentChange,
    createAddForm,
    createEditForm,
    buildSavePayload,
  }
}
