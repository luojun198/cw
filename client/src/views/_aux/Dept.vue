<template>
  <div class="page">
    <div class="page-header">
      <h3>部门核算</h3>
      <div>
        <el-input
          v-model="searchKeyword"
          placeholder="搜索编码、名称..."
          clearable
          style="width: 200px; margin-right: 12px"
          prefix-icon="Search"
        />
        <el-button type="primary" @click="openDialog('add')">新增部门</el-button>
      </div>
    </div>
    <el-table :data="filteredData" stripe border height="100%">
      <el-table-column prop="code" label="编码" width="120">
        <template #default="{ row }">
          <span v-html="highlightText(row.code)"></span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称">
        <template #default="{ row }">
          <span v-html="highlightText(row.name)"></span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"
          ><el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{
            row.status === 'active' ? '进行中' : '已完结'
          }}</el-tag></template
        >
      </el-table-column>
      <el-table-column prop="remark" label="备注" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog('edit', row)"
            >编辑</el-button
          >
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="400px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="编码" required><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%"
            ><el-option label="进行中" value="active" /><el-option label="已完结" value="closed"
          /></el-select>
        </el-form-item>
        <el-form-item label="备注"
          ><el-input v-model="form.remark" type="textarea" :rows="2"
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
import { useTableSearch } from '@/composables/useTableSearch'

const list = ref<any[]>([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const dialogTitle = computed(() => (dialogType.value === 'add' ? '新增部门' : '编辑部门'))
const form = ref<any>({ type: 'dept', status: 'active' })

// 搜索功能
const { searchKeyword, filteredData, highlightText } = useTableSearch(() => list.value, ['code', 'name', 'remark'])

async function fetchData() {
  try {
    const r = await request.get<any[]>('/base/aux-items', { params: { type: 'dept' } })
    list.value = r.data
  } catch (error) {
    showOperationError('查询部门列表', error)
  }
}

function openDialog(t: string, row?: any) {
  dialogType.value = t
  form.value = t === 'add' ? { type: 'dept', status: 'active' } : { ...row }
  dialogVisible.value = true
}

async function handleSave() {
  try {
    if (dialogType.value === 'add') {
      await request.post('/base/aux-items', form.value)
      showSuccess('部门新增成功')
    } else {
      await request.put(`/base/aux-items/${form.value.id}`, form.value)
      showSuccess('部门修改成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (error) {
    showOperationError(dialogType.value === 'add' ? '新增部门' : '修改部门', error)
  }
}

async function handleDelete(row: any) {
  const confirmed = await useDeleteConfirm(`部门「${row.code} ${row.name}」`)
  if (!confirmed) return

  try {
    await request.delete(`/base/aux-items/${row.id}`)
    showSuccess('删除成功')
    fetchData()
  } catch (error) {
    showOperationError('删除部门', error)
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
