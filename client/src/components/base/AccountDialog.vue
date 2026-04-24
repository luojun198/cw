<template>
  <el-dialog v-model="visible" :title="title" width="540px" @close="handleClose">
    <el-form :model="form" label-width="110px">
      <el-form-item label="上级科目">
        <el-tree-select
          v-model="form.parent_id"
          :data="treeSelectData"
          :props="treeSelectProps"
          check-strictly
          clearable
          placeholder="不选则为顶级科目"
          style="width: 100%"
          @change="handleParentChange"
        />
      </el-form-item>
      <el-form-item label="科目编码" required>
        <el-input v-model="form.code" :disabled="mode === 'edit'" placeholder="如: 1001" />
      </el-form-item>
      <el-form-item label="科目名称" required>
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="余额方向" required>
        <el-radio-group v-model="form.direction">
          <el-radio value="debit">借方</el-radio>
          <el-radio value="credit">贷方</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="属性设置">
        <div class="form-switch-row">
          <div class="form-switch-item">
            <span class="form-switch-label">现金</span>
            <el-switch v-model="form.is_cash" :active-value="1" :inactive-value="0" />
          </div>
          <div class="form-switch-item">
            <span class="form-switch-label">银行</span>
            <el-switch v-model="form.is_bank" :active-value="1" :inactive-value="0" />
          </div>
          <div class="form-switch-item">
            <span class="form-switch-label">余额不允许负数</span>
            <el-switch v-model="form.no_negative" :active-value="1" :inactive-value="0" />
          </div>
        </div>
      </el-form-item>
      <el-form-item label="辅助核算">
        <div class="aux-list">
          <div v-for="(item, index) in form.aux_list" :key="index" class="aux-item">
            <el-select
              v-model="item.cat_id"
              placeholder="核算类型"
              clearable
              style="width: 130px; margin-right: 8px"
              @change="val => onAuxCatChange(item, val)"
            >
              <el-option
                v-for="cat in getAvailableCats(item)"
                :key="cat.id"
                :label="cat.name"
                :value="cat.id"
              />
            </el-select>
            <el-select
              v-model="item.item_id"
              placeholder="默认项目"
              clearable
              filterable
              style="flex: 1"
              :disabled="!item.cat_id"
            >
              <el-option
                v-for="i in getAuxItemsByCat(item.cat_id)"
                :key="i.id"
                :label="i.name"
                :value="i.id"
              />
            </el-select>
            <el-button
              link
              type="danger"
              :disabled="form.aux_list.length <= 1"
              style="margin-left: 8px"
              @click="removeAux(index)"
              >删除</el-button
            >
          </div>
          <el-button link type="primary" style="margin-top: 4px" @click="addAux"
            >+ 添加核算类型</el-button
          >
        </div>
      </el-form-item>
      <el-form-item label="启用状态">
        <el-switch v-model="form.is_enabled" :active-value="1" :inactive-value="0" />
        <span v-if="childrenCount > 0" class="form-label-tip">
          （该科目有 {{ childrenCount }} 个子科目，将同步{{ form.is_enabled ? '启用' : '禁用' }}）
        </span>
      </el-form-item>

      <el-alert
        v-if="parentUsage && parentUsage.voucherCount > 0"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
      >
        <template #title>
          该上级科目已被使用：{{ parentUsage.voucherCount }} 条凭证分录，{{
            parentUsage.years.join('、')
          }}年度数据
        </template>
        <template #default>
          勾选下方选项可将余额和凭证自动转入新科目，凭证录入时只能选择最明细科目。
        </template>
      </el-alert>

      <el-form-item
        v-if="parentUsage && parentUsage.voucherCount > 0"
        label="数据迁移"
        style="margin-top: 8px"
      >
        <el-checkbox v-model="form.migrate_from_parent">将余额和凭证迁移到新科目</el-checkbox>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  modelValue: boolean
  mode: 'add' | 'edit'
  title: string
  form: any
  parentUsage: any
  childrenCount?: number
  treeSelectData: any[]
  getAvailableCats: (item: any) => any[]
  getAuxItemsByCat: (catId: string) => any[]
  onAuxCatChange: (item: any, val: string) => void
  addAux: () => void
  removeAux: (index: number) => void
  saving: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'parent-change': [parentId: string]
  save: []
}>()

const visible = ref(props.modelValue)
const childrenCount = ref(0)

const treeSelectProps = {
  label: 'name',
  value: 'id',
  children: 'children',
  disabled: 'disabled',
}

watch(
  () => props.modelValue,
  val => {
    visible.value = val
    if (val && props.mode === 'edit' && props.form.id) {
      childrenCount.value = props.childrenCount || 0
    } else {
      childrenCount.value = 0
    }
  }
)

watch(visible, val => {
  emit('update:modelValue', val)
})

function handleParentChange(parentId: string) {
  emit('parent-change', parentId)
}

function handleClose() {
  visible.value = false
}
</script>

<style scoped>
.aux-list {
  width: 100%;
}

.form-switch-row {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.form-switch-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.form-switch-label {
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.aux-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
</style>
