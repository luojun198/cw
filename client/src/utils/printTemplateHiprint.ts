/**
 * vue-plugin-hiprint 适配层
 * - 懒加载 hiprint（UMD 重包，含 jQuery/jspdf/html2canvas，不进首屏）
 * - 提供「单 HTML 元素面板」构造，用于把账册/报表的二维表格 HTML 交给 hiprint
 *   统一走预览 / 打印 / 导出 PDF / 套打底图通道。
 */
import type { HiprintPanel } from '@/types/print'

type HiprintModule = typeof import('vue-plugin-hiprint')

let hiprintModulePromise: Promise<HiprintModule> | null = null
let initialized = false

/** 懒加载并初始化 hiprint（全局只初始化一次） */
export async function loadHiprint(): Promise<HiprintModule> {
  if (!hiprintModulePromise) {
    hiprintModulePromise = (async () => {
      const mod = await import('vue-plugin-hiprint')
      // 引入设计/打印锁定样式
      await import('vue-plugin-hiprint/dist/print-lock.css')
      if (!initialized) {
        try {
          // 关闭自动 socket 连接，避免本地未装打印服务时反复报错
          mod.hiPrintPlugin?.disAutoConnect?.()
        } catch {
          /* 忽略 */
        }
        mod.hiprint.init({
          providers: [new mod.defaultElementTypeProvider()],
        })
        initialized = true
      }
      return mod
    })()
  }
  return hiprintModulePromise
}

/** mm 转 px（hiprint 内部按 px，96dpi 下 1mm≈3.7795px） */
export function mmToPx(mm: number): number {
  return Math.round(mm * 3.7795275591)
}

export interface BuildHtmlPanelOptions {
  html: string
  /** 纸张：A4 / A5 / 或自定义 mm 宽高 */
  paperType?: string
  widthMm?: number
  heightMm?: number
  /** 套打底图 URL */
  background?: string | null
  /** 页边距（mm） */
  marginMm?: number
}

/** hiprint 模板（PrintTemplate 的 template 选项）：含 panels 数组 */
export interface HiprintTemplate {
  panels: HiprintPanel[]
}

/**
 * 构造一个只含单个 html 元素的 hiprint 模板（含 panels 数组，可直接喂给 PrintTemplate）。
 * 账册/报表的二维表格（含合并标题）直接以 HTML 形式注入，1:1 还原现有渲染。
 */
export function buildSingleHtmlPanel(options: BuildHtmlPanelOptions): HiprintTemplate {
  const { html, paperType = 'A4', widthMm, heightMm, background, marginMm = 8 } = options

  // A4: 210x297mm；A5: 148x210mm；自定义用传入 mm
  const presetWidth: Record<string, number> = { A4: 210, A5: 148, A3: 297 }
  const presetHeight: Record<string, number> = { A4: 297, A5: 210, A3: 420 }
  const wMm = widthMm || presetWidth[paperType] || 210
  const hMm = heightMm || presetHeight[paperType] || 297

  const widthPx = mmToPx(wMm)
  const heightPx = mmToPx(hMm)
  const marginPx = mmToPx(marginMm)

  const printElements: unknown[] = []

  // 套打底图：以整页 image 元素铺底（panel.background 仅设计器可见、不打印，故用 image 元素）
  if (background) {
    printElements.push({
      options: {
        left: 0,
        top: 0,
        width: widthPx,
        height: heightPx,
        src: background,
        fit: 'fill',
      },
      printElementType: { title: '底图', type: 'image' },
    })
  }

  printElements.push({
    options: {
      left: marginPx,
      top: marginPx,
      width: widthPx - marginPx * 2,
      height: heightPx - marginPx * 2,
      field: 'content',
      content: html,
      fit: 'auto',
    },
    printElementType: { title: '报表内容', type: 'html' },
  })

  const panel: HiprintPanel = {
    index: 0,
    paperType,
    width: wMm,
    height: hMm,
    paperHeader: marginPx,
    paperFooter: heightPx - marginPx,
    printElements,
    ...(background ? { background } : {}),
  }

  // hiprint PrintTemplate 的 template 选项需要 { panels: [...] }
  return { panels: [panel] }
}

/** 把单 HTML 面板需要的打印数据（绑定 field=content） */
export function buildHtmlPrintData(html: string): Record<string, unknown> {
  return { content: html }
}

// ============ 账册/列表类的自包含 HTML 表格构造 ============

export interface PrintColumn<T = any> {
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
  /** 单元格渲染，返回纯文本（会被转义） */
  render: (row: T, index: number) => string
}

export interface BuildTablePrintOptions<T = any> {
  title: string
  subtitle?: string
  columns: PrintColumn<T>[]
  rows: T[]
  /** 返回行内联样式（如小计行加粗底色），可选 */
  rowStyle?: (row: T, index: number) => string
  /** 表尾合计行（已是字符串数组，与列对应），可选 */
  footer?: string[]
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 由列定义 + 数据行构造自包含 HTML 表格（内联样式），供 hiprint html 元素套打。
 * 账册各视图把自己的 el-table 列逻辑映射成 PrintColumn[] 即可复用。
 */
export function buildTablePrintHtml<T = any>(opts: BuildTablePrintOptions<T>): string {
  const { title, subtitle, columns, rows, rowStyle, footer } = opts
  const thBase =
    'border:1px solid #000;padding:4px 6px;font-size:12px;background:#f2f2f2;font-weight:600;'
  const tdBase = 'border:1px solid #000;padding:3px 6px;font-size:12px;'

  const head = columns
    .map(
      c =>
        `<th style="${thBase}text-align:${c.align || 'center'};${c.width ? `width:${c.width};` : ''}">${escapeHtml(c.label)}</th>`
    )
    .join('')

  const body = rows
    .map((row, i) => {
      const extra = rowStyle ? rowStyle(row, i) : ''
      const tds = columns
        .map(
          c =>
            `<td style="${tdBase}text-align:${c.align || 'left'};${extra}">${escapeHtml(c.render(row, i))}</td>`
        )
        .join('')
      return `<tr>${tds}</tr>`
    })
    .join('')

  const foot = footer
    ? `<tr>${footer
        .map(
          (v, idx) =>
            `<td style="${tdBase}font-weight:600;background:#fafafa;text-align:${columns[idx]?.align || 'left'};">${escapeHtml(v)}</td>`
        )
        .join('')}</tr>`
    : ''

  return `<div style="font-family:'SimSun','宋体',serif;">
    <div style="text-align:center;font-size:18px;font-weight:700;letter-spacing:2px;margin-bottom:4px;">${escapeHtml(title)}</div>
    ${subtitle ? `<div style="text-align:center;font-size:12px;color:#333;margin-bottom:8px;">${escapeHtml(subtitle)}</div>` : ''}
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}${foot}</tbody>
    </table>
  </div>`
}
