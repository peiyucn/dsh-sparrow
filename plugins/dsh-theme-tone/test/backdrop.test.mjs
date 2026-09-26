import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GRAIN_DATA_URI,
  GRAIN_OPACITY,
  LAYER_SELECTOR,
  STYLE_SELECTOR,
  backdropPlan,
  boostAlpha,
  buildBackdropCss,
  BOTTOM_RADIAL_SHAPE,
  DARK_RADIAL_SHAPE,
  LEFT_RADIAL_SHAPE,
  PREVIEW_ALPHA_SCALE,
  PREVIEW_STOP,
  PREVIEW_TOP_SHAPE,
  REQUIRED_CSS_FEATURES,
  tonePreview,
} from '../lib/backdrop.js'
import {
  ABOVE_CONTENT_Z_INDEX,
  CONTENT_ATTR,
  CONTENT_Z_INDEX,
  DOCKKIT_MENU_ATTR,
  SIDE_ATTR,
  WIDTH_HANDLE_ATTR,
  PLAIN_ATTR,
  RIGHT_PANEL_ATTR,
  SHELL_OVERLAY_ATTR,
  TAB_MENU_Z_INDEX,
} from '../lib/constants.js'
import { buildRowCss } from '../lib/client/styles.js'
import { buildGlassCss } from '../lib/glass.js'
import { BACKDROP_CLASS, BACKDROP_Z_INDEX, GRAIN_ALPHA_VARIABLE, GRAIN_ATTR, MARKER_ATTR } from '../lib/constants.js'
import { DARK_TONES, DEFAULT_SETTINGS, DEPTH_ALPHA, LIGHT_TONES } from '../lib/tones.js'

const settings = (lightTone, darkTone) => ({ lightTone, darkTone })

/** 取 rgba(...) 末尾的 alpha 数值。 */
const alphaOf = color => Number(/,\s*([\d.]+)\)$/u.exec(color)[1])

describe('背景层样式表', () => {
  const css = buildBackdropCss()

  it('应该 用常量里的 z-index 与类名（层级切分是契约）', () => {
    assert.match(css, new RegExp(`z-index: ${BACKDROP_Z_INDEX}`, 'u'))
    assert.ok(css.includes(`.${BACKDROP_CLASS} {`), '样式表应以常量类名定基')
  })

  it('应该 固定定位、不挡交互、不占布局', () => {
    assert.match(css, /position: fixed/u)
    assert.match(css, /inset: 0/u)
    assert.match(css, /pointer-events: none/u)
  })

  it('应该 按明暗轴分流混合模式（白底上 screen 会饱和失效）', () => {
    assert.match(css, /body\[data-ds-dark-theme\][\s\S]*mix-blend-mode: screen/u)
    assert.match(css, /body:not\(\[data-ds-dark-theme\]\)[\s\S]*mix-blend-mode: normal/u)
  })

  it('应该 用 CSS 变量承载三个染色色值，并把 hidden 显式落成 display: none', () => {
    assert.match(css, /var\(--dsh-theme-tone-top/u)
    assert.match(css, /var\(--dsh-theme-tone-bottom/u)
    assert.match(css, /var\(--dsh-theme-tone-left/u)
    assert.match(css, /\[hidden\] \{\s*display: none;/u)
  })

  it('颗粒层应该 带上 pyai.site 同款 data URI 与**统一来源的**不透明度', () => {
    assert.ok(css.includes(GRAIN_DATA_URI))
    // 2026-09-24：强度改为读运行期变量（唯一来源 GRAIN_ALPHA，owner：「噪点值统一变量，
    // 方便后续我们减弱」），括号里是回落值（变量缺席时与旧行为一致）。
    assert.match(
      css,
      new RegExp(`opacity: var\\(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY}\\)`, 'u'),
      `颗粒层 opacity 应读 ${GRAIN_ALPHA_VARIABLE}（回落 ${GRAIN_OPACITY}）`,
    )
    assert.match(css, /\[data-grain='off'\]::after \{\s*display: none;/u)
  })

  it('用户内容应该 被抬到背景层之上（图片不该被染色 / 上颗粒）', () => {
    // owner：「用户发的图片，不要有咱们的样式，尤其是颗粒那些。」
    // 背景层是覆盖全屏的 fixed 层，必须抬**整个对话容器**而不是单个 img ——
    // img 会同时高过没有 z-index 的输入框（图片滚动时浮在输入框上），
    // 而输入框就在同一个滚动容器里，整体抬升才保住内部前后序。
    assert.ok(
      CONTENT_Z_INDEX > BACKDROP_Z_INDEX,
      `内容层 ${CONTENT_Z_INDEX} 应高于背景层 ${BACKDROP_Z_INDEX}`,
    )
    assert.match(
      css,
      new RegExp(`\\[${CONTENT_ATTR}\\] \\{\\s*position: relative;\\s*z-index: ${CONTENT_Z_INDEX};`, 'u'),
      '应把对话滚动容器抬到背景层之上',
    )
    // 内容抬升后，必须压住内容的官方层也要跟着抬，否则会被内容盖住。
    // 这是一条**不变式**（见 constants.ts 的 ABOVE_CONTENT_Z_INDEX）：凡 z-index < 81
    // 且要压在内容之上的官方层，都得抬到 82。
    // ⚠️ 0.1.7 起官方删掉了 `[data-sidebar-right-float-host]`，故本表只剩两个锚点。
    const RAISED = [RIGHT_PANEL_ATTR, SHELL_OVERLAY_ATTR]
    for (const attr of RAISED) {
      assert.ok(css.includes(`[${attr}]`), `应抬起 [${attr}]`)
      assert.ok(
        ABOVE_CONTENT_Z_INDEX > CONTENT_Z_INDEX,
        `${attr} 的高度 ${ABOVE_CONTENT_Z_INDEX} 应高于内容层 ${CONTENT_Z_INDEX}`,
      )
    }
    // **标签菜单单独一档**：官方明写「从标签打开的菜单绝不能落在面板之下」
    // （dockkit.module.css:538-543），原序是 floatLayer 60 < tabMenu 70。
    // 抬的时候必须一起抬、且保住这个次序，否则会把官方的相对层级反过来。
    assert.ok(css.includes(`[${DOCKKIT_MENU_ATTR}]`), `应抬起 [${DOCKKIT_MENU_ATTR}]`)
    assert.ok(
      TAB_MENU_Z_INDEX > ABOVE_CONTENT_Z_INDEX,
      `标签菜单 ${TAB_MENU_Z_INDEX} 必须高于右栏面板 ${ABOVE_CONTENT_Z_INDEX}（官方 70 > 60 的次序）`,
    )
    assert.match(
      css,
      new RegExp(`\\[${DOCKKIT_MENU_ATTR}\\] \\{\\s*z-index: ${TAB_MENU_Z_INDEX};`, 'u'),
      '标签菜单应取更高一档，而不是与面板同号',
    )
    // 官方默认门：这些规则也必须是 gated 的（选了官方默认就完全不动官方布局）
    // **拖拽条**（owner 真机报「调整对话区域的条整没了」）—— 官方有两条，属性不同：
    assert.ok(css.includes(`[${WIDTH_HANDLE_ATTR}]`), '对话区拖拽条（有独有属性）应被抬起')
    // AppFrame 那条只有 `data-side`，而官方**三处**在用（含 Tooltip 的 placement）→ 必须排除 tooltip
    assert.ok(
      css.includes(`[${SIDE_ATTR}]:not([role='tooltip'])`),
      'data-side 必须排除 tooltip（否则把提示框一起抬起来）',
    )
    // 官方默认门：这些规则也必须是 gated 的（选了官方默认就完全不动官方布局）
    for (const attr of [CONTENT_ATTR, ...RAISED, DOCKKIT_MENU_ATTR]) {
      assert.match(
        css,
        new RegExp(`body:not\\(\\[${PLAIN_ATTR}\\]\\) \\[${attr}\\]`, 'u'),
        `[${attr}] 的抬升规则应带官方默认门`,
      )
    }
    // 对话顶栏的 z-index 不在这张表里（它是 glass.ts 的一部分），
    // 但必须同样高于内容层 —— 否则内容会盖住玻璃顶栏（owner 真机报过的 bug）。
    const glass = buildGlassCss()
    assert.match(
      glass,
      new RegExp(`z-index: ${ABOVE_CONTENT_Z_INDEX};`, 'u'),
      '玻璃顶栏应抬到 ABOVE_CONTENT_Z_INDEX',
    )
    assert.ok(
      !new RegExp(`z-index: 9;[^\\n]*高于拖拽条`, 'u').test(glass),
      '玻璃顶栏不该再停留在 z-index: 9（会被内容层盖住）',
    )
  })

  it('渐变几何应该 用视口单位 vw/vh，**不能用 %**（顶栏会复用这串渐变）', () => {
    // 背景层是满视口的 fixed 元素，`%` 与 `vw/vh` 对它完全等价；但顶栏（76px 高）也复用
    // 这串渐变（BACKDROP_GRADIENTS）—— `%` 会按顶栏自身盒子解析，把 45% 压成 34px 的扁椭圆，
    // 金光只剩顶部一条细边（owner：「能看出来有一点，但不是特别明显」）。
    for (const [name, shape] of [['DARK', DARK_RADIAL_SHAPE], ['BOTTOM', BOTTOM_RADIAL_SHAPE], ['LEFT', LEFT_RADIAL_SHAPE]]) {
      assert.match(shape, /vw/u, `${name}_RADIAL_SHAPE 的横向半径应用 vw：${shape}`)
      assert.match(shape, /vh/u, `${name}_RADIAL_SHAPE 的纵向半径应用 vh：${shape}`)
      // 半径位置里不该再出现百分比（`at 50%` 是横向居中的例外，允许）
      const radii = shape.replace(/^ellipse\s+/u, '').split(' at ')[0]
      assert.ok(!radii.includes('%'), `${name}_RADIAL_SHAPE 的半径不该用 %：${radii}`)
    }
  })
})

describe('背景层渲染计划', () => {
  it('深色轴默认（深空）应该 显示染色、带上左侧金晕并叠颗粒', () => {
    const plan = backdropPlan('dark', DEFAULT_SETTINGS)
    assert.equal(plan.hidden, false)
    assert.equal(plan.grain, true)
    assert.equal(plan.top, DARK_TONES.violet.top)
    assert.equal(plan.bottom, DARK_TONES.violet.bottom)
    assert.equal(plan.left, DARK_TONES.violet.left)
    assert.notEqual(plan.left, '', '深空款应带左侧金晕（左边栏与接缝处的金色）')
  })

  it('官方默认（无染色）应该 连左侧金晕一并清空', () => {
    const plan = backdropPlan('dark', settings('official', 'official'))
    assert.equal(plan.left, '')
  })

  it('官方默认（官方的确没有染色）应该 给空 left，由样式表的 transparent 兜底', () => {
    assert.equal(backdropPlan('light', settings('official', 'official')).left, '')
  })

  it('深色三款应该 都把 shared 金色落进 plan（top / left 一致，只有 base 与 bottom 不同）', () => {
    const plans = ['violet', 'crimson', 'forest'].map(id => backdropPlan('dark', settings('official', id)))
    for (const plan of plans) {
      assert.equal(plan.top, DARK_TONES.violet.top)
      assert.equal(plan.left, DARK_TONES.violet.left)
    }
    assert.equal(new Set(plans.map(plan => plan.bottom)).size, 3, '三款底部纵深应各不相同')
  })

  it('深色轴选官方默认应该 整层隐藏', () => {
    const plan = backdropPlan('dark', settings('official', 'official'))
    assert.equal(plan.hidden, true)
    assert.equal(plan.grain, false)
  })

  it('浅色轴默认（官方）应该 整层隐藏 —— 没装插件等价', () => {
    const plan = backdropPlan('light', DEFAULT_SETTINGS)
    assert.equal(plan.hidden, true)
    assert.equal(plan.grain, false)
  })

  it('跨轴脏值被写入时应该 回落到该轴默认（绝不画出不属于该轴的色）', () => {
    // gray 是浅色轴的 id，写进 darkTone 是脏值 → 回到深色轴默认 violet
    const plan = backdropPlan('dark', settings('official', 'sakura'))
    assert.equal(plan.top, DARK_TONES.violet.top)
    assert.equal(plan.bottom, DARK_TONES.violet.bottom)
    assert.equal(plan.hidden, false)
  })

  it('浅色轴选到带染色的色调时应该 **也叠颗粒**（owner：「和深色版有相同的渐变质感」）', () => {
    const plan = backdropPlan('light', settings('blue', 'violet'))
    assert.equal(plan.hidden, false)
    assert.equal(plan.grain, true, '浅色轴现在也叠颗粒（两轴质感对等）')
    assert.equal(plan.top, LIGHT_TONES.blue.top)
  })
})

describe('色调卡预览（完整展示色调）', () => {
  it('应该 完整展示色调：底色 + 顶部 / 底部染色 + 左侧金晕', () => {
    const preview = tonePreview('dark', 'violet')
    assert.equal(preview.backgroundColor, DARK_TONES.violet.base)
    assert.equal((preview.backgroundImage.match(/radial-gradient\(/gu) ?? []).length, 3)
  })

  it('卡面应该 只放大「各款自己的颜色」，不放大共享的光层（深色轴）', () => {
    const { backgroundImage } = tonePreview('dark', 'violet')
    assert.equal(PREVIEW_ALPHA_SCALE.dark.light, 1, '深色共享光层不放大（放大了三张卡互相盖住）')
    assert.ok(PREVIEW_ALPHA_SCALE.dark.depth > 1, '深色各款的纵深要放大（那是唯一的区分点）')
    // 共享光层逐字进卡面（= 与实况 1:1 保真）
    for (const raw of [DARK_TONES.violet.top, DARK_TONES.violet.left]) {
      assert.ok(backgroundImage.includes(raw), `${raw} 是共享光层，应逐字进卡面`)
    }
    // 纵深放大后进卡面，且原始 alpha 不得原样出现
    const depth = boostAlpha(DARK_TONES.violet.bottom, PREVIEW_ALPHA_SCALE.dark.depth)
    assert.ok(backgroundImage.includes(depth), '纵深应放大后进卡面')
    assert.ok(!backgroundImage.includes(DARK_TONES.violet.bottom), '纵深不应原样进卡面（那就是没放大）')
    assert.ok(alphaOf(depth) > alphaOf(DARK_TONES.violet.bottom), '放大后 alpha 应更大')
  })

  it('浅色轴卡面应该 **放大**（结构改动后实况变淡，卡面需补回可辨度）', () => {
    // ## 2026-09-18 结构改动后的重算
    //
    // 旧守卫要求浅色卡面**不放大**（`1 / 1`），理由是「实况 alpha 已追平卡面」——
    // 那个前提在结构改动后**消失了**：三层光的实况 alpha 从 `.48/.54/.38` 降到 `.16/.30/.19`，
    // 而卡面 alpha 是从色调表**派生**的，于是跟着降，**三款区分度掉到人眼阈下**
    // （实测 gray-green 5.7 / blue-green 5.8，阈约 8）= owner 抱怨过的「看不出区别」。
    //
    // 修法：倍数设成「把 alpha 抬回结构改动前那一档」—— `.16×3=.48` / `.19×2=.38` / `.30×1.8=.54`。
    // 实测区分度回到 10.3 / 10.5，可辨。
    assert.equal(PREVIEW_ALPHA_SCALE.light.light, 3, '浅色共享光层要放大 3 倍（.16 → .48，回到批准时的观感）')
    assert.equal(PREVIEW_ALPHA_SCALE.light.depth, 1.8, '浅色纵深放大 1.8 倍（.30 → .54）')
    const { backgroundImage } = tonePreview('light', 'blue')
    // 放大后的值进卡面，原始 alpha **不得**原样出现
    for (const raw of [LIGHT_TONES.blue.top, LIGHT_TONES.blue.left, LIGHT_TONES.blue.bottom]) {
      assert.ok(!backgroundImage.includes(raw), `${raw} 是未放大的原值，不该原样进卡面`)
    }
    const top = boostAlpha(LIGHT_TONES.blue.top, PREVIEW_ALPHA_SCALE.light.light)
    const bot = boostAlpha(LIGHT_TONES.blue.bottom, PREVIEW_ALPHA_SCALE.light.depth)
    assert.ok(backgroundImage.includes(top), '放大后的顶光应进卡面')
    assert.ok(backgroundImage.includes(bot), '放大后的纵深应进卡面')
  })

  it('浅色卡面放大后应该 **仍读得出各款本色**（三款区分度回到阈值以上）', () => {
    // 放大的是 **alpha**，色相一字不变 —— 所以「三款各用自己的本色」这条不受影响。
    // 本条守的是放大没把卡面推成「一片浓色」：各款的色相仍逐字来自自己的 tint。
    for (const id of ['sakura', 'blue', 'green']) {
      const { backgroundImage } = tonePreview('light', id)
      const tint = LIGHT_TONES[id].tint
      const hits = (backgroundImage.match(new RegExp(`rgba\\(${tint},`, 'gu')) ?? []).length
      assert.equal(hits, 3, `${id} 卡面三层都应带自己的本色 ${tint}，实测 ${hits} 层`)
    }
  })

  it('浅色轴的卡面纵深应该 **强于实况** —— 小卡需要更强才看得见（与深色轴同理）', () => {
    // ## 2026-09-18 结构改动后，这条的**方向反过来了**
    //
    // 旧守卫要求浅色「卡面 α === 实况 α」（恒等），前提是实况 alpha 已提到 `.54` 的等效值。
    // 结构改动把实况降到 `.30` 后，恒等意味着卡面也只有 `.30` —— 实测三款区分度掉到阈下。
    //
    // 现在浅色与深色**同一个道理**：卡面比实况强（浅 `1.8×` / 深 `3×`），
    // 因为小卡（135×83）面积小、渐变被压缩，需要更强的染色才读得出。
    // 唯一的差别只是倍数（浅色实况本就更显，故倍数更小）。
    const cardAlpha = Number(/,\s*([\d.]+)\)/u.exec(boostAlpha(LIGHT_TONES.blue.bottom, PREVIEW_ALPHA_SCALE.light.depth))[1])
    assert.ok(cardAlpha > DEPTH_ALPHA.light, '浅色卡面纵深应强于实况（小卡辅助）')
    assert.equal(cardAlpha, 0.54, '浅色卡面纵深落在 .54（= 结构改动前的观感）')
  })

  it('深色轴的卡面纵深仍然 ×3 —— 那是「小卡看得见」的辅助，不是不对称 bug', () => {
    // 深色轴**保留** card ≠ reality（卡 0.54 / 实况 0.18）：owner 明确「深色现在没问题」。
    // 与浅色轴的区别在于**实况本身够不够看**：近黑底余量大，实况 0.18 已产生 Δ亮度 +9~12；
    // 而浅色底余量只有个位数，实况 0.18 只换来 −6~9，所以那里必须让实况追平卡面。
    // 这条钉住「别顺手把深色的 ×3 也抹平」——抹平会让深色卡面变平、三款分不开。
    const cardAlpha = Number(/,\s*([\d.]+)\)/u.exec(boostAlpha(DARK_TONES.violet.bottom, PREVIEW_ALPHA_SCALE.dark.depth))[1])
    assert.ok(cardAlpha > DEPTH_ALPHA.dark, '深色卡面纵深应强于实况（辅助小卡）')
    assert.equal(cardAlpha, Number((DEPTH_ALPHA.dark * 3).toFixed(3)), '深色卡面倍数仍为 3')
  })

  it('深色三款的卡面应该 一眼分得开：共享光一致、各自纵深不同', () => {
    const ids = ['violet', 'crimson', 'forest']
    const cards = ids.map(id => tonePreview('dark', id).backgroundImage)
    const reads = cards.map(card => (card.match(/rgba\([^)]+\)/gu) ?? []).join('|'))
    assert.equal(new Set(reads).size, 3, '三张卡的三层色值组合必须互不相同')
    // 共享的金光三张卡一样（「同一束光」）
    for (const card of cards) {
      assert.ok(card.includes(DARK_TONES.violet.top), '三张卡共享同一束金光')
      assert.ok(card.includes(DARK_TONES.violet.left), '三张卡共享同一束左上金光')
    }
    // 各款放大后的纵深互不相同，且各自出现在自己的卡里
    const depths = ids.map(id => boostAlpha(DARK_TONES[id].bottom, PREVIEW_ALPHA_SCALE.dark.depth))
    assert.equal(new Set(depths).size, 3, '三款的纵深色值必须互不相同')
    ids.forEach((id, at) => { assert.ok(cards[at].includes(depths[at]), `${id} 卡面应带自己的纵深`)})
  })

  it('浅色轴卡面不得过曝 —— 光层放大后必须仍 < 1', () => {
    for (const id of ['sakura', 'blue', 'green']) {
      const boosted = boostAlpha(LIGHT_TONES[id].top, PREVIEW_ALPHA_SCALE.light.light)
      assert.ok(alphaOf(boosted) < 1, `${id} 光层放大后过曝 → 卡面顶会变成纯白（被判过「俗气」）`)
    }
  })

  it('真实背景层应该 保持原始 alpha（氛围强度不跟着卡面一起放大）', () => {
    const plan = backdropPlan('dark', DEFAULT_SETTINGS)
    assert.equal(plan.top, DARK_TONES.violet.top)
    assert.equal(plan.bottom, DARK_TONES.violet.bottom)
    assert.equal(plan.left, DARK_TONES.violet.left)
    const light = backdropPlan('light', settings('blue', 'violet'))
    assert.equal(light.top, LIGHT_TONES.blue.top)
    assert.equal(light.bottom, LIGHT_TONES.blue.bottom)
  })

  it('应该 用卡片尺度的几何而不是整屏几何 —— 否则小卡上染全会落到盒外只剩纯色', () => {
    const { backgroundImage } = tonePreview('dark', 'violet')
    assert.ok(backgroundImage.includes(PREVIEW_TOP_SHAPE), '预览要用 PREVIEW_* 形状')
    assert.ok(!backgroundImage.includes(DARK_RADIAL_SHAPE), '预览不得复用整屏形状')
    assert.ok(backgroundImage.includes(PREVIEW_STOP))
  })

  it('官方默认（无染色）应该 只给底色，不画渐变', () => {
    const preview = tonePreview('dark', 'official')
    assert.equal(preview.backgroundColor, DARK_TONES.official.base)
    assert.equal(preview.backgroundImage, 'none')
  })

  it('官方默认的底色应该 是官方变量引用（随官方换色自动跟随）', () => {
    assert.equal(tonePreview('light', 'official').backgroundColor, LIGHT_TONES.official.base)
    assert.match(tonePreview('light', 'official').backgroundColor, /^var\(--dsw-static-neutral-/u)
  })

  it('跨轴脏值被问到时应该 回落到该轴默认的预览', () => {
    assert.deepEqual(tonePreview('dark', 'sakura'), tonePreview('dark', 'violet'))
    assert.deepEqual(tonePreview('light', 'violet'), tonePreview('light', 'official'))
  })
})

describe('boostAlpha', () => {
  it('应该 按倍数放大 rgba 的 alpha', () => {
    assert.equal(boostAlpha('rgba(232, 162, 74, .1)', 3), 'rgba(232, 162, 74, 0.300)')
  })

  it('应该 把 alpha 夹在 1 以内', () => {
    assert.equal(boostAlpha('rgba(1, 2, 3, 0.8)', 4), 'rgba(1, 2, 3, 1.000)')
  })

  it('不匹配 rgba 形式时应该 原样返回（安全默认，不猜）', () => {
    for (const passthrough of ['', 'none', '#0a0a10', 'var(--dsw-static-neutral-bluish-900)', 'rgb(1, 2, 3)']) {
      assert.equal(boostAlpha(passthrough, 3), passthrough)
    }
  })

  it('倍数 1 应该 恒等返回（不重排字符串格式）', () => {
    const raw = 'rgba(255, 250, 240, .65)'
    assert.equal(boostAlpha(raw, 1), raw)
  })
})

describe('色调卡样式', () => {
  const css = buildRowCss()

  it('卡片本体不应该 用样式表上背景 —— 内联的所见即所得底色才是唯一来源', () => {
    // 只检查「卡本体」那条规则；颗粒层（::after）当然要自带 background-image
    const cubeClass = `${BACKDROP_CLASS}-cube`
    const block = new RegExp(`\\.${cubeClass} \\{([\\s\\S]*?)\\n\\}`, 'u').exec(css)
    assert.ok(block, `未找到卡片本体规则 .${cubeClass}`)
    // 若样式表也设 background，悬停 / 选中态就会与内联底色打架（或静默失效）
    assert.ok(!/background/u.test(block[1]), '卡片本体的背景必须只由组件内联 style 给')
  })

  it('卡片应该 恒排一行、等分可收缩（换行会让落单的卡被拉满整行）', () => {
    assert.match(css, /flex-wrap: nowrap/u, '不换行，否则第 4 张会独占第二行')
    assert.match(css, /flex: 1 1 0/u, '等分可收缩，宽度随容器自适应')
    assert.ok(!/flex:\s*180px/u.test(css), '不得用固定 basis —— 放不下时又会换行')
    assert.match(css, /min-width: 0/u, '允许收缩到内容宽度以下，才能真的一行塞下')
  })

  it('选中态应该 用描边环表达（背景已被色调占用）', () => {
    assert.match(css, /box-shadow: inset 0 0 0 1\.5px var\(--dsw-alias-label-primary\)/u)
    assert.match(css, /border-color: var\(--dsw-alias-label-secondary\)/u)
  })

  it('卡片应该 与官方「外观」卡等高（83px = padding 20×2 + 图标 16 + gap 4 + 行高 22 + 边框 .5×2）', () => {
    // 官方 AppearanceRow.module.css 的 themeCube：padding 20px 32px、gap 4px、
    // 内容 = IconXxxOutline16（16×16）+ 文字 line-height 22px。本卡无图标，用 min-height 补齐。
    const OFFICIAL_CUBE_HEIGHT = 20 * 2 + 16 + 4 + 22 + 0.5 * 2
    const minHeight = /min-height:\s*([\d.]+)px/u.exec(css)
    assert.ok(minHeight, '卡片应有 min-height')
    assert.equal(Number(minHeight[1]), OFFICIAL_CUBE_HEIGHT, '应钉在与官方卡等高的 83px')
  })

  it('卡面应该 带颗粒质感（与实况同一条纹理、同一不透明度来源、同一 screen 混合）', () => {
    assert.ok(css.includes(GRAIN_DATA_URI), '卡面要用与实况同一条颗粒纹理')
    assert.match(
      css,
      new RegExp(`opacity: var\\(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY}\\)`, 'u'),
      '不透明度与实况同源（同一个统一变量）',
    )
    assert.match(css, /mix-blend-mode: screen/u, 'screen 混合才只加亮、不发脏')
  })

  it('颗粒应该 只在深色轴显示（官方默认与浅色轴按 data-grain=off 关掉）', () => {
    assert.match(css, new RegExp(`\\[${GRAIN_ATTR}='off'\\]::after \\{\\s*display: none;`, 'u'))
  })

  it('卡片应该 把颗粒关在卡内（overflow 裁剪 + isolate 隔离混合）', () => {
    assert.match(css, /overflow: hidden/u, '颗粒不得溢出圆角')
    assert.match(css, /isolation: isolate/u, '混合只在卡内发生，不渗到卡片外的页面')
    assert.match(css, /position: relative/u, '颗粒层要相对卡片定位')
  })
})

describe('DOM 选择器', () => {
  it('层与样式表选择器应该 互不命中（重载去重不能抓错元素）', () => {
    assert.equal(LAYER_SELECTOR, `div[${MARKER_ATTR}]`)
    assert.equal(STYLE_SELECTOR, `style[${MARKER_ATTR}]`)
    assert.notEqual(LAYER_SELECTOR, STYLE_SELECTOR)
    // 层选择器带 div 限定，才不会在 document.querySelector 时先命中 <head> 里的 <style>
    assert.ok(LAYER_SELECTOR.startsWith('div['))
    assert.ok(STYLE_SELECTOR.startsWith('style['))
  })
})

describe('浏览器特性门', () => {
  it('该门的三个特性应该 都在，且 backdrop-filter / :has() 有意不在', () => {
    const names = REQUIRED_CSS_FEATURES.map(f => f.name)
    // 三条「缺了插件就不成立」的：screen 合成（降级会压暗内容）、径向渐变（色调的载体）、
    // color-mix（**22/38 个 token 的染色值全靠它**，缺了等于插件没生效却还占着设置行）。
    for (const must of ['mix-blend-mode: screen', 'radial-gradient()', 'color-mix()']) {
      assert.ok(names.includes(must), `特性门缺 ${must}`)
    }
    // 有意**不**门的：缺了只是「少覆盖几个面 / 退化成半透明」，为它停用整个插件不划算。
    for (const mustNot of ['backdrop-filter', ':has()']) {
      assert.ok(
        !names.some(n => n.includes(mustNot)),
        `${mustNot} 不该进特性门（缺它只是观感退化，见 backdrop.ts 的表）`,
      )
    }
    // 探针必须非空（会交给 CSS.supports）
    for (const feature of REQUIRED_CSS_FEATURES) {
      assert.ok(feature.probe.length > 0, `${feature.name} 缺探针`)
    }
  })
})
