// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildBackdropCss } from '../lib/backdrop.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import {
  GLASS_BLUR,
  GLASS_FILL_ALPHA,
  HEADER_HEIGHT_PX,
  SEAT_BAND_PX,
  buildGlassCss,
} from '../lib/glass.js'

const css = buildGlassCss()
const backdropCss = buildBackdropCss()
const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('glass: 三块玻璃（输入框 / 对话顶栏 / 右栏）', () => {
  it('三处玻璃共用同一个填充参数与同一个模糊参数（统一）', () => {
    assert.ok(GLASS_FILL_ALPHA < 0.5, '通透：填充不透明度低于一半')
    const blurPx = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    assert.ok(blurPx > 0 && blurPx < 40, '模糊低于官方 40px（降低模糊程度）')
    assert.equal(code.split('backdrop-filter: ' + GLASS_BLUR).length - 1, 3, '三处玻璃都用同一个模糊参数')
    assert.ok((code.match(new RegExp(String(GLASS_FILL_ALPHA * 100) + '%', 'gu')) ?? []).length >= 3, '三处填充都引用同一个常量')
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

  it('输入框：完整玻璃模糊（::before，无负层逃逸）+ 座位透明 + 有方向边缘光 + 悬浮阴影', () => {
    assert.match(code, /\[data-composer-card\] \{[^}]*box-shadow:/u)
    assert.ok(code.includes('box-shadow: 0 12px 32px -12px'), '卡片有悬浮投影')
    assert.match(code, /body:not\(\[data-ds-dark-theme\]\)[^{]*\[data-composer-card\] \{[^}]*box-shadow: 0 12px 32px -12px rgba\(31, 35, 60/u)
    const seat = /\[data-composer-seat\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(seat.includes('background: none'), '底座撤掉官方遮罩，正文从玻璃下滚过')
    const card = /\[data-composer-card\] \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(card.includes('background-color: transparent'), '卡片本体让出底色')
    assert.ok(card.includes('z-index: 0'), '卡片自成层叠上下文（否则 ::before 的 -1 会逃出卡片 = 淡色框）')
    assert.ok(card.includes('--dsw-specific-selector: transparent'), '「+」按钮让出实心底色')
    assert.ok(!card.includes('backdrop-filter'), '卡片本体不得带模糊')
    const glass = /\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(glass.includes('backdrop-filter: blur(20px) saturate(150%)'), '输入框保留完整玻璃模糊')
    assert.ok(glass.includes('border-radius: inherit'))
    assert.ok(glass.includes(`color-mix(in srgb, var(--dsw-specific-input-major) ${GLASS_FILL_ALPHA * 100}%`), '玻璃填充比例')
    assert.ok(glass.includes('box-shadow: inset 0 1px 2px'), '上缘高光')
    assert.ok(glass.includes('inset -1px 0 3px rgba(0, 0, 0'), '右缘暗边（有方向）')
    assert.ok(glass.includes('inset 0 -1px 2px rgba(255, 255, 255, 0.05)'), '下缘保留极淡基线，四边连成一圈')
    assert.ok(!glass.includes('inset 0 -1px 2px rgba(0, 0, 0'), '下缘不再压暗')
    assert.ok(glass.includes('background-image: radial-gradient(46% 100% at 50% 100%, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.08) 55%, transparent 100%)'),
      '底边是中间亮、两边弱的柔光，不是硬线')
    assert.ok(!glass.includes('background-image: linear-gradient(90deg'), '底边不得再画横向硬线')
    assert.ok(glass.includes('background-size: 100% 4px'), '柔光垂直 4px 衰减')
    assert.ok(glass.includes('background-position: 0 100%'), '柔光贴底')
    const lightGlass = /body:not\(\[data-ds-dark-theme\]\)[^{]*\[data-composer-card\]::before \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(lightGlass.includes('background-image: radial-gradient(46% 100%'), '浅色轴也有底边柔光')
    const band = /\[data-composer-seat\]::after \{([^}]*)\}/u.exec(code)?.[1] ?? ''
    assert.ok(band.includes('background-image:'), '座位底带重画地面光')
    assert.ok(band.includes('background-position: 100% 100%'))
    assert.match(band, new RegExp(`height: ${SEAT_BAND_PX}px`))
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
    assert.ok((faces[0]?.[0] ?? '').includes('backdrop-filter: blur(20px) saturate(150%)'))
    assert.ok((faces[0]?.[0] ?? '').includes('background-image: radial-gradient('), '玻璃面自带同源光')
    assert.match(code, /\[data-dockkit-strip\] \{[^}]*z-index: 3/u)
  })

  it('停靠卡缝隙 + 上下圆角缺口：重画「底色 + 打光」挡住透出的文字', () => {
    assert.ok(code.includes("[data-testid='todo-panel']"), 'todo 卡锚点')
    assert.ok(code.includes(':is([data-queue-dock], [data-goal-bar])') || code.includes('::after'), 'queue / goal 卡锚点')
    assert.match(code, /:is\(\[data-queue-dock\], \[data-goal-bar\]\)::after \{[^}]*top: calc\(100% - 20px\)/u)
    assert.match(code, /:is\(\[data-queue-dock\], \[data-goal-bar\], \[data-testid='todo-panel'\]\)::before \{[^}]*top: calc\(-1 \* var\(--dsh-composer-stack-gap, 6px\)\)/u,
      '顶部补缝带必须从卡片上方的 stack 缝开始')
    assert.match(code, /:is\(\[data-queue-dock\], \[data-goal-bar\], \[data-testid='todo-panel'\]\)::before \{[^}]*height: calc\(var\(--dsh-composer-stack-gap, 6px\) \+ 20px\)/u,
      '顶部带向下藏 20px 覆盖卡片顶部圆角缺口')
    assert.ok((code.match(/background-attachment: fixed/gu) ?? []).length >= 3, '仍是背景重绘，不是新增玻璃')
    assert.ok(!code.includes('[data-composer-card]::before {\n  top: calc'), '不动卡片几何')
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
    assert.ok((code.match(/background-attachment: fixed/gu) ?? []).length >= 1, '仅停靠卡缝隙的补缝层允许 fixed 背景（复刻背景打光）')
    assert.ok(!code.includes('+ 128px'), '补缝层不再外扩（避免横向超屏/盖住统计胶囊）')
    assert.ok(code.includes('+ 20px + 24px'), '向下延伸 24px 填下一张卡顶部圆角缺口')
    const blurValues = [...code.matchAll(/blur\((\d+)px\)/gu)].map(match => Number(match[1]))
    const expectedBlur = Number(/blur\((\d+)px\)/u.exec(GLASS_BLUR)?.[1] ?? 0)
    assert.ok(blurValues.length > 0 && blurValues.every(value => value === expectedBlur), '模糊统一为 GLASS_BLUR')
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
