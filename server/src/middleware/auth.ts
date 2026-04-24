import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/index.ts'

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
    req.permissions = payload.permissions || []
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

export function generateToken(payload: {
  userId: string
  userName: string
  accountSetId: string
  roleId: string
  permissions: string[]
}) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' })
}

export { getJwtSecret as JWT_SECRET }
