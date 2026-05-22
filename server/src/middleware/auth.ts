import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/index.js'
import { getRequestIp } from '../utils/requestIp.js'

// Lazy-load JWT_SECRET to avoid ESM import hoisting issues:
// In ESM, all static imports are resolved before any code runs,
// so dotenv.config() in index.ts hasn't executed yet when this module loads.
// Using a getter defers the check until first actual use.
let _jwtSecret: string | undefined
function getJwtSecret(): string {
  if (!_jwtSecret) {
    _jwtSecret = process.env.JWT_SECRET
    if (!_jwtSecret) {
      throw new Error(
        'FATAL: JWT_SECRET is not set. ' +
          'Ensure dotenv.config() runs before any auth check, or set JWT_SECRET in environment.'
      )
    }
  }
  return _jwtSecret
}

export interface AuthRequest extends Request {
  userId?: string
  userName?: string
  accountSetId?: string
  roleId?: string
  sessionId?: string
  permissions?: string[]
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录' })
  }
  try {
    const payload = jwt.verify(token, getJwtSecret()) as any
    req.userId = payload.userId
    req.userName = payload.userName
    req.accountSetId = payload.accountSetId
    req.roleId = payload.roleId
    req.sessionId = payload.sessionId
    req.permissions = payload.permissions || []

    if (!payload.sessionId) {
      return res.status(401).json({ code: 40101, message: '登录已失效，请重新登录' })
    }

    const db = getDb()
    const session = db
      .prepare(
        `SELECT id, status
         FROM user_login_sessions
         WHERE id = ? AND user_id = ? AND account_set_id = ?
         LIMIT 1`
      )
      .get(payload.sessionId, payload.userId, payload.accountSetId) as
      | { id: string; status: string }
      | undefined

    if (!session || session.status !== 'active') {
      return res.status(401).json({ code: 40101, message: '账号已在其他地方登录，请重新登录' })
    }

    db.prepare(
      `UPDATE user_login_sessions
       SET last_seen_at = datetime('now'), login_ip = COALESCE(NULLIF(login_ip, ''), ?)
       WHERE id = ?`
    ).run(getRequestIp(req), payload.sessionId)

    next()
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期' })
  }
}

export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.permissions?.includes('*') && !req.permissions?.includes(permission)) {
      return res.status(403).json({ code: 403, message: '无此操作权限' })
    }
    next()
  }
}

export function requireAnyPermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.permissions?.includes('*')) return next()
    const hasAny = permissions.some(p => req.permissions?.includes(p))
    if (!hasAny) {
      return res.status(403).json({ code: 403, message: '无此操作权限' })
    }
    next()
  }
}

export function requireAllPermissions(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.permissions?.includes('*')) return next()
    const hasAll = permissions.every(p => req.permissions?.includes(p))
    if (!hasAll) {
      return res.status(403).json({ code: 403, message: '无此操作权限' })
    }
    next()
  }
}

export function generateToken(payload: {
  userId: string
  userName: string
  accountSetId: string
  roleId: string
  sessionId?: string
  permissions: string[]
}) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' })
}

export { getJwtSecret as JWT_SECRET }
