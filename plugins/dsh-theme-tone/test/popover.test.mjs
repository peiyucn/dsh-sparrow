/**
 * `popover.ts` 的守卫：顶栏弹出层的**列内夹取**。
 *
 * 背景（owner 2026-10-02）：「后台任务弹出框被右边栏遮挡的问题还是没有修好」。
 * 两个**各自独立**的成因，都实测过：
 *
 * | # | 成因 | 证据 |
 * | :--- | :--- | :--- |
 * | ① | 弹框（587..1087）向右伸出会话列，而列 `[data-phase='active']`（280..880）是 `overflow: hidden` | 官方档下**同样**裁（右缘恒 880）；`elementFromPoint` 在右半读到的是右栏面板 |
 * | ② | 弹框 `z-index: 100` 长在**顶栏**（本插件抬成 absolute + z-index 82）的层叠上下文里 ⇒ 对外只算 82；右栏面板也是 82、DOM 更后 ⇒ 面板赢 | 把祖先 overflow 全放开后，顶层仍是面板 |
 *
 * 修法：不动列几何、不动任何 z-index，只把弹框的**包含块**从触发器换成
 * 顶栏（tone 档）/ 会话根（官方档）—— 两者内边距盒都是「会话列」，右缘与顶边相同。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HEADER_ACTION_SCOPE, RIGHT_PANEL_OPEN_GATE, buildPopoverCss } from '../lib/popover.js'
import { HEADER_HEIGHT_PX } from '../lib/glass.js'
import { PLAIN_ATTR, RIGHT_PANEL_ATTR } from '../lib/constants.js'

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

  it('第一条 必须按结构命中弹框宿主，不得依赖官方哈希类名', () => {
    const sel = selsOf(rules[0])
    // :has(> ul) —— 按结构命中「里面装了弹框」的那个 wrapper；类名是 CSS-module 哈希，仓库红线。
    assert.match(sel, /:has\(>\s*ul\)/u, `必须用 :has(> ul) 按结构命中宿主：${sel}`)
    assert.ok(!/\[class[*^$|~]?=/u.test(sel), `不得依赖官方哈希类名（仓库红线）：${sel}`)
  })

  it('第二条 必须给出三条关键声明（left 压回 / top 到玻璃带下缘 / 宽度跟着列收）', () => {
    const body = bodyOf(rules[1])
    // ⚠️ left 必须 !important：官方 fit() 在窄窗口写**负数内联 left**（实测 900px 宽时
    //    -57.77px），内联样式优先级高于选择器 ⇒ 不压回就会被推出列左界。
    assert.match(body, /left:\s*0\s*!important/u,
      `left 必须 !important（官方 fit() 会写负数内联 left）：${body}`)
    // ⚠️ top 必须直引 HEADER_HEIGHT_PX：官方原值 calc(100% + 5px) 的 100% 是**包含块**高度，
    //    换了包含块后会随档位乱跑（实测 tone 档落 80 / 官方档落 905）。
    assert.match(body, new RegExp(`top:\\s*\\$?\\{?HEADER_HEIGHT_PX\\}?px|top:\\s*${HEADER_HEIGHT_PX}px`, 'u'),
      `top 必须直引 HEADER_HEIGHT_PX（${HEADER_HEIGHT_PX}），以便落在玻璃带下缘：${body}`)
    assert.match(body, /max-width:\s*100%/u,
      `必须 max-width: 100%（列比 500px 窄时跟着列收窄，实测 1100px 窗口下列只有 400px）：${body}`)
    // 只该有这三条声明 —— 多写别的都是没验证过的副作用。
    const decls = body.split(';').map(s => s.trim()).filter(Boolean)
    assert.equal(decls.length, 3, `第二条只该有三条声明，实际 ${decls.length} 条：${decls.join(' | ')}`)
  })

  it('⛔ 不得改任何 z-index（会把官方次序整条掀掉）', () => {
    // 「把弹框 z-index 调大」**无效**（它出不了顶栏那层层叠上下文）；
    // 「把顶栏抬到 83」违反官方次序（全屏面板 40 / dockkit 浮窗 60 都必须能压住顶栏，
    // 理由与实测见 glass.test.mjs 那条「顶栏不得抬到右栏面板之上」）。
    // 本表只挪**弹框自己**的包含块与几何。
    assert.ok(!/z-index/u.test(clean), `本表不得出现任何 z-index：${clean}`)
    // 也不许去动会话列的 overflow（那会破坏列自身的裁切契约）。
    assert.ok(!/overflow/u.test(clean), `本表不得动 overflow（列自身的裁切契约归官方）：${clean}`)
  })

  it('门必须只挂在「右栏面板已打开」上', () => {
    for (const one of rules.map(selsOf)) {
      assert.ok(one.includes(`[${RIGHT_PANEL_ATTR}][data-sidebar-right-open]`),
        `每条规则都必须门在右栏面板打开上（面板关着时列右缘就是视口，不该改官方布局）：${one}`)
    }
    // 锚点必须是官方公开槽位属性，且**只收窄到那一个 ul**（不宽泛到 ul 全域）。
    for (const one of rules.map(selsOf)) {
      assert.ok(one.includes("[data-slot='conversation.session.header.actions']"),
        `必须锚在官方公开槽位属性上：${one}`)
      // 两条各自收窄的方式不同：第一条用 `:has(> ul)` **按结构**找到装了弹框的宿主，
      // 第二条直接打 `ul`。两者都必须落在那个槽位**之内**。
      assert.ok(/:has\(>\s*ul\)$/u.test(one) || /\bul$/u.test(one),
        `必须收窄到那个弹出列表（ul / :has(> ul) 结尾）：${one}`)
      assert.ok(!one.includes('[class'), `不得依赖 hashed 类名：${one}`)
    }
  })

  it('⛔ 刻意 不带官方默认门 —— 该缺陷在官方档下同样存在', () => {
    // 实测：官方默认档（PLAIN 属性打上）下裁切右缘**同样是 880**、弹框**同样**被切。
    // 故这是「修官方无意的 bug」那一类，两个档都修 —— 全插件第四条同类规则
    // （另三条见 mask.ts / handle-glow.ts / surface.ts 的悬停卡，判据 docs/spec/09-nav-pin-merge.md §3.1）。
    // ⚠️ 带上门 = 官方默认档下缺陷照旧存在，而这正是 owner 复报的场景。
    assert.ok(!clean.includes(PLAIN_ATTR),
      `本表不得带官方默认门（缺陷在官方档下同样存在，两档都要修）：${clean}`)
  })

  it('不得 拼出 `body … body`（门自带 body 前缀的经典坑）', () => {
    // surface.ts 的 gatedAnchor 记过同款：门 `body:not([…])` 再拼上自带 `body ` 前缀的锚点，
    // 会拼出 `body:not([…]) body …` —— **永远不可能命中**。
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
