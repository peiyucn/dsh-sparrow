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

describe('glass: 三块玻璃（输入框 / 对话顶栏 / 右栏）', () => {
  it('顶栏：浮层化 + 内容上移 + 半透明填充 + 官方模糊 token + 自绘地面光', () => {
    assert.match(code, /\[data-slot='conversation\.header'\] > header \{[^}]*position: absolute/u)
    assert.match(code, new RegExp(`padding-top: ${HEADER_HEIGHT_PX}px`, 'u'))
    assert.match(code, new RegExp(`margin: calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\)`, 'u'))
    assert.match(code, new RegExp(`\\[data-width-handle\\] \\{[^}]*top: ${HEADER_HEIGHT_PX}px`, 'u'))
    const header = new RegExp(`\\[data-slot='conversation\\.header'\\] > header::before \\{([^}]*)\\}`, 'u').exec(code)?.[1] ?? ''
    assert.ok(header.includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'), '顶栏玻璃用官方模糊 token')
    assert.ok(header.includes(`color-mix(in srgb, var(--dsw-alias-bg-base) ${HEADER_GLASS_ALPHA * 100}%`), '顶栏填充比例')
    assert.ok(header.includes('background-image: radial-gradient('), '顶栏必须自己画一遍地面光（否则打光消失）')
    assert.ok(header.includes('background-size: 100vw 100vh'), '光按视口尺寸铺')
    assert.ok(header.includes('background-position: 100% 0'), '顶栏贴视口右侧与顶部 ⇒ 与地面光同源')
  })

  it('输入框卡片：透明底 + 自成层叠上下文 + ::before 承担模糊/填充/边缘高光', () => {
    const seat = /\[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background: none'), '底座撤掉官方遮罩，内容才能从玻璃下滚过')
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes('background-color: transparent'), '卡片本体让出底色')
    assert.ok(card.includes('z-index: 0'), '卡片必须自成层叠上下文（否则 ::before 的 z-index:-1 会逃出卡片 = 淡色框）')
    assert.ok(!card.includes('backdrop-filter'), '卡片本体不得带模糊（backdrop root）')
    const glass = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(glass.includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'), '玻璃层用官方模糊 token')
    assert.ok(glass.includes('border-radius: inherit'), '玻璃层跟随卡片圆角')
    assert.ok(glass.includes('box-shadow: inset'), '玻璃边缘要有固定高光（与旧版观感一致）')
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

  it('右栏：顶栏 76px 玻璃 + 内容区同款打光（76px 以下重画地面）', () => {
    assert.match(code, /\[data-dockkit-pane\] \{[^}]*linear-gradient\(180deg, transparent 0px, transparent 76px/u)
    assert.match(code, /\[data-dockkit-pane\] \{[^}]*isolation: isolate/u)
    const face = /\[data-dockkit-pane\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(face.includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'))
    assert.match(face, new RegExp(`height: ${HEADER_HEIGHT_PX}px`))
    assert.ok(face.includes(`var(--dsw-alias-bg-base) ${HEADER_GLASS_ALPHA * 100}%`))
    const body = /\[data-dockkit-pane\]::after \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.match(body, new RegExp(`top: ${HEADER_HEIGHT_PX}px`), '内容区从 76px 开始')
    assert.ok(body.includes('background-image: radial-gradient('), '内容区也要有地面光')
    assert.ok(body.includes(`background-position: 100% -${HEADER_HEIGHT_PX}px`), '光按视口对齐（右栏贴视口右侧、内容区起点 76px）')
    assert.ok(body.includes('z-index: -2'), '内容区光层在顶栏玻璃之下')
  })

  it('颜色轴：深色 / 浅色两套边缘高光都覆盖到', () => {
    assert.match(code, /body:not\(\[data-ds-dark-theme\]\)[^{]*::before \{[^}]*box-shadow: inset/u)
    assert.ok(code.includes('rgba(255, 255, 255, 0.55)'), '浅色轴高光更亮')
  })

  it('除浅色轴高光外，所有玻璃规则都带「官方默认」门，且没有 fixed / 手写 blur 数值', () => {
    for (const line of code.split('\n')) {
      if (!line.trim().endsWith('{')) continue
      assert.ok(
        line.startsWith('body:not([') && (line.includes(PLAIN_ATTR) || line.includes('data-ds-dark-theme')),
        `规则必须带门：${line.trim()}`,
      )
    }
    assert.ok(!/background-attachment/u.test(code), '不得出现 background-attachment')
    assert.ok(!/blur\(/u.test(code), '不得手写 blur 数值（统一走官方 token）')
  })

  it('地面层仍是唯一常驻绘制层，且不随内容刷新', () => {
    assert.ok(backdropCss.includes('position: fixed'))
    assert.ok(!backdropCss.includes('backdrop-filter'))
    assert.ok(!backdropCss.includes('mix-blend-mode'), '地面层不做混合（性能基准显示全屏 screen 混合是结构性成本）')
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
