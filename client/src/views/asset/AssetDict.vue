<template>
  <div class="page page-asset-dict">
    <div class="page-header">
      <h3>固定资产档案维护</h3>
    </div>

    <div class="dict-body">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="资产类别" name="category">
          <DictPanel
            title="资产类别"
            :rows="dicts.category"
            :columns="categoryColumns"
            @add="openAdd('category')"
            @edit="row => openEdit('category', row)"
            @delete="row => handleDelete('category', row)"
          />
        </el-tab-pane>
        <el-tab-pane label="资产状态" name="status">
          <DictPanel
            title="资产状态"
            :rows="dicts.status"
            :columns="statusColumns"
            @add="openAdd('status')"
            @edit="row => openEdit('status', row)"
            @delete="row => handleDelete('status', row)"
          />
        </el-tab-pane>
        <el-tab-pane label="资产用途" name="purpose">
          <DictPanel
            title="资产用途"
            :rows="dicts.purpose"
            :columns="purposeColumns"
            @add="openAdd('purpose')"
            @edit="row => openEdit('purpose', row)"
            @delete="row => handleDelete('purpose', row)"
          />
        </el-tab-pane>
        <el-tab-pane label="使用部门" name="dept">
          <DictPanel
            title="使用部门"
            :rows="dicts.dept"
            :columns="deptColumns"
            @add="openAdd('dept')"
            @edit="row => openEdit('dept', row)"
            @delete="row => handleDelete('dept', row)"
          />
        </el-tab-pane>
        <el-tab-pane label="增减方式" name="change_type">
          <DictPanel
            title="增减方式"
            :rows="dicts.change_type"
            :columns="changeTypeColumns"
            @add="openAdd('change_type')"
            @edit="row => openEdit('change_type', row)"
            @delete="row => handleDelete('change_type', row)"
          />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 通用编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editRow ? '编辑' : '新增'" width="480px" draggable>
      <el-form :model="form" label-width="100px" size="small">
        <el-form-item label="编码" required>
          <el-input v-model="form.code" :disabled="!!editRow" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <template v-if="activeTab === 'category'">
          <el-form-item label="默认残值率(%)">
            <el-input-number v-model="form.salvage_rate" :precision="2" :min="0" :max="100" style="width:100%" />
          </el-form-item>
          <el-form-item label="资产科目">
            <el-input v-model="form.account_code" placeholder="如 1601" />
          </el-form-item>
        </template>
        <template v-if="activeTab === 'status'">
          <el-form-item label="计提折旧">
            <el-switch v-model="form.depreciable" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </template>
        <template v-if="activeTab === 'purpose'">
          <el-form-item label="折旧费用科目">
            <el-input v-model="form.expense_account" placeholder="如 660201" />
          </el-form-item>
        </template>
        <template v-if="activeTab === 'change_type'">
          <el-form-item label="方向" required>
            <el-select v-model="form.direction" style="width:100%">
              <el-option label="增加方式" value="increase" />
              <el-option label="减少方式" value="decrease" />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineComponent, h } from 'vue'
import { ElMessage, ElMessageBox, ElTable, ElTableColumn, ElButton } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { fixedAssetApi, type AssetDicts } from '@/api/fixedAsset'

// 内联 DictPanel 子组件
const DictPanel = defineComponent({
  props: { rows: Array, columns: Array, title: String },
  emits: ['add', 'edit', 'delete'],
  setup(props, { emit }) {
    return () =>
      h('div', { class: 'dict-panel' }, [
        h('div', { class: 'dict-panel-toolbar' }, [
          h(ElButton, { type: 'primary', size: 'small', onClick: () => emit('add') }, () => [h(Plus), ' 新增']),
        ]),
        h(ElTable, { data: props.rows, size: 'small', border: true, style: 'width:100%', maxHeight: 400 }, {
          default: () => [
            ...(props.columns as any[]).map(col =>
              h(ElTableColumn, { label: col.label, prop: col.prop, width: col.width, align: col.align })
            ),
            h(ElTableColumn, { label: '操作', width: 120, align: 'center' }, {
              default: ({ row }: any) => h('div', [
                h(ElButton, { link: true, type: 'primary', size: 'small', onClick: () => emit('edit', row) }, () => '编辑'),
                h(ElButton, { link: true, type: 'danger', size: 'small', onClick: () => emit('delete', row) }, () => '删除'),
              ]),
            }),
          ],
        }),
      ])
  },
})

const activeTab = ref('category')
const dicts = ref<AssetDicts>({ category: [], status: [], purpose: [], dept: [], change_type: [] })
const dialogVisible = ref(false)
const editRow = ref<any>(null)
const saving = ref(false)
const form = ref<any>({})

const categoryColumns = [
  { label: '编码', prop: 'code', width: 100 },
  { label: '名称', prop: 'name', width: 150 },
  { label: '默认残值率(%)', prop: 'salvage_rate', width: 130, align: 'right' },
  { label: '资产科目', prop: 'account_code', width: 120 },
]
const statusColumns = [
  { label: '编码', prop: 'code', width: 100 },
  { label: '名称', prop: 'name', width: 150 },
  { label: '计提折旧', prop: 'depreciable', width: 100 },
]
const purposeColumns = [
  { label: '编码', prop: 'code', width: 100 },
  { label: '名称', prop: 'name', width: 150 },
  { label: '折旧费用科目', prop: 'expense_account', width: 130 },
]
const deptColumns = [
  { label: '编码', prop: 'code', width: 100 },
  { label: '名称', prop: 'name', width: 200 },
]
const changeTypeColumns = [
  { label: '编码', prop: 'code', width: 100 },
  { label: '名称', prop: 'name', width: 180 },
  { label: '方向', prop: 'direction', width: 100 },
]

onMounted(async () => {
  const res = await fixedAssetApi.getDicts()
  if (res.code === 0) dicts.value = res.data
})

async function reload() {
  const res = await fixedAssetApi.getDicts()
  if (res.code === 0) dicts.value = res.data
}

function openAdd(type: string) {
  activeTab.value = type
  editRow.value = null
  form.value = type === 'change_type' ? { direction: 'increase' } : { salvage_rate: 0, depreciable: 1 }
  dialogVisible.value = true
}

function openEdit(type: string, row: any) {
  activeTab.value = type
  editRow.value = row
  form.value = { ...row }
  dialogVisible.value = true
}

async function handleDelete(type: string, row: any) {
  await ElMessageBox.confirm(`确认删除「${row.name}」？`, '提示', { type: 'warning' })
  await fixedAssetApi.deleteDict(type, row.id)
  ElMessage.success('已删除')
  reload()
}

async function handleSave() {
  if (!form.value.code || !form.value.name) return ElMessage.warning('编码和名称不能为空')
  saving.value = true
  try {
    if (editRow.value) {
      await fixedAssetApi.updateDict(activeTab.value, editRow.value.id, form.value)
    } else {
      await fixedAssetApi.createDict(activeTab.value, form.value)
    }
    dialogVisible.value = false
    reload()
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page-asset-dict { display: flex; flex-direction: column; height: 100%; }
.page-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--el-border-color-light); }
.page-header h3 { margin: 0 0 8px; font-size: 15px; }
.dict-body { flex: 1; overflow: auto; padding: 16px; }
.dict-panel-toolbar { margin-bottom: 8px; }
</style>
