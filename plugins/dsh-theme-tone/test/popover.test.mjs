/**
 * `popover.ts` 的守卫：顶栏后台任务弹框的**对齐方向**。
 *
 * 官方 `.menu { position: absolute; left: 0; width: 500px }` 锚在 ~150px 宽的触发器容器上
 * ⇒ 弹框**向右**伸，伸出会话列的部分被列自身的 `overflow: hidden` 裁掉；右栏打开时列变窄，尤其明显。
 * 本表只把它改成**右对齐**（右缘贴触发器右缘）⇒ 向左伸、整块落在列内。
 *
 * ⚠️ 只动对齐方向。曾试过「换包含块逃裁切」与「抬顶栏过层序」，两者都不成立
 * （`docs/spec/12` 有受控实验与失败记录）—— 下面几条断言就是防止它们被重新引入。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HEADER_ACTION_SCOPE, RIGHT_PANEL_OPEN_GATE, buildPopoverCss } from '../lib/popover.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import { ANCHOR, anchorSelector } from '../lib/anchors.js'

const css = buildPopoverCss()
/** 剥注释：注释里会出现选择器片段与 `left: 0` 这类字样，直接扫全文会误判。 */
const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '')
const rules = clean.split('}').map(b => b.trim()).filter(b => b.includes('{'))
const sel = rules.map(b => b.split('{')[0].trim())
const body = rules.map(b => b.slice(b.indexOf('{') + 1))

describe('popover：顶栏后台任务弹框只改对齐方向', () => {
  it('应该 恰好一条规则，且只打在那个槽位的 ul 上', () => {
    assert.equal(rules.length, 1, `只该有一条规则，实际 ${rules.length} 条：${sel.join(' | ')}`)
    assert.ok(sel[0].includes(`[data-slot='conversation.session.header.actions']`),
      `必须锚在官方公开槽位属性上：${sel[0]}`)
    assert.match(sel[0], /\bul$/u, `必须收窄到那个弹出列表（ul 结尾）：${sel[0]}`)
    assert.ok(!sel[0].includes('[class'), `不得依赖 hashed 类名（仓库红线）：${sel[0]}`)
  })

  it('必须右对齐：left: auto !important + right: 0，⛔ 不得出现 left: 0', () => {
    assert.match(body[0], /left:\s*auto\s*!important/u,
      `left 必须 auto !important（官方在样式表与内联两处都写了 left，非 !important 压不住）：${body[0]}`)
    assert.match(body[0], /right:\s*0/u, `必须 right: 0（右缘贴触发器右缘）：${body[0]}`)
    assert.ok(!/left:\s*0(?![.\d])/u.test(body[0]),
      `⛔ 不得出现 left: 0 —— 那正是被裁的官方写法：${body[0]}`)
    const decls = body[0].split(';').map(s => s.trim()).filter(Boolean)
    assert.equal(decls.length, 2, `只该有两条声明，实际 ${decls.length} 条：${decls.join(' | ')}`)
  })

  it('⛔ 不得动包含块 / z-index / overflow（三条都试过，都不成立）', () => {
    assert.ok(!/position/u.test(clean), `⛔ 不得动 position（换包含块逃不出列的裁切）：${clean}`)
    assert.ok(!/z-index/u.test(clean), `⛔ 不得动 z-index（抬弹框自己无用、抬顶栏改不了裁切）：${clean}`)
    assert.ok(!/overflow/u.test(clean), `⛔ 不得动 overflow（列自身的裁切契约归官方）：${clean}`)
  })

  it('门必须只挂在「右栏面板已打开」上，且不得用 :has()', () => {
    assert.ok(sel[0].startsWith(RIGHT_PANEL_OPEN_GATE), `规则必须以 RIGHT_PANEL_OPEN_GATE 开头：${sel[0]}`)
    assert.ok(sel[0].includes(anchorSelector(ANCHOR.rightPanelOpen)), `门走锚点属性：${sel[0]}`)
    assert.ok(!clean.includes(':has('), `不得用 :has()（样式重算大头）：${clean}`)
  })

  it('不得 拼出 `body … body`（门自带 body 前缀的经典坑）', () => {
    assert.equal((sel[0].match(/\bbody\b/gu) ?? []).length, 1,
      `选择器只能有一个 body（多一个就永不命中）：${sel[0]}`)
    assert.ok(sel[0].includes(HEADER_ACTION_SCOPE.slice('body '.length)), `必须包含槽位部分：${sel[0]}`)
  })

  it('⛔ 刻意 不带官方默认门 —— 该缺陷在官方档下同样存在', () => {
    assert.ok(!clean.includes(PLAIN_ATTR),
      `本表不得带官方默认门（官方档下同样被裁，两档都改）：${clean}`)
  })
})
