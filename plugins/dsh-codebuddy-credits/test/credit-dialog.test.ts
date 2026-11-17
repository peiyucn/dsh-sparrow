
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCreditDialogCss } from '../lib/client/styles.js'


const css = buildCreditDialogCss()


function ruleBody(selector) {
  const at = css.indexOf(`${selector} {`)
  assert.ok(at >= 0, `CSS 里找不到 "${selector}" 规则`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}


function declaration(body, property) {
  const match = new RegExp(`(?:^|;|\\*/)\\s*${property}\\s*:\\s*([^;]+)`, 'u').exec(body)
  return match ? match[1].trim() : null
}

describe('积分弹层：宽度（官方 rc.3 配方）', () => {
  const panel = ruleBody('.ccb-credit-dialog')

  it('宽度地板 / 上限 / 视口钳制与官方 stat-dialog 一致', () => {
    assert.equal(declaration(panel, 'width'), 'max-content', '宽度由内容决定，地板只兜底')
    assert.equal(declaration(panel, 'min-width'), 'min(300px, calc(100vw - 24px))', '与官方 rc.3 同一地板')
    assert.equal(declaration(panel, 'max-width'), 'min(440px, calc(100vw - 24px))', '上限与官方一致')
  })

  it('长模型 id 应该 仍能任意位置换行（不撑破面板）', () => {

    const model = ruleBody('.ccb-credit-dialog-model')
    assert.match(model, /overflow-wrap:\s*anywhere/u, '模型行必须允许任意位置换行')
  })
})

describe('积分弹层：官方配方', () => {
  const panel = ruleBody('.ccb-credit-dialog')

  it('表面 / 圆角 / 内边距 / 字阶应该 与官方 stat-dialog 逐项一致', () => {
    assert.equal(declaration(panel, 'border-radius'), 'var(--dsw-radius-lg)')
    assert.equal(declaration(panel, 'padding'), '16px')
    assert.equal(declaration(panel, 'background'), 'var(--dsw-specific-menu)', '吃色调层的菜单 token')
    assert.equal(declaration(panel, 'font-size'), '12px')
    assert.equal(declaration(panel, 'line-height'), '18px')
    assert.equal(declaration(panel, 'box-shadow'), 'var(--dsw-elevation-prominent)')
  })

  it('定位：不再用 JS 测量钳制，改官方 CSS 锚点 + @position-try 兜底', () => {
    assert.equal(declaration(panel, 'position'), 'fixed')
    assert.equal(declaration(panel, 'position-area'), 'none')
    assert.match(declaration(panel, 'bottom') ?? '', /calc\(anchor\(top\) \+ 8px\)/u, '贴在触发件上方 8px')
    assert.match(declaration(panel, 'left') ?? '', /anchor\(left\)/u, '与触发件左边缘对齐')
    assert.match(declaration(panel, 'position-try-fallbacks') ?? '', /--ccb-stat-window/u, '窄窗兜底存在')
    assert.match(declaration(panel, 'position-try-fallbacks') ?? '', /--ccb-stat-viewport/u, '视口兜底存在')
    assert.match(css, /@position-try --ccb-stat-opposite \{/u, '翻到下方兜底存在')
    assert.match(css, /@position-try --ccb-stat-tall \{/u, '超高兜底存在')
  })
})
