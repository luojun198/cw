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

/** os.hostname() 在某些 Windows 配置下可能抛出 ENOTFOUND，包装为安全调用 */
function safeHostname(): string {
  try {
    return os.hostname()
  } catch {
    return ''
  }
}

/** os.cpus() 理论上可能返回空数组或抛异常，保证安全 */
function safeCpuModel(): string {
  try {
    const cpus = os.cpus()
    if (cpus && cpus.length > 0 && cpus[0]?.model) {
      return cpus[0].model
    }
  } catch {
    // fall through
  }
  return ''
}

function safeNetworkInterfaces(): ReturnType<typeof os.networkInterfaces> {
  try {
    return os.networkInterfaces()
  } catch {
    return {}
  }
}

function getPrimaryMac(): string {
  try {
    const interfaces = safeNetworkInterfaces()
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
  } catch {
    // fall through
  }
  return ''
}

function getDiskSerial(): string {
  if (process.platform === 'win32') {
    const output = safeExec('wmic diskdrive get SerialNumber')
    if (!output) {
      // wmic 在新版 Windows 11 中已被弃用，尝试使用 PowerShell 备选
      const psOutput = safeExec(
        'powershell -NoProfile -Command "Get-Disk | Select-Object -ExpandProperty SerialNumber"'
      )
      if (psOutput) {
        return psOutput.split(/\r?\n/)[0]?.trim() || ''
      }
    }
    const lines = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && line.toLowerCase() !== 'serialnumber')
    return lines[0] || ''
  }
  if (process.platform === 'linux') {
    const paths = ['/etc/machine-id', '/var/lib/dbus/machine-id']
    for (const path of paths) {
      try {
        if (existsSync(path)) {
          return readFileSync(path, 'utf8').trim()
        }
      } catch {
        // try next
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
    safeHostname(),
    os.platform(),
    os.arch(),
    safeCpuModel(),
    getPrimaryMac(),
    getDiskSerial(),
  ].filter(Boolean)

  if (parts.length === 0) {
    log.warn('机器码采集失败，使用 hostname 降级')
    const hostname = safeHostname() || 'unknown-host'
    parts.push(hostname)
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
