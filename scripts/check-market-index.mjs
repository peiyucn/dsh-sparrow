

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import { activePluginNames, repoRoot } from './plugin-set.mjs'
import { BRANDED_PLUGINS, deriveDshRange } from './market-index.mjs'

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


const active = activePluginNames()
const expected = new Map(active.map((dirName) => {
  const manifest = readJson(join(repoRoot, 'plugins', dirName, 'package.json'))
  return [manifest.name, dirName]
}))
const listed = new Map(index.plugins.map((plugin) => [plugin.name, plugin]))

for (const [name, dirName] of expected) {
  if (listed.has(name)) continue




  if (snapshot[name] === undefined) {
    console.warn(`check-market-index: ⚠️ 活跃插件 ${dirName}（${name}）从未发布，暂不在索引里；首次发布成功后由 market 工作流自动收录`)
    continue
  }
  fail(`判据 1 失败：活跃插件 ${dirName}（${name}）不在索引里`)
}
for (const name of listed.keys()) {
  if (!expected.has(name)) fail(`判据 1 失败：索引里有 ${name}，但它不是活跃插件（退役插件不得进索引）`)
}

for (const plugin of index.plugins) {
  const dirName = expected.get(plugin.name)
  if (dirName === undefined) continue


  if (typeof plugin.description?.en !== 'string' || plugin.description.en === '') {
    fail(`判据 2 失败：${plugin.name} 缺英文描述`)
  }
  if (typeof plugin.description?.zh !== 'string' || plugin.description.zh === '') {
    fail(`判据 2 失败：${plugin.name} 缺中文描述（在 market-index.mjs 的 ZH_DESCRIPTIONS 补一条）`)
  }
  if (!Array.isArray(plugin.metadata?.labels) || plugin.metadata.labels.length === 0) {
    fail(`判据 2 失败：${plugin.name} 没有能力标签（在 market-index.mjs 的 PLUGIN_LABELS 补一条）`)
  }



  if (BRANDED_PLUGINS.includes(dirName)) {
    if (typeof plugin.title?.en !== 'string' || plugin.title.en === '') {
      fail(`判据 2b 失败：${plugin.name} 缺英文标题（在 market-index.mjs 的 BRANDING 补 title）`)
    }
    if (typeof plugin.title?.zh !== 'string' || plugin.title.zh === '') {
      fail(`判据 2b 失败：${plugin.name} 缺中文标题（在 market-index.mjs 的 BRANDING 补 title.zh）`)
    }
    if (typeof plugin.icon !== 'string' || plugin.icon === '') {
      fail(`判据 2b 失败：${plugin.name} 缺图标（在 market-index.mjs 的 BRANDING 补 icon 文件）`)
    }
    if (typeof plugin.homepage !== 'string' || plugin.homepage === '') {
      fail(`判据 2b 失败：${plugin.name} 缺主页（在 market-index.mjs 的 BRANDING 补 homepage）`)
    }
  }


  const versions = plugin.versions.map((version) => version.version)
  versions.forEach((version, position) => {
    if (semver.valid(version) === null) fail(`判据 4 失败：${plugin.name} 的版本 ${JSON.stringify(version)} 不是合法 SemVer`)
    if (position > 0 && semver.gt(version, versions[position - 1])) {
      fail(`判据 4 失败：${plugin.name} 的版本未按降序排列（${versions[position - 1]} 之后是 ${version}）`)
    }
  })





  const current = readJson(join(repoRoot, 'plugins', dirName, 'package.json')).version
  const publishedVersions = snapshot[plugin.name] ?? {}
  if (Object.hasOwn(publishedVersions, current) && !versions.includes(current)) {
    fail(`判据 4 失败：${plugin.name} 的当前版本 ${current} 已在 npm 发布，却不在索引里（重新跑生成脚本）`)
  }


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
    const derived = deriveDshRange(peerRanges)
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
