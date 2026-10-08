#!/usr/bin/env node
/**
 * 守卫：**公开仓库里不许出现本机绝对路径 / 用户名 / 私有环境的可识别信息**。
 * 判据 1 = 本机身份**运行时真值**（`os.homedir()` / 用户名，命中即泄漏）；判据 2 = 通用用户目录路径（`C:\Users\<名>` / `/home/<名>` / `/Users/<名>` / UNC，占位名与 `<占位符>` 不算）。
 * **只扫 git 索引**（`git ls-files`）——未跟踪的本机 overlay 允许存在，「进了索引」才等于「已公开」。
 * ⚠️ 本文件也在索引里：举例一律用占位名，不得写真实用户名 / 真实 workspace 目录名。退出码：0 = 干净；1 = 有泄漏。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, join } from 'node:path'

const root = join(import.meta.dirname, '..')

/** 占位名白名单：**故意的假名**（测试夹具 / 文档示例），命中即豁免。 */
const PLACEHOLDERS = new Set([
  'alice', 'bob', 'carol', 'dave', 'user', 'username', 'name', 'someone',
  'example', 'test', 'foo', 'bar', 'you', 'me', 'xxx', 'yourname',
])

/** `<用户名>` / `%USERNAME%` / `$HOME` 这类**占位写法**不算泄漏。 */
const isPlaceholderToken = (token) =>
  token.startsWith('<') || token.startsWith('%') || token.startsWith('$') || token.startsWith('{')
  || PLACEHOLDERS.has(token.toLowerCase())

/** 本机 workspace 目录名的三段：本文件里用 `join('-')` 拼起来用，**不整体出现**（本文件也在索引里）。 */
const LOCAL_WORKSPACE_PARTS = ['pyai', 'meta', 'repo']

/**
 * 判据 2 的通用模式。加规则时**不要写真实用户名 / 真实 workspace 目录名**（本文件也在索引里），
 * UNC 示例一律用 `<server>` 占位写法 —— 照抄成真名字会被本条规则当场抓住。
 */
const GENERIC_RULES = [
  {
    name: 'Windows 用户目录绝对路径',
    // ⚠️ i 标记不能去掉：Windows 路径大小写不敏感，写成全小写时会整行静默漏报。
    re: /[A-Za-z]:[\\/]Users[\\/]([^\\/\s"'`]+)/giu,
    token: (m) => m[1],
  },
  {
    name: 'POSIX 用户目录绝对路径',
    // ⚠️ 左边界须用 `(?<![\w.-])`：白名单式左边界（行首 / 空白 / 引号 / 括号）会让
    // 「中文冒号紧贴」的写法（`本地路径：/home/<名>`）静默漏报；负向后顾顺带避开 URL 里的同名段。
    re: /(?<![\w.-])\/(?:home|Users)\/([A-Za-z][\w.-]*)/gmu,
    token: (m) => m[1],
  },
  {
    name: 'UNC 网络路径',
    // `\\<server>\\<share>`：UNC 没有"用户"段，把 **server** 当敏感面报出来；占位写法天然不匹配，无需豁免。
    re: /\\\\([A-Za-z0-9][\w.-]*)\\([A-Za-z0-9$][\w.$-]*)/gu,
    token: (m) => m[1],
  },
  {
    name: '本机 workspace 路径',
    // ⚠️ 模式**必须拼出来**、不写字面量：本文件也在索引里，直写目录名会被本守卫当成一处泄漏（自证）。
    re: new RegExp([LOCAL_WORKSPACE_PARTS[0], LOCAL_WORKSPACE_PARTS[1], LOCAL_WORKSPACE_PARTS[2]].join('-'), 'gu'),
    token: () => null, // 无占位豁免：这个目录名就是本机专属
  },
]

/** 判据 1 的本机真值：**运行时取**，不写死。 */
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
// 主目录最后一段通常等于用户名：去重，避免同一处报两遍
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

/**
 * 二进制文件判定（git 同款启发式：前 8000 字节里出现 NUL）。
 * ⚠️ **必须显式判**，不能只靠 `readFileSync(…, 'utf8')` 抛异常：二进制读成 utf8 不会抛，
 * 只会变成一堆替换字符（U+FFFD），扫这些乱码会假红（`resources/*.png` 就凑出过 UNC 路径）。
 */
const isBinary = (buf) => buf.subarray(0, 8000).includes(0)

for (const file of files) {
  let text
  try {
    const buf = readFileSync(join(root, file))
    if (isBinary(buf)) continue
    text = buf.toString('utf8')
  } catch {
    continue // 已删除但仍在索引里的条目
  }
  const lines = text.split(/\r?\n/u)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 同一行可能命中多条规则（如「本机主目录」与「本机用户名」）：**每行只报第一条**，否则一处泄漏刷出多遍。
    let reported = false

    // ── 判据 1：本机真值（精确）──
    for (const { name, needle } of HOME_PATTERNS) {
      if (reported) break
      if (!needle || needle.length < 4) continue
      if (!line.includes(needle)) continue
      // 纯名字单独出现可能是巧合（用户名恰好是常见单词），但「路径分隔符 + 名字」一定是路径，故要求该上下文。
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
