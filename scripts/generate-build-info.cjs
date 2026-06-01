/**
 * 生成前端构建版本信息，供登录页展示与 BUILD_STAMP 对齐。
 * 用法:
 *   node scripts/generate-build-info.cjs          # 生产构建
 *   node scripts/generate-build-info.cjs --dev    # 本地开发
 */
const { mkdirSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')
const { execSync } = require('child_process')

const projectRoot = resolve(__dirname, '..')
const isDev = process.argv.includes('--dev')
const pkg = require(join(projectRoot, 'package.json'))

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatBuildId(date = new Date()) {
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes())
  )
}

function gitHead() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const now = new Date()
const info = {
  version: pkg.version || '0.0.0',
  build: isDev ? 'dev' : formatBuildId(now),
  mode: isDev ? 'development' : 'production',
  gitCommit: gitHead(),
  builtAt: now.toISOString(),
  builtAtLocal: now.toLocaleString('zh-CN', { hour12: false }),
}

const outDir = join(projectRoot, 'client', 'public')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'version.json')
writeFileSync(outPath, JSON.stringify(info, null, 2), 'utf8')
console.log('build-info written:', outPath, `(${info.mode} build=${info.build})`)
