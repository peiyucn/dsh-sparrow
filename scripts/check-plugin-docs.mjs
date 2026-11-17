

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
        if (end < 0) break
        inComment = false
        rest = rest.slice(end + 3)
        continue
      }
      const start = rest.indexOf('<!--')
      if (start < 0) { stripped += rest; break }
      stripped += rest.slice(0, start)
      inComment = true
      rest = rest.slice(start + 4)
    }
    out.push(stripped)
  }
  return out
}


const ITEM_RE = /^\s*(?:[-*]|\d+[.)])\s+\S/u

const countOf = (lines, re) => lines.filter(line => re.test(line)).length


const h2s = (text) => unfenced(text)
  .filter(line => /^##\s+\S/u.test(line))
  .map(line => line.replace(/^##\s+/u, '').trim())


const topItems = (text) => countOf(unfenced(text), ITEM_RE)


function versionSections(text) {
  const out = []
  let current = null
  for (const line of unfenced(text)) {


    const heading = /^##\s+\[?([0-9][^\s\]]*)\]?/u.exec(line)
    if (heading) {
      current = { version: heading[1], items: 0 }
      out.push(current)
      continue
    }
    if (current !== null && ITEM_RE.test(line)) current.items += 1
  }
  return out
}


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





function tableSection(text, headerRe) {
  const lines = text.split(/\r?\n/u)
  const start = lines.findIndex(line => headerRe.test(line))
  if (start < 0) return null
  const end = lines.findIndex((line, i) => i > start && /^##\s/u.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}


function tablePlugins(body) {
  const names = new Set()
  for (const line of body.split(/\r?\n/u)) {
    if (!line.trim().startsWith('|')) continue
    for (const m of line.matchAll(/\]\(plugins\/([^/)\s]+)\//gu)) names.add(m[1])
  }
  return names
}


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



  const requiredInTable = active.filter(name => name !== 'dsh-desk-one')
  for (const name of retired) {
    if (listed.has(name)) {
      fail(`判据 1：${file} 的插件表里列着**已退役**的 ${name}（退役插件只能出现在《Retired / 已退役》小节）`)
    }
  }
  for (const name of requiredInTable) if (!listed.has(name)) fail(`判据 1：${file} 的插件表缺少活跃插件 ${name}`)
  for (const name of listed) if (!active.includes(name)) fail(`判据 1：${file} 的插件表里有未知名字 ${name}`)
  if (!text.includes('plugins/dsh-desk-one/README')) fail(`判据 1：${file} 没有指向 Desk One 文档页`)

  const retiredBody = section(text, retiredHeading)
  if (retiredBody === null) { fail(`判据 2：${file} 里找不到《Retired / 已退役》小节`); continue }
  for (const name of retired) {
    if (!new RegExp(`~~${name}~~`, 'u').test(retiredBody)) fail(`判据 2：${file} 的退役小节没有点名 ${name}`)
  }
}




{
  const security = read('SECURITY.md')
  if (security === null) fail('判据 3：读不到 SECURITY.md')
  else {

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




for (const name of active) {
  const dir = `plugins/${name}`




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

    const patch = pkg.dsh?.bundle?.patch
    if (typeof patch !== 'string' || patch.trim() === '') {
      fail(`判据 7：${dir}/package.json 缺少 dsh.bundle.patch（Loader 靠它自动挂载）`)
    } else {

      const patchPath = patch.replace(/^\.\//u, '')
      if (!existsSync(join(repoRoot, dir, patchPath))) {
        fail(`判据 7：${dir}/package.json 的 dsh.bundle.patch 指向不存在的文件 ${patch}`)
      } else if (!(pkg.files ?? []).some(entry => entry.replace(/^\.\//u, '') === patchPath)) {
        fail(`判据 7：${dir}/package.json 的 files 清单没有收录组合补丁 ${patch}（装了也挂不上）`)
      }
    }
  }


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

    if (!unfenced(a).slice(0, 8).join('\n').includes(crossEn)) fail(`判据 5：${en} 顶部缺少指向 ${crossEn} 的互链`)
    if (!unfenced(b).slice(0, 8).join('\n').includes(crossZh)) fail(`判据 5：${zh} 顶部缺少指向 ${crossZh} 的互链`)

    const ha = h2s(a).length, hb = h2s(b).length
    if (ha !== hb) fail(`判据 5：${name} ${kind} 的 ## 标题数中英不一致（EN ${ha} / ZH ${hb}）—— 漏译或漏加一节`)

    const ia = topItems(a), ib = topItems(b)
    if (ia !== ib) fail(`判据 5：${name} ${kind} 的条目数中英不一致（EN ${ia} / ZH ${ib}）—— 漏译或漏加一条（无序/有序、含缩进子条目）`)


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


  for (const file of [`${dir}/README.md`, `${dir}/README.zh-CN.md`]) {
    const text = read(file)
    if (text === null) continue
    for (const m of text.matchAll(/\]\((plugins\/[^)\s]+)\)/gu)) {
      if (!existsSync(join(repoRoot, m[1]))) fail(`判据 8：${file} 的链接指向不存在的文件 ${m[1]}`)
    }
  }
}


for (const file of ['README.md', 'README.zh-CN.md']) {
  const text = read(file)
  if (text === null) continue
  for (const m of text.matchAll(/\]\((plugins\/[^)\s]+)\)/gu)) {
    if (!existsSync(join(repoRoot, m[1]))) fail(`判据 8：${file} 的链接指向不存在的文件 ${m[1]}`)
  }
}




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
