#!/usr/bin/env node
/**
 * 守卫：**文档与代码 / 文档与文档之间那几件"靠人记得"的事。**
 *
 * ## 为什么需要它
 *
 * 这个仓库有大量**成对或成组**的文档，改一处、忘一处**完全没有症状** ——
 * 页面照常显示、测试照常全绿，直到有人肉眼看出来：
 *
 * 1. **中英双份**（每个插件的 README / CHANGELOG，根 README）：两份文件，
 *    改一份不会提醒另一份；
 * 2. **多处点名同一件事**（`README` 插件表 / `AGENTS` 插件清单 / `SECURITY` 支持表 /
 *    `package.json` files 清单）：同一份事实写在 N 个地方；
 * 3. **CHANGELOG 与 `package.json` 版本**：定版编辑时两边都要改。
 *
 * ### 实际事故（2026-10-03 审计）
 *
 * `dsh-nav-pin` 退役后，它在**三处**文档里仍被当作活跃插件挂着，两处还带安装命令：
 *
 * * `README.md` 表（英文）—— 改了；
 * * `README.zh-CN.md` 表（中文）—— **改英文时漏了**，隔一轮被 owner 看出来；
 * * `SECURITY.md` 支持表 —— 只提了 `dsh-vision-bridge` 退役。
 *
 * 另有多处**过期计数**（「唯一 / 三条」实为四条）、**过期陈述**（状态仍写「待评审」）、
 * **跑偏的锚点**（引用了已被删除的死锚点）—— 同类病，只是不都由本守卫覆盖。
 *
 * ## 判据
 *
 * | # | 判据 | 为什么 |
 * | :--- | :--- | :--- |
 * | 1 | 根 README 中英双份的插件表 = 活跃集合（不多不少） | 退役的不得列在可安装表里 |
 * | 2 | 根 README 中英双份的《Retired / 已退役》小节点名全部退役插件 | 退役了要能查得着 |
 * | 3 | `SECURITY.md` 支持表只列活跃插件 | 退役的不再提供支持 |
 * | 4 | `AGENTS.md` 点名全部活跃 + 退役插件，且「口径」行数字与实际一致 | AGENTS 是 agent 的入口地图 |
 * | 5 | 每个活跃插件 README / CHANGELOG 中英双份：有 H1、顶部有互链、`##` 数一致、条目数一致 | 双份最容易漏一份 |
 * | 6 | `package.json` 的 version 在该插件两份 CHANGELOG 里都有版本段；中英版本段序列一致、每段条目数一致 | 定版编辑漏一处即幻影版本 |
 * | 7 | `package.json` 的 `files` 里点名的 `.md` 都存在 | 打包清单指向不存在的文件 |
 * | 8 | README 里指向 `plugins/…` 的相对链接都存在 | 改了文件名忘改链接 |
 *
 * ## ⚠️ 只比**结构与集合**，不比**内容**
 *
 * 判据 5/6 数的是「`##` 个数、条目个数、版本号序列」——
 * **不比对文案、不比对措辞、不比对徽章、不比对顺序之外的任何东西**。
 * 改一句描述绝不该触发红灯；而"漏翻一条""漏加一段版本"必须触发。
 *
 * **条目**的口径 = 无序（`- ` / `* `）与有序（`1. ` / `1) `），**缩进子条目也算**
 * （详见 `ITEM_RE`）。这两处加固都是补**已实测的可静默绕过**：
 *
 * * 行首锚定 ⇒ 一条「只在 EN 侧加的缩进子条目」计数守恒、静默放行；
 * * 注释里的行照算 ⇒ 把一条真条目在**中英两侧同时**注释掉，计数守恒、静默放行。
 *
 * 围栏代码块与 **HTML 注释**（含跨行块）内的行**不计入**（详见 `unfenced`）。
 *
 * 退出码：0 = 一致；1 = 有漂移（逐条打印文件 + 具体差在哪）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePluginNames, RETIRED_PLUGINS, repoRoot } from './plugin-set.mjs'

const violations = []
const fail = (message) => violations.push(message)

const active = activePluginNames()
const retired = [...RETIRED_PLUGINS]

const read = (rel) => {
  try {
    return readFileSync(join(repoRoot, rel), 'utf8')
  } catch {
    return null
  }
}

/** 剥掉围栏代码块（里面的行不算结构）。 */
const unquoteFences = (text) => {
  const out = []
  let inFence = false
  for (const line of text.split(/\r?\n/u)) {
    if (/^\s*```/u.test(line)) { inFence = !inFence; continue }
    if (!inFence) out.push(line)
  }
  return out
}

/**
 * 剥掉 HTML 注释（`<!-- … -->`，含跨行块），并剥掉围栏代码块。
 *
 * 注释里的行**不是文档结构** —— 反过来用就会变成「把真条目注释掉、计数却照样算」：
 * 中英两侧同时注释掉一条真条目，条目数守恒 ⇒ 判据 5 **静默放行**（实测）。
 * 故结构统计一律走这里。
 *
 * 实现是逐行状态机，不是把全文 `replace(/<!--[\s\S]*?-->/g, '')`：
 * 后者会把被剥掉的部分整体删掉，**行号会跟着塌**（本脚本多处按行索引），
 * 而且注释块前后的内容会被粘到同一行上（例如 `a<!--x-->b` → `ab`，
 * 凭空造出一个原本不存在的行首条目）。逐行替换成空串则保持行不变。
 */
const unfenced = (text) => {
  const out = []
  let inFence = false
  let inComment = false
  for (const line of text.split(/\r?\n/u)) {
    if (/^\s*```/u.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    let rest = line
    let stripped = ''
    while (rest !== '') {
      if (inComment) {
        const end = rest.indexOf('-->')
        if (end < 0) { rest = ''; break }        // 注释块延续到下一行
        inComment = false
        rest = rest.slice(end + 3)
        continue
      }
      const start = rest.indexOf('<!--')
      if (start < 0) { stripped += rest; rest = ''; break }
      stripped += rest.slice(0, start)            // 注释前的正文保留（保持行号与列位）
      inComment = true
      rest = rest.slice(start + 4)
    }
    out.push(stripped)
  }
  return out
}

/**
 * **条目行**：无序（`- ` / `* `）与有序（`1. ` / `1) `），**缩进子条目也算**。
 *
 * 口径演进（都有实测依据）：
 * * 原先只认 `^[-*]\s+\S`（行首、无序）—— **缩进子条目完全不计**。后果：只在英文侧
 *   加一条缩进子条目、中文侧漏译，顶层计数守恒 ⇒ 判据 5 **静默放行**（实测）。
 *   退役的 `dsh-nav-pin/README` 中英「全部条目 11 vs 10」正是这么漏出来的。
 * * 有序列表一并纳入：它同样是"一条用户可见的条目"，漏译一条照样是漏译。
 *   （Markdown 里 `1. ` 起行渲染出来就是列表项，不是普通段落。）
 *
 * ⚠️ 现存 11 对文档在**本口径**下中英仍然全部相等（逐对实测：5 活跃插件 ×
 * README/CHANGELOG + 根 README），故这是"只堵未来"的加固。唯一变化是
 * `dsh-codebuddy-credits` README 的**绝对**条数 14 → 16（把两条编号安装步骤也数进来），
 * 中英同步变化、**不产生红灯**。
 * 退役插件 `dsh-nav-pin/README` 在本口径下中英不等（11 vs 10），但它不在判据 5 的
 * 检查范围内（只查活跃插件），故不触发。
 */
const ITEM_RE = /^\s*(?:[-*]|\d+[.)])\s+\S/u

const countOf = (lines, re) => lines.filter(line => re.test(line)).length

/** 某文件中 `##` 级标题的文本序列。 */
const h2s = (text) => unfenced(text)
  .filter(line => /^##\s+\S/u.test(line))
  .map(line => line.replace(/^##\s+/u, '').trim())

/** 条目数（无序 + 有序，**含缩进子条目**；口径见 `ITEM_RE`）。 */
const topItems = (text) => countOf(unfenced(text), ITEM_RE)

/**
 * 解析 CHANGELOG 的版本段：版本号 + 该段条目数。
 * @param text - CHANGELOG 全文。
 * @returns `[{ version, items }]`，按出现顺序。
 */
function versionSections(text) {
  const out = []
  let current = null
  for (const line of unfenced(text)) {
    const heading = /^##\s+([0-9][^\s（(]*)/u.exec(line)
    if (heading) {
      current = { version: heading[1], items: 0 }
      out.push(current)
      continue
    }
    if (current !== null && ITEM_RE.test(line)) current.items += 1
  }
  return out
}

/** 中文数字 → 阿拉伯数字（AGENTS「口径」行用中文数字）。 */
const CN_DIGITS = { 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
function parseCnNumber(text) {
  if (/^\d+$/u.test(text)) return Number(text)
  if (text === '十') return 10
  const ten = /^(.)?十(.)?$/u.exec(text)
  if (ten !== null) {
    const high = ten[1] === undefined ? 1 : (CN_DIGITS[ten[1]] ?? Number.NaN)
    const low = ten[2] === undefined ? 0 : (CN_DIGITS[ten[2]] ?? Number.NaN)
    return Number.isNaN(high) || Number.isNaN(low) ? null : high * 10 + low
  }
  return CN_DIGITS[text] ?? null
}

// ─────────────────────────────────────────────────────────────
// 判据 1 + 2：根 README 中英双份
// ─────────────────────────────────────────────────────────────
/** 取「插件表」区段（表头行 → 下一个 `## `）。 */
function tableSection(text, headerRe) {
  const lines = text.split(/\r?\n/u)
  const start = lines.findIndex(line => headerRe.test(line))
  if (start < 0) return null
  const end = lines.findIndex((line, i) => i > start && /^##\s/u.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}

/** 从 markdown 表格行里抽出 `plugins/<name>/…` 链接的插件名。 */
function tablePlugins(body) {
  const names = new Set()
  for (const line of body.split(/\r?\n/u)) {
    if (!line.trim().startsWith('|')) continue
    for (const m of line.matchAll(/\]\(plugins\/([^/)\s]+)\//gu)) names.add(m[1])
  }
  return names
}

/** 取某个 `## ` 小节的正文。 */
function section(text, headingRe) {
  const lines = text.split(/\r?\n/u)
  const start = lines.findIndex(line => headingRe.test(line))
  if (start < 0) return null
  const end = lines.findIndex((line, i) => i > start && /^##\s/u.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}

const ROOT_READMES = [
  { file: 'README.md', header: /^\|\s*Plugin\s*\|/u, retired: /^##\s*Retired\b/u },
  { file: 'README.zh-CN.md', header: /^\|\s*插件\s*\|/u, retired: /^##\s*已退役/u },
]

for (const { file, header, retired: retiredHeading } of ROOT_READMES) {
  const text = read(file)
  if (text === null) { fail(`判据 1：读不到 ${file}`); continue }

  const body = tableSection(text, header)
  if (body === null) { fail(`判据 1：${file} 里找不到插件表（表头不匹配）`); continue }
  const listed = tablePlugins(body)

  for (const name of retired) {
    if (listed.has(name)) {
      fail(`判据 1：${file} 的插件表里列着**已退役**的 ${name}（退役插件只能出现在《Retired / 已退役》小节）`)
    }
  }
  for (const name of active) if (!listed.has(name)) fail(`判据 1：${file} 的插件表缺少活跃插件 ${name}`)
  for (const name of listed) if (!active.includes(name)) fail(`判据 1：${file} 的插件表里有未知名字 ${name}`)

  const retiredBody = section(text, retiredHeading)
  if (retiredBody === null) { fail(`判据 2：${file} 里找不到《Retired / 已退役》小节`); continue }
  for (const name of retired) {
    if (!new RegExp(`~~${name}~~`, 'u').test(retiredBody)) fail(`判据 2：${file} 的退役小节没有点名 ${name}`)
  }
}

// ─────────────────────────────────────────────────────────────
// 判据 3：SECURITY.md 支持表
// ─────────────────────────────────────────────────────────────
{
  const security = read('SECURITY.md')
  if (security === null) fail('判据 3：读不到 SECURITY.md')
  else {
    // ⚠️ 只看**表格行**：退役说明写在表下引用块里（那里必须点名它们，才说得清谁退役了）。
    const tableLines = security.split(/\r?\n/u).filter(line => line.trim().startsWith('|')).join('\n')
    for (const name of retired) {
      if (tableLines.includes(name)) {
        fail(`判据 3：SECURITY.md 的支持版本**表**里列着已退役的 ${name}（表只应列活跃插件；退役说明写在表下的引用块里）`)
      }
    }
    for (const name of active) {
      if (!tableLines.includes(name)) fail(`判据 3：SECURITY.md 的支持版本表里缺少活跃插件 ${name}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 判据 4：AGENTS.md 插件清单 + 口径行
// ─────────────────────────────────────────────────────────────
{
  const agents = read('AGENTS.md')
  if (agents === null) fail('判据 4：读不到 AGENTS.md')
  else {
    for (const name of active) if (!agents.includes(`plugins/${name}`)) fail(`判据 4：AGENTS.md 没点名活跃插件 ${name}`)
    for (const name of retired) if (!agents.includes(`plugins/${name}`)) fail(`判据 4：AGENTS.md 没点名退役插件 ${name}`)
    const m = /口径：(.+?)个活跃插件\s*\+\s*(.+?)个已退役/u.exec(agents)
    if (m === null) {
      fail('判据 4：AGENTS.md 里找不到「口径：N 个活跃插件 + M 个已退役」这一行（它是 agent 判断插件数量的入口）')
    } else {
      const nActive = parseCnNumber(m[1].trim())
      const nRetired = parseCnNumber(m[2].trim())
      if (nActive !== active.length) fail(`判据 4：AGENTS.md 口径行写着 ${m[1]} 个活跃插件，实际 ${active.length} 个`)
      if (nRetired !== retired.length) fail(`判据 4：AGENTS.md 口径行写着 ${m[2]} 个已退役插件，实际 ${retired.length} 个`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 判据 5 + 6 + 7：逐插件
// ─────────────────────────────────────────────────────────────
for (const name of active) {
  const dir = `plugins/${name}`

  // ── 判据 7：files 清单里点名的 .md 必须存在 ──
  const pkgText = read(`${dir}/package.json`)
  let pkg = null
  if (pkgText === null) fail(`判据 7：读不到 ${dir}/package.json`)
  else {
    try { pkg = JSON.parse(pkgText) } catch { fail(`判据 7：${dir}/package.json 不是合法 JSON`) }
  }
  if (pkg !== null) {
    for (const entry of pkg.files ?? []) {
      if (!/\.md$/u.test(entry)) continue
      if (!existsSync(join(repoRoot, dir, entry))) fail(`判据 7：${dir}/package.json 的 files 指向不存在的文档 ${entry}`)
    }
  }

  // ── 判据 5：中英双份的四份文档 ──
  for (const [kind, en, zh, crossEn, crossZh] of [
    ['README', `${dir}/README.md`, `${dir}/README.zh-CN.md`, 'README.zh-CN.md', 'README.md'],
    ['CHANGELOG', `${dir}/CHANGELOG.md`, `${dir}/CHANGELOG.zh-CN.md`, 'CHANGELOG.zh-CN.md', 'CHANGELOG.md'],
  ]) {
    const a = read(en), b = read(zh)
    if (a === null) { fail(`判据 5：读不到 ${en}`); continue }
    if (b === null) { fail(`判据 5：读不到 ${zh}`); continue }

    for (const [file, text] of [[en, a], [zh, b]]) {
      if (!/^#\s+\S/u.test(text.split(/\r?\n/u)[0] ?? '')) fail(`判据 5：${file} 第一行不是 H1`)
    }
    // 顶部互链（前 8 行）
    if (!unfenced(a).slice(0, 8).join('\n').includes(crossEn)) fail(`判据 5：${en} 顶部缺少指向 ${crossEn} 的互链`)
    if (!unfenced(b).slice(0, 8).join('\n').includes(crossZh)) fail(`判据 5：${zh} 顶部缺少指向 ${crossZh} 的互链`)

    const ha = h2s(a).length, hb = h2s(b).length
    if (ha !== hb) fail(`判据 5：${name} ${kind} 的 ## 标题数中英不一致（EN ${ha} / ZH ${hb}）—— 漏译或漏加一节`)

    const ia = topItems(a), ib = topItems(b)
    if (ia !== ib) fail(`判据 5：${name} ${kind} 的条目数中英不一致（EN ${ia} / ZH ${ib}）—— 漏译或漏加一条（无序/有序、含缩进子条目）`)

    // ── 判据 6：CHANGELOG 版本段 ──
    if (kind === 'CHANGELOG' && pkg !== null) {
      const se = versionSections(a), sz = versionSections(b)
      if (se.length !== sz.length) fail(`判据 6：${name} CHANGELOG 版本段数中英不一致（EN ${se.length} / ZH ${sz.length}）`)
      const n = Math.min(se.length, sz.length)
      for (let i = 0; i < n; i++) {
        if (se[i].version !== sz[i].version) {
          fail(`判据 6：${name} CHANGELOG 第 ${i + 1} 个版本段中英不一致（EN ${se[i].version} / ZH ${sz[i].version}）`)
          continue
        }
        if (se[i].items !== sz[i].items) {
          fail(`判据 6：${name} CHANGELOG ${se[i].version} 段的条目数中英不一致（EN ${se[i].items} / ZH ${sz[i].items}）`)
        }
      }
      const version = pkg.version
      if (!se.some(s => s.version === version)) fail(`判据 6：${name} 的 package.json 版本 ${version} 在 CHANGELOG.md 里没有对应段`)
      if (!sz.some(s => s.version === version)) fail(`判据 6：${name} 的 package.json 版本 ${version} 在 CHANGELOG.zh-CN.md 里没有对应段`)
    }
  }

  // ── 判据 8：README 里 plugins/ 相对链接都存在 ──
  for (const file of [`${dir}/README.md`, `${dir}/README.zh-CN.md`]) {
    const text = read(file)
    if (text === null) continue
    for (const m of text.matchAll(/\]\((plugins\/[^)\s]+)\)/gu)) {
      if (!existsSync(join(repoRoot, m[1]))) fail(`判据 8：${file} 的链接指向不存在的文件 ${m[1]}`)
    }
  }
}

// 根 README 的 plugins/ 链接一并查
for (const file of ['README.md', 'README.zh-CN.md']) {
  const text = read(file)
  if (text === null) continue
  for (const m of text.matchAll(/\]\((plugins\/[^)\s]+)\)/gu)) {
    if (!existsSync(join(repoRoot, m[1]))) fail(`判据 8：${file} 的链接指向不存在的文件 ${m[1]}`)
  }
}

// ─────────────────────────────────────────────────────────────
// 报告
// ─────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error(`check-plugin-docs: ❌ 文档与代码 / 文档与文档之间不一致（${violations.length} 处）\n`)
  for (const v of violations) console.error(`  · ${v}`)
  console.error('\n修法：')
  console.error('  · 名单类（判据 1-4）：改 scripts/plugin-set.mjs 的 RETIRED_PLUGINS，本守卫会指出所有待改处')
  console.error('  · 中英双份（判据 5-6）：两份都要改 —— 漏一份是本守卫存在的全部理由')
  console.error('  · 定版（判据 6）：package.json 版本 + 两份 CHANGELOG 的版本段三处一起动')
  console.error('  · ⚠️ 本守卫只比结构与集合；改文案不会触发它')
  process.exit(1)
}

console.error(
  'check-plugin-docs: ✅ 文档一致'
  + `（活跃 ${active.length}：${active.join(' / ')}；退役 ${retired.length}：${retired.join(' / ')}`
  + `；中英双份 ${active.length * 4} 份 × 标题/条目/版本段；AGENTS 口径行；README 链接）`,
)
