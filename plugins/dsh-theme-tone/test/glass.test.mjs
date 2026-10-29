// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildBackdropCss } from '../lib/backdrop.js'
import { PLAIN_ATTR } from '../lib/constants.js'
import {
  BAR_FILL_ALPHA,
  BAR_GOLD_PERCENT,
  COMPOSER_BLUR,
  COMPOSER_LIFT_PERCENT,
  COMPOSER_VEIL_PERCENT,
  COMPOSER_VEIL_PERCENT_LIGHT,
  GLASS_BLUR,
  HEADER_HEIGHT_PX,
  PANEL_BAND_PX,
  SEAT_BAND_PX,
  buildGlassCss,
} from '../lib/glass.js'

const css = buildGlassCss()
const backdropCss = buildBackdropCss()
const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')
/** 取某条规则块的声明体；匹配不到时返回空串（断言会失败并给出上下文）。 */
const block = (pattern) => new RegExp(pattern, 'u').exec(code)?.[1] ?? ''
const headerGlass = block(`\\[data-slot='conversation\\.header'\\] > header::before \\{([^}]*)\\}`)
const composerCard = block(`\\[data-composer-card\\] \\{([^}]*)\\}`)
const composerGlass = block(`\\[data-composer-card\\]::before \\{([^}]*)\\}`)
const seatBand = block(`\\[data-composer-seat\\]::after \\{([^}]*)\\}`)
const dockPatch = block(`\\[data-testid='todo-panel'\\], [^}]*?::after \\{([^}]*)\\}`)

describe('glass: 参数常量', () => {
  it('顶栏 / 输入框的材质参数各自独立，不再共用一套', () => {
    assert.equal(HEADER_HEIGHT_PX, 76, '对话区顶栏总高')
    assert.equal(PANEL_BAND_PX, 38, '右栏单条带高')
    assert.match(GLASS_BLUR, /blur\(24px\) saturate\(170%\) brightness\(1\.04\)/u, '顶栏 / 右栏：冷调提亮模糊')
    assert.match(COMPOSER_BLUR, /blur\(16px\) saturate\(105%\) brightness\(1\.14\)/u, '输入框：低饱和、更亮的模糊')
    assert.equal(BAR_FILL_ALPHA, 0.54, '顶栏 / 右栏填充 54%')
    assert.equal(BAR_GOLD_PERCENT, 85, '顶栏金光 85%')
    assert.equal(COMPOSER_VEIL_PERCENT, 62, '输入框遮罩 62%')
    assert.equal(COMPOSER_VEIL_PERCENT_LIGHT, 60, '浅色轴遮罩 60%')
    assert.equal(COMPOSER_LIFT_PERCENT, 40, '暗色玻璃抬升面 40%')
    assert.equal(SEAT_BAND_PX, 48, '座位底部补缝带 48px')
  })
})

describe('glass: 对话区顶栏', () => {
  it('浮层化 + 76px 不变量（滚动区内缩 / 轨道下推 / 拖拽条上沿）', () => {
    assert.match(code, /\[data-slot='conversation\.header'\] > header \{[^}]*position: absolute/u)
    assert.match(code, new RegExp(`padding-top: ${HEADER_HEIGHT_PX}px`, 'u'))
    assert.match(code, new RegExp(`margin: calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\)`, 'u'))
    assert.match(code, new RegExp(`\\[data-width-handle\\] \\{[^}]*top: ${HEADER_HEIGHT_PX}px`, 'u'))
  })

  it('材质 = 54% 底色 + 冷调模糊 + 85% 同相位金光；不新增边框 / inset', () => {
    assert.ok(headerGlass.includes(`color-mix(in srgb, var(--dsw-alias-bg-base) ${BAR_FILL_ALPHA * 100}%, transparent)`),
      '填充取官方底色、54%')
    assert.ok(headerGlass.includes(`backdrop-filter: ${GLASS_BLUR}`), '顶栏玻璃用顶栏模糊参数')
    assert.ok(headerGlass.includes(`var(--dsh-theme-tone-top, transparent) ${BAR_GOLD_PERCENT}%`), '顶部金光按 85% 叠加')
    assert.ok(headerGlass.includes(`var(--dsh-theme-tone-left, transparent) ${BAR_GOLD_PERCENT}%`), '左侧金光按 85% 叠加')
    assert.ok(headerGlass.includes('background-attachment: fixed, fixed'), '金光按视口坐标画，与地面层同相位')
    assert.ok(headerGlass.includes('background-size: 100vw 100vh, 100vw 100vh'), '金光按视口尺寸平铺')
    assert.ok(headerGlass.includes('background-position: 0 0, 0 0'), '相位原点 = 视口原点')
    assert.ok(!headerGlass.includes('box-shadow'), '顶栏不新增边框 / inset')
  })

  it('顶栏与右栏头行共用同一份材质规则', () => {
    assert.equal(code.split(`backdrop-filter: ${GLASS_BLUR};`).length - 1, 2, '顶栏 + 右栏头行各一处')
    assert.equal(code.split(`var(--dsw-alias-bg-base) ${BAR_FILL_ALPHA * 100}%`).length - 1, 2, '两处共用 54% 填充')
    assert.equal(code.split(`var(--dsh-theme-tone-left, transparent) ${BAR_GOLD_PERCENT}%`).length - 1, 2,
      '两处共用 85% 金光')
  })
})

describe('glass: 输入框', () => {
  it('卡片让出官方底色与阴影，材质只放在 ::before 上', () => {
    assert.ok(composerCard.includes('background-color: transparent'), '卡片让出官方底色')
    assert.ok(composerCard.includes('box-shadow: none'), '移除官方卡片阴影，由玻璃层负责悬浮')
    assert.ok(composerCard.includes('position: relative') && composerCard.includes('z-index: 0'), '卡片自成层叠上下文')
    assert.ok(composerCard.includes('--dsw-specific-selector: transparent'), '「+」按钮让出实心底')
    assert.ok(!code.includes('[data-composer-card]::after'),
      '⛔ 不得占用 ::after：官方 cardWorkspaceTrigger::after 用它画「未选工作区」虚线框')
  })

  it('暗色玻璃 = 抬升面 40% 混底色 + 62% 遮罩 + 低饱和提亮模糊', () => {
    assert.ok(composerGlass.includes('color-mix(in srgb,'), '嵌套 color-mix 合成玻璃底色')
    assert.ok(composerGlass.includes(`var(--dsw-alias-bg-base) ${100 - COMPOSER_LIFT_PERCENT}%`), '底色占 60%')
    assert.ok(composerGlass.includes(`var(--dsw-alias-bg-layer-3) ${COMPOSER_LIFT_PERCENT}%`), '抬升面占 40%')
    assert.ok(composerGlass.includes(`) ${COMPOSER_VEIL_PERCENT}%,`), '遮罩浓度 62%')
    assert.ok(composerGlass.includes(`backdrop-filter: ${COMPOSER_BLUR}`), '低饱和、略提亮的模糊')
  })

  it('边缘光：贴边亮芯 + 短软晕（上下同款、左右同款），不是四条等亮边', () => {
    const gradients = composerGlass.match(/radial-gradient\(/gu) ?? []
    assert.equal(gradients.length, 8, '四边各两层（软晕 + 亮芯）')
    assert.ok(composerGlass.includes('ellipse 5px 52% at 0 50%'), '一个软晕半径 5px')
    assert.ok(composerGlass.includes(`ellipse 26% ${'1.5'}px at 50% 0`), '上边亮芯（中段宽 26%）')
    assert.ok(composerGlass.includes('ellipse 26% 1.5px at 50% 100%'), '下边亮芯与上边同款')
    assert.ok(composerGlass.includes('background-repeat: no-repeat'), '边缘光不平铺')
    assert.ok(composerGlass.includes('inset 1px 1px 2px rgba(255, 255, 255, 0.08)'), '左上方向的主光')
    assert.ok(composerGlass.includes('inset -2px 0 9px -6px') && composerGlass.includes('inset 0 -2px 9px -6px'),
      '右侧 / 底部弱回光')
    assert.ok(!composerGlass.includes('inset 1px 0 1px') && !composerGlass.includes('inset -1px 0 1px'),
      '不是四条等亮边')
  })

  it('悬浮阴影收小（不再在窗口底部压出暗带）', () => {
    assert.ok(composerGlass.includes('0 16px 36px -24px rgba(0, 0, 0, 0.55)'), '外层主阴影')
    assert.ok(composerGlass.includes('0 8px 20px -12px rgba(0, 0, 0, 0.38)'), '中层阴影')
    assert.ok(!composerGlass.includes('0 28px 60px'), '旧的大偏移阴影已移除')
    assert.ok(!composerGlass.includes('url(#'), '纯 CSS，不使用位移图 / 动态滤镜')
  })

  it('浅色轴单独覆盖：乳白遮罩 + 更淡的边缘光与阴影', () => {
    const light = new RegExp(
      `body:not\\(\\[${PLAIN_ATTR}\\]\\):not\\(\\[data-ds-dark-theme\\]\\) \\[data-composer-card\\]::before \\{([^}]*)\\}`,
      'u',
    ).exec(code)?.[1] ?? ''
    assert.ok(light.includes(`var(--dsw-alias-bg-base) ${COMPOSER_VEIL_PERCENT_LIGHT}%, transparent`), '浅色轴乳白遮罩')
    assert.ok(light.includes('inset 1px 1px 2px'), '浅色轴仍保留贴边亮芯')
    assert.ok(light.includes('rgba(31, 35, 60, 0.24)'), '浅色轴阴影更淡')
  })
})

describe('glass: 输入框区补缝', () => {
  it('座位底部补缝带：48px、地面层原地重画、与视口同相位', () => {
    assert.ok(seatBand.includes(`height: ${SEAT_BAND_PX}px`), '带高 48px')
    assert.ok(seatBand.includes('background-color: var(--dsw-alias-bg-base)'), '先铺底色')
    assert.ok(seatBand.includes('background-image: radial-gradient('), '重画地面打光，不是黑块')
    assert.ok(seatBand.includes('repeating-conic-gradient'), '带 1 LSB 抖动层，打散色带')
    assert.ok(seatBand.includes('background-attachment: fixed'), 'fixed = 定位区视口，与地面层逐像素同源')
    assert.ok(seatBand.includes('z-index: -1'), '补缝层在座位内、卡片材质之下')
  })

  it('停靠卡缝隙 / 圆角缺口：统一用卡片 ::after 从卡面底下补，宽度不外扩', () => {
    assert.ok(code.includes("[data-testid='todo-panel'], [data-queue-dock], [data-goal-bar]"), '三张停靠卡锚点')
    assert.match(code, /:is\(\[data-testid='todo-panel'\], \[data-queue-dock\], \[data-goal-bar\]\)::after \{/u,
      '补缝层统一挂在卡片 ::after 上')
    assert.ok(dockPatch.includes('top: calc(100% - 20px)'), '向上藏进卡面圆角')
    assert.ok(dockPatch.includes('height: calc(var(--dsh-composer-stack-gap, 6px) + 20px + 24px)'),
      '向下盖满 stack 缝 + 24px')
    assert.ok(dockPatch.includes('background-attachment: fixed'), '同样与地面层同源')
    assert.ok(code.includes('overflow: visible'), '放开停靠卡根裁剪，补缝层才画得出来')
    assert.ok(!code.includes('mask-position'), '不再用遮罩填 todo 圆角（曾把圆角削出缺口）')
  })

  it('只有与地面层同源的两条补缝带允许 fixed 背景', () => {
    assert.equal((code.match(/background-attachment: fixed;/gu) ?? []).length, 2,
      '座位底带 + 停靠卡补缝带各一处')
    assert.equal((code.match(/background-attachment: fixed, fixed/gu) ?? []).length, 2,
      '顶栏材质（两处 = 顶栏 + 右栏头行）的金光也按视口坐标画')
  })
})

describe('glass: 右栏', () => {
  it('pane 只画底色 + 同源光，不挂 blur、不改定位', () => {
    const pane = block(`\\[data-dockkit-pane\\] \\{([^}]*)\\}`)
    assert.ok(pane.includes('background-color: var(--dsw-alias-bg-base)'), '先铺底色')
    assert.ok(pane.includes('background-image: radial-gradient('), '画同源地面光')
    assert.ok(pane.includes('background-size: 100vw 100vh'), '按视口尺寸取光')
    assert.ok(pane.includes('background-position: 100% 0'), '右栏贴视口右上 ⇒ 与地面光同源')
    assert.ok(!pane.includes('backdrop-filter'), '玻璃不挂 pane 本体（会采样到自己的子内容）')
    assert.ok(!/(^|\n)\s*position:/u.test(pane), '不改 pane 定位')
  })

  it('正文上提 76px 从两条带下滚过，滚动条轨道从顶栏下沿开始', () => {
    assert.ok(code.includes('html ') && code.includes('margin-top: -76px !important'),
      '滚区上提 76px（需更高特异性压过官方轨道规则）')
    assert.ok(code.includes('margin-block-start: 78px !important'), '轨道起点 = 76 + 2')
    for (const part of [
      "[data-document-preview$='/markdown'] [data-textpreview-body]::-webkit-scrollbar-track",
      "[data-document-preview$='/text'] [data-textpreview-body]::-webkit-scrollbar-track",
      '[data-files-body]::-webkit-scrollbar-track',
    ]) {
      assert.ok(code.includes(part), `轨道规则覆盖：${part}`)
    }
    assert.ok(code.includes('transform: translateY(76px)'), '内容下移 76px（视觉位置不变）')
    assert.ok(code.includes('margin-bottom: -38px'), '头部在流内占的高度还回去')
    assert.ok(code.includes('padding-top: 38px'), '标签体补回 38px')
    assert.ok(code.includes('[data-files-body] > *'), '文件树正文下移')
    assert.match(code, /\[data-dockkit-strip\] \{[^}]*z-index: 3/u)
  })

  it('头行玻璃面：::before 向上铺满 0..76，用顶栏同款材质', () => {
    const faces = [...code.matchAll(/::before \{\n  content: '';\n  position: absolute;\n  top: -38px;[\s\S]*?\n\}/gu)]
    assert.equal(faces.length, 1, '头行玻璃面（单条规则覆盖各标签）')
    const face = faces[0]?.[0] ?? ''
    assert.ok(face.includes(`backdrop-filter: ${GLASS_BLUR}`), '与顶栏同款模糊')
    assert.ok(face.includes(`${BAR_GOLD_PERCENT}%`), '与顶栏同款金光')
    assert.ok(face.includes('border-radius: inherit'), '跟官方圆角')
  })

  it('设置弹窗按自身盒子缩放打光', () => {
    const settings = block(`\\[data-shortcut-modal='settings'\\] \\{([^}]*)\\}`)
    assert.ok(settings.includes('background-image: radial-gradient('))
    assert.ok(settings.includes('background-size: 100% 100%'))
  })
})

describe('glass: 规则门禁', () => {
  it('所有样式规则都带「官方默认」门；浅色轴覆盖同时排除深色轴', () => {
    for (const line of code.split('\n')) {
      if (!line.trim().endsWith('{')) continue
      assert.ok(line.includes(`body:not([${PLAIN_ATTR}])`), `规则必须带门：${line.trim()}`)
    }
  })

  it('模糊只有两个来源：顶栏 / 右栏 GLASS_BLUR、输入框 COMPOSER_BLUR', () => {
    const blurs = [...code.matchAll(/blur\((\d+)px\)/gu)].map(match => Number(match[1]))
    assert.deepEqual([...new Set(blurs)].sort((a, b) => a - b), [16, 24], '只有 16px / 24px 两种模糊')
  })
})

describe('glass: 地面层不变式', () => {
  it('地面层仍是唯一常驻绘制层，含 1 LSB 抖动层；座位官方实色底已清掉', () => {
    assert.ok(backdropCss.includes('position: fixed'))
    assert.ok(backdropCss.includes('repeating-conic-gradient'), '地面层带 1 LSB 抖动，压住 8-bit 色带')
    assert.ok(backdropCss.includes('background-size: 100% 100%, 100% 100%, 100% 100%, 2px 2px'))
    assert.ok(!backdropCss.includes('backdrop-filter'))
    assert.ok(!backdropCss.includes('mix-blend-mode'))
    assert.match(backdropCss, /\[data-width-handle\][^}]*\{[^}]*z-index: 82/u)
    assert.match(backdropCss, /\[data-side\]:not\(\[role='tooltip'\]\)[^}]*\{[^}]*z-index: 82/u)
    assert.match(backdropCss, /\[data-composer-seat\] \{[^}]*background: transparent/u, '座位不得保留官方黑底')
    assert.ok(!/\[data-composer-seat\] \{/u.test(code), '玻璃层不得改座位自身背景（只加伪元素补缝层）')
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
