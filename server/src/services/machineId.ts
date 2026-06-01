import { createHash } from 'crypto'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import { log } from '../utils/logger.js'

let cachedMachineId: string | null = null

function safeExec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
  } catch {
    return ''
  }
}

function getPrimaryMac(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const lower = name.toLowerCase()
    if (lower.includes('virtual') || lower.includes('vmware') || lower.includes('loopback')) {
      continue
    }
    const entries = interfaces[name] || []
    for (const entry of entries) {
      if (entry.internal || entry.mac === '00:00:00:00:00:00') continue
      return entry.mac
    }
  }
  return ''
}

function getDiskSerial(): string {
  if (process.platform === 'win32') {
    const output = safeExec('wmic diskdrive get SerialNumber')
    const lines = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && line.toLowerCase() !== 'serialnumber')
    return lines[0] || ''
  }
  if (process.platform === 'linux') {
    const paths = ['/etc/machine-id', '/var/lib/dbus/machine-id']
    for (const path of paths) {
      if (existsSync(path)) {
        return readFileSync(path, 'utf8').trim()
      }
    }
  }
  if (process.platform === 'darwin') {
    return safeExec('ioreg -rd1 -c IOPlatformExpertDevice | awk \'/IOPlatformUUID/ { print $3; }\'').replace(
      /"/g,
      ''
    )
  }
  return ''
}

function collectFingerprintParts(): string[] {
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
    getPrimaryMac(),
    getDiskSerial(),
  ].filter(Boolean)

  if (parts.length === 0) {
    log.warn('机器码采集失败，使用 hostname 降级')
    parts.push(os.hostname() || 'unknown-host')
  }
  return parts
}

export function computeMachineId(): string {
  const raw = collectFingerprintParts().join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 12).toUpperCase()
}

export function getMachineId(): string {
  if (!cachedMachineId) {
    cachedMachineId = computeMachineId()
  }
  return cachedMachineId
}

/** 测试用：重置缓存 */
export function resetMachineIdCache(): void {
  cachedMachineId = null
}
