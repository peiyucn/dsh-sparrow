#!/usr/bin/env node
/**
 * 生成 DSH 插件市场索引（format 1），产物 `market/index.json` 由 GitHub Pages 发布。
 *
 * 用法：node scripts/market-index.mjs
 *
 * 数据只来自 npm registry 的 packument：**只读，不下载 tarball、不执行任何插件代码**。
 * 版本清单 = 该包在 registry 上声明了 `dsh.bundle.patch` 的全部版本。
 *
 * ⚠️ `engines.dsh` 必须写，且必须由 peer 派生（见 AGENTS《版本门》）：
 * 市场索引格式没有 peers 字段，而 DSH 判兼容时造的是「只含 engines.dsh」的合成 manifest，
 * 省略该字段等于宣称「任何 DSH 版本都兼容」——会把不兼容的版本标成可装。
 * 本仓库的包只声明 peerDependencies，故索引里的值一律从 peer 派生、不得手写。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import semver from 'semver'
import { activePluginNames, repoRoot } from './plugin-set.mjs'

const REGISTRY = 'https://registry.npmjs.org/'
const REPO_URL = 'https://github.com/peiyucn/dsh-sparrow'
/** 本仓库插件的维护者（`@dsh-sparrow` 组织的唯一发布方）；包 manifest 未声明 author，这里如实标注仓库主人。 */
const AUTHOR = 'peiyucn'
const OUTPUT = join(repoRoot, 'market', 'index.json')
/**
 * 已发布版本的 peer 声明快照：`{ [包名]: { [版本]: { [dsh peer 名]: range } } }`。
 * 守卫 `check-market-index` 靠它离线核对 `engines.dsh` 是否等于 peer 派生值——索引里能看到的
 * 只有派生结果，看不到派生来源，所以来源必须单独留档（与 index.json 同一次生成、同一个 commit）。
 */
const PEER_SNAPSHOT = join(repoRoot, 'market', 'peer-snapshot.json')

/** 参与 `engines.dsh` 派生的官方包：`@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*`。 */
const isDshPackage = (name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')

/** `workspace:` 协议值表示「当前宿主版本」，不构成范围约束。 */
const WORKSPACE_VALUES = new Set(['workspace:*', 'workspace:^', 'workspace:~'])

/** 索引顶层声明的标签：向用户标注插件的能力面（本仓库的安全基线口径）。 */
const LABELS = {
  network: { title: { en: 'Network access', zh: '联网' } },
  llm: { title: { en: 'Calls a model', zh: '调用模型' } },
  credentials: { title: { en: 'Reads credentials', zh: '读取凭据' } },
  'fs-write': { title: { en: 'Writes files', zh: '写文件' } },
  session: { title: { en: 'Reads sessions', zh: '读取会话' } },
  ui: { title: { en: 'UI only', zh: '仅界面' } },
}

/**
 * 每个插件的能力标签（人工维护，依据插件 README 的行为描述）。
 * 新增插件必须补一条 —— `check:market-index` 会校验「每个活跃插件都有标注」。
 */
const PLUGIN_LABELS = {
  'dsh-chat-fim': ['network', 'llm', 'session'],
  'dsh-archive-manage': ['session', 'fs-write'],
  'dsh-file-manage': ['network', 'credentials'],
  'dsh-codebuddy-credits': ['network', 'llm', 'credentials'],
  'dsh-theme-tone': ['ui'],
}

/**
 * 中文描述（索引卡片按界面语言显示）。键为插件目录名。
 * 英文描述直接取 npm 上的 `description`；新增插件必须补中文 —— 守卫会校验。
 */
const ZH_DESCRIPTIONS = {
  'dsh-chat-fim': '输入框续写联想：停顿后浮现建议卡，Tab 采纳、Esc 关闭；触发灵敏度三档可调',
  'dsh-archive-manage': '会话归档管理：取消归档、移入回收站、彻底删除、从回收站还原，父会话与子会话整体操作',
  'dsh-file-manage': 'DeepSeek Files API 云端文件管理：分页列表、配额条、单条删除、一键复制 file_id',
  'dsh-codebuddy-credits': 'CodeBuddy 额度 LLM provider：用官方 API Key 直连，在 DSH 里选用 CodeBuddy 的模型额度',
  'dsh-theme-tone': '明暗主题之下的色调层与对话区布局优化：每轴一款「官方默认」加若干色调，含顶栏与输入框玻璃效果',
}

/**
 * 从包 manifest 派生 `engines.dsh`。
 *
 * 规则（与官方 generator 同口径，简化到本仓库实际用到的情形）：
 * 1. manifest 自身声明了 `engines.dsh` 就原样用（本仓库不声明，留给将来）；
 * 2. 否则取 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的 peer range，跳过 `workspace:` 值；
 * 3. 去重后多个 range 用**空格**连接（semver 的 AND —— `&&` 不是 semver 语法，会被判非法比较符）；
 * 4. 全为 `*` 或没有 dsh peer 时返回 undefined（格式允许省略 = 任何版本都兼容）。
 *
 * @param {object} manifest - 一个版本的 package.json。
 * @returns {string | undefined} 派生出的 SemVer range。
 */
export function dshRangeOf(manifest) {
  const declared = manifest.engines?.dsh
  if (typeof declared === 'string' && declared.trim() !== '') return declared.trim()

  const ranges = []
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!isDshPackage(name) || typeof range !== 'string') continue
    if (WORKSPACE_VALUES.has(range)) continue
    if (range.startsWith('workspace:')) {
      throw new Error(`peer ${name} 的值 ${JSON.stringify(range)} 无法派生成 SemVer range`)
    }
    if (!ranges.includes(range)) ranges.push(range)
  }
  if (ranges.length === 0) return undefined
  if (ranges.every((range) => range === '*')) return undefined

  const derived = ranges.join(' ')
  if (semver.validRange(derived) === null) {
    throw new Error(`peer 派生出的 range 不是合法 SemVer：${JSON.stringify(derived)}`)
  }
  return derived
}

/** 读 npm registry 的 packument（一个包的全部版本与元数据）。 */
async function fetchPackument(name) {
  // scoped 包名（`@scope/name`）整段编码成 `%40scope%2Fname`：一个 encodeURIComponent
  // 就把所有需要转义的字符处理掉，不做手写的「替换某个字符」——那种写法只替换第一处，
  // 且漏掉其它元字符（CodeQL js/incomplete-sanitization）。
  const url = `${REGISTRY}${encodeURIComponent(name)}`
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status}`)
  return response.json()
}

/** 取一个 manifest 里参与派生的 dsh peer 映射（供快照留档）。 */
function dshPeersOf(manifest) {
  const peers = {}
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!isDshPackage(name) || typeof range !== 'string') continue
    peers[name] = range
  }
  return peers
}

/** 把一个包的全部可安装版本折成一条索引条目；显示字段取最高版本。 */
function entryOf(dirName, packument, peerSnapshot) {
  const versions = []
  for (const [version, manifest] of Object.entries(packument.versions ?? {})) {
    if (!manifest.dsh?.bundle?.patch) continue
    const publishedAt = packument.time?.[version]
    if (typeof publishedAt !== 'string') continue
    const engines = dshRangeOf(manifest)
    peerSnapshot[version] = dshPeersOf(manifest)
    versions.push({
      version,
      publishTimestamp: Math.floor(Date.parse(publishedAt) / 1000),
      source: { type: 'npm' },
      ...(engines === undefined ? {} : { engines: { dsh: engines } }),
    })
  }
  if (versions.length === 0) {
    throw new Error(`${packument.name} 在 registry 上没有任何版本声明 dsh.bundle.patch`)
  }
  versions.sort((left, right) => semver.rcompare(left.version, right.version))

  const latestTag = packument['dist-tags']?.latest
  const latest = packument.versions?.[latestTag] ?? packument.versions?.[versions[0].version]
  const description = typeof latest.description === 'string' ? latest.description : ''
  const zh = ZH_DESCRIPTIONS[dirName]
  const localized = description === ''
    ? undefined
    : zh === undefined ? { en: description } : { en: description, zh }

  return {
    name: latest.name ?? packument.name,
    ...(localized === undefined ? {} : { description: localized }),
    author: AUTHOR,
    repository: { url: REPO_URL, directory: `plugins/${dirName}` },
    metadata: {
      keywords: Array.isArray(latest.keywords) ? latest.keywords : [],
      labels: PLUGIN_LABELS[dirName] ?? [],
      sortKeys: {},
    },
    versions,
  }
}

/** 生成整份索引（活跃插件 = `scripts/plugin-set.mjs` 的单一真值）。 */
export async function buildIndex() {
  const plugins = []
  /** @type {Record<string, Record<string, Record<string, string>>>} 包名 → 版本 → dsh peer 映射 */
  const peers = {}
  for (const dirName of activePluginNames()) {
    const manifestPath = join(repoRoot, 'plugins', dirName, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const packument = await fetchPackument(manifest.name)
    const peerSnapshot = {}
    const entry = entryOf(dirName, packument, peerSnapshot)
    peers[entry.name] = peerSnapshot
    plugins.push(entry)
  }
  return {
    index: {
      format: 1,
      title: { en: 'dsh-sparrow', zh: 'dsh-sparrow' },
      description: {
        en: 'Small DeepSeek Harness web plugins published under @dsh-sparrow.',
        zh: '@dsh-sparrow 下的 DeepSeek Harness Web 插件小合集。',
      },
      metadata: { categories: {}, labels: LABELS, sortKeys: {} },
      plugins,
    },
    peers,
  }
}

async function main() {
  const { index, peers } = await buildIndex()
  mkdirSync(dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, `${JSON.stringify(index, null, 2)}\n`)
  writeFileSync(PEER_SNAPSHOT, `${JSON.stringify(peers, null, 2)}\n`)
  const versionCount = index.plugins.reduce((total, plugin) => total + plugin.versions.length, 0)
  console.log(
    `market-index: 写入 ${relative(repoRoot, OUTPUT)} 与 ${relative(repoRoot, PEER_SNAPSHOT)}`
    + `（${index.plugins.length} 个插件 / ${versionCount} 个版本）`,
  )
}

if (import.meta.main) await main()
