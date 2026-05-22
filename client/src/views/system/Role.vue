<template>
  <div class="page">
    <div class="page-header">
      <h3>角色管理</h3>
      <el-button type="primary" @click="openDialog('add')">新增角色</el-button>
    </div>

    <el-table
      ref="tableRef"
      :data="list"
      stripe
      border
      size="small"
      class="compact-data-table"
      height="100%"
      @header-dragend="onDragEnd"
    >
      <el-table-column prop="name" label="角色名称" :width="colWidth('name', 150)" />
      <el-table-column prop="code" label="角色编码" :width="colWidth('code', 120)" />
      <el-table-column prop="description" label="描述" :width="colWidth('description', 200)" />
      <el-table-column prop="is_system" label="类型" :width="colWidth('is_system', 80)">
        <template #default="{ row }">
          <el-tag :type="row.is_system ? 'primary' : 'info'" size="small">{{
            row.is_system ? '系统' : '自定义'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column column-key="操作" label="操作" :width="colWidth('操作', 140)" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog('edit', row)">编辑</el-button>
          <el-button
            v-if="!row.is_system"
            link
            type="danger"
            size="small"
            @click="handleDelete(row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="780px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="角色名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="角色编码" required>
          <el-input v-model="form.code" :disabled="dialogType === 'edit'" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="权限配置">
          <div v-if="permissionGroups.length === 0" class="perm-loading">加载中...</div>
          <div v-else class="perm-groups">
            <!-- 顶部全局全选/反选 -->
            <div class="perm-global-bar">
              <el-checkbox
                :model-value="isAllChecked"
                :indeterminate="isAllIndeterminate"
                @change="(v: any) => toggleAll(!!v)"
              >全选</el-checkbox>
              <el-button link type="primary" size="small" @click="toggleInvert">反选</el-button>
            </div>
            <div v-for="group in permissionGroups" :key="group.module" class="perm-group">
              <div class="perm-group-header">
                <el-checkbox
                  :model-value="isGroupAllChecked(group)"
                  :indeterminate="isGroupIndeterminate(group)"
                  @change="(v: any) => toggleGroup(group, !!v)"
                >{{ group.moduleName }}</el-checkbox>
                <el-button link type="primary" size="small" @click="toggleGroupInvert(group)">反选</el-button>
              </div>
              <div class="perm-items">
                <el-checkbox
                  v-for="p in group.permissions"
                  :key="p.code"
                  v-model="form.permissions"
                  :label="p.code"
                >{{ p.name }}</el-checkbox>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import request from '@/api/request'
import { useListColumnWidth } from '@/composables/useColumnWidthMemory'

interface PermissionItem {
  code: string
  name: string
  acdCode?: string
}

interface PermissionGroup {
  module: string
  moduleName: string
  permissions: PermissionItem[]
}

const { tableRef, onDragEnd, colWidth } = useListColumnWidth('system_role')
const list = ref<any[]>([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const dialogTitle = computed(() => (dialogType.value === 'add' ? '新增角色' : '编辑角色'))
const form = ref<any>({ permissions: [] })
const permissionGroups = ref<PermissionGroup[]>([])

async function fetchData() {
  const res = await request.get<any[]>('/system/roles')
  list.value = res.data.map((r: any) => ({
    ...r,
    permissions: r.permissions ? JSON.parse(r.permissions) : [],
  }))
}

async function fetchPermissions() {
  const res = await request.get<PermissionGroup[]>('/system/permissions')
  permissionGroups.value = res.data
}

function isGroupAllChecked(group: PermissionGroup): boolean {
  return group.permissions.every(p => form.value.permissions.includes(p.code))
}

function isGroupIndeterminate(group: PermissionGroup): boolean {
  const checked = group.permissions.filter(p => form.value.permissions.includes(p.code))
  return checked.length > 0 && checked.length < group.permissions.length
}

/** 全局：所有权限code */
const allPermCodes = computed(() =>
  permissionGroups.value.flatMap(g => g.permissions.map(p => p.code))
)

const isAllChecked = computed(() =>
  allPermCodes.value.length > 0 && allPermCodes.value.every(c => form.value.permissions.includes(c))
)

const isAllIndeterminate = computed(() => {
  const checked = allPermCodes.value.filter(c => form.value.permissions.includes(c))
  return checked.length > 0 && checked.length < allPermCodes.value.length
})

/** 全局全选/取消全选 */
function toggleAll(checked: boolean) {
  if (checked) {
    form.value.permissions = [...allPermCodes.value]
  } else {
    form.value.permissions = []
  }
}

/** 全局反选 */
function toggleInvert() {
  const set = new Set(form.value.permissions)
  form.value.permissions = allPermCodes.value.filter(c => !set.has(c))
}

/** 单组全选/取消全选 */
function toggleGroup(group: PermissionGroup, checked: boolean) {
  const codes = group.permissions.map(p => p.code)
  if (checked) {
    const existing = new Set(form.value.permissions)
    codes.forEach(c => existing.add(c))
    form.value.permissions = Array.from(existing)
  } else {
    form.value.permissions = form.value.permissions.filter((c: string) => !codes.includes(c))
  }
}

/** 单组反选 */
function toggleGroupInvert(group: PermissionGroup) {
  const codes = group.permissions.map(p => p.code)
  const codeSet = new Set(codes)
  const others = form.value.permissions.filter((c: string) => !codeSet.has(c))
  const inverted = codes.filter(c => !form.value.permissions.includes(c))
  form.value.permissions = [...others, ...inverted]
}

function openDialog(type: string, row?: any) {
  dialogType.value = type
  form.value =
    type === 'add'
      ? { name: '', code: '', description: '', permissions: [] }
      : { ...row, permissions: Array.isArray(row.permissions) ? [...row.permissions] : [] }
  dialogVisible.value = true
}

async function handleSave() {
  if (dialogType.value === 'add') {
    await request.post('/system/roles', form.value)
  } else {
    await request.put(`/system/roles/${form.value.id}`, form.value)
  }
  dialogVisible.value = false
  fetchData()
}

async function handleDelete(row: any) {
  await request.delete(`/system/roles/${row.id}`)
  fetchData()
}

onMounted(() => {
  fetchData()
  fetchPermissions()
})
</script>

<style scoped>
.perm-loading {
  color: #999;
  font-size: 13px;
}
.perm-groups {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.perm-global-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: #ecf5ff;
  border-radius: 4px;
  border: 1px solid #b3d8ff;
}
.perm-group {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}
.perm-group-header {
  background: #f5f7fa;
  padding: 6px 12px;
  font-weight: 600;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.perm-items {
  padding: 8px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}
.perm-items .el-checkbox {
  width: 25%;
  margin-right: 0;
}
</style>
