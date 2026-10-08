/**
 * 桌面端（Windows）标题栏 overlay 的守卫。
 * 官方 preload 探针读 `--dsw-specific-sidebar-fill` / `--dsw-alias-label-primary` 送给 WCO，
 * 送出的是**不透明纯色** ⇒ 标题栏与紧邻的侧栏之间出现那条缝。
 * 本插件把探针**自己**那个 token 设成 transparent，让铺满视口的装饰层透上来。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CAPTION_PROBE_SYMBOL_TOKEN, CAPTION_PROBE_TOKEN, buildCaptionCss } from '../lib/caption.js'
import { PLAIN_ATTR } from '../lib/constants.js'

const css = buildCaptionCss()
/** 去掉注释后的样式表：断言不该被注释里的说明骗过。 */
const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '')

/** 全部规则块（选择器 + 声明）。 */
const blocks = () => {
  const out = []
  let i = 0
  while ((i = clean.indexOf('{', i)) !== -1) {
    const end = clean.indexOf('}', i)
    if (end === -1) break
    out.push({ sel: clean.slice(clean.lastIndexOf('}', i) + 1, i).trim(), body: clean.slice(i + 1, end) })
    i = end + 1
  }
  return out
}

describe('桌面端标题栏 overlay', () => {
  it('应该 只命中官方探针那个 span，且只重设它自己读的那个 token', () => {
    // 探针形如：body > span[style='...background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)']
    const rule = new RegExp(
      `body\\s*>\\s*span\\[style\\*='${CAPTION_PROBE_TOKEN}'\\]\\[style\\*='${CAPTION_PROBE_SYMBOL_TOKEN}'\\]\\s*\\{[^}]*\\}`,
      'u',
    ).exec(clean)
    assert.ok(rule, '缺少「按官方探针的 inline style 判别」的那条规则（两个 token 要同时出现）')
    const body = rule[0].slice(rule[0].indexOf('{') + 1, rule[0].lastIndexOf('}'))
    assert.match(body, new RegExp(`${CAPTION_PROBE_TOKEN}:\\s*transparent`, 'u'),
      '必须把探针那个 token 设成 transparent（overlay 才会变透明）')
    // 多写别的声明会带来没验证过的副作用。
    const decls = body.split(';').map(s => s.trim()).filter(Boolean)
    assert.equal(decls.length, 1, `探针规则只该有一条声明，实际 ${decls.length} 条：${decls.join(' | ')}`)
  })

  it('值必须是字面量 transparent —— 不许用 var()（token 层未就绪时会解析为空）', () => {
    // 不带官方默认门 ⇒ 受 `docs/private-seams.md` §B 约束：不得依赖插件 token 层就绪（loading 窗口内不具备）。
    const b = blocks()[0]
    assert.ok(b, '没取到规则')
    assert.ok(!/var\(/u.test(b.body), `不许用 var()（会依赖 token 层就绪），实际：${b.body.trim()}`)
    assert.match(b.body, /:\s*transparent\s*;/u, '必须是字面量 transparent')
  })

  it('不得 全局改那个 token（会连侧栏自己的底色一起抹掉）', () => {
    // 选择器**必须**限定到探针元素（`> span[style*=...]`）：全局置透明会连带抹掉侧栏底色。
    for (const sel of ['html', 'body', ':root', '*']) {
      const bare = new RegExp(`(?:^|[},])\\s*${sel.replace(/[[\]().*+^$\\]/gu, '\\$&')}\\s*\\{[^}]*${CAPTION_PROBE_TOKEN}:`, 'u')
      assert.ok(!bare.test(clean), `不许对 ${sel} 直接改 ${CAPTION_PROBE_TOKEN}（会抹掉侧栏底色）`)
    }
    assert.match(clean, /span\[style\*=/u, '选择器必须限定到官方探针那个 span')
  })

  it('刻意 不带官方默认门 —— 带门会被官方观察者漏掉 ⇒ 静默失效', () => {
    // 官方 preload 只 observe root[lang] / body[data-ds-dark-theme, style] / head，**不观察**门属性
    // ⇒ 带门会静默失效（overlay 停在门关着时送出的不透明色）。不带门没有代价：读的是同一个 token。
    const b = blocks()[0]
    assert.ok(b, '没取到规则')
    assert.ok(!b.sel.includes(PLAIN_ATTR),
      '本条**不得**带官方默认门（带了会因官方不观察该属性而静默失效）')
    assert.ok(!/^html\[/mu.test(clean), '也不要改用 html 前缀规则（同样会与官方时序耦合）')
  })

  it('应该 不自己探平台：靠官方探针元素是否存在来生效（web / macOS 天然不命中）', () => {
    assert.ok(!/data-windows-titlebar|data-platform|navigator/u.test(clean),
      '不该自己探平台：命中与否交给官方探针元素自己决定')
  })

  it('应该 不改官方的 symbolColor 那个 token（按钮图标色官方已有明暗轴适配）', () => {
    // 字色那个只用来收窄选择器，不该赋值。
    const b = blocks()[0]
    assert.ok(!new RegExp(`${CAPTION_PROBE_SYMBOL_TOKEN}\\s*:`, 'u').test(b.body),
      '不该给符号色 token 赋任何值（官方已按明暗轴送，改了会让按钮图标色失真）')
  })
})
