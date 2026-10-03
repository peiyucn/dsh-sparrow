#!/usr/bin/env node
/**
 * 守卫：**根 README（中英双份）的插件表只能列活跃插件，已退役的必须只出现在《Retired》里。**
 *
 * ## 为什么需要它（同类事故在同一个 commit 里出现过**三次**）
 *
 * 2026-10-03 全面审计：`dsh-nav-pin` 已退役并并入 `dsh-theme-tone`，但它在三处文档里
 * **仍被当作活跃插件**挂着，其中两处还带安装命令：
 *
 * 1. `README.md` 的活跃插件表（英文）—— 已修；
 * 2. `README.zh-CN.md` 的活跃插件表（中文）—— **修 1 时漏了**，隔了一轮才被 owner 看出来；
 * 3. `SECURITY.md` 的《支持版本》表 —— 只提了 `dsh-vision-bridge` 退役，
 *    `dsh-nav-pin` 仍列在支持范围内。
 *
 * 第 2 条正是这个守卫存在的理由：**中英双份是两份文件，改一份不会提醒另一份**。
 * 而"文档说能装、实际已退役"这类错误直接误导用户去装一个不再维护的包，属高危文档事故。
 *
 * `scripts/plugin-set.mjs` 已经是活跃/退役名单的单一真值（`verify-all.mjs` 与
 * `check-dsh-pin.mjs` 共用），本守卫复用同一份，防漂移。
 *
 * ## 判据
 *
 * 1. **根 README 中英双份的插件表** = 活跃插件集合，**一个不多一个不少**
 *    （退役的**不得**出现在表里；表里也不得有未知名字）。
 * 2. **根 README 中英双份的《Retired / 已退役》小节** = 退役集合
 *    （逐个以 `~~name~~` 形式点名）。
 * 3. **`SECURITY.md` 的《支持版本》行**不得点名任何退役插件。
 *
 * ⚠️ 只做**集合**比较，不管顺序、不管描述文案、不管徽章 —— 那些是内容，改它们不该触发红灯。
 *
 * 退出码：0 = 一致；1 = 有漂移（逐条打印是哪个文件、哪个名字）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePluginNames, RETIRED_PLUGINS, repoRoot } from './plugin-set.mjs'

const violations = []
const fail = (message) => violations.push(message)

const active = activePluginNames()
const retired = [...RETIRED_PLUGINS]

/**
 * 取「插件表」区段：从表头行到下一个 `## ` 标题之间。
 * @param text - README 全文。
 * @param headerRe - 表头正则（中英各一）。
 * @returns 表体文本（不含表头）。
 */
function tableSection(text, headerRe) {
  const lines = text.split(/\r?\n/u)
  const start = lines.findIndex(line => headerRe.test(line))
  if (start < 0) return null
  const end = lines.findIndex((line, i) => i > start && /^##\s/u.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}

/**
 * 取某个 `## ` 小节的正文。
 * @param text - 全文。
 * @param headingRe - 小节标题正则。
 * @returns 小节文本；找不到返回 null。
 */
function section(text, headingRe) {
  const lines = text.split(/\r?\n/u)
  const start = lines.findIndex(line => headingRe.test(line))
  if (start < 0) return null
  const end = lines.findIndex((line, i) => i > start && /^##\s/u.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}

/** 从 markdown 表格行里抽出 `plugins/<name>/...` 链接指向的插件名。 */
function tablePlugins(body) {
  const names = new Set()
  for (const line of body.split(/\r?\n/u)) {
    if (!line.trim().startsWith('|')) continue
    for (const m of line.matchAll(/\]\(plugins\/([^/)\s]+)\//gu)) names.add(m[1])
  }
  return names
}

// ── 判据 1 + 2：根 README 中英双份 ──
const readmes = [
  { file: 'README.md', header: /^\|\s*Plugin\s*\|/u, retiredHeading: /^##\s*Retired\b/u },
  { file: 'README.zh-CN.md', header: /^\|\s*插件\s*\|/u, retiredHeading: /^##\s*已退役/u },
]

for (const { file, header, retiredHeading } of readmes) {
  let text
  try {
    text = readFileSync(join(repoRoot, file), 'utf8')
  } catch {
    fail(`判据 1 失败：读不到 ${file}`)
    continue
  }

  const body = tableSection(text, header)
  if (body === null) {
    fail(`判据 1 失败：${file} 里找不到插件表（表头不匹配）`)
    continue
  }
  const listed = tablePlugins(body)

  for (const name of retired) {
    if (listed.has(name)) {
      fail(`判据 1 失败：${file} 的插件表里列着**已退役**的 ${name}`
        + `（退役插件只能出现在《Retired / 已退役》小节）`)
    }
  }
  for (const name of active) {
    if (!listed.has(name)) fail(`判据 1 失败：${file} 的插件表缺少活跃插件 ${name}`)
  }
  for (const name of listed) {
    if (!active.includes(name)) fail(`判据 1 失败：${file} 的插件表里有未知名字 ${name}`)
  }

  // 判据 2：退役小节点名每一个退役插件（`~~name~~`）。
  const retiredBody = section(text, retiredHeading)
  if (retiredBody === null) {
    fail(`判据 2 失败：${file} 里找不到《Retired / 已退役》小节`)
    continue
  }
  for (const name of retired) {
    if (!new RegExp(`~~${name}~~`, 'u').test(retiredBody)) {
      fail(`判据 2 失败：${file} 的退役小节没有点名 ${name}`)
    }
  }
}

// ── 判据 3：SECURITY.md 的支持版本**表**不得点名退役插件 ──
try {
  const security = readFileSync(join(repoRoot, 'SECURITY.md'), 'utf8')
  // ⚠️ 只看**表格行**：退役说明写在表下的引用块里（那里**必须**点名它们，才说得清谁退役了）。
  const tableLines = security.split(/\r?\n/u).filter(line => line.trim().startsWith('|')).join('\n')
  for (const name of retired) {
    if (tableLines.includes(name)) {
      fail(`判据 3 失败：SECURITY.md 的支持版本**表**里列着已退役的 ${name}`
        + `（表只应列活跃插件；退役说明写在表下的引用块里）`)
    }
  }
  for (const name of active) {
    if (!tableLines.includes(name)) fail(`判据 3 失败：SECURITY.md 的支持版本表里缺少活跃插件 ${name}`)
  }
} catch {
  fail('判据 3 失败：读不到 SECURITY.md')
}

// ── 报告 ──
if (violations.length > 0) {
  console.error('check-plugin-docs: ❌ 根文档与活跃/退役名单不一致\n')
  for (const v of violations) console.error(`  · ${v}`)
  console.error('\n修法：')
  console.error('  · 活跃插件表（根 README 中英**双份**）= plugin-set.mjs 的 activePluginNames()')
  console.error('  · 已退役插件只出现在《Retired / 已退役》小节，以 ~~名字~~ 形式点名')
  console.error('  · SECURITY.md 的《支持版本》只列活跃插件；退役说明写在表下引用块并标注「已退役」')
  console.error('  · 退役/新增插件时，改 plugin-set.mjs 的 RETIRED_PLUGINS 后本守卫会指出所有待改处')
  process.exit(1)
}

console.error(
  `check-plugin-docs: ✅ 根 README 中英双份 + SECURITY.md 与名单一致`
  + `（活跃 ${active.length}：${active.join(' / ')}；退役 ${retired.length}：${retired.join(' / ')}）`,
)
