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

describe('glass: 顶栏 / 右栏 / 输入框第 1 步材质', () => {
  it('两处玻璃共用同一个填充参数与同一个模糊参数（统一）', () => {
    assert.ok(GLASS_FILL_ALPHA < 0.5, '通透：填充不透明度低于一半')
    const blurPx = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    assert.ok(blurPx > 0 && blurPx < 40, '模糊低于官方 40px（降低模糊程度）')
    assert.equal(code.split('backdrop-filter: ' + GLASS_BLUR).length - 1, 2, '顶栏 + 右栏两处玻璃')
    assert.ok((code.match(new RegExp(String(GLASS_FILL_ALPHA * 100) + '%', 'gu')) ?? []).length >= 2, '两处填充都引用同一个常量')
  })

  it('输入框第 1 步材质：半透明底 + 背景模糊，不做折射 / 补缝', () => {
    const seat = /\[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background: none'), '座位撤掉官方遮罩，正文从玻璃下滚过')
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes(`color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%`),
      '卡片本体承担半透明底色（跟官方圆角 / 高度）')
    assert.ok(card.includes('position: relative') && card.includes('z-index: 0'), '卡片自成层叠上下文')
    const glass = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(glass.includes('backdrop-filter: ' + COMPOSER_BLUR), '输入框使用独立的材质模糊参数')
    assert.ok(glass.includes('border-radius: inherit'))
    assert.ok(!glass.includes('url(#'), '第 1 步不做折射')
    assert.ok(!code.includes('[data-composer-seat]::after'), '第 1 步不补座位底带')
    assert.ok(!code.includes('--dsw-specific-selector'), '第 1 步不动「+」按钮底色')
  })

  it('输入框第 2 步边缘高光：全周 1px 内描边 + 上下柔光，随圆角连续', () => {
    const glass = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(glass.includes(`box-shadow: ${COMPOSER_RIM_DARK}`), '全周内描边（inset shadow 自动跟圆角）')
    assert.ok(glass.includes(`background-image: ${COMPOSER_SHEEN_DARK}`), '上下柔光用线性渐变，四角不断光')
    assert.ok(!glass.includes('radial-gradient'), '不得用径向渐变画边缘（会在角上断光）')
    assert.ok(!glass.includes('url(#'), '仍不做折射')
    const light = /body:not\(\[data-ds-dark-theme\]\)[^{]*\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
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
    assert.equal(blurValues.filter(value => value === composer).length, 1, '输入框单独一档材质模糊')
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
