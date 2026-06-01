import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { buildLicenseCode } from '../services/licenseCodec.js'
import { LICENSE_PUBLIC_KEY_PEM } from '../config/licensePublicKey.js'
import { isExpired } from '../services/licenseCodec.js'

const TEST_MACHINE_ID = 'A1B2C3D4E5F6'

const getMachineIdMock = vi.fn(() => TEST_MACHINE_ID)

vi.mock('../services/machineId.js', () => ({
  getMachineId: () => getMachineIdMock(),
  computeMachineId: () => getMachineIdMock(),
  resetMachineIdCache: vi.fn(),
}))

import {
  activateLicense,
  assertLicenseValid,
  getLicenseStatus,
  getTodayDateString,
  LICENSE_ERROR,
  verifyLicenseCode,
} from '../services/licenseService.js'

function resolvePrivateKeyPath(): string {
  const candidates = [
    join(process.cwd(), 'tools', 'license-keys', 'license-private.pem'),
    join(process.cwd(), '..', 'tools', 'license-keys', 'license-private.pem'),
    join(process.cwd(), '..', '..', 'tools', 'license-keys', 'license-private.pem'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  throw new Error('未找到 license-private.pem，请先运行密钥生成步骤')
}

function loadPrivateKey(): string {
  return readFileSync(resolvePrivateKeyPath(), 'utf8')
}

function futureDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pastDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function makeCode(machineId: string, expires: string): string {
  const privateKey = loadPrivateKey()
  return buildLicenseCode(
    { v: 1, mid: machineId, exp: expires, iat: getTodayDateString() },
    privateKey
  )
}

describe('licenseService', () => {
  let db: Database.Database
  const originalSkip = process.env.LICENSE_SKIP

  beforeEach(() => {
    delete process.env.LICENSE_SKIP
    getMachineIdMock.mockReturnValue(TEST_MACHINE_ID)
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE license_activation (
        id TEXT PRIMARY KEY DEFAULT 'default',
        machine_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        activated_at TEXT NOT NULL,
        license_token TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  })

  afterEach(() => {
    if (originalSkip === undefined) delete process.env.LICENSE_SKIP
    else process.env.LICENSE_SKIP = originalSkip
  })

  it('未激活时状态应为未授权', () => {
    const status = getLicenseStatus(db)
    expect(status.activated).toBe(false)
    expect(status.expired).toBe(false)
    expect(status.machineId).toBe(TEST_MACHINE_ID)
  })

  it('有效注册码应激活成功', () => {
    const code = makeCode(TEST_MACHINE_ID, futureDate(30))
    const result = activateLicense(code, db)
    expect(result).toEqual({ expiresAt: expect.any(String) })

    const status = getLicenseStatus(db)
    expect(status.activated).toBe(true)
    expect(status.expired).toBe(false)
    expect(status.daysRemaining).toBeGreaterThan(0)
    expect(assertLicenseValid(db)).toBeNull()
  })

  it('机器码不匹配应拒绝', () => {
    const code = makeCode('FFFFFFFFFFFF', futureDate(30))
    const result = verifyLicenseCode(code, TEST_MACHINE_ID, LICENSE_PUBLIC_KEY_PEM)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe(LICENSE_ERROR.INVALID)
    }
  })

  it('过期注册码应拒绝', () => {
    const code = makeCode(TEST_MACHINE_ID, pastDate(1))
    const result = verifyLicenseCode(code, TEST_MACHINE_ID, LICENSE_PUBLIC_KEY_PEM)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe(LICENSE_ERROR.EXPIRED)
    }
  })

  it('格式错误注册码应返回 FORMAT 错误', () => {
    const result = verifyLicenseCode('invalid-code', TEST_MACHINE_ID, LICENSE_PUBLIC_KEY_PEM)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe(LICENSE_ERROR.FORMAT)
    }
  })

  it('续期应覆盖旧授权', () => {
    const code1 = makeCode(TEST_MACHINE_ID, futureDate(10))
    activateLicense(code1, db)
    const code2 = makeCode(TEST_MACHINE_ID, futureDate(60))
    activateLicense(code2, db)
    const status = getLicenseStatus(db)
    expect(status.daysRemaining).toBeGreaterThan(30)
  })

  it('硬件变更后 assert 应失败', () => {
    const code = makeCode(TEST_MACHINE_ID, futureDate(30))
    activateLicense(code, db)
    getMachineIdMock.mockReturnValue('BBBBBBBBBBBB')
    const err = assertLicenseValid(db)
    expect(err?.code).toBe(LICENSE_ERROR.MACHINE_MISMATCH)
  })

  it('LICENSE_SKIP 应跳过校验', () => {
    process.env.LICENSE_SKIP = 'true'
    expect(assertLicenseValid(db)).toBeNull()
    const status = getLicenseStatus(db)
    expect(status.activated).toBe(true)
  })
})

describe('licenseCodec', () => {
  it('isExpired 应在截止日之后返回 true', () => {
    expect(isExpired(pastDate(1))).toBe(true)
    expect(isExpired(futureDate(1))).toBe(false)
  })
})
