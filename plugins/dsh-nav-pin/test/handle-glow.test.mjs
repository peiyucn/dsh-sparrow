import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DRAGGING_ATTR,
  HANDLE_SELECTOR,
  POINTER_Y_VARIABLE,
  applyGlow,
  glowOffsetPx,
  glowValue,
  shouldDriveGlow,
} from '../lib/handle-glow.js'

/**
 * 假拖拽条：只实现本模块真正用到的那一小面（见 `GlowTargetLike`）。
 * @param options - `boxTop` 盒子顶端 y；`dragging` 是否带官方拖拽标记；`initial` 初始内联值。
 * @returns 可断言的假元素。
 */
function fakeHandle({ boxTop = 76, dragging = false, initial = '' } = {}) {
  const written = []
  const style = {
    setProperty(name, value) { written.push({ name, value }) },
    getPropertyValue(name) { return name === POINTER_Y_VARIABLE ? (written.at(-1)?.value ?? initial) : '' },
  }
  return {
    written,
    hasAttribute: name => name === DRAGGING_ATTR && dragging,
    getBoundingClientRect: () => ({ top: boxTop }),
    style,
  }
}

describe('dsh-nav-pin 拖拽条光带跟随（修官方 bug）', () => {
  it('应该 复用官方自己那个变量名与公开属性', () => {
    // 官方光带 ::after 消费 var(--dsh-width-handle-pointer-y, 50%)，
    // 拖拽条是 [data-width-handle]；改名即本修法静默失效（fail-safe）。
    assert.equal(POINTER_Y_VARIABLE, '--dsh-width-handle-pointer-y')
    assert.equal(HANDLE_SELECTOR, '[data-width-handle]')
    assert.equal(DRAGGING_ATTR, 'data-dragging')
  })

  it('偏移公式应该 与官方 onPointerMove 逐字一致（clientY - box.top）', () => {
    // 官方：`event.clientY - box.top`。差一点点，悬停与拖拽交界处光带就会跳。
    assert.equal(glowOffsetPx(76, 300), 224)
    assert.equal(glowValue(76, 300), '224px')
    // 指针落在盒子上方时为负（官方同样会产生负值），不做钳制
    assert.equal(glowOffsetPx(76, 10), -66)
  })

  it('非拖拽（纯悬停）时 应该 由本插件写变量 —— 这正是官方漏掉的那半边', () => {
    // 官方那个变量**只在拖拽中**被写（`if (!dragging.current) return`），
    // 悬停只能用 CSS 兜底 50%，而 50% 相对盒子算 → 比屏幕中心低 38px。
    const handle = fakeHandle({ dragging: false })
    assert.equal(shouldDriveGlow(handle), true)
    assert.equal(applyGlow(handle, 300), true)
    assert.deepEqual(handle.written, [{ name: POINTER_Y_VARIABLE, value: '224px' }])
  })

  it('拖拽中 应该 让位给官方（同一时刻只有一个写入方）', () => {
    // 官方拖拽时自己写这个变量（还有 rAF 节流）；我们抢写会两边打架、光带发抖。
    const handle = fakeHandle({ dragging: true })
    assert.equal(shouldDriveGlow(handle), false)
    assert.equal(applyGlow(handle, 300), false)
    assert.deepEqual(handle.written, [], '拖拽中不得写入')
  })

  it('同值 应该 不重复写（省样式失效，也避免与官方内联值拉锯）', () => {
    const handle = fakeHandle({ dragging: false })
    assert.equal(applyGlow(handle, 300), true)
    assert.equal(applyGlow(handle, 300), false, '同值第二次应跳过')
    assert.equal(handle.written.length, 1)
    // 位置变了就要写
    assert.equal(applyGlow(handle, 301), true)
    assert.equal(handle.written.length, 2)
  })

  it('盒子顶端变化 应该 被反映（顶栏浮层化时 top 会从 76 变 0）', () => {
    // dsh-theme-tone 的玻璃把顶栏改成 absolute 后，拖拽条盒子从 [76,720] 变 [0,720]。
    // 公式取实测矩形，故两种布局都对 —— 这正是「改 CSS 兜底值」做不到的。
    const top76 = fakeHandle({ boxTop: 76 })
    const top0 = fakeHandle({ boxTop: 0 })
    applyGlow(top76, 300)
    applyGlow(top0, 300)
    assert.equal(top76.written[0].value, '224px')
    assert.equal(top0.written[0].value, '300px')
  })
})
