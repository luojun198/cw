<template>
  <div class="page">
    <div class="page-header">
      <h3>备份恢复</h3>
      <el-button type="primary" :loading="backingUp" @click="handleBackup">
        <el-icon v-if="!backingUp"><Download /></el-icon>
        立即备份
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">备份总数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-value">{{ formatSize(stats.totalSize) }}</div>
          <div class="stat-label">占用空间</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-value">{{ stats.autoCount }}</div>
          <div class="stat-label">自动备份</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-value">
            {{ stats.lastBackupTime ? formatDate(stats.lastBackupTime) : '暂无' }}
          </div>
          <div class="stat-label">上次备份</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 自动备份设置 -->
    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div class="card-header">
          <span>自动备份设置</span>
          <el-switch
            v-model="settingsForm.enabled"
            active-text="启用"
            inactive-text="停用"
            @change="handleSaveSettings"
          />
        </div>
      </template>

      <el-form :model="settingsForm" label-width="100px" :disabled="!settingsForm.enabled">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="备份频率">
              <el-select
                v-model="settingsForm.schedule"
                style="width: 100%"
                @change="handleSaveSettings"
              >
                <el-option label="每天" value="daily" />
                <el-option label="每周一" value="weekly" />
                <el-option label="每月1号" value="monthly" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="执行时间">
              <el-time-select
                v-model="settingsForm.time"
                start="00:00"
                step="00:30"
                end="23:30"
                placeholder="选择时间"
                style="width: 100%"
                @change="handleSaveSettings"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="保留天数">
              <el-select
                v-model="settingsForm.retention"
                style="width: 100%"
                @change="handleSaveSettings"
              >
                <el-option label="7天" :value="7" />
                <el-option label="15天" :value="15" />
                <el-option label="30天" :value="30" />
                <el-option label="60天" :value="60" />
                <el-option label="90天" :value="90" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备份路径">
          <el-input
            v-model="settingsForm.backupPath"
            placeholder="留空使用默认路径 server/backups"
            clearable
            @change="handleSaveSettings"
          >
            <template #prefix
              ><el-icon><Folder /></el-icon
            ></template>
          </el-input>
          <div class="form-tip">设置绝对路径，如 /data/backups 或 D:\backups</div>
        </el-form-item>
      </el-form>

      <div v-if="settingsForm.enabled" class="schedule-info">
        <el-icon><Clock /></el-icon>
        下次执行：{{ getNextRunTime() }}
      </div>
    </el-card>

    <!-- 提示 -->
    <el-alert
      title="建议定期进行数据备份，以防数据丢失。恢复备份将覆盖当前所有数据。"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
    />

    <!-- 备份记录 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>备份记录</span>
          <el-button text type="primary" size="small" @click="fetchData">刷新</el-button>
        </div>
      </template>

      <el-table v-loading="loading" :data="list" stripe border>
        <el-table-column prop="filename" label="文件名" min-width="260" show-overflow-tooltip />
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.type === 'auto' ? 'success' : 'primary'" size="small">
              {{ row.type === 'auto' ? '自动' : '手动' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作人" width="100">
          <template #default="{ row }">
            {{ row.operator_name || row.operator_username || (row.type === 'auto' ? '系统' : '-') }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleRestore(row)">恢复</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Download, Folder, Clock } from '@element-plus/icons-vue'
import request from '@/api/request'
import { showSuccess, showOperationError } from '@/composables/useMessage'
import { useDeleteConfirm, useConfirm } from '@/composables/useConfirm'

const loading = ref(false)
const backingUp = ref(false)
const list = ref<any[]>([])

const stats = reactive({
  total: 0,
  totalSize: 0,
  autoCount: 0,
  manualCount: 0,
  lastBackupTime: null as string | null,
  lastBackupFilename: null as string | null,
})

const settingsForm = reactive({
  enabled: false,
  schedule: 'daily',
  time: '02:00',
  backupPath: '',
  retention: 30,
})

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(dateStr: string) {
  if (!dateStr) return '暂无'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getNextRunTime() {
  if (settingsForm.schedule === 'daily') {
    return `每天 ${settingsForm.time}`
  }
  if (settingsForm.schedule === 'weekly') {
    return `每周一 ${settingsForm.time}`
  }
  if (settingsForm.schedule === 'monthly') {
    return `每月1号 ${settingsForm.time}`
  }
  return ''
}

async function fetchSettings() {
  const res = await request.get<Record<string, unknown>>('/security/backups/settings')
  const data = (res.data || {}) as Record<string, unknown>
  settingsForm.enabled = Boolean(data.enabled)
  settingsForm.schedule = String(data.schedule || 'daily')
  settingsForm.time = String(data.time || '02:00')
  settingsForm.backupPath = String(data.backupPath || '')
  settingsForm.retention = Number(data.retention) || 30
}

async function handleSaveSettings() {
  try {
    await request.put('/security/backups/settings', {
      enabled: settingsForm.enabled,
      schedule: settingsForm.schedule,
      time: settingsForm.time,
      backupPath: settingsForm.backupPath,
      retention: settingsForm.retention,
    })
    showSuccess('备份设置已保存')
  } catch (error) {
    showOperationError('保存备份设置', error)
  }
}

async function fetchStats() {
  const res = await request.get('/security/backups/stats')
  Object.assign(stats, res.data)
}

async function fetchData() {
  loading.value = true
  try {
    await Promise.all([
      fetchSettings(),
      fetchStats(),
      request.get('/security/backups').then((res: any) => {
        list.value = res.data
      }),
    ])
  } catch (error) {
    showOperationError('加载备份数据', error)
  } finally {
    loading.value = false
  }
}

async function handleBackup() {
  backingUp.value = true
  try {
    await request.post('/security/backups')
    showSuccess('备份成功')
    await fetchData()
  } catch (error) {
    showOperationError('备份', error)
  } finally {
    backingUp.value = false
  }
}

async function handleRestore(row: any) {
  const confirmed = await useConfirm({
    message: `即将用「${row.filename}」覆盖当前所有数据，是否继续？`,
    title: '警告',
    type: 'warning',
    confirmButtonText: '确认恢复',
    cancelButtonText: '取消',
  })
  if (!confirmed) return

  try {
    await request.post(`/security/backups/${row.id}/restore`)
    showSuccess('恢复成功，请刷新页面')
  } catch (error) {
    showOperationError('恢复备份', error)
  }
}

async function handleDelete(row: any) {
  const confirmed = await useDeleteConfirm(`备份「${row.filename}」`)
  if (!confirmed) return

  try {
    await request.delete(`/security/backups/${row.id}`)
    showSuccess('删除成功')
    await fetchData()
  } catch (error) {
    showOperationError('删除备份', error)
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

.stat-card {
  text-align: center;
  border: 1px solid #ebeef5;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 4px;
}
.stat-label {
  font-size: 13px;
  color: #909399;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.schedule-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #67c23a;
  padding: 8px 12px;
  background: #f0f9eb;
  border-radius: 4px;
  margin-top: 8px;
}
</style>
