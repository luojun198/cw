import { AuthRequest } from './auth.js'
import { v4 as uuidv4 } from 'uuid'
import { logQueue } from '../utils/logQueue.js'

export function operationLog(action: string, module?: string) {
  return (req: AuthRequest, res: Response, next: any) => {
    const originalSend = res.send
    res.send = function (body) {
      try {
        // 使用异步队列写入日志，避免阻塞请求
        logQueue.push({
          id: uuidv4(),
          account_set_id: req.accountSetId || null,
          user_id: req.userId || null,
          username: req.userName || null,
          action,
          module: module || '',
          detail: typeof body === 'string' ? body : JSON.stringify(body?.message || ''),
          ip_address: req.ip || req.socket.remoteAddress || '',
          user_agent: req.headers['user-agent'] || '',
        })
      } catch (e) {
        console.error('Failed to queue operation log:', e)
      }
      return originalSend.call(this, body)
    }
    next()
  }
}

import type { Response } from 'express'
