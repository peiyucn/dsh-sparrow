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
 * `src/anchors.ts` 的契约：把原本写在 CSS 里的 `:has()` 判据搬到运行期。
 * 判据不等价时**不会报错**，只会让某些面静默少掉质感——故必须由测试钉住。
 */
describe('anchors：锚点属性的契约', () => {
  it('每个 token 都生成词匹配选择器（一个元素可同时是多个角色）', () => {
    for (const token of ANCHOR_TOKENS) {
      const sel = anchorSelector(token)
      assert.equal(sel, `[${ANCHOR_ATTR}~="${token}"]`, `${token} 的选择器形状`)
      // 必须是 `~=` 而不是 `=`：同一元素可能同时命中多个角色（如分组菜单）。
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

  /**
   * ⚠️ 分组菜单三条腿语义不同，**必须**是三个 token：合并会让某些面静默失去质感。
   * menu-grouped = 分组在任意深度；menu-self-scroller = 分组是直接子；menu-child = 含分组的直接子。
   */
  it('⛔ 分组菜单的三条腿必须是三个不同 token（合并会静默丢面）', () => {
    const grouped = GROUPED_MENU_SELECTOR
    const selfScroller = GROUPED_MENU_SELF_SCROLLER_SUFFIX
    const child = GROUPED_MENU_SCROLLER_SELECTOR

    // 两两不同：否则必有一条是死规则或覆盖错对象。
    assert.notEqual(grouped, selfScroller, '菜单本体与「自己就是滚动容器」不是同一条')
    assert.notEqual(grouped, child, '菜单本体与「含分组的直接子」不是同一条')
    assert.notEqual(selfScroller, child, '两条滚动容器腿必须可区分')

    assert.ok(grouped.includes(anchorSelector(ANCHOR.menuGrouped)), `菜单本体应读 menuGrouped：${grouped}`)
    assert.ok(selfScroller.includes(anchorSelector(ANCHOR.menuSelfScroller)), `rc.2 那条腿应读 menuSelfScroller：${selfScroller}`)
    assert.ok(!selfScroller.startsWith('>'), 'rc.2 那条腿是「锚点自己」形态，不得带组合符')
    assert.ok(child.includes(anchorSelector(ANCHOR.menuChild)), `rc.1 那条腿应读 menuChild：${child}`)
    assert.ok(child.startsWith('>'), 'rc.1 那条腿是「锚点的直接子」形态，必须带组合符')

    // 判据搬走后三条都不得再出现 :has()（那正是要消灭的开销来源）。
    for (const sel of [grouped, selfScroller, child, GROUPED_MENU_UNGUARDED_SELECTOR]) {
      assert.ok(!sel.includes(':has('), `不得再用 :has()：${sel}`)
    }
  })

  it('无守卫锚点保留裸 role（组合规则的后半段已保证有分组）', () => {
    // 无守卫版去掉「是否含分组」那半段后仍是裸 [role='menu']，命中集不变。
    assert.equal(GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\s+/u, ''), "[role='menu']")
  })
})
