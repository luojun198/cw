<template>
  <div class="page scm-item-page">
    <div class="page-header">
      <div class="item-title">
        <h3>物料档案</h3>
        <span>{{ itemCountLabel }}</span>
      </div>
      <div class="item-toolbar">
        <el-button-group class="level-actions" size="small">
          <el-button title="全部收拢 (Ctrl+\)" @click="collapseAll">顶层</el-button>
          <el-button title="上一级 (Ctrl+↑)" @click="goUpLevel">上级</el-button>
          <el-button title="下一级 (Ctrl+↓)" @click="goDownLevel">下级</el-button>
          <el-button title="全部展开 (Ctrl+Shift+\)" @click="expandAll">底层</el-button>
        </el-button-group>

        <el-input
          v-model="filters.keyword"
          placeholder="搜索编号/名称/规格"
          class="item-search"
          size="small"
          clearable
          @input="onSearchInput"
          @clear="onSearchClear"
        />

        <el-select v-model="filters.item_type" placeholder="属性" clearable size="small" style="width:110px" @change="load">
          <el-option v-for="(n, k) in dynamicItemTypes" :key="k" :label="n" :value="k" />
        </el-select>

        <el-select v-model="filters.is_leaf" placeholder="目录/明细" clearable size="small" style="width:100px" @change="load">
          <el-option label="明细" :value="1" />
          <el-option label="目录" :value="0" />
        </el-select>

        <el-popover placement="bottom" :width="200" trigger="click">
          <template #reference>
            <el-button size="small" circle title="列显示设置">
              <el-icon><Setting /></el-icon>
            </el-button>
          </template>
          <div style="max-height: 400px; overflow-y: auto">
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid #eee; padding-bottom: 4px">显示列设置</div>
            <div v-for="col in allColumnSettings" :key="col.prop" style="margin-bottom: 4px">
              <el-checkbox v-model="colVisible[col.prop]" @change="saveColumnConfig">
                {{ col.label }}
              </el-checkbox>
            </div>
          </div>
        </el-popover>

        <el-button size="small" @click="openFieldConfig">字段配置</el-button>

        <el-dropdown trigger="click" @command="handleAddCommand">
          <el-button type="primary" size="small">
            <el-icon><Plus /></el-icon>
            新增物料
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="sibling">增加同级物料</el-dropdown-item>
              <el-dropdown-item command="child" :disabled="!currentRow">
                增加子物料
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 树形模式 -->
    <el-table
      v-if="!hasSearch"
      ref="tableRef"
      :data="treeData"
      v-loading="loading"
      row-key="id"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :expand-row-keys="expandedKeys"
      border stripe size="small"
      highlight-current-row
      height="100%"
      :row-style="{ height: '30px' }"
      :cell-style="{ padding: '0' }"
      :header-cell-style="{ padding: '4px 0' }"
      class="item-table"
      @expand-change="handleExpandChange"
      @current-change="handleCurrentChange"
      @row-dblclick="(row: any) => openEdit(row)"
      @header-dragend="onDragEnd"
    >
      <el-table-column v-if="colVisible['code']" label="编号" prop="code" :width="colWidth('code', 140)">
        <template #default="{ row }">
          <span
            :style="{ paddingLeft: `${((row.level || 1) - 1) * 14}px`, display: 'inline-block' }"
            class="item-code"
          >{{ row.code }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="colVisible['name']" label="名称" prop="name" :width="colWidth('name', 180)" show-overflow-tooltip>
        <template #default="{ row }">
          <span
            :style="{ paddingLeft: `${((row.level || 1) - 1) * 14}px`, display: 'inline-block' }"
            class="item-name"
          >{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="colVisible['spec']" label="规格" prop="spec" :width="colWidth('spec', 110)" show-overflow-tooltip />
      <el-table-column v-if="colVisible['unit']" label="单位" column-key="unit" :width="colWidth('unit', 70)">
        <template #default="{ row }">{{ row.unit_name || row.unit }}</template>
      </el-table-column>
      <el-table-column v-if="colVisible['item_type']" label="属性" prop="item_type" :width="colWidth('item_type', 90)">
        <template #default="{ row }">{{ dynamicItemTypes[row.item_type] || row.item_type }}</template>
      </el-table-column>
      <el-table-column v-if="colVisible['is_leaf']" label="性质" prop="is_leaf" :width="colWidth('is_leaf', 68)" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_leaf !== 0 ? '' : 'info'" size="small" effect="plain">
            {{ row.is_leaf !== 0 ? '明细' : '目录' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="colVisible['purchase_price']" label="进价" prop="purchase_price" :width="colWidth('purchase_price', 90)" align="right" />
      <el-table-column v-if="colVisible['sale_price']" label="售价" prop="sale_price" :width="colWidth('sale_price', 90)" align="right" />
      <el-table-column v-if="colVisible['barcode']" label="条码" prop="barcode" :width="colWidth('barcode', 120)" show-overflow-tooltip />
      <el-table-column v-if="colVisible['short_code']" label="简码" prop="short_code" :width="colWidth('short_code', 100)" show-overflow-tooltip />
      <el-table-column v-if="colVisible['is_asset']" label="资产" prop="is_asset" :width="colWidth('is_asset', 52)" align="center">
        <template #default="{ row }">
          <span v-if="row.is_asset" class="mini-flag">资</span>
        </template>
      </el-table-column>
      
      <template v-for="field in activeFieldDefs" :key="field.field_key">
        <el-table-column
          v-if="colVisible['field_' + field.field_key]"
          :label="field.field_name"
          :prop="'field_values.' + field.field_key"
          :width="colWidth('field_' + field.field_key, 100)"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ (row.field_values || {})[field.field_key] }}
          </template>
        </el-table-column>
      </template>

      <el-table-column v-if="colVisible['remark']" label="备注" prop="remark" :width="colWidth('remark', 150)" show-overflow-tooltip />
      
      <el-table-column label="操作" column-key="actions" :width="colWidth('actions', 100)" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 搜索模式：扁平列表 -->
    <el-table
      v-else
      ref="tableRef"
      :data="list"
      v-loading="loading"
      border stripe size="small"
      highlight-current-row
      height="100%"
      :row-style="{ height: '30px' }"
      :cell-style="{ padding: '0' }"
      :header-cell-style="{ padding: '4px 0' }"
      class="item-table"
      @current-change="handleCurrentChange"
      @row-dblclick="(row: any) => openEdit(row)"
      @header-dragend="onDragEnd"
    >
      <el-table-column v-if="colVisible['code']" label="编号" prop="code" :width="colWidth('code', 140)">
        <template #default="{ row }"><span class="item-code">{{ row.code }}</span></template>
      </el-table-column>
      <el-table-column v-if="colVisible['name']" label="名称" prop="name" :width="colWidth('name', 180)" show-overflow-tooltip>
        <template #default="{ row }"><span class="item-name">{{ row.name }}</span></template>
      </el-table-column>
      <el-table-column v-if="colVisible['spec']" label="规格" prop="spec" :width="colWidth('spec', 110)" show-overflow-tooltip />
      <el-table-column v-if="colVisible['unit']" label="单位" column-key="unit" :width="colWidth('unit', 70)">
        <template #default="{ row }">{{ row.unit_name || row.unit }}</template>
      </el-table-column>
      <el-table-column v-if="colVisible['item_type']" label="属性" prop="item_type" :width="colWidth('item_type', 90)">
        <template #default="{ row }">{{ dynamicItemTypes[row.item_type] || row.item_type }}</template>
      </el-table-column>
      <el-table-column v-if="colVisible['is_leaf']" label="性质" prop="is_leaf" :width="colWidth('is_leaf', 68)" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_leaf !== 0 ? '' : 'info'" size="small" effect="plain">
            {{ row.is_leaf !== 0 ? '明细' : '目录' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column v-if="colVisible['purchase_price']" label="进价" prop="purchase_price" :width="colWidth('purchase_price', 90)" align="right" />
      <el-table-column v-if="colVisible['sale_price']" label="售价" prop="sale_price" :width="colWidth('sale_price', 90)" align="right" />
      <el-table-column v-if="colVisible['barcode']" label="条码" prop="barcode" :width="colWidth('barcode', 120)" show-overflow-tooltip />
      <el-table-column v-if="colVisible['short_code']" label="简码" prop="short_code" :width="colWidth('short_code', 100)" show-overflow-tooltip />
      <el-table-column v-if="colVisible['is_asset']" label="资产" prop="is_asset" :width="colWidth('is_asset', 52)" align="center">
        <template #default="{ row }">
          <span v-if="row.is_asset" class="mini-flag">资</span>
        </template>
      </el-table-column>

      <template v-for="field in activeFieldDefs" :key="field.field_key">
        <el-table-column
          v-if="colVisible['field_' + field.field_key]"
          :label="field.field_name"
          :prop="'field_values.' + field.field_key"
          :width="colWidth('field_' + field.field_key, 100)"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ (row.field_values || {})[field.field_key] }}
          </template>
        </el-table-column>
      </template>

      <el-table-column v-if="colVisible['remark']" label="备注" prop="remark" :width="colWidth('remark', 150)" show-overflow-tooltip />

      <el-table-column label="操作" column-key="actions" :width="colWidth('actions', 100)" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editId ? '编辑物料' : '新增物料'"
      width="640px"
      draggable
      @keydown="onDialogKeydown"
    >
      <el-form :model="form" label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="上级物料">
              <el-tree-select
                v-model="form.parent_id"
                :data="treeSelectData"
                :props="{ value: 'id', label: 'displayLabel', children: 'children' }"
                check-strictly filterable clearable
                placeholder="不选则为顶级"
                style="width:100%"
                @change="onParentChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="物料性质">
              <el-radio-group v-model="form.is_leaf">
                <el-radio :value="1">明细（可调用）</el-radio>
                <el-radio :value="0">目录（仅分类）</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="编号" required>
              <el-input v-model="form.code" :disabled="!!editId">
                <template v-if="!editId" #append>{{ expectedCodeLen }}位</template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称" required>
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格">
              <el-input v-model="form.spec" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="主单位" required>
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.primary_unit_code" filterable placeholder="选择单位" style="flex:1" clearable>
                  <el-option v-for="u in unitOptions" :key="u.code" :label="u.name" :value="u.code" />
                </el-select>
                <el-button size="small" @click="showQuickUnit = true"><el-icon><Plus /></el-icon></el-button>
              </div>
              <div v-if="showQuickUnit" style="display:flex;gap:4px;margin-top:4px">
                <el-input v-model="quickUnitName" placeholder="新单位名称" size="small" style="width:100px" @keyup.enter="handleQuickAddUnit" />
                <el-button type="primary" size="small" :loading="quickUnitSaving" @click="handleQuickAddUnit">确定</el-button>
                <el-button size="small" @click="showQuickUnit = false">取消</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="副单位">
              <div v-for="(su, i) in form.secondary_units" :key="i" style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <el-select v-model="su.unit_code" filterable placeholder="单位" style="width:140px">
                  <el-option v-for="u in unitOptions" :key="u.code" :label="u.name" :value="u.code" />
                </el-select>
                <span style="font-size:12px;white-space:nowrap">1 主单位 =</span>
                <el-input-number v-model="su.conversion_rate" :min="0.0001" :precision="4" :controls="false" style="width:100px" placeholder="系数" />
                <span style="font-size:12px;white-space:nowrap">副单位</span>
                <el-button link type="danger" size="small" @click="removeSecondaryUnit(i)">×</el-button>
              </div>
              <el-button size="small" @click="addSecondaryUnit">+ 添加副单位</el-button>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="属性">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.item_type" clearable style="flex:1">
                  <el-option v-for="(n, k) in dynamicItemTypes" :key="k" :label="n" :value="k" />
                </el-select>
                <el-button size="small" @click="showQuickAttr = true"><el-icon><Plus /></el-icon></el-button>
              </div>
              <div v-if="showQuickAttr" style="display:flex;gap:4px;margin-top:4px">
                <el-input v-model="quickAttrName" placeholder="新属性名称" size="small" style="width:100px" @keyup.enter="handleQuickAddAttr" />
                <el-button type="primary" size="small" :loading="quickAttrSaving" @click="handleQuickAddAttr">确定</el-button>
                <el-button size="small" @click="showQuickAttr = false">取消</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="条码">
              <el-input v-model="form.barcode" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="进价">
              <el-input-number v-model="form.purchase_price" :precision="4" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="售价">
              <el-input-number v-model="form.sale_price" :precision="4" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="指定成本">
              <el-input-number v-model="form.fixed_cost" :precision="4" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="存货科目">
              <AccountSelect v-model="form.inv_account" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="销售科目">
              <AccountSelect v-model="form.sale_account" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="批号管理">
              <el-switch v-model="form.batch_flag" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="采购生成资产">
              <el-switch v-model="form.is_asset" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
          <!-- 自定义扩展信息 -->
          <template v-if="activeFieldDefs.length > 0">
            <el-col :span="24">
              <el-divider content-position="left" style="margin:4px 0 8px">扩展信息</el-divider>
            </el-col>
            <el-col v-for="field in activeFieldDefs" :key="field.field_key" :span="12">
              <el-form-item :label="field.field_name">
                <el-input
                  v-if="field.field_type === 'text'"
                  v-model="(form.field_values as any)[field.field_key]"
                />
                <el-input-number
                  v-else-if="field.field_type === 'number'"
                  v-model="(form.field_values as any)[field.field_key]"
                  :controls="false"
                  style="width:100%"
                />
                <el-date-picker
                  v-else-if="field.field_type === 'date'"
                  v-model="(form.field_values as any)[field.field_key]"
                  type="date"
                  value-format="YYYY-MM-DD"
                  style="width:100%"
                />
                <el-select
                  v-else-if="field.field_type === 'select'"
                  v-model="(form.field_values as any)[field.field_key]"
                  clearable
                  style="width:100%"
                >
                  <el-option
                    v-for="opt in parseFieldOptions(field.options_json)"
                    :key="opt"
                    :label="opt"
                    :value="opt"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </template>

          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-if="!editId" :loading="saving" @click="handleSave(true)">
            保存并新增 (Ctrl+Enter)
          </el-button>
          <el-button type="primary" :loading="saving" @click="handleSave(false)">
            保存 (Enter)
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 字段配置弹窗 -->
    <el-dialog v-model="fieldConfigVisible" title="物料自定义字段配置" width="680px" draggable>
      <el-table :data="fieldDefsEdit" border size="small" style="width:100%">
        <el-table-column label="字段编码" width="150">
          <template #default="{ row }">
            <el-input
              v-model="row.field_key"
              :disabled="!!row._persisted"
              placeholder="自动生成"
              size="small"
            />
          </template>
        </el-table-column>
        <el-table-column label="字段名称" min-width="120">
          <template #default="{ row }">
            <el-input v-model="row.field_name" placeholder="如：产地" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-select v-model="row.field_type" size="small" style="width:100%">
              <el-option label="文本" value="text" />
              <el-option label="数字" value="number" />
              <el-option label="日期" value="date" />
              <el-option label="下拉" value="select" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="下拉选项" min-width="140">
          <template #default="{ row }">
            <el-input
              v-if="row.field_type === 'select'"
              v-model="row.options_text"
              placeholder="选项用逗号分隔"
              size="small"
            />
            <span v-else style="color:var(--el-text-color-placeholder);font-size:12px">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="60" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="fieldDefsEdit.splice($index, 1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button style="margin-top:8px" size="small" @click="addFieldDef">+ 添加字段</el-button>
      <template #footer>
        <el-button @click="fieldConfigVisible = false">取消</el-button>
        <el-button type="primary" :loading="fieldConfigSaving" @click="saveFieldDefs">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowDown, Setting } from '@element-plus/icons-vue'
import { scmApi, ITEM_TYPES, type ScmItem, type ScmUnit, type ScmItemFieldDef } from '@/api/scm'
import AccountSelect from '@/components/base/AccountSelect.vue'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'

// ── 数据 ──────────────────────────────────────────────────────────────────
const allList = ref<ScmItem[]>([])
const list = ref<ScmItem[]>([])
const total = ref(0)
const loading = ref(false)
const filters = reactive<{ keyword: string; item_type: string; is_leaf: number | '' }>({
  keyword: '',
  item_type: '',
  is_leaf: '',
})
const unitOptions = ref<ScmUnit[]>([])
const customItemTypes = ref<Record<string, string>>({})
const dynamicItemTypes = computed(() => ({ ...ITEM_TYPES, ...customItemTypes.value }))
const currentRow = ref<ScmItem | null>(null)
const { tableRef, onDragEnd, colWidth } = useListColumnWidth('scm_item')

const hasSearch = computed(() => !!(filters.keyword || filters.item_type || filters.is_leaf !== ''))

// activeFieldDefs：页面显示/表单渲染用（is_enabled=1 的字段）
// 必须在 allColumnSettings 计算属性与 immediate watch 之前声明，否则存在 TDZ
const activeFieldDefs = ref<ScmItemFieldDef[]>([])

// ── 列配置 ────────────────────────────────────────────────────────────────
const STORAGE_KEY_COLS = 'scm_item_columns_visible'
const standardCols = ref([
  { prop: 'code', label: '编号', visible: true, fixed: true },
  { prop: 'name', label: '名称', visible: true, fixed: true },
  { prop: 'spec', label: '规格', visible: true },
  { prop: 'unit', label: '单位', visible: true },
  { prop: 'item_type', label: '属性', visible: true },
  { prop: 'is_leaf', label: '性质', visible: true },
  { prop: 'purchase_price', label: '进价', visible: true },
  { prop: 'sale_price', label: '售价', visible: true },
  { prop: 'barcode', label: '条码', visible: false },
  { prop: 'short_code', label: '简码', visible: false },
  { prop: 'is_asset', label: '资产', visible: true },
  { prop: 'remark', label: '备注', visible: false },
])

// 动态列：标准列 + 启用的自定义字段
const allColumnSettings = computed(() => {
  const res = [...standardCols.value]
  activeFieldDefs.value.forEach(f => {
    res.push({ prop: `field_${f.field_key}`, label: f.field_name, visible: true })
  })
  return res
})

// 用于模板 v-if 判断
const colVisible = reactive<Record<string, boolean>>({})

function initColumnVisible() {
  // 先设默认值
  allColumnSettings.value.forEach(c => {
    if (colVisible[c.prop] === undefined) colVisible[c.prop] = c.visible
  })
  
  // 加载存储
  const stored = localStorage.getItem(STORAGE_KEY_COLS)
  if (stored) {
    try {
      const saved = JSON.parse(stored)
      Object.keys(saved).forEach(k => {
        colVisible[k] = !!saved[k]
      })
    } catch {}
  }
}

function saveColumnConfig() {
  localStorage.setItem(STORAGE_KEY_COLS, JSON.stringify(colVisible))
}

watch(allColumnSettings, () => {
  initColumnVisible()
}, { immediate: true })

// ── 参数 ──────────────────────────────────────────────────────────────────
const itemLevels = ref(4)
const itemCodeLengths = ref([2, 2, 2, 2])

async function loadParams() {
  try {
    const r = await scmApi.getParams()
    for (const p of r.data as any[]) {
      if (p.param_key === 'scm:item_levels') itemLevels.value = parseInt(p.param_value) || 4
      else if (p.param_key === 'scm:item_code_lengths') {
        try { itemCodeLengths.value = JSON.parse(p.param_value).map(Number) }
        catch { itemCodeLengths.value = (p.param_value || '2,2,2,2').split(',').map(Number) }
      }
      else if (p.param_key === 'scm:item_types') {
        try { customItemTypes.value = JSON.parse(p.param_value) } catch {}
      }
    }
  } catch {}
}

// 计算当前表单物料的级次（1 起）
function getFormLevel(): number {
  if (!form.value.parent_id) return 1
  const parent = allList.value.find(i => i.id === form.value.parent_id)
  return ((parent as any)?.level || 1) + 1
}

// 计算指定级次的期望编号总长度（累积段长之和）
function getExpectedLen(level: number): number {
  return itemCodeLengths.value.slice(0, level).reduce((s, n) => s + n, 0)
}

// 当前新增表单的期望编号长度
const expectedCodeLen = computed(() => getExpectedLen(getFormLevel()))

// 编号长度及父级前缀校验（仅新增时用）
function validateCodeLength(): string | null {
  const code = form.value.code || ''
  const level = getFormLevel()
  if (level > itemLevels.value) {
    return `最大物料级次为 ${itemLevels.value} 级，无法继续向下新增`
  }
  const expected = getExpectedLen(level)
  if (expected > 0 && code.length !== expected) {
    return `第 ${level} 级物料编号应为 ${expected} 位（当前 ${code.length} 位）`
  }
  if (form.value.parent_id) {
    const parent = allList.value.find(i => i.id === form.value.parent_id)
    if (parent && !code.startsWith(parent.code)) {
      return `子物料编号须以上级编号「${parent.code}」开头`
    }
  }
  return null
}

// ── 查询 ──────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    if (hasSearch.value) {
      const params: any = { page: 1, page_size: 200 }
      if (filters.keyword) params.keyword = filters.keyword
      if (filters.item_type) params.item_type = filters.item_type
      const res = await scmApi.getItems(params)
      if (res.code === 0) {
        let rows: ScmItem[] = (res.data as any).list
        if (filters.is_leaf !== '') rows = rows.filter(r => (r.is_leaf ?? 1) === filters.is_leaf)
        list.value = rows
        total.value = rows.length
      }
    } else {
      const res = await (scmApi.getItems as any)({ all: '1' })
      if (res.code === 0) {
        allList.value = (res.data as any).list
        total.value = allList.value.length
      }
    }
  } finally { loading.value = false }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
}
function onSearchClear() {
  filters.keyword = ''
  load()
}

// ── 树构建 ────────────────────────────────────────────────────────────────
const treeData = computed(() => buildTree(filteredAllList.value))

const filteredAllList = computed(() => {
  if (filters.is_leaf === '') return allList.value
  return filterWithAncestors(allList.value, r => (r.is_leaf ?? 1) === filters.is_leaf)
})

function filterWithAncestors(items: ScmItem[], predicate: (r: ScmItem) => boolean): ScmItem[] {
  const matched = new Set<string>()
  for (const item of items) {
    if (predicate(item)) matched.add(String(item.id))
  }
  // 保留祖先路径
  const idMap = new Map(items.map(i => [String(i.id), i]))
  const result = new Set<string>(matched)
  for (const id of matched) {
    let cur = idMap.get(id)
    while (cur && (cur as any).parent_id) {
      result.add(String((cur as any).parent_id))
      cur = idMap.get(String((cur as any).parent_id))
    }
  }
  return items.filter(i => result.has(String(i.id)))
}

function buildTree(items: any[]): any[] {
  const map = new Map<string, any>()
  for (const item of items) map.set(item.id, { ...item, children: [] })
  const roots: any[] = []
  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// 树选择器数据（含 code+name 显示标签，排除自身）
const treeSelectData = computed(() => {
  const data = buildTree(allList.value)
  function addLabel(nodes: any[]): any[] {
    return nodes.map(n => ({
      ...n,
      displayLabel: `${n.code} ${n.name}`,
      children: addLabel(n.children || []),
    }))
  }
  if (!editId.value) return addLabel(data)
  return addLabel(filterOutSelf(data, editId.value))
})

function filterOutSelf(nodes: any[], excludeId: string): any[] {
  return nodes
    .filter(n => n.id !== excludeId)
    .map(n => ({ ...n, children: filterOutSelf(n.children || [], excludeId) }))
}

// ── 计数标签 ─────────────────────────────────────────────────────────────
const itemCountLabel = computed(() => {
  const t = total.value
  if (!hasSearch.value) return `${t} 个物料`
  return `${t} / ${allList.value.length} 个物料`
})

// ── 展开/折叠 ─────────────────────────────────────────────────────────────
const expandedSet = ref<Set<string>>(new Set())
const expandedKeys = computed(() => [...expandedSet.value])

function handleExpandChange(row: any, expanded: boolean) {
  const s = new Set(expandedSet.value)
  if (expanded) s.add(row.id); else s.delete(row.id)
  expandedSet.value = s
}

function handleCurrentChange(row: any) {
  currentRow.value = row || null
}

function collapseAll() { expandedSet.value = new Set() }

function expandAll() {
  const s = new Set<string>()
  function walk(nodes: any[]) {
    for (const n of nodes) { if (n.children?.length) { s.add(n.id); walk(n.children) } }
  }
  walk(treeData.value)
  expandedSet.value = s
}

function goUpLevel() {
  if (expandedSet.value.size === 0) return
  const nodes = flattenTree(treeData.value)
  const maxDepth = nodes.filter(n => expandedSet.value.has(n.id)).reduce((m, n) => Math.max(m, n.level || 1), 0)
  const s = new Set(expandedSet.value)
  for (const n of nodes) { if ((n.level || 1) === maxDepth) s.delete(n.id) }
  expandedSet.value = s
}

function goDownLevel() {
  if (expandedSet.value.size === 0) {
    const s = new Set<string>()
    for (const n of treeData.value) { if (n.children?.length) s.add(n.id) }
    expandedSet.value = s
    return
  }
  const nodes = flattenTree(treeData.value)
  const maxDepth = nodes.filter(n => expandedSet.value.has(n.id)).reduce((m, n) => Math.max(m, n.level || 1), 0)
  const s = new Set(expandedSet.value)
  for (const n of nodes) {
    if (expandedSet.value.has(n.id) && n.children?.length) {
      for (const c of n.children) { if (c.children?.length) s.add(c.id) }
    } else if (!expandedSet.value.has(n.id) && (n.level || 1) === maxDepth && n.children?.length) {
      s.add(n.id)
    }
  }
  expandedSet.value = s
}

function flattenTree(nodes: any[]): any[] {
  const res: any[] = []
  function walk(ns: any[]) { for (const n of ns) { res.push(n); if (n.children) walk(n.children) } }
  walk(nodes)
  return res
}

// ── 新增命令 ──────────────────────────────────────────────────────────────
type AddCommand = 'sibling' | 'child'

function handleAddCommand(command: AddCommand) {
  if (command === 'child') {
    if (!currentRow.value) return ElMessage.warning('请先选中一行物料，再增加子物料')
    openAdd(currentRow.value as ScmItem)
  } else {
    // 同级：以当前选中行的父级为上级
    const parent = currentRow.value
      ? allList.value.find(i => i.id === (currentRow.value as any).parent_id) || null
      : null
    openAdd(parent as ScmItem | null)
  }
}

// ── 对话框 ────────────────────────────────────────────────────────────────
const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const form = ref<Partial<ScmItem>>({})

async function openAdd(parent?: ScmItem | null) {
  editId.value = null
  form.value = {
    purchase_price: 0,
    sale_price: 0,
    fixed_cost: 0,
    batch_flag: 0,
    is_asset: 0,
    is_leaf: 1,
    primary_unit_code: '',
    secondary_units: [],
    parent_id: parent?.id || '',
    field_values: {},
  }
  form.value.code = buildNextCode(parent?.id || null)
  dialogVisible.value = true
}

async function openEdit(row: ScmItem) {
  editId.value = row.id
  form.value = {
    ...row,
    parent_id: (row as any).parent_id || '',
    primary_unit_code: row.primary_unit_code || '',
    secondary_units: (row.secondary_units || []).map(s => ({ ...s })),
    is_leaf: row.is_leaf !== undefined ? row.is_leaf : 1,
    field_values: { ...(row.field_values || {}) },
  }
  dialogVisible.value = true
}

// 上级变更时重新自动编号
function onParentChange(newPid: string) {
  if (!editId.value) form.value.code = buildNextCode(newPid || null)
}
watch(() => form.value.parent_id, (newPid) => {
  if (!editId.value) form.value.code = buildNextCode(newPid || null)
})

// ── 自动编号 ──────────────────────────────────────────────────────────────
function buildNextCode(parentId: string | null): string {
  if (!parentId) {
    const segLen = itemCodeLengths.value[0] || 2
    const items = allList.value.filter(i => !(i as any).parent_id)
    const maxNo = items.reduce((m, i) => {
      const n = parseInt(String(i.code).replace(/^\D+/, '')) || 0
      return Math.max(m, n)
    }, 0)
    return String(maxNo + 1).padStart(segLen, '0')
  }
  const parent = allList.value.find(i => i.id === parentId)
  if (!parent) return buildNextCode(null)
  const segLen = itemCodeLengths.value[((parent as any).level || 1)] || 2
  const prefix = parent.code
  const siblings = allList.value.filter(i => (i as any).parent_id === parentId)
  const maxNo = siblings.reduce((m, s) => {
    const suffix = String(s.code).slice(prefix.length)
    return Math.max(m, parseInt(suffix) || 0)
  }, 0)
  return prefix + String(maxNo + 1).padStart(segLen, '0')
}

// ── 副单位 ────────────────────────────────────────────────────────────────
function addSecondaryUnit() {
  if (!form.value.secondary_units) form.value.secondary_units = []
  form.value.secondary_units.push({ unit_code: '', conversion_rate: 1, is_primary: 0 })
}
function removeSecondaryUnit(i: number) { form.value.secondary_units?.splice(i, 1) }

// ── 保存 ──────────────────────────────────────────────────────────────────
async function handleSave(continueAdd = false) {
  if (!form.value.code || !form.value.name) return ElMessage.warning('编号和名称不能为空')
  if (!editId.value) {
    const err = validateCodeLength()
    if (err) return ElMessage.warning(err)
  }
  saving.value = true
  try {
    if (editId.value) {
      await scmApi.updateItem(editId.value, form.value)
    } else {
      await scmApi.createItem(form.value)
    }
    ElMessage.success(continueAdd ? '保存成功，可继续新增' : '保存成功')
    await load()
    if (continueAdd) {
      const parentId = form.value.parent_id || null
      const parent = parentId ? (allList.value.find(i => i.id === parentId) || null) : null
      await openAdd(parent)
    } else {
      dialogVisible.value = false
    }
  } finally { saving.value = false }
}

function onDialogKeydown(e: KeyboardEvent) {
  if (!dialogVisible.value || saving.value) return
  if (e.key !== 'Enter') return
  const target = e.target as HTMLElement
  if (target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    if (!editId.value) handleSave(true)
    else handleSave(false)
  } else {
    handleSave(false)
  }
}

// ── 删除 ──────────────────────────────────────────────────────────────────
async function handleDelete(row: ScmItem) {
  await ElMessageBox.confirm(`确认删除物料「${row.name}」？`, '提示', { type: 'warning' })
  await scmApi.deleteItem(row.id)
  ElMessage.success('已删除')
  load()
}

// ── 单位 ──────────────────────────────────────────────────────────────────
const showQuickUnit = ref(false)
const quickUnitName = ref('')
const quickUnitSaving = ref(false)

async function loadUnits() {
  try { const r = await scmApi.getUnits(); if (r.code === 0) unitOptions.value = r.data } catch {}
}

async function handleQuickAddUnit() {
  const name = quickUnitName.value.trim()
  if (!name) return ElMessage.warning('请输入单位名称')
  quickUnitSaving.value = true
  try {
    const r1 = await scmApi.getUnitNextNo()
    const code = r1.code === 0 ? r1.data.next_no : 'UN' + Date.now()
    const r2 = await scmApi.createUnit({ code, name, enabled: 1 })
    if (r2.code === 0) {
      ElMessage.success(`已新增单位：${name}`)
      await loadUnits()
      form.value.primary_unit_code = code
      showQuickUnit.value = false
      quickUnitName.value = ''
    }
  } catch {} finally { quickUnitSaving.value = false }
}

const showQuickAttr = ref(false)
const quickAttrName = ref('')
const quickAttrSaving = ref(false)

async function handleQuickAddAttr() {
  const name = quickAttrName.value.trim()
  if (!name) return ElMessage.warning('请输入属性名称')
  
  // 检查是否已存在
  if (Object.values(dynamicItemTypes.value).includes(name)) {
    return ElMessage.warning('该属性名称已存在')
  }

  quickAttrSaving.value = true
  try {
    const nextKey = String(Math.max(10, ...Object.keys(dynamicItemTypes.value).map(Number).filter(n => !isNaN(n))) + 1)
    const newTypes = { ...customItemTypes.value, [nextKey]: name }
    
    await scmApi.saveParams([{ param_key: 'scm:item_types', param_value: JSON.stringify(newTypes) }])
    
    customItemTypes.value = newTypes
    form.value.item_type = nextKey
    ElMessage.success(`已新增属性：${name}`)
    showQuickAttr.value = false
    quickAttrName.value = ''
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally { quickAttrSaving.value = false }
}

// ── 自定义字段（弹窗编辑相关；activeFieldDefs 已在列配置上方提前声明） ──────
// fieldDefsEdit：字段配置弹窗中的编辑副本
type FieldDefEdit = ScmItemFieldDef & { _persisted?: boolean; options_text?: string }
const fieldDefsEdit = ref<FieldDefEdit[]>([])
const fieldConfigVisible = ref(false)
const fieldConfigSaving = ref(false)

async function loadFieldDefs() {
  try {
    const r = await scmApi.getItemFieldDefs()
    if (r.code === 0) activeFieldDefs.value = r.data as ScmItemFieldDef[]
  } catch {}
}

function openFieldConfig() {
  // 深拷贝到编辑列表，并附加 options_text（JSON数组 → 逗号字符串）
  fieldDefsEdit.value = activeFieldDefs.value.map(f => ({
    ...f,
    _persisted: true,
    options_text: f.options_json ? (() => {
      try { return JSON.parse(f.options_json).join(',') } catch { return f.options_json }
    })() : '',
  }))
  fieldConfigVisible.value = true
}

function addFieldDef() {
  // 自动生成不重复的默认编码 field_1, field_2 ...
  const existingKeys = new Set([
    ...fieldDefsEdit.value.map(f => f.field_key),
    ...activeFieldDefs.value.map(f => f.field_key),
  ])
  let idx = fieldDefsEdit.value.length + 1
  while (existingKeys.has(`field_${idx}`)) idx++
  fieldDefsEdit.value.push({
    field_key: `field_${idx}`,
    field_name: '',
    field_type: 'text',
    options_json: undefined,
    options_text: '',
    sort_order: fieldDefsEdit.value.length,
    _persisted: false,
  })
}

async function saveFieldDefs() {
  // 基本校验
  for (const f of fieldDefsEdit.value) {
    if (!f.field_name?.trim()) return ElMessage.warning('字段名称不能为空')
    if (!f.field_key?.trim()) return ElMessage.warning('字段编码不能为空')
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.field_key)) {
      return ElMessage.warning(`字段编码"${f.field_key}"只能以字母开头，包含字母/数字/下划线`)
    }
  }
  // 编码唯一性
  const keys = fieldDefsEdit.value.map(f => f.field_key)
  if (new Set(keys).size !== keys.length) return ElMessage.warning('字段编码不能重复')

  const fields = fieldDefsEdit.value.map((f, i) => ({
    field_key: f.field_key.trim(),
    field_name: f.field_name.trim(),
    field_type: f.field_type,
    options_json: f.field_type === 'select' && f.options_text
      ? JSON.stringify(f.options_text.split(',').map(s => s.trim()).filter(Boolean))
      : null,
    sort_order: i,
  }))

  fieldConfigSaving.value = true
  try {
    await scmApi.saveItemFieldDefs(fields)
    ElMessage.success('字段配置已保存')
    await loadFieldDefs()
    fieldConfigVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    fieldConfigSaving.value = false
  }
}

// 解析下拉选项 JSON
function parseFieldOptions(optionsJson?: string): string[] {
  if (!optionsJson) return []
  try { return JSON.parse(optionsJson) } catch { return [] }
}

// ── 初始化 ────────────────────────────────────────────────────────────────
onMounted(async () => {
  // 列可见性已由 allColumnSettings 的 immediate watch 初始化，无需重复调用
  await loadParams()
  load()
  loadUnits()
  loadFieldDefs()
})
</script>

<style scoped>
.page {
  height: calc(100vh - 60px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.item-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 140px;
}

.item-title h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.item-title span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.item-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.level-actions {
  flex-shrink: 0;
}

.item-search {
  width: 200px;
}

.item-table {
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
}

.item-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  color: var(--el-color-primary);
  font-weight: 600;
  line-height: 1.2;
}

.item-name {
  color: var(--el-text-color-primary);
  font-weight: 500;
  line-height: 1.2;
}

.mini-flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  font-size: 12px;
  line-height: 1;
}

:deep(.item-table .el-table__cell) {
  padding: 2px 0 !important;
}

:deep(.item-table th.el-table__cell) {
  padding: 5px 0 !important;
  background: var(--el-fill-color-light) !important;
  color: var(--cw-text-primary);
  font-family: var(--cw-table-header-font-family);
  font-size: var(--cw-table-header-font-size);
  font-weight: var(--cw-table-header-font-weight);
}

:deep(.item-table .el-table__row) {
  height: 30px;
}

:deep(.item-table .cell) {
  min-height: 24px;
  line-height: 24px;
  padding: 0 6px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.item-table .el-tag) {
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.item-table .el-button--small) {
  height: 22px;
  padding: 0 4px;
}

:deep(.item-table .el-table__expand-icon) {
  width: 18px;
  height: 18px;
  margin-right: 2px;
}

@media (max-width: 1100px) {
  .page-header { align-items: flex-start; }
  .item-toolbar { justify-content: flex-start; }
  .item-search { width: 160px; }
}
</style>
