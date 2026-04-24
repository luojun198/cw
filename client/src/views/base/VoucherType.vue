<template>
  <div class="page">
    <div class="page-header">
      <h3>凭证类型</h3>
      <el-button type="primary" @click="openDialog('add')">新增类型</el-button>
    </div>
    <el-table :data="list" stripe border>
      <el-table-column prop="name" label="类型名称" />
      <el-table-column prop="code" label="编码" width="100" />
      <el-table-column prop="prefix" label="前缀" width="100" />
      <el-table-column prop="description" label="描述" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog('edit', row)"
            >编辑</el-button
          >
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="450px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="类型名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码" required
          ><el-input v-model="form.code" :disabled="dialogType === 'edit'"
        /></el-form-item>
        <el-form-item label="前缀"><el-input v-model="form.prefix" /></el-form-item>
        <el-form-item label="描述"
          ><el-input v-model="form.description" type="textarea" :rows="2"
        /></el-form-item>
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
import { showSuccess, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm } from '@/composables/useConfirm'

const list = ref<any[]>([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const dialogTitle = computed(() => (dialogType.value === 'add' ? '新增凭证类型' : '编辑凭证类型'))
const form = ref<any>({})

async function fetchData() {
  const r = await request.get<any[]>('/base/voucher-types')
  list.value = r.data
}

function openDialog(t: string, row?: any) {
  dialogType.value = t
  form.value = t === 'add' ? {} : { ...row }
  dialogVisible.value = true
}

async function handleSave() {
  try {
    if (dialogType.value === 'add') {
      await request.post('/base/voucher-types', form.value)
      showSuccess('凭证类型新增成功')
    } else {
      await request.put(`/base/voucher-types/${form.value.id}`, form.value)
      showSuccess('凭证类型修改成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (error) {
    showOperationError(dialogType.value === 'add' ? '新增凭证类型' : '修改凭证类型', error)
  }
}

async function handleDelete(row: any) {
  const confirmed = await useDeleteConfirm(`凭证类型「${row.name}」`)
  if (!confirmed) return

  try {
    await request.delete(`/base/voucher-types/${row.id}`)
    showSuccess('删除成功')
    fetchData()
  } catch (error) {
    showOperationError('删除凭证类型', error)
  }
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
</style>
