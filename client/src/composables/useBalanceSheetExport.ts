import printJS from 'print-js'
import { formatAmount } from './useBalanceSheetData'

export function useBalanceSheetExport() {
  function printReport(reportData: any) {
    if (!reportData) return
    const d = reportData
    const html = `<h1 style="text-align:center">资产负债表</h1>
    <p style="text-align:center">${d.reportDate}</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><th>资产</th><th>期末</th><th>负债和净资产</th><th>期末</th></tr>
      <tr><td>资产总计</td><td style="text-align:right">${formatAmount(d.totalAssets)}</td>
      <td>负债合计</td><td style="text-align:right">${formatAmount(d.totalLiabilities)}</td></tr>
      <tr><td></td><td></td>
      <td>净资产合计</td><td style="text-align:right">${formatAmount(d.totalEquity)}</td></tr>
      <tr><td><strong>资产总计</strong></td><td style="text-align:right"><strong>${formatAmount(d.totalAssets)}</strong></td>
      <td><strong>负债和净资产总计</strong></td><td style="text-align:right"><strong>${formatAmount(d.totalLiabilitiesAndEquity)}</strong></td></tr>
    </table>
    <p style="color:${d.balanced ? 'green' : 'red'}">${d.balanced ? '√ 报表平衡' : '✗ 不平衡，差异: ' + formatAmount(Math.abs(d.totalAssets - d.totalLiabilitiesAndEquity))}</p>`
    printJS({ printable: html, type: 'raw-html' })
  }

  async function exportToExcel(
    reportData: any,
    filters: any,
    assetItemsByGroup: any,
    netValueItems: any,
    liabilityItems: any,
    equityItems: any
  ) {
    const { utils, writeFile } = await import('xlsx')
    const d = reportData
    const data: (string | number)[][] = [
      ['资产负债表'],
      [d.reportDate],
      [],
      ['资产', '行次', '期末余额', '年初余额', '负债和净资产', '行次', '期末余额', '年初余额'],
      ['一、流动资产', '', '', '', '负债：', '', '', ''],
      ['（一）流动负债', '', '', '', '（二）非流动负债', '', '', ''],
    ]

    for (const item of assetItemsByGroup['流动资产']) {
      data.push([item.name, item.num, item.formatted === '—' ? '' : item.formatted, '', '', '', '', ''])
    }
    data.push(['流动资产合计', '', '', '', '', '', '', ''])
    data.push(['二、非流动资产', '', '', '', '', '', '', ''])

    for (const item of assetItemsByGroup['非流动资产']) {
      data.push([item.name, item.num, item.formatted === '—' ? '' : item.formatted, '', '', '', '', ''])
    }

    for (const [label, items] of [
      ['固定资产净值', netValueItems['固定资产']],
      ['无形资产净值', netValueItems['无形资产']],
      ['公共基础设施净值', netValueItems['公共基础设施']],
    ]) {
      if (items.length) {
        data.push([`  ${label}`, '', '', '', '', '', '', ''])
        for (const item of items) {
          data.push([item.name, item.num, item.formatted === '—' ? '' : item.formatted, '', '', '', '', ''])
        }
      }
    }

    for (const item of assetItemsByGroup['其他非流动资产']) {
      data.push([item.name, item.num, item.formatted === '—' ? '' : item.formatted, '', '', '', '', ''])
    }
    data.push(['资产总计', '', d.totalAssets, '', '', '', '', ''])

    for (const item of liabilityItems.filter((i: any) => i.type === '流动负债')) {
      data.push([item.name, item.num, item.formatted === '—' ? '' : item.formatted, '', '', '', '', ''])
    }
    for (const item of liabilityItems.filter((i: any) => i.type === '非流动负债')) {
      data.push(['', '', '', '', item.name, item.num, item.formatted === '—' ? '' : item.formatted, ''])
    }
    data.push(['负债合计', '', '', '', '', '', d.totalLiabilities, ''])
    data.push(['净资产：', '', '', '', '', '', '', ''])

    for (const item of equityItems) {
      data.push([item.name, item.num, item.formatted === '—' ? '' : item.formatted, '', '', '', '', ''])
    }
    data.push(['净资产合计', '', d.totalEquity, '', '', '', '', ''])
    data.push(['负债和净资产总计', '', d.totalLiabilitiesAndEquity, '', '', '', '', ''])
    data.push([], [`报表平衡: ${d.balanced ? '是' : '否'}`])

    const wb = utils.book_new()
    const ws = utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 22 }, { wch: 5 }, { wch: 16 }, { wch: 10 },
      { wch: 22 }, { wch: 5 }, { wch: 16 }, { wch: 10 },
    ]
    utils.book_append_sheet(wb, ws, '资产负债表')
    writeFile(wb, `资产负债表_${filters.year}_${filters.period}月.xlsx`)
  }

  return {
    printReport,
    exportToExcel,
  }
}
