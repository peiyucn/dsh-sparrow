// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANCHOR, ANCHOR_ATTR, ANCHOR_TOKENS, anchorSelector, anchorValue } from '../lib/anchors.js'

/**
 * `src/anchors.ts` 的契约：把原本写在 CSS 里的 `:has()` 判据搬到运行期。
 * 判据不等价时**不会报错**，只会让某些面静默少掉质感——故必须由测试钉住。
 *
 * ⚠️ 2026-10-26 做减法：分组菜单的三个锚点（`menuGrouped` / `menuSelfScroller` / `menuChild`）
 * 随「标题条 + 内圈圆角」整族一起删除（官方 `MenuGroup` 已把这件做好）。
 */
describe('anchors：锚点属性的契约', () => {
  it('每个 token 都生成词匹配选择器（一个元素可同时是多个角色）', () => {
    for (const token of ANCHOR_TOKENS) {
      const sel = anchorSelector(token)
      assert.equal(sel, `[${ANCHOR_ATTR}~="${token}"]`, `${token} 的选择器形状`)
      // 必须是 `~=` 而不是 `=`：同一元素可能同时命中多个角色。
      assert.ok(sel.includes('~='), `${token} 必须用词匹配（~=）`)
    }
  })

  it('anchorValue 去重且按固定顺序排列（顺序固定才能让「值没变就不写」生效）', () => {
    assert.equal(anchorValue([]), '')
    assert.equal(anchorValue([ANCHOR.dialog]), ANCHOR.dialog)
    // 顺序无关：否则每轮都要重写属性，白引一次样式失效。
    const a = anchorValue([ANCHOR.dialog, ANCHOR.listboxHost])
    const b = anchorValue([ANCHOR.listboxHost, ANCHOR.dialog])
    assert.equal(a, b, '集合相同则值必须相同（与传入顺序无关）')
    assert.equal(anchorValue([ANCHOR.dialog, ANCHOR.dialog]), ANCHOR.dialog)
  })

  it('token 唯一（不得两个角色共用同一个值）', () => {
    const values = Object.values(ANCHOR)
    assert.equal(new Set(values).size, values.length, `token 有重复：${values.join(', ')}`)
  })

  it('⛔ 已删除的分组菜单锚点不得复活（官方 MenuGroup 已接管标题条与圆角）', () => {
    const values = Object.values(ANCHOR)
    for (const removed of ['menu-grouped', 'menu-self-scroller', 'menu-child']) {
      assert.ok(!values.some(value => value === removed), `锚点 ${removed} 已随分组菜单标题条整族删除，不得再加回来`)
    }
  })

  it('账号通知 stack：token 打在通知卡的**父元素**上（抬 z-index 只能落在 stack）', async () => {
    // 官方 AccountNoticeStack（rc.2）：createPortal 直挂 body、z-index: 40、isolation: isolate；卡片是 aside[data-front]。
    // card 在 stack 的层叠上下文内 ⇒ 抬 card 的 z-index 出不去，必须抬 stack。
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /document\.querySelector\('aside\[data-front\]'\)/u, '按官方公开属性 aside[data-front] 找通知卡')
    assert.match(src, /add\(notice\.parentElement, ANCHOR\.noticeStack\)/u, 'token 必须打在父 stack 上')
  })
})
