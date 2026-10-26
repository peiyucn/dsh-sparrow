// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildBackdropCss } from '../lib/backdrop.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import {
  CARD_GLASS_ALPHA,
  HEADER_GLASS_ALPHA,
  HEADER_HEIGHT_PX,
  SEAT_BAND_PX,
  buildGlassCss,
} from '../lib/glass.js'

const css = buildGlassCss()
const backdropCss = buildBackdropCss()
const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('glass: 三块玻璃（输入框 / 对话顶栏 / 右栏顶栏）', () => {
  it('顶栏：浮层化 + 内容上移 + 半透明填充 + 官方模糊 token', () => {
    assert.match(code, /\[data-slot='conversation\.header'\] > header \{[^}]*position: absolute/u)
    assert.match(code, new RegExp(`padding-top: ${HEADER_HEIGHT_PX}px`, 'u'))
    assert.match(code, new RegExp(`margin: calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\)`, 'u'))
    assert.match(code, new RegExp(`\\[data-width-handle\\] \\{[^}]*top: ${HEADER_HEIGHT_PX}px`, 'u'))
    const header = new RegExp(`\\[data-slot='conversation\\.header'\\] > header::before \\{([^}]*)\\}`, 'u').exec(code)?.[1] ?? ''
    assert.ok(header.includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'), '顶栏玻璃用官方模糊 token')
    assert.ok(header.includes(`color-mix(in srgb, var(--dsw-alias-bg-base) ${HEADER_GLASS_ALPHA * 100}%`), '顶栏填充比例')
  })

  it('输入框卡片：透明底 + ::before 承担模糊与填充（不挂在卡片本体上，避免 backdrop root）', () => {
    const seat = /\[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background: none'), '底座撤掉官方遮罩，内容才能从玻璃下滚过')
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes('background-color: transparent'), '卡片本体让出底色')
    assert.ok(!card.includes('backdrop-filter'), '卡片本体不得带模糊（backdrop root）')
    const glass = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(glass.includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'), '玻璃层用官方模糊 token')
    assert.ok(glass.includes('border-radius: inherit'), '玻璃层跟随卡片圆角')
    assert.ok(glass.includes(`color-mix(in srgb, var(--dsw-specific-input-major) ${CARD_GLASS_ALPHA * 100}%`), '玻璃层填充比例')
  })

  it('输入框下方遮罩：纯 CSS 视口对齐重画地面，零 JS、零 fixed', () => {
    const band = /\[data-composer-seat\]::after \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(band.includes('background-image:'), '遮罩要重画地面光')
    assert.ok(band.includes('background-size: 100vw 100vh'), '背景盒显式给视口尺寸')
    assert.ok(band.includes('background-position: 100% 100%'), '右下对齐 = 视口对齐（sticky 座底贴着视口底）')
    assert.ok(!band.includes('fixed'), '不得再用 background-attachment: fixed')
    assert.ok(band.includes('mask-image'), '上缘过渡，避免硬切')
    assert.match(band, new RegExp(`height: ${SEAT_BAND_PX}px`))
  })

  it('右栏顶栏：面板正文顶部让出 76px + 官方模糊 + 同款填充', () => {
    assert.match(code, /\[data-dockkit-pane\] \{[^}]*linear-gradient\(180deg, transparent 0px, transparent 76px/u)
    const face = /\[data-dockkit-pane\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(face.includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'))
    assert.match(face, new RegExp(`height: ${HEADER_HEIGHT_PX}px`))
    assert.ok(face.includes(`var(--dsw-alias-bg-base) ${HEADER_GLASS_ALPHA * 100}%`))
  })

  it('全部玻璃规则都带「官方默认」门，且没有 fixed / 手写 blur 数值', () => {
    assert.ok(code.includes(`not([${PLAIN_ATTR}])`))
    const rules = code.split('\n').filter(line => line.trim().endsWith('{'))
    const gated = rules.filter(line => line.startsWith('body:not(')).length
    assert.equal(gated, rules.length, '每条规则都必须带官方默认门')
    assert.ok(!/background-attachment/u.test(code), '不得出现 background-attachment')
    assert.ok(!/blur\(/u.test(code), '不得手写 blur 数值（统一走官方 token）')
  })

  it('地面层仍是唯一常驻绘制层，且不随内容刷新', () => {
    assert.ok(backdropCss.includes('position: fixed'))
    assert.ok(!backdropCss.includes('backdrop-filter'))
  })
})

describe('glass: 客户端不得有逐帧 DOM 探测', () => {
  it('client half 不出现 MutationObserver / ResizeObserver / querySelectorAll / getComputedStyle / rAF', async () => {
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    for (const forbidden of ['MutationObserver', 'ResizeObserver', 'querySelectorAll', 'getComputedStyle', 'requestAnimationFrame', 'setInterval']) {
      assert.ok(!src.includes(forbidden), `client half 不得使用 ${forbidden}`)
    }
  })
})
