

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, join } from 'node:path'

const root = join(import.meta.dirname, '..')


const PLACEHOLDERS = new Set([
  'alice', 'bob', 'carol', 'dave', 'user', 'username', 'name', 'someone',
  'example', 'test', 'foo', 'bar', 'you', 'me', 'xxx', 'yourname',
])


const isPlaceholderToken = (token) =>
  token.startsWith('<') || token.startsWith('%') || token.startsWith('$') || token.startsWith('{')
  || PLACEHOLDERS.has(token.toLowerCase())


const LOCAL_WORKSPACE_PARTS = ['pyai', 'meta', 'repo']


const GENERIC_RULES = [
  {
    name: 'Windows 用户目录绝对路径',

    re: /[A-Za-z]:[\\/]Users[\\/]([^\\/\s"'`]+)/giu,
    token: (m) => m[1],
  },
  {
    name: 'POSIX 用户目录绝对路径',


    re: /(?<![\w.-])\/(?:home|Users)\/([A-Za-z][\w.-]*)/gmu,
    token: (m) => m[1],
  },
  {
    name: 'UNC 网络路径',

    re: /\\\\([A-Za-z0-9][\w.-]*)\\([A-Za-z0-9$][\w.$-]*)/gu,
    token: (m) => m[1],
  },
  {
    name: '本机 workspace 路径',

    re: new RegExp([LOCAL_WORKSPACE_PARTS[0], LOCAL_WORKSPACE_PARTS[1], LOCAL_WORKSPACE_PARTS[2]].join('-'), 'gu'),
    token: () => null,
    allowedFiles: ['AGENTS.md'],
    allowedPrefixes: ['meta/'],
  },
]


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


const isBinary = (buf) => buf.subarray(0, 8000).includes(0)

for (const file of files) {
  let text
  try {
    const buf = readFileSync(join(root, file))
    if (isBinary(buf)) continue
    text = buf.toString('utf8')
  } catch {
    continue
  }
  const lines = text.split(/\r?\n/u)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    let reported = false


    for (const { name, needle } of HOME_PATTERNS) {
      if (reported) break
      if (!needle || needle.length < 4) continue
      if (!line.includes(needle)) continue

      if (needle === user || needle === homeBase) {
        const asPath = new RegExp(`[\\\\/]${needle}(?:[\\\\/'"\`\\s]|$)`, 'u')
        if (!asPath.test(line)) continue
      }
      report(file, i + 1, name, line.trim())
      reported = true
    }


    for (const rule of GENERIC_RULES) {
      if (reported) break
      if (rule.allowedFiles?.includes(file)) continue
      if (rule.allowedPrefixes?.some((prefix) => file.startsWith(prefix))) continue
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
