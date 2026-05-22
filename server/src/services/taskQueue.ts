import { v4 as uuidv4 } from 'uuid'

export interface Task {
  id: string
  type: 'batch-audit' | 'batch-unaudit' | 'batch-post' | 'batch-unpost'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number // 0-100
  total: number
  processed: number
  success: number
  failed: number
  message?: string
  result?: any
  createdAt: Date
  updatedAt: Date
}

// 内存中的任务队列（生产环境应该用 Redis）
const tasks = new Map<string, Task>()

// 创建任务
export function createTask(type: Task['type']): Task {
  const task: Task = {
    id: uuidv4(),
    type,
    status: 'pending',
    progress: 0,
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  tasks.set(task.id, task)
  return task
}

// 获取任务
export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId)
}

// 更新任务
export function updateTask(taskId: string, updates: Partial<Task>): void {
  const task = tasks.get(taskId)
  if (task) {
    Object.assign(task, updates, { updatedAt: new Date() })
    tasks.set(taskId, task)
  }
}

// 删除任务（任务完成 1 小时后自动删除）
export function deleteTask(taskId: string): void {
  tasks.delete(taskId)
}

// 清理过期任务
setInterval(() => {
  const now = Date.now()
  for (const [id, task] of tasks.entries()) {
    // 删除 1 小时前完成的任务
    if (
      (task.status === 'completed' || task.status === 'failed') &&
      now - task.updatedAt.getTime() > 3600000
    ) {
      tasks.delete(id)
    }
  }
}, 300000) // 每 5 分钟清理一次
