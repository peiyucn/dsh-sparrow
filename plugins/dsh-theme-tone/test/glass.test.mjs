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
    assert.ok(header.includes('background-image: radial-gradient('), '顶栏必须自己画一遍地面光')
    assert.ok(header.includes('background-position: 100% 0'), '顶栏贴视口右上 ⇒ 与地面光同源')
  })

  it('输入框：不做 live blur + 座位光墙挡正文 + 半透明填充 + 有方向边缘光', () => {
    const seat = /\[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background: none'), '底座改由自己的光墙铺底')
    const wall = /\[data-composer-seat\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(wall.includes('background-image: radial-gradient('), '光墙画地面光')
    assert.ok(wall.includes('background-size: 100vw 100vh'))
    assert.ok(wall.includes('background-position: 100% 100%'), '贴视口右下 ⇒ 与地面光同源')
    assert.ok(wall.includes('mask-image'), '上缘 36px 渐隐（正文淡出，不叠字）')
    assert.ok(!code.includes('[data-composer-card]::before'), '卡片不再用 ::before 负层')
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(!card.includes('backdrop-filter'), '输入框不做 live blur（与菜单浮层共存会触发合成器残影）')
    assert.ok(card.includes(`color-mix(in srgb, var(--dsw-specific-input-major) ${CARD_GLASS_ALPHA * 100}%`), '半透明填充')
    assert.ok(card.includes('--dsw-specific-selector: transparent'), '「+」按钮让出实心底色')
    assert.ok(card.includes('box-shadow: var(--dsw-elevation-soft)'), '保留官方 elevation，再叠边缘光')
    assert.ok(card.includes('inset 0 1px 2px'), '上缘高光')
    assert.ok(card.includes('inset -1px 0 3px rgba(0, 0, 0'), '右缘暗边（有方向，不是一圈均匀描边）')
    assert.ok(!code.includes('data-menu-material'), '不得有「菜单打开就关模糊」的降级')
    assert.ok(!code.includes('[data-composer-seat]::after'), '不再需要垫底带')
  })

  it('右栏：底色/打光 + 正文上提 76px 从两条带下滚过 + 头行玻璃（真模糊）', () => {
    const pane = /\[data-dockkit-pane\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(pane.includes('background-image: radial-gradient('), 'pane 画地面光')
    assert.ok(!pane.includes('backdrop-filter'), '玻璃不挂 pane 本体（会采样到自己的子内容）')
    assert.ok(!/\[data-dockkit-pane\] \{[^}]*position: relative/u.test(code), '不改 pane 定位（官方 static）')
    assert.ok(code.includes('margin-top: -76px !important'), '滚区上提 76px（需压过官方滚动条轨道的伪元素特异性）')
    assert.ok(code.includes('transform: translateY(76px)'), '内容下移 76px（视觉位置不变）')
    assert.ok(code.includes('margin-bottom: -38px'), '头部在流内占的高度还回去')
    assert.ok(code.includes('padding-top: 38px'), '标签体补回 38px')
    assert.ok(code.includes("[data-files-body] > *"), '文件树正文下移')
    const faces = [...code.matchAll(/::before \{\n  content: '';\n  position: absolute;\n  top: -38px;[\s\S]*?\n\}/gu)]
    assert.equal(faces.length, 1, '头行玻璃面（::before，top:-38 铺满 0..76）')
    assert.ok((faces[0]?.[0] ?? '').includes('backdrop-filter: var(--dsw-menu-backdrop-filter)'))
    assert.ok((faces[0]?.[0] ?? '').includes('background-image: radial-gradient('), '玻璃面自带同源光')
    assert.match(code, /\[data-dockkit-strip\] \{[^}]*z-index: 3/u)
  })

  it('设置弹窗：打光（按弹窗自身盒子缩放）', () => {
    const settings = /\[data-shortcut-modal='settings'\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(settings.includes('background-image: radial-gradient('))
    assert.ok(settings.includes('background-size: 100% 100%'))
  })

  it('所有规则都带「官方默认」门（浅色轴高光那条除外），无 fixed / 无手写 blur 数值', () => {
    for (const line of code.split('\n')) {
      if (!line.trim().endsWith('{')) continue
      const gated = line.startsWith('body:not([') && (line.includes(PLAIN_ATTR) || line.includes('data-ds-dark-theme'))
      assert.ok(gated, `规则必须带门：${line.trim()}`)
    }
    assert.ok(!/background-attachment/u.test(code))
    assert.ok(!/blur\(/u.test(code), '不手写 blur 数值（统一官方 token）')
  })

  it('地面层仍是唯一常驻绘制层；对话宽度拖拽条抬到内容层之上', () => {
    assert.ok(backdropCss.includes('position: fixed'))
    assert.ok(!backdropCss.includes('backdrop-filter'))
    assert.ok(!backdropCss.includes('mix-blend-mode'))
    assert.match(backdropCss, /\[data-width-handle\][^}]*\{[^}]*z-index: 82/u)
    assert.match(backdropCss, /\[data-side\]:not\(\[role='tooltip'\]\)[^}]*\{[^}]*z-index: 82/u)
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
