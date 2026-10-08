#!/usr/bin/env node
/**
 * 守卫：**活跃插件钉的官方 dsh 版本线必须只有一个真值，而且必须是精确版本**（兼容口径是精确匹配，不是范围）。
 * 跟版要同时改：插件 `package.json` 的 peer + devDependencies、`pnpm-workspace.yaml` 的 `overrides` 与
 * `minimumReleaseAgeExclude`、根与各活跃插件的 12 份 README 环境要求行 —— **漏任何一处测试都不会红**，
 * 直到用户从插件管理器装包时被安装门拒掉。判据 1 单一真值 / 2 精确 / 3 周边一致 / 4 文档一致。
 * ⚠️ 已退役插件不在判据内（不跟版本线，名单取自 `plugin-set.mjs`）。退出码：0 = 一致；1 = 有不一致。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePluginNames, isVersionGatedDshPackage, repoRoot } from './plugin-set.mjs'

/** 精确 semver：允许预发布尾段与 build 元数据，**不允许**范围前缀。 */
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const violations = []
const fail = (message, detail) => violations.push(detail ? `${message}\n    ${detail}` : message)

const plugins = activePluginNames()

/** 声明面：version → [{ where }]（各活跃插件声明该版本的 `package.json` 位置）。 */
const declared = new Map()
const addDeclared = (version, where) => {
  if (!declared.has(version)) declared.set(version, [])
  declared.get(version).push(where)
}

// ── 判据 1 + 2：活跃插件的 peer / devDependencies ──
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

// ── 判据 3：pnpm-workspace.yaml 的 overrides 与 minimumReleaseAgeExclude ──
const workspaceFile = join(repoRoot, 'pnpm-workspace.yaml')
const workspace = readFileSync(workspaceFile, 'utf8')

/** 逐行小解析器：只在指定顶层键的缩进块内取 `@deepseek-ai/dsh*` 的版本。 */
function scanWorkspace(key, extract) {
  const found = []
  let inside = false
  for (const line of workspace.split(/\r?\n/u)) {
    if (new RegExp(`^${key}:`, 'u').test(line)) {
      inside = true
      continue
    }
    // 回到顶层的另一个键 ⇒ 本块结束
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

// ── 判据 4：README 环境要求行 ──
// 「环境要求行」= 一行同时提到 `dsh`（词边界、大小写不敏感）且含精确 semver。两处不能放宽：
// ① 真值不唯一时**不跳过**判据 4，改为逐份报告所有不一致的版本串（否则最该全量报警的场景反而静默）；
// ② **按行核要求行本身**，不用全文 `includes(truth)`（否则文件别处出现真值就能让写错的要求行照样绿）。
{
  const readmes = [
    'README.md',
    'README.zh-CN.md',
    ...plugins.flatMap(name => [`plugins/${name}/README.md`, `plugins/${name}/README.zh-CN.md`]),
  ]
  const SEMVER_ANY = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/gu

  for (const rel of readmes) {
    let text
    try {
      text = readFileSync(join(repoRoot, rel), 'utf8')
    } catch {
      fail(`判据 4（文档一致）失败：读不到 ${rel}`)
      continue
    }

    /**
     * 这一行是否在说**官方 dsh 宿主**：必须先摘掉本仓库自己的 scoped 包名 —— `@dsh-sparrow/x@<版本>` 里也含
     * `dsh`，而插件自己的版本常常就等于真值，一条安装命令即可冒充要求行；官方包名 `@deepseek-ai/dsh*`
     * 保持原样（摘掉它会把合法要求行误判成"找不到要求行"）。
     */
    const mentionsHarnessDsh = (line) =>
      /\bdsh\b/iu.test(line.replace(/@dsh-sparrow\/[\w.-]+/gu, ' '))

    /** 环境要求行 + 该行出现的版本串（去重，保持出现顺序）。 */
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

    // 真值不唯一：没有单一基准可比，就把各份 README 要求行里的版本串摊开报告，而不是整段跳过。
    if (truth === null) {
      const found = [...new Set(requirementLines.flatMap(l => l.versions))]
      if (found.length === 0) {
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行里没有任何版本串（真值不唯一，无法比对）`, where())
      } else if (found.length > 1) {
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行里有多个版本串 ${found.map(v => `"${v}"`).join(' / ')}（真值不唯一，无法比对）`, where())
      } else if (!declared.has(found[0])) {
        // 凭空写出来的版本线：没有任何活跃插件声明过它。
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行写着 "${found[0]}"，但没有任何活跃插件声明这个版本（真值不唯一）`, where())
      }
      continue
    }

    // 真值唯一：要求行**本身**必须写明真值，且不得夹带别的版本串。
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

// ── 报告 ──
if (violations.length > 0) {
  console.error('check-dsh-pin: ❌ 官方 dsh 版本 pin 不一致\n')
  for (const v of violations) console.error(`  · ${v}`)
  console.error('\n修法：')
  console.error('  · 跟版时把真值**一次性**改遍：plugins/*/package.json 的 peer + devDependencies')
  console.error('  · pnpm-workspace.yaml 的 overrides 闭包 + minimumReleaseAgeExclude → 再 pnpm install 重算 lockfile')
  console.error('  · 12 份 README 的环境要求行（根 + 每个活跃插件，中英双份）')
  console.error('  · 已退役插件（plugin-set.mjs 的 RETIRED_PLUGINS）不跟版本线，不要改')
  process.exit(1)
}

const declarations = [...declared.values()].reduce((n, places) => n + places.length, 0)
console.error(
  `check-dsh-pin: ✅ ${plugins.length} 个活跃插件的官方 dsh pin 一致为 "${truth}"`
  + `（声明 ${declarations} 处 / overrides ${overrides.length} 条 / 发布年龄放行 ${releaseAgeExclude.length} 条 / README 12 份）`,
)
