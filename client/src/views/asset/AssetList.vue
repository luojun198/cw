<template>
  <div class="page page-asset-list">
    <div class="page-header">
      <h3>固定资产卡片</h3>
      <div class="filter-row">
        <el-input v-model="filters.keyword" placeholder="编号/名称" clearable style="width:160px" @keyup.enter="handleQuery" />
        <el-select v-model="filters.category_code" placeholder="类别" clearable style="width:130px">
          <el-option v-for="c in dicts.category" :key="c.code" :label="c.name" :value="c.code" />
        </el-select>
        <el-select v-model="filters.status_code" placeholder="状态" clearable style="width:110px">
          <el-option v-for="s in dicts.status" :key="s.code" :label="s.name" :value="s.code" />
        </el-select>
        <el-select v-model="filters.dept_code" placeholder="部门" clearable style="width:110px">
          <el-option v-for="d in dicts.dept" :key="d.code" :label="d.name" :value="d.code" />
        </el-select>
        <el-button type="primary" @click="handleQuery"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="openAdd"><el-icon><Plus /></el-icon>新增</el-button>
        <el-button plain @click="$router.push('/asset/dict')"><el-icon><Setting /></el-icon>资产档案</el-button>
      </div>
    </div>

    <div ref="tableContainerRef" class="table-container">
      <el-table ref="tableRef" :data="list" :height="tableHeight" border stripe size="small"
        highlight-current-row @row-dblclick="openEdit">
        <el-table-column label="资产编号" prop="asset_no" width="120" />
        <el-table-column label="资产名称" prop="asset_name" min-width="150" show-overflow-tooltip />
        <el-table-column label="类别" prop="category_name" width="100" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status_code)" size="small">{{ row.status_name || row.status_code }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用部门" prop="dept_name" width="110" />
        <el-table-column label="购置日期" prop="acquire_date" width="105" />
        <el-table-column label="原值" prop="original_value" width="110" align="right">
          <template #default="{ row }">{{ fmtAmt(row.original_value) }}</template>
        </el-table-column>
        <el-table-column label="累计折旧" prop="accum_depr" width="110" align="right">
          <template #default="{ row }">{{ fmtAmt(row.accum_depr) }}</template>
        </el-table-column>
        <el-table-column label="净值" prop="net_value" width="110" align="right">
          <template #default="{ row }">{{ fmtAmt(row.net_value) }}</template>
        </el-table-column>
        <el-table-column label="折旧方法" prop="depr_method" width="110">
          <template #default="{ row }">{{ DEPR_METHODS[row.depr_method] || row.depr_method }}</template>
        </el-table-column>
        <el-table-column label="已提月数" prop="depr_months_done" width="80" align="center" />
        <el-table-column label="使用人" prop="user_name" width="90" />
        <el-table-column label="操作" width="190" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="success" size="small" @click.stop="$router.push(`/asset/detail/${row.id}`)">明细</el-button>
            <el-button link type="primary" size="small" @click.stop="openEdit(row)">编辑</el-button>
            <el-button v-if="!row.scrap_date" link type="warning" size="small" @click.stop="openDispose(row)">处置</el-button>
            <el-button link type="danger" size="small" @click.stop="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="table-footer">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @change="handleQuery"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑固定资产' : '新增固定资产'" width="760px" draggable>
      <el-form :model="form" label-width="90px" size="small">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="资产编号" required>
              <el-input v-model="form.asset_no" :disabled="!!editId" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="资产名称" required>
              <el-input v-model="form.asset_name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="资产类别">
              <el-select v-model="form.category_code" clearable style="width:100%"
                @change="onCategoryChange">
                <el-option v-for="c in dicts.category" :key="c.code" :label="c.name" :value="c.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="资产状态">
              <el-select v-model="form.status_code" clearable style="width:100%">
                <el-option v-for="s in dicts.status" :key="s.code" :label="s.name" :value="s.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="使用部门">
              <el-select v-model="form.dept_code" clearable style="width:100%">
                <el-option v-for="d in dicts.dept" :key="d.code" :label="d.name" :value="d.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用途">
              <el-select v-model="form.purpose_code" clearable style="width:100%">
                <el-option v-for="p in dicts.purpose" :key="p.code" :label="p.name" :value="p.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="购置日期">
              <el-date-picker v-model="form.acquire_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="起折日期">
              <el-date-picker v-model="form.start_depr_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="原值">
              <el-input-number v-model="form.original_value" :precision="2" :min="0" style="width:100%" @change="calcSalvage" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="残值率(%)">
              <el-input-number v-model="form.salvage_rate" :precision="2" :min="0" :max="100" style="width:100%" @change="calcSalvage" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计净残值">
              <el-input-number v-model="form.salvage_value" :precision="2" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="折旧方法">
              <el-select v-model="form.depr_method" clearable style="width:100%">
                <el-option v-for="(label, val) in DEPR_METHODS" :key="val" :label="label" :value="val" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="使用月数">
              <el-input-number v-model="form.use_months" :min="1" :precision="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="卡片号">
              <el-input v-model="form.card_no" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="数量">
              <el-input-number v-model="form.qty" :min="1" :precision="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="计量单位">
              <el-input v-model="form.unit" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="使用人">
              <el-input v-model="form.user_name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="保管人">
              <el-input v-model="form.keeper" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="安装地点">
              <el-input v-model="form.install_place" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 资产处置弹窗 -->
    <el-dialog v-model="disposeVisible" title="资产处置" width="560px" draggable>
      <div class="dispose-info" v-if="disposeAsset">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="资产编号">{{ disposeAsset.asset_no }}</el-descriptions-item>
          <el-descriptions-item label="资产名称">{{ disposeAsset.asset_name }}</el-descriptions-item>
          <el-descriptions-item label="原值">¥{{ fmtAmt(disposeAsset.original_value) }}</el-descriptions-item>
          <el-descriptions-item label="累计折旧">¥{{ fmtAmt(disposeAsset.accum_depr) }}</el-descriptions-item>
          <el-descriptions-item label="净值" :span="2">
            <b>¥{{ fmtAmt(disposeAsset.net_value) }}</b>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <el-form :model="disposeForm" label-width="100px" size="small" style="margin-top:14px">
        <el-form-item label="减少方式">
          <el-select v-model="disposeForm.change_type_code" clearable style="width:100%">
            <el-option v-for="c in disposeTypes" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="处置日期" required>
          <el-date-picker v-model="disposeForm.scrap_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="处置原因">
          <el-input v-model="disposeForm.scrap_reason" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="处置收入">
          <el-input-number v-model="disposeForm.disposal_income" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="处置费用">
          <el-input-number v-model="disposeForm.disposal_expense" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="生成凭证">
          <el-switch v-model="disposeForm.generate_voucher" />
          <span class="tip-text" v-if="disposeForm.generate_voucher">自动生成固定资产清理凭证</span>
        </el-form-item>
        <el-divider v-if="disposeForm.generate_voucher" />
        <el-form-item v-if="disposeForm.generate_voucher" label="清理科目">
          <el-input v-model="disposeForm.clearing_account" placeholder="1606" style="width:140px" />
        </el-form-item>
      </el-form>
      <!-- 处置预览 -->
      <div v-if="disposeAsset" class="dispose-preview">
        <span>净值：<b>¥{{ fmtAmt(disposeAsset.net_value) }}</b></span>
        <el-divider direction="vertical" />
        <span>处置损益：<b :class="disposePreviewGainLoss >= 0 ? 'incr' : 'decr'">
          {{ disposePreviewGainLoss >= 0 ? '+' : '' }}¥{{ fmtAmt(Math.abs(disposePreviewGainLoss)) }}
        </b></span>
      </div>
      <template #footer>
        <el-button @click="disposeVisible = false">取消</el-button>
        <el-button type="warning" :loading="disposing" @click="handleDispose">确认处置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Setting } from '@element-plus/icons-vue'
import { fixedAssetApi, type AssetCard, type AssetDicts, DEPR_METHODS } from '@/api/fixedAsset'
import { useFillHeightTable } from '@/composables/useFillHeightTable'

const { tableRef, containerRef: tableContainerRef, tableHeight } = useFillHeightTable()

const list = ref<AssetCard[]>([])
const dicts = ref<AssetDicts>({ category: [], status: [], purpose: [], dept: [] })
const filters = reactive({ keyword: '', category_code: '', status_code: '', dept_code: '' })
const pagination = reactive({ page: 1, page_size: 20, total: 0 })

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const form = ref<Partial<AssetCard>>({})

const fmtAmt = (v: number) =>
  v == null || v === 0 ? '0.00' : v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const statusTagType = (code: string | null) => {
  const map: Record<string, string> = { '01': 'success', '02': 'warning', '03': 'info', '04': 'danger' }
  return (map[code ?? ''] ?? 'info') as any
}

onMounted(async () => {
  const res = await fixedAssetApi.getDicts()
  if (res.code === 0) dicts.value = res.data
  handleQuery()
})

async function handleQuery() {
  const res = await fixedAssetApi.getCards({
    keyword: filters.keyword || undefined,
    category_code: filters.category_code || undefined,
    status_code: filters.status_code || undefined,
    dept_code: filters.dept_code || undefined,
    page: pagination.page,
    page_size: pagination.page_size,
  })
  if (res.code === 0) {
    list.value = res.data.list
    pagination.total = res.data.total
  }
}

function openAdd() {
  editId.value = null
  form.value = { original_value: 0, salvage_rate: 5, salvage_value: 0, qty: 1, depr_method: '1' }
  dialogVisible.value = true
}

function openEdit(row: AssetCard) {
  editId.value = row.id
  form.value = { ...row }
  dialogVisible.value = true
}

function onCategoryChange(code: string) {
  const cat = dicts.value.category.find(c => c.code === code)
  if (cat?.salvage_rate != null) {
    form.value.salvage_rate = cat.salvage_rate
    calcSalvage()
  }
}

function calcSalvage() {
  const ov = form.value.original_value ?? 0
  const rate = (form.value.salvage_rate ?? 0) / 100
  form.value.salvage_value = Math.round(ov * rate * 100) / 100
}

async function handleSave() {
  if (!form.value.asset_no || !form.value.asset_name) return ElMessage.warning('请填写资产编号和名称')
  saving.value = true
  try {
    if (editId.value) {
      await fixedAssetApi.updateCard(editId.value, form.value)
    } else {
      await fixedAssetApi.createCard(form.value)
    }
    dialogVisible.value = false
    handleQuery()
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: AssetCard) {
  await ElMessageBox.confirm(`确认删除资产「${row.asset_name}」？`, '提示', { type: 'warning' })
  await fixedAssetApi.deleteCard(row.id)
  ElMessage.success('已删除')
  handleQuery()
}

// ── 处置 ──────────────────────────────────────────────
const disposeVisible = ref(false)
const disposing = ref(false)
const disposeAsset = ref<AssetCard | null>(null)
const disposeTypes = ref<{ code: string; name: string }[]>([])
const disposeForm = ref({
  change_type_code: '',
  scrap_date: '',
  scrap_reason: '',
  disposal_income: 0,
  disposal_expense: 0,
  generate_voucher: false,
  accum_account: '1602',
  clearing_account: '1606',
})

const disposePreviewGainLoss = computed(() => {
  if (!disposeAsset.value) return 0
  return Math.round((disposeForm.value.disposal_income - disposeForm.value.disposal_expense - disposeAsset.value.net_value) * 100) / 100
})

function openDispose(row: AssetCard) {
  disposeAsset.value = row
  const today = new Date().toISOString().slice(0, 10)
  disposeForm.value = {
    change_type_code: '',
    scrap_date: today,
    scrap_reason: '',
    disposal_income: 0,
    disposal_expense: 0,
    generate_voucher: false,
    accum_account: '1602',
    clearing_account: '1606',
  }
  // 加载减少方式
  loadDisposeTypes()
  disposeVisible.value = true
}

async function loadDisposeTypes() {
  if (disposeTypes.value.length) return
  const res = await fixedAssetApi.getDict('change_type')
  if (res.code === 0) {
    disposeTypes.value = (res.data as any[]).filter((d: any) => d.direction === 'decrease')
  }
}

async function handleDispose() {
  if (!disposeAsset.value) return
  if (!disposeForm.value.scrap_date) return ElMessage.warning('请选择处置日期')
  await ElMessageBox.confirm(
    `确认处置资产「${disposeAsset.value.asset_name}」？处置后将标记为已减少，${disposeForm.value.generate_voucher ? '并生成清理凭证。' : '此操作不可撤销。'}`,
    '处置确认', { type: 'warning' }
  )
  disposing.value = true
  try {
    const res = await fixedAssetApi.disposeAsset(disposeAsset.value.id, disposeForm.value)
    if (res.code === 0) {
      disposeVisible.value = false
      ElMessage.success('处置成功')
      if (res.data.voucher) {
        ElMessage.success(`已生成清理凭证 ${res.data.voucher.voucherNo || ''}`)
      }
      handleQuery()
    }
  } finally {
    disposing.value = false
  }
}
</script>

<style scoped>
.page-asset-list { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.table-container { flex: 1; overflow: hidden; padding: 0 16px 0; }
.table-footer { padding: 8px 16px; display: flex; justify-content: flex-end; border-top: 1px solid var(--el-border-color-lighter); }
.dispose-info { margin-bottom: 4px; }
.dispose-preview { display: flex; align-items: center; gap: 4px; padding: 8px 12px; background: var(--el-color-warning-light-9); border-radius: 4px; font-size: 14px; margin-top: 8px; }
.tip-text { margin-left: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.incr { color: #67c23a; font-weight: 600; }
.decr { color: #f56c6c; font-weight: 600; }
</style>
