<template>
  <div class="page">
    <div class="page-header">
      <h3>角色管理</h3>
      <el-button type="primary" @click="openDialog('add')">新增角色</el-button>
    </div>

    <el-table :data="list" stripe border>
      <el-table-column prop="name" label="角色名称" width="150" />
      <el-table-column prop="code" label="角色编码" width="120" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="is_system" label="类型" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_system ? 'primary' : 'info'" size="small">{{
            row.is_system ? '系统' : '自定义'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog('edit', row)"
            >编辑</el-button
          >
          <el-button
            v-if="!row.is_system"
            link
            type="danger"
            size="small"
            @click="handleDelete(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="600px">
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
          <div class="permissions-grid">
            <el-checkbox
              v-for="p in permissionList"
              :key="p.code"
              v-model="form.permissions"
              :label="p.code"
              >{{ p.name }}</el-checkbox
            >
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

const permissionList = [
  { code: 'voucher:entry', name: '凭证录入' },
  { code: 'voucher:audit', name: '凭证审核' },
  { code: 'voucher:query', name: '凭证查询' },
  { code: 'ledger:view', name: '账簿查看' },
  { code: 'report:view', name: '报表查看' },
  { code: 'report:export', name: '报表导出' },
  { code: 'base:edit', name: '基础设置' },
  { code: 'system:manage', name: '系统管理' },
]

const list = ref<any[]>([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const dialogTitle = computed(() => (dialogType.value === 'add' ? '新增角色' : '编辑角色'))
const form = ref<any>({ permissions: [] })

async function fetchData() {
  const res = await request.get<any[]>('/system/roles')
  list.value = res.data.map((r: any) => ({
    ...r,
    permissions: r.permissions ? JSON.parse(r.permissions) : [],
  }))
}

function openDialog(type: string, row?: any) {
  dialogType.value = type
  form.value =
    type === 'add' ? { name: '', code: '', description: '', permissions: [] } : { ...row }
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

onMounted(fetchData)
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
}
.permissions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
</style>
