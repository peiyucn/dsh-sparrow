// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildBackdropCss } from '../lib/backdrop.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import {
  COMPOSER_BLUR,
  COMPOSER_FILL_ALPHA,
  COMPOSER_LENS_FILTER,
  GLASS_BLUR,
  GLASS_FILL_ALPHA,
  HEADER_HEIGHT_PX,
  buildGlassCss,
} from '../lib/glass.js'

const css = buildGlassCss()
const backdropCss = buildBackdropCss()
const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('glass: 顶栏 / 右栏 / 输入框液态玻璃', () => {
  it('两处玻璃共用同一个填充参数与同一个模糊参数（统一）', () => {
    assert.ok(GLASS_FILL_ALPHA < 0.5, '通透：填充不透明度低于一半')
    const blurPx = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    assert.ok(blurPx > 0 && blurPx < 40, '模糊低于官方 40px（降低模糊程度）')
    assert.equal(code.split('backdrop-filter: ' + GLASS_BLUR).length - 1, 2, '顶栏 + 右栏两处玻璃')
    assert.ok((code.match(new RegExp(String(GLASS_FILL_ALPHA * 100) + '%', 'gu')) ?? []).length >= 2, '两处填充都引用同一个常量')
  })

  it('输入框液态玻璃：光学 / 色层 / Fresnel 都在 ::before，内容在最上', () => {
    const seat = /:is\(\[data-phase='active'\], \[data-phase='hero'\]\) \[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background-color: transparent'), '座位让出官方底色，玻璃才能采样页面与地面光')
    assert.ok(!/(^|[;{\s])background\s*:/u.test(seat),
      '⛔ 不得用 background 简写：会连 backdrop.ts 的座位底光与 36px 渐隐一起清掉')
    assert.match(backdropCss, /\[data-phase='active'\] \[data-composer-seat\] \{[^}]*background-image:/u,
      'backdrop.ts 必须继续负责座位底光重绘')
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes('background-color: transparent'), '卡片让出官方底色')
    assert.ok(card.includes('position: relative') && card.includes('z-index: 0'), '卡片自成层叠上下文')
    assert.ok(card.includes('--dsw-specific-selector: transparent'), '「+」按钮让出实心底')
    const optics = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(optics.includes(`background-color: color-mix(in srgb, var(--dsw-specific-input-major) ${COMPOSER_FILL_ALPHA * 100}%`),
      '中性 tint 色层')
    assert.ok(optics.includes('backdrop-filter: ' + COMPOSER_BLUR), '无位移图时的磨砂回退')
    assert.ok(optics.includes('border-radius: inherit'), '跟官方圆角')
    assert.ok(optics.includes('inset 0 1px 1px rgba(255, 255, 255, 0.80)'), '顶部 Fresnel 高光')
    assert.ok(optics.includes('inset 1px 0 2px') && optics.includes('inset -1px -1px 2px'), '左右不对称 Fresnel')
    assert.ok(optics.includes('inset 4px 5px 7px'), '内圈柔和反光')
    assert.ok(optics.includes('inset 0 0 0 5px'), '贴边一圈玻璃厚度')
    assert.ok(!code.includes('[data-composer-card]::after'),
      '⛔ 不得占用 ::after：官方 cardWorkspaceTrigger::after 用它画「未选工作区」虚线框')
    assert.ok(!optics.includes('url(#'), '位移图就绪前不引用滤镜')
  })

  it('透镜增强：body[data-lens] 时小 blur + 位移滤镜（大 blur 会盖掉折射）', () => {
    const enhanced = /body:not\(\[[^\]]+\]\)\[data-dsh-theme-tone-lens\] \[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(enhanced.includes(`backdrop-filter: ${COMPOSER_LENS_FILTER}`), '增强规则引用滤镜 id')
    assert.ok(COMPOSER_LENS_FILTER.includes('url(#dsh-theme-tone-lens)'), '滤镜 id 与 SVG 定义单源')
    assert.ok(enhanced.includes('blur(2px)') && enhanced.includes('saturate(180%)'), '透镜时 blur 必须小')
  })

  it('输入框玻璃浅色轴：Fresnel 高光换成浅色一套', () => {
    const light = /body:not\(\[[^\]]+\]\):not\(\[data-ds-dark-theme\]\) \[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(light.includes('inset 0 1px 1px rgba(255, 255, 255, 0.95)'), '浅色轴顶部高光')
    assert.ok(light.includes('inset 4px 5px 7px') && light.includes('inset -4px -4px 6px'), '浅色轴保留双向内圈反光')
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

  it('所有规则都带「官方默认」门（浅色轴高光 / 官方菜单材质两条除外），模糊统一为 GLASS_BLUR', () => {
    for (const line of code.split('\n')) {
      if (!line.trim().endsWith('{')) continue
      const gated = line.startsWith('body:not([') && (line.includes(PLAIN_ATTR) || line.includes('data-ds-dark-theme'))
      const officialMaterial = line.startsWith('[data-menu-material]')
      assert.ok(gated || officialMaterial, `规则必须带门：${line.trim()}`)
    }
    const blurValues = [...code.matchAll(/blur\((\d+)px\)/gu)].map(match => Number(match[1]))
    const expectedBlur = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    const composerBlur = Number(/blur\((\d+)px\)/u.exec(COMPOSER_BLUR)?.[1] ?? 0)
    const lensBlur = Number(/blur\((\d+)px\)/u.exec(COMPOSER_LENS_FILTER)?.[1] ?? 0)
    assert.ok(blurValues.every(value => [expectedBlur, composerBlur, lensBlur].includes(value)),
      '只允许三档模糊：顶栏 / 右栏、无透镜回退、透镜小 blur')
    assert.equal(blurValues.filter(value => value === expectedBlur).length, 2, '顶栏 / 右栏共用 GLASS_BLUR')
    assert.ok(lensBlur < composerBlur, '透镜开启时 blur 必须小于回退值（否则折射看不见）')
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
