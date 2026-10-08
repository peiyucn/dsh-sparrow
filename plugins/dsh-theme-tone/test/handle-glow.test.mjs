/**
 * dsh-theme-tone：拖拽条悬停光带跟随指针（自 `dsh-nav-pin` 并入，见 `docs/spec/09-nav-pin-merge.md`）。
 * ⚠️ 与原版的**实质差异**：本条**不带色调门**、两个档位都生效，故新增两类守卫：
 * ① 源码里不得出现色调门；② 不得硬编码 `76`（几何只有一个真值来源 HEADER_HEIGHT_PX）。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
import { PLAIN_ATTR } from '../lib/constants.js'

/** 假拖拽条：只实现本模块真正用到的那一小面（见 `GlowTargetLike`）。 */
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

describe('dsh-theme-tone 拖拽条光带跟随（修官方 bug）', () => {
  it('应该 复用官方自己那个变量名与公开属性', () => {
    assert.equal(POINTER_Y_VARIABLE, '--dsh-width-handle-pointer-y')
    assert.equal(HANDLE_SELECTOR, '[data-width-handle]')
    assert.equal(DRAGGING_ATTR, 'data-dragging')
  })

  it('偏移公式应该 与官方 onPointerMove 逐字一致（clientY - box.top）', () => {
    assert.equal(glowOffsetPx(76, 300), 224)
    assert.equal(glowValue(76, 300), '224px')
    assert.equal(glowOffsetPx(76, 10), -66)
  })

  it('非拖拽（纯悬停）时 应该 由本插件写变量 —— 这正是官方漏掉的那半边', () => {
    const handle = fakeHandle({ dragging: false })
    assert.equal(shouldDriveGlow(handle), true)
    assert.equal(applyGlow(handle, 300), true)
    assert.deepEqual(handle.written, [{ name: POINTER_Y_VARIABLE, value: '224px' }])
  })

  it('拖拽中 应该 让位给官方（同一时刻只有一个写入方）', () => {
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
    assert.equal(applyGlow(handle, 301), true)
    assert.equal(handle.written.length, 2)
  })

  it('盒子顶端变化 应该 被反映（顶栏浮层化时 top 会从 76 变 0）', () => {
    const top76 = fakeHandle({ boxTop: 76 })
    const top0 = fakeHandle({ boxTop: 0 })
    applyGlow(top76, 300)
    applyGlow(top0, 300)
    assert.equal(top76.written[0].value, '224px')
    assert.equal(top0.written[0].value, '300px')
  })

  describe('合并契约（方案 §3.1 决策 5 + §3.3）', () => {
    it('⛔ 不得带色调门 —— 官方默认档下也要修这个官方 bug', async () => {
      const src = await readFile(new URL('../src/handle-glow.ts', import.meta.url), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
      assert.ok(!code.includes(PLAIN_ATTR), 'handle-glow 不得读/写色调门属性')
      assert.ok(!code.includes('body:not('), 'handle-glow 不得产出带门的选择器')
    })

    it('⛔ 不得硬编码 76（几何只有一个真值来源：运行时实测矩形）', async () => {
      // HEADER_HEIGHT_PX 是几何唯一真值来源；光带必须走 getBoundingClientRect()，否则顶栏浮层化后会偏。
      const src = await readFile(new URL('../src/handle-glow.ts', import.meta.url), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
      assert.ok(!/\b76\b/u.test(code), 'handle-glow 源码（去注释后）不得出现字面量 76')
      assert.match(code, /getBoundingClientRect\(\)/u, '必须取实测矩形')
    })

    it('不读任何 CSS 变量（不带门的规则不得依赖插件 token 层就绪）', async () => {
      const src = await readFile(new URL('../src/handle-glow.ts', import.meta.url), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
      assert.ok(!/getComputedStyle/u.test(code), '不得读计算样式')
      assert.ok(!/var\(--/u.test(code), '不得产出 CSS 变量引用')
    })
  })
})
