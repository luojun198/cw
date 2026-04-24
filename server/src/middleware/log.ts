import { AuthRequest } from './auth.ts'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.ts'

export function operationLog(action: string, module?: string) {
  return (req: AuthRequest, res: Response, next: any) => {
    const originalSend = res.send
    res.send = function (body) {
      try {
        const db = getDb()
        const log = {
          id: uuidv4(),
          account_set_id: req.accountSetId || null,
          user_id: req.userId || null,
          username: req.userName || null,
          action,
          module: module || '',
          detail: typeof body === 'string' ? body : JSON.stringify(body?.message || ''),
          ip_address: req.ip || req.socket.remoteAddress || '',
          user_agent: req.headers['user-agent'] || '',
        }
        db.prepare(
          `
          INSERT INTO operation_logs (id, account_set_id, user_id, username, action, module, detail, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          log.id,
          log.account_set_id,
          log.user_id,
          log.username,
          log.action,
          log.module,
          log.detail,
          log.ip_address,
          log.user_agent
        )
      } catch (e) {
        console.error('Failed to write operation log:', e)
      }
      return originalSend.call(this, body)
    }
    next()
  }
}

import type { Response } from 'express'
