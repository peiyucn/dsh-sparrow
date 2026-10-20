#!/usr/bin/env node
/**
 * 守卫：**`market/index.json` 必须与真实包一致，且 `engines.dsh` 必须等于 peer 派生值**。
 *
 * 为什么需要它：索引是「对外宣称」——用户按卡片上的版本点安装，靠的是索引里写的
 * `engines.dsh`。索引和包一旦漂了，Discover 会把不兼容的版本标成可装（或反过来），
 * 而**没有任何测试会红**：这与 `check:dsh-pin` 防的是同一类事故，只是换了产物。
 *
 * 判据（全部只在本地算，**不联网** —— 版本清单与 peer 都取自仓库内 manifest + 已发布版本快照）：
 *   1. 索引里的包名集合 = `activePluginNames()`（退役插件不得出现、活跃插件不得缺席）；
 *   2. 每个插件都有中英双语 title/description 与至少一个能力标签；
 *   3. 每个版本的 `engines.dsh` = 该版本 manifest 的 peer 派生结果（同 `market-index.mjs` 的 `dshRangeOf`）；
 *   4. 版本集合覆盖「索引生成时 registry 上所有声明了 `dsh.bundle.patch` 的版本」——
 *      离线可比对的只有仓库内 package.json 的当前版本，故判据 4 校验「当前版本在索引里」，
 *      并要求索引每个版本的 version 都是合法 SemVer、按降序排列。
 *
 * ⚠️ 判据 3 的 peer 取自 npm 已发布版本的快照文件 `market/peer-snapshot.json`（由生成脚本顺带写出）。
 *    当前 version 与仓库内 manifest 不一致时（发版流程中间态）以快照为准并给出提示。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import { activePluginNames, repoRoot } from './plugin-set.mjs'

const INDEX_PATH = join(repoRoot, 'market', 'index.json')
const SNAPSHOT_PATH = join(repoRoot, 'market', 'peer-snapshot.json')

const violations = []
const fail = (message, detail) => violations.push(detail === undefined ? message : `${message}\n    ${detail}`)

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

if (!existsSync(INDEX_PATH)) {
  console.error(`check-market-index: ❌ 缺少 ${INDEX_PATH}（先跑 node scripts/market-index.mjs）`)
  process.exit(1)
}

const index = readJson(INDEX_PATH)
const snapshot = existsSync(SNAPSHOT_PATH) ? readJson(SNAPSHOT_PATH) : {}

/** 判据 1：包名集合 == 活跃插件集合。 */
const active = activePluginNames()
const expected = new Map(active.map((dirName) => {
  const manifest = readJson(join(repoRoot, 'plugins', dirName, 'package.json'))
  return [manifest.name, dirName]
}))
const listed = new Map(index.plugins.map((plugin) => [plugin.name, plugin]))

for (const [name, dirName] of expected) {
  if (!listed.has(name)) fail(`判据 1 失败：活跃插件 ${dirName}（${name}）不在索引里`)
}
for (const name of listed.keys()) {
  if (!expected.has(name)) fail(`判据 1 失败：索引里有 ${name}，但它不是活跃插件（退役插件不得进索引）`)
}

for (const plugin of index.plugins) {
  const dirName = expected.get(plugin.name)
  if (dirName === undefined) continue

  // 判据 2：双语描述 + 能力标签。
  if (typeof plugin.description?.en !== 'string' || plugin.description.en === '') {
    fail(`判据 2 失败：${plugin.name} 缺英文描述`)
  }
  if (typeof plugin.description?.zh !== 'string' || plugin.description.zh === '') {
    fail(`判据 2 失败：${plugin.name} 缺中文描述（在 market-index.mjs 的 ZH_DESCRIPTIONS 补一条）`)
  }
  if (!Array.isArray(plugin.metadata?.labels) || plugin.metadata.labels.length === 0) {
    fail(`判据 2 失败：${plugin.name} 没有能力标签（在 market-index.mjs 的 PLUGIN_LABELS 补一条）`)
  }

  // 判据 4a：索引版本必须按降序、且是合法 SemVer。
  const versions = plugin.versions.map((version) => version.version)
  versions.forEach((version, position) => {
    if (semver.valid(version) === null) fail(`判据 4 失败：${plugin.name} 的版本 ${JSON.stringify(version)} 不是合法 SemVer`)
    if (position > 0 && semver.gt(version, versions[position - 1])) {
      fail(`判据 4 失败：${plugin.name} 的版本未按降序排列（${versions[position - 1]} 之后是 ${version}）`)
    }
  })

  // 判据 4b：**已在 npm 上发布过的当前版本**必须在索引里。
  // ⚠️ 不能反过来要求「仓库内当前版本必须在索引里」：版本号 bump 到发布之间有一段
  // **尚未发布**的窗口，那时 npm registry 上还没有这个版本，索引自然也不可能包含它。
  // 判据只能锚定「快照里有记录」= 「这个版本确实发布过」，否则 dev 分支每次 bump 都会误红。
  const current = readJson(join(repoRoot, 'plugins', dirName, 'package.json')).version
  const publishedVersions = snapshot[plugin.name] ?? {}
  if (Object.hasOwn(publishedVersions, current) && !versions.includes(current)) {
    fail(`判据 4 失败：${plugin.name} 的当前版本 ${current} 已在 npm 发布，却不在索引里（重新跑生成脚本）`)
  }

  // 判据 3：engines.dsh == 该版本 peer 派生值。
  const peers = snapshot[plugin.name]
  if (peers === undefined) {
    fail(`判据 3 失败：peer-snapshot.json 里没有 ${plugin.name} 的快照（重新跑生成脚本）`)
    continue
  }
  for (const version of plugin.versions) {
    const peerRanges = peers[version.version]
    if (peerRanges === undefined) {
      fail(`判据 3 失败：peer-snapshot.json 里没有 ${plugin.name}@${version.version} 的记录`)
      continue
    }
    const derived = derivedRangeOf(peerRanges)
    const declared = version.engines?.dsh
    if (derived === undefined) {
      if (declared !== undefined) {
        fail(`判据 3 失败：${plugin.name}@${version.version} 的 peer 派生不出 range，索引却写了 ${JSON.stringify(declared)}`)
      }
      continue
    }
    if (declared !== derived) {
      fail(
        `判据 3 失败：${plugin.name}@${version.version} 的 engines.dsh 与 peer 派生值不一致`,
        `索引: ${JSON.stringify(declared)}  派生: ${JSON.stringify(derived)}`,
      )
    }
  }
}

/**
 * 与 `scripts/market-index.mjs` 的 `dshRangeOf` 同口径（此处只吃快照里的 peer 映射）。
 * @param {Record<string, string>} peerRanges - `@deepseek-ai/dsh*` → range。
 * @returns {string | undefined} 派生 range。
 */
function derivedRangeOf(peerRanges) {
  const ranges = []
  for (const [name, range] of Object.entries(peerRanges)) {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
    if (['workspace:*', 'workspace:^', 'workspace:~'].includes(range)) continue
    if (!ranges.includes(range)) ranges.push(range)
  }
  if (ranges.length === 0 || ranges.every((range) => range === '*')) return undefined
  return ranges.join(' ')
}

if (violations.length > 0) {
  console.error(`\ncheck-market-index: ❌ 发现 ${violations.length} 处索引与包不一致`)
  for (const violation of violations) console.error(`  · ${violation}`)
  console.error('修法：node scripts/market-index.mjs 重新生成（不要手改 market/index.json）')
  process.exit(1)
}

console.error(
  `check-market-index: ✅ 索引与包一致（${index.plugins.length} 个插件 / `
  + `${index.plugins.reduce((total, plugin) => total + plugin.versions.length, 0)} 个版本；engines.dsh 均等于 peer 派生值）`,
)
