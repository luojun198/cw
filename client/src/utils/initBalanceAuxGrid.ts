import { buildAuxItemIdFromSelection } from '@/utils/auxItemId'

export const MAX_AUX_GRID_ROWS = 6000
export const KEYWORD_MATCH_LIMIT = 3000

export interface AuxGridItem {
  id: string
  code: string
  name: string
  remark?: string
  field_values?: Record<string, string>
}

export interface AuxGridRow {
  key: string
  selection: Record<string, string>
  opening_debit: number
  opening_credit: number
  pre_book_debit: number
  pre_book_credit: number
}

export interface AuxCategoryFieldMeta {
  field_key: string
  field_name: string
}

function cartesianSelections(
  categoryIds: string[],
  itemsByCategory: Record<string, AuxGridItem[]>
): Record<string, string>[] {
  if (categoryIds.length === 0) return []
  const lists = categoryIds.map(id => itemsByCategory[id] || [])
  if (lists.some(list => list.length === 0)) return []

  let acc: Record<string, string>[] = [{}]
  for (const catId of categoryIds) {
    const items = itemsByCategory[catId] || []
    const next: Record<string, string>[] = []
    for (const base of acc) {
      for (const item of items) {
        next.push({ ...base, [catId]: item.id })
      }
    }
    acc = next
  }
  return acc
}

export function countAuxCombinations(
  categoryIds: string[],
  itemsByCategory: Record<string, AuxGridItem[]>
): number {
  if (categoryIds.length === 0) return 0
  return categoryIds.reduce((n, id) => n * (itemsByCategory[id]?.length || 0), 1)
}

function rowSearchText(
  row: AuxGridRow,
  categoryIds: string[],
  itemsByCategory: Record<string, AuxGridItem[]>,
  categoryFields: Record<string, AuxCategoryFieldMeta[]>
): string {
  const parts: string[] = []
  for (const catId of categoryIds) {
    const itemId = row.selection[catId]
    const item = itemsByCategory[catId]?.find(i => i.id === itemId)
    if (!item) continue
    parts.push(item.code, item.name)
    if (item.remark) parts.push(item.remark)
    const fv = item.field_values || {}
    for (const f of categoryFields[catId] || []) {
      const v = fv[f.field_key]
      if (v) parts.push(f.field_name, v)
    }
  }
  return parts.join(' ').toLowerCase()
}

function rowFromSelection(
  selection: Record<string, string>,
  categoryIds: string[],
  codeByCategoryId: Record<string, string>,
  amountsByKey: Map<
    string,
    {
      opening_debit: number
      opening_credit: number
      pre_book_debit: number
      pre_book_credit: number
    }
  >
): AuxGridRow {
  const key = buildAuxItemIdFromSelection(codeByCategoryId, categoryIds, selection)
  const saved = amountsByKey.get(key)
  return {
    key,
    selection,
    opening_debit: saved?.opening_debit || 0,
    opening_credit: saved?.opening_credit || 0,
    pre_book_debit: saved?.pre_book_debit || 0,
    pre_book_credit: saved?.pre_book_credit || 0,
  }
}

/** 按组合序号分页取行（不一次性生成全部组合，适用于组合数较多） */
export function getCombinationPage(params: {
  categoryIds: string[]
  itemsByCategory: Record<string, AuxGridItem[]>
  codeByCategoryId: Record<string, string>
  amountsByKey: Map<
    string,
    {
      opening_debit: number
      opening_credit: number
      pre_book_debit: number
      pre_book_credit: number
    }
  >
  page: number
  pageSize: number
}): AuxGridRow[] {
  const { categoryIds, itemsByCategory, codeByCategoryId, amountsByKey, page, pageSize } = params
  const lists = categoryIds.map(id => itemsByCategory[id] || [])
  if (lists.some(list => list.length === 0) || pageSize <= 0) return []

  const indices = lists.map(() => 0)
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const rows: AuxGridRow[] = []
  let globalIndex = 0

  while (globalIndex < end) {
    const selection: Record<string, string> = {}
    for (let i = 0; i < categoryIds.length; i++) {
      selection[categoryIds[i]] = lists[i][indices[i]].id
    }
    if (globalIndex >= start) {
      rows.push(rowFromSelection(selection, categoryIds, codeByCategoryId, amountsByKey))
    }
    globalIndex++

    let carry = categoryIds.length - 1
    while (carry >= 0) {
      indices[carry]++
      if (indices[carry] < lists[carry].length) break
      indices[carry] = 0
      carry--
    }
    if (carry < 0) break
  }

  return rows
}

export function buildAuxGridRows(params: {
  categoryIds: string[]
  itemsByCategory: Record<string, AuxGridItem[]>
  codeByCategoryId: Record<string, string>
  savedByKey: Map<
    string,
    {
      selection: Record<string, string>
      opening_debit: number
      opening_credit: number
      pre_book_debit: number
      pre_book_credit: number
    }
  >
}): { rows: AuxGridRow[]; combinationCount: number; truncated: boolean } {
  const { categoryIds, itemsByCategory, codeByCategoryId, savedByKey } = params
  const combinationCount = countAuxCombinations(categoryIds, itemsByCategory)
  const truncated = combinationCount > MAX_AUX_GRID_ROWS

  if (truncated) {
    const rows: AuxGridRow[] = []
    for (const [key, saved] of savedByKey) {
      rows.push({
        key,
        selection: saved.selection,
        opening_debit: saved.opening_debit || 0,
        opening_credit: saved.opening_credit || 0,
        pre_book_debit: saved.pre_book_debit || 0,
        pre_book_credit: saved.pre_book_credit || 0,
      })
    }
    rows.sort((a, b) => a.key.localeCompare(b.key))
    return { rows, combinationCount, truncated }
  }

  const selections = cartesianSelections(categoryIds, itemsByCategory)
  const rows: AuxGridRow[] = selections.map(selection => {
    const key = buildAuxItemIdFromSelection(codeByCategoryId, categoryIds, selection)
    const saved = savedByKey.get(key)
    return {
      key,
      selection,
      opening_debit: saved?.opening_debit || 0,
      opening_credit: saved?.opening_credit || 0,
      pre_book_debit: saved?.pre_book_debit || 0,
      pre_book_credit: saved?.pre_book_credit || 0,
    }
  })
  rows.sort((a, b) => a.key.localeCompare(b.key))
  return { rows, combinationCount, truncated }
}

function searchCombinationsWhenTruncated(params: {
  keyword: string
  categoryIds: string[]
  itemsByCategory: Record<string, AuxGridItem[]>
  categoryFields: Record<string, AuxCategoryFieldMeta[]>
  codeByCategoryId: Record<string, string>
  savedByKey: Map<string, AuxGridRow>
}): AuxGridRow[] {
  const kw = params.keyword.trim().toLowerCase()
  const matched: AuxGridRow[] = []

  for (const selection of cartesianSelections(params.categoryIds, params.itemsByCategory)) {
    if (matched.length >= KEYWORD_MATCH_LIMIT) break
    const key = buildAuxItemIdFromSelection(
      params.codeByCategoryId,
      params.categoryIds,
      selection
    )
    const saved = params.savedByKey.get(key)
    const row: AuxGridRow = {
      key,
      selection,
      opening_debit: saved?.opening_debit || 0,
      opening_credit: saved?.opening_credit || 0,
      pre_book_debit: saved?.pre_book_debit || 0,
      pre_book_credit: saved?.pre_book_credit || 0,
    }
    if (rowSearchText(row, params.categoryIds, params.itemsByCategory, params.categoryFields).includes(kw)) {
      matched.push(row)
    }
  }
  matched.sort((a, b) => a.key.localeCompare(b.key))
  return matched
}

export function filterAuxGridRows(params: {
  rows: AuxGridRow[]
  keyword: string
  categoryIds: string[]
  itemsByCategory: Record<string, AuxGridItem[]>
  categoryFields: Record<string, AuxCategoryFieldMeta[]>
  codeByCategoryId: Record<string, string>
  combinationCount: number
  truncated: boolean
  savedByKey: Map<string, AuxGridRow>
}): AuxGridRow[] {
  const kw = params.keyword.trim().toLowerCase()

  if (!kw) {
    return params.rows
  }

  if (params.truncated) {
    return searchCombinationsWhenTruncated({
      keyword: kw,
      categoryIds: params.categoryIds,
      itemsByCategory: params.itemsByCategory,
      categoryFields: params.categoryFields,
      codeByCategoryId: params.codeByCategoryId,
      savedByKey: params.savedByKey,
    })
  }

  return params.rows.filter(r =>
    rowSearchText(r, params.categoryIds, params.itemsByCategory, params.categoryFields).includes(kw)
  )
}
