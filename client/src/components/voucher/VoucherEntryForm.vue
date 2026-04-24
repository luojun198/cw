<template>
  <el-dialog
    v-model="visible"
    :title="mode === 'add' ? '新增记账凭证' : mode === 'insert' ? '插入凭证' : '编辑记账凭证'"
    width="1200px"
    top="4vh"
    class="voucher-dialog"
    destroy-on-close
    @close="handleClose"
  >
    <div class="paper-voucher">
      <div class="voucher-paper-header">
        <div class="voucher-paper-title">记 账 凭 证</div>
        <div class="voucher-paper-meta">
          <div class="meta-item">
            <span class="meta-label">凭证类型</span>
            <el-select
              v-model="form.voucher_type_id"
              placeholder="凭证类型"
              class="meta-control"
              clearable
            >
              <el-option v-for="t in voucherTypes" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </div>
          <div v-if="mode === 'edit'" class="meta-item">
            <span class="meta-label">凭证编号</span>
            <el-input
              v-model="form.voucher_no"
              placeholder="凭证编号"
              class="meta-control"
              @blur="handleVoucherNoBlur"
            />
          </div>
          <div v-else class="meta-item meta-readonly">
            <span class="meta-label">凭证编号</span>
            <span class="meta-text" :style="!form.voucher_no ? 'color: #c0c4cc; font-weight: normal' : ''">{{ form.voucher_no || '保存后自动生成' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">日期</span>
            <el-date-picker
              v-model="form.voucher_date"
              type="date"
              value-format="YYYY-MM-DD"
              class="meta-control"
            />
          </div>
          <div class="meta-item meta-readonly">
            <span class="meta-label">分录数</span>
            <span class="meta-text">{{ form.entries.length }}</span>
          </div>
        </div>
      </div>

      <div class="voucher-top-actions">
        <div class="navigation-controls">
          <el-button-group>
            <el-button
              size="small"
              :disabled="!navigationInfo || navigationInfo.isFirst"
              @click="emit('navigate', 'first')"
            >
              首张
            </el-button>
            <el-button
              size="small"
              :disabled="!navigationInfo || navigationInfo.isFirst"
              @click="emit('navigate', 'previous')"
            >
              上一张
            </el-button>
            <el-button
              size="small"
              :disabled="!navigationInfo || navigationInfo.isLast"
              @click="emit('navigate', 'next')"
            >
              下一张
            </el-button>
            <el-button
              size="small"
              :disabled="!navigationInfo || navigationInfo.isLast"
              @click="emit('navigate', 'last')"
            >
              末张
            </el-button>
          </el-button-group>

          <span class="navigation-info">
            <template v-if="navigationInfo">
              第 {{ navigationInfo.current }} 张 / 共 {{ navigationInfo.total }} 张
            </template>
            <template v-else>
              未选择凭证
            </template>
          </span>
        </div>

        <!-- 当前选中科目的余额显示 -->
        <div v-if="currentEntryBalance" class="account-balance-display">
          <span class="balance-account">{{ currentEntryBalance.code }} {{ currentEntryBalance.name }}</span>
          <span class="balance-label">余额：</span>
          <span :class="currentEntryBalance.isSameSide ? 'balance-amount-same' : 'balance-amount-opposite'">
            {{ currentEntryBalance.direction === 'debit' ? '借' : '贷' }} {{ formatMoney(currentEntryBalance.end_balance) }}
          </span>
        </div>
      </div>

      <div class="voucher-table-wrap">
        <el-table
          :data="form.entries"
          border
          show-summary
          :summary-method="getSummary"
          highlight-current-row
          class="voucher-table paper-table"
          @current-change="handleCurrentEntryChange"
        >
          <el-table-column label="摘要" min-width="220">
            <template #default="{ row }">
              <div class="entry-row">
                <el-input
                  v-model="row.summary"
                  placeholder="摘要"
                  @focus="setCurrentEntry(row)"
                  @keydown.enter="moveToAccount(row)"
                />
                <el-button
                  v-if="$index === 0"
                  link
                  type="primary"
                  size="small"
                  @click="emit('ai-summary')"
                  >AI</el-button
                >
              </div>
            </template>
          </el-table-column>

          <el-table-column label="会计科目" min-width="260">
            <template #default="{ row }">
              <el-autocomplete
                ref="accountInputRefs"
                :model-value="getAccountInput(row)"
                :fetch-suggestions="(queryString, cb) => queryAccountSuggestions(row, queryString, cb)"
                placeholder="输入科目编码或名称"
                style="width: 100%"
                clearable
                @update:model-value="val => onAccountInputChange(row, val)"
                @select="item => handleAccountSelect(row, item)"
                @focus="onAccountAutoFocus(row)"
                @keydown.enter="onAccountEnter(row)"
                @keydown.delete="onAccountDelete(row, $event)"
                @keydown.up="onAccountArrowKey(row, $event, 'up')"
                @keydown.down="onAccountArrowKey(row, $event, 'down')"
              >
                <template #default="{ item }">
                  <div 
                    class="account-suggestion-item"
                    :class="{ 'is-parent-account': item.isParent }"
                    :style="{ cursor: item.isParent ? 'not-allowed' : 'pointer' }"
                    @click.stop="item.isParent && $event.preventDefault()"
                  >
                    <span
                      :style="{
                        color: item.isParent ? '#c0c4cc' : '#303133',
                        fontStyle: item.isParent ? 'italic' : 'normal',
                      }"
                    >
                      {{ item.code }} {{ item.name }}
                    </span>
                    <template v-if="item.auxNames?.length && !item.isParent">
                      <span
                        v-for="name in item.auxNames"
                        :key="name"
                        style="color: #409eff; margin-left: 8px"
                      >[{{ name }}]</span>
                    </template>
                    <span
                      v-if="item.isParent"
                      style="color: #c0c4cc; font-size: 11px; margin-left: 4px"
                    >
                      (父科目)
                    </span>
                  </div>
                </template>
              </el-autocomplete>
            </template>
          </el-table-column>

          <el-table-column label="借方金额" width="170" align="right">
            <template #default="{ row }">
              <el-input-number
                v-model="row.debit_amount"
                :precision="2"
                :min="0"
                :controls="false"
                style="width: 140px"
                placeholder="0.00"
                @focus="setCurrentEntry(row)"
                @change="onAmountChange(row, 'debit')"
                @keydown.enter="onDebitEnter(row)"
                @keydown="onDebitKeydown(row, $event)"
              />
            </template>
          </el-table-column>

          <el-table-column label="贷方金额" width="170" align="right">
            <template #default="{ row }">
              <el-input-number
                v-model="row.credit_amount"
                :precision="2"
                :min="0"
                :controls="false"
                style="width: 140px"
                placeholder="0.00"
                @focus="setCurrentEntry(row)"
                @change="onAmountChange(row, 'credit')"
                @keydown.enter="onCreditEnter(row)"
                @keydown="onCreditKeydown(row, $event)"
              />
            </template>
          </el-table-column>

          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row, $index }">
              <el-button
                link
                type="danger"
                size="small"
                :disabled="form.entries.length <= 2"
                @click="removeEntry($index, row)"
                >删除</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="voucher-paper-toolbar">
        <el-button @click="addEntry">+ 添加分录</el-button>
        <div class="voucher-balance" :class="{ balanced: isBalanced, unbalanced: !isBalanced }">
          借方合计：{{ formatMoney(totalDebit) }}
          <span class="divider">|</span>
          贷方合计：{{ formatMoney(totalCredit) }}
          <span class="divider">|</span>
          {{ isBalanced ? '借贷平衡 ✓' : `借贷不平衡，差额 ${formatMoney(Math.abs(totalDebit - totalCredit))}` }}
        </div>
      </div>

      <div v-if="currentEntry && currentEntryAuxCategories.length > 0" class="voucher-aux-panel">
        <div class="voucher-aux-header">
          <span>当前分录辅助核算</span>
          <span class="voucher-aux-summary">
            {{ currentEntry.summary || '未填写摘要' }} /
            {{ currentEntry.account_name || '未选择科目' }}
          </span>
          <el-button link size="small" @click="emit('clear-current-entry')">收起</el-button>
        </div>

        <div class="voucher-aux-rows">
          <div v-for="cat in currentEntryAuxCategories" :key="cat.id" class="voucher-aux-row">
            <span class="voucher-aux-row-label">{{ cat.name }}</span>
            <el-select
              v-model="currentEntry[`_${cat.code}_id`]"
              filterable
              clearable
              :placeholder="`请选择${cat.name}`"
              style="width: 200px"
            >
              <el-option
                v-for="item in auxItemsByCategory[cat.id]"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <!-- 凭证录入显示的自定义字段 -->
            <template v-if="currentEntry[`_${cat.code}_id`] && getVoucherFields(cat).length > 0">
              <div v-for="field in getVoucherFields(cat)" :key="field.field_key" class="voucher-aux-row-field">
                <span class="voucher-aux-field-name">
                  {{ field.field_name }}
                  <span v-if="field.required_in_voucher" style="color: #f56c6c">*</span>
                </span>
                <el-input v-if="field.field_type === 'text'" v-model="currentEntry[`_${cat.code}_fv_${field.field_key}`]" style="width: 140px" />
                <el-input-number v-else-if="field.field_type === 'number'" v-model="currentEntry[`_${cat.code}_fv_${field.field_key}`]" :controls="false" style="width: 140px" />
                <el-date-picker v-else-if="field.field_type === 'date'" v-model="currentEntry[`_${cat.code}_fv_${field.field_key}`]" type="date" value-format="YYYY-MM-DD" style="width: 160px" />
                <el-select v-else-if="field.field_type === 'select'" v-model="currentEntry[`_${cat.code}_fv_${field.field_key}`]" clearable style="width: 140px">
                  <el-option v-for="opt in parseFieldOpts(field.options_json)" :key="opt" :label="opt" :value="opt" />
                </el-select>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="voucher-paper-remark">
        <span class="remark-label">附注</span>
        <el-input v-model="form.remark" placeholder="凭证备注" />
      </div>

      <div class="voucher-attachments-container">
        <div class="attachment-inline">
          <el-icon><Document /></el-icon>
          <span class="attachment-label">附件</span>
          <el-button size="small" type="primary" plain @click="triggerFileInput">
            <el-icon><Upload /></el-icon>
            上传
          </el-button>
          <template v-if="attachments.length > 0">
            <el-tag
              v-for="file in attachments"
              :key="file.id"
              closable
              :disable-transitions="false"
              class="attachment-tag"
              @close="handleFileDelete(file)"
              @click="handleAttachmentClick(file)"
            >
              {{ file.original_name }}
            </el-tag>
          </template>
        </div>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="*"
          style="display: none"
          @change="onFileInputChange"
        />
      </div>

      <!-- 图片预览对话框 -->
      <el-dialog
        v-model="previewVisible"
        :title="previewAttachment?.original_name"
        width="80%"
        :before-close="closePreview"
      >
        <div class="preview-content">
          <img
            v-if="previewAttachment"
            :src="buildFileUrl(previewAttachment.file_path)"
            style="max-width: 100%; max-height: 70vh; display: block; margin: 0 auto"
            @error="handlePreviewError"
          />
        </div>
        <template #footer>
          <el-button @click="closePreview">关闭</el-button>
          <el-button type="primary" @click="previewAttachment && handleFileDownload(previewAttachment)">
            <el-icon><Download /></el-icon>
            下载
          </el-button>
        </template>
      </el-dialog>

      <div class="voucher-paper-signatures">
        <div class="signature-item"><span>制单</span><em>{{ props.form.maker_name || '' }}</em></div>
        <div class="signature-item"><span>审核</span><em>{{ props.form.auditor_name || '' }}</em></div>
        <div class="signature-item"><span>记账</span><em>{{ props.form.poster_name || '' }}</em></div>
        <div class="signature-item"><span>出纳</span><em></em></div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer-enhanced">
        <div class="submit-controls">
          <el-button @click="handleClose">取消</el-button>
          <el-button type="primary" :loading="props.submitLoading" @click="emit('submit')">保存凭证</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, toRefs, nextTick } from 'vue'
import type { VoucherForm, VoucherEntry } from '@/composables/useVoucherForm'
import { useKeyboardShortcuts, commonShortcuts } from '@/composables/useKeyboardShortcuts'
import { showSuccess, showError } from '@/composables/useMessage'
import request from '@/api/request'
import { Document, Upload, Download } from '@element-plus/icons-vue'

interface NavigationInfo {
  current: number
  total: number
  isFirst: boolean
  isLast: boolean
}

interface Props {
  modelValue: boolean
  mode: 'add' | 'edit' | 'insert'
  form: VoucherForm
  currentEntry: VoucherEntry | null
  voucherTypes: any[]
  accounts: any[]
  auxCategories: any[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
  auxItemsByCategory: Record<string, any[]>
  currentEntryAuxCategories: any[]
  isParentAccount: (id: string) => boolean
  getAuxItemNames: (acc: any) => string[]
  onAccountChange: (entry: any) => void
  onAmountChange: (entry: any, side: 'debit' | 'credit') => void
  addEntry: () => void
  removeEntry: (index: number, row: VoucherEntry) => void
  setCurrentEntry: (row: VoucherEntry) => void
  attachments?: any[]
  updateAttachments?: (attachments: any[]) => void
  submitLoading?: boolean
  navigationInfo?: NavigationInfo | null
}

const props = withDefaults(defineProps<Props>(), {
  submitLoading: false,
  navigationInfo: null,
})
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'ai-summary': []
  submit: []
  'update:attachments': [attachments: any[]]
  'queue-upload': [files: File[]]
  'remove-queued-upload': [fileKey: string]
  navigate: [direction: 'first' | 'previous' | 'next' | 'last']
  'clear-current-entry': []
}>()

// 处理更多操作命令
// Attachments data
const attachments = ref(props.attachments || [])

// File input ref
const fileInput = ref<HTMLInputElement>()

// Preview state
const previewVisible = ref(false)
const previewAttachment = ref<any>(null)

// 记录原始凭证号（用于检测是否修改）
const originalVoucherNo = ref('')
watch(() => props.form.id, (newId) => {
  if (newId && props.mode === 'edit') {
    originalVoucherNo.value = props.form.voucher_no
  }
}, { immediate: true })

// 凭证号失焦时，如果修改了则调用后端更新
async function handleVoucherNoBlur() {
  if (props.mode !== 'edit' || !props.form.id) return
  const newNo = props.form.voucher_no?.trim()
  if (!newNo || newNo === originalVoucherNo.value) return

  try {
    await request.put(`/voucher/vouchers/${props.form.id}/number`, {
      voucher_no: newNo,
      voucher_type_id: props.form.voucher_type_id,
    })
    originalVoucherNo.value = newNo
    showSuccess('凭证编号已更新')
  } catch (error: any) {
    showError(error.response?.data?.message || '凭证编号更新失败')
    // 恢复原值
    props.form.voucher_no = originalVoucherNo.value
  }
}

// Watch for attachments update
watch(() => props.attachments, (newVal) => {
  attachments.value = newVal || []
}, { deep: true })

// 凭证类型或日期变化时，实时计算下一个凭证号
let voucherNoTimer: ReturnType<typeof setTimeout> | null = null
function fetchNextVoucherNo() {
  if (voucherNoTimer) clearTimeout(voucherNoTimer)
  voucherNoTimer = setTimeout(async () => {
    if (!props.form.voucher_date) return
    try {
      const res = await request.get<{ voucher_no: string }>('/voucher/next-voucher-no', {
        params: {
          voucher_type_id: props.form.voucher_type_id || undefined,
          voucher_date: props.form.voucher_date,
        },
      })
      if (res.data?.voucher_no) {
        props.form.voucher_no = res.data.voucher_no
      }
    } catch {
      // ignore
    }
  }, 300)
}

// watch 凭证类型变化
watch(() => props.form.voucher_type_id, () => fetchNextVoucherNo())
// watch 日期变化
watch(() => props.form.voucher_date, () => fetchNextVoucherNo())

// Handle file upload
async function handleFileUpload(files: File[]) {
  if (!props.form.id) {
    const queuedAttachments = files.map(file => {
      const fileKey = `${file.name}_${file.size}_${file.lastModified}`
      return {
        id: `pending-${fileKey}`,
        filename: file.name,
        original_name: file.name,
        file_path: '',
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        created_at: new Date().toISOString(),
        temp_file_key: fileKey,
      }
    })

    attachments.value = [...attachments.value, ...queuedAttachments]
    emit('update:attachments', attachments.value)
    emit('queue-upload', files)
    showSuccess(`已添加 ${files.length} 个待上传附件，保存凭证后自动上传`)
    return
  }

  for (const file of files) {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await request.post<any[]>(`/voucher/vouchers/${props.form.id}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // 更新附件列表
      const uploaded = Array.isArray(response.data) ? response.data : []
      attachments.value = [...attachments.value, ...uploaded]
      emit('update:attachments', attachments.value)
      showSuccess(`附件 "${file.name}" 上传成功`)
    } catch (error) {
      showError(`附件 "${file.name}" 上传失败`)
      console.error('File upload error:', error)
    }
  }
}

// Handle file delete
async function handleFileDelete(file: any) {
  try {
    if (!props.form.id || String(file.id || '').startsWith('pending-')) {
      attachments.value = attachments.value.filter(att => att.id !== file.id)
      emit('update:attachments', attachments.value)
      if (file.temp_file_key) {
        emit('remove-queued-upload', file.temp_file_key)
      }
      showSuccess('已移除待上传附件')
      return
    }

    await request.delete(`/voucher/vouchers/${props.form.id}/attachments/${file.id}`)

    // 更新附件列表
    attachments.value = attachments.value.filter(att => att.id !== file.id)
    emit('update:attachments', attachments.value)
    showSuccess('附件删除成功')
  } catch (error) {
    showError('附件删除失败')
    console.error('File delete error:', error)
  }
}

// Handle file download
function handleFileDownload(file: any) {
  const url = buildFileUrl(file.file_path)
  const link = document.createElement('a')
  link.href = url
  link.download = file.original_name
  link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Trigger file input
function triggerFileInput() {
  fileInput.value?.click()
}

// Handle file input change
function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length > 0) {
    handleFileUpload(files)
  }
  target.value = ''
}

// Preview helpers
function isImage(mimeType?: string) {
  return mimeType?.startsWith('image/') || false
}

// Build full URL for static file
function buildFileUrl(filePath: string): string {
  if (!filePath) return ''
  if (filePath.startsWith('http')) return filePath
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.origin}${base}${filePath.startsWith('/') ? filePath : '/' + filePath}`
}

// Handle attachment click: image -> preview, others -> download
function handleAttachmentClick(file: any) {
  if (isImage(file.mime_type)) {
    previewAttachment.value = file
    previewVisible.value = true
  } else {
    handleFileDownload(file)
  }
}

function closePreview() {
  previewVisible.value = false
  previewAttachment.value = null
}

function handlePreviewError() {
  showError('图片加载失败')
  closePreview()
}

const visible = ref(props.modelValue)

watch(
  () => props.modelValue,
  val => {
    visible.value = val
  }
)

watch(visible, val => {
  emit('update:modelValue', val)
})

function handleCurrentEntryChange(row: VoucherEntry | null) {
  if (row) {
    props.setCurrentEntry(row)
  } else {
    // 点击已选中行时 el-table 会传 null，清除当前分录和高亮
    props.setCurrentEntry(null)
    nextTick(() => {
      const tableEl = document.querySelector('.voucher-table')
      if (tableEl) {
        const rows = tableEl.querySelectorAll('.el-table__body-wrapper tbody tr')
        rows.forEach(tr => tr.classList.remove('current-row'))
      }
    })
  }
}

function getSummary() {
  return [
    '',
    '',
    `借: ${formatMoney(props.totalDebit)}`,
    `贷: ${formatMoney(props.totalCredit)}`,
    '',
  ]
}

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2 }).format(val || 0)
}

function handleClose() {
  visible.value = false
}

// ========== 当前选中科目的余额查询 ==========
// 不考虑过账因素，直接从 init_balances（期初）+ 所有凭证分录实时汇总

const currentEntryBalance = ref<{
  code: string
  name: string
  direction: string
  end_balance: number
  isSameSide: boolean
} | null>(null)

let balanceFetchTimer: ReturnType<typeof setTimeout> | null = null

async function fetchCurrentEntryBalance() {
  if (!props.currentEntry?.account_id) {
    currentEntryBalance.value = null
    return
  }
  const acc = props.accounts.find(a => a.id === props.currentEntry!.account_id)
  if (!acc) {
    currentEntryBalance.value = null
    return
  }
  try {
    // 调用后端接口，实时计算期初余额+所有凭证分录汇总（不过账依赖）
    const res = await request.get<any>(`/base/accounts/${acc.id}/realtime-balance`, {
      params: { year: props.form.voucher_date ? new Date(props.form.voucher_date).getFullYear() : undefined, period: props.form.voucher_date ? new Date(props.form.voucher_date).getMonth() + 1 : undefined }
    })
    const data = res.data
    if (data && data.end_balance !== undefined) {
      const endBalance = data.end_balance || 0
      const balanceDirection = endBalance >= 0 ? data.direction : (data.direction === 'debit' ? 'credit' : 'debit')
      const isSameSide = balanceDirection === acc.direction
      currentEntryBalance.value = {
        code: acc.code,
        name: acc.name,
        direction: balanceDirection,
        end_balance: Math.abs(endBalance),
        isSameSide,
      }
    }
  } catch {
    currentEntryBalance.value = null
  }
}

// 监听当前分录变化，防抖查询余额
watch(() => [props.currentEntry?.account_id, props.currentEntry?.debit_amount, props.currentEntry?.credit_amount], () => {
  if (balanceFetchTimer) clearTimeout(balanceFetchTimer)
  balanceFetchTimer = setTimeout(fetchCurrentEntryBalance, 300)
}, { immediate: true })

// ========== 辅助核算自定义字段（凭证录入） ==========

function getVoucherFields(cat: any) {
  return (cat.fields || []).filter((f: any) => f.is_enabled !== 0 && f.show_in_voucher)
}

function parseFieldOpts(optionsJson: string | null): string[] {
  if (!optionsJson) return []
  try {
    const arr = JSON.parse(optionsJson)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// ========== 回车键智能导航 ==========

// 摘要回车 → 跳到科目
function moveToAccount(row: VoucherEntry) {
  focusCellInput(row, 1) // 第2列：会计科目
}

// 科目回车 → 根据余额方向跳到借方或贷方
function onAccountEnter(row: VoucherEntry) {
  // 如果科目还没选好，不跳
  if (!row.account_id) return
  const acc = props.accounts.find(a => a.id === row.account_id)
  if (!acc) return
  if (acc.direction === 'debit') {
    focusCellInput(row, 2) // 借方金额
  } else {
    focusCellInput(row, 3) // 贷方金额
  }
}

// 借方金额回车 → 如果是最后一行则新增行并复制摘要，否则跳到下一行摘要
function onDebitEnter(row: VoucherEntry) {
  moveToNextRow(row)
}

// 贷方金额回车 → 同上
function onCreditEnter(row: VoucherEntry) {
  moveToNextRow(row)
}

// ============= 借方金额快捷键 =============

function onDebitKeydown(row: VoucherEntry, event: KeyboardEvent) {
  const key = event.key
  if (key === '=' || key === '-') {
    event.preventDefault()
    if (key === '=') {
      // = → 自动平衡：以贷方合计为基准，填入借方，使凭证平衡
      // 例如：贷方合计1000，在借方按=则借方自动填1000
      const targetAmount = props.totalCredit
      if (targetAmount > 0) {
        row.debit_amount = targetAmount
        props.onAmountChange(row, 'debit')
      }
    } else {
      // - → 互换方向：当前借方金额移到贷方，清空借方
      const debit = row.debit_amount || 0
      if (debit > 0) {
        row.credit_amount = debit
        row.debit_amount = 0
        props.onAmountChange(row, 'credit')
      }
    }
  }
}

// ============= 贷方金额快捷键 =============

function onCreditKeydown(row: VoucherEntry, event: KeyboardEvent) {
  const key = event.key
  if (key === '=' || key === '-') {
    event.preventDefault()
    if (key === '=') {
      // = → 自动平衡：以借方合计为基准，填入贷方，使凭证平衡
      // 例如：借方合计500，在贷方按=则贷方自动填500
      const targetAmount = props.totalDebit
      if (targetAmount > 0) {
        row.credit_amount = targetAmount
        props.onAmountChange(row, 'credit')
      }
    } else {
      // - → 互换方向：当前贷方金额移到借方，清空贷方
      const credit = row.credit_amount || 0
      if (credit > 0) {
        row.debit_amount = credit
        row.credit_amount = 0
        props.onAmountChange(row, 'debit')
      }
    }
  }
}

// 跳到下一行，最后一行则新增并自动平衡
function moveToNextRow(currentRow: VoucherEntry) {
  const idx = props.form.entries.indexOf(currentRow)
  if (idx === -1) return

  // 如果不是最后一行，跳到下一行摘要
  if (idx < props.form.entries.length - 1) {
    const nextRow = props.form.entries[idx + 1]
    // 复制摘要
    if (!nextRow.summary && currentRow.summary) {
      nextRow.summary = currentRow.summary
    }
    focusCellInput(nextRow, 0)
    return
  }

  // 是最后一行，自动平衡并新增
  autoBalance(currentRow)

  // 新增分录
  props.addEntry()
  const newRow = props.form.entries[props.form.entries.length - 1]
  // 复制摘要
  if (currentRow.summary) {
    newRow.summary = currentRow.summary
  }
  // 延迟聚焦，等 DOM 更新
  nextTick(() => {
    focusCellInput(newRow, 0)
  })
}

// 自动平衡：计算差额填入当前行
function autoBalance(row: VoucherEntry) {
  const debit = props.totalDebit
  const credit = props.totalCredit
  const diff = Math.abs(debit - credit)
  if (diff < 0.005) return // 已平衡

  const acc = props.accounts.find(a => a.id === row.account_id)
  if (!acc) return

  if (debit > credit && acc.direction === 'credit') {
    // 借方多，当前科目是贷方，自动填差额到贷方
    row.credit_amount = diff
    props.onAmountChange(row, 'credit')
  } else if (credit > debit && acc.direction === 'debit') {
    // 贷方多，当前科目是借方，自动填差额到借方
    row.debit_amount = diff
    props.onAmountChange(row, 'debit')
  }
}

// 聚焦表格指定单元格内的 input
function focusCellInput(row: VoucherEntry, colIndex: number) {
  nextTick(() => {
    const tableEl = document.querySelector('.voucher-table')
    if (!tableEl) return
    const rowIdx = props.form.entries.indexOf(row)
    if (rowIdx === -1) return
    // el-table 的行顺序
    const rows = tableEl.querySelectorAll('.el-table__body-wrapper tbody tr')
    const tr = rows[rowIdx]
    if (!tr) return
    const cells = tr.querySelectorAll('td')
    const cell = cells[colIndex]
    if (!cell) return
    const input = cell.querySelector('input') as HTMLElement
    if (input) {
      input.focus()
      input.select?.()
    }
  })
}

// ========== 会计科目智能输入（重做：基于 el-autocomplete） ==========
type AccountInputState = {
  input: string
}

type AccountSuggestion = {
  value: string
  id: string
  code: string
  name: string
  isParent: boolean
  disabled: boolean
  auxNames: string[]
}

const accountRowKeyMap = new WeakMap<object, string>()
const accountInputStateMap = ref<Record<string, AccountInputState>>({})
let accountInputSeed = 0

// 当 accounts 数据变化时，刷新已有但为空的 input state
watch(() => props.accounts, () => {
  for (const row of props.form.entries) {
    if (!row.account_id) continue
    const key = getAccountRowKey(row)
    const state = accountInputStateMap.value[key]
    if (state && !state.input) {
      const acc = props.accounts.find(a => a.id === row.account_id)
      if (acc) {
        state.input = `${acc.code} ${acc.name}`
      }
    }
  }
}, { deep: true })

// 当 form.entries 变化时（加载新凭证），重新初始化科目输入缓存
watch(() => props.form.entries, () => {
  // 清空旧缓存
  accountInputStateMap.value = {}
  // 为每个有 account_id 的行预填科目信息
  nextTick(() => {
    for (const row of props.form.entries) {
      if (!row.account_id) continue
      const key = getAccountRowKey(row)
      const acc = props.accounts.find(a => a.id === row.account_id)
      if (acc) {
        accountInputStateMap.value[key] = { input: `${acc.code} ${acc.name}` }
      }
    }
  })
})

function getAccountRowKey(row: any): string {
  const rowObject = row as object
  let key = accountRowKeyMap.get(rowObject)
  if (!key) {
    accountInputSeed += 1
    key = `voucher-account-${accountInputSeed}`
    accountRowKeyMap.set(rowObject, key)
  }
  return key
}

function ensureAccountInputState(row: any): AccountInputState {
  const key = getAccountRowKey(row)
  let state = accountInputStateMap.value[key]
  if (!state) {
    const acc = row.account_id ? props.accounts.find(a => a.id === row.account_id) : null
    state = {
      input: acc ? `${acc.code} ${acc.name}` : '',
    }
    accountInputStateMap.value[key] = state
  }
  return state
}

function getAccountInput(row: any): string {
  const key = getAccountRowKey(row)
  return accountInputStateMap.value[key]?.input ?? ''
}

function buildAccountSuggestion(acc: any): AccountSuggestion {
  const isParent = props.isParentAccount(acc.id)
  return {
    value: `${acc.code} ${acc.name}`,
    id: acc.id,
    code: acc.code,
    name: acc.name,
    isParent,
    disabled: false, // 父科目不进入列表，所以 disabled 无需设置
    auxNames: props.getAuxItemNames(acc) || [],
  }
}

function buildParentHeader(acc: any): AccountSuggestion {
  return {
    value: `__parent__${acc.id}`, // 特殊前缀，select 时识别并忽略
    id: acc.id,
    code: acc.code,
    name: acc.name,
    isParent: true,
    disabled: false,
    auxNames: [],
  }
}

function queryAccountSuggestions(
  row: any,
  queryString: string,
  cb: (items: AccountSuggestion[]) => void
) {
  const state = ensureAccountInputState(row)
  const query = (queryString || state.input || '').trim().toLowerCase()

  // 只取叶子科目（父科目不参与键盘导航）
  const leafAccounts = props.accounts.filter(a => !props.isParentAccount(a.id))
  // 父科目单独列出，用于分组标题显示
  const parentAccounts = props.accounts.filter(a => props.isParentAccount(a.id))

  if (!query) {
    // 空查询时，也显示父科目作为分组标题
    const result: AccountSuggestion[] = []
    const addedParents = new Set<string>()
    const leafSlice = leafAccounts.slice(0, 50)
    
    for (const leaf of leafSlice) {
      // 找到该叶子科目的直接父科目
      const parent = parentAccounts.find(p =>
        String(leaf.code || '').startsWith(String(p.code || '')) && leaf.id !== p.id
      )
      if (parent && !addedParents.has(parent.id)) {
        result.push(buildParentHeader(parent))
        addedParents.add(parent.id)
      }
      result.push(buildAccountSuggestion(leaf))
    }
    
    cb(result)
    return
  }

  // 匹配叶子科目
  const matchedLeaf = leafAccounts.filter(a => {
    const code = String(a.code || '').toLowerCase()
    const name = String(a.name || '').toLowerCase()
    return code.includes(query) || name.includes(query)
  })

  // 匹配父科目（只作为标题显示）
  const matchedParent = parentAccounts.filter(a => {
    const code = String(a.code || '').toLowerCase()
    const name = String(a.name || '').toLowerCase()
    return code.includes(query) || name.includes(query)
  })

  matchedLeaf.sort((a, b) => {
    const aCode = String(a.code || '').toLowerCase()
    const bCode = String(b.code || '').toLowerCase()
    const aName = String(a.name || '').toLowerCase()
    const bName = String(b.name || '').toLowerCase()

    const aCodeStarts = aCode.startsWith(query) ? 0 : 1
    const bCodeStarts = bCode.startsWith(query) ? 0 : 1
    if (aCodeStarts !== bCodeStarts) return aCodeStarts - bCodeStarts

    const aNameStarts = aName.startsWith(query) ? 0 : 1
    const bNameStarts = bName.startsWith(query) ? 0 : 1
    if (aNameStarts !== bNameStarts) return aNameStarts - bNameStarts

    return aCode.localeCompare(bCode, 'zh-CN')
  })

  // 合并：父科目标题 + 叶子科目，父科目标题插在对应叶子科目前面
  const result: AccountSuggestion[] = []
  const addedParents = new Set<string>()

  for (const leaf of matchedLeaf.slice(0, 50)) {
    // 找到该叶子科目的直接父科目
    const parent = matchedParent.find(p =>
      String(leaf.code || '').startsWith(String(p.code || '')) && leaf.id !== p.id
    )
    if (parent && !addedParents.has(parent.id)) {
      result.push(buildParentHeader(parent))
      addedParents.add(parent.id)
    }
    result.push(buildAccountSuggestion(leaf))
  }

  // 如果只匹配到父科目（没有叶子科目匹配），也显示父科目标题
  for (const parent of matchedParent) {
    if (!addedParents.has(parent.id)) {
      result.push(buildParentHeader(parent))
    }
  }

  cb(result)
}

function onAccountInputChange(row: any, val: string) {
  const state = ensureAccountInputState(row)
  state.input = val || ''

  const trimmed = state.input.trim()
  const selectedAcc = row.account_id ? props.accounts.find(a => a.id === row.account_id) : null
  const selectedDisplay = selectedAcc ? `${selectedAcc.code} ${selectedAcc.name}` : ''

  // 一旦用户开始编辑已选科目（输入值不再等于完整显示值），先解除选中状态，允许自由回退/继续输入
  if (row.account_id && trimmed !== selectedDisplay) {
    row.account_id = null
    row.account_code = ''
    row.account_name = ''
  }

  if (!trimmed) {
    row.account_id = null
    row.account_code = ''
    row.account_name = ''
    return
  }

  // 仅在“完全等于科目代码”时自动选中
  const exactCode = props.accounts.find(a => String(a.code || '') === trimmed && !props.isParentAccount(a.id))
  if (exactCode) {
    applySelectedAccount(row, exactCode)
    return
  }

  // 仅在“完全等于科目名称且唯一”时自动选中
  const exactNameMatches = props.accounts.filter(a => String(a.name || '') === trimmed && !props.isParentAccount(a.id))
  if (exactNameMatches.length === 1) {
    applySelectedAccount(row, exactNameMatches[0])
  }
}

function handleAccountSelect(row: any, item: AccountSuggestion) {
  // 父科目标题项不可选 - 多重检查确保父科目无法被选中
  if (!item) return
  if (item.isParent) return
  if (String(item.value).startsWith('__parent__')) return
  
  const acc = props.accounts.find(a => a.id === item.id)
  if (!acc) return
  if (props.isParentAccount(acc.id)) return
  
  applySelectedAccount(row, acc)
}

function applySelectedAccount(row: any, acc: any) {
  const state = ensureAccountInputState(row)
  row.account_id = acc.id
  state.input = `${acc.code} ${acc.name}`
  props.onAccountChange(row)
  props.setCurrentEntry(row)
}

function onAccountAutoFocus(row: any) {
  props.setCurrentEntry(row)
  const state = ensureAccountInputState(row)
  if (row.account_id && !state.input) {
    const acc = props.accounts.find(a => a.id === row.account_id)
    if (acc) {
      state.input = `${acc.code} ${acc.name}`
    }
  }
}

// Del 键清除科目选择
function onAccountDelete(row: any, event: KeyboardEvent) {
  // 只有在已选择科目时才处理 Del 键
  if (!row.account_id) return

  event.preventDefault()
  event.stopPropagation()

  // 清除科目选择
  row.account_id = null
  row.account_code = ''
  row.account_name = ''

  // 清除输入状态
  const state = ensureAccountInputState(row)
  state.input = ''

  // 触发科目变化处理
  props.onAccountChange(row)
}

// 上下键导航时跳过父科目
function onAccountArrowKey(row: any, event: KeyboardEvent, direction: 'up' | 'down') {
  // 使用 nextTick 确保在 autocomplete 默认行为之后执行
  event.preventDefault()

  nextTick(() => {
    const autocompleteEl = event.target as HTMLElement
    const suggestionPanel = document.querySelector('.el-autocomplete-suggestion')

    if (!suggestionPanel) return

    // 获取所有建议项
    const items = Array.from(suggestionPanel.querySelectorAll('.el-autocomplete-suggestion__list li'))
    if (items.length === 0) return

    // 找到当前高亮的项
    let currentIndex = items.findIndex(item => item.classList.contains('highlighted'))

    // 如果没有高亮项，根据方向选择第一个或最后一个非父科目项
    if (currentIndex === -1) {
      if (direction === 'down') {
        currentIndex = -1
      } else {
        currentIndex = items.length
      }
    }

    const step = direction === 'down' ? 1 : -1
    let nextIndex = currentIndex
    let attempts = 0

    // 查找下一个非父科目项
    while (attempts < items.length) {
      nextIndex += step

      // 循环边界处理
      if (nextIndex < 0) nextIndex = items.length - 1
      if (nextIndex >= items.length) nextIndex = 0

      // 检查该项是否是父科目
      const item = items[nextIndex]
      const isParent = item.querySelector('.is-parent-account') !== null

      if (!isParent) {
        // 找到非父科目项，设置高亮
        items.forEach(item => item.classList.remove('highlighted'))
        item.classList.add('highlighted')
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        break
      }

      attempts++
    }
  })
}

// 键盘快捷键
useKeyboardShortcuts([
  commonShortcuts.save(() => {
    if (visible.value) {
      emit('submit')
    }
  }),
  commonShortcuts.close(() => {
    if (visible.value) {
      handleClose()
    }
  }),
])
</script>

<style scoped>
.paper-voucher {
  border: 1px solid #dcdfe6;
  background: #fffdf7;
  padding: 20px;
}

.voucher-paper-header {
  border-bottom: 2px solid #303133;
  padding-bottom: 16px;
  margin-bottom: 16px;
}

.voucher-paper-title {
  font-size: 26px;
  letter-spacing: 8px;
  text-align: center;
  font-weight: 700;
  color: #303133;
  margin-bottom: 16px;
}

.voucher-paper-meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-label {
  width: auto;
  white-space: nowrap;
  color: #606266;
  font-size: 13px;
  flex-shrink: 0;
}

.meta-control {
  flex: 1;
  min-width: 0;
}

.meta-readonly {
  padding: 0 8px;
  border: 1px solid #dcdfe6;
  min-height: 32px;
  background: #fff;
  flex: 1;
  min-width: 0;
}

.meta-text {
  font-weight: 600;
  color: #303133;
  font-size: 13px;
}

.voucher-top-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.account-balance-display {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  padding: 4px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.balance-account {
  color: #606266;
  font-weight: 500;
}

.balance-label {
  color: #909399;
}

.balance-amount-same {
  color: #67c23a;
  font-weight: 700;
}

.balance-amount-opposite {
  color: #f56c6c;
  font-weight: 700;
}

.voucher-table-wrap {
  margin-bottom: 16px;
}

.paper-table :deep(.el-table__header-wrapper th) {
  background: #f8f1df;
  color: #303133;
}

.paper-table :deep(.el-table__footer) {
  font-weight: bold;
}

.entry-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.voucher-paper-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.voucher-balance {
  padding: 10px 14px;
  border-radius: 4px;
  font-weight: 600;
}

.voucher-balance.balanced {
  color: #67c23a;
  background: #f0f9eb;
}

.voucher-balance.unbalanced {
  color: #f56c6c;
  background: #fef0f0;
}

.divider {
  margin: 0 10px;
  color: #909399;
}

.voucher-aux-panel {
  margin-bottom: 18px;
  border: 1px solid #e4e7ed;
  background: #fff;
  padding: 16px;
}

.voucher-aux-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  font-weight: 600;
}

.voucher-aux-summary {
  font-size: 13px;
  color: #606266;
  font-weight: 400;
}

.voucher-aux-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.voucher-aux-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.voucher-aux-row-label {
  color: #606266;
  font-size: 13px;
  font-weight: 500;
  min-width: 56px;
  flex-shrink: 0;
}

.voucher-aux-row-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.voucher-aux-field-name {
  color: #909399;
  font-size: 12px;
  white-space: nowrap;
}

.voucher-paper-remark {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.remark-label {
  width: 48px;
  color: #606266;
  flex-shrink: 0;
}

.voucher-paper-signatures {
  display: flex;
  justify-content: space-between;
  border-top: 1px dashed #c0c4cc;
  padding-top: 16px;
}

.signature-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
}

.signature-item span {
  font-size: 13px;
  white-space: nowrap;
}

.signature-item em {
  font-style: normal;
  font-size: 14px;
  min-width: 80px;
  border-bottom: 1px solid #909399;
  padding: 0 4px 2px;
  text-align: center;
  display: inline-block;
  line-height: 20px;
  height: 20px;
}

.voucher-attachments-container {
  margin-bottom: 18px;
}

.attachment-inline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.attachment-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #606266;
}

.attachment-tag {
  cursor: pointer;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-content {
  text-align: center;
}

.dialog-footer-enhanced {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.navigation-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.navigation-info {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.action-controls {
  display: flex;
  justify-content: center;
}

.submit-controls {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.account-suggestion-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-height: 24px;
}

.account-suggestion-item.is-parent-account {
  pointer-events: none;
  user-select: none;
}

:deep(.el-table__body-wrapper) {
  overflow: visible !important;
}

:deep(.el-table__body-wrapper .el-table__body) {
  overflow: visible !important;
}

:deep(.el-autocomplete-suggestion li) {
  white-space: normal;
  line-height: 1.5;
}

:deep(.el-autocomplete-suggestion li:has(.is-parent-account)) {
  pointer-events: none;
  cursor: not-allowed;
}
</style>
