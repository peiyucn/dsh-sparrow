import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANCHOR, ANCHOR_ATTR, ANCHOR_TOKENS, anchorSelector, anchorValue } from '../lib/anchors.js'
import {
  GROUPED_MENU_SELECTOR,
  GROUPED_MENU_UNGUARDED_SELECTOR,
  GROUPED_MENU_SCROLLER_SELECTOR,
  GROUPED_MENU_SELF_SCROLLER_SUFFIX,
} from '../lib/surface.js'

/**
 * `src/anchors.ts` 的契约 —— 把「原本写在 CSS 里的 `:has()` 判据」搬到运行期的载体。
 *
 * 为什么值得单独测：这次改动的收益（样式重算 −3.1 秒/100 帧）**只在判据等价时才成立**，
 * 而判据错了**不会报错**、只会让某些面静默少掉质感。故等价性必须由测试钉住。
 * （端到端的等价性对拍在 `TEMP/verify-anchor-*.mjs`，需要真机 GUI。）
 */
describe('anchors：锚点属性的契约', () => {
  it('每个 token 都生成词匹配选择器（一个元素可同时是多个角色）', () => {
    for (const token of ANCHOR_TOKENS) {
      const sel = anchorSelector(token)
      assert.equal(sel, `[${ANCHOR_ATTR}~="${token}"]`, `${token} 的选择器形状`)
      // ⚠️ 必须是 `~=` 而不是 `=`：同一元素可能同时命中多个角色
      //（例如 rc.2 的分组菜单：`menu-grouped` + `menu-self-scroller` 都在它身上）。
      assert.ok(sel.includes('~='), `${token} 必须用词匹配（~=）`)
    }
  })

  it('anchorValue 去重且按固定顺序排列（顺序固定才能让「值没变就不写」生效）', () => {
    assert.equal(anchorValue([]), '')
    assert.equal(anchorValue([ANCHOR.dialog]), ANCHOR.dialog)
    // 传入顺序不同、集合相同 ⇒ 结果必须一致（否则每轮都要重写属性，白引一次样式失效）
    const a = anchorValue([ANCHOR.dialog, ANCHOR.listboxHost])
    const b = anchorValue([ANCHOR.listboxHost, ANCHOR.dialog])
    assert.equal(a, b, '集合相同则值必须相同（与传入顺序无关）')
    // 重复项去重
    assert.equal(anchorValue([ANCHOR.dialog, ANCHOR.dialog]), ANCHOR.dialog)
  })

  it('token 唯一（不得两个角色共用同一个值）', () => {
    const values = Object.values(ANCHOR)
    assert.equal(new Set(values).size, values.length, `token 有重复：${values.join(', ')}`)
  })

  /**
   * ⚠️ **本轮真犯过的 bug 的回归守卫**。
   *
   * 分组菜单有三条**语义各不相同**的判据，曾被我合并到同一个 token：
   * * `menu-grouped`      —— 分组在**任意深度**（给菜单本身上料）
   * * `menu-self-scroller` —— 分组是**直接子**（rc.2 的滚动容器就是菜单自己）
   * * `menu-child`        —— 含分组的那个**直接子**元素（rc.1 的滚动容器）
   *
   * 合并的后果：本仓库 codebuddy 菜单实测 `groupsDirect: 0 / groupsAny: 2`
   * ⇒ 用「直接子」判据去标它，结果是**它静默失去质感**（不报错、不崩）。
   * 抓到它的是真机**等价性对拍**（拿原选择器当基准逐个比命中集），不是断言。
   */
  it('⛔ 分组菜单的三条腿必须是三个不同 token（合并会静默丢面）', () => {
    const grouped = GROUPED_MENU_SELECTOR
    const selfScroller = GROUPED_MENU_SELF_SCROLLER_SUFFIX
    const child = GROUPED_MENU_SCROLLER_SELECTOR

    // 三条选择器两两不同（否则必有一条是死规则或覆盖错对象）
    assert.notEqual(grouped, selfScroller, '菜单本体与「自己就是滚动容器」不是同一条')
    assert.notEqual(grouped, child, '菜单本体与「含分组的直接子」不是同一条')
    assert.notEqual(selfScroller, child, '两条滚动容器腿必须可区分')

    // 语义落点：
    //  * 菜单本体 = menuGrouped（任意深度）
    assert.ok(grouped.includes(anchorSelector(ANCHOR.menuGrouped)), `菜单本体应读 menuGrouped：${grouped}`)
    //  * 「自己就是滚动容器」= menuSelfScroller（直接子），且**不带组合符**（贴在锚点自己后面）
    assert.ok(selfScroller.includes(anchorSelector(ANCHOR.menuSelfScroller)), `rc.2 那条腿应读 menuSelfScroller：${selfScroller}`)
    assert.ok(!selfScroller.startsWith('>'), 'rc.2 那条腿是「锚点自己」形态，不得带组合符')
    //  * 「含分组的直接子」= menuChild（带组合符）
    assert.ok(child.includes(anchorSelector(ANCHOR.menuChild)), `rc.1 那条腿应读 menuChild：${child}`)
    assert.ok(child.startsWith('>'), 'rc.1 那条腿是「锚点的直接子」形态，必须带组合符')

    // 三条都不得再出现 :has()（那正是这次要消灭的开销来源）
    for (const sel of [grouped, selfScroller, child, GROUPED_MENU_UNGUARDED_SELECTOR]) {
      assert.ok(!sel.includes(':has('), `不得再用 :has()：${sel}`)
    }
  })

  it('无守卫锚点保留裸 role（组合规则的后半段已保证有分组）', () => {
    // 「无守卫」的收益来自「不重复问一遍有没有分组」：去掉后半段已有的信息不改变命中集。
    // 判据搬走后，它仍然是裸 `[role='menu']`。
    assert.equal(GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\s+/u, ''), "[role='menu']")
  })
})
