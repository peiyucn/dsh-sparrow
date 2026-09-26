#!/usr/bin/env node
/**
 * 守卫：**公开仓库里不许出现本机绝对路径 / 用户名 / 私有环境的可识别信息**。
 *
 * ## 为什么需要它
 *
 * 本仓库是**公开**的（`peiyucn/dsh-sparrow`），但开发过程天然会写出本机路径
 * （grep 官方源码的 checkout、`--patch` 的 overlay、真机实测的证据转录……）。
 * 2026-09-26 owner 发现 `AGENTS.md` 里写着本机用户目录下的 checkout 路径
 * —— 一次巡检翻出 **17 个索引文件**都带同一条本机路径 / 用户名。**靠人记不住，必须机器守。**
 *
 * ## 两条判据（前者是硬规则，后者兜别人的机器）
 *
 * 1. **本机身份**（精确、零误报）：用 `os.homedir()` / `os.userInfo().username` 取**运行时真值**，
 *    在索引文件里搜它。只要命中就一定是泄漏 —— 不需要任何猜测。
 * 2. **通用用户目录路径**（兜底）：`C:\Users\<名>` / `C:/Users/<名>` / `/home/<名>` / `/Users/<名>`。
 *    占位名（`alice` 之类）与 `<占位符>` 形式**不算**（测试夹具、`.gitignore` 的说明都靠它们）。
 *
 * ⚠️ **只扫 git 索引（`git ls-files`），不扫工作区**：未跟踪的本机 overlay（`dev.patch.yml`）
 * 本来就允许存在于本机，扫它只会误报；**「进了索引」才等于「已公开」**。
 *
 * ⚠️ **本文件自己也在索引里**：所以下面**不能出现真实用户名**，举例一律用占位名。
 * 这正是本守卫的第一条自证 —— 若有人把真名写进来，第 1 条判据会当场抓住。
 *
 * 退出码：0 = 干净；1 = 发现泄漏（逐条打印 文件:行号:内容）。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, join } from 'node:path'

const root = join(import.meta.dirname, '..')

/** 占位名白名单：这些是**故意的假名**（测试夹具 / 文档示例），不是本机信息。 */
const PLACEHOLDERS = new Set([
  'alice', 'bob', 'carol', 'dave', 'user', 'username', 'name', 'someone',
  'example', 'test', 'foo', 'bar', 'you', 'me', 'xxx', 'yourname',
])

/** `<用户名>` / `%USERNAME%` / `$HOME` / `${HOME}` 这类**占位写法**不算泄漏。 */
const isPlaceholderToken = (token) =>
  token.startsWith('<') || token.startsWith('%') || token.startsWith('$') || token.startsWith('{')
  || PLACEHOLDERS.has(token.toLowerCase())

/** 判据 2 的三条通用模式。加规则时**不要写真实用户名**（本文件也在索引里）。 */
const GENERIC_RULES = [
  {
    name: 'Windows 用户目录绝对路径',
    re: /[A-Za-z]:[\\/]Users[\\/]([^\\/\s"'`]+)/gu,
    token: (m) => m[1],
  },
  {
    name: 'POSIX 用户目录绝对路径',
    re: /(?:^|[\s"'`(=])\/(?:home|Users)\/([A-Za-z][\w.-]*)/gmu,
    token: (m) => m[1],
  },
  {
    name: '本机 workspace 路径',
    re: /pyai-meta-repo/gu,
    token: () => null, // 没有占位豁免：这个目录名就是本机专属
  },
]

/** 判据 1 的本机真值（**运行时取**，不写死）。 */
const home = homedir()
const user = (() => {
  try {
    return userInfo().username
  } catch {
    return null
  }
})()
const HOME_PATTERNS = [
  { name: '本机主目录（运行时真值）', needle: home },
  ...(user ? [
    { name: '本机用户名（运行时真值）', needle: user },
    { name: '本机用户目录（运行时真值）', needle: `Users/${user}` },
    { name: '本机用户目录（运行时真值·反斜杠）', needle: `Users\\${user}` },
  ] : []),
]
// 主目录最后一段通常等于用户名，去重避免同一处报两遍
const homeBase = basename(home)

const grep = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
if (grep.status !== 0) {
  console.error('check-no-local-paths: git ls-files 失败（必须在 git 仓库内运行）')
  process.exit(1)
}
const files = grep.stdout.split('\0').filter(Boolean)

let violations = 0
const report = (file, line, ruleName, detail) => {
  violations++
  console.error(`${file}:${line}: [${ruleName}]`)
  console.error(`    ${detail.slice(0, 170)}`)
}

for (const file of files) {
  let text
  try {
    text = readFileSync(join(root, file), 'utf8')
  } catch {
    continue // 二进制 / 已删除但仍在索引里的条目
  }
  const lines = text.split(/\r?\n/u)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 同一行可能同时命中多条规则（如「本机主目录」与「本机用户名」）——
    // **每行只报第一条**，否则一处泄漏刷出三遍、看不清真正有几处。
    let reported = false

    // ── 判据 1：本机真值（精确）──
    for (const { name, needle } of HOME_PATTERNS) {
      if (reported) break
      if (!needle || needle.length < 4) continue
      if (!line.includes(needle)) continue
      // 主目录/用户名单独出现时可能是巧合（如用户名恰好是常见单词），
      // 但「路径分隔符 + 名字」的组合一定是路径 —— 故对纯名字要求带分隔符上下文。
      if (needle === user || needle === homeBase) {
        const asPath = new RegExp(`[\\\\/]${needle}(?:[\\\\/'"\`\\s]|$)`, 'u')
        if (!asPath.test(line)) continue
      }
      report(file, i + 1, name, line.trim())
      reported = true
    }

    // ── 判据 2：通用用户目录路径（兜别人的机器）──
    for (const rule of GENERIC_RULES) {
      if (reported) break
      rule.re.lastIndex = 0
      let m
      while ((m = rule.re.exec(line)) !== null) {
        const token = rule.token(m)
        if (token !== null && isPlaceholderToken(token)) continue
        report(file, i + 1, rule.name, line.trim())
        reported = true
        break
      }
    }
  }
}

if (violations > 0) {
  console.error(`\ncheck-no-local-paths: ❌ 发现 ${violations} 处本机可识别信息（本仓库公开）`)
  console.error('修法：')
  console.error('  · 路径 → 改成 ~/… 相对写法，或用 DSH_SOURCE / os.homedir() 之类在运行时推导')
  console.error('  · 测试夹具 / 示例里的用户名 → 换成占位名（alice / bob / 张三）')
  console.error('  · 只在本机用的 overlay（dev.patch.yml）→ 靠 .gitignore 挡住、不要 git add')
  process.exit(1)
}

console.error(`check-no-local-paths: ✅ ${files.length} 个索引文件里没有本机绝对路径 / 用户名`)
