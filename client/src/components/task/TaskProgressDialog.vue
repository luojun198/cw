<template>
  <el-dialog
    v-model="visible"
    title="批量操作进度"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="taskStatus === 'completed' || taskStatus === 'failed'"
  >
    <div class="task-progress">
      <div class="task-info">
        <div class="task-type">{{ taskTypeText }}</div>
        <div class="task-status" :class="taskStatus">{{ taskStatusText }}</div>
      </div>

      <el-progress
        :percentage="progress"
        :status="progressStatus"
        :stroke-width="20"
      />

      <div class="task-detail">
        <div v-if="taskStatus === 'processing'">
          <p>总数：{{ total }} 条</p>
          <p>已处理：{{ processed }} 条</p>
          <p>成功：{{ success }} 条</p>
          <p>失败：{{ failed }} 条</p>
        </div>
        <div v-else-if="taskStatus === 'completed'">
          <p class="success-message">{{ message }}</p>
          <p>总数：{{ total }} 条</p>
          <p>成功：{{ success }} 条</p>
          <p v-if="failed > 0" class="error-text">失败：{{ failed }} 条</p>
          <div v-if="failed > 0 && errorDetails && errorDetails.length > 0" class="error-details">
            <p class="error-title">失败详情（前10条）：</p>
            <div v-for="(err, idx) in errorDetails.slice(0, 10)" :key="idx" class="error-item">
              <span class="error-id">凭证ID: {{ err.id }}</span>
              <span class="error-msg">{{ err.error }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="taskStatus === 'failed'">
          <p class="error-message">{{ message || '操作失败' }}</p>
        </div>
        <div v-else>
          <p>正在准备...</p>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button
        v-if="taskStatus === 'completed' || taskStatus === 'failed'"
        type="primary"
        @click="handleClose"
      >
        关闭
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import request from '@/api/request'

interface Props {
  modelValue: boolean
  taskId: string
  taskType: 'batch-audit' | 'batch-unaudit' | 'batch-post' | 'batch-unpost'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  completed: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const taskStatus = ref<'pending' | 'processing' | 'completed' | 'failed'>('pending')
const progress = ref(0)
const total = ref(0)
const processed = ref(0)
const success = ref(0)
const failed = ref(0)
const message = ref('')
const errorDetails = ref<Array<{ id: string; error: string }>>([])

let pollTimer: any = null

const taskTypeText = computed(() => {
  const map = {
    'batch-audit': '批量审核',
    'batch-unaudit': '批量反审核',
    'batch-post': '批量记账',
    'batch-unpost': '批量反记账',
  }
  return map[props.taskType] || '批量操作'
})

const taskStatusText = computed(() => {
  const map = {
    pending: '等待中...',
    processing: '处理中...',
    completed: '已完成',
    failed: '失败',
  }
  return map[taskStatus.value]
})

const progressStatus = computed(() => {
  if (taskStatus.value === 'completed') return 'success'
  if (taskStatus.value === 'failed') return 'exception'
  return undefined
})

// 监听 taskId 变化，开始轮询
watch(
  () => props.taskId,
  (newTaskId) => {
    if (newTaskId) {
      startPolling()
    }
  },
  { immediate: true }
)

// 开始轮询任务状态
function startPolling() {
  if (!props.taskId) return

  // 清除之前的定时器
  if (pollTimer) {
    clearInterval(pollTimer)
  }

  // 立即查询一次
  pollTaskStatus()

  // 每秒轮询一次
  pollTimer = setInterval(() => {
    pollTaskStatus()
  }, 1000)
}

// 查询任务状态
async function pollTaskStatus() {
  try {
    const res = await request.get(`/voucher/tasks/${props.taskId}`)
    const task = res.data as any

    taskStatus.value = task.status
    progress.value = task.progress
    total.value = task.total
    processed.value = task.processed
    success.value = task.success
    failed.value = task.failed
    message.value = task.message || ''

    // 获取错误详情
    if (task.result && task.result.errors) {
      errorDetails.value = task.result.errors
    }

    // 如果任务完成或失败，停止轮询
    if (task.status === 'completed' || task.status === 'failed') {
      stopPolling()
      emit('completed')
    }
  } catch (error: any) {
    console.error('查询任务状态失败：', error)
    // 如果任务不存在，停止轮询
    if (error.response?.status === 404) {
      stopPolling()
      taskStatus.value = 'failed'
      message.value = '任务不存在'
    }
  }
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 关闭对话框
function handleClose() {
  stopPolling()
  visible.value = false
}

// 组件卸载时停止轮询
import { onUnmounted } from 'vue'
onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.task-progress {
  padding: 20px 0;
}

.task-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.task-type {
  font-size: 16px;
  font-weight: bold;
}

.task-status {
  font-size: 14px;
  padding: 4px 12px;
  border-radius: 4px;
}

.task-status.pending {
  background-color: #e6f7ff;
  color: #1890ff;
}

.task-status.processing {
  background-color: #fff7e6;
  color: #fa8c16;
}

.task-status.completed {
  background-color: #f6ffed;
  color: #52c41a;
}

.task-status.failed {
  background-color: #fff1f0;
  color: #ff4d4f;
}

.task-detail {
  margin-top: 20px;
  padding: 16px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.task-detail p {
  margin: 8px 0;
  font-size: 14px;
}

.success-message {
  color: #52c41a;
  font-weight: bold;
}

.error-message {
  color: #ff4d4f;
  font-weight: bold;
}

.error-text {
  color: #ff4d4f;
}

.error-details {
  margin-top: 16px;
  padding: 12px;
  background-color: #fff1f0;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.error-title {
  font-weight: bold;
  color: #ff4d4f;
  margin-bottom: 8px;
}

.error-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid #ffccc7;
}

.error-item:last-child {
  border-bottom: none;
}

.error-id {
  color: #666;
  min-width: 120px;
}

.error-msg {
  color: #ff4d4f;
  flex: 1;
}
</style>
