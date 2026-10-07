import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { scopeMarkSvg } from '../lib/client/mark-ids.js'

/**
 * 品牌标 SVG 的**实例作用域化**（`src/client/mark-ids.ts`）。
 *
 * ## 为什么有这条测试（owner 2026-10-07 报的真缺陷）
 *
 * owner：「对话界面的额度卡里，浅色模式下，logo 好像没有反色处理。」
 *
 * 根因：两枚品牌标常量各自带**写死的渐变 id**，而同一文档里会被注入**多份**
 * （顶栏按钮宽/窄两形态都渲染 + 展开面板标题行再一份）。`fill="url(#id)"` 按
 * **文档序第一个**同名元素解析；宽对话区（> 656px）下窄档那份是 `display:none`
 * ⇒ 面板那份解析到不可见定义 ⇒ **渐变方底整个不画**，只剩硬编码 `fill="#fff"`
 * 的白色字形。深色轴上白字本来就该白、不易察觉；**浅色轴上白字落在近白底上
 * ⇒ 看起来就是「logo 没反色」**。
 *
 * 受控实验（最小 rect + linearGradient，排除素材特殊性）：
 *   单份（可见）→ 画出；同 id 两份、第一份 `display:none` → **不画**（品牌色像素 0）；
 *   同 id 两份都可见 → 都画出；id 各自唯一 → 画出。
 *
 * 这组用例钉住纯函数的**契约**（引用与定义必须同步改名、几何不得被动）。
 */
const CLIENT = new URL('../src/client/', import.meta.url)
const read = (name) => readFile(new URL(name, CLIENT), 'utf8')

/** 源码里的 SVG 常量真值（用于断言「作用域化不改几何」）。 */
async function svgConst(name) {
  const source = await read('CodeBuddyCreditsIndicator.tsx')
  const line = source.split(/\r?\n/u).find(l => l.includes(`const ${name} =`))
  assert.ok(line, `找不到 SVG 常量 ${name}`)
  const start = line.indexOf("'")
  const end = line.lastIndexOf("'")
  assert.ok(end > start, `${name} 的字符串字面量没闭合`)
  return line.slice(start + 1, end)
}

const SAMPLE = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
  + '<defs><radialGradient id="grad"><stop stop-color="#2EA99D"/><stop offset="1" stop-color="#6C4DFF"/></radialGradient></defs>'
  + '<path d="M1 1h2v2H1z" fill="url(#grad)"/></svg>'

describe('品牌标 SVG：实例作用域化', () => {
  it('应该 给 id 与 url(#…) 引用加同一个前缀（定义与引用同步改名）', () => {
    const scoped = scopeMarkSvg(SAMPLE, 'r1')
    assert.match(scoped, /id="r1-grad"/u, 'id 必须加前缀')
    assert.match(scoped, /url\(#r1-grad\)/u, 'url(#…) 引用必须加同一前缀')
    assert.ok(!/url\(#grad\)/u.test(scoped), '不得留下未加前缀的引用（那会指向别人那份定义）')
  })

  it('两个实例 应该 得到互不相同的 id（同文档共存不撞车）', () => {
    const a = scopeMarkSvg(SAMPLE, 'r1')
    const b = scopeMarkSvg(SAMPLE, 'r2')
    const idOf = (s) => /id="([^"]+)"/u.exec(s)[1]
    assert.notEqual(idOf(a), idOf(b), '两个实例的 id 必须不同（否则又解析到文档序第一份）')
    // 各自只引用自己那份。
    assert.match(a, new RegExp(`url\\(#${idOf(a)}\\)`, 'u'))
    assert.match(b, new RegExp(`url\\(#${idOf(b)}\\)`, 'u'))
  })

  it('⛔ 不得改动几何 / 颜色（只动 id 与引用）', () => {
    const scoped = scopeMarkSvg(SAMPLE, 'r1')
    // 剥掉 id 与引用后应与原串完全一致 ⇒ 一个字节的几何都没动。
    const normalize = (s) => s.replace(/id="[^"]*"/gu, 'id="X"').replace(/url\(#[^)]*\)/gu, 'url(#X)')
    assert.equal(normalize(scoped), normalize(SAMPLE), '除 id 与引用外不得有任何改动')
  })

  it('应该 处理带引号的 url 写法与 href 引用', () => {
    const quoted = SAMPLE.replace('url(#grad)', 'url("#grad")')
    assert.match(scopeMarkSvg(quoted, 'r1'), /url\("#r1-grad"\)/u, '带引号的 url(#…) 也要改名')
    const href = SAMPLE.replace('fill="url(#grad)"', 'href="#grad"')
    assert.match(scopeMarkSvg(href, 'r1'), /href="#r1-grad"/u, 'href="#…" 也要改名')
    const xlink = SAMPLE.replace('fill="url(#grad)"', 'xlink:href="#grad"')
    assert.match(scopeMarkSvg(xlink, 'r1'), /xlink:href="#r1-grad"/u, 'xlink:href="#…" 也要改名')
  })

  it('应该 把 id 里不安全的字符折成下划线（React useId 形如 `:r1:`）', () => {
    const scoped = scopeMarkSvg(SAMPLE, ':r7:')
    const id = /id="([^"]+)"/u.exec(scoped)[1]
    assert.match(id, /^_r7_-grad$/u, `id 里的冒号应折成下划线，实际 ${id}`)
    assert.match(scoped, new RegExp(`url\\(#${id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\)`, 'u'),
      '引用必须与被折过的 id 完全一致')
  })

  it('作用域为空 应该 原样返回（fail-soft：宁可退回旧行为也不抛错）', () => {
    assert.equal(scopeMarkSvg(SAMPLE, ''), SAMPLE, '空作用域应原样返回')
    assert.equal(scopeMarkSvg(SAMPLE, '::'), SAMPLE, '净化后为空的应原样返回')
  })

  it('真实常量 应该 只剩一个 id 与一处引用被同步改名', async () => {
    for (const name of ['MARK_SQUARE_SVG', 'LOGO_SVG']) {
      const raw = await svgConst(name)
      const scoped = scopeMarkSvg(raw, 'r9')
      // 原串各有一处 id + 一处 url 引用。
      assert.equal([...raw.matchAll(/\bid="/gu)].length, 1, `${name} 原串应只有一个 id`)
      assert.equal([...scoped.matchAll(/\bid="/gu)].length, 1, `${name} 作用域化后仍只有一个 id`)
      assert.equal([...scoped.matchAll(/url\(#/gu)].length, 1, `${name} 作用域化后仍只有一处 url 引用`)
      const id = /\bid="([^"]+)"/u.exec(scoped)[1]
      assert.ok(id.startsWith('r9-'), `${name} 的 id 应带前缀，实际 ${id}`)
      assert.ok(scoped.includes(`url(#${id})`), `${name} 的引用必须指向自己这个 id`)
      // 渐变端色与 viewBox 不得被动。
      assert.match(scoped, /stop-color="#2EA99D"/u, `${name} 渐变起点不得被动`)
      assert.match(scoped, /stop-color="#6C4DFF"/u, `${name} 渐变终点不得被动`)
    }
  })
})
