
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONTENT_MAX_SIDE_CLEARANCE_PX,
  CONTENT_MIN_FLOOR_PX,
  HOVER_HIDE_BREAKPOINT_PX,
  NAV_SELECTOR,
  buildNavPinCss,
} from '../lib/nav-pin.js'

const css = buildNavPinCss()

describe('nav-pin: 轮次导航恒显 + 宽度钳制（纯 CSS）', () => {
  it('官方轮次导航 nav 用公开滚动区属性定位，且恒显直接压 display: none', () => {
    assert.equal(NAV_SELECTOR, '[data-conversation-scroll] nav', '锚点必须是公开 data 属性 + nav 结构，不依赖本地化文案')
    assert.ok(css.includes(`${NAV_SELECTOR} {\n  display: block;`), '恒显规则必须直接命中该 nav')
    assert.ok(!css.includes('aria-label'), '不再依赖本地化 aria-label 文案')
  })

  it('窄断点下默认隐身、hover / focus 淡入，且不改框与底色', () => {
    assert.ok(css.includes(`@container (max-width: ${HOVER_HIDE_BREAKPOINT_PX}px)`), '断点用 700px')
    assert.ok(css.includes(`${NAV_SELECTOR}:hover`), 'hover 淡入')
    assert.ok(css.includes(`${NAV_SELECTOR}:focus-within`), '键盘 focus 淡入')
    assert.ok(!/(background|border|box-shadow):/u.test(css.replace(/\/\*[\s\S]*?\*\//gu, '')), '只做透明度，不加框 / 底色 / 阴影')
  })

  it('宽度钳制：有官方用户宽度偏好时原样交给官方，没有时才用「每侧 ≥120px、地板 640px」的自适应值', () => {
    assert.ok(css.includes('--dsh-chat-content-width: var(--dsh-chat-user-width,'),
      '必须保留官方 --dsh-chat-user-width 优先级，否则官方宽度拖拽失效')
    assert.ok(css.includes(`max(${CONTENT_MIN_FLOOR_PX}px, calc(var(--dsh-conversation-column-width, 0px) - ${CONTENT_MAX_SIDE_CLEARANCE_PX * 2}px))`),
      '无偏好时的自适应钳制仍在 var() 的兜底里')
    assert.ok(css.includes('--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px)'))
    for (const target of ['[data-conversation-scroll]', '[data-width-handle]']) assert.ok(css.includes(target))
  })

  it('这条是布局功能：不带色调门（官方默认档同样生效）', () => {
    assert.ok(!css.includes('data-dsh-theme-tone-plain'), 'nav-pin 规则不应带色调门')
  })

  it('不依赖运行期锚点 / JS', async () => {
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/nav-pin.ts', import.meta.url), 'utf8')
    for (const forbidden of ['querySelector', 'MutationObserver', 'ResizeObserver', 'anchorSelector', 'ANCHOR']) {
      assert.ok(!src.includes(forbidden), `nav-pin 不得使用 ${forbidden}`)
    }
    assert.ok(!/\bhas\(/u.test(src), '不引入 :has()')
  })
})
