import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import { activePluginNames, isVersionGatedDshPackage, repoRoot } from './plugin-set.mjs'

const PEER_RANGE = '>=0.2.2-rc.3 <0.2.3'
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const violations = []
const fail = (message, detail) => violations.push(detail ? `${message}\n    ${detail}` : message)
const plugins = activePluginNames()

if (semver.validRange(PEER_RANGE) === null) {
  console.error(`check-dsh-pin: 内部错误：PEER_RANGE 不是合法 SemVer range：${PEER_RANGE}`)
  process.exit(2)
}

const peerDeclarations = new Map()
const devDeclarations = new Map()
const addDeclaration = (target, version, where) => {
  if (!target.has(version)) target.set(version, [])
  target.get(version).push(where)
}

for (const name of plugins) {
  const file = join(repoRoot, 'plugins', name, 'package.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))

  for (const pkg of Object.keys(json.dependencies ?? {})) {
    if (!isVersionGatedDshPackage(pkg)) continue
    fail(`DSH 包 ${pkg} 不能放在 dependencies；官方包只能 peer + devDependencies`, `plugins/${name}/package.json  dependencies`)
  }

  for (const [pkg, version] of Object.entries(json.peerDependencies ?? {})) {
    if (!isVersionGatedDshPackage(pkg)) continue
    addDeclaration(peerDeclarations, String(version), `plugins/${name}/package.json  peerDependencies  ${pkg}`)
    if (String(version) !== PEER_RANGE) {
      fail(`peerDependencies 的 ${pkg} 必须写兼容范围 "${PEER_RANGE}"，实际 "${version}"`, `plugins/${name}/package.json`)
    }
  }

  for (const [pkg, version] of Object.entries(json.devDependencies ?? {})) {
    if (!isVersionGatedDshPackage(pkg)) continue
    addDeclaration(devDeclarations, String(version), `plugins/${name}/package.json  devDependencies  ${pkg}`)
    if (!EXACT_SEMVER.test(String(version))) {
      fail(`devDependencies 的 ${pkg} 必须写精确版本，实际 "${version}"`, `plugins/${name}/package.json`)
    }
  }

  const engines = json.engines
  if (engines !== null && typeof engines === 'object' && Object.hasOwn(engines, 'dsh')) {
    fail(
      `判据 5（只声明 peer）失败：plugins/${name}/package.json 声明了 engines.dsh`,
      '官方兼容门会只看它、忽略 peerDependencies；删掉引擎声明，兼容范围只由 peer 表达（市场索引按 peer 自动派生）',
    )
  }
}

if (peerDeclarations.size === 0) fail('没有任何活跃插件声明 @deepseek-ai/dsh* 的 peerDependencies 范围')
if (devDeclarations.size === 0) fail('没有任何活跃插件声明 @deepseek-ai/dsh* 的 devDependencies 精确版本')
if (peerDeclarations.size > 1) {
  fail(
    `peer 范围不唯一：活跃插件声明了 ${peerDeclarations.size} 个不同的 dsh peer 范围`,
    [...peerDeclarations.entries()].sort().map(([value, places]) => `"${value}" ← ${places.length} 处，例如 ${places[0]}`).join('\n    '),
  )
}
if (devDeclarations.size > 1) {
  fail(
    `devDeps 精确版本不唯一：活跃插件声明了 ${devDeclarations.size} 个不同的 dsh devDependencies 版本`,
    [...devDeclarations.entries()].sort().map(([value, places]) => `"${value}" ← ${places.length} 处，例如 ${places[0]}`).join('\n    '),
  )
}

const devVersion = devDeclarations.size === 1 ? [...devDeclarations.keys()][0] : null
if (devVersion !== null && !semver.satisfies(devVersion, PEER_RANGE, { includePrerelease: true })) {
  fail(`devDependencies 精确版本 "${devVersion}" 不在 peer 兼容范围 "${PEER_RANGE}" 内`)
}

const workspaceFile = join(repoRoot, 'pnpm-workspace.yaml')
const workspace = readFileSync(workspaceFile, 'utf8')

function scanWorkspace(key, extract) {
  const found = []
  let inside = false
  for (const line of workspace.split(/\r?\n/u)) {
    if (new RegExp(`^${key}:`, 'u').test(line)) {
      inside = true
      continue
    }
    if (inside && /^[A-Za-z]/.test(line)) {
      inside = false
      continue
    }
    if (!inside) continue
    const hit = extract(line)
    if (hit) found.push(hit)
  }
  return found
}

const overrides = scanWorkspace('overrides', (line) => {
  const match = /^\s+"?(@deepseek-ai\/dsh[^"]*)"?:\s*"?([^"\s]+)"?\s*$/u.exec(line)
  return match && isVersionGatedDshPackage(match[1]) ? { pkg: match[1], version: match[2] } : null
})

const releaseAgeExclude = scanWorkspace('minimumReleaseAgeExclude', (line) => {
  const match = /^\s+-\s*'?(@deepseek-ai\/dsh[^@']*)@([^'@\s]+)'?\s*$/u.exec(line)
  return match && isVersionGatedDshPackage(match[1]) ? { pkg: match[1], version: match[2] } : null
})

for (const { pkg, version } of [...overrides, ...releaseAgeExclude]) {
  if (devVersion !== null && version !== devVersion) {
    fail(
      `周边版本不一致：${pkg} 写的是 "${version}"，活跃插件的 devDependencies 精确版本是 "${devVersion}"`,
      'pnpm-workspace.yaml 的 overrides / minimumReleaseAgeExclude 必须与 devDependencies 精确版本一致',
    )
  }
}
if (overrides.length === 0) fail('pnpm-workspace.yaml 的 overrides 里没有任何 @deepseek-ai/dsh* 条目')

const readmes = [
  'README.md',
  'README.zh-CN.md',
  ...plugins.flatMap(name => [`plugins/${name}/README.md`, `plugins/${name}/README.zh-CN.md`]),
]
for (const rel of readmes) {
  let text
  try {
    text = readFileSync(join(repoRoot, rel), 'utf8')
  } catch {
    fail(`文档一致失败：读不到 ${rel}`)
    continue
  }
  const requirementLines = text.split(/\r?\n/u)
    .map((line, index) => ({ line: line.trim(), no: index + 1 }))
    .filter(({ line }) => /\bdsh\b/iu.test(line.replace(/@dsh-sparrow\/[\w.-]+/gu, ' ')) && /\b\d+\.\d+\.\d+/u.test(line))
  if (requirementLines.length === 0) {
    fail(`文档一致失败：${rel} 里找不到环境要求行（应有一行同时提到 dsh 与版本号）`)
    continue
  }
  if (!requirementLines.some(({ line }) => line.includes(PEER_RANGE))) {
    fail(
      `文档一致失败：${rel} 的环境要求行没有写支持范围 "${PEER_RANGE}"`,
      requirementLines.map(({ line, no }) => `L${no}: ${line}`).join(' ｜ '),
    )
  }
}

if (violations.length > 0) {
  console.error('check-dsh-pin: ❌ 官方 dsh 版本门不一致\n')
  for (const violation of violations) console.error(`  · ${violation}`)
  console.error('\n修法：')
  console.error(`  · peerDependencies 的 @deepseek-ai/dsh* 统一写 "${PEER_RANGE}"`)
  console.error(`  · devDependencies 的 @deepseek-ai/dsh* 统一写精确版本（当前真值 ${devVersion ?? '未知'}）`)
  console.error('  · pnpm-workspace.yaml 的 overrides / minimumReleaseAgeExclude 与 devDependencies 精确版本一致')
  console.error('  · README 环境要求行写同一 peer 范围')
  console.error('  · 插件 manifest 只声明 peerDependencies；engines.dsh 只能出现在派生处（market/index.json）')
  process.exit(1)
}

const peerCount = [...peerDeclarations.values()].reduce((total, places) => total + places.length, 0)
const devCount = [...devDeclarations.values()].reduce((total, places) => total + places.length, 0)
console.error(
  `check-dsh-pin: ✅ ${plugins.length} 个活跃插件的 peer 范围一致为 "${PEER_RANGE}"`
  + `，devDeps 精确为 "${devVersion}"（peer ${peerCount} 处 / dev ${devCount} 处 / overrides ${overrides.length} 条`
  + ` / 发布年龄放行 ${releaseAgeExclude.length} 条 / README ${readmes.length} 份 / engines.dsh 未声明）`,
)
