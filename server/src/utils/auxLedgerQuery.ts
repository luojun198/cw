/**
 * 辅助账簿查询：兼容 aux_data JSON 与凭证分录固定列两种存储方式
 */

/** 辅助类别 code -> voucher_entries 固定列 */
export const AUX_LEGACY_COLUMNS: Record<string, { id: string; name: string }> = {
  dept: { id: 'dept_id', name: 'dept_name' },
  project: { id: 'project_id', name: 'project_name' },
  supplier: { id: 'supplier_id', name: 'supplier_name' },
  customer: { id: 'supplier_id', name: 'supplier_name' },
  person: { id: 'person_id', name: 'person_name' },
  func_class: { id: 'func_class_id', name: 'func_class_name' },
}

export function jsonAuxPath(categoryCode: string, field: 'id' | 'name' | 'field_values') {
  return `json_extract(ve.aux_data, '$.${categoryCode}.${field}')`
}

/** json_extract 已返回去引号的文本，无需 json_unquote（部分环境未编译该函数） */
export function jsonAuxPathUnquoted(categoryCode: string, field: 'id' | 'name') {
  return jsonAuxPath(categoryCode, field)
}

/**
 * 追加与 buildAuxItemMatchCondition 对应的绑定参数（json 列 + 固定列 IN 需各传一遍 itemIds）
 */
export function appendAuxItemMatchParams(
  target: unknown[],
  categoryCode: string,
  itemIds: string[],
  options?: { itemCodes?: string[] }
) {
  target.push(...itemIds)
  if (AUX_LEGACY_COLUMNS[categoryCode]) {
    target.push(...itemIds)
  }
  if (categoryCode === 'cash_flow' && options?.itemCodes?.length) {
    target.push(...options.itemCodes)
  }
}

/** WHERE：匹配 aux_data 或固定列中的辅助项目 id */
export function buildAuxItemMatchCondition(
  categoryCode: string,
  itemIdsPlaceholder: string,
  options?: { itemCodes?: string[] }
): string {
  const parts: string[] = [`${jsonAuxPathUnquoted(categoryCode, 'id')} IN (${itemIdsPlaceholder})`]

  const legacy = AUX_LEGACY_COLUMNS[categoryCode]
  if (legacy) {
    parts.push(`ve.${legacy.id} IN (${itemIdsPlaceholder})`)
  }

  if (categoryCode === 'cash_flow' && options?.itemCodes?.length) {
    const codePh = options.itemCodes.map(() => '?').join(',')
    parts.push(`ve.cash_flow_code IN (${codePh})`)
  }

  return `(${parts.join(' OR ')})`
}

/** SELECT：优先 aux_data，回退固定列 */
export function buildAuxIdSelect(categoryCode: string) {
  const jsonId = jsonAuxPathUnquoted(categoryCode, 'id')
  const legacy = AUX_LEGACY_COLUMNS[categoryCode]
  if (legacy) {
    return `COALESCE(${jsonId}, ve.${legacy.id})`
  }
  if (categoryCode === 'cash_flow') {
    return `COALESCE(${jsonId}, ve.cash_flow_code)`
  }
  return jsonId
}

export function buildAuxNameSelect(categoryCode: string) {
  const jsonName = jsonAuxPathUnquoted(categoryCode, 'name')
  const legacy = AUX_LEGACY_COLUMNS[categoryCode]
  if (legacy) {
    return `COALESCE(${jsonName}, ve.${legacy.name})`
  }
  if (categoryCode === 'cash_flow') {
    return `COALESCE(${jsonName}, ve.cash_flow_name)`
  }
  return jsonName
}

export function buildAuxFieldValuesSelect(categoryCode: string) {
  return jsonAuxPath(categoryCode, 'field_values')
}

/** 查询辅助项目编码（现金流量等按 code 存于分录固定列） */
export function lookupAuxItemCode(
  db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } },
  accountSetId: string,
  itemId: string
): string | null {
  const row = db
    .prepare('SELECT code FROM aux_items WHERE id=? AND account_set_id=?')
    .get(itemId, accountSetId) as { code: string } | undefined
  return row?.code ? String(row.code) : null
}

/**
 * 凭证明细汇总：匹配条件 + 等值过滤 的 SQL 片段与参数（避免占位符与参数个数不一致）
 */
export function buildAuxVoucherEntryFilter(
  categoryCode: string,
  itemId: string,
  itemCode: string | null
): { sql: string; params: string[] } {
  const itemCodes = categoryCode === 'cash_flow' && itemCode ? [itemCode] : undefined
  const matchCondition = buildAuxItemMatchCondition(categoryCode, '?', { itemCodes })
  const params: string[] = [itemId]
  if (AUX_LEGACY_COLUMNS[categoryCode]) {
    params.push(itemId)
  }
  if (categoryCode === 'cash_flow' && itemCode) {
    params.push(itemCode)
  }

  if (categoryCode === 'cash_flow') {
    const jsonId = jsonAuxPathUnquoted(categoryCode, 'id')
    const eqParams = itemCode ? [itemId, itemCode] : [itemId]
    const eqSql = itemCode
      ? `(${jsonId} = ? OR ve.cash_flow_code = ?)`
      : `(${jsonId} = ?)`
    return {
      sql: `(${matchCondition}) AND ${eqSql}`,
      params: [...params, ...eqParams],
    }
  }

  return {
    sql: `(${matchCondition}) AND ((${buildAuxIdSelect(categoryCode)}) = ?)`,
    params: [...params, itemId],
  }
}

export type AuxItemMeta = {
  id: string
  code?: string
  name: string
  category_code: string
  category_name?: string
}

export function buildAuxItemLookup(items: AuxItemMeta[]) {
  const byId = new Map<string, AuxItemMeta>()
  const byCode = new Map<string, AuxItemMeta>()
  for (const item of items) {
    byId.set(String(item.id), item)
    if (item.code) {
      byCode.set(`${item.category_code}:${item.code}`, item)
    }
  }
  return { byId, byCode }
}

export function enrichAuxLedgerEntry(
  entry: Record<string, any>,
  categoryCode: string,
  categoryNameByCode: Map<string, string>,
  lookup: ReturnType<typeof buildAuxItemLookup>
) {
  entry.category_code = entry.category_code || categoryCode
  entry.category_name =
    entry.category_name || categoryNameByCode.get(categoryCode) || categoryCode

  let auxId = entry.aux_id != null ? String(entry.aux_id) : ''
  if (auxId.startsWith('"') && auxId.endsWith('"')) {
    auxId = auxId.slice(1, -1)
    entry.aux_id = auxId
  }

  if (!entry.aux_name || entry.aux_name === 'null') {
    const byId = lookup.byId.get(auxId)
    if (byId?.name) {
      entry.aux_name = byId.name
    } else if (categoryCode === 'cash_flow' && auxId) {
      const byCode = lookup.byCode.get(`${categoryCode}:${auxId}`)
      if (byCode?.name) entry.aux_name = byCode.name
    }
  }

  if (typeof entry.aux_name === 'string' && entry.aux_name.startsWith('"') && entry.aux_name.endsWith('"')) {
    entry.aux_name = entry.aux_name.slice(1, -1)
  }
}
