<template>
  <div class="page">
    <div class="page-header">
      <h3>用户管理</h3>
      <el-button type="primary" @click="openDialog('add')">新增用户</el-button>
    </div>

    <el-table :data="list" stripe border>
      <el-table-column prop="username" label="用户名" width="120" />
      <el-table-column prop="nickname" label="姓名" width="120" />
      <el-table-column prop="account_set_name" label="所属账套" />
      <el-table-column prop="role_name" label="角色" width="120" />
      <el-table-column prop="email" label="邮箱" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'active' ? 'success' : row.status === 'locked' ? 'danger' : 'warning'
            "
            size="small"
          >
            {{
              ({ active: '正常', disabled: '禁用', locked: '锁定' } as Record<string, string>)[
                row.status
              ] || row.status
            }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_login_at" label="最后登录" width="160" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog('edit', row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="dialogType === 'edit'" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.nickname" />
        </el-form-item>
        <el-form-item label="所属账套" required>
          <el-select v-model="form.account_set_id" style="width: 100%" :disabled="dialogType === 'edit'">
            <el-option v-for="as in accountSets" :key="as.id" :label="as.name" :value="as.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="dialogType === 'add'" label="密码" required>
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item v-if="dialogType === 'edit'" label="重置密码">
          <el-input v-model="form.password" type="password" show-password placeholder="留空则不修改" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role_id" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item v-if="dialogType === 'edit'" label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="disabled" />
          </el-select>
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
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const list = ref<any[]>([])
const roles = ref<any[]>([])
const accountSets = ref<any[]>([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const dialogTitle = computed(() => dialogType.value === 'add' ? '新增用户' : '编辑用户')
const form = ref<any>({ status: 'active', account_set_id: '' })

async function fetchData() {
  const [userRes, roleRes, asRes] = await Promise.all([
    request.get<any[]>('/system/users'),
    request.get<any[]>('/system/roles'),
    request.get<any[]>('/system/account-sets')
  ])
  list.value = userRes.data
  roles.value = roleRes.data
  accountSets.value = asRes.data
}

function openDialog(type: string, row?: any) {
  dialogType.value = type
  if (type === 'add') {
    form.value = { status: 'active', account_set_id: userStore.accountSetId }
  } else {
    form.value = { ...row }
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (dialogType.value === 'add') {
    await request.post('/system/users', form.value)
  } else {
    await request.put(`/system/users/${form.value.id}`, form.value)
  }
  dialogVisible.value = false
  fetchData()
}

async function handleDelete(row: any) {
  await request.delete(`/system/users/${row.id}`)
  fetchData()
}

onMounted(fetchData)
</script>

<style scoped>
.page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h3 { margin: 0; }
</style>
