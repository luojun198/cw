import { ref, computed, watch } from 'vue'
import request from '@/api/request'
import { showSuccess, showError, showOperationError } from '@/composables/useMessage'
import { normalizeOpeningDebitCredit } from '@/utils/initBalanceOpening'
import { buildSingleCategoryAuxItemId } from '@/utils/auxItemId'
import {
  filterAuxGridRows,
  type AuxGridItem,
  type AuxGridRow,
  type AuxCategoryFieldMeta,
} from '@/utils/initBalanceAuxGrid'
import {
  buildTabGridRows,
  lineHasAmount,
  isLineSelectionComplete,
  syncLineToCombinationStore,
  countCategoryFilled,
  sumCategoryTotals,
  totalsClose,
  categoryInitBalance,
} from '@/utils/initBalanceAuxTabRows'
import { exportStyledTable } from '@/utils/exportStyledExcel'
import { buildInitBalanceAuxExportColumns } from '@/utils/ledgerExportBuilders'

export interface AuxCategoryMeta {
  id: string
  code: string
  name: string
}

export interface AuxItemOption extends AuxGridItem {}

export type InitBalanceAuxLine = AuxGridRow

export interface AuxImportPreviewRow {
  rowIndex: number
  selection: Record<string, string>
  selection_labels: Record<string, string>
  opening_debit: number
  opening_credit: number
  pre_book_debit: number
  pre_book_credit: number
  matched: boolean
  error?: string
}

let lineKeySeq = 0

function newLineKey() {
  return `line-${++lineKeySeq}`
}

export {
  normalizeOpeningDebitCredit,
  applyOpeningDebitChange,
  applyOpeningCreditChange,
} from '@/utils/initBalanceOpening'

export { lineHasAmount, isLineSelectionComplete } from '@/utils/initBalanceAuxTabRows'

export function createEmptyAuxLine(categoryIds: string[]): InitBalanceAuxLine {
  const selection: Record<string, string> = {}
  for (const id of categoryIds) {
    selection[id] = ''
  }
  return {
    key: newLineKey(),
    selection,
    opening_debit: 0,
    opening_credit: 0,
    pre_book_debit: 0,
    pre_book_credit: 0,
  }
}

function categoryCodeColumn(cat: AuxCategoryMeta) {
  return `${cat.name}编码`
}

function categoryNameColumn(cat: AuxCategoryMeta) {
  return `${cat.name}名称`
}

export function useInitBalanceAux() {
  const loading = ref(false)
  const saving = ref(false)
  const locked = ref(false)
  const lockReason = ref('')
  const currentAccount = ref<{
    id: string
    code: string
    name: string
    direction: string
  } | null>(null)
  const categories = ref<AuxCategoryMeta[]>([])
  const itemsByCategory = ref<Record<string, AuxItemOption[]>>({})
  const categoryFields = ref<Record<string, AuxCategoryFieldMeta[]>>({})
  const codeByCategoryId = ref<Record<string, string>>({})
  const combinationStore = ref(new Map<string, AuxGridRow>())
  const gridRows = ref<AuxGridRow[]>([])
  const activeCategoryId = ref('')
  const combinationCount = ref(0)
  const keyword = ref('')
  const page = ref(1)
  const pageSize = ref(50)
  const lines = gridRows

  const isMidYear = ref(false)
  const selectedYear = ref(new Date().getFullYear())

  const useCategoryTabs = computed(() => categories.value.length > 1)

  const savedByKey = computed(() => {
    const map = new Map<string, AuxGridRow>()
    for (const row of combinationStore.value.values()) {
      map.set(row.key, row)
    }
    return map
  })

  const filteredRowsAll = computed(() =>
    filterAuxGridRows({
      rows: gridRows.value,
      keyword: keyword.value,
      categoryIds: categories.value.map(c => c.id),
      itemsByCategory: itemsByCategory.value,
      categoryFields: categoryFields.value,
      codeByCategoryId: codeByCategoryId.value,
      combinationCount: gridRows.value.length,
      truncated: false,
      savedByKey: savedByKey.value,
    })
  )

  const displayTotal = computed(() => filteredRowsAll.value.length)

  const displayRows = computed(() => {
    const all = filteredRowsAll.value
    if (pageSize.value === -1) return all
    const start = (page.value - 1) * pageSize.value
    return all.slice(start, start + pageSize.value)
  })

  function syncActiveCategoryTab() {
    if (categories.value.length === 0) {
      activeCategoryId.value = ''
      return
    }
    if (!categories.value.some(c => c.id === activeCategoryId.value)) {
      activeCategoryId.value = categories.value[0].id
    }
  }

  function rebuildGridForActiveCategory() {
    syncActiveCategoryTab()
    const catIds = categories.value.map(c => c.id)
    const activeId = activeCategoryId.value
    if (!activeId || catIds.length === 0) {
      gridRows.value = []
      return
    }
    gridRows.value = buildTabGridRows({
      activeCategoryId: activeId,
      itemsByCategory: itemsByCategory.value,
      combinationStore: combinationStore.value,
    })
    combinationCount.value = combinationStore.value.size
  }

  watch(activeCategoryId, () => {
    rebuildGridForActiveCategory()
    page.value = 1
  })

  function loadLinesFromSaved(
    savedLines: Array<{
      selection: Record<string, string>
      opening_debit?: number
      opening_credit?: number
      pre_book_debit?: number
      pre_book_credit?: number
    }>
  ) {
    const catIds = categories.value.map(c => c.id)
    const store = new Map<string, AuxGridRow>()
    for (const row of savedLines || []) {
      const opening = normalizeOpeningDebitCredit(
        row.opening_debit || 0,
        row.opening_credit || 0
      )
      const filled = catIds.filter(id => row.selection[id])
      for (const catId of filled) {
        const itemId = row.selection[catId]
        if (!itemId) continue
        const key =
          buildSingleCategoryAuxItemId(codeByCategoryId.value, catId, itemId) || newLineKey()
        store.set(key, {
          key,
          selection: { [catId]: itemId },
          ...opening,
          pre_book_debit: row.pre_book_debit || 0,
          pre_book_credit: row.pre_book_credit || 0,
        })
      }
    }
    combinationStore.value = store
    syncActiveCategoryTab()
    rebuildGridForActiveCategory()
    page.value = 1
  }

  function addLine() {
    showError('已列出全部项目，请直接在对应行录入金额')
  }

  function removeLineByKey(key: string) {
    combinationStore.value.delete(key)
    rebuildGridForActiveCategory()
  }

  function countIncompleteLines() {
    return 0
  }

  function categoryTabStats(catId: string) {
    return countCategoryFilled(catId, itemsByCategory.value, combinationStore.value)
  }

  function categoryHasAnyAmount(catId: string) {
    return [...combinationStore.value.values()].some(
      line => line.selection[catId] && lineHasAmount(line)
    )
  }

  function categoryTotalsList() {
    const direction = currentAccount.value?.direction || 'debit'
    return categories.value.map(cat => {
      const t = sumCategoryTotals(cat.id, combinationStore.value, true)
      const initBalance = categoryInitBalance(direction, t)
      return {
        id: cat.id,
        name: cat.name,
        ...t,
        debit: t.opening_debit + t.pre_book_debit,
        credit: t.opening_credit + t.pre_book_credit,
        initBalance,
      }
    })
  }

  function validateCategoryTotalsMatch(strict = false): string | null {
    if (categories.value.length <= 1) return null
    const direction = currentAccount.value?.direction || 'debit'
    const withAmount = categories.value.filter(c => categoryHasAnyAmount(c.id))
    if (withAmount.length <= 1) return null
    if (strict && withAmount.length < categories.value.length) {
      const missing = categories.value
        .filter(c => !categoryHasAnyAmount(c.id))
        .map(c => c.name)
        .join('、')
      return `请先在「${missing}」标签页录入期初金额`
    }
    if (!strict && withAmount.length < categories.value.length) {
      return null
    }
    const ref = sumCategoryTotals(withAmount[0].id, combinationStore.value, true)
    for (const cat of withAmount.slice(1)) {
      const t = sumCategoryTotals(cat.id, combinationStore.value, true)
      if (!totalsClose(direction, ref, t)) {
        return `「${withAmount[0].name}」与「${cat.name}」期初余额合计不一致（按科目方向折算后应相同）`
      }
    }
    return null
  }

  async function checkCanEdit(year: number) {
    try {
      const res = (await request.get('/base/init-balances/can-edit', {
        params: { year },
      })) as any
      locked.value = !res.canEdit
      lockReason.value = res.reason || ''
    } catch {
      locked.value = false
      lockReason.value = ''
    }
  }

  async function loadDetails(accountId: string, year: number) {
    loading.value = true
    selectedYear.value = year
    combinationStore.value = new Map()
    gridRows.value = []
    keyword.value = ''
    try {
      await checkCanEdit(year)
      const res = await request.get<any>('/base/init-balances/aux-details', {
        params: { year, account_id: accountId },
      })
      const data = res.data
      currentAccount.value = data.account

      categories.value = data.categories || []
      const items: Record<string, AuxItemOption[]> = {}
      for (const [catId, list] of Object.entries(data.items || {})) {
        items[catId] = (list as AuxItemOption[]).map(item => ({
          ...item,
          field_values:
            typeof item.field_values === 'string'
              ? (() => {
                  try {
                    return JSON.parse(item.field_values as string)
                  } catch {
                    return {}
                  }
                })()
              : item.field_values || {},
        }))
      }
      itemsByCategory.value = items
      categoryFields.value = data.category_fields || {}
      codeByCategoryId.value = data.code_by_category_id || {}

      isMidYear.value = !!data.isMidYear
      loadLinesFromSaved(data.lines || [])
    } catch (error) {
      showOperationError('加载辅助期初', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  const activeCategoryTotals = computed(() => {
    const catId = activeCategoryId.value
    if (!catId) {
      return {
        opening_debit: 0,
        opening_credit: 0,
        pre_book_debit: 0,
        pre_book_credit: 0,
      }
    }
    return sumCategoryTotals(catId, combinationStore.value, true)
  })

  function lineTotals() {
    const catId = activeCategoryId.value
    if (!catId) return { debit: 0, credit: 0 }
    const t = sumCategoryTotals(catId, combinationStore.value)
    return {
      debit: t.opening_debit + t.pre_book_debit,
      credit: t.opening_credit + t.pre_book_credit,
    }
  }

  function allSavableLines(): AuxGridRow[] {
    return [...combinationStore.value.values()].filter(line => {
      const catId = Object.keys(line.selection).find(id => line.selection[id])
      return catId && lineHasAmount(line)
    })
  }

  /** @returns null 未选齐维度跳过；true 成功；false 失败 */
  async function saveLine(line: AuxGridRow): Promise<boolean | null> {
    if (!currentAccount.value || locked.value) return false
    const activeId = activeCategoryId.value
    if (!activeId || !isLineSelectionComplete(line, activeId)) return null

    const itemId = line.selection[activeId]
    const stableKey = buildSingleCategoryAuxItemId(
      codeByCategoryId.value,
      activeId,
      itemId
    )
    if (!stableKey) return false

    syncLineToCombinationStore(
      line,
      combinationStore.value,
      activeId,
      codeByCategoryId.value
    )

    if (!lineHasAmount(line)) {
      if (line.key.startsWith('draft:')) return true
    }

    try {
      const opening = normalizeOpeningDebitCredit(
        line.opening_debit || 0,
        line.opening_credit || 0
      )
      line.opening_debit = opening.opening_debit
      line.opening_credit = opening.opening_credit
      await request.post('/base/init-balances/aux-details/line', {
        year: selectedYear.value,
        account_id: currentAccount.value.id,
        line: {
          active_category_id: activeId,
          selection: { [activeId]: itemId },
          ...opening,
          pre_book_debit: line.pre_book_debit || 0,
          pre_book_credit: line.pre_book_credit || 0,
        },
      })
      return true
    } catch (error) {
      showOperationError('保存辅助期初', error)
      return false
    }
  }

  async function save() {
    if (!currentAccount.value) return null
    const mismatch = validateCategoryTotalsMatch(true)
    if (mismatch) {
      showError(mismatch)
      return null
    }
    saving.value = true
    try {
      const payload = {
        year: selectedYear.value,
        account_id: currentAccount.value.id,
        lines: allSavableLines().map(line => {
          const catId = Object.keys(line.selection).find(id => line.selection[id])!
          const opening = normalizeOpeningDebitCredit(
            line.opening_debit || 0,
            line.opening_credit || 0
          )
          return {
            active_category_id: catId,
            selection: { [catId]: line.selection[catId] },
            ...opening,
            pre_book_debit: line.pre_book_debit || 0,
            pre_book_credit: line.pre_book_credit || 0,
          }
        }),
      }
      const res = await request.post<any>('/base/init-balances/aux-details', payload)
      showSuccess('辅助期初保存成功')
      return res.data?.summary || res.data
    } catch (error) {
      showOperationError('保存辅助期初', error)
      return null
    } finally {
      saving.value = false
    }
  }

  function buildTemplateRows(): Record<string, string | number>[] {
    const sampleLine = createEmptyAuxLine(categories.value.map(c => c.id))
    for (const cat of categories.value) {
      const first = itemsByCategory.value[cat.id]?.[0]
      if (first) sampleLine.selection[cat.id] = first.id
    }

    const toRow = (line: InitBalanceAuxLine) => {
      const row: Record<string, string | number> = {}
      for (const cat of categories.value) {
        const item = itemsByCategory.value[cat.id]?.find(i => i.id === line.selection[cat.id])
        row[categoryCodeColumn(cat)] = item?.code || ''
        row[categoryNameColumn(cat)] = item?.name || ''
      }
      row['年初借方'] = line.opening_debit || 0
      row['年初贷方'] = line.opening_credit || 0
      if (isMidYear.value) {
        row['帐前借方'] = line.pre_book_debit || 0
        row['帐前贷方'] = line.pre_book_credit || 0
      }
      return row
    }

    const rows = [toRow(sampleLine)]
    if (itemsByCategory.value[categories.value[0]?.id]?.length > 1) {
      const second = createEmptyAuxLine(categories.value.map(c => c.id))
      for (const cat of categories.value) {
        const items = itemsByCategory.value[cat.id] || []
        const pick = items[1] || items[0]
        if (pick) second.selection[cat.id] = pick.id
      }
      second.opening_debit = 0
      second.opening_credit = 0
      rows.push(toRow(second))
    }
    return rows
  }

  async function downloadTemplate() {
    if (!currentAccount.value) return
    const { utils, writeFile } = await import('xlsx')
    const rows = buildTemplateRows()
    const ws = utils.json_to_sheet(rows)
    const colWidths = categories.value.flatMap(() => [{ wch: 14 }, { wch: 18 }])
    colWidths.push({ wch: 14 }, { wch: 14 })
    if (isMidYear.value) colWidths.push({ wch: 14 }, { wch: 14 })
    ws['!cols'] = colWidths
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, '辅助期初模板')
    const acc = currentAccount.value
    writeFile(wb, `辅助期初模板_${acc.code}_${selectedYear.value}年.xlsx`)
  }

  function linesToExportRows(): Record<string, string | number>[] {
    return allSavableLines().map(line => {
      const row: Record<string, string | number> = {}
      for (const cat of categories.value) {
        const item = itemsByCategory.value[cat.id]?.find(i => i.id === line.selection[cat.id])
        row[categoryCodeColumn(cat)] = item?.code || ''
        row[categoryNameColumn(cat)] = item?.name || ''
      }
      row['年初借方'] = line.opening_debit || 0
      row['年初贷方'] = line.opening_credit || 0
      if (isMidYear.value) {
        row['帐前借方'] = line.pre_book_debit || 0
        row['帐前贷方'] = line.pre_book_credit || 0
      }
      return row
    })
  }

  async function exportData() {
    if (!currentAccount.value) return
    if (allSavableLines().length === 0) {
      showError('没有可导出的数据')
      return
    }
    const rows = linesToExportRows()
    const acc = currentAccount.value
    await exportStyledTable({
      fileName: `辅助期初_${acc.code}_${selectedYear.value}年.xlsx`,
      sheetName: '辅助期初',
      title: '辅助期初余额',
      subtitle: `${acc.code} ${acc.name} · ${selectedYear.value}年`,
      columns: buildInitBalanceAuxExportColumns(categories.value, isMidYear.value),
      rows,
    })
    showSuccess(`已导出 ${rows.length} 条辅助期初`)
  }

  function parseImportRows(rawData: any[]): AuxImportPreviewRow[] {
    const results: AuxImportPreviewRow[] = []

    rawData.forEach((row, index) => {
      const selection: Record<string, string> = {}
      const selection_labels: Record<string, string> = {}
      let matched = true
      let error = ''

      const filledCats: AuxCategoryMeta[] = []
      for (const cat of categories.value) {
        const codeKey = categoryCodeColumn(cat)
        const nameKey = categoryNameColumn(cat)
        const code = String(row[codeKey] ?? '').trim()
        const name = String(row[nameKey] ?? '').trim()
        if (!code) continue
        const item = itemsByCategory.value[cat.id]?.find(
          i => String(i.code).trim() === code || (name && i.name === name)
        )
        if (!item) {
          matched = false
          error = `未找到${cat.name}编码「${code}」`
          break
        }
        selection[cat.id] = item.id
        selection_labels[cat.id] = `${cat.name}:${item.name}`
        filledCats.push(cat)
      }

      if (matched && filledCats.length === 0) {
        matched = false
        error = '请至少填写一个辅助类目的项目编码'
      }
      if (matched && filledCats.length > 1) {
        matched = false
        error = '同一行只能填写一个辅助类目（请分 sheet 或分行按类目导入）'
      }

      let opening_debit = Number(row['年初借方']) || 0
      let opening_credit = Number(row['年初贷方']) || 0
      const pre_book_debit = Number(row['帐前借方']) || 0
      const pre_book_credit = Number(row['帐前贷方']) || 0

      if (matched && opening_debit > 0.005 && opening_credit > 0.005) {
        matched = false
        error = '年初借方与年初贷方不能同时填写'
      }

      if (matched) {
        const opening = normalizeOpeningDebitCredit(opening_debit, opening_credit)
        opening_debit = opening.opening_debit
        opening_credit = opening.opening_credit
      }

      const allZero =
        opening_debit === 0 &&
        opening_credit === 0 &&
        pre_book_debit === 0 &&
        pre_book_credit === 0

      if (matched && allZero) {
        matched = false
        error = '金额不能全为 0'
      }

      results.push({
        rowIndex: index + 2,
        selection,
        selection_labels,
        opening_debit,
        opening_credit,
        pre_book_debit,
        pre_book_credit,
        matched,
        error: matched ? undefined : error,
      })
    })

    return results.filter(
      r =>
        Object.keys(r.selection).length > 0 ||
        r.opening_debit !== 0 ||
        r.opening_credit !== 0
    )
  }

  function applyImportPreview(preview: AuxImportPreviewRow[]) {
    const matched = preview.filter(r => r.matched)
    if (matched.length === 0) {
      showError('没有可导入的有效数据')
      return 0
    }
    const store = new Map(combinationStore.value)
    for (const row of matched) {
      const catId = Object.keys(row.selection).find(id => row.selection[id])
      if (!catId) continue
      const opening = normalizeOpeningDebitCredit(row.opening_debit, row.opening_credit)
      const key =
        buildSingleCategoryAuxItemId(codeByCategoryId.value, catId, row.selection[catId]) ||
        newLineKey()
      store.set(key, {
        key,
        selection: { [catId]: row.selection[catId] },
        ...opening,
        pre_book_debit: row.pre_book_debit,
        pre_book_credit: row.pre_book_credit,
      })
    }
    combinationStore.value = store
    rebuildGridForActiveCategory()
    page.value = 1
    return matched.length
  }

  return {
    loading,
    saving,
    locked,
    lockReason,
    currentAccount,
    categories,
    itemsByCategory,
    categoryFields,
    codeByCategoryId,
    gridRows,
    displayRows,
    displayTotal,
    keyword,
    page,
    pageSize,
    combinationCount,
    useCategoryTabs,
    activeCategoryId,
    lines,
    isMidYear,
    selectedYear,
    loadDetails,
    checkCanEdit,
    addLine,
    removeLineByKey,
    countIncompleteLines,
    categoryTabStats,
    categoryTotalsList,
    validateCategoryTotalsMatch,
    saveLine,
    save,
    lineTotals,
    activeCategoryTotals,
    downloadTemplate,
    exportData,
    parseImportRows,
    applyImportPreview,
    categoryCodeColumn,
    categoryNameColumn,
  }
}
