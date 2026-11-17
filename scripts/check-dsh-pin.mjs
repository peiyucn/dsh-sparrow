

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePluginNames, isVersionGatedDshPackage, repoRoot } from './plugin-set.mjs'


const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const violations = []
const fail = (message, detail) => violations.push(detail ? `${message}\n    ${detail}` : message)

const plugins = activePluginNames()


const declared = new Map()
const addDeclared = (version, where) => {
  if (!declared.has(version)) declared.set(version, [])
  declared.get(version).push(where)
}


for (const name of plugins) {
  const file = join(repoRoot, 'plugins', name, 'package.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
    for (const [pkg, version] of Object.entries(json[section] ?? {})) {
      if (!isVersionGatedDshPackage(pkg)) continue
      addDeclared(version, `plugins/${name}/package.json  ${section}  ${pkg}`)
      if (!EXACT_SEMVER.test(version)) {
        fail(`判据 2（精确版本）失败：${pkg} 写的是范围 "${version}"`, `plugins/${name}/package.json  ${section}`)
      }
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

if (declared.size > 1) {
  fail(
    `判据 1（单一真值）失败：活跃插件声明了 ${declared.size} 个不同的官方 dsh 版本`,
    [...declared.entries()]
      .sort()
      .map(([v, places]) => `"${v}" ← ${places.length} 处，例如 ${places[0]}`)
      .join('\n    '),
  )
}

const truth = declared.size === 1 ? [...declared.keys()][0] : null


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
  const m = /^\s+"?(@deepseek-ai\/dsh[^"]*)"?:\s*"?([^"\s]+)"?\s*$/u.exec(line)
  return m && isVersionGatedDshPackage(m[1]) ? { pkg: m[1], version: m[2] } : null
})

const releaseAgeExclude = scanWorkspace('minimumReleaseAgeExclude', (line) => {
  const m = /^\s+-\s*'?(@deepseek-ai\/dsh[^@']*)@([^'@\s]+)'?\s*$/u.exec(line)
  return m && isVersionGatedDshPackage(m[1]) ? { pkg: m[1], version: m[2] } : null
})

for (const { pkg, version } of [...overrides, ...releaseAgeExclude]) {
  if (truth !== null && version !== truth) {
    fail(
      `判据 3（周边一致）失败：${pkg} 写的是 "${version}"，活跃插件的真值是 "${truth}"`,
      `pnpm-workspace.yaml`,
    )
  }
}
if (overrides.length === 0) fail('判据 3 失败：pnpm-workspace.yaml 的 overrides 里没有任何 @deepseek-ai/dsh* 条目')





const readmes = [
  'README.md',
  'README.zh-CN.md',
  ...plugins.flatMap(name => [`plugins/${name}/README.md`, `plugins/${name}/README.zh-CN.md`]),
]
{
  const SEMVER_ANY = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/gu

  for (const rel of readmes) {
    let text
    try {
      text = readFileSync(join(repoRoot, rel), 'utf8')
    } catch {
      fail(`判据 4（文档一致）失败：读不到 ${rel}`)
      continue
    }


    const mentionsHarnessDsh = (line) =>
      /\bdsh\b/iu.test(line.replace(/@dsh-sparrow\/[\w.-]+/gu, ' '))


    const requirementLines = text.split(/\r?\n/u)
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => mentionsHarnessDsh(line) && /\b\d+\.\d+\.\d+/u.test(line))
      .map(({ line, no }) => ({ line, no, versions: [...new Set([...line.matchAll(SEMVER_ANY)].map(m => m[0]))] }))

    const where = () => requirementLines.map(l => `L${l.no}: ${l.line}`).join(' ｜ ')

    if (requirementLines.length === 0) {
      fail(
        `判据 4（文档一致）失败：${rel} 里找不到环境要求行（应有一行同时提到 dsh 与版本号）`,
        truth !== null ? `期望该行写明真值 "${truth}"` : '（真值不唯一，无法比对具体版本）',
      )
      continue
    }


    if (truth === null) {
      const found = [...new Set(requirementLines.flatMap(l => l.versions))]
      if (found.length === 0) {
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行里没有任何版本串（真值不唯一，无法比对）`, where())
      } else if (found.length > 1) {
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行里有多个版本串 ${found.map(v => `"${v}"`).join(' / ')}（真值不唯一，无法比对）`, where())
      } else if (!declared.has(found[0])) {

        fail(`判据 4（文档一致）失败：${rel} 的环境要求行写着 "${found[0]}"，但没有任何活跃插件声明这个版本（真值不唯一）`, where())
      }
      continue
    }


    const here = [...new Set(requirementLines.flatMap(l => l.versions))]
    if (!here.includes(truth)) {
      fail(
        `判据 4（文档一致）失败：${rel} 的环境要求行没有写明真值 "${truth}"`,
        where(),
      )
    }
    const strays = here.filter(v => v !== truth)
    if (strays.length > 0) {
      fail(
        `判据 4（文档一致）失败：${rel} 的环境要求行里出现了非真值版本串 ${strays.map(v => `"${v}"`).join(' / ')}（真值 "${truth}"）`,
        where(),
      )
    }
  }
}


if (violations.length > 0) {
  console.error('check-dsh-pin: ❌ 官方 dsh 版本 pin 不一致\n')
  for (const v of violations) console.error(`  · ${v}`)
  console.error('\n修法：')
  console.error('  · 跟版时把真值**一次性**改遍：plugins/*/package.json 的 peer + devDependencies')
  console.error('  · pnpm-workspace.yaml 的 overrides 闭包（+ 如临时存在的 minimumReleaseAgeExclude）→ 再 pnpm install 重算 lockfile')
  console.error(`  · README 环境要求行（根 README 中英各 1 行 + 每个活跃插件中英各 1 行；当前 ${plugins.length} 个插件 = ${readmes.length} 份文件）`)
  console.error('  · 插件 manifest 只声明 peerDependencies；engines.dsh 只能出现在派生处（market/index.json）')
  console.error('  · 已删除的退役插件不在仓库内；RETIRED_PLUGINS 名单保持为空')
  process.exit(1)
}

const declarations = [...declared.values()].reduce((n, places) => n + places.length, 0)
console.error(
  `check-dsh-pin: ✅ ${plugins.length} 个活跃插件的官方 dsh pin 一致为 "${truth}"`
  + `（声明 ${declarations} 处 / overrides ${overrides.length} 条 / 发布年龄放行 ${releaseAgeExclude.length} 条 / README ${readmes.length} 份 / engines.dsh 未声明）`,
)
