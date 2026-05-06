<template>
  <div class="page">
    <div class="page-header">
      <h3>操作日志</h3>
    </div>

    <el-card>
      <div class="filter-row">
        <el-input v-model="filters.action" placeholder="操作内容" style="width: 200px" clearable />
        <el-input v-model="filters.module" placeholder="模块" style="width: 150px" clearable />
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
        <el-button type="primary" @click="fetchData">查询</el-button>
      </div>
    </el-card>

    <el-table :data="list" stripe border height="100%" style="margin-top: 16px" :loading="loading">
      <el-table-column prop="created_at" label="时间" width="180" />
      <el-table-column prop="username" label="操作用户" width="120" />
      <el-table-column prop="action" label="操作" width="150" />
      <el-table-column prop="module" label="模块" width="100" />
      <el-table-column prop="detail" label="详情" />
      <el-table-column prop="ip_address" label="IP 地址" width="140" />
    </el-table>

    <el-pagination
      v-model:current-page="pagination.page"
      v-model:page-size="pagination.pageSize"
      :total="pagination.total"
      :page-sizes="[20, 50, 100, 200]"
      layout="total, sizes, prev, pager, next"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="fetchData"
      @size-change="fetchData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import request from '@/api/request'

const list = ref<any[]>([])
const loading = ref(false)
const filters = ref<any>({ action: '', module: '', dateRange: [] })
const pagination = reactive({ page: 1, pageSize: 50, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const params: any = { page: pagination.page, pageSize: pagination.pageSize }
    if (filters.value.action) params.action = filters.value.action
    if (filters.value.module) params.module = filters.value.module
    if (filters.value.dateRange?.length) {
      params.start_date = filters.value.dateRange[0]
      params.end_date = filters.value.dateRange[1]
    }
    const res = await request.get<any[]>('/system/logs', { params })
    list.value = res.data
    pagination.total = res.total ?? 0
  } finally {
    loading.value = false
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
.filter-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
