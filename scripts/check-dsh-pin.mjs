#!/usr/bin/env node
/**
 * 守卫：**五个活跃插件钉的官方 dsh 版本线必须只有一个真值，而且必须是精确版本。**
 *
 * ## 为什么需要它
 *
 * 本插件群与官方 dsh 的兼容口径是**精确匹配**（不是范围）：`peerDependencies` 里
 * 对每个 `@deepseek-ai/dsh-*` 写死一个确切版本，官方换线就整批跳过（fail-safe）。
 * 这个口径有一个必然的运维后果：
 *
 * > **每次跟版都要把同一个版本号改在很多个地方。** 现状是 5 个 `package.json` 里共
 * > **83** 条声明（`peerDependencies` + `devDependencies` 的 `@deepseek-ai/dsh-*` 条目；
 * > 另加每个插件自己的 `version` 字段 —— 按「版本线镜像官方 dsh」它等于同一个值，
 * > 所以 grep 这个版本串会看到 **88** 处），外面还有 `pnpm-workspace.yaml` 的
 * > `overrides` 闭包与 `minimumReleaseAgeExclude` 共 **167** 处，加上 12 份 README
 * > 的环境要求行。**漏掉任何一处都不会让测试变红** —— 插件照旧能跑（因为 peer 只要
 * > 有一处不合规就整体跳过，而 devDependencies 只影响本地类型），
 * > 直到某个用户从插件管理器装包时被安装门拒掉，或者本地类型对不上官方运行时。
 *
 * 2026-09-29 的 rc.1 → rc.2 跟版就是手工改的 269 处。**靠人记不住，必须机器守。**
 *
 * ## 四条判据
 *
 * 1. **单一真值**：所有活跃插件声明的 `@deepseek-ai/dsh-*` 版本只允许有**一个**取值。
 * 2. **精确**：该取值必须是精确 semver（没有 `^` / `~` / `>=` / `*` / 区间）。
 * 3. **周边一致**：`pnpm-workspace.yaml` 的 `overrides` 与 `minimumReleaseAgeExclude`
 *    里所有 `@deepseek-ai/dsh*` 条目必须等于该真值（否则装包时会在供应链策略或
 *    版本对齐上出岔）。
 * 4. **文档一致**：根 README 与每个活跃插件的 README（中英双份）里**环境要求行本身**
 *    必须写明该真值（防"代码升了线、文档还写着旧线"）。真值不唯一时判据 4 不跳过，
 *    改为逐份报告所有不一致的版本串（详见下方判据 4 段落的注释）。
 *
 * ⚠️ **已退役插件不在判据内**：它们不跟版本线（`dsh-nav-pin` 停在 `0.1.5-rc.2`），
 * 名单取自 `plugin-set.mjs`（与 `verify-all.mjs` 同一份，防漂移）。
 *
 * 退出码：0 = 一致；1 = 有不一致（逐条打印是哪个文件、哪个字段）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePluginNames, isVersionGatedDshPackage, repoRoot } from './plugin-set.mjs'

/** 精确 semver（允许预发布尾段与 build 元数据），**不允许**范围前缀。 */
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const violations = []
const fail = (message, detail) => violations.push(detail ? `${message}\n    ${detail}` : message)

const plugins = activePluginNames()

/** 声明面：`packageJson: <插件> <字段> <包名>` → 版本。 */
const declared = new Map() // version -> [{ where }]
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
//
// **两处加固，都是补已实测的可静默绕过：**
//
// ① **真值不唯一时不再跳过判据 4**。原实现在 `truth !== null` 时才跑这一段，于是
//    「活跃插件声明了 2 个不同版本」这种**最该全量报警**的场景里，判据 4 整条静默
//    消失（实测：把某份 README 的环境要求行整个删掉，输出里只剩判据 1，判据 4 无影）。
//    现在：真值唯一 → 逐份比对真值；真值不唯一 → **仍然逐份检查并报告**所有
//    不一致的版本串，让两种病一次看全。
//
// ② **按行校验要求行本身**，不再全文 `includes(truth)`。原实现只要文件**别处**
//    （注释 / 围栏 / 链接 / 另一处 pin）出现真值就通过 —— 把环境要求行写成错的版本
//    照样绿（实测：theme-tone README 有两处 pin，只改第一处仍通过）。
//
// **「环境要求行」的识别规则**：一行同时 ①提到 `dsh`（词边界、大小写不敏感）
// ②含精确 semver。实测在现存 12 份 README 上命中**恰好**是真要求行：
// 10 份各 1 行，theme-tone 各 2 行（L13 的 Requires 与 L35 的 Targets，两处都是真 pin），
// 其余行（Changelog 链接、历史版本叙述）零误入。
//
// ⚠️ **必须逐行核，不能全文 includes**：这正是 ② 要堵的洞。
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
     * 这一行是否在说**官方 dsh 宿主**。
     *
     * ⚠️ 不能只测 `\bdsh\b`：`@dsh-sparrow/dsh-file-manage@0.2.0-rc.2` 这种**本插件自己的
     * 包名**里就含 `dsh`（作用域名），而按本仓库「版本线镜像官方 dsh」的口径，插件自己的
     * 版本号**常常就等于**当前真值 —— 于是一条安装命令就能冒充"环境要求行"，
     * 把一条不写版本线的要求行喂饱、判据 4 静默放行（实测：EN 侧删掉要求行后，
     * 顶部加一行 `Install: npm i @dsh-sparrow/dsh-file-manage@0.2.0-rc.2` 即通过）。
     *
     * 故**只摘掉本仓库自己的 scoped 包名**（`@dsh-sparrow/…`），官方包名
     * `@deepseek-ai/dsh*` **保持原样** —— 后者本来就是"在说官方宿主"的正当写法，
     * 摘掉它会把一条合法要求行（`Requires @deepseek-ai/dsh 0.2.0-rc.2`）误判成
     * "找不到要求行"，白报一次红。
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

    // ① 真值不唯一：没有单一基准可比，就把每份 README 要求行里的版本串**摊开报告**，
    //    而不是整段跳过。
    if (truth === null) {
      const found = [...new Set(requirementLines.flatMap(l => l.versions))]
      if (found.length === 0) {
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行里没有任何版本串（真值不唯一，无法比对）`, where())
      } else if (found.length > 1) {
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行里有多个版本串 ${found.map(v => `"${v}"`).join(' / ')}（真值不唯一，无法比对）`, where())
      } else if (!declared.has(found[0])) {
        // 这个版本串在活跃插件里谁都没声明过 —— 是个凭空写出来的线。
        fail(`判据 4（文档一致）失败：${rel} 的环境要求行写着 "${found[0]}"，但没有任何活跃插件声明这个版本（真值不唯一）`, where())
      }
      continue
    }

    // ② 真值唯一：要求行**本身**必须写明真值，且不得夹带别的版本串。
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
