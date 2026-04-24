import { v4 as uuidv4 } from 'uuid'
import { buildBatchVoucherQuery } from './voucherQuery.ts'

export interface VoucherEntryInput {
  account_id: string
  account_code: string
  account_name: string
  direction: 'debit' | 'credit'
  amount: number
  summary?: string
  dept_id?: string | null
  dept_name?: string | null
  project_id?: string | null
  project_name?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  person_id?: string | null
  person_name?: string | null
  func_class_id?: string | null
  func_class_name?: string | null
  [key: string]: unknown
}

export interface AuxCategoryLike {
  id: string
  code: string
}

export interface AuxItemLike {
  id: string
  name?: string | null
}

export function validateVoucherEntryCount(entries: unknown) {
  if (!Array.isArray(entries) || entries.length < 2) {
    return '凭证日期和分录不能为空'
  }
  return null
}

export function getVoucherBalanceError(entries: VoucherEntryInput[]) {
  const { debitTotal, creditTotal } = calculateVoucherTotals(entries)
  if (Math.abs(debitTotal - creditTotal) > 0.001) {
    return `借贷不平衡: 借方${debitTotal} != 贷方${creditTotal}`
  }
  return null
}

export function getVoucherUpdateBalanceError(entries: VoucherEntryInput[]) {
  if (!isVoucherBalanced(entries)) {
    return '借贷不平衡'
  }
  return null
}

export function calculateVoucherTotals(entries: VoucherEntryInput[]) {
  let debitTotal = 0
  let creditTotal = 0

  for (const entry of entries) {
    if (entry.direction === 'debit') debitTotal += entry.amount
    else creditTotal += entry.amount
  }

  return { debitTotal, creditTotal }
}

export function isVoucherBalanced(entries: VoucherEntryInput[]) {
  const { debitTotal, creditTotal } = calculateVoucherTotals(entries)
  return Math.abs(debitTotal - creditTotal) <= 0.001
}

export function buildVoucherEntryPayloads(params: {
  accountSetId: string
  voucherId: string
  entries: VoucherEntryInput[]
  categories: AuxCategoryLike[]
  itemMap: Record<string, AuxItemLike>
}) {
  return params.entries.map((entry, index) => {
    const auxData: Record<string, { id: string; name: string; field_values?: Record<string, string> }> = {}
    for (const category of params.categories) {
      const dynamicFieldKey = `_${category.code}_id`
      const itemId = entry[dynamicFieldKey]
      if (typeof itemId === 'string' && itemId) {
        const item = params.itemMap[itemId]
        auxData[category.code] = { id: itemId, name: item?.name || '' }
        // 收集自定义字段值
        const fields = (category as any).fields || []
        const voucherFieldValues: Record<string, string> = {}
        for (const field of fields) {
          if (!field.show_in_voucher || field.is_enabled === 0) continue
          const fvKey = `_${category.code}_fv_${field.field_key}`
          const fvValue = entry[fvKey]
          if (fvValue !== undefined && fvValue !== null && fvValue !== '') {
            voucherFieldValues[field.field_key] = String(fvValue)
          }
        }
        if (Object.keys(voucherFieldValues).length > 0) {
          auxData[category.code].field_values = voucherFieldValues
        }
      }
    }

    const fixedFields: Record<string, string | null> = {}
    for (const category of params.categories) {
      const dynamicFieldKey = `_${category.code}_id`  // 带下划线（前端发送的格式）
      const fixedFieldKey = `${category.code}_id`      // 不带下划线（数据库列名）
      const itemId = entry[dynamicFieldKey] || entry[fixedFieldKey]  // 优先检查动态字段
      if (typeof itemId === 'string' && itemId) {
        const item = params.itemMap[itemId]
        fixedFields[fixedFieldKey] = itemId
        fixedFields[`${category.code}_name`] = item?.name || ''
      } else {
        fixedFields[fixedFieldKey] = null
        fixedFields[`${category.code}_name`] = null
      }
    }

    return [
      uuidv4(),
      params.accountSetId,
      params.voucherId,
      index + 1,
      entry.account_id,
      entry.account_code,
      entry.account_name,
      entry.direction,
      entry.amount,
      entry.summary || null,
      fixedFields.dept_id || entry.dept_id || null,
      fixedFields.dept_name || entry.dept_name || null,
      fixedFields.project_id || entry.project_id || null,
      fixedFields.project_name || entry.project_name || null,
      fixedFields.supplier_id || entry.supplier_id || null,
      fixedFields.supplier_name || entry.supplier_name || null,
      fixedFields.person_id || entry.person_id || null,
      fixedFields.person_name || entry.person_name || null,
      fixedFields.func_class_id || entry.func_class_id || null,
      fixedFields.func_class_name || entry.func_class_name || null,
      Object.keys(auxData).length > 0 ? JSON.stringify(auxData) : null,
    ]
  })
}

export interface AiConfigLike {
  enabled?: number | boolean | null
  api_key?: string | null
  api_url?: string | null
  model?: string | null
}

export interface AiSummaryEntryLike {
  account_name?: string | null
  direction?: string | null
  amount?: number | null
}

export function isAiSummaryEnabled(aiConfig: AiConfigLike | null | undefined) {
  return Boolean(aiConfig?.enabled && aiConfig?.api_key)
}

export function buildAiSummaryEntryText(entries: AiSummaryEntryLike[]) {
  return entries
    .map(entry => `${entry.account_name || ''}: ${entry.direction === 'debit' ? '借' : '贷'} ${entry.amount ?? ''}`)
    .join('\n')
}

export function buildAiSummaryRequestBody(params: {
  model?: string | null
  entryText: string
}) {
  return {
    model: params.model || 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: '你是一个财务助手，根据凭证分录生成简洁的中文业务摘要（10个字以内）。',
      },
      { role: 'user', content: `根据以下凭证分录生成摘要：\n${params.entryText}` },
    ],
    max_tokens: 50,
    temperature: 0.3,
  }
}

export function getAiSummaryApiUrl(aiConfig: AiConfigLike | null | undefined) {
  return aiConfig?.api_url || 'https://api.openai.com/v1/chat/completions'
}

export function extractAiSummary(data: any) {
  return data?.choices?.[0]?.message?.content?.trim() || '业务发生'
}

export function getEffectiveVoucherTypeId(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  voucherTypeId?: string | null
}) {
  if (params.voucherTypeId) {
    return params.voucherTypeId
  }

  const firstType = params.db
    .prepare(
      'SELECT id FROM voucher_types WHERE account_set_id=? OR account_set_id IS NULL ORDER BY account_set_id DESC LIMIT 1'
    )
    .get(params.accountSetId) as any
  return firstType?.id || null
}

export function buildVoucherNo(params: {
  year: number
  period: number
  maxNo?: number | null
  typeName?: string
}) {
  if (params.typeName) {
    // 取类型名称的第一个字作为简称，如"记账凭证"→"记"
    const shortName = params.typeName.charAt(0)
    return `${shortName}-${String((params.maxNo || 0) + 1).padStart(3, '0')}`
  }
  return `${params.year}${String(params.period).padStart(2, '0')}-${String((params.maxNo || 0) + 1).padStart(4, '0')}`
}

export function getNextVoucherNo(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  year: number
  period: number
  voucherTypeId?: string | null
}) {
  const effectiveTypeId = getEffectiveVoucherTypeId({
    db: params.db,
    accountSetId: params.accountSetId,
    voucherTypeId: params.voucherTypeId,
  })

  // 获取凭证类型名称
  let typeName: string | null = null
  if (effectiveTypeId) {
    const type = params.db
      .prepare('SELECT name FROM voucher_types WHERE id=?')
      .get(effectiveTypeId) as any
    typeName = type?.name || null
  }

  // 提取序号：统一取横线后的数字部分（新旧格式均适用）
  // 注意：按年度+期间查询，避免跨期间编号重复
  const row = params.db
    .prepare(
      `SELECT MAX(
        CAST(
          CASE
            WHEN INSTR(voucher_no, '-') > 0
            THEN SUBSTR(voucher_no, INSTR(voucher_no, '-') + 1)
            ELSE voucher_no
          END
          AS INTEGER
        )
      ) as max_no
      FROM vouchers
      WHERE account_set_id=? AND year=? AND period=? AND (voucher_type_id=? OR (voucher_type_id IS NULL AND ? IS NULL))`
    )
    .get(params.accountSetId, params.year, params.period, effectiveTypeId, effectiveTypeId) as any

  return {
    effectiveTypeId,
    typeName,
    voucherNo: buildVoucherNo({
      year: params.year,
      period: params.period,
      maxNo: row?.max_no,
      typeName: typeName || undefined,
    }),
  }
}

export function getVoucherWithTypeById(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  voucherId: string
}) {
  return params.db
    .prepare(
      'SELECT v.*, vt.name as voucher_type_name FROM vouchers v LEFT JOIN voucher_types vt ON v.voucher_type_id=vt.id WHERE v.id=?'
    )
    .get(params.voucherId) as any
}

export function getVoucherEntries(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  voucherId: string
}) {
  return params.db.prepare('SELECT * FROM voucher_entries WHERE voucher_id=? ORDER BY seq').all(params.voucherId) as any[]
}

export function getVoucherDetail(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any[] }
  }
  voucherId: string
}) {
  const voucher = getVoucherWithTypeById({
    db: params.db,
    voucherId: params.voucherId,
  })
  if (!voucher) {
    return null
  }

  return {
    ...(voucher as any),
    entries: getVoucherEntries({
      db: params.db,
      voucherId: params.voucherId,
    }),
  }
}

export function getVoucherById(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  voucherId: string
}) {
  return params.db.prepare('SELECT * FROM vouchers WHERE id=?').get(params.voucherId) as any
}

export function isPostedVoucher(voucher: { status?: string } | null | undefined) {
  return voucher?.status === 'posted'
}

export function replaceVoucherEntries(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  accountSetId: string
  voucherId: string
  entries: VoucherEntryInput[]
  categories: AuxCategoryLike[]
  itemMap: Record<string, AuxItemLike>
}) {
  params.db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(params.voucherId)
  const insertEntry = params.db.prepare(`
    INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, summary, dept_id, dept_name, project_id, project_name, supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name, aux_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const entryPayloads = buildVoucherEntryPayloads({
    accountSetId: params.accountSetId,
    voucherId: params.voucherId,
    entries: params.entries,
    categories: params.categories,
    itemMap: params.itemMap,
  })

  entryPayloads.forEach(payload => {
    insertEntry.run(...payload)
  })
}

export function buildVoucherEntriesMap(entries: Array<{ voucher_id: string } & Record<string, any>>) {
  const entriesMap: Record<string, any[]> = {}
  for (const entry of entries) {
    if (!entriesMap[entry.voucher_id]) entriesMap[entry.voucher_id] = []
    entriesMap[entry.voucher_id].push(entry)
  }
  return entriesMap
}

export function attachVoucherEntries<T extends { id: string }>(vouchers: T[], entriesMap: Record<string, any[]>) {
  return vouchers.map(voucher => ({
    ...voucher,
    entries: entriesMap[voucher.id] || [],
  }))
}

export function calculateNewBalance(params: {
  currentBalance: number
  amount: number
  accountDirection?: string | null
}) {
  return params.accountDirection === 'debit'
    ? params.currentBalance - params.amount
    : params.currentBalance + params.amount
}

export function validateVoucherEntriesNoNegativeBalance(params: {
  entries: VoucherEntryInput[]
  getAccountById: (accountId: string) => { no_negative?: number; direction?: string | null } | null | undefined
  getBalanceByAccountId: (accountId: string) => number
}) {
  for (const entry of params.entries) {
    if (entry.direction !== 'credit') continue
    const account = params.getAccountById(entry.account_id)
    if (!account || account.no_negative !== 1) continue

    const newBalance = calculateNewBalance({
      currentBalance: params.getBalanceByAccountId(entry.account_id),
      amount: entry.amount,
      accountDirection: account.direction,
    })
    if (newBalance < 0) {
      return `科目【${entry.account_name}】余额不允许为负数`
    }
  }

  return null
}

export function buildAuxItemMap(items: AuxItemLike[]) {
  const itemMap: Record<string, AuxItemLike> = {}
  for (const item of items) {
    itemMap[item.id] = item
  }
  return itemMap
}

export function loadVoucherAuxiliaryData(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
}) {
  const categories = params.db
    .prepare('SELECT id, code FROM aux_categories WHERE account_set_id=?')
    .all(params.accountSetId) as AuxCategoryLike[]
  // 为每个类别加载字段配置
  const fieldsStmt = params.db.prepare('SELECT * FROM aux_category_fields WHERE category_id=? AND is_enabled=1 ORDER BY sort_order')
  for (const cat of categories) {
    (cat as any).fields = fieldsStmt.all(cat.id)
  }
  const items = params.db
    .prepare('SELECT id, type, name FROM aux_items WHERE account_set_id=?')
    .all(params.accountSetId) as AuxItemLike[]

  return {
    categories,
    itemMap: buildAuxItemMap(items),
  }
}

export function getPeriodClosingRecord(params: {
  db: {
    prepare: (sql: string) => { get: (...args: any[]) => any }
  }
  accountSetId: string
  year: string | number
  period: string | number
}) {
  return params.db
    .prepare(`SELECT * FROM period_closing WHERE account_set_id=? AND year=? AND period=?`)
    .get(params.accountSetId, params.year, params.period) as any
}

export function isPeriodClosed(record: { status?: string } | null | undefined) {
  return record?.status === 'closed'
}

export function closePeriod(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  id: string
  accountSetId: string
  year: string | number
  period: string | number
  userId?: string | null
}) {
  params.db
    .prepare(
      `INSERT OR REPLACE INTO period_closing (id, account_set_id, year, period, status, closed_by, closed_at) VALUES (?, ?, ?, ?, 'closed', ?, datetime('now'))`
    )
    .run(params.id, params.accountSetId, params.year, params.period, params.userId)
}

export function openPeriod(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  accountSetId: string
  year: string | number
  period: string | number
}) {
  params.db
    .prepare(`UPDATE period_closing SET status='open' WHERE account_set_id=? AND year=? AND period=?`)
    .run(params.accountSetId, params.year, params.period)
}

export function listPeriodClosingStatus(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
  year: string | number
}) {
  return params.db
    .prepare(`SELECT * FROM period_closing WHERE account_set_id=? AND year=? ORDER BY period`)
    .all(params.accountSetId, params.year) as any[]
}

export function validateVoucherForAudit(
  voucher: { status?: string; maker_id?: string | null } | null | undefined,
  userId?: string | null
) {
  if (!voucher) {
    return '凭证不存在'
  }
  if (voucher.status !== 'draft') {
    return '只能审核草稿状态的凭证'
  }
  if (voucher.maker_id === userId) {
    return '制单人和审核人不能为同一人'
  }
  return null
}

export function applyVoucherAudit(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  voucherId: string
  userId?: string | null
  userName?: string | null
}) {
  params.db
    .prepare("UPDATE vouchers SET status=?, auditor_id=?, auditor_name=?, updated_at=datetime('now') WHERE id=?")
    .run('audited', params.userId, params.userName, params.voucherId)
}

export function validateVoucherForUnAudit(voucher: { status?: string } | null | undefined) {
  if (voucher?.status === 'posted') {
    return '已过账凭证无法反审核'
  }
  return null
}

export function applyVoucherUnAudit(params: {
  db: {
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  voucherId: string
}) {
  params.db
    .prepare("UPDATE vouchers SET status=?, auditor_id=NULL, auditor_name=NULL, updated_at=datetime('now') WHERE id=?")
    .run('draft', params.voucherId)
}

export function getBatchVoucherQuery(params: {
  accountSetId: string
  voucherTypeIds: string[]
  startDate?: string
  endDate?: string
  startNo?: string
  endNo?: string
}) {
  return buildBatchVoucherQuery({
    voucherTypeIds: params.voucherTypeIds,
    accountSetId: params.accountSetId,
    startDate: params.startDate,
    endDate: params.endDate,
    startNo: params.startNo,
    endNo: params.endNo,
  })
}

export function loadBatchDraftVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
  filters: {
    voucherTypeIds: string[]
    startDate?: string
    endDate?: string
    startNo?: string
    endNo?: string
  }
}) {
  const query = getBatchVoucherQuery({
    accountSetId: params.accountSetId,
    voucherTypeIds: params.filters.voucherTypeIds,
    startDate: params.filters.startDate,
    endDate: params.filters.endDate,
    startNo: params.filters.startNo,
    endNo: params.filters.endNo,
  })
  return getBatchDraftVouchers({
    db: params.db,
    sql: query.sql,
    params: query.params,
  })
}

export function loadBatchFilteredVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  accountSetId: string
  filters: {
    voucherTypeIds: string[]
    startDate?: string
    endDate?: string
    startNo?: string
    endNo?: string
  }
}) {
  const query = getBatchVoucherQuery({
    accountSetId: params.accountSetId,
    voucherTypeIds: params.filters.voucherTypeIds,
    startDate: params.filters.startDate,
    endDate: params.filters.endDate,
    startNo: params.filters.startNo,
    endNo: params.filters.endNo,
  })
  return loadBatchVouchers({
    db: params.db,
    query,
  })
}

export function getBatchVoucherFilters(body: {
  voucher_type_ids?: string[]
  start_date?: string
  end_date?: string
  start_no?: string
  end_no?: string
}) {
  return {
    voucherTypeIds: Array.isArray(body.voucher_type_ids) ? body.voucher_type_ids : [],
    startDate: body.start_date,
    endDate: body.end_date,
    startNo: body.start_no,
    endNo: body.end_no,
  }
}

export function validateBatchVoucherFilters(filters: {
  voucherTypeIds: string[]
  startDate?: string
  endDate?: string
}) {
  return Boolean(filters.startDate && filters.endDate && filters.voucherTypeIds.length > 0)
}

export function loadBatchVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  query: {
    sql: string
    params: any[]
  }
}) {
  return params.db.prepare(params.query.sql).all(...params.query.params) as any[]
}

export function getBatchDraftVouchers(params: {
  db: {
    prepare: (sql: string) => { all: (...args: any[]) => any[] }
  }
  sql: string
  params: any[]
}) {
  return (params.db.prepare(params.sql).all(...params.params) as any[]).filter(
    voucher => voucher.status === 'draft'
  )
}

export function findSelfMadeVoucher(
  vouchers: Array<{ maker_id?: string | null; voucher_no?: string | null }>,
  userId?: string | null
) {
  return vouchers.find(v => v.maker_id === userId)
}

export function buildBatchAuditPreviewData(
  vouchers: Array<{ maker_id?: string | null; voucher_no?: string | null }>,
  userId?: string | null
) {
  const selfMadeVoucher = findSelfMadeVoucher(vouchers, userId)
  return {
    count: vouchers.length,
    blocked: Boolean(selfMadeVoucher),
    blockedVoucherNo: selfMadeVoucher?.voucher_no || null,
    firstVoucherNo: vouchers[0]?.voucher_no || null,
    lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
  }
}

export function auditBatchVouchers(params: {
  db: {
    transaction: <T extends (...args: any[]) => void>(fn: T) => (...args: Parameters<T>) => ReturnType<T>
    prepare: (sql: string) => { run: (...args: any[]) => void }
  }
  vouchers: Array<{ id: string }>
  userId?: string | null
  userName?: string | null
}) {
  const auditBatch = params.db.transaction(() => {
    for (const voucher of params.vouchers) {
      params.db
        .prepare("UPDATE vouchers SET status=?, auditor_id=?, auditor_name=?, updated_at=datetime('now') WHERE id=?")
        .run('audited', params.userId, params.userName, voucher.id)
    }
  })
  auditBatch()
}

export function findPostedVoucher(vouchers: Array<{ status?: string; voucher_no?: string | null }>) {
  return vouchers.find(v => v.status === 'posted')
}

export function buildBatchDeletePreviewData(vouchers: Array<{ status?: string; voucher_no?: string | null }>) {
  const postedVoucher = findPostedVoucher(vouchers)
  return {
    count: vouchers.length,
    blocked: Boolean(postedVoucher),
    blockedVoucherNo: postedVoucher?.voucher_no || null,
    firstVoucherNo: vouchers[0]?.voucher_no || null,
    lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
  }
}

export function deleteBatchVouchers(params: {
  db: {
    transaction: <T extends (...args: any[]) => void>(fn: T) => (...args: Parameters<T>) => ReturnType<T>
    prepare: (sql: string) => { run: (...args: any[]) => void; get: (id: string) => any; all: (voucherId: string) => any[] }
  }
  vouchers: Array<{ id: string }>
}) {
  const removeBatch = params.db.transaction(() => {
    for (const voucher of params.vouchers) {
      deleteVoucherRecords(params.db, voucher.id)
    }
  })
  removeBatch()
}

export function deleteVoucherRecords(db: {
  prepare: (sql: string) => { run: (...args: any[]) => void; get: (id: string) => any; all: (voucherId: string) => any[] }
  transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>) => ReturnType<T>
}, voucherId: string) {
  // 获取凭证信息
  const voucher = db.prepare('SELECT * FROM vouchers WHERE id=?').get(voucherId) as any
  if (!voucher) {
    return // 凭证不存在，直接返回
  }

  // 如果是已过账凭证，不允许直接删除
  if (voucher.status === 'posted') {
    throw new Error('已过账凭证不能删除，请先反过账')
  }

  const transaction = db.transaction(() => {
    // 删除凭证分录
    db.prepare('DELETE FROM voucher_entries WHERE voucher_id=?').run(voucherId)
    // 删除凭证主表
    db.prepare('DELETE FROM vouchers WHERE id=?').run(voucherId)
  })

  transaction()
}
