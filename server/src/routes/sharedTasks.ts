import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/index.js'
import { getTask, serializeTaskForResponse } from '../services/taskQueue.js'

const router = Router()
router.use(authMiddleware)

router.get('/tasks/:taskId', (req: AuthRequest, res) => {
  try {
    const { taskId } = req.params
    const task = getTask(taskId)

    if (!task) {
      return res.status(404).json({ code: 404, message: '任务不存在' })
    }

    if (task.accountSetId && req.accountSetId && task.accountSetId !== req.accountSetId) {
      return res.status(404).json({ code: 404, message: '任务不存在' })
    }

    res.json({ code: 0, data: serializeTaskForResponse(task) })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message || '查询任务状态失败' })
  }
})

export default router
