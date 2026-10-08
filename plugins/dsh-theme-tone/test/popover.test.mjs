/**
 * `popover.ts` 的守卫：顶栏弹出层的**列内夹取**。
 * 两个**各自独立**的成因：① 弹框向右伸出会话列，而列 `[data-phase='active']` 是 overflow: hidden；
 * ② 弹框长在**顶栏**的层叠上下文里 ⇒ 对外只算顶栏的 z-index，右栏面板也是同一层且 DOM 更后 ⇒ 面板赢。
 * 故只把弹框的**包含块**从触发器换成顶栏（tone 档）/ 会话根（官方档）——不动几何、不动 z-index。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HEADER_ACTION_SCOPE, RIGHT_PANEL_OPEN_GATE, buildPopoverCss } from '../lib/popover.js'
import { HEADER_HEIGHT_PX } from '../lib/glass.js'
import { PLAIN_ATTR, RIGHT_PANEL_ATTR } from '../lib/constants.js'
import { ANCHOR, anchorSelector } from '../lib/anchors.js'

const css = buildPopoverCss()
/** 剥注释：注释里会出现反引号、色值与选择器片段，直接扫全文会误判。 */
const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '')
/** 规则块（选择器 + 声明体）。 */
const rules = clean.split('}').map(b => b.trim()).filter(b => b.includes('{'))
const selsOf = (b) => b.split('{')[0].trim()
const bodyOf = (b) => b.slice(b.indexOf('{') + 1)

describe('popover：顶栏弹出层的列内夹取', () => {
  it('应该 恰好两条规则：一条换包含块、一条夹进列内', () => {
    assert.equal(rules.length, 2, `只该有两条规则（换包含块 + 夹进列内），实际 ${rules.length} 条：`
      + rules.map(selsOf).join(' | '))
    const [staticRule, clampRule] = rules
    assert.match(bodyOf(staticRule), /position:\s*static/u, `第一条必须把包含块换成祖先：${bodyOf(staticRule)}`)
    assert.match(bodyOf(clampRule), /left:\s*0/u, `第二条必须把左缘压回列左缘：${bodyOf(clampRule)}`)
  })

  it('第一条 必须命中弹框宿主，且走锚点属性、不依赖官方哈希类名', () => {
    const sel = selsOf(rules[0])
    // 必须走**锚点属性**（由 client half 打标），不得用 `:has()`。
    assert.ok(sel.includes(anchorSelector(ANCHOR.panelActionsUl)),
      `必须用锚点属性命中宿主（里面装了弹框的那个 wrapper）：${sel}`)
    assert.ok(!sel.includes(':has('), `不得用 :has()（开销来源）：${sel}`)
    assert.ok(!/\[class[*^$|~]?=/u.test(sel), `不得依赖官方哈希类名（仓库红线）：${sel}`)
  })

  it('第二条 必须给出三条关键声明（left 压回 / top 到玻璃带下缘 / 宽度跟着列收）', () => {
    const body = bodyOf(rules[1])
    assert.match(body, /left:\s*0\s*!important/u,
      `left 必须 !important（官方 fit() 会写负数内联 left）：${body}`)
    // 官方原值 calc(100% + 5px) 的 100% 是**包含块**高度，换了包含块会随档位乱跑。
    assert.match(body, new RegExp(`top:\\s*\\$?\\{?HEADER_HEIGHT_PX\\}?px|top:\\s*${HEADER_HEIGHT_PX}px`, 'u'),
      `top 必须直引 HEADER_HEIGHT_PX（${HEADER_HEIGHT_PX}），以便落在玻璃带下缘：${body}`)
    assert.match(body, /max-width:\s*100%/u,
      `必须 max-width: 100%（列比 500px 窄时跟着列收窄，实测 1100px 窗口下列只有 400px）：${body}`)
    // 多写别的声明都是没验证过的副作用。
    const decls = body.split(';').map(s => s.trim()).filter(Boolean)
    assert.equal(decls.length, 3, `第二条只该有三条声明，实际 ${decls.length} 条：${decls.join(' | ')}`)
  })

  it('⛔ 不得改任何 z-index（会把官方次序整条掀掉）', () => {
    // 调大弹框 z-index **无效**（它出不了顶栏那层层叠上下文）；抬顶栏又违反官方次序
    // （全屏面板 40 / dockkit 浮窗 60 都必须能压住顶栏）。本表只挪弹框自己的包含块与几何。
    assert.ok(!/z-index/u.test(clean), `本表不得出现任何 z-index：${clean}`)
    assert.ok(!/overflow/u.test(clean), `本表不得动 overflow（列自身的裁切契约归官方）：${clean}`)
  })

  it('门必须只挂在「右栏面板已打开」上', () => {
    for (const one of rules.map(selsOf)) {
      // 门走锚点属性：锚在 body 上的 `:has()` 最贵——任何 DOM 变动都重算整棵子树。
      assert.ok(one.includes(anchorSelector(ANCHOR.rightPanelOpen)),
        `每条规则都必须门在「右栏面板已打开」锚点上（面板关着时列右缘就是视口，不该改官方布局）：${one}`)
      assert.ok(!one.includes(':has('), `门不得用 :has()：${one}`)
    }
    // 锚点必须是官方公开槽位属性，且收窄到那一个 ul（不宽泛到 ul 全域）。
    for (const one of rules.map(selsOf)) {
      assert.ok(one.includes("[data-slot='conversation.session.header.actions']"),
        `必须锚在官方公开槽位属性上：${one}`)
      // 两条规则收窄方式不同：一条靠锚点属性找到装了弹框的宿主，一条直接打 `ul`。
      assert.ok(one.includes(anchorSelector(ANCHOR.panelActionsUl)) || /\bul$/u.test(one),
        `必须收窄到那个弹出列表（锚点属性 / ul 结尾）：${one}`)
      assert.ok(!one.includes('[class'), `不得依赖 hashed 类名：${one}`)
    }
  })

  it('⛔ 刻意 不带官方默认门 —— 该缺陷在官方档下同样存在', () => {
    // 官方默认档下裁切右缘同样是 880、弹框同样被切 ⇒ 属「修官方无意的 bug」，两档都修。
    assert.ok(!clean.includes(PLAIN_ATTR),
      `本表不得带官方默认门（缺陷在官方档下同样存在，两档都要修）：${clean}`)
  })

  it('不得 拼出 `body … body`（门自带 body 前缀的经典坑）', () => {
    // 门自带 `body:not([…])`，撞上自带 `body ` 前缀的锚点会拼出 `body:not([…]) body …` ⇒ **永不命中**。
    for (const one of rules.map(selsOf)) {
      assert.equal((one.match(/\bbody\b/gu) ?? []).length, 1,
        `每条选择器只能有一个 body（多一个就永不命中）：${one}`)
    }
  })

  it('导出 的锚点常量必须与规则里用的一致', () => {
    for (const one of rules.map(selsOf)) {
      assert.ok(one.startsWith(RIGHT_PANEL_OPEN_GATE),
        `规则必须以 RIGHT_PANEL_OPEN_GATE 开头：${one}`)
      assert.ok(one.includes(HEADER_ACTION_SCOPE.slice('body '.length)),
        `规则必须包含 HEADER_ACTION_SCOPE 的槽位部分：${one}`)
    }
  })
})
