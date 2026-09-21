import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 积分弹层的**皮肤契约**（`src/client/CreditDialog.tsx`）。
 *
 * 这里的断言都是「从源码里读数值」而不是渲染 —— 本插件没有 client 侧的 DOM 测试环境
 * （弹层是 inline style，不落 CSS 文件）。读源码能钉住契约，代价是改写得换个写法时
 * 断言要跟着改；这是有意的取舍（宁可测试啰嗦，也不要「悄悄变宽」回归）。
 */
const SOURCE = new URL('../src/client/CreditDialog.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')

/** 取 `panelStyle` 字面量里某个属性的字符串值。 */
function panelValue(prop) {
  const at = source.indexOf('const panelStyle')
  assert.ok(at >= 0, '找不到 panelStyle')
  const body = source.slice(at, source.indexOf('} as CSSProperties', at))
  const match = new RegExp(`${prop}:\\s*'([^']+)'`, 'u').exec(body)
  assert.ok(match, `panelStyle 里没有 ${prop}`)
  return match[1]
}

describe('积分弹层：宽度', () => {
  it('宽度地板应该 取 260px —— 官方 300 过宽、贴合内容又过窄', () => {
    // owner 两轮反馈：「这个弹窗也过宽了」→「会话积分卡片又调的太窄了」，两次都是这条地板。
    // 实测（无头浏览器 + 真实中英文案）：最常见形态的 max-content 是 216.4px；
    // 官方地板 300px 白空 ~84px，而贴合内容（<216.4px）右下角顶死、没有呼吸位。
    // 260 落在两者之间（比内容宽 ~44px、比官方窄 40px）。这条把那个数钉住。
    const minWidth = panelValue('minWidth')
    assert.equal(minWidth, 'min(260px, calc(100vw - 24px))')
    assert.ok(!minWidth.includes('300px'), '不得退回官方那条 300px 地板（过宽）')
    assert.ok(!minWidth.includes('200px'), '也不得退化到 200px（贴合内容 = 过窄）')
  })

  it('宽度策略应该 仍是「量内容 + 上限 + 视口钳制」', () => {
    assert.equal(panelValue('width'), 'max-content', '宽度由内容决定，地板只兜底')
    assert.equal(panelValue('maxWidth'), 'min(440px, calc(100vw - 24px))', '上限与官方一致')
  })

  it('长模型 id 应该 仍能任意位置换行（不撑破面板）', () => {
    // 宽度交给 max-content 之后，防溢出的责任全在 modelStyle 上：没有它，
    // 一个长 id 会把面板顶到 440px 上限再溢出（实测 352.1px）。
    const at = source.indexOf('const modelStyle')
    assert.ok(at >= 0, '找不到 modelStyle')
    const body = source.slice(at, source.indexOf('}', at))
    assert.match(body, /overflowWrap:\s*'anywhere'/u, 'modelStyle 必须允许任意位置换行')
  })
})

describe('积分弹层：官方配方', () => {
  it('表面 / 圆角 / 内边距 / 字阶应该 与官方 stat-dialog 逐项一致', () => {
    // 官方 `ui-chat/src/client/chat/stat-dialog.module.css:10-30`
    assert.equal(panelValue('borderRadius'), '12px')
    assert.equal(panelValue('padding'), '16px')
    assert.equal(panelValue('background'), 'var(--dsw-specific-menu)', '吃色调层的菜单 token')
    assert.equal(panelValue('fontSize'), '12px')
    assert.equal(panelValue('lineHeight'), '18px')
    assert.equal(panelValue('boxShadow'), 'var(--dsw-elevation-prominent)')
  })
})
