

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import semver from 'semver'
import { activePluginNames, repoRoot } from './plugin-set.mjs'

const REGISTRY = 'https://registry.npmjs.org/'
const REPO_URL = 'https://github.com/peiyucn/dsh-sparrow'

const AUTHOR = 'peiyucn'
const OUTPUT = join(repoRoot, 'market', 'index.json')

const PEER_SNAPSHOT = join(repoRoot, 'market', 'peer-snapshot.json')


const isDshPackage = (name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')


const POLL_INTERVAL_MS = 5_000


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

      if (typeof manifest.name !== 'string' || semver.valid(manifest.version) === null) continue
      expectations.push({ name: manifest.name, version: manifest.version })
    }
  }
  return expectations
}


async function fetchPackumentWhenVisible(name, version, waitMs) {
  const deadline = Date.now() + Math.max(0, waitMs)
  for (let attempt = 1; ; attempt++) {
    let packument
    try {
      packument = await fetchPackument(name)
    } catch (error) {
      if (isPackageNotFound(error)) {


        console.warn(`market-index: ${name} 尚未在 registry 上发布（404），跳过等待 @${version}`)
        return undefined
      }
      throw error
    }
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

    console.log(`market-index: 等待 ${name}@${version} 出现在 registry（第 ${attempt} 次查询，未命中）`)
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}


const WORKSPACE_VALUES = new Set(['workspace:*', 'workspace:^', 'workspace:~'])


const LABELS = {
  network: { title: { en: 'Network access', zh: '联网' } },
  llm: { title: { en: 'Calls a model', zh: '调用模型' } },
  credentials: { title: { en: 'Reads credentials', zh: '读取凭据' } },
  'fs-write': { title: { en: 'Writes files', zh: '写文件' } },
  session: { title: { en: 'Reads sessions', zh: '读取会话' } },
  ui: { title: { en: 'UI only', zh: '仅界面' } },
}


const PLUGIN_LABELS = {
  'dsh-chat-fim': ['network', 'llm', 'session'],
  'dsh-codebuddy-credits': ['network', 'llm', 'credentials'],
  'dsh-theme-tone': ['ui'],
  'dsh-desk-one': ['ui', 'fs-write'],
}


const ZH_DESCRIPTIONS = {
  'dsh-chat-fim': '输入框续写联想：停顿后浮现建议卡，Tab 采纳、Esc 关闭；触发灵敏度三档可调',
  'dsh-codebuddy-credits': 'CodeBuddy 额度 LLM provider：用官方 API Key 直连，在 DSH 里选用 CodeBuddy 的模型额度',
  'dsh-theme-tone': '明暗主题之下的色调层与对话区布局优化：每轴一款「官方默认」加若干色调，含顶栏与输入框玻璃效果',
  'dsh-desk-one': '同桌（Desk One）：和 DSH 共用的一张办公桌——便签、任务、只读日程，以及 AI 写、你审的笔记，都在一个面板里',
}


const BRANDING = {
  'dsh-desk-one': {
    title: { en: 'Desk One', zh: '同桌' },
    icon: 'plugins/dsh-desk-one/icon.svg',
    homepage: 'https://dsh.pyai.site',
  },
}


export const BRANDED_PLUGINS = Object.keys(BRANDING)


const ICON_MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}


function iconDataUrl(relativePath) {
  const mime = ICON_MIME[extname(relativePath).toLowerCase()]
  if (mime === undefined) throw new Error(`品牌图标扩展名不受支持（索引只接受 SVG/PNG/JPEG/WebP）：${relativePath}`)
  const bytes = readFileSync(join(repoRoot, relativePath))
  if (bytes.byteLength > 32 * 1024) throw new Error(`品牌图标超过 32 KiB 的索引格式上限：${relativePath}`)
  return `data:${mime};base64,${bytes.toString('base64')}`
}


export function deriveDshRange(peerRanges) {
  const ranges = []
  for (const [name, range] of Object.entries(peerRanges ?? {})) {
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


export function dshRangeOf(manifest) {
  const declared = manifest.engines?.dsh
  if (typeof declared === 'string' && declared.trim() !== '') return declared.trim()
  return deriveDshRange(manifest.peerDependencies)
}


async function fetchPackument(name) {



  const url = `${REGISTRY}${encodeURIComponent(name)}`
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) {

    const error = new Error(`GET ${url} → HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}


function isPackageNotFound(error) {
  return typeof error === 'object' && error !== null && error.status === 404
}


function dshPeersOf(manifest) {
  const peers = {}
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!isDshPackage(name) || typeof range !== 'string') continue
    peers[name] = range
  }
  return peers
}


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

  const brand = BRANDING[dirName]
  return {
    name: latest.name ?? packument.name,
    ...(brand?.title === undefined ? {} : { title: brand.title }),
    ...(localized === undefined ? {} : { description: localized }),
    ...(brand?.icon === undefined ? {} : { icon: iconDataUrl(brand.icon) }),
    author: AUTHOR,
    ...(brand?.homepage === undefined ? {} : { homepage: brand.homepage }),
    repository: { url: REPO_URL, directory: `plugins/${dirName}` },
    metadata: {
      keywords: Array.isArray(latest.keywords) ? latest.keywords : [],
      labels: PLUGIN_LABELS[dirName] ?? [],
      sortKeys: {},
    },
    versions,
  }
}


export async function buildIndex(options = {}) {
  const waitMs = options.waitMs ?? 0
  const expectations = options.expectations ?? []
  const plugins = []

  const skippedPackages = []

  const peers = {}
  for (const dirName of activePluginNames()) {
    const manifestPath = join(repoRoot, 'plugins', dirName, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    const wanted = expectations.filter((expectation) => expectation.name === manifest.name)
    let packument
    for (const expectation of wanted) {
      packument = await fetchPackumentWhenVisible(manifest.name, expectation.version, waitMs)

      if (packument === undefined) break
    }
    if (packument === undefined) {
      try {
        packument = await fetchPackument(manifest.name)
      } catch (error) {
        if (isPackageNotFound(error)) {

          console.warn(`market-index: ${manifest.name} 从未发布（registry 404），本次索引跳过；首次发布成功后自动收录`)
          skippedPackages.push(manifest.name)
          continue
        }
        throw error
      }
    }
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
        en: 'Desk One and a few small DeepSeek Harness web plugins, published under @dsh-sparrow.',
        zh: 'Desk One 与几件小工具：@dsh-sparrow 下的 DeepSeek Harness Web 插件合集。',
      },
      metadata: { categories: {}, labels: LABELS, sortKeys: {} },
      plugins,
    },
    peers,
    skippedPackages,
  }
}

async function main() {
  const expectations = expectationsFromEnv()

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
  const { index, peers, skippedPackages } = await buildIndex({ waitMs, expectations })
  mkdirSync(dirname(OUTPUT), { recursive: true })




  const missing = expectations.filter((expectation) => {
    if (skippedPackages.includes(expectation.name)) return false
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
