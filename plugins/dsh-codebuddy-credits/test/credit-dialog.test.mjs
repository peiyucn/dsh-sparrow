// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCreditDialogCss } from '../lib/client/styles.js'

/**
 * 积分弹层的皮肤契约（`src/client/styles.ts` 的 `.ccb-credit-dialog*`）：弹层静态样式已从
 * CreditDialog.tsx 的 inline style 收进样式层（组件只留定位），故这里直接读构建函数产出的 CSS。
 */
const css = buildCreditDialogCss()

/** 取某选择器的规则体（本组选择器都没有嵌套块）。 */
function ruleBody(selector) {
  const at = css.indexOf(`${selector} {`)
  assert.ok(at >= 0, `CSS 里找不到 "${selector}" 规则`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

/** 取某条声明（含分号分隔的简写值）。 */
function declaration(body, property) {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'u').exec(body)
  return match ? match[1].trim() : null
}

describe('积分弹层：宽度', () => {
  const panel = ruleBody('.ccb-credit-dialog')

  it('宽度地板应该 取 260px —— 官方 300 过宽、贴合内容又过窄', () => {
    // 官方地板 300px 过宽、贴合内容又过窄；260 落在两者之间。
    const minWidth = declaration(panel, 'min-width')
    assert.equal(minWidth, 'min(260px, calc(100vw - 24px))')
    assert.ok(!String(minWidth).includes('300px'), '不得退回官方那条 300px 地板（过宽）')
    assert.ok(!String(minWidth).includes('200px'), '也不得退化到 200px（贴合内容 = 过窄）')
  })

  it('宽度策略应该 仍是「量内容 + 上限 + 视口钳制」', () => {
    assert.equal(declaration(panel, 'width'), 'max-content', '宽度由内容决定，地板只兜底')
    assert.equal(declaration(panel, 'max-width'), 'min(440px, calc(100vw - 24px))', '上限与官方一致')
  })

  it('长模型 id 应该 仍能任意位置换行（不撑破面板）', () => {
    // 宽度交给 max-content 后，防溢出责任全在 model 规则：没有它，长 id 会顶到上限再溢出。
    const model = ruleBody('.ccb-credit-dialog-model')
    assert.match(model, /overflow-wrap:\s*anywhere/u, '模型行必须允许任意位置换行')
  })
})

describe('积分弹层：官方配方', () => {
  const panel = ruleBody('.ccb-credit-dialog')

  it('表面 / 圆角 / 内边距 / 字阶应该 与官方 stat-dialog 逐项一致', () => {
    assert.equal(declaration(panel, 'border-radius'), '12px')
    assert.equal(declaration(panel, 'padding'), '16px')
    assert.equal(declaration(panel, 'background'), 'var(--dsw-specific-menu)', '吃色调层的菜单 token')
    assert.equal(declaration(panel, 'font-size'), '12px')
    assert.equal(declaration(panel, 'line-height'), '18px')
    assert.equal(declaration(panel, 'box-shadow'), 'var(--dsw-elevation-prominent)')
  })
})
