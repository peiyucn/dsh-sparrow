#!/usr/bin/env node
/**
 * 生成 DSH 插件市场索引（format 1），产物 `market/index.json` 由 GitHub Pages 发布。
 *
 * 用法：node scripts/market-index.mjs
 *
 * 数据只来自 npm registry 的 packument：**只读，不下载 tarball、不执行任何插件代码**。
 * 版本清单 = 该包在 registry 上声明了 `dsh.bundle.patch` 的全部版本。
 *
 * ⚠️ **npm 传播延迟**：`npm publish` 返回成功时 registry 上可能还查不到该版本（官方提示
 * "may take a few minutes"）。本仓库的 market 流水线由 Publish 完成后触发，若不等传播就生成，
 * 索引会**静默漏收录**新版本且守卫全绿（快照与索引同源，一起缺，谁也发现不了）——该问题已实测
 * 出现两次。故支持「等期待版本在 registry 可见再生成」：
 *   `MARKET_INDEX_EXPECT=@scope/name@1.2.3`      显式指定一个版本
 *   `MARKET_INDEX_EXPECT_REPO_VERSION=1`        取各活跃插件仓库内当前版本（CI 用这个）
 *   `MARKET_INDEX_EXPECT_WAIT_MS=<毫秒>`        等待上限，默认 0 = 不等
 * 超时即**非零退出**（fail-closed）：宁可这次不部署，也不把缺版本的索引推上线。
 *
 * ⚠️ `engines.dsh` 必须写，且必须由 peer 派生（见 AGENTS《版本门》）：
 * 市场索引格式没有 peers 字段，而 DSH 判兼容时造的是「只含 engines.dsh」的合成 manifest，
 * 省略该字段等于宣称「任何 DSH 版本都兼容」——会把不兼容的版本标成可装。
 * 本仓库的包只声明 peerDependencies，故索引里的值一律从 peer 派生、不得手写。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/** 等 npm 传播时两次查询的间隔。 */
const POLL_INTERVAL_MS = 5_000

/**
 * 解析「期待在 registry 可见」的包与版本，两种来源（都用于 CI 等 npm 传播）：
 *
 *  - `MARKET_INDEX_EXPECT=@scope/name@1.2.3`：显式指定（精确、便于手工重跑与测试）；
 *  - `MARKET_INDEX_EXPECT_REPO_VERSION=1`：取**仓库内所有活跃插件**当前 `package.json` 版本。
 *
 * ⚠️ 为什么不在 CI 里解析触发的 tag：`workflow_run` 事件的 `head_branch` 对 tag 触发的
 * upstream 返回的是 `main`（实测），拿不到 tag 名，故改为与 tag 无关的口径。
 *
 * @returns {{ name: string, version: string }[]} 期待项列表（可能为空）。
 */
export function expectationsFromEnv(env = process.env) {
  const expectations = []
  const explicit = env.MARKET_INDEX_EXPECT
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const at = explicit.trim().lastIndexOf('@')
    if (at <= 0) {
      throw new Error(`MARKET_INDEX_EXPECT 无法解析（应形如 @scope/name@1.2.3）：${JSON.stringify(explicit)}`)
    }
    const name = explicit.trim().slice(0, at)
    const version = explicit.trim().slice(at + 1)
    if (semver.valid(version) === null) {
      throw new Error(`MARKET_INDEX_EXPECT 的版本不是合法 SemVer：${JSON.stringify(version)}`)
    }
    expectations.push({ name, version })
  }
  if (env.MARKET_INDEX_EXPECT_REPO_VERSION === '1') {
    for (const dirName of activePluginNames()) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, 'plugins', dirName, 'package.json'), 'utf8'))
      // 只等「仓库内版本」这一件事：它未必已发布（bump 到发布之间），调用方用 waitMs=0 查一次即可。
      if (typeof manifest.name !== 'string' || semver.valid(manifest.version) === null) continue
      expectations.push({ name: manifest.name, version: manifest.version })
    }
  }
  return expectations
}

/**
 * 等某个版本在 registry 上可见（npm 传播可能滞后）。
 *
 * 判定「可见」= 该版本出现在 packument 的 `versions` 里**且**有 `time` 记录——
 * 与 `entryOf` 收录版本的条件一致，避免「查到了但生成时又被跳过」的空等。
 *
 * @param {string} name - 包名。
 * @param {string} version - 版本号。
 * @param {number} waitMs - 等待上限（0 = 不等待，只查一次）。
 * @returns {Promise<object>} 含该版本的 packument。
 */
async function fetchPackumentWhenVisible(name, version, waitMs) {
  const deadline = Date.now() + Math.max(0, waitMs)
  for (let attempt = 1; ; attempt++) {
    const packument = await fetchPackument(name)
    const visible = packument.versions?.[version] !== undefined && typeof packument.time?.[version] === 'string'
    if (visible) {
      if (attempt > 1) console.log(`market-index: ${name}@${version} 已可见（第 ${attempt} 次查询）`)
      return packument
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      throw new Error(
        `${name}@${version} 在 registry 上不可见（已等待 ${Math.round(waitMs / 1000)}s，查询 ${attempt} 次）。`
        + 'npm 传播未完成或发布失败——拒绝生成缺版本的索引，请稍后重跑本工作流。',
      )
    }
    // 硬等：这是 CI 里等上游传播的确定性场景，不能用事件驱动（没有可等的事件源）。
    console.log(`market-index: 等待 ${name}@${version} 出现在 registry（第 ${attempt} 次查询，未命中）`)
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

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

/**
 * 生成整份索引（活跃插件 = `scripts/plugin-set.mjs` 的单一真值）。
 *
 * @param {{ waitMs?: number, expectations?: { name: string, version: string }[] }} [options]
 *   `expectations` 里的包会先等到对应版本在 registry 可见再收录（见文件头的传播延迟说明）。
 *   用「列表」而不是单个：一次 Publish 可能有多个包的目标版本需要等。
 */
export async function buildIndex(options = {}) {
  const waitMs = options.waitMs ?? 0
  const expectations = options.expectations ?? []
  const plugins = []
  /** @type {Record<string, Record<string, Record<string, string>>>} 包名 → 版本 → dsh peer 映射 */
  const peers = {}
  for (const dirName of activePluginNames()) {
    const manifestPath = join(repoRoot, 'plugins', dirName, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    // 同一个包可能有多个期待版本（理论上不会有，但按列表处理更稳）：逐个等到可见。
    const wanted = expectations.filter((expectation) => expectation.name === manifest.name)
    let packument
    for (const expectation of wanted) {
      packument = await fetchPackumentWhenVisible(manifest.name, expectation.version, waitMs)
    }
    packument ??= await fetchPackument(manifest.name)
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
  const expectations = expectationsFromEnv()
  // 默认不等待：本地 / 定时 / 手动路径立刻生成（它们没有「刚 publish 完」的时序问题）。
  const waitMs = Number(process.env.MARKET_INDEX_EXPECT_WAIT_MS ?? '0')
  if (!Number.isFinite(waitMs) || waitMs < 0) {
    throw new Error(`MARKET_INDEX_EXPECT_WAIT_MS 必须是 >= 0 的数字，收到 ${JSON.stringify(process.env.MARKET_INDEX_EXPECT_WAIT_MS)}`)
  }
  if (expectations.length > 0) {
    console.log(
      `market-index: 期待 ${expectations.map((expectation) => `${expectation.name}@${expectation.version}`).join('、')}`
      + `（最多等 ${Math.round(waitMs / 1000)}s）`,
    )
  }
  const { index, peers } = await buildIndex({ waitMs, expectations })
  mkdirSync(dirname(OUTPUT), { recursive: true })

  // 后置自检（fail-closed）：期待的那些版本必须真的进了索引。
  // 放这里而不是只靠等待，是因为「可见但被 entryOf 跳过」（如缺 dsh.bundle.patch）同样会静默漏收录。
  const missing = expectations.filter((expectation) => {
    const listed = index.plugins.find((plugin) => plugin.name === expectation.name)
    return !(listed?.versions.some((version) => version.version === expectation.version) ?? false)
  })
  if (missing.length > 0) {
    throw new Error(
      `${missing.map((expectation) => `${expectation.name}@${expectation.version}`).join('、')} 没有进入索引`
      + '（registry 上可见，但该版本未声明 dsh.bundle.patch 或缺失 time 记录）。'
      + '拒绝写入缺版本的索引：请检查该版本是否按发布流程打包。',
    )
  }

  writeFileSync(OUTPUT, `${JSON.stringify(index, null, 2)}\n`)
  writeFileSync(PEER_SNAPSHOT, `${JSON.stringify(peers, null, 2)}\n`)
  const versionCount = index.plugins.reduce((total, plugin) => total + plugin.versions.length, 0)
  console.log(
    `market-index: 写入 ${relative(repoRoot, OUTPUT)} 与 ${relative(repoRoot, PEER_SNAPSHOT)}`
    + `（${index.plugins.length} 个插件 / ${versionCount} 个版本）`,
  )
}

if (import.meta.main) await main()
