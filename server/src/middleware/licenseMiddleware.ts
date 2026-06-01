import type { Request, Response, NextFunction } from 'express'
import { assertLicenseValid, isLicenseCheckSkipped } from '../services/licenseService.js'
import { log } from '../utils/logger.js'

/** 登录页 / 激活前必须可用的公开 API（不要求已激活） */
const PRE_LOGIN_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/captcha',
  '/api/auth/account-sets',
  '/api/auth/standard-account-set-templates',
  '/api/auth/backup-import',
  '/api/auth/acd-import',
]

const LICENSE_WHITELIST: Array<{ method?: string; test: (path: string) => boolean }> = [
  { test: path => path === '/api/health' },
  { test: path => path.startsWith('/api/license') },
  { test: path => path === '/api/system/branding' },
  { test: path => PRE_LOGIN_AUTH_PATHS.includes(path) },
  { test: path => path.startsWith('/api/auth/account-sets/') },
  { test: path => path.startsWith('/api/auth/users-by-account-set/') },
]

function isWhitelisted(req: Request): boolean {
  const path = req.path
  return LICENSE_WHITELIST.some(item => {
    if (item.method && item.method !== req.method) return false
    return item.test(path)
  })
}

export function licenseMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api')) {
    return next()
  }
  if (isLicenseCheckSkipped() || isWhitelisted(req)) {
    return next()
  }

  try {
    const error = assertLicenseValid()
    if (error) {
      return res.status(402).json({
        code: error.code,
        message: error.message,
      })
    }
    return next()
  } catch (err) {
    log.error('license check failed', {
      path: req.path,
      error: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({
      code: 500,
      message: '授权校验失败，请重启服务或联系技术支持',
    })
  }
}
