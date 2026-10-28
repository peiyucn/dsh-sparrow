// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildBackdropCss } from '../lib/backdrop.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import {
  COMPOSER_BLUR,
  COMPOSER_FILL_ALPHA,
  COMPOSER_RIM_DARK,
  COMPOSER_RIM_LIGHT,
  COMPOSER_SHEEN_DARK,
  COMPOSER_SHEEN_LIGHT,
  GLASS_BLUR,
  GLASS_FILL_ALPHA,
  HEADER_HEIGHT_PX,
  buildGlassCss,
} from '../lib/glass.js'

const css = buildGlassCss()
const backdropCss = buildBackdropCss()
const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('glass: 顶栏 / 右栏 / 输入框（active 单板 / hero 悬浮卡）', () => {
  it('两处玻璃共用同一个填充参数与同一个模糊参数（统一）', () => {
    assert.ok(GLASS_FILL_ALPHA < 0.5, '通透：填充不透明度低于一半')
    const blurPx = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    assert.ok(blurPx > 0 && blurPx < 40, '模糊低于官方 40px（降低模糊程度）')
    assert.equal(code.split('backdrop-filter: ' + GLASS_BLUR).length - 1, 2, '顶栏 + 右栏两处玻璃')
    assert.ok((code.match(new RegExp(String(GLASS_FILL_ALPHA * 100) + '%', 'gu')) ?? []).length >= 2, '两处填充都引用同一个常量')
  })

  it('active 输入框是单块贯通玻璃板：座位 ::before、顶圆角底直角、直达视口底', () => {
    const seat = /\[data-phase='active'\] \[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background: none'), '座位撤掉官方遮罩')
    const slab = /\[data-phase='active'\] \[data-composer-seat\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(slab.includes('backdrop-filter: ' + COMPOSER_BLUR), '整块板只做一次 backdrop-filter')
    assert.ok(slab.includes(`color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%`),
      '板的半透明底色取输入面 token')
    assert.ok(slab.includes('border-radius: var(--dsw-radius-panel) var(--dsw-radius-panel) 0 0'),
      '顶部圆角、底部直角，垂直贯到页面下缘')
    assert.ok(slab.includes('width: min(calc(100% - 2 * var(--dsh-composer-side-clearance, 16px)), var(--dsh-composer-card-max-width))'),
      '板宽与输入框一致')
    assert.ok(slab.includes('top: 0') && slab.includes('bottom: 0'), '板从 stack 顶部贯到底')
    assert.ok(!slab.includes('url(#'), '仍不做折射')
  })

  it('active 子区域全部透明：卡片 / 胶囊行 / dock 卡都成为板内行', () => {
    const card = /\[data-phase='active'\] \[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes('background-color: transparent'), '输入卡让出底色，由整块板承担')
    assert.ok(card.includes('box-shadow: none') && card.includes('border-radius: 0'), '去掉自身阴影与圆角')
    assert.ok(card.includes('--dsw-specific-selector: transparent'), '「+」按钮让出实心底色')
    const dock = /\[data-phase='active'\] \[data-composer-seat\] \[data-composer-dock\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(dock.includes('width: 100%') && dock.includes('max-width: var(--dsh-composer-card-max-width)'),
      '胶囊行宽度与输入框一致')
    assert.ok(!dock.includes('background'), '胶囊行不再自己垫底 / 重绘打光')
    const dockCards = /\[data-phase='active'\] \[data-composer-seat\] :is\(\[data-queue-dock\], \[data-goal-bar\], \[data-testid='todo-panel'\]\) \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(dockCards.includes('background: transparent'), 'dock 卡去材质')
    assert.ok(dockCards.includes('backdrop-filter: none'), 'dock 卡不再各带模糊')
    assert.ok(code.includes('content: none'), 'dock 卡的材质 / 描边伪元素一并关掉')
    assert.ok(!code.includes('[data-composer-seat]::after'), '不再有座位底带')
    assert.ok(!code.includes('background-attachment: fixed'), '不再需要地面光重绘补丁')
  })

  it('hero 输入框保持悬浮卡：材质 + 全周内描边 + 上下柔光', () => {
    const card = /\[data-phase='hero'\] \[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes(`color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%`),
      'hero 卡片本体承担半透明底')
    const glass = /\[data-phase='hero'\] \[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(glass.includes('backdrop-filter: ' + COMPOSER_BLUR))
    assert.ok(glass.includes(`box-shadow: ${COMPOSER_RIM_DARK}`))
    assert.ok(glass.includes(`background-image: ${COMPOSER_SHEEN_DARK}`))
    const light = /body:not\(\[data-ds-dark-theme\]\) \[data-phase='hero'\] \[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(light.includes(`box-shadow: ${COMPOSER_RIM_LIGHT}`), '浅色轴有对应高光')
    assert.ok(light.includes(`background-image: ${COMPOSER_SHEEN_LIGHT}`))
  })

  it('顶栏：浮层化 + 内容上移 + 半透明填充 + 官方模糊 token + 自绘地面光', () => {
    assert.match(code, /\[data-slot='conversation\.header'\] > header \{[^}]*position: absolute/u)
    assert.match(code, new RegExp(`padding-top: ${HEADER_HEIGHT_PX}px`, 'u'))
    assert.match(code, new RegExp(`margin: calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\)`, 'u'))
    assert.match(code, new RegExp(`\\[data-width-handle\\] \\{[^}]*top: ${HEADER_HEIGHT_PX}px`, 'u'))
    const header = new RegExp(`\\[data-slot='conversation\\.header'\\] > header::before \\{([^}]*)\\}`, 'u').exec(code)?.[1] ?? ''
    assert.ok(header.includes('backdrop-filter: blur(20px) saturate(150%)'), '顶栏玻璃用统一模糊参数')
    assert.ok(header.includes(`color-mix(in srgb, var(--dsw-alias-bg-base) ${GLASS_FILL_ALPHA * 100}%`), '顶栏填充比例')
    assert.ok(header.includes('background-image: radial-gradient('), '顶栏必须自己画一遍地面光')
    assert.ok(header.includes('background-position: 100% 0'), '顶栏贴视口右上 ⇒ 与地面光同源')
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
    assert.ok(code.includes('[data-files-body] > *'), '文件树正文下移')
    const faces = [...code.matchAll(/::before \{\n  content: '';\n  position: absolute;\n  top: -38px;[\s\S]*?\n\}/gu)]
    assert.equal(faces.length, 1, '头行玻璃面（::before，top:-38 铺满 0..76）')
    assert.ok((faces[0]?.[0] ?? '').includes('backdrop-filter: blur(20px) saturate(150%)'))
    assert.ok((faces[0]?.[0] ?? '').includes('background-image: radial-gradient('), '玻璃面自带同源光')
    assert.match(code, /\[data-dockkit-strip\] \{[^}]*z-index: 3/u)
  })

  it('设置弹窗：打光（按弹窗自身盒子缩放）', () => {
    const settings = /\[data-shortcut-modal='settings'\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(settings.includes('background-image: radial-gradient('))
    assert.ok(settings.includes('background-size: 100% 100%'))
  })

  it('所有规则都带「官方默认」门（浅色轴高光 / 官方菜单材质两条除外）；顶栏 / 右栏共用 GLASS_BLUR', () => {
    for (const line of code.split('\n')) {
      if (!line.trim().endsWith('{')) continue
      const gated = line.startsWith('body:not([') && (line.includes(PLAIN_ATTR) || line.includes('data-ds-dark-theme'))
      const officialMaterial = line.startsWith('[data-menu-material]')
      assert.ok(gated || officialMaterial, `规则必须带门：${line.trim()}`)
    }
    const blur24 = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    const composer = Number(/blur\((\d+)px\)/u.exec(COMPOSER_BLUR)?.[1] ?? 0)
    const blurValues = [...code.matchAll(/blur\((\d+)px\)/gu)].map(match => Number(match[1]))
    assert.ok(blurValues.every(value => value === blur24 || value === composer), '只允许两档模糊：顶栏/右栏 与 输入框')
    assert.equal(blurValues.filter(value => value === blur24).length, 2, '顶栏 / 右栏共用 GLASS_BLUR')
    assert.equal(blurValues.filter(value => value === composer).length, 2, 'active 单板 + hero 悬浮卡共用输入框材质模糊')
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
