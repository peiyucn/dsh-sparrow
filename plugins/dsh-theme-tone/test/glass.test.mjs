// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildBackdropCss } from '../lib/backdrop.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import {
  COMPOSER_BLUR,
  GLASS_BLUR,
  GLASS_FILL_ALPHA,
  HEADER_HEIGHT_PX,
  buildGlassCss,
} from '../lib/glass.js'

const css = buildGlassCss()
const backdropCss = buildBackdropCss()
const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('glass: 三处液态玻璃', () => {
  it('三处共用同一个模糊；填充分层，顶栏 / 右栏不加任何边框', () => {
    assert.ok(GLASS_FILL_ALPHA < 0.5, '顶栏 / 右栏通透')
    const blurPx = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    assert.ok(blurPx > 0 && blurPx < 40, '模糊低于官方 40px（降低模糊程度）')
    assert.equal(code.split('backdrop-filter: ' + GLASS_BLUR + ';').length - 1, 2, '顶栏 + 右栏共用 GLASS_BLUR')
    assert.equal(code.split('backdrop-filter: ' + COMPOSER_BLUR + ';').length - 1, 1, '输入框单独用低饱和模糊')
    assert.equal((code.match(new RegExp(String(GLASS_FILL_ALPHA * 100) + '%', 'gu')) ?? []).length, 2, '顶栏 / 右栏共用填充常量')
    const header = new RegExp(`\\[data-slot='conversation\\.header'\\] > header::before \\{([^}]*)\\}`, 'u').exec(code)?.[1] ?? ''
    assert.ok(!header.includes('box-shadow'), '顶栏不新增边框 / inset')
  })

  it('输入框：透明 + 背景模糊 + 非均匀边缘光 + 悬浮投影（纯 CSS）', () => {
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes('background-color: transparent'), '卡片让出官方底色')
    assert.ok(card.includes('box-shadow: none'), '移除官方卡片阴影，由玻璃层负责悬浮')
    assert.ok(card.includes('position: relative') && card.includes('z-index: 0'), '卡片自成层叠上下文')
    assert.ok(card.includes('--dsw-specific-selector: transparent'), '「+」按钮让出实心底')
    const optics = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(optics.includes('background-color: transparent'), '输入框纯透明，不染官方蓝色')
    assert.ok(!optics.includes('background-image:'), '不在整面加偏光 / 渐变')
    assert.ok(optics.includes('backdrop-filter: ' + COMPOSER_BLUR), '低饱和背景模糊')
    assert.ok(optics.includes('border-radius: inherit'), '跟官方圆角')
    assert.ok(optics.includes('0 24px 50px -24px'), '外层悬浮投影')
    assert.ok(optics.includes('inset 3px 2px 8px -5px'), '左上方向的边缘主光')
    assert.ok(optics.includes('inset -2px 0 8px -6px') && optics.includes('inset 0 -2px 8px -6px'), '右侧 / 底部弱回光')
    assert.ok(!optics.includes('inset 1px 0 1px') && !optics.includes('inset -1px 0 1px'), '不是四条等亮边')
    assert.ok(!optics.includes('url(#'), '纯 CSS，不使用位移图 / 动态滤镜')
    assert.ok(!code.includes('[data-composer-card]::after'),
      '⛔ 不得占用 ::after：官方 cardWorkspaceTrigger::after 用它画「未选工作区」虚线框')
  })

  it('顶栏：浮层化 + 内容上移 + 液态玻璃 + 自绘地面光', () => {
    assert.match(code, /\[data-slot='conversation\.header'\] > header \{[^}]*position: absolute/u)
    assert.match(code, new RegExp(`padding-top: ${HEADER_HEIGHT_PX}px`, 'u'))
    assert.match(code, new RegExp(`margin: calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\)`, 'u'))
    assert.match(code, new RegExp(`\\[data-width-handle\\] \\{[^}]*top: ${HEADER_HEIGHT_PX}px`, 'u'))
    const header = new RegExp(`\\[data-slot='conversation\\.header'\\] > header::before \\{([^}]*)\\}`, 'u').exec(code)?.[1] ?? ''
    assert.ok(header.includes('backdrop-filter: ' + GLASS_BLUR), '顶栏玻璃用统一模糊参数')
    assert.ok(header.includes(`color-mix(in srgb, var(--dsw-alias-bg-base) ${GLASS_FILL_ALPHA * 100}%`), '顶栏填充比例')
    assert.ok(header.includes('background-image: radial-gradient('), '顶栏必须自己画一遍地面光')
    assert.ok(header.includes('background-position: 100% 0'), '顶栏贴视口右上 ⇒ 与地面光同源')
  })

  it('右栏：底色/打光 + 正文上提 76px 从两条带下滚过 + 头行液态玻璃', () => {
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
    assert.ok((faces[0]?.[0] ?? '').includes('backdrop-filter: ' + GLASS_BLUR))
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
    assert.ok(blurValues.length > 0 && blurValues.every(value => value === expectedBlur), '模糊统一为 GLASS_BLUR')
  })

  it('地面层仍是唯一常驻绘制层；座位官方实色底已在 backdrop 清掉', () => {
    assert.ok(backdropCss.includes('position: fixed'))
    assert.ok(!backdropCss.includes('backdrop-filter'))
    assert.ok(!backdropCss.includes('mix-blend-mode'))
    assert.match(backdropCss, /\[data-width-handle\][^}]*\{[^}]*z-index: 82/u)
    assert.match(backdropCss, /\[data-side\]:not\(\[role='tooltip'\]\)[^}]*\{[^}]*z-index: 82/u)
    assert.match(backdropCss, /\[data-composer-seat\] \{[^}]*background: transparent/u, '座位不得保留官方黑底')
    assert.ok(!code.includes('[data-composer-seat]'), '玻璃层不得覆盖座位')
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
