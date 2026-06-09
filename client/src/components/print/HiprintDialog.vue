<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="900px"
    top="4vh"
    append-to-body
    class="hiprint-dialog"
    @opened="handleOpened"
  >
    <div class="hiprint-toolbar">
      <span class="label">打印模板</span>
      <el-select
        v-model="selectedTemplateId"
        size="small"
        placeholder="默认模板"
        style="width: 220px"
        :loading="loadingTemplates"
        @change="renderPreview"
      >
        <el-option
          v-for="t in templates"
          :key="t.id"
          :label="t.name + (t.is_default ? '（默认）' : '')"
          :value="t.id"
        />
        <el-option v-if="templates.length === 0" label="内置默认排版" value="" />
      </el-select>
      <div class="spacer" />
      <el-button size="small" :loading="rendering" @click="renderPreview">刷新预览</el-button>
      <el-button size="small" @click="handleExportPdf">导出 PDF</el-button>
      <el-button type="primary" size="small" :loading="printing" @click="handlePrint">
        打印
      </el-button>
    </div>

    <div v-loading="rendering" class="hiprint-preview-wrap">
      <div ref="previewRef" class="hiprint-preview" />
      <el-empty v-if="!rendering && previewEmpty" description="无可打印内容" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getApplicableTemplates, getPrintTemplate } from '@/api/printTemplate'
import {
  loadHiprint,
  buildSingleHtmlPanel,
  buildHtmlPrintData,
} from '@/utils/printTemplateHiprint'
import type { ApplicableTemplate, PrintTemplateType, PrintTemplate } from '@/types/print'

interface Props {
  modelValue: boolean
  templateType: PrintTemplateType
  templateKey: string
  title?: string
  /** html 模式（账册/报表）：返回要打印的二维表格 HTML */
  getPrintHtml?: () => string
  /** 字段模式（凭证）：打印数据对象或数组 */
  printData?: Record<string, unknown> | Record<string, unknown>[]
  /** 字段模式无自定义模板时的内置默认面板构造（如凭证默认模板） */
  defaultPanelBuilder?: () => { panels: unknown[] }
  /** 纸张默认（无模板时），如 'A4' */
  defaultPaper?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '打印',
  defaultPaper: 'A4',
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const dialogTitle = computed(() => props.title || '打印')

const templates = ref<ApplicableTemplate[]>([])
const selectedTemplateId = ref<string>('')
const loadingTemplates = ref(false)
const rendering = ref(false)
const printing = ref(false)
const previewEmpty = ref(false)
const previewRef = ref<HTMLElement | null>(null)

// 当前 hiprint 模板实例
let currentTp: any = null

const loadTemplates = async () => {
  loadingTemplates.value = true
  try {
    const res = await getApplicableTemplates({
      template_type: props.templateType,
      template_key: props.templateKey,
    })
    if (res.code === 0) {
      templates.value = res.data
      const def = res.data.find(t => t.is_default) || res.data[0]
      selectedTemplateId.value = def ? def.id : ''
    }
  } catch (e: any) {
    // 模板加载失败不阻断：走内置默认排版
    templates.value = []
    selectedTemplateId.value = ''
  } finally {
    loadingTemplates.value = false
  }
}

/** 取得当前要用的 hiprint 面板（有自定义模板用其 panel，否则用内置单 HTML 面板） */
const resolvePanelAndData = async (): Promise<{ panel: any; data: any } | null> => {
  // html 模式：账册/报表
  const html = props.getPrintHtml ? props.getPrintHtml() : ''

  let detail: PrintTemplate | null = null
  if (selectedTemplateId.value) {
    try {
      const res = await getPrintTemplate(selectedTemplateId.value)
      if (res.code === 0) detail = res.data
    } catch {
      detail = null
    }
  }

  // 自定义 hiprint 模板（有 panels 且含面板）→ 字段绑定模式（凭证为主）
  const designedPanels = (detail?.panel as any)?.panels
  if (Array.isArray(designedPanels) && designedPanels.length > 0 && props.printData) {
    return { panel: detail!.panel, data: props.printData }
  }

  // 字段模式但无自定义模板：用内置默认面板（凭证默认模板）
  if (props.printData && props.defaultPanelBuilder) {
    return { panel: props.defaultPanelBuilder(), data: props.printData }
  }

  // 否则 html 模式：用模板纸张/底图包一个单 html 面板
  if (!html) return null
  const paper = detail?.paper_size && detail.paper_size !== 'custom' ? detail.paper_size : props.defaultPaper
  const panel = buildSingleHtmlPanel({
    html,
    paperType: paper,
    widthMm: detail?.paper_size === 'custom' ? detail?.paper_width : undefined,
    heightMm: detail?.paper_size === 'custom' ? detail?.paper_height : undefined,
    background: detail?.background_image || null,
  })
  return { panel, data: buildHtmlPrintData(html) }
}

const renderPreview = async () => {
  rendering.value = true
  previewEmpty.value = false
  try {
    const mod = await loadHiprint()
    const resolved = await resolvePanelAndData()
    if (!resolved) {
      previewEmpty.value = true
      if (previewRef.value) previewRef.value.innerHTML = ''
      return
    }
    currentTp = new mod.hiprint.PrintTemplate({ template: resolved.panel })
    if (previewRef.value) {
      previewRef.value.innerHTML = ''
      const $html = currentTp.getHtml(resolved.data) as any
      const node = $html && ($html[0] || (typeof $html.get === 'function' && $html.get(0)))
      if (node) previewRef.value.appendChild(node)
      else previewRef.value.innerHTML = String($html)
    }
  } catch (e: any) {
    ElMessage.error('预览失败：' + (e?.message || e))
    previewEmpty.value = true
  } finally {
    rendering.value = false
  }
}

const handlePrint = async () => {
  printing.value = true
  try {
    const mod = await loadHiprint()
    const resolved = await resolvePanelAndData()
    if (!resolved) {
      ElMessage.warning('无可打印内容')
      return
    }
    const tp = new mod.hiprint.PrintTemplate({ template: resolved.panel })
    tp.print(resolved.data)
  } catch (e: any) {
    ElMessage.error('打印失败：' + (e?.message || e))
  } finally {
    printing.value = false
  }
}

const handleExportPdf = async () => {
  try {
    const mod = await loadHiprint()
    const resolved = await resolvePanelAndData()
    if (!resolved) {
      ElMessage.warning('无可打印内容')
      return
    }
    const tp = new mod.hiprint.PrintTemplate({ template: resolved.panel })
    tp.printToPdf(resolved.data, props.title || '打印')
  } catch (e: any) {
    ElMessage.error('导出 PDF 失败：' + (e?.message || e))
  }
}

const handleOpened = async () => {
  await loadTemplates()
  await renderPreview()
}

watch(
  () => props.modelValue,
  v => {
    if (!v && previewRef.value) previewRef.value.innerHTML = ''
  }
)
</script>

<style scoped>
.hiprint-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 12px;
}
.hiprint-toolbar .label {
  font-size: 13px;
  color: #606266;
}
.hiprint-toolbar .spacer {
  flex: 1;
}
.hiprint-preview-wrap {
  min-height: 60vh;
  max-height: 74vh;
  overflow: auto;
  background: #f5f7fa;
  padding: 16px;
  display: flex;
  justify-content: center;
}
.hiprint-preview {
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
</style>
