import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BORDER_TOKENS,
  DARK_GOLD_ALPHA,
  DARK_TONE_IDS,
  DARK_TONES,
  DEFAULT_SETTINGS,
  DEPTH_ALPHA,
  INSET_TINT,
  INSET_TOKENS,
  LIGHT_GLOW_ALPHA,
  LIGHT_TONE_IDS,
  LIGHT_TOKENS,
  LIGHT_TONES,
  PANEL_TINT,
  POPUP_TOKENS,
  SCROLLBAR_TOKENS,
  STATE_TOKENS,
  SURFACE_RUNGS,
  SURFACE_TINT,
  SURFACE_TOKENS,
  WASH_TINT,
  WASH_TOKENS,
  panelFill,
  toneFieldFor,
  tokenOverrides,
  washFill,
} from '../lib/tones.js'
import { BACKDROP_GRADIENTS, GRAIN_DATA_URI, grainOverGradients } from '../lib/backdrop.js'
import { AFTER_LAYER_EXCLUDED_ANCHORS, COMPOSER_CARD_ANCHORS, COMPOSER_ICON_BUTTON_SCOPE, GROUPED_MENU_SCROLLER_RADIUS, GROUPED_MENU_INNER_RADIUS_VARIABLE, GROUPED_MENU_SCROLLER_SELECTOR, GROUPED_MENU_SELF_SCROLLER_SUFFIX, GROUPED_MENU_SELECTOR, GROUPED_MENU_TITLE_SELECTOR, GROUPED_MENU_UNGUARDED_SELECTOR, GROUP_TITLE_ATTACHMENT, GROUP_TITLE_RADIUS, OFFICIAL_BEFORE_LAYER_ANCHORS, OWN_BACKGROUND_ANCHORS, SURFACE_ANCHORS, buildSurfaceCss, groupTitleLayers, menuSurfaceLayers, surfaceLayers, STATIC_SURFACE_ANCHORS, usesAfterLayer, usesOfficialBeforeLayer, usesOwnBackground } from '../lib/surface.js'
import {
  BOTTOM_VARIABLE,
  DIALOG_ANCHOR,
  GRAIN_ALPHA,
  GRAIN_ALPHA_VARIABLE,
  GRAIN_TILE_VARIABLE,
  HOVER_CARD_ANCHOR,
  HOVER_CARD_TEXT_TOKENS,
  PANEL_VARIABLE,
  PLAIN_ATTR,
  POPUP_BOTTOM_SHAPE,
  POPUP_LEFT_SHAPE,
  POPUP_LIGHT_COMPENSATION,
  POPUP_STOP,
  POPUP_TOP_SHAPE,
  TOP_VARIABLE,
  LEFT_VARIABLE,
  grainTileUri,
  popupGrainAlpha,
  POPUP_GRAIN_COMPENSATION,
} from '../lib/constants.js'
import { buildGlassCss, GLASS_HEADER_ALPHA, GLASS_SPECULAR_RING } from '../lib/glass.js'

/**
 * 取**某一条规则**的规则体（花括号内的声明串）。
 *
 * 为什么要这个 helper：全表 `css.includes(x)` 这种非局部断言会被**别处的巧合**喂饱
 * —— 同一个图层串可能被多条规则使用（例如 `menuSurfaceLayers()` 同时被三条停靠卡规则用），
 * 于是「本规则必须用它」这条断言即使本规则改坏了也照样为真。
 * 断言「某条规则的内容」时必须先把作用域收进那条规则。
 * @param css - 整张样式表文本。
 * @param selectorWithBrace - 选择器片段，**含结尾的 ` {`**（避免与前缀相同的另一条撞名）。
 * @returns 该规则的规则体。
 */
function bodyOfRule(css, selectorWithBrace) {
  const at = css.indexOf(selectorWithBrace)
  assert.ok(at >= 0, `缺规则：${selectorWithBrace}`)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open))
}

/**
 * 官方抬升面 rung 的**数值真值** —— 从官方调色板逐字抄下来的一份契约快照
 * （`ui-theme/src/styles/design-platform.css:53-71` 的 light 静态块、`:129-147` 的 dark 静态块，
 * alias 绑定在 `:156-247` / `:249-340`）。这里抄数值是为了能在测试里算「混合后还亮不亮」，
 * 而 `SURFACE_RUNGS` 里传的是官方变量引用（官方换色自动跟随）—— 两边对不上就是官方动了调色板。
 */
const OFFICIAL_RUNGS = {
  light: {
    layer1: [255, 255, 255], // neutral-bluish-00
    layer2: [255, 255, 255], // neutral-bluish-00
    layer3: [255, 255, 255], // neutral-bluish-00
    tip: [245, 246, 247], // neutral-bluish-60（浅色静态块）
  },
  dark: {
    layer1: [35, 35, 36], // neutral-bluish-875
    layer2: [44, 44, 46], // neutral-bluish-850
    layer3: [53, 54, 56], // neutral-bluish-800
    tip: [53, 54, 56], // neutral-bluish-800
  },
}

/** 官方 static 变量名 → 上面那张数值表，用来反向校验 `SURFACE_RUNGS` 引对了变量。 */
const RUNG_VARIABLE = {
  light: {
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-60',
  },
  dark: {
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-850',
    layer3: '--dsw-static-neutral-bluish-800',
    tip: '--dsw-static-neutral-bluish-800',
  },
}

const SCHEMES = ['light', 'dark']
const TONES = { light: LIGHT_TONES, dark: DARK_TONES }
const NON_OFFICIAL = { light: ['sakura', 'blue', 'green'], dark: ['violet', 'crimson', 'forest'] }
/** 抬升面阶梯（layer 1→3 逐级更亮）；`tip` 是提示条，不在阶梯里。 */
const LADDER = ['layer1', 'layer2', 'layer3']
/** 深轴官方那三档的数值（我们**不再照抄**，只用来做对比快照）。 */
const DARK_RUNGS_OFFICIAL = OFFICIAL_RUNGS.dark
/** 我们选的面板档：`bluish-875`（SURFACE_RUNGS.dark）。 */
const DARK_RUNG_PANEL = [35, 35, 36]

const channels = hex => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))
const tintChannels = tint => tint.split(',').map(part => Number.parseInt(part.trim(), 10))
const sum = rgb => rgb[0] + rgb[1] + rgb[2]
/** CSS `color-mix(in srgb, A p%, B)` 的 sRGB 结果（分量线性插值）。 */
const mix = (a, b, p) => a.map((value, i) => value * p + b[i] * (1 - p))

describe('抬升面：本色单一来源', () => {
  it('底部辉光应该 就是「本色 @ 该轴共享 alpha」，不另立数值', () => {
    // 两轴这一层都是**本色的纵向渐变**（owner：「有主色的渐变那版」好看）。
    // 第 10 轮浅色轴一度换成银白，被 owner 连否两轮（「没反过来啊」→「更像纯色了」）——
    // 实测纵向极差：本色 17.5 / 银白 2.5。`tint` 与 `bottom` 必须同源，否则本色有两个来源。
    for (const scheme of SCHEMES) {
      for (const id of NON_OFFICIAL[scheme]) {
        const spec = TONES[scheme][id]
        assert.equal(
          spec.bottom,
          `rgba(${spec.tint}, ${DEPTH_ALPHA[scheme]})`,
          `${scheme}.${id} 的 bottom 应由 tint + DEPTH_ALPHA 派生`,
        )
      }
    }
  })

  it('底部那一层应该 提供**色相的纵向渐变**（这才是「不显纯色」的判据）', () => {
    // 判据不是「加亮 vs 压暗」——深色轴本色比近黑底亮、浅色轴本色比白底暗，两个轴方向相反。
    // 真正的判据是**有没有色相的纵向变化**。实测纵向极差：底=本色 17.5 / 底=银白 2.5。
    //
    // ⚠️ 2026-09-18 后 `base` 是 `var(...)` 引用（浅色轴三款 = 官方白），不再是 hex，
    // 所以这里要把已知的官方变量解析成通道值再比较。
    const OFFICIAL = {
      'var(--dsw-static-neutral-bluish-00)': [255, 255, 255],
      'var(--dsw-static-neutral-bluish-950)': [21, 21, 23],
    }
    const channels = value => {
      if (OFFICIAL[value]) return OFFICIAL[value]
      assert.match(value, /^#[0-9a-f]{6}$/iu, `底色应是 hex 或已知官方变量，实测 ${value}`)
      return [1, 3, 5].map(i => Number.parseInt(value.slice(i, i + 2), 16))
    }
    for (const scheme of SCHEMES) {
      const id = scheme === 'dark' ? 'violet' : 'green'
      const spec = TONES[scheme][id]
      // 该层色相必须来自本色
      assert.equal(spec.bottom, `rgba(${spec.tint}, ${DEPTH_ALPHA[scheme]})`, `${scheme}.${id} 底部应带本色色相`)
      // 与底色的**通道差**必须够大（否则渐变读不出来）
      const base = channels(spec.base)
      const layer = spec.tint.split(',').map(v => Number(v.trim()))
      const spread = Math.max(...[0, 1, 2].map(i => Math.abs(layer[i] - base[i])))
      assert.ok(spread >= 20, `${scheme}.${id} 底部层与底色的通道差 ${spread} 应 ≥ 20（否则读成纯色）`)
    }
  })

  it('共享 alpha 应该 逐字调好的两档（浅 .30 / 深 .18）', () => {
    // 深色轴从 pyai.site 原值 .08 两次上调到 .18 时都是三款同动。
    //
    // **2026-09-18 浅色轴定为 .30** —— 这是**结构改动**的结果，不是又一次收格：
    // 浅色轴从「本色染过的近白底 + 三层强主色光（.48/.54/.38 @100%）」
    // 改成**「官方中性底 + 一束主色光」**，与深色轴（近黑底 + 一束金光）严格镜像。
    // 新 alpha 取约深色轴的 **1.8 倍**：白底对浅色主色的通道余量只有深底对金的一半
    // （深底→金 R 差 222；白底→霜蓝 R 差 110），逐字照抄会明显偏弱。
    // 卡面的纵深 α 由本常量派生 ⇒ 实况与色卡**一起**取该值，仍逐像素相等
    // （守卫在 backdrop.test.mjs）。
    assert.equal(DEPTH_ALPHA.dark, 0.18)
    assert.equal(DEPTH_ALPHA.light, 0.30)
  })

  it('浅色轴三层光的 alpha 应该 顶部 < 侧光 < 底部（与深色轴同一次序）', () => {
    // 两轴严格镜像，所以**次序必须一致**：深色 `top .09 / left .11 / bottom .18`，
    // 浅色 `top .16 / left .19 / bottom .30`。三层是一个整体的三个方向，
    // 只动其中一层会让「光从左上来」的几何关系歪掉。
    //
    // ⚠️ 注意 `left > top` 看着反直觉，但**两轴都这样**：左侧是**大面积**铺开的左栏，
    // 顶部是窄带；alpha 相同的话左栏会显得更浓。别把它「修正」成 top > left。
    assert.equal(LIGHT_GLOW_ALPHA.top, 0.16)
    assert.equal(LIGHT_GLOW_ALPHA.left, 0.19)
    assert.equal(DEPTH_ALPHA.light, 0.30)
    assert.ok(LIGHT_GLOW_ALPHA.top < LIGHT_GLOW_ALPHA.left, '侧光 α 应略高于顶光（它铺在大面积左栏上）')
    assert.ok(LIGHT_GLOW_ALPHA.left < DEPTH_ALPHA.light, '底部纵深应最强')
    // 浅色的每一档都应**重于**深色对应的档（白底余量只有一半，见上一条）。
    // ⚠️ 2026-10-02：深色那两道金光按 owner 要求调强（`.09/.11` → `.14/.17`），
    //    浅色**未动**（owner 说的是「金光」= 深色轴；浅色那两道是本色），
    //    故「浅色 > 深色」这条**仍然成立**，只是差距从 1.8 倍收到约 1.12 倍。
    //    这里改成读常量，免得下次两者一起调时误伤。
    assert.ok(LIGHT_GLOW_ALPHA.top > DARK_GOLD_ALPHA.top,
      `浅色顶光应重于深色顶光 ${DARK_GOLD_ALPHA.top}`)
    assert.ok(LIGHT_GLOW_ALPHA.left > DARK_GOLD_ALPHA.left,
      `浅色侧光应重于深色侧光 ${DARK_GOLD_ALPHA.left}`)
    assert.ok(DEPTH_ALPHA.light > DEPTH_ALPHA.dark, '浅色底应重于深色底')
  })

  it('「官方默认」应该 没有本色（no tint → 浮层直通官方原值）', () => {
    for (const scheme of SCHEMES) {
      const spec = TONES[scheme].official
      assert.equal(spec.tint, '', `${scheme}.official.tint 应为空`)
      assert.equal(spec.bottom, '', `${scheme}.official.bottom 应为空`)
    }
  })
})

describe('抬升面：rung 表', () => {
  it('整个家族应该 收敛成每轴一档（不再逐条照抄官方的三档）', () => {
    // owner：「插件弹出、下拉弹出、设置弹出、按钮的 hover、区分区域的色块，这些还都是不统一的，有点乱」。
    // 根因之一是官方暗轴的 875/850/800 三档只差 4–6/255，肉眼分不出，染色后更糊。
    // 现在这个家族统一到一档：暗轴 875、浅轴 60。**这条测试钉住「不许再散开」。**
    for (const scheme of SCHEMES) {
      const values = [...LADDER, 'tip'].map(rung => SURFACE_RUNGS[scheme][rung])
      assert.equal(new Set(values).size, 1, `${scheme} 的 rung 应全部相同，实测 ${values.join(' / ')}`)
    }
    assert.equal(SURFACE_RUNGS.dark.layer3, '--dsw-static-neutral-bluish-875')
    // 浅轴 = 官方自己那档纯白（owner：「弹出框…应该用浅的，否则小范围看着显脏」）
    assert.equal(SURFACE_RUNGS.light.layer3, '--dsw-static-neutral-bluish-00')
  })

  it('暗轴应该 比官方菜单档更深（治「偏浅 / 军大衣」）', () => {
    // 官方菜单档 = bluish-800。我们下压到 875：染色后三通道和 139（官方档是 188），
    // 明显高于地面（36）但不再是一块发亮的灰板。
    assert.equal(RUNG_VARIABLE.dark.layer3, '--dsw-static-neutral-bluish-800', '官方菜单档快照')
    assert.notEqual(SURFACE_RUNGS.dark.layer3, RUNG_VARIABLE.dark.layer3, '我们刻意不照抄')
    for (const id of NON_OFFICIAL.dark) {
      const panel = sum(mix(tintChannels(DARK_TONES[id].tint), DARK_RUNG_PANEL, SURFACE_TINT.dark))
      const officialPanel = sum(mix(tintChannels(DARK_TONES[id].tint), DARK_RUNGS_OFFICIAL.layer3, SURFACE_TINT.dark))
      assert.ok(panel < officialPanel - 20, `${id} 面板 ${panel.toFixed(0)} 应明显深于官方档 ${officialPanel.toFixed(0)}`)
      assert.ok(panel > sum(channels(DARK_TONES[id].base)) + 60, `${id} 但仍要明显高于地面`)
    }
  })

  it('不应该 引用我们要覆盖的 alias token（会形成自引用环）', () => {
    for (const scheme of SCHEMES) {
      for (const rung of [...LADDER, 'tip']) {
        assert.match(SURFACE_RUNGS[scheme][rung], /^--dsw-static-[a-z0-9-]+$/u, `${scheme}.${rung} 必须是原始色阶`)
      }
    }
  })
})

describe('抬升面：谁被染', () => {
  const tokens = SURFACE_TOKENS.map(entry => entry.token)

  it('应该 覆盖「面」的三个 layer token', () => {
    for (const token of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3']) {
      assert.ok(tokens.includes(token), `缺少抬升面 token ${token}`)
    }
  })

  it('⛔ `--dsw-specific-input-major` 必须被染，且与 layer-2 同档同值', () => {
    // ## 为什么（2026-09-27 owner 真机反馈）
    //
    // owner：「**这个问题清单本身还是官方原色，没适配**」—— 指的是 `ask_user_question`
    // 弹的那个问询面板（`ui-user-questions` 的 `PlanReviewPanel` / `QuestionComposer`）。
    // 根因：它用 `--dsw-specific-input-major` 画面，而该 token **不在任何覆盖表里**
    // （实测 `tokenOverrides()` 产出的 40 个 token 不含它）⇒ 一直是官方灰/白，
    // 而旁边的面都跟着色调走，于是显出一块没适配的板子。
    //
    // **归 `layer2` 档**不是随手挑的：官方把两个 token 在两轴上**绑到同一个 static 变量**
    // （`design-platform.css` 的 `:171`/`:262` 浅轴都是 `bluish-00`，`:281`/`:372` 深轴都是
    // `bluish-850`）—— 语义等价，染成同一档才不会分叉。
    //
    // 影响面（官方用这个 token 画面的一共 9 个组件，逐文件核过）：
    // `PlanReviewPanel`、`QuestionComposer`（问询卡片）、`ApprovalPanel`、
    // `AttachmentRail`、`FileCard`、`MessageItem`、`InputBar`、`ImageLightbox`、`AccountNotice`。
    assert.ok(tokens.includes('--dsw-specific-input-major'), '缺少 --dsw-specific-input-major —— 问询卡片会退回官方原色')
    const entry = SURFACE_TOKENS.find(e => e.token === '--dsw-specific-input-major')
    assert.equal(entry.rung, 'layer2', 'input-major 必须与 layer-2 同档（官方把两者绑在同一个 static 变量上）')
    // 逐色调验证两者**始终同值**，防止将来有人只改其中一个。
    // （`LIGHT_TONES` / `DARK_TONES` 是**对象**（id → ToneSpec），不是数组 —— 迭代用 `*_TONE_IDS`。）
    for (const lightTone of LIGHT_TONE_IDS) {
      for (const darkTone of DARK_TONE_IDS) {
        const overrides = tokenOverrides({ lightTone, darkTone })
        for (const scheme of SCHEMES) {
          assert.equal(
            overrides['--dsw-specific-input-major'][scheme],
            overrides['--dsw-alias-bg-layer-2'][scheme],
            `${scheme} 轴（${lightTone}/${darkTone}）下 input-major 与 layer-2 分叉了`,
          )
        }
      }
    }
  })

  it('菜单族应该 两个名字都染（同值），且只装颜色（图层归 surface.ts，见 POPUP_TOKENS）', () => {
    // 菜单走 POPUP_TOKENS：**只给颜色**。曾经塞过整份图层配方，但官方把这个
    // token 也用在 sticky 分组标题上，百分比渐变按元素盒子缩放会把小条压成硬边金带。
    // ⚠️ 2026-09-20：`--dsw-specific-tip` **已移出本表** —— 它的消费方是三张停靠卡
    // （TodoPanel / GoalBar / QueueDock），不是菜单；且它要「比地面重」而菜单族要「比地面浅」，
    // 目标相反。现归 INSET_TOKENS（见下一条）。
    // ⚠️ 0.1.7：官方把菜单填充收进 `--dsw-menu-surface-fill`（`.material` 读它），
    // `--dsw-specific-menu` 只是它的别名，而**两个名字都有消费方**（后者见官方
    // `.groupTitle` 与本仓库 codebuddy 的菜单）。只染一个 → 同一张卡片与它自己的
    // 粘性标题各读一个 → 标题显成色差横带，故**两个一起染、且同值**。
    assert.deepEqual(POPUP_TOKENS.map(entry => entry.token), ['--dsw-menu-surface-fill', '--dsw-specific-menu'])
    for (const token of tokens) {
      assert.ok(!['--dsw-specific-menu', '--dsw-specific-tip'].includes(token), `${token} 不该同时在两张表里`)
    }
    // 硬约束：这两个 token 的值里**不许出现任何图层**（渐变 / 贴图），否则小条重新烂掉。
    for (const { token } of POPUP_TOKENS) {
      for (const scheme of SCHEMES) {
        const value = tokenOverrides({ lightTone: 'green', darkTone: 'forest' })[token][scheme]
        assert.ok(!value.includes('gradient'), `${token}.${scheme} 不该带渐变`)
        assert.ok(!value.includes('url('), `${token}.${scheme} 不该带贴图`)
      }
    }
  })

  it('浅灰内嵌面应该 走**独立比例**，且比背景更重（代码块 / 三张停靠卡）', () => {
    // owner 2026-09-20：「官方白色主题这几个卡，包括代码块，都是浅灰色，所以我考虑要不我们
    // 用我们的主色来做这个事，这样就会比背景颜色重一些，正好就区分开了。」
    // 回归意义：这三条一度**与背景同色**（浅色轴抬升面回纯白后，tip 变 #fff）——
    // 卡片的面整个消失，只剩 4% 描边在撑。
    assert.deepEqual(
      INSET_TOKENS.map(e => e.token),
      ['--dsw-alias-markdown-code-block', '--dsw-alias-markdown-code-block-banner', '--dsw-specific-tip'],
    )
    // 三张停靠卡 + 代码块都在这张表里（缺一条就会有面重新变白）
    assert.ok(INSET_TOKENS.some(e => e.token === '--dsw-specific-tip'), '停靠卡必须被染色')
    // 不得与抬升面 / 菜单族重叠
    for (const { token } of INSET_TOKENS) {
      assert.ok(!tokens.includes(token), `${token} 不该同时在抬升面表里`)
      assert.ok(!POPUP_TOKENS.some(e => e.token === token), `${token} 不该同时在菜单族里`)
    }
    // 独立比例：必须与面板比例分开（目标相反）
    assert.notEqual(INSET_TINT.light, PANEL_TINT.light, '内嵌面比例必须与面板比例分开')
    // 比背景更重：混进本色后的亮度必须**低于**同轴的官方基色（否则还是「看不见」）
    const overrides = tokenOverrides({ lightTone: 'green', darkTone: 'violet' })
    for (const { token, official } of INSET_TOKENS) {
      const value = overrides[token].light
      assert.ok(value.includes('color-mix'), `${token} 浅色轴应被染色（实测 ${value}）`)
      assert.ok(value.includes(`var(${official.light})`), `${token} 应混进官方那一档 ${official.light}`)
    }
  })

  it('不应该 染反色面（工具提示 / 轻提示是反色语义，染了就翻车）', () => {
    for (const token of [
      '--dsw-alias-tooltip-bg',
      '--dsw-alias-toast-bg',
      '--dsw-alias-button-contrast-fill',
      '--dsw-alias-bg-mask-1',
    ]) {
      assert.ok(!tokens.includes(token), `${token} 是反色 / 遮罩，不该进抬升面清单`)
      assert.ok(!POPUP_TOKENS.some(entry => entry.token === token), `${token} 也不该进菜单族`)
    }
  })

  it('菜单族应该 保住官方 alpha（官方玻璃 token），浅色轴且不染色', () => {
    // ⚠️ 0.1.7 起官方 `--dsw-specific-menu` 是**半透明玻璃色**，浮层自己配
    // `backdrop-filter: var(--dsw-menu-backdrop-filter)`（官方样式规则要求两者成对，
    // `docs/web-styling.zh.md:25`）。我方只换 RGB，**alpha 必须逐字保持官方值** ——
    // 涂成不透明会把官方玻璃整块吃掉（旧契约「菜单与 layer-3 同色」已作废）。
    const alphaOf = color => /,\s*([\d.]+)\)$/u.exec(color)?.[1]
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'forest' })
    for (const { token, official } of POPUP_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.equal(
          alphaOf(overrides[token][scheme]),
          alphaOf(official[scheme]),
          `${scheme}: ${token} 必须保持官方 alpha（否则官方玻璃失效）`,
        )
      }
      // 浅色轴沿用面板口径（PANEL_TINT.light = 0）→ 直通官方字面量。
      assert.equal(overrides[token].light, official.light, `${token}.light 应直通官方`)
    }
  })

  it('「默认」应该 逐条等于官方绑定（不是我们选的档）—— 这是「完全不介入」的底线', () => {
    // 曾经真的错在这里：`surfaceFill` 在官方默认下也发 `SURFACE_RUNGS`（我们选的 875），
    // 于是官方默认的 `layer-3` 从官方的 `800` 被改深了 —— 「官方默认的都不要动」当场就破了。
    const identity = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const scheme of SCHEMES) {
      for (const { token, rung } of SURFACE_TOKENS) {
        assert.equal(identity[token][scheme], `var(${RUNG_VARIABLE[scheme][rung]})`, `${token}.${scheme}`)
      }
      // 菜单族在「默认」轴同样逐字回官方 —— 只是它现在回的是官方的**半透明字面量**
      // （不再是被我们改档的 rung，也不再是 `var()` 引用）。
      for (const { token, official } of POPUP_TOKENS) {
        assert.equal(identity[token][scheme], official[scheme], `${token}.${scheme} 官方默认应直通官方字面量`)
      }
      assert.equal(identity[PANEL_VARIABLE][scheme], `var(${RUNG_VARIABLE[scheme].layer3})`, `panel.${scheme}`)
      // 浅灰内嵌面同样要**逐条回官方**：代码块与三张停靠卡在「默认」轴必须与官方逐字符相同。
      for (const { token, official } of INSET_TOKENS) {
        assert.equal(
          identity[token][scheme],
          `var(${official[scheme]})`,
          `${token}.${scheme} 官方默认必须直通官方绑定（实测 ${identity[token][scheme]}）`,
        )
      }
    }
  })

  it('⛔ 浅灰内嵌面在「默认」轴不得产生 color-mix（否则官方默认就被染色了）', () => {
    const identity = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const { token } of INSET_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.ok(
          !identity[token][scheme].includes('color-mix'),
          `${token}.${scheme} 官方默认下不该有 color-mix：${identity[token][scheme]}`,
        )
      }
    }
  })

  it('每个 rung 都应该 在 rung 表里有定义', () => {
    // 菜单族不再走 rung（0.1.7 起是官方半透明字面量，见上一条），故只查抬升面。
    for (const { token, rung } of SURFACE_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.ok(SURFACE_RUNGS[scheme][rung], `${token} 的 rung ${rung} 在 ${scheme} 上未定义`)
      }
    }
  })
})

describe('抬升面：覆盖层取值', () => {
  it('每个抬升面 token 都应该 出现在 tokenOverrides 里，且两个模式都给', () => {
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'forest' })
    for (const { token } of SURFACE_TOKENS) {
      const modes = overrides[token]
      assert.ok(modes, `tokenOverrides 缺少 ${token}`)
      assert.ok(modes.light.length > 0 && modes.dark.length > 0, `${token} 的模式值不能为空`)
    }
  })

  it('非官方色调应该 按**面板专用**比例把本色混进官方 rung（浅色轴 0 → 直通官方）', () => {
    // ⚠️ 2026-09-20：浅色轴的面板比例收到 `0` —— 面板底色必须**逐字符等于官方**。
    // 原因见下一条回归守卫（`.07` 的实测值 `#f9fdfa` 会压住官方面色 `#f9fafb`）。
    // 深色轴仍是 `.14`：它的地面是本色染过的近黑、面板本就同源，没有这个冲突。
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'violet' })
    for (const scheme of SCHEMES) {
      const tint = TONES[scheme][scheme === 'dark' ? 'violet' : 'blue'].tint
      const pct = Math.round(PANEL_TINT[scheme] * 100)
      for (const { token, rung } of SURFACE_TOKENS) {
        const reference = `var(${SURFACE_RUNGS[scheme][rung]})`
        const expected = pct === 0 ? reference : `color-mix(in srgb, rgb(${tint}) ${pct}%, ${reference})`
        assert.equal(overrides[token][scheme], expected, `${token}.${scheme}`)
      }
    }
    assert.equal(PANEL_TINT.light, 0, '浅色面板比例应为 0（底色保持官方原值）')
    assert.equal(SURFACE_TINT.light, 0.14, '交互态 / 滚动条保持 .14（它们只出现在已染色的面之内）')
    assert.notEqual(PANEL_TINT.light, SURFACE_TINT.light, '浅色轴两者应已分离')
    assert.equal(PANEL_TINT.dark, SURFACE_TINT.dark, '深色轴两者仍同值（地面同源，无冲突）')
  })

  it('浅色轴 抬升面底色不得染色 —— 否则会与官方「面」色撞车', () => {
    // 回归守卫（2026-09-20，owner 报「代码块等对话内元素的背景被吃掉」的根因）：
    // 官方面色 `--dsw-static-neutral-bluish-50` = `#f9fafb`（代码块、左侧栏都用它）；
    // 浅色轴若按 `.07` 染本色，实测值 `#f9fdfa` 与它只差 1–3 阶 —— 于是
    // **用官方面色当背景的元素全部失去可辨性**。
    // 具体落点：Trajectory 视图画布取 `--dsw-alias-bg-layer-1`
    // （`dsh-client-ui-trajectory` 的 `qBU-ya_root` / `Y0dWHa_split` / `Y0dWHa_table`），
    // 官方面是 `#fff`、代码块 `#f9fafb`（差 6 阶，读得出灰底）；
    // 被我们染成 `#f9fdfa` 后与代码块同色 → 灰底消失。
    // 浅色口径是「官方底色配置 + 打光用主色」：底色不染，色调由打光层承担。
    const overrides = tokenOverrides({ lightTone: 'green', darkTone: 'violet' })
    for (const { token, rung } of SURFACE_TOKENS) {
      assert.equal(
        overrides[token].light,
        `var(${SURFACE_RUNGS.light[rung]})`,
        `${token} 的浅色轴必须是纯官方引用`,
      )
    }
    // 菜单族同理：浅色轴走 PANEL_TINT.light = 0 → 直通官方**字面量**（它现在是半透明玻璃色，
    // 没有 var() 绑定可引用；但「不在白面上再染一层」这条浅色口径不变）。
    for (const { token, official } of POPUP_TOKENS) {
      assert.equal(overrides[token].light, official.light, `${token} 的浅色轴必须是官方原值`)
    }
  })

  it('官方默认应该 直通**官方** rung（逐字符等于官方原值，不产生 color-mix）', () => {
    // 注意这里比的是 `RUNG_VARIABLE`（官方绑定快照），**不是** `SURFACE_RUNGS`（我们选的档）——
    // 官方默认必须回到官方自己的档，否则「完全不介入」就破了。见「抬升面：谁被染」里那条。
    const overrides = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const scheme of SCHEMES) {
      for (const { token, rung } of SURFACE_TOKENS) {
        assert.equal(overrides[token][scheme], `var(${RUNG_VARIABLE[scheme][rung]})`, `${token}.${scheme}`)
        assert.ok(!overrides[token][scheme].includes('color-mix'), `${token}.${scheme} 官方默认不该染色`)
      }
    }
  })

  it('两轴应该 各一档共享比例（现在同档 .14），且浅轴仍受「不能比底色暗太多」约束', () => {
    assert.deepEqual(Object.keys(SURFACE_TINT).sort(), ['dark', 'light'])
    // 浅轴原本刻意压到 .05（怕「抬升翻塌陷」）。owner 反馈三款分不清后提到与暗轴同档 .14：
    // 弹层是界面里数量最多、面积最大的不透明面，而背景中段（约 55% 屏高）只有底色、拉不开。
    // 实测三款两两差：.05 → 3.9/3.3/3.0（低于肉眼阈），.14 → 11.0/9.3/8.3。
    assert.equal(SURFACE_TINT.light, 0.14)
    assert.equal(SURFACE_TINT.dark, 0.14)
    // 但**不能无限加**：浅轴 rung 比近白底暗，混得越多浮层越暗。守住一个上限。
    assert.ok(SURFACE_TINT.light > 0 && SURFACE_TINT.light <= 0.2, '浅轴比例再大，浮层就暗得读不出「抬升」了')
  })
})

describe('抬升面：不变量', () => {
  it('面板底色应该 只有一处来源：所有「面」共用同一个值', () => {
    // owner：「插件弹出、下拉弹出、设置弹出…还都是不统一的」。统一的第一条就是**颜色只有一个值**：
    // layer-1/2/3（面）、菜单族（token）、兜底选择器读的 PANEL_VARIABLE，全部落在同一个字面量上。
    const overrides = tokenOverrides({ lightTone: 'green', darkTone: 'forest' })
    for (const scheme of SCHEMES) {
      const expected = panelFill(TONES[scheme][scheme === 'dark' ? 'forest' : 'green'], scheme, 'layer3')
      for (const { token } of SURFACE_TOKENS) {
        assert.equal(overrides[token][scheme], expected, `${token}.${scheme} 应与面板底色同值`)
      }
      assert.equal(overrides[PANEL_VARIABLE][scheme], expected, `PANEL_VARIABLE.${scheme} 应与面板底色同值`)
      // 菜单族自 0.1.7 起**不共享**这个不透明字面量：它是半透明玻璃色（官方 alpha +
      // 本色 RGB），只保证与面板同色相、且 alpha 不被我们改（见「菜单族应该 保住官方 alpha」）。
      for (const { token, official } of POPUP_TOKENS) {
        assert.notEqual(overrides[token][scheme], expected, `${token}.${scheme} 不应等于不透明面板底色`)
        assert.ok(
          overrides[token][scheme].startsWith('rgba(') && /,\s*([\d.]+)\)$/u.test(overrides[token][scheme]),
          `${token}.${scheme} 应是带 alpha 的 rgba 字面量`,
        )
        assert.ok(
          Number(/,\s*([\d.]+)\)$/u.exec(overrides[token][scheme])[1])
            === Number(/,\s*([\d.]+)\)$/u.exec(official[scheme])[1]),
          `${token}.${scheme} 的 alpha 必须等于官方值`,
        )
      }
    }
  })

  it('暗轴面板应该 明显高于地面、但明显低于官方那档（既不埋进地面也不发亮）', () => {
    for (const id of NON_OFFICIAL.dark) {
      const base = sum(channels(DARK_TONES[id].base))
      const panel = sum(mix(tintChannels(DARK_TONES[id].tint), DARK_RUNG_PANEL, SURFACE_TINT.dark))
      assert.ok(panel > base + 60, `${id} 面板 ${panel.toFixed(0)} 应明显高于地面 ${base}`)
      assert.ok(panel < 200, `${id} 面板 ${panel.toFixed(0)} 不该是一块发亮的灰板`)
    }
  })

  it('浮层的配方应该 四层齐备（颗粒 / 顶光 / 底光 / 左光）—— 但画在选择器那层，不进 token', () => {
    // 曾经这条测的是 `--dsw-specific-menu` 的值，现在配方归 `surfaceLayers()`：
    // token 只装颜色（否则 sticky 分组标题会把百分比渐变压成硬边金带，见 05-surfaces §8.2）。
    //
    // ⚠️ **2026-09-27：层数由 3 改成 4** —— 补上左光。owner 报
    // 「设置弹窗的打光和其他的好像不一样……我记得咱们的深色主题是三道光，应该所有元素都统一」，
    // 实测确认：背景层是**三道光**（顶/底/左），而浮层只引用了顶与底两道，
    // `LEFT_VARIABLE` 在 surface.ts 里一次都没出现过（不是拿不到 —— tones 早已把它发到 body，
    // 浮层继承得到，只是没用）。补上后浮层与背景层同为三道光。
    const layers = surfaceLayers().split(',\n    ')
    assert.equal(layers.length, 4, '颗粒 + 顶光 + 底光 + 左光')
    assert.equal(layers[0], `var(${GRAIN_TILE_VARIABLE}, none)`, '颗粒压在最上面才像砂面')
    assert.ok(layers[1].includes(POPUP_TOP_SHAPE), '第二层是顶光')
    assert.ok(layers[2].includes(POPUP_BOTTOM_SHAPE), '第三层是底光')
    assert.ok(layers[3].includes(POPUP_LEFT_SHAPE), '第四层是左光（与背景层对齐）')
    for (const layer of layers.slice(1)) {
      assert.ok(layer.includes(POPUP_STOP), `每层都以同一个收束点结束：${POPUP_STOP}`)
    }
    // 三条光必须**都**引用各自的运行期变量，且都带 transparent 兜底
    // （官方默认档下这些变量是 transparent ⇒ 等于什么都不画）。
    for (const [shape, variable] of [[POPUP_TOP_SHAPE, TOP_VARIABLE], [POPUP_BOTTOM_SHAPE, BOTTOM_VARIABLE], [POPUP_LEFT_SHAPE, LEFT_VARIABLE]]) {
      const layer = layers.find(l => l.includes(shape))
      assert.ok(layer !== undefined, `缺少引用 ${variable} 的那层`)
      assert.ok(layer.includes(`var(${variable}, transparent)`), `${variable} 必须走变量并带 transparent 兜底`)
    }
  })

  it('⛔ 浮层三道光必须**都**乘同一个补偿系数（owner：顶光明显比别人强，要统一）', () => {
    // 判据：「同一屏幕位置上，浮层的 alpha 应等于地面的 alpha」（解析，可逐字复核）。
    // 两道光的配方都是锁定常量 ⇒ 直接解 alpha浮层 = alpha地面：
    //   对话框顶边中央 (700,50) → k=0.709
    //   对话框顶边左 1/4 (500,50) → k=0.592
    //   对话列顶部中央 (700,10) → k=0.771
    // ⇒ k* ≈ 0.69，取 0.7（与顶栏 GLASS_HEADER_ALPHA 同值）。
    // 交叉验证：峰值口径实测 k=0.33 → 浮层/地面 0.48，解析预测 0.47，两者吻合。
    // ⚠️ 这里曾定成 0.33，依据是一条**错误**的扫描（只覆盖元素级、且三道光比单道顶光）。
    //    稳定的读数不等于正确的读数 —— 保留这条注释提醒后来者核对口径。
    const layers = surfaceLayers().split(',\n    ')
    const lightLayers = layers.slice(1)
    assert.equal(lightLayers.length, 3, '三道光')
    for (const layer of lightLayers) {
      assert.ok(
        layer.includes('color-mix(in srgb, var(--dsh-theme-tone-'),
        `每道光都要走 color-mix 压强度（否则就回到「比地面强」）：${layer.slice(0, 90)}`,
      )
      assert.ok(
        layer.includes(`${Math.round(POPUP_LIGHT_COMPENSATION * 100)}%, transparent)`),
        `每道光的系数必须来自 POPUP_LIGHT_COMPENSATION（${POPUP_LIGHT_COMPENSATION}）`,
      )
      // 用 color-mix 而非解析成具体色值：变量里是任意合法颜色，插件不该去解析它；
      // 且 transparent 混出来仍是透明 ⇒ 官方默认档下等于什么都不画。
      assert.ok(!/rgba?\(\s*\d/u.test(layer), '不得把变量解析成具体色值（变量的内容插件不该关心）')
    }
    // 系数必须落在解析解附近：偏离会让浮层与地面明显不同档。
    assert.ok(
      Math.abs(POPUP_LIGHT_COMPENSATION - 0.7) < 0.08,
      `补偿系数应贴近解析解 0.69（取 0.7 与顶栏同值），实际 ${POPUP_LIGHT_COMPENSATION}`,
    )
    // 分组菜单那条是**同一族的另一套**图层串，其底光也必须同系数，免得同族两处又分叉。
    assert.ok(
      menuSurfaceLayers().includes(`${Math.round(POPUP_LIGHT_COMPENSATION * 100)}%, transparent)`),
      'menuSurfaceLayers 的底光必须用同一个补偿系数',
    )
  })

  it('浮层的补偿系数应与顶栏的系数一致 —— 两处理由不同但落到同一个数', () => {
    // 顶栏走 glass.ts 的 dimmedBackdropGradients(GLASS_HEADER_ALPHA)（按自己的填充 alpha 同步压）；
    // 浮层走本表的 color-mix 补偿（按「与地面等 alpha」解出）。
    // 两条路推出来的都是 0.7（顶栏实测 A/G=0.98）。钉住这个巧合：
    // 将来调其中一处时，这条会提醒「另一处是不是也该动」。
    assert.equal(
      POPUP_LIGHT_COMPENSATION,
      GLASS_HEADER_ALPHA,
      '浮层与顶栏的强度系数当前相等（0.7）；若有意分开，请同步更新本条与两处注释',
    )
  })

  it('顶栏的光必须走它自己那条路（按 HEADER_LIGHT_SCALE），不得改调 surfaceLayers()', () => {
    // ⚠️ 断言要看**渲染出来的 CSS**，不能查函数名 —— `dimmedBackdropGradients` 是**构建期**调用的，
    // 它的名字不会出现在产物里（我第一版就是这么写错的）。
    // 顶栏与浮层两条路的区别是**几何**：顶栏用**视口尺度**的 vw/vh（background-attachment: fixed
    // 让百分比按视口解析），浮层用**自身盒子**的百分比。用这一点区分。
    const glass = buildGlassCss()
    const header = glass.slice(glass.indexOf("[data-slot='conversation.header'] > header::before"))
    const headerRule = header.slice(0, header.indexOf('}'))
    assert.match(headerRule, /background-image:/u, '顶栏 ::before 要画光')
    assert.match(headerRule, /vw|vh/u, '顶栏的光必须用视口尺度几何（vw/vh）—— 那是它自己那条路的标志')
    assert.match(headerRule, /background-attachment: fixed/u, '并要求 fixed，否则百分比会按 76px 的盒子重算')
    // 反过来：浮层那套几何（百分比、无 fixed）不得出现在顶栏规则里。
    assert.ok(
      !headerRule.includes(POPUP_TOP_SHAPE),
      '顶栏不得改用浮层的几何（POPUP_TOP_SHAPE 是浮层盒尺度）',
    )
  })

  it('⛔ 浮层的三道光必须与背景层的三道光**逐道对应**', () => {
    // 这条守卫防的是「又漏一道」：两边的配方是**同一套三道光的两个尺度**，
    // 任何一边新增/删除一道都必须同步 —— 否则观感又会分叉（owner 报的就是这个）。
    const popup = surfaceLayers()
    const backdrop = BACKDROP_GRADIENTS
    for (const variable of [TOP_VARIABLE, BOTTOM_VARIABLE, LEFT_VARIABLE]) {
      assert.ok(backdrop.includes(`var(${variable}`), `背景层应引用 ${variable}（不变量基准）`)
      assert.ok(popup.includes(`var(${variable}`), `浮层缺少 ${variable} —— 与背景层分叉了`)
    }
  })

  it('官方默认的菜单族应该 直通官方原值（不带任何图层）', () => {
    // 「默认 = 完全不介入」在 token 层也要成立：值里不能出现 gradient / 颗粒，
    // 且必须是**官方**那一份值。菜单族自 0.1.7 起是官方的半透明玻璃字面量
    // （不再是 `var(--dsw-static-…)` 引用），故逐字比官方字面量。
    const overrides = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const { token, official: officialValue } of POPUP_TOKENS) {
      for (const scheme of SCHEMES) {
        const value = overrides[token][scheme]
        assert.equal(value, officialValue[scheme], `${token}.${scheme}`)
        assert.ok(!value.includes('gradient') && !value.includes('url('))
      }
    }
  })

  it('暗轴三款应该 在面板上保持彼此可分辨（本色没有被中性 rung 冲平）', () => {
    for (const rung of LADDER) {
      const filled = ['violet', 'crimson', 'forest'].map(id =>
        mix(tintChannels(DARK_TONES[id].tint), DARK_RUNG_PANEL, SURFACE_TINT.dark),
      )
      // 逐通道全等即说明本色被抹平；用「至少一对通道差 ≥ 4」当可辨阈值。
      for (let i = 0; i < filled.length; i++) {
        for (let j = i + 1; j < filled.length; j++) {
          const spread = Math.max(...filled[i].map((v, k) => Math.abs(v - filled[j][k])))
          assert.ok(spread >= 4, `${rung}: 第 ${i} / ${j} 款在 ${spread.toFixed(1)} 个通道上分不开`)
        }
      }
    }
  })
})

describe('抬升面：光色变量（插件自己的 token）', () => {
  it('光色变量应该 都发到 token 层，且两个模式都给', () => {
    // 浮层是 portal 到 body 的官方元素，读不到背景层元素上的内联变量 —— 必须发到 body 上。
    const overrides = tokenOverrides(DEFAULT_SETTINGS)
    for (const { token } of LIGHT_TOKENS) {
      assert.ok(overrides[token], `tokenOverrides 缺少 ${token}`)
      assert.ok(overrides[token].light.length > 0 && overrides[token].dark.length > 0, `${token} 两模式都要给`)
    }
    // 回归守卫：**left 曾经漏在这里**（只在背景层元素上写内联样式）→ 浮层读不到，
    // 所有弹层的左光一直是缺的（owner 报「其他能弹出的…都没有下面的光」那次一并查出）。
    // 2026-09-24 追加 GRAIN_ALPHA_VARIABLE（颗粒强度的统一旋钮，owner：「噪点值统一变量」）。
    assert.deepEqual(
      LIGHT_TOKENS.map(entry => entry.token),
      [TOP_VARIABLE, BOTTOM_VARIABLE, LEFT_VARIABLE, GRAIN_TILE_VARIABLE, GRAIN_ALPHA_VARIABLE],
    )
  })

  it('空串应该 一律翻成 CSS 字面量（空串在自定义属性里非法）', () => {
    // 官方默认款没有 top / bottom，也没有颗粒。
    const overrides = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    assert.equal(overrides[TOP_VARIABLE].light, 'transparent')
    assert.equal(overrides[BOTTOM_VARIABLE].dark, 'transparent')
    assert.equal(overrides[GRAIN_TILE_VARIABLE].light, 'none')
    assert.equal(overrides[GRAIN_TILE_VARIABLE].dark, 'none')
    for (const { token } of LIGHT_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.notEqual(overrides[token][scheme], '', `${token}.${scheme} 不得为空串`)
      }
    }
  })

  it('光色应该 与色调表逐字一致（浮层与背景层同一束光）', () => {
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'crimson' })
    assert.equal(overrides[TOP_VARIABLE].light, LIGHT_TONES.blue.top)
    assert.equal(overrides[BOTTOM_VARIABLE].light, LIGHT_TONES.blue.bottom)
    assert.equal(overrides[TOP_VARIABLE].dark, DARK_TONES.crimson.top)
    assert.equal(overrides[BOTTOM_VARIABLE].dark, DARK_TONES.crimson.bottom)
  })

  it('颗粒贴图应该 跟着色调的 grain 开关走（**两轴六款都开**，只有官方默认关）', () => {
    const on = tokenOverrides({ lightTone: 'sakura', darkTone: 'violet' })
    // 贴图里烘的 alpha 由 `GRAIN_ALPHA × POPUP_GRAIN_COMPENSATION` 派生（唯一来源见下一条）。
    // ⚠️ **不是** GRAIN_ALPHA 原值：浮层那条路没有 screen 混合，同 alpha 会重约 43%。
    assert.equal(on[GRAIN_TILE_VARIABLE].dark, grainTileUri(popupGrainAlpha('dark')))
    // owner：「浅色版也可以和深色版有相同的渐变质感」→ 浅色轴也开颗粒
    assert.equal(on[GRAIN_TILE_VARIABLE].light, grainTileUri(popupGrainAlpha('light')), '浅色轴现在也叠颗粒')
    for (const scheme of SCHEMES) {
      for (const id of NON_OFFICIAL[scheme]) {
        const spec = TONES[scheme][id]
        const expected = spec.grain ? grainTileUri(popupGrainAlpha(scheme)) : 'none'
        // 注意：键名必须是 settings 的真实字段名（`lightTone` / `darkTone`）。
        // 这里曾误写成 `{ light, dark }` → `toneIdOf` 读不到 → 回落 official（grain off），
        // 而当时浅色轴本就 expected='none'，于是**测试一直假通过**；改成 grain:true 后才暴露。
        const modes = { lightTone: 'sakura', darkTone: 'violet' }
        modes[toneFieldFor(scheme)] = id
        assert.equal(
          tokenOverrides(modes)[GRAIN_TILE_VARIABLE][scheme],
          expected,
          `${scheme}.${id}（spec.grain=${spec.grain}）`,
        )
      }
    }
  })

  it('浮层颗粒贴图应该 与背景层同一张噪声，只差烘进去的强度', () => {
    // `background-image` 的图层没有独立 opacity，所以浮层那张把 `<rect opacity>` 烘进了 SVG；
    // 背景层那张靠 `::after { opacity: … }`。
    const strip = uri => uri.replace(/ opacity='[\d.]+'/u, '')
    assert.equal(
      strip(grainTileUri(popupGrainAlpha('dark'))),
      GRAIN_DATA_URI,
      '两张贴图除 opacity 外必须逐字一致（噪声参数同源）',
    )
    assert.ok(grainTileUri(popupGrainAlpha('dark')).includes(`opacity='${popupGrainAlpha('dark')}'`), '浮层那张烘深色轴的值')
    assert.ok(grainTileUri(popupGrainAlpha('light')).includes(`opacity='${popupGrainAlpha('light')}'`), '浅色轴那张烘浅色轴的值')
    assert.ok(GRAIN_DATA_URI.includes("baseFrequency='0.8'"), '同一套 feTurbulence 参数')
  })

  it('颗粒强度必须**只有一个来源**（owner：「噪点值统一变量，方便后续我们减弱」）', () => {
    // 改 GRAIN_ALPHA 一个对象 → 下面两处**一起变**：
    //   ① 运行期变量（背景层那条路的 CSS opacity）；
    //   ② 浮层贴图预乘的 alpha = GRAIN_ALPHA × POPUP_GRAIN_COMPENSATION。
    //
    // ⚠️ **2026-09-27 修正**：此前这里断言「贴图 alpha === GRAIN_ALPHA」，即两条路用同一个数。
    // 真机实测推翻了这个前提 —— owner 报「弹出元素还是噪点太重了，和背景不是一个档位」，
    // 实测弹出层确实重约 43%（两个 alpha 之间隔着一个 0.7 的补偿系数，理由见 constants.ts）。
    // 「唯一来源」的真正含义是**只有一个可调旋钮、两处由它派生且保持同档**，
    // 不是「两处字面相等」。下面同时钉住派生关系与单调性，避免有人把系数悄悄改掉。
    // ⚠️ 必须用**非官方**的两轴（官方默认档 grain 是关的，贴图是 'none'，断言会假过）。
    const overrides = tokenOverrides({ lightTone: 'sakura', darkTone: 'violet' })
    for (const scheme of SCHEMES) {
      assert.equal(
        Number(overrides[GRAIN_ALPHA_VARIABLE][scheme]),
        GRAIN_ALPHA[scheme],
        `${scheme} 的运行期颗粒强度应等于 GRAIN_ALPHA`,
      )
      assert.ok(
        overrides[GRAIN_TILE_VARIABLE][scheme].includes(`opacity='${popupGrainAlpha(scheme)}'`),
        `${scheme} 的贴图预乘 alpha 应等于 GRAIN_ALPHA × 补偿系数`,
      )
    }
    // ⚠️ **2026-09-27（M6）再次改判**：范围从 (0.4, 1) 改为 (0.4, 1.6)。
    //
    // 上一版断言「浮层要比背景**弱**（< 1），因为少了 screen 混合的削弱」——
    // 那个理由**方向是反的**：screen 在深色轴上把噪声**提亮**，所以地面的颗粒比名义 alpha
    // 更显眼；浮层是普通合成，同样 alpha 反而更淡 ⇒ 浮层要比地面**强**才对得上。
    // 单载体、同屏幕位置重定标给出 k* = 1.23（7 点扫描独立复核 1.264）。
    //
    // 上界 1.6 防的是「系数被误改成离谱值」（如 3、10）；下界 0.4 防「几乎看不见」。
    // alpha 实际安全的前提是 GRAIN_ALPHA × k ≤ 1 ⇒ 另有一条单独断言（见下）。
    assert.ok(
      POPUP_GRAIN_COMPENSATION > 0.4 && POPUP_GRAIN_COMPENSATION < 1.6,
      `补偿系数应在 (0.4, 1.6) 内，实际 ${POPUP_GRAIN_COMPENSATION}`,
    )
    // 关键物理约束：预乘 alpha 不得超过 1（超过就是无效值，观感会完全不同）。
    for (const scheme of SCHEMES) {
      assert.ok(
        GRAIN_ALPHA[scheme] * POPUP_GRAIN_COMPENSATION <= 1,
        `${scheme}：GRAIN_ALPHA × 补偿系数 = ${GRAIN_ALPHA[scheme]} × ${POPUP_GRAIN_COMPENSATION} 超过 1`,
      )
    }
    // 派生关系必须是**乘法**：GRAIN_ALPHA 变了，浮层贴图跟着成比例变（不是写死的常数）。
    // 这是「一个旋钮」的真正含义 —— 用「两轴比值 == 系数」来钉。
    // ⚠️ 容差要容纳 `popupGrainAlpha` 的 4 位小数舍入（见该函数注释），故用 1e-3 而非 1e-4。
    for (const scheme of SCHEMES) {
      assert.ok(
        Math.abs(popupGrainAlpha(scheme) / GRAIN_ALPHA[scheme] - POPUP_GRAIN_COMPENSATION) < 1e-3,
        `${scheme}: popupGrainAlpha 必须是 GRAIN_ALPHA × ${POPUP_GRAIN_COMPENSATION}（实际比值 ${popupGrainAlpha(scheme) / GRAIN_ALPHA[scheme]}）`,
      )
    }
    // 两轴取值不同是物理原因（screen 加亮 vs multiply 压暗），不是没调好 —— 钉住这个事实。
    assert.notEqual(GRAIN_ALPHA.light, GRAIN_ALPHA.dark, '两轴不该相同（浅色轴需更大的值才有等值质感）')
  })
})

describe('抬升面：交互态（选中 / hover / 按钮面）', () => {
  const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'violet' })

  it('每个态面都应该 发到 token 层，且两个模式都给', () => {
    for (const { token } of STATE_TOKENS) {
      assert.ok(overrides[token], `tokenOverrides 缺少 ${token}`)
      for (const scheme of SCHEMES) assert.ok(overrides[token][scheme].length > 0, `${token}.${scheme}`)
    }
  })

  it('应该 覆盖 owner 指着的那几处（导航选中 / 导航 hover / 模块面板 / 按钮面）', () => {
    const tokens = STATE_TOKENS.map(entry => entry.token)
    for (const token of [
      '--dsw-specific-sidebar-nav-item-active',
      '--dsw-specific-sidebar-nav-item-hover',
      '--dsw-alias-bg-module-platform',
      '--dsw-alias-interactive-bg-hover-solid',
      '--dsw-alias-button-elevated-fill',
    ]) {
      assert.ok(tokens.includes(token), `缺少态面 token ${token}`)
    }
  })

  it('不应该 染语义色（危险 / 品牌主按钮 / 成功错误警告 / 遮罩 / 代码块）', () => {
    const tokens = [...STATE_TOKENS.map(e => e.token), ...WASH_TOKENS.map(e => e.token)]
    for (const token of [
      '--dsw-alias-interactive-bg-hover-danger',
      '--dsw-alias-button-primary-fill',
      '--dsw-alias-button-primary-hover',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-state-success-primary',
      '--dsw-alias-state-warn-primary',
      '--dsw-alias-bg-mask-1',
      '--dsw-alias-markdown-code-block',
    ]) {
      assert.ok(!tokens.includes(token), `${token} 是语义色 / 反色面，不该跟着色调走`)
    }
  })

  it('色阶应该 全部引用官方 static 变量（不是硬编码，也不能引用 alias 形成自引用环）', () => {
    for (const { token, light, dark } of STATE_TOKENS) {
      for (const rung of [light, dark]) {
        assert.match(rung, /^--dsw-static-[a-z0-9-]+$/u, `${token} 的色阶应形如 --dsw-static-neutral-bluish-800`)
      }
    }
    for (const { token } of STATE_TOKENS) {
      assert.ok(overrides[token].light.includes('var(--dsw-static-'), `${token}.light 要引用 static`)
      assert.ok(!/var\(--dsw-alias-/u.test(overrides[token].dark), `${token}.dark 不得引用 alias`)
      // 变量名不能被拼两次（`--dsw-static---dsw-static-…`）—— 这条曾经真的错过
      assert.ok(!overrides[token].light.includes('--dsw-static---dsw-static-'), `${token}.light 前缀重复`)
    }
  })

  it('「官方默认」应该 直通官方色阶，不含 color-mix', () => {
    const identity = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const { token, light, dark } of STATE_TOKENS) {
      assert.equal(identity[token].light, `var(${light})`)
      assert.equal(identity[token].dark, `var(${dark})`)
      assert.ok(!identity[token].light.includes('color-mix'))
    }
  })
})

describe('抬升面：低 alpha 洗染（hover / 按下 / 强调）', () => {
  /** 官方原值快照（`design-platform.css:196-200` 浅 / `:289-293` 深 + `:169` / `:262` 骨架），逐字抄。 */
  const OFFICIAL_WASH = {
    '--dsw-alias-interactive-bg-hover': { light: 'rgba(38, 49, 72, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' },
    '--dsw-alias-interactive-bg-active': { light: 'rgba(38, 49, 72, 0.1)', dark: 'rgba(255, 255, 255, 0.14)' },
    '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(38, 49, 72, 0.14)', dark: 'rgba(255, 255, 255, 0.24)' },
    '--dsw-alias-bg-skeleton': { light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.08)' },
  }
  const alphaOf = color => color.slice(color.lastIndexOf(',') + 1, color.length - 1).trim()
  const channels = color => color.slice(color.indexOf('(') + 1, color.lastIndexOf(',')).split(',').map(Number)

  it('官方原值应该 与调色板快照逐字一致（官方改了这几个数，这里要红）', () => {
    for (const { token, official } of WASH_TOKENS) {
      assert.equal(official.light, OFFICIAL_WASH[token].light, `${token} light`)
      assert.equal(official.dark, OFFICIAL_WASH[token].dark, `${token} dark`)
    }
  })

  it('alpha 必须 一字不动 —— 洗染的强弱全靠它', () => {
    // 这是本组存在的理由：`color-mix` 会连 alpha 一起加权平均
    // （.25×1 + .75×.08 = .31），一层 8% 的 hover 会变成 31%，四个档位全糊在一起。
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'violet' })
    for (const { token, official } of WASH_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.equal(alphaOf(overrides[token][scheme]), alphaOf(official[scheme]), `${token}.${scheme} 的 alpha 被改了`)
      }
    }
    // 交互三档必须仍然彼此可分辨（8% / 14% / 24%）。骨架条不在这一列 —— 它与 hover 同为 8%，
    // 那是有意的（官方就是这个值），拿它来数档位会把这条判据本身弄糊。
    const trio = WASH_TOKENS.filter(entry => entry.token !== '--dsw-alias-bg-skeleton')
    const darks = trio.map(entry => alphaOf(overrides[entry.token].dark))
    assert.equal(new Set(darks).size, 3, `三档 alpha 应互不相同，实测 ${darks.join(' / ')}`)
  })

  it('RGB 应该 真的被本色推动（不是原地不动）', () => {
    const overrides = tokenOverrides({ lightTone: 'official', darkTone: 'violet' })
    const tinted = channels(overrides['--dsw-alias-interactive-bg-hover'].dark)
    const plain = channels(WASH_TOKENS[0].official.dark)
    assert.notDeepEqual(tinted, plain, '深轴 hover 洗染应被紫推走')
    // 白 → 紫：红降、绿降得更多、蓝基本不动（紫的蓝通道本来就高）
    assert.ok(tinted[0] < plain[0] && tinted[1] < plain[1], `实测 ${tinted.join(',')}`)
  })

  it('「官方默认」应该 原样返回官方字面量', () => {
    const identity = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const { token, official } of WASH_TOKENS) {
      assert.equal(identity[token].light, official.light)
      assert.equal(identity[token].dark, official.dark)
    }
  })

  it('washFill 遇到不认识的颜色应该 原样返回（安全默认，不猜）', () => {
    assert.equal(washFill('96, 78, 168', 'dark', 'transparent'), 'transparent')
    assert.equal(washFill('96, 78, 168', 'dark', '#fff'), '#fff')
    assert.equal(washFill('', 'dark', 'rgba(1, 2, 3, 0.5)'), 'rgba(1, 2, 3, 0.5)')
  })

  it('洗染比例应该 比面高一档（低 alpha 上色相读不出来）', () => {
    assert.ok(WASH_TINT.dark > SURFACE_TINT.dark, '深轴洗染要走得更远才看得出色相')
    assert.ok(WASH_TINT.light > SURFACE_TINT.light)
    assert.ok(WASH_TINT.dark < 1 && WASH_TINT.light > 0)
  })
})

describe('抬升面：框内元素（描边 / 分隔线 / 滚动条）', () => {
  /** 官方原值快照（`design-platform.css:172-176` 浅 / `:265-269` 深），逐字抄。 */
  const OFFICIAL_BORDER = {
    '--dsw-alias-border-l1': { light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.06)' },
    '--dsw-alias-border-l2-darkmode-thin': { light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.06)' },
    '--dsw-alias-border-l2': { light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.12)' },
    '--dsw-alias-border-l3': { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.16)' },
    '--dsw-alias-border-l4': { light: 'rgba(0, 0, 0, 0.16)', dark: 'rgba(255, 255, 255, 0.2)' },
  }
  /** 官方绑定快照（`design-platform.css:219-222` 浅 / `:312-315` 深）。 */
  const OFFICIAL_SCROLLBAR = {
    '--dsw-alias-scrollbar-bg-l1': { light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-700' },
    '--dsw-alias-scrollbar-bg-l2': { light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-600' },
    '--dsw-alias-scrollbar-hover-l1': { light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-600' },
    '--dsw-alias-scrollbar-hover-l2': { light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-550' },
  }
  const alphaOf = color => color.slice(color.lastIndexOf(',') + 1, color.length - 1).trim()

  it('官方原值应该 与调色板快照逐字一致', () => {
    for (const { token, official } of BORDER_TOKENS) {
      assert.equal(official.light, OFFICIAL_BORDER[token].light, `${token} light`)
      assert.equal(official.dark, OFFICIAL_BORDER[token].dark, `${token} dark`)
    }
    for (const { token, light, dark } of SCROLLBAR_TOKENS) {
      assert.equal(light, OFFICIAL_SCROLLBAR[token].light, `${token} light`)
      assert.equal(dark, OFFICIAL_SCROLLBAR[token].dark, `${token} dark`)
    }
  })

  it('描边的 alpha 必须 一字不动（与洗染同一个理由）', () => {
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'violet' })
    for (const { token, official } of BORDER_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.equal(alphaOf(overrides[token][scheme]), alphaOf(official[scheme]), `${token}.${scheme}`)
      }
    }
  })

  it('描边应该 被本色推动，且仍然淡到只是一条线', () => {
    const overrides = tokenOverrides({ lightTone: 'official', darkTone: 'violet' })
    assert.notEqual(overrides['--dsw-alias-border-l4'].dark, BORDER_TOKENS.at(-1).official.dark, '深轴最重那条描边应被紫推走')
    for (const { token } of BORDER_TOKENS) {
      assert.ok(Number(alphaOf(overrides[token].dark)) <= 0.2, `${token} 的 alpha 不该被抬高`)
    }
  })

  it('滚动条应该 走实心 color-mix（不是保 alpha 的洗染）', () => {
    const overrides = tokenOverrides({ lightTone: 'blue', darkTone: 'crimson' })
    for (const { token, light, dark } of SCROLLBAR_TOKENS) {
      assert.ok(overrides[token].light.startsWith('color-mix(in srgb'), `${token}.light`)
      assert.ok(overrides[token].light.includes(`var(${light})`), `${token}.light 应引用官方色阶`)
      assert.ok(overrides[token].dark.includes(`var(${dark})`), `${token}.dark 应引用官方色阶`)
    }
  })

  it('「官方默认」应该 两族都原样返回官方值', () => {
    const identity = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const { token, official } of BORDER_TOKENS) {
      assert.equal(identity[token].light, official.light, `${token}.light`)
      assert.equal(identity[token].dark, official.dark, `${token}.dark`)
    }
    for (const { token, light, dark } of SCROLLBAR_TOKENS) {
      assert.equal(identity[token].light, `var(${light})`, `${token}.light`)
      assert.equal(identity[token].dark, `var(${dark})`, `${token}.dark`)
    }
  })
})

/**
 * 取样式表里**某条规则**的文本（选择器 + 声明），供逐条断言。
 *
 * 用 `}` 切块会带上前一条规则的尾巴，故再按 `{` 切一刀只留本条 —— 断言里既有
 * 「必须含某声明」也有「不得含某声明」，边界不清就会误判（本轮就踩过：
 * 菜单族那条被上一条规则的尾部污染）。
 *
 * ⚠️ 同一个选择器可能出现**多条**规则（菜单族就是：兜底一条、换材质一条），
 * 故取**最后一条** —— 同特异度 + 都带 `!important` 时按源码顺序后者胜，
 * 「最后一条」才是真正生效的那条（取第一条会把断言指到已被覆盖的旧规则上）。
 *
 * ⚠️ 匹配必须**选择器全等**，不能用 `includes` —— 分组菜单那条的选择器
 * （`… [role='menu']:has([role='group'])`）**包含**菜单选择器，用 includes 会命中它。
 * @param source - 完整样式表文本。
 * @param selector - 完整选择器（单条，不含逗号）。
 * @returns 最后一条匹配规则的声明部分；找不到返回空串。
 */
function blockFor(source, selector) {
  // ⚠️ 先剥注释：规则前面若紧挨着块注释，切块时会把注释一起算进「选择器」里，
  // 于是全等匹配必然落空（本轮踩过）。
  const clean = source.replace(/\/\*[\s\S]*?\*\//gu, '')
  let found = ''
  for (const chunk of clean.split('}')) {
    const open = chunk.indexOf('{')
    if (open < 0) continue
    if (chunk.slice(0, open).trim() === selector.trim()) found = chunk.slice(open + 1)
  }
  return found
}

/**
 * 取某选择器的**全部**规则体（`blockFor` 只返回最后一条）。
 *
 * ⚠️ 为什么需要：同一选择器可能有多条规则 —— 例如每个出图层的锚点现在有**两条**
 * （一条 `isolation: isolate`、一条 `position: relative`）。
 * 用 `blockFor` 只会拿到最后那条 ⇒ 断言会漏判前一条（本仓库刚踩到）。
 * @param source - 产物 CSS（内部会再剥一次注释）。
 * @param selector - 精确匹配的选择器（含官方默认门的形态）。
 * @returns 匹配到的全部规则体；无匹配则为空数组。
 */
function blocksFor(source, selector) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//gu, '')
  const out = []
  for (const chunk of clean.split('}')) {
    const open = chunk.indexOf('{')
    if (open < 0) continue
    if (chunk.slice(0, open).trim() === selector.trim()) out.push(chunk.slice(open + 1))
  }
  return out
}

/**
 * 取规则体里某个声明的值（已经去掉 `!important`）。
 * @param block - {@link blockFor} 的返回值。
 * @param prop - 属性名。
 * @returns 声明值；缺声明时空串。
 */
function declFor(block, prop) {
  const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`, 'u').exec(block)
  return match === null ? '' : match[1].replace(/!important/u, '').trim()
}

/**
 * 按**顶层**逗号切分 `background-image` / `background-attachment` 这类逐层列表。
 *
 * 必须认括号：`radial-gradient(ellipse 80vw 45vh at 50% -10vh, var(--a, transparent), transparent 62%)`
 * 里全是逗号，朴素 `split(',')` 会把一层切成四五层，于是「值数 == 层数」这条判据当场失真。
 * @param value - 声明值。
 * @returns 逐层的字符串数组（已 trim，去空段）。
 */
function splitLayers(value) {
  const out = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') out.push(current.trim())
  return out
}

/**
 * 官方菜单填充的**当前**字面量（0.1.7-rc.2，真机实测：`#f8f9fa94` / `#43454a73`）。
 *
 * 为什么要在测试里写死一份：本插件的染色以官方原值为基，而基值是从官方样式表**抄下来的快照** ——
 * 抄旧了就会连「官方默认」那一档都发着过期色（0.1.7-rc.1 深色轴曾是 `rgba(48,49,54,.5)`，
 * 本插件真的发过一段时间）。官方升级时按真机 `getComputedStyle(body)` 的
 * `--dsw-menu-surface-fill` 复核这两个值即可。
 */
const OFFICIAL_MENU_FILL = Object.freeze({
  light: 'rgba(248, 249, 250, 0.58)',
  dark: 'rgba(67, 69, 74, 0.45)',
})

describe('抬升面：表面绘制', () => {
  const css = buildSurfaceCss()
  const layers = surfaceLayers()

  it('锚点应该 覆盖菜单族 / listbox / 模态弹窗 / 两个 tree 弹层 / 任务列表 / 提示条，并排除图片灯箱', () => {
    assert.deepEqual([...SURFACE_ANCHORS], [
      "body [role='menu']",
      // ⚠️ trigger-menu 必须收窄排除 `[data-overflow-below]`：那个状态下官方在**同一个**
      // `::after` 上画「下面还有内容」的渐隐提示（`MenuView.tsx` 把两个属性打在同一个元素上），
      // 不收窄就会把官方提示顶掉（2026-09-27 审计，实测提示带 (109,162,229) → (43,43,50)）。
      'body [data-trigger-menu]:not([data-overflow-below])',
      "body :has(> [role='listbox'])",
      "body [role='listbox']:not([data-trigger-menu] *)",
      DIALOG_ANCHOR,
      // 子代理会话弹层：`role='tree'` 在**内层**，外层盒子才画材质 —— 故用 :has 向上找。
      // owner：「subagent 的弹出和 background jobs 的弹出风格得一致」。
      // ⚠️ 这里**只有**一条 tree 锚点：此前的 `body > [role='tree']` 经实测是**死锚点**
      // （官方 portal 层级是 body > div.menu > div.menuBody[role=tree]，role=tree 不在 body 直下，
      //   实测命中 0 个），已于 2026-09-27 删除。
      "body > :has(> [role='tree'])",
      "body [data-slot='conversation.session.header.actions'] ul",
      "body [role='tooltip']:not([data-side])",
      // ⚠️ 2026-09-27 新增两条：**问答卡 / 计划审阅卡**（官方 ui-user-questions）。
      // owner 真机验收时选了「没纹理（颗粒/打光看不到）」。
      // 卡片本体只有 hashed 类名（`<section class="…_card">`）、无 role，
      // 故改用官方的**非哈希数据属性 + 直接子元素**收窄；
      // 底色 token（`--dsw-specific-input-major`）我们早已染过 ⇒ 表现为「颜色对、质感没有」。
      'body [data-question-key] > section',
      'body [data-plan-review-key] > section',
    ])
    // 模态弹窗**不做玻璃**（它是内容面，Apple HIG：Don't put glass on lists/cards/content）
    // ⚠️ 0.1.7 起**菜单族**改用官方半透明 + 模糊材质（见 MENU_MATERIAL_ANCHORS），
    // 所以「表面表整体不许有 backdrop-filter」这条旧口径已不成立 —— 改为**只对内容面**断言。
    assert.ok(
      !blockFor(css, DIALOG_ANCHOR).includes('backdrop-filter'),
      `内容面（对话框）不该有 backdrop-filter：${DIALOG_ANCHOR}`,
    )
  })

  it('模态弹窗（内容面）应该 仍是**实色** —— 玻璃只留给控制层（输入框 / 顶栏）', () => {
    // 一段撤掉的弯路：owner 说「对话框要有液态玻璃」，**我理解成 `[role='dialog']` 模态弹窗**，
    // 于是给它做了玻璃 —— 结果设置 / 云端文件 / 归档三个**内容面**变玻璃（其中两个内容还透出来），
    // 而 owner 真正指的**输入框**一动没动（owner 澄清：「**就是我输入对话的对话框啊**」）。
    // Apple HIG 也支持撤：「Don't put glass on lists, cards, or media content」——
    // 玻璃是给 navigation/control layer 的，不是给内容面的。
    assert.equal(DIALOG_ANCHOR, "body [role='dialog']:not(:has(> img))", '模态弹窗回到普通实色锚点（含灯箱排除）')
    assert.ok(!DIALOG_ANCHOR.includes('aria-modal'), '不再按 aria-modal 分流（两类弹窗都走实色）')
    // 内容面必须**实色**：不得有模糊（这是与菜单族的分界 —— 见下一条用例）
    assert.ok(
      !blockFor(css, DIALOG_ANCHOR).includes('backdrop-filter'),
      '对话框是内容面，不该有 backdrop-filter（模糊只给菜单族）',
    )
    // 玻璃确实做在了控制层：输入框卡片带**沿圆角一圈**的镜面高光（inset 阴影）
    assert.ok(buildGlassCss().includes(`inset ${GLASS_SPECULAR_RING[0].x}px ${GLASS_SPECULAR_RING[0].y}px`), '输入框卡片应带镜面高光')
  })

  it('粘性分组标题：**不透明底 + 卡片那一摞层（颗粒在上）+ 地面**，且不得有模糊', () => {
    // owner **四轮**报这条，四句原话构成全部约束：
    //   ① 「把分类标题的背景色去掉，有点突兀，咱们的和官方的一起处理。」
    //   ② 「透明和模糊和官方默认一样就行。」
    //   ③ 「给修坏了又。又重叠了。**只是把那个背景去掉，不是变成透明的**。」
    //   ④ 「背景条又出来了…那条背景条**要和菜单底色一致**，这样就看不出来有那一条。」
    // ②+③+④ ⇒ 底色必须挡住滚过去的行（不能透明），但合成出来又必须**等于卡片**。
    //
    // 四次走过弯路（都记下来免得再走）：
    // * 官方写法（只刷半透明 `--dsw-specific-menu`）→ 比卡片**多叠一层**，色偏一档 = ①「突兀」；
    // * 刷纯白底（`--dsw-alias-bg-base` 打底、无颗粒）→ 也偏一档，且是**纯色平带** = 同样是①；
    // * 干脆什么都不写 → **行直接透上来** = ③；
    // * 上一版（③与④之间）：**层序写反了** —— `background-image: 填充渐变, 颗粒` 里
    //   **填充压住了颗粒**，而卡片是**颗粒压住填充**；实测浅色轴偏亮 5 级、深色轴偏暗 10 级，
    //   正是 owner ④ 的"背景条又出来了"。
    //
    // 正解 = 把卡片那一摞层**逐层同源**地重画，只把最下面的「页面内容」换成不透明的「地面」：
    //   合成 = [颗粒] 叠在（菜单填充 叠在 [地面：底色 + 三段光 + 颗粒] 上）
    // ⚠️ 锚点用**无守卫**版（GROUPED_MENU_UNGUARDED_SELECTOR）：组合规则的后半段
    //    已经要求 `[role='group']` 存在，`:has()` 是冗余的；而它每次 DOM 变动都要
    //    重匹配 —— 真机消融实测这三条是 12 条 `:has()` 里最贵的（合计约 +2.9s 重算），
    //    去掉后同负载重算 4.443s → 3.633s（0.82×）。等价性见下一条断言。
    const titleSelector = `${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)} ${GROUPED_MENU_TITLE_SELECTOR}`
    const block = blockFor(css, titleSelector)
    assert.notEqual(block, '', '必须为分组标题生成规则 —— 不写就是行透上来（owner ③）')
    // ① 不透明打底：这是"挡住行"的唯一保证，**不得**是半透明色。
    assert.match(
      block,
      /background-color:\s*var\(--dsw-alias-bg-base\)/u,
      '标题要有**不透明**打底（挡住滚过去的行，owner ③）',
    )
    // ② 菜单填充走**图层**（保住官方的半透明 alpha 与色调跟随），不写死颜色；
    //    且必须读**卡片自己那个 token** —— 官方 `.material` 读 `--dsw-menu-surface-fill`，
    //    别名 `--dsw-specific-menu` 是官方 `.groupTitle` 与 codebuddy 菜单读的那个，
    //    两个名字官方同源（`--dsw-specific-menu: var(--dsw-menu-surface-fill)`），
    //    故这里优先取语义更准的那个、留别名兜底；两个名字由 POPUP_TOKENS 一起染（见下一条）。
    assert.ok(
      block.includes('linear-gradient(var(--dsw-menu-surface-fill, var(--dsw-specific-menu))'),
      `菜单填充要作为图层叠在不透明底之上，且读卡片自己的 token：${block.slice(0, 220)}`,
    )
    // ③ 颗粒必须一起重画：否则等于把卡片那片颗粒挖掉，露出"平带"（owner ①）。
    //    强度只引用 GRAIN_TILE_VARIABLE（其值由 GRAIN_ALPHA 唯一派生），不在本表写死。
    assert.ok(
      block.includes(`var(${GRAIN_TILE_VARIABLE}`) || block.includes(GRAIN_TILE_VARIABLE),
      '标题必须重画颗粒 —— 否则比菜单主体少一层质感，就是 owner 说的「突兀」',
    )
    assert.ok(
      !block.includes('/9j/') && !block.includes('feTurbulence') && !/opacity='?\d/u.test(block),
      '颗粒强度不得在标题规则里写字面量（唯一旋钮是 GRAIN_ALPHA，owner：噪点值统一变量）',
    )
    // ④ 不得声明模糊 —— 标题在菜单内部，菜单自己已是 backdrop root，
    //    再声明只会采样子树里滚动的行（实测 31.719/px，比不写更脏）。
    assert.ok(
      !block.includes('backdrop-filter'),
      '标题不得声明 backdrop-filter（会采样到滚动的行，反而更脏）',
    )
    // ⑤ **层序**：颗粒在最上、填充其次、地面在下 —— 与卡片的合成顺序逐层一致。
    //    这条是第四轮那个 bug 的**唯一守卫**：上一版断言的恰恰是反的（"填充在上"）。
    const image = declFor(block, 'background-image')
    const layers = splitLayers(image)
    assert.ok(layers.length >= 3, `标题必须是多层合成（实测 ${layers.length} 层）`)
    assert.ok(layers[0].includes(GRAIN_TILE_VARIABLE), `第一层（最上）必须是颗粒：${layers[0]}`)
    assert.ok(layers[1].startsWith('linear-gradient('), `第二层必须是菜单填充：${layers[1]}`)
    // 地面那几层必须**逐字**来自 grainOverGradients()（颗粒 + 三段光，同源不许手抄）
    assert.ok(
      image.includes(grainOverGradients()),
      '不透明底之上必须原样重画地面（grainOverGradients：颗粒 + 三段光）',
    )
    // ⑥ 逐层 attachment / blend 的**值数必须等于层数**：CSS 在值少于层数时是整串重复，
    //    少写一个就会让第 4、5 层退回 `scroll`、光层被压扁（05-surfaces §8.2 的坑）。
    for (const prop of ['background-attachment', 'background-blend-mode']) {
      const values = splitLayers(declFor(block, prop))
      assert.equal(values.length, layers.length, `${prop} 必须逐层给足（${layers.length} 层）`)
    }
    assert.equal(declFor(block, 'background-attachment'), GROUP_TITLE_ATTACHMENT, '地面那几层必须 fixed')
    assert.ok(
      splitLayers(declFor(block, 'background-attachment')).slice(0, 2).every(v => v === 'scroll'),
      '最上面两层（标题颗粒 / 卡片填充）按元素盒子，与卡片一致',
    )
    // ⑦ 圆角：owner 第五轮「官方原样，但把这个条变成圆角的，**和菜单的圆角一致**」，
    //    第六轮反馈「改成圆角后**确实边缘会漏**」。真机实测确认是几何必然：
    //    标题自己带圆角 ⇒「标题矩形 − 圆角」那块缺口真的没画，而缺口里正好是滚动的行
    //    （悬停底铺满整行宽、行文字从 x=8 起）⇒ 行透出来。漏量随半径增长
    //    （4px→6、6→16、8→30、16(clamp 13)→**70**；方角→**0**）。
    //    ⇒ 圆角改由**滚动容器**承担（容器顶角的裁剪同时作用于标题与行），标题回到方角。
    assert.equal(GROUP_TITLE_RADIUS, '0', '标题必须方角（有圆角就有缺口，缺口就漏行）')
    assert.equal(
      declFor(block, 'border-radius'),
      GROUP_TITLE_RADIUS,
      '标题的圆角必须显式归零 —— 要盖住优先级更低的旧写法（codebuddy 兜底 / 缓存旧 CSS）',
    )
    // 圆角落在滚动容器上。半径**走变量**（不是写死值）—— 该规则的选择器同时命中
    // 官方菜单与 codebuddy 菜单，两个菜单的同心值不同（官方 16−4=12；codebuddy 20−4=16），
    // 写死一个必然让另一个错掉（实测踩过一次）。变量默认给官方菜单的同心值，
    // 菜单所有者可在自己菜单元素上覆盖（自定义属性沿继承树向下传）。
    assert.ok(
      GROUPED_MENU_SCROLLER_RADIUS.includes(GROUPED_MENU_INNER_RADIUS_VARIABLE),
      '容器圆角必须经变量取值 —— 两个菜单的同心值不同，写死会让其中一个错掉',
    )
    assert.ok(
      GROUPED_MENU_SCROLLER_RADIUS.includes('--dsw-radius-md'),
      '变量默认值是官方菜单的同心值（官方 MenuSurface 16 − 内边距 4 = 12 = --dsw-radius-md）',
    )
    assert.match(
      GROUPED_MENU_INNER_RADIUS_VARIABLE,
      /^--dsh-theme-tone-/u,
      '热变量要带插件前缀（明确谁写的、谁能覆盖，也不与官方未来同名变量撞车）',
    )
    assert.ok(
      GROUPED_MENU_SCROLLER_RADIUS.includes('--dsh-scrollbar-width'),
      '容器右上角补一个滚动条宽（否则左圆右方）',
    )
    assert.match(
      GROUPED_MENU_SCROLLER_RADIUS,
      /\)\s+0\s+0$/u,
      '容器只圆上两角 —— 下两角会让滚到底时的最后一行被啃掉',
    )
    const scrollerSelector = `${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)} ${GROUPED_MENU_SCROLLER_SELECTOR}`
    const scrollerBlock = blockFor(css, scrollerSelector)
    assert.notEqual(scrollerBlock, '', '必须为滚动容器生成圆角规则')
    assert.equal(declFor(scrollerBlock, 'border-radius'), GROUPED_MENU_SCROLLER_RADIUS, '容器圆角值')
    // ⚠️ 选择器不得用 `:scope`：它是给 querySelector 用的，在样式表里退化成 `:root`
    //    ⇒ 规则静默失效（本文件反复记录的那类"一条都命不中"的坑）。
    assert.ok(
      !scrollerSelector.includes(':scope'),
      '样式表选择器不得用 :scope（会退化成 :root，规则静默失效）',
    )
    assert.ok(
      GROUPED_MENU_SCROLLER_SELECTOR.startsWith('>'),
      '滚动容器锚点是后代片段，必须以组合符开头（拼在菜单锚点之后才有效）',
    )
    // ⚠️ rc.2 把 `role='menu'` 从菜单**卡片**搬到了内层**滚动容器**上
    //    （官方 `ModelSelect.tsx`：卡片 role={pane==='model'?'group':'menu'}，
    //      `div.groups.scrollable` 自己带 role='menu'）⇒「锚点的直接子」这个关系
    //    整体上移一层，只写 `> :has(...)` 在 rc.2 上**一条也命不中**。
    //    真机实测（同页两种 markup 对照）：rc.2 结构 0 命中 / rc.1 结构 1 命中。
    //    故必须**第二条腿**：滚动容器就是菜单锚点自己时的那条规则。
    const selfScrollerSelector =
      `${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)}${GROUPED_MENU_SELF_SCROLLER_SUFFIX}`
    const selfScrollerBlock = blockFor(css, selfScrollerSelector)
    assert.notEqual(
      selfScrollerBlock, '',
      '必须为「滚动容器就是菜单锚点自己」（rc.2 官方结构）生成圆角规则 —— 否则内圈圆角在 rc.2 上静默失效',
    )
    assert.equal(
      declFor(selfScrollerBlock, 'border-radius'), GROUPED_MENU_SCROLLER_RADIUS,
      'rc.2 那条腿必须与 rc.1 那条腿共用同一份半径配方',
    )
    // 两条腿必须**各是一条独立规则**：相对选择器（以 `>` 开头）在 `:is()` 里按规范非法，
    // 浏览器不报错、也不整条丢弃 —— 实测 `:is(:has(x), > :has(x))` 被判成 `:is(:has(x))`，
    // 相对那一支被**静默删掉**。合并会直接把 rc.2 那一半再弄丢。
    assert.ok(
      !GROUPED_MENU_SELF_SCROLLER_SUFFIX.includes(':is('),
      'rc.2 那条腿不得写进 :is() —— 相对选择器在 :is() 里会被静默删除',
    )
    assert.ok(
      !GROUPED_MENU_SCROLLER_SELECTOR.includes(':is('),
      'rc.1 那条腿同样不得写进 :is()',
    )
    // 两条腿的意图必须可区分：一条以组合符开头（锚点的直接子），一条不以（锚点自己）。
    assert.ok(
      GROUPED_MENU_SELF_SCROLLER_SUFFIX.startsWith(':has('),
      'rc.2 那条腿必须是「锚点自己」形态（不带组合符，直接贴在菜单锚点后）',
    )
    assert.notEqual(
      `${GROUPED_MENU_UNGUARDED_SELECTOR} ${GROUPED_MENU_SCROLLER_SELECTOR}`,
      `${GROUPED_MENU_UNGUARDED_SELECTOR}${GROUPED_MENU_SELF_SCROLLER_SUFFIX}`,
      '两条腿必须产出不同的选择器（否则其中一条是死规则）',
    )
    // ⑧ 地面颗粒的混合模式跟着轴走（地面深色轴 screen / 浅色轴 multiply）：
    //    第二条规则只改 background-blend-mode，其余声明继续由第一条承担（配方只有一份）。
    const darkTitleSelector = `${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\b/u, `body[data-ds-dark-theme]:not([${PLAIN_ATTR}])`)} ${GROUPED_MENU_TITLE_SELECTOR}`
    const darkBlock = blockFor(css, darkTitleSelector)
    assert.notEqual(darkBlock, '', '深色轴必须有一条只改混合模式的规则')
    assert.match(darkBlock, /background-blend-mode:\s*[^;]*screen/u, '深色轴地面颗粒走 screen（与背景层一致）')
    assert.match(block, /background-blend-mode:\s*[^;]*multiply/u, '浅色轴地面颗粒走 multiply（与背景层一致）')
    assert.ok(
      !darkBlock.includes('background-color') && !darkBlock.includes('background-image') && !darkBlock.includes('border-radius'),
      '第二条规则只改混合模式 —— 避免两处各写一份配方（改一处漏一处）',
    )
  })

  it('⛔ 分组标题的合成必须逐层等于卡片（层序 + 地面同源 + 两个 token 不分叉）', () => {
    // 把"看起来像一条带"的**成因**钉死成三条纯逻辑判据，免得再靠肉眼回归：
    //   1. 层序：颗粒在填充之上（第四轮就是反的）；
    //   2. 地面：不透明底之上必须重画地面，否则卡片透出来的光与颗粒在标题上丢了；
    //   3. token 不分叉：标题读的填充 token 与卡片读的 token 必须**同值**
    //      （官方 `.material` 读 `--dsw-menu-surface-fill`，`.groupTitle` / codebuddy 菜单读
    //      `--dsw-specific-menu`，官方两者同源 —— 只染一个就分叉成色差带）。
    const layers = splitLayers(groupTitleLayers())
    assert.ok(layers[0].includes(GRAIN_TILE_VARIABLE), '层序：颗粒在最上')
    assert.ok(layers[1].includes('linear-gradient('), '层序：填充在颗粒之下')
    // 地面那几层 = 函数返回串的后半段，**逐字**等于 grainOverGradients()（只差排版空白）
    const ground = layers.slice(2).join(', ').replace(/\s+/gu, ' ')
    assert.equal(
      ground,
      grainOverGradients().replace(/\s+/gu, ' '),
      '层序：地面在最下，且必须原样重画（grainOverGradients：颗粒 + 三段光）',
    )
    // 两个 token 都要在覆盖层里，且**每个轴上取值必须完全相同**。
    assert.deepEqual(
      POPUP_TOKENS.map(entry => entry.token),
      ['--dsw-menu-surface-fill', '--dsw-specific-menu'],
      '菜单填充的两个名字都要染',
    )
    for (const settings of [
      { lightTone: 'official', darkTone: 'official' },
      { lightTone: 'blue', darkTone: 'crimson' },
      { lightTone: 'sakura', darkTone: 'forest' },
    ]) {
      const overrides = tokenOverrides(settings)
      for (const scheme of SCHEMES) {
        assert.equal(
          overrides['--dsw-menu-surface-fill'][scheme],
          overrides['--dsw-specific-menu'][scheme],
          `${scheme}：两个填充 token 必须同值（否则标题与卡片各读一个 → 色差带）`,
        )
      }
      if (settings.lightTone === 'official') {
        assert.equal(overrides['--dsw-menu-surface-fill'].light, OFFICIAL_MENU_FILL.light, '浅色轴官方档直通')
        assert.equal(overrides['--dsw-menu-surface-fill'].dark, OFFICIAL_MENU_FILL.dark, '深色轴官方档直通')
      }
    }
  })

  it('⛔ 菜单族材质必须**完全交回官方** —— 我们不声明填充与模糊', () => {
    // owner 最终口径：「透明和模糊**和官方默认一样**就行」。
    //
    // 这条测试是第三次修订，前两版都对应一段走过的弯路（记下来免得再走）：
    // ① 原版断言「每个菜单族锚点都必须刷 background-color + backdrop-filter」——
    //    官方 0.1.7 **已经画好了**，于是我们在官方画过的地方又画一遍：
    //    官方画在 `::before` 上的（`SubagentCatalogAction` 的 `.…_menu:before`）
    //    会**叠两次同色**（0.5 → 等效 0.75）—— owner 复验「子代理卡片好像没有透明模糊吧？」；
    // ② 中间还试过刷成不透明面板色 —— 那就把官方的玻璃整块盖掉了。
    //
    // 正确形态：本表**一个材质声明都不写**，官方的半透明与模糊原样生效。
    //
    // ⚠️ **2026-09-27（M2）改判据**：此前断言「每条锚点都有一条**元素级**质感规则」。
    // 单载体收口后元素级那条已删（它是双层的另一半，且在没有材质子元素的组件上造成双倍），
    // 故判据改为「每条锚点**恰好有一个载体**」，不再要求是元素级。
    for (const anchor of SURFACE_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      const carriers = [
        blockFor(css, gated),
        blockFor(css, `${gated}::after`),
        blockFor(css, `${gated}::before`),
      ].filter(b => b.includes('background-image:'))
      assert.equal(carriers.length, 1, `每条锚点应**恰好一个**质感载体（M2 单载体）：${anchor}`)
      const block = carriers[0]
      assert.ok(
        !block.includes('background-color'),
        `不得声明填充 —— 官方自己的半透明材质要能原样透上来：${anchor}`,
      )
      assert.ok(
        !block.includes('backdrop-filter'),
        `不得声明模糊 —— 官方自己成对画好了，再画一遍会让半透明叠两次：${anchor}`,
      )
    }
    // 这两个官方变量**我们一个字都不声明**（常量本身也已从实现里删掉）——
    // 官方材质由官方自己声明；我们只在 token 层染色（`POPUP_TOKENS`）。
    //
    // ⚠️ 判据是**声明**（`--x:`）而不是**出现**：分组标题那条规则里**引用**
    // `var(--dsw-specific-menu)` 是正当的（那是"跟随色调"的唯一办法，见
    // buildSurfaceCss 里标题规则的注释）—— 被禁的是我们**自己给它赋值**。
    const decls = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.ok(
      !/--dsw-specific-menu\s*:/u.test(decls),
      '生成的 CSS 里不得**声明**官方的菜单填充变量（引用 var() 是允许的）',
    )
    assert.ok(
      !/--dsw-menu-backdrop-filter\s*:/u.test(decls),
      '生成的 CSS 里不得**声明**官方的菜单模糊变量（引用 var() 是允许的）',
    )
  })

  it('带分组标题的菜单应该 与普通菜单**同一配方**（不再有「去顶光」特例）', () => {
    // owner 前后几条反馈把这件事推到了正解：
    // ①「模型选择器里面两个分类标题的背景，也得处理下。」
    // ②（我第一版把整个菜单排除出图层之后）「模型选择列表那个框……是纯色的。」
    // ③「模型选择列表，子代理列表，后台任务列表……和别的元素不是一个档位」
    //
    // ⚠️ **2026-09-27（M3）改判**：此前这里断言「分组菜单必须有一条**去顶光**的专用规则」。
    // 那个办法**从未真正对齐过份数**，反而制造了最刺眼的不齐：
    //
    //   | 载体 | 命中规则 | 层数 |
    //   | :--- | :--- | :--- |
    //   | 元素级 | 专用规则（特异度更高） | 2（颗粒 + 底光） |
    //   | ::after | **通用** [role='menu'] 那条 | 4（颗粒 + 三道光） |
    //
    // ⇒ 颗粒 2 份、底光 2 份，顶光/左光各 1 份。**而且通用那条 ::after 一直带着顶光**，
    // 所以「元素级去顶光」根本消除不了横带 —— 它只是让元素级那份少一道光。
    //
    // 现在：专用规则**整条删除**，分组菜单由通用 [role='menu']::after 承担，
    // 与普通菜单**逐层相同**。横带的正解在粘性标题自己那一条（groupTitleLayers）。
    assert.ok(
      !css.includes(`${GROUPED_MENU_SELECTOR} {`) && !css.includes(`${GROUPED_MENU_SELECTOR}::after {`),
      'M3：分组菜单不得再有专用图层规则 —— 它会与通用 [role=menu]::after 叠成双层、份数不齐',
    )
    // 通用菜单锚点仍必须全量收录（排除 = 纯色），分组菜单靠它拿到与普通菜单相同的配方。
    const menu = SURFACE_ANCHORS.find(a => a.includes("[role='menu']"))
    assert.equal(menu, "body [role='menu']", '菜单族必须全量收录（排除 = 纯色）')
    // 而这条通用规则的配方必须是**完整 4 层**（含顶光）—— 分组菜单因此也有顶光。
    const menuBody = blockFor(css, `${menu.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)}::after`)
    assert.ok(menuBody.includes(surfaceLayers()), '通用菜单 ::after 必须画完整 4 层配方')
    assert.ok(menuBody.includes(TOP_VARIABLE), '含顶光（分组菜单也走这条 ⇒ 三道光齐备）')
    assert.ok(menuBody.includes(LEFT_VARIABLE), '含左光')

    // 标题条本身：**本插件一个声明都不写**（见上面那条用例的完整说明）。
    const titleSelector = `${GROUPED_MENU_SELECTOR} ${GROUPED_MENU_TITLE_SELECTOR}`
    assert.equal(blockFor(css, titleSelector), '', '标题必须完全交回官方默认')
    // 结构锚点，不碰 hashed 类名（codebuddy 那个类还是非哈希的 ccb-model-groupTitle）
    assert.ok(GROUPED_MENU_TITLE_SELECTOR.includes("role='group'"), '标题用 role=group 的结构锚定')
    assert.ok(!/class\*?=/.test(GROUPED_MENU_TITLE_SELECTOR), '不得用类名匹配标题')

    // ⛔ rc.2 回归守卫：官方 0.2.0-rc.2 把分组菜单抽成 MenuGroup 原语，它在标题**前面**
    // 插了一个 1×1 隐形哨兵 `<span data-menu-group-start>`（供 observeStickyMenuGroups
    // 观测吸顶）⇒ 标题不再是 `:first-child`。只写 `:first-child` 会命中那个哨兵，
    // 真标题拿不到图层，官方吸顶填充（--dsw-alias-menu-group-header-fill，94% 不透明）
    // 就压在我们染过色的菜单上 —— 正是这条规则当初要治的「横带」。
    assert.ok(
      GROUPED_MENU_TITLE_SELECTOR.includes('[data-menu-group-heading]'),
      '必须同时锚 0.2.0-rc.2 MenuGroup 的公开属性 data-menu-group-heading',
    )

    // ⛔ 本常量是**后代片段**，由 groupTitleRule 拼在菜单锚点之后。若写成**顶层**逗号列表，
    // 拼接处会把整条规则切开：后半段丢掉 body 前缀与色调门，静默生效到全站。
    // （`:is()` 内部的逗号是嵌套的、不切分外层，故只查括号外的逗号。）
    const topLevelComma = (selector) => {
      let depth = 0
      for (const ch of selector) {
        if (ch === '(') depth += 1
        else if (ch === ')') depth -= 1
        else if (ch === ',' && depth === 0) return true
      }
      return false
    }
    assert.ok(
      !topLevelComma(GROUPED_MENU_TITLE_SELECTOR),
      'GROUPED_MENU_TITLE_SELECTOR 必须是单个复合选择器（顶层逗号会切断后代拼接）',
    )
  })

  it('血缘树应该 用 `body >` 收窄（官方有四处 role=tree，只有子代理那个是 portal）', () => {
    // owner 反馈「后台任务和子代理的弹出是不是没适配样式」。子代理血缘弹层是
    // createPortal 直挂 body 的 `role='tree'`；但官方 JsonTree / WorkspaceBrowser 会话树 /
    // TrajectoryTable **也用** role='tree'，它们是内联组件 —— 无条件命中会把面板背景
    // 换成不透明填充 + 光 + 颗粒。`body >` 只留 portal 出来的那一个。
    const tree = SURFACE_ANCHORS.find(a => a.includes("[role='tree']"))
    assert.ok(tree !== undefined, '必须有 tree 锚点')
    assert.ok(tree.startsWith('body > '), `tree 必须收窄成 body 直接子元素：${tree}`)
  })

  it('轮次预览卡应该 用 `:not([data-side])` 把 Tooltip 气泡排除在外', () => {
    // ⚠️ 回归守卫：这条锚点**曾经写成 `body > [role='tooltip']`**，注释还写着
    // 「Tooltip / TurnNavigator 的预览，**均 portal 到 body**」—— **那句话是错的**，两个都不 portal：
    //   * ui-primitives/Tooltip → position: fixed，源码注释明写 escape … without a portal
    //   * TurnNavigator 的预览   → position: absolute，长在 <nav> 里
    // 于是 `body >` 把两个一起漏掉，那条规则**一条都命不中**（死规则），
    // owner 看到的「官方对话当行 hover 出的框也没有适配样式」就是它。
    const tip = SURFACE_ANCHORS.find(a => a.includes("[role='tooltip']"))
    assert.ok(tip !== undefined, '必须有 tooltip 锚点')
    assert.ok(!tip.startsWith('body > '), `不得再用 body > 收窄（两个生产者都不 portal）：${tip}`)
    assert.equal(tip, "body [role='tooltip']:not([data-side])")
    // 排除 Tooltip 气泡是**有意**的：它的底色走 --dsw-alias-tooltip-bg，两轴都是反色
    // （见 tones.ts「不染的几处（有意）」）—— 糊上夜色面板会把它读成一个小菜单。
    // data-side 是可靠的判据：官方 CSS 就靠它做翻转 transform（Tooltip.module.css:22-32）。
    assert.ok(tip.includes(':not([data-side])'), '要排除带 data-side 的 Tooltip 气泡')
  })

  it('后台任务列表应该 用官方槽位锚定（那个 `<ul>` 没有 role）', () => {
    // 全表唯一没有 role 的锚点：官方 <ul> 只有 aria-label（本地化文案，不能当选择器），
    // token 里也没有对应图层 → 以前只拿到颜色、拿不到质感。
    const jobs = SURFACE_ANCHORS.find(a => a.includes('data-slot='))
    assert.ok(jobs !== undefined, '必须有槽位锚点')
    assert.ok(jobs.includes("conversation.session.header.actions"), `应锚在官方槽位上：${jobs}`)
    assert.ok(jobs.endsWith(' ul'), `应收窄到那个 ul：${jobs}`)
  })

  it('⛔ 自身是滚动容器的锚点（后台任务列表）必须用**元素级**图层，不能用 ::after', () => {
    // 回归守卫（owner 2026-09-29 报「后台任务列表任务多到出滚动条后，滚出来的部分没适配」）：
    // ::after 是 "position: absolute; inset: 0"，**在内容流里** ⇒ 元素自己会滚时
    // 伪元素随内容滚走（实测：把层刷纯红，scrollTop=0 覆盖 95.6%、滚到底 **0.0%**）。
    // 元素级 background-image 的背景默认 "background-attachment: scroll"，
    // 对滚动容器含义是「钉在元素自己的盒子上」⇒ 实测滚到底覆盖 **99.2%**。
    const jobs = SURFACE_ANCHORS.find(a => a.includes('data-slot='))
    assert.ok(jobs !== undefined, '必须有槽位锚点')

    // ① 登记在「自身滚动」表里，且 usesAfterLayer 对它返回 false
    assert.deepEqual([...OWN_BACKGROUND_ANCHORS], [jobs], '后台任务列表必须在 OWN_BACKGROUND_ANCHORS 里')
    assert.equal(usesOwnBackground(jobs), true, '应判定为「用元素级」')
    assert.equal(usesAfterLayer(jobs), false, '不得再给它叠 ::after（M2 的单载体纪律）')

    // ② 产出里：该锚点有一条**元素级** background-image 规则（带门写法与实现同源）
    const gated = jobs.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
    assert.ok(css.includes(`${gated} {`), `应有一条元素级规则：${gated} {`)
    const at = css.indexOf(`${gated} {`)
    const body = css.slice(at, css.indexOf('}', at))
    assert.ok(body.includes('background-image:'), '元素级那条必须画 background-image')

    // ③ 产出里：**不得**再有该锚点的 ::after 规则（只换不加，避免同一个面画两遍）
    assert.ok(!css.includes(`${gated}::after`), '不得同时保留 ::after（会画两遍）')
  })

  it('灯箱排除条件应该 用 `> img`，不能用 `> [aria-hidden]`（会误伤 token 消耗弹层）', () => {
    // 回归守卫：最初写成 `:not(:has(> [aria-hidden='true']))`，理由是灯箱遮罩是它的直接子元素。
    // 但 `StatsPills` / `TurnUsagePanel`（owner 说的「token 消耗那些」）的 `.panel` 里也有一个
    // `<div className={titleRule} aria-hidden>` 当直接子元素（标题下那条分隔线）
    // → **被一起排除**，表现为「对话框下面那三个胶囊没改」。
    // 灯箱真正的唯一特征是整屏的 `<img>`；`aria-hidden` 太常见，不能当判据。
    const dialog = DIALOG_ANCHOR
    assert.ok(dialog.includes(':not(:has(> img))'), '应当用 `> img` 排除灯箱')
    assert.ok(!dialog.includes('aria-hidden'), '不得用 aria-hidden 当判据（会误伤带分隔线的弹层）')
  })

  it('悬停卡应该 面与字**一起**掰回主题，且**两个档都修**（四条不带官方默认门的规则之一）', () => {
    // 官方把这张卡的**面和字都写死了**：面 `#2C2C2E`（`HoverCard.module.css:13-21`，注释
    // `light/dark identical`），字 `#FFFFFF`/`#CFD3D6`/`#ADB2B8`（`Rows.module.css:301-335`，
    // 注释 `dark surface, fixed colors both themes`）。只染面 → 浅卡配浅字 = 白底白字。
    // owner 定案：跟随主题，且「先把官方默认修了，然后再适配咱们的」。
    //
    // ① 不在通用锚点表里（那条带官方默认门，且不会改字色）
    assert.ok(
      !SURFACE_ANCHORS.some(a => a.includes("[role='button']")),
      '悬停卡不该留在通用锚点表里',
    )
    // ② 用 `body >` 收窄：菜单项也有 role='button'，但都在浮层内部，不是 body 的直接子元素
    assert.equal(HOVER_CARD_ANCHOR, "body > [role='button']", '必须用子选择器，不能放宽成后代')

    // ③ **不带官方默认门** —— owner 明确要求两个档都修，这是全插件四条刻意动官方默认外观的规则之一
    //    （另三条：`src/mask.ts` 弹窗遮罩虚化、`src/handle-glow.ts` 拖拽条光带、`src/popover.ts` 顶栏弹出层；
    //    计数口径以 `docs/private-seams.md` §B 为准）。
    //    判据看**选择器**（注释里会出现这个词当说明，所以只查拼接出来的那条选择器）。
    assert.ok(
      !css.includes(`body:not([${PLAIN_ATTR}]) > [role='button']`),
      '悬停卡选择器不该带官方默认门（两个档都要修）',
    )
    assert.ok(css.includes(`${HOVER_CARD_ANCHOR} {`), '应有一条直接以悬停卡锚点开头的规则')
    // ⚠️ 断言必须落在**这条规则体**里（剥注释）：全表 `css.includes(...)` 会被别处的巧合喂饱 ——
    //    「底色交回官方」之后，这条是**唯一**还写 `var(PANEL_VARIABLE)` 的地方。
    //    悬停卡不在 SURFACE_ANCHORS 里，所以那次收口没动它：官方给它的面是组件内**硬编码字面量**
    //    （恒深灰、两轴同值），不染就与我们的弹层材质割裂 —— owner 定案「先把官方默认修了」。
    const hoverBody = blockFor(css, HOVER_CARD_ANCHOR)
    assert.ok(
      hoverBody.includes(`background-color: var(${PANEL_VARIABLE}, var(--dsw-alias-bg-layer-3)) !important`),
      '面应取面板变量，并带官方 layer-3 兜底（token 层未就绪时不能变全透明）',
    )

    // ④ 字色必须**逐条**覆盖，且用主题感知的官方 label token
    for (const { suffix, token } of HOVER_CARD_TEXT_TOKENS) {
      const selector = `${HOVER_CARD_ANCHOR} [class*='${suffix}']`
      assert.ok(css.includes(selector), `缺少字色规则：${selector}`)
      assert.ok(css.includes(`color: var(${token}) !important`), `${suffix} 应换成 ${token}`)
      assert.match(token, /^--dsw-alias-label-/u, `${token} 应是官方 label token（主题感知）`)
    }
    // 层次不能压平：标题 / 正文 / 状态至少用到两档不同的 token
    const tokens = new Set(HOVER_CARD_TEXT_TOKENS.map(e => e.token))
    assert.ok(tokens.size >= 2, '四级文字不该全部压成同一个色（会丢掉官方的层次）')
  })

  it('字色覆盖应该 只按**稳定后缀**匹配，不写完整哈希类名', () => {
    // 官方类名形如 `Sixlwa_hoverTitle`（哈希每次构建都变）—— 仓库规矩禁止写哈希类名。
    // 后缀 `_hoverTitle` 是稳定的那一半，owner 已确认走这条路。
    for (const { suffix } of HOVER_CARD_TEXT_TOKENS) {
      assert.match(suffix, /^_[a-zA-Z]+$/u, `${suffix} 应是「下划线 + 原始类名」的稳定后缀`)
    }
  })

  it('listbox 锚点应该 排除 @ 菜单内部的视口（那一层已经被 data-trigger-menu 画过了）', () => {
    const listbox = SURFACE_ANCHORS.find(anchor => anchor.startsWith("body [role='listbox']"))
    assert.ok(listbox.includes(':not([data-trigger-menu] *)'), '不排除就会在同一处叠两层渐变')
  })

  it('输入框上方三张停靠卡应该 各自有一条图层规则（此前只有 token 的颜色 = 纯色）', () => {
    // owner：「**输入框上面那个区域也没适配**，刚才我记得让改了，但是没改。」
    // 根因：三张卡与菜单族共享 token（--dsw-specific-tip），而 token 层**只给颜色**、
    // 图形必须靠选择器 —— 它们既非 menu 也非 dialog，此前一条选择器都没命中。
    assert.deepEqual([...COMPOSER_CARD_ANCHORS], [
      'body [data-queue-dock] > :first-child',
      'body [data-goal-bar] > :first-child',
      "body [data-testid='todo-panel']",
    ])
    for (const anchor of COMPOSER_CARD_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      // ⚠️ 2026-09-27（M2）：单载体 —— 元素级那条已删，载体可能是 ::after 或官方 ::before。
      const carriers = [
        blockFor(css, gated),
        blockFor(css, `${gated}::after`),
        blockFor(css, `${gated}::before`),
      ].filter(b => b.includes('background-image:'))
      assert.equal(carriers.length, 1, `${anchor} 应**恰好一个**质感载体（M2 单载体）`)
      const body = carriers[0]
      // ⚠️ 2026-09-20：这里**不许**再写 background-color。
      // 曾经写 `background-color: var(<面板变量>) !important` —— 那时浅色轴面板比例 .07、
      // 与卡自己的 `--dsw-specific-tip` 观感接近，看不出问题。等抬升面收到 `0`
      // （面板变量浅色轴 = 纯白 #fff）后，这条 !important 把三张卡的面**盖成纯白**，
      // token 层的内嵌面染色完全失效（owner：「goal、todo、排队对话好像都没改」）。
      // 正解：**底色交给 token 层**（05-surfaces §4.0.2 的内嵌面通道），本表只补颗粒 + 光。
      assert.ok(
        !/background-color/u.test(body),
        `${anchor} 不得写 background-color —— 写死面板变量会盖掉 --dsw-specific-tip 的染色`,
      )
      assert.ok(body.includes(surfaceLayers()), `${anchor} 要画**完整 4 层**配方（M3 起与菜单/对话框同一配方）`)
      // ⚠️ 2026-09-27（M3）：此前断言用的是 menuSurfaceLayers()（只有颗粒 + 底光）。
      // owner 报「todo 列表我刚发现没有打光了」—— 根因就是这几张卡拿的是**另一份配方**。
      // 现在统一 surfaceLayers()（颗粒 + 顶/底/左三道光），故这里钉死不含旧配方。
      assert.ok(!body.includes(menuSurfaceLayers()), `${anchor} 不得再用 2 层的旧配方（会缺顶光与左光）`)
      assert.ok(body.includes(TOP_VARIABLE), `${anchor} 必须有顶光（owner 报过「todo 没有打光」）`)
      assert.ok(body.includes(LEFT_VARIABLE), `${anchor} 必须有左光`)
      assert.ok(!body.includes('backdrop-filter'), `${anchor} 是内容面，不做玻璃`)
    }
  })

  it('停靠卡必须画在**带底色的那一层**（wrapper 上会露出四个直角）', () => {
    // 三张卡都是「外层 wrapper + 内层自己带底色的面」：QueueDock 的底色在 `.panel`
    // （圆角 12px 12px 0 0）、GoalBar 在 `.bar`（圆角 12px）、TodoPanel 在根 `<section>` 自己。
    // wrapper 是整列的方框、没有圆角 —— 画在它上面会在圆角外露出直角。
    const queue = COMPOSER_CARD_ANCHORS.find(a => a.includes('data-queue-dock'))
    const goal = COMPOSER_CARD_ANCHORS.find(a => a.includes('data-goal-bar'))
    assert.ok(queue.endsWith('> :first-child'), 'QueueDock 要画在 .panel（wrapper 的第一个子元素）上')
    assert.ok(goal.endsWith('> :first-child'), 'GoalBar 要画在 .bar 上')
    // TodoPanel 的根元素自己就带底色与圆角，直接锚它，不要加 > :first-child
    const todo = COMPOSER_CARD_ANCHORS.find(a => a.includes('todo-panel'))
    assert.ok(!todo.includes('>'), 'TodoPanel 的底色在根元素上')
    // 不得用 hashed 类名（本插件红线）
    for (const anchor of COMPOSER_CARD_ANCHORS) {
      assert.ok(!/class[*^$|~]?=/u.test(anchor), `不得用类名匹配：${anchor}`)
    }
  })

  it('停靠卡必须**去掉顶光** —— 它们很矮，顶光会造出一道与主体对不上的亮带', () => {
    // GoalBar 只有 36px 高，而顶光锚在盒子顶部（ellipse 120% 42% at 50% -12%）——
    // 与「分组标题横带」是同一个坑（见 GROUPED_MENU_SELECTOR 的表）。
    const layers = menuSurfaceLayers()
    assert.ok(!layers.includes(TOP_VARIABLE), '停靠卡用的图层串里不得有顶光')
    assert.ok(layers.includes(GRAIN_TILE_VARIABLE), '颗粒要留（质感来源）')
    assert.ok(layers.includes(POPUP_BOTTOM_SHAPE), '底光要留（锚盒子底部，纵深来源）')
  })

  it('停靠卡的几何**一个都不许改** —— 官方对三张卡的处理本来就不一样', () => {
    // owner 连问两次：「官方默认样式为啥有缝了？是咱们改的么？」
    //              「还是说，信息队列，todo，还有 goal，官方处理方式不一样？」
    // 两条都对。官方产物逐条查证（dsh-client-ui-conversation / -goal 的 client.js）：
    //   QueueDock ._dock   margin:0 auto calc(0px - stack-gap - 3px) + panel radius 12px 12px 0 0
    //                      → 收间距 + 压进 3px + 下两角直角 = 贴住输入框
    //   TodoPanel .root    margin:0 auto + radius 12px        → 保留 6px 间距（四角圆）
    //   GoalBar   .dock/.bar margin:0 auto + radius 12px      → 保留 6px 间距（四角圆）
    // 6px 缝来自官方 .composerStack{gap:var(--dsh-composer-stack-gap)}，真机官方档量到
    // todo-panel→composer 6.0px。官方之所以看着没缝，是 .composerSeat 那条**不透明背衬**
    // （transparent 0px → bg-base 36px）把它糊住了；本插件关掉了那条背衬，缝才露出来。
    //
    // 所以本插件**不得**改这三张卡的外边距 / 圆角 —— 那是把 QueueDock 的做法错误地
    // 推广到 todo / goal。此前两版（收间距、打直底角）正是这么错的，已整条撤回。
    //
    // ## 2026-09-18 复核：又试了一次「全接上 + 用颜色分语义」，仍然要退回
    // owner 提过「改颜色来区分语义」，据此把三张卡全接上走了一遍；真机复核时 owner 判断
    // 「这么连上感觉确实不对了，尤其是 todo，goal，还有对话排队共存的时候，都连在一起，
    // **表达的意思一下就变了**」。
    // **根因：颜色与间距干的是两件事** —— 颜色标记**单个东西的身份**，间距标记**分组边界**。
    // 三张全接上后中间没有断点，颜色只能说「这是暗金的」，说不出「从这里起不再是提示信息」。
    // **分组边界只有几何能表达**，所以这条守卫留着，且颜色也不加。
    for (const anchor of COMPOSER_CARD_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      const at = css.indexOf(gated)
      if (at < 0) continue
      const block = css.slice(at, css.indexOf('}', at))
      assert.ok(!/margin/u.test(block), `${anchor} 不得改外边距（会把官方 6px 缝收掉）`)
      // 圆角只允许**继承**（`border-radius: inherit`）——那是把官方自己的圆角
      // 原样透给覆盖用的伪元素，几何分毫未动（伪元素是 absolute; inset:0，圆角不 inherit
      // 就会在四角露出直角，反倒成了「改了观感」）。具体数值（12px / 0 0 / 变量）一律禁止。
      const radiusDecls = [...block.matchAll(/border[a-z-]*radius\s*:\s*([^;}]+)/gu)].map(m => m[1].trim())
      for (const value of radiusDecls) {
        assert.equal(value, 'inherit', `${anchor} 不得改圆角（官方三张卡本就不一致）；只允许 inherit，实际是 ${value}`)
      }
    }
    // 整张表里都不许出现针对停靠卡的 margin / radius 规则
    assert.ok(
      !/margin-bottom:\s*calc\(0px - var\(--dsh-composer-stack-gap\)\)/u.test(css),
      '不得收停靠卡的栈间距（那是 QueueDock 专属做法，官方只对它自己做）',
    )
    // 这里同样只禁**具体数值**，放行 `inherit`（见上）。
    // ⚠️ 不用带负向先行断言的正则：`radius\s*:\s*(?!inherit)` 里的 `\s*` 会回溯成空、
    // 于是先行断言看到的是空格而不是 `inherit`，正则**永远命中**（这个坑我自己踩过一次）。
    // 改成显式取值判定，意图也更清楚。
    for (const [label, anchor] of [['待办卡', "[data-testid='todo-panel']"], ['目标卡', '[data-goal-bar]']]) {
      for (const match of css.matchAll(new RegExp(`${anchor.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}[^{]*\\{([^}]*)\\}`, 'gu'))) {
        for (const decl of match[1].matchAll(/border[a-z-]*radius\s*:\s*([^;}]+)/gu)) {
          assert.equal(decl[1].trim(), 'inherit', `${label} 不得改圆角；只允许 inherit，实际是 ${decl[1].trim()}`)
        }
      }
    }
    // 也不得给它们加顶角规则（兄弟选择器那套一并撤回）
    assert.ok(
      !/\[data-slot='conversation\.input\.dock'\][^{]*~/u.test(css),
      '不得用兄弟选择器给停靠卡排圆角',
    )
  })


  it('⛔ 分组菜单的**组合**规则不得用带 :has() 的守卫锚点（性能，且冗余）', () => {
    // 背景（owner：「咱们主题明显比官方的卡」）：真机消融实测（同 DOM、同色调档，
    // 只 styleEl.disabled 切换）—— 151 条规则里 12 条 :has() 吃掉约 62% 的样式重算；
    // 151 条**平凡**规则 ≈ 空表 ⇒ **条数无关**。逐条定位后最贵的三条里两条是
    // 「菜单守卫 + 后代锚点」这种**重复守卫**（+1.38s / +1.53s）。
    // 去掉后：重算 4.443s → 3.633s（0.82×），且命中集合逐个 isSameNode 完全一致。
    //
    // 本用例把这条**钉死**：组合规则（标题 / 滚动容器）一旦被改回带 `:has()` 的锚点，
    // 性能就悄悄退回去 —— 而外观毫无变化，没有任何视觉回归能发现它。
    const css = buildSurfaceCss()
    const composed = [
      `${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)} ${GROUPED_MENU_TITLE_SELECTOR}`,
      `${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)} ${GROUPED_MENU_SCROLLER_SELECTOR}`,
    ]
    for (const selector of composed) {
      assert.notEqual(blockFor(css, selector), '', `组合规则要用无守卫锚点：${selector}`)
      assert.ok(
        !selector.includes(':has([role=\'group\']) ') || !selector.startsWith('body:not'),
        '组合规则的**主体**不该再带 :has() 守卫',
      )
    }
    // 守卫仍在的那条（给菜单本体上料、没有别的锚点可表达「带分组的菜单」）必须保留 :has()，
    // 否则会把页面上**所有**菜单都染上 —— 这条是"别把冗余删除推广过头"的护栏。
    assert.match(
      GROUPED_MENU_SELECTOR,
      /:has\(\[role='group'\]\)/u,
      '单独使用的菜单锚点必须保留 :has()（去掉会命中所有菜单）',
    )
    assert.equal(
      GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\s+/u, ''),
      "[role='menu']",
      '无守卫版只应去掉 :has()，锚点本体必须一致',
    )
  })

  it('锚点必须带 body 前缀 —— 官方写的是 background 简写，裸属性选择器会被反压', () => {    for (const anchor of SURFACE_ANCHORS) {
      assert.match(anchor, /^body /u, `${anchor} 要有 body 前缀抬特异度`)
    }
  })

  it('⛔ 出图层的锚点必须自己**形成层叠上下文**（否则 ::after 负 z 逃逸、纹理被自身背景盖住）', () => {
    // ## 为什么（2026-09-27，owner：「归档页，云端文件页……全都没适配纹理和打光」）
    //
    // 根因：`z-index: -1` 的伪元素只画在**它所属的层叠上下文内部**。父元素若自己不成
    // 层叠上下文，这个负 z 层就**逃逸到上一层**排队 ⇒ 被父元素**自己的不透明背景**盖住。
    //
    // 布尔判据（把 `::after` 设纯绿，数表面内的绿点）：
    //   | 表面                    | 元素自身                        | 绿点            |
    //   | 云文件页 dialog          | z-index:auto / isolation:auto   | **0 / 40000**   |
    //   | 同上 + isolation:isolate | 成上下文                        | **38392/40000** |
    //   | codebuddy 弹层（对照）    | z-index:20 ⇒ 已有上下文          | **6085 / 6336** |
    //
    // 各插件写法不同：官方系组件常带 z-index / backdrop-filter（自然成上下文），
    // 而自家插件的 dialog 是 `position: relative` + `z-index: auto` ⇒ 不成上下文。
    // owner 原话「codebuddy 插件的弹层就适配了，区别在哪？」—— 区别就在这里。
    //
    // `isolation: isolate` 只创建层叠上下文（不改定位 / 尺寸 / 包含块），
    // 对已成上下文的元素是无操作 ⇒ 给所有出图层的锚点加都安全。
    for (const anchor of [...SURFACE_ANCHORS, ...COMPOSER_CARD_ANCHORS]) {
      if (!usesAfterLayer(anchor)) continue // 官方 ::before 那条不需要（官方自带盒子）
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      // ⚠️ **必须先剥注释**：本用例的说明里就写着 "isolation: isolate" 这个字面量，
      // 若拿未剥注释的产物去切块，块注释会被当成规则体命中 ⇒ 断言假过（本仓库反复踩）。
      const noComment = css.replace(/\/\*[\s\S]*?\*\//gu, '')
      // ⚠️ 必须取该选择器的**全部**规则体：同一选择器现在有**两条**规则
      // （一条 isolation、一条 position），`blockFor` 只返回最后一条 ⇒ 会漏判。
      const blocks = blocksFor(noComment, gated)
      assert.ok(blocks.length > 0, `${anchor} 应有一条「自身」规则`)
      assert.ok(
        blocks.some(b => /isolation\s*:\s*isolate/u.test(b)),
        `${anchor} 必须 isolation:isolate —— 否则 ::after 的 z-index:-1 逃逸、纹理被自身背景盖住`,
      )
    }
  })

  it('⛔ static 锚点必须有 position:relative（否则 ::after 的包含块跑到视口、纹理铺满全屏）', () => {
    // ## 为什么（2026-09-27，owner 截图报问答卡「出 bug 了」）
    //
    // `::after { position: absolute; inset: 0 }` 需要一个**定位祖先**当包含块。
    // 官方问答卡的 `.card` 是 `position: static`，且祖先链上也没有 positioned 元素
    // ⇒ 包含块退到**视口** ⇒ 纹理铺满全屏（`overflow: hidden` 也裁不住，
    //    因为裁剪只作用于包含块链上的后代盒）。
    //
    // 布尔判据（把 `::after` 设纯红，数卡内/卡外红点）：
    //   | | 卡内 | 卡外 |
    //   | 修复前 | **0** | **78013 / 78750**（糊满全屏） |
    //   | 修复后 | **11240 / 11250** | **0 / 67500** |
    //
    // ⚠️ **绝不能给全表统一补** `position: relative`：本表多数锚点本就是
    // `absolute` / `fixed`，盖一条 relative 会把绝对定位改成相对定位 ⇒ 弹层当场错位。
    // 故只有 `STATIC_SURFACE_ANCHORS` 里**实测 static** 的那几条才补。
    assert.deepEqual([...STATIC_SURFACE_ANCHORS], [
      'body [data-question-key] > section',
      'body [data-plan-review-key] > section',
    ], 'static 锚点表变了 —— 请先实测新锚点的 computed position 再登记')
    const noComment = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    for (const anchor of STATIC_SURFACE_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      const blocks = blocksFor(noComment, gated)
      assert.ok(
        blocks.some(b => /position\s*:\s*relative/u.test(b)),
        `${anchor} 必须 position:relative —— 否则 ::after 的包含块退到视口、纹理铺满全屏`,
      )
    }
    // 反向：**其它**锚点不得被盖上 position（会破坏绝对定位的弹层）
    for (const anchor of [...SURFACE_ANCHORS, ...COMPOSER_CARD_ANCHORS]) {
      if (STATIC_SURFACE_ANCHORS.includes(anchor)) continue
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      for (const b of blocksFor(noComment, gated)) {
        assert.ok(
          !/position\s*:\s*relative/u.test(b),
          `${anchor} 不该被强制 relative —— 它可能是 absolute / fixed，改了会错位`,
        )
      }
    }
  })

  it('⛔ **所有**会被 gatedAnchor 处理的常量都必须带 body 前缀（不只是一张表）', () => {
    // 为什么单独钉这三条：`gatedAnchor()` 用 `anchor.replace(/^body\b/, …)` —— 锚点一旦
    // 丢了 `body ` 前缀，`replace` **静默不替换**，产物里就是一条**完全不带门**的规则，
    // 而「复算期望值」式的断言会与产物一起错（自己同意自己）。上面那条循环只走了
    // SURFACE_ANCHORS，另外两处（输入框图标按钮 / 分组菜单）**当时无人守**。
    // 实测（审计 M30/M31）：这两处去掉 `body ` 前缀后，产物里出现裸 `[data-composer-card]`
    // 与裸 `[role='menu']:has([role='group'])`，而 225 个用例**全绿**。
    for (const [label, constant] of [
      ['COMPOSER_ICON_BUTTON_SCOPE', COMPOSER_ICON_BUTTON_SCOPE],
      ['GROUPED_MENU_SELECTOR', GROUPED_MENU_SELECTOR],
      // 无守卫版同样会被 gatedAnchor 处理（标题 / 滚动容器两条规则都改用了它）。
      ['GROUPED_MENU_UNGUARDED_SELECTOR', GROUPED_MENU_UNGUARDED_SELECTOR],
    ]) {
      assert.match(constant, /^body /u, `${label} 要有 body 前缀，否则 gatedAnchor 静默失门：${constant}`)
    }
    // GROUPED_MENU_TITLE_SELECTOR **故意不带** body 前缀：它永远作为上面那条的**后代**
    // 拼在后面（`gatedAnchor(GROUPED_MENU_SELECTOR) ${GROUPED_MENU_TITLE_SELECTOR}`），
    // 自己不是规则起点，加了反而会拼出非法选择器。
    assert.doesNotMatch(
      GROUPED_MENU_TITLE_SELECTOR,
      /^body\b/u,
      'GROUPED_MENU_TITLE_SELECTOR 是后代片段，不该自带 body 前缀',
    )
  })

  it('图层顺序应该 是「颗粒 / 顶光 / 底光」（颗粒压在最上面才像砂面）', () => {
    const order = [GRAIN_TILE_VARIABLE, TOP_VARIABLE, BOTTOM_VARIABLE]
    const at = order.map(name => layers.indexOf(`var(${name}`))
    assert.ok(at.every(index => index >= 0), '三层变量都要在')
    assert.deepEqual([...at].sort((a, b) => a - b), at, `图层顺序不对：${layers}`)
  })

  it('几何应该 用浮层尺度那三条常量（不是整屏的、也不是色卡的）', () => {
    assert.ok(layers.includes(`radial-gradient(${POPUP_TOP_SHAPE},`))
    assert.ok(layers.includes(`radial-gradient(${POPUP_BOTTOM_SHAPE},`))
    // 左光（2026-09-27 补）：与另两道同为**浮层尺度**（百分比几何），不是整屏的 `vw/vh`。
    assert.ok(layers.includes(`radial-gradient(${POPUP_LEFT_SHAPE},`), '左光必须用浮层尺度的形状')
    assert.ok(!layers.includes('vw') && !layers.includes('vh'), '浮层几何不得混入整屏的 vw/vh 单位')
    assert.equal((layers.match(new RegExp(POPUP_STOP, 'gu')) ?? []).length, 3, '三层都用浮层收束位置')
  })

  it('每一条锚点规则应该 **只叠图层、不刷底色**，且都带官方默认门', () => {
    // ⚠️ 2026-09-24 架构收口（owner：「统一设计语言，该透明模糊的就透明模糊，用 dsh 官方新代码的
    // 接入方式接入」）：这层**不透明填充**是 0.1.5 时代的兜底，0.1.7 官方把弹层统一成
    // 「半透明 --dsw-specific-menu + --dsw-menu-backdrop-filter」之后，它反而把官方的玻璃
    // 整块盖掉 —— 就是 owner 反复报的「后台任务 / CodeBuddy 弹窗不是透明模糊效果」。
    // 现在：底色与模糊一律交给**官方自己的材质 + 官方 token**（色调走 overrideTokens 染进 token），
    // 我们只叠 `background-image` 的质感层（颗粒 + 光）。
    for (const anchor of SURFACE_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      // ⚠️ 2026-09-27（M2）：单载体 —— 元素级那条已删，载体可能是 ::after / 官方 ::before。
      const carriers = [
        blockFor(css, gated),
        blockFor(css, `${gated}::after`),
        blockFor(css, `${gated}::before`),
      ].filter(b => b.includes('background-image:'))
      assert.equal(carriers.length, 1, `${anchor} 应**恰好一个**质感载体（M2 单载体）`)
      const body = carriers[0]
      assert.ok(body.includes('background-image:'), `${anchor} 要画图层`)
      assert.ok(
        !body.includes('background-color'),
        `${anchor} 不得刷底色 —— 官方的半透明材质要能透上来（色调已由 token 层染过）`,
      )
      assert.ok(!body.includes('backdrop-filter'), `${anchor} 模糊归官方素材，不在本表声明`)
      assert.ok(!/\bbackground:\s/u.test(body), `${anchor} 不得用简写（会重置 background-position 等）`)
    }
  })

  it('官方默认门应该 并进锚点自身的 body —— 不许拼出 body…body（那样永远不命中）', () => {
    // 这条是回归守卫：曾经写成 `body:not([…]) ${anchor}`，而锚点自带 `body ` 前缀，
    // 于是拼出 `body:not([…]) body [role='menu']`（**body 套 body**），整张表静默失效 ——
    // 表现为「只有走 token 的菜单有质感，其余弹层全是纯色」。
    assert.ok(
      !/body:not\(\[[^\]]*\]\)\s+body\b/u.test(css),
      '不得出现 `body:not([…]) body`：锚点自带 body 前缀，门必须并进去',
    )
    // 正面断言：每条锚点都变成 `body:not([…]) [role=…]` 这种形状（载体是伪元素时同样如此）
    for (const anchor of SURFACE_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      // ⚠️ 2026-09-27（M2）：判据从「必须有一条元素级带门规则」改为
      // 「**某个载体**上有一条带门规则」—— 元素级那条已删。
      const has = [gated, `${gated}::after`, `${gated}::before`].some(sel => css.includes(`${sel} {`))
      assert.ok(has, `缺带门规则 ${gated}（任一载体皆可）`)
      assert.equal((gated.match(/\bbody\b/gu) ?? []).length, 1, `${gated} 里只该有一个 body`)
    }
  })

  it('⛔ 覆盖用的伪元素必须**生成盒子**（content + 定位），且必须用 ::after 压在官方材质之上', () => {
    // ## 这条守卫为什么存在（2026-09 审计，HIGH）
    //
    // rc.2 起官方把菜单/卡片的材质画进 **z-index:-1 的子元素或伪元素**（MenuSurface 的
    // `.material`、QueueDock 的 `.panel::before`），于是本插件加了一层「把同一串图层再画到
    // 伪元素上」的修法。但那一版发出去的是**不带 `content` 的 `::before`** ——
    // **不带 content 的伪元素不生成盒子**，那 12 条规则的 `background-image` 全部空转。
    //
    // 真机同构复刻实测（官方 rc.2 MenuSurface：`.material` 子元素 + alpha .45 + blur(40px)）：
    //   | 变体                                   | content | 空白区纹理标准差 |
    //   | :------------------------------------- | :------ | ---------------: |
    //   | `::before`（无 content）                | none    |            0.30 |
    //   | `::before` + content + z-index:-1       | ""      |            0.30 |
    //   | `::before` + content（无 z-index）      | ""      |   10.83（压住文字）|
    //   | **`::after` + content + z-index:-1**    | ""      |        **8.29** |
    // 标准差 0.30 ≈ 纯色 ⇒ 被官方材质彻底洗掉；8.29 才是质感真的画上去了。
    // 原因是绘制顺序：负 z 带内按树序，`::before` 排在 `.material` **前面**（被盖），
    // `::after` 排在**最后**（压在其上），而整个负 z 带仍在行内文字之下（不盖字）。
    //
    // 故这几条都是**硬契约**，缺一律静默失效（外观只是"没质感"，没有任何报错）：
    //   ① 每条覆盖规则必须声明 `content`；除非它补的是**官方自己的 `::before`**（见下）；
    //   ② 必须有非 static 定位（否则 `inset` 不生效、盒子塌成 0 面积）；
    //   ③ 必须是 `::after`（`::before` 会被官方材质盖住）—— 同理，官方 `::before` 那条例外。
    //
    // ⚠️ **例外只有一处且必须显式登记**：`OFFICIAL_BEFORE_LAYER_ANCHORS` 里的锚点，
    // 官方自己已经在那个 `::before` 上声明了 `content` 与完整几何，我方**只补一个
    // `background-image`**。判据不是"名字对上就行"，而是三条同时成立：
    // ① 该锚点在 `OFFICIAL_BEFORE_LAYER_ANCHORS` 里；② 这条规则**没有** `content` 声明
    //（有就说明我们在自己造盒子 —— 那正是要拦的空转形态）；③ 它**不在** `::after` 覆盖层里。
    // 背景：QueueDock 被排除出 `::after` 后，光靠元素级那条**拿不到质感** ——
    // 官方材质在它自己的 `::before`（负 z 带）上，元素级背景在它**之下**，实测 std 0.229 ≈ 纯色；
    // 补一条到官方 `::before` 后 std 2.162，且官方 `::after` 的描边三边全在。
    // ⚠️ **必须先剥注释再 match**：本文件用的正则 `[^{}\n][^{}]*?::before` 会跨行吃掉
    // 注释块，把注释里提到的 `::before` 字面量当成一条规则 —— 加一条含该字样的注释就会
    // 误报（2026-09-27 踩到）。`blockFor` 早就剥了注释，这里此前没剥。
    const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    const officialBeforeRules = [...cssNoComment.matchAll(/([^{}\n][^{}]*?::before)\s*\{([^}]*)\}/gu)]
      .filter(m => /background-image\s*:/u.test(m[2]))
    /** 锚点在 CSS 里是**带门**的形态（`gatedAnchor` 把门并进 `body`），比对时要还原。 */
    const gated = anchor => anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
    for (const rule of officialBeforeRules) {
      const selector = rule[1].trim().replace(/\s+/gu, ' ')
      const body = rule[2]
      assert.ok(
        OFFICIAL_BEFORE_LAYER_ANCHORS.some(anchor => selector === `${gated(anchor)}::before`),
        `${selector} —— 只有登记在 OFFICIAL_BEFORE_LAYER_ANCHORS 里的锚点才准发 ::before 图层规则`,
      )
      assert.ok(
        !/content\s*:/u.test(body),
        `${selector} —— 补官方 ::before 时**不得**声明 content（盒子归官方；自己造会再踩一次空转）`,
      )
      assert.ok(
        !/::after/u.test(selector),
        `${selector} —— 补助规则不该同时出现在 ::after 层`,
      )
    }
    const pseudoRules = [...cssNoComment.matchAll(/([^{}\n][^{}]*?::(?:before|after))\s*\{([^}]*)\}/gu)]
      .filter(m => /background-image\s*:/u.test(m[2]))
      // 官方 `::before` 那条例外自带盒子，不参与「必须 ::after」这组契约。
      // ⚠️ 必须按**选择器字符串**排除，不能按 match 对象 —— 上面那个 `::before` 专用的
      // 正则与本正则各自 `matchAll` 出的对象**不是同一个引用**，用 `.includes(m)` 永远为 false，
      // 例外就会被下面那组契约照样判违规（本仓库当下这条守卫就踩过）。
      .filter(m => !officialBeforeRules.some(o => o[1].trim().replace(/\s+/gu, ' ') === m[1].trim().replace(/\s+/gu, ' ')))
    // 覆盖层规则数：8 条锚点 − 1 条被排除（QueueDock，官方 `.panel::after` 是描边）
    // = 7 条。下界取 7，既拦住「锚点表被删空」，也不因正常的排除而误报。
    assert.ok(pseudoRules.length >= 7, `覆盖用伪元素规则太少（${pseudoRules.length}）—— 锚点表是不是被删了？`)
    for (const rule of pseudoRules) {
      const selector = rule[1].trim().replace(/\s+/gu, ' ')
      const body = rule[2]
      assert.ok(/content\s*:/u.test(body), `${selector} 缺 content —— 不生成盒子，background-image 空转`)
      assert.ok(/position\s*:\s*absolute/u.test(body), `${selector} 缺 position:absolute —— inset 不生效`)
      assert.ok(/inset\s*:\s*0/u.test(body), `${selector} 缺 inset:0 —— 盒子会被内容撑开或塌成 0`)
      assert.ok(/z-index\s*:\s*-1/u.test(body), `${selector} 缺 z-index:-1 —— 会跑到文字层之上、盖住内容`)
      assert.match(selector, /::after$/u, `${selector} 必须用 ::after —— ::before 在树序上早于官方材质，会被它盖住`)
    }
  })

  it('⛔ 官方在同一伪元素上有装饰的锚点**必须排除**在 ::after 覆盖层之外', () => {
    // ## 为什么（2026-09-27 审计，两处真实副作用）
    //
    // 覆盖层用 `::after`，若官方**自己**也在这个元素的 `::after` 上画东西，就会互相顶掉：
    //
    // ① `[data-queue-dock] > :first-child` = 官方 `QueueDock` 的 `.panel`，它的 `::after`
    //    是 **0.5px 描边**（`content:''` + `inset:0` + `border`，`z-index:auto`）。我方把同伪元素
    //    `z-index` 压到 `-1` ⇒ 描边进负 z 带 ⇒ 被整行宽的悬停行底盖掉。
    //    ⚠️ 顶边因在悬停行之上仍在 —— **只抽样顶边发现不了**，初版正是这样漏掉的。
    // ② `[data-trigger-menu][data-overflow-below]` = 官方 `MenuView` 的「下面还有内容」渐隐提示
    //    （同一个 `::after`）。锚点必须收窄 `:not([data-overflow-below])` 让官方提示留下。
    //
    // 这条守卫把两处**都钉死**：排除表必须含 queue-dock；trigger-menu 锚点必须带收窄条件。
    assert.ok(
      AFTER_LAYER_EXCLUDED_ANCHORS.includes('body [data-queue-dock] > :first-child'),
      'QueueDock 面板必须排除在 ::after 覆盖层之外（否则官方 0.5px 描边被盖）',
    )
    assert.ok(
      !/\bbody \[data-queue-dock\][^{]*::after/u.test(css),
      '不得给 QueueDock 面板发 ::after 规则（官方那条是它的描边）',
    )
    assert.ok(
      SURFACE_ANCHORS.some(a => a.includes('data-trigger-menu') && a.includes(':not([data-overflow-below])')),
      'trigger-menu 锚点必须收窄排除 [data-overflow-below]（该状态下官方在同一个 ::after 上画渐隐提示）',
    )
    // 排除是**有意**的例外，不能变成"整张表都不叠"：多数锚点仍必须有覆盖层。
    const overlay = [...css.matchAll(/::after\s*\{/gu)].length
    assert.ok(overlay >= 10, `覆盖层规则太少（${overlay}）—— 排除表是不是被写宽了？`)
    // ⚠️ **2026-09-27（M2）本条改判**：此前断言「元素级那条仍要在（材质画在自己身上时靠它）」。
    // 单载体收口后元素级那条**已按设计删除** —— 它在没有材质子元素的组件上造成双倍，
    // 而在 QueueDock 上又会被官方 ::before 盖住（实测 std 0.229 ≈ 纯色，等于没用）。
    // 现在 QueueDock 的质感**只由「补官方 ::before」那条承担**（下一条用例钉住它真的在）。
    assert.ok(
      /\[data-queue-dock\] > :first-child::before\s*\{[^}]*background-image/u.test(css),
      'QueueDock 排除 ::after 后，质感必须由「补官方 ::before」承担（M2 起这是它唯一载体）',
    )
    assert.ok(
      !/\[data-queue-dock\] > :first-child\s*\{[^}]*background-image/u.test(css),
      'M2 单载体：QueueDock 也不得再有元素级图层规则（会与 ::before 那条叠成双层）',
    )
  })

  it('⛔ QueueDock 排除 ::after 之后必须**补到官方自己的 ::before**（否则它没有质感）', () => {
    // ## 为什么（2026-09-27 复核，实测推翻上一轮的结论）
    //
    // `18db3e2` 把 QueueDock 排除出 `::after` 层，理由（官方那 0.5px 描边）是对的，
    // 但它的结论写的是「被排除的锚点仍保留**元素级** `background-image`」——
    // **对 QueueDock 不成立**：官方材质不在元素自己身上，而在它自己的 `.panel::before`
    // （`z-index:-1` + `backdrop-filter: blur(40px)`）上；元素级背景在负 z 带**之下**，
    // 被那层半透明材质连同模糊一起洗掉。
    //
    // 真机同构复刻实测（官方 QueueDock rc.2 逐字；取样区亮度标准差 = 质感可见度，
    // 官方材质本身平坦 ⇒ 基线 0.000）：
    //   | 变体                              | 颗粒 std | 官方 ::after 描边 |
    //   | :-------------------------------- | -------: | :---------------- |
    //   | 只元素级那条（18db3e2 现状）        | **0.229** ← 与纯色无异 | 完好 |
    //   | **补一条到官方 ::before（本修法）** | **2.162** ✅ | **完好** |
    //   | （对照）1527612 的 ::after 版       | 2.261 | **被盖掉 ✗** |
    //
    // 补 `::before` 安全的**前提**是官方那个伪元素**已经声明了 content 与完整几何**，
    // 所以我方**只补 `background-image` 一个属性**：不动官方盒子，同一元素上
    // `background-image` 画在 `background-color` 之上（且不经过那个只过滤「背后」的
    // `backdrop-filter`），并且**完全不碰 `::after`** ⇒ 官方描边照旧。
    assert.ok(
      OFFICIAL_BEFORE_LAYER_ANCHORS.includes('body [data-queue-dock] > :first-child'),
      'QueueDock 必须补在官方 ::before 上（元素级那条会被官方材质洗掉）',
    )
    assert.equal(usesOfficialBeforeLayer('body [data-queue-dock] > :first-child'), true)
    // 补助规则必须存在，且**只补 background-image**（不得自己造盒子、不得碰 ::after）
    const gated = 'body [data-queue-dock] > :first-child'.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
    const at = css.indexOf(`${gated}::before {`)
    assert.ok(at >= 0, `缺 QueueDock 的 ::before 补助规则：${gated}::before`)
    const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
    assert.ok(body.includes(surfaceLayers()), '补助规则要画**完整 4 层**配方（M3 起与菜单同一配方）')
    for (const forbidden of ['content', 'position', 'inset', 'z-index', 'border-radius', 'pointer-events']) {
      assert.ok(
        !new RegExp(`(?:^|;)\\s*${forbidden}\\s*:`, 'u').test(body),
        `补助规则不得声明 ${forbidden} —— 盒子与几何都归官方，我们只加一个 background-image`,
      )
    }
    // 反向：这条例外**不许**被推广到别的锚点（给没有 ::before 的元素补 = 又造一个空转盒子）
    assert.deepEqual([...OFFICIAL_BEFORE_LAYER_ANCHORS], ['body [data-queue-dock] > :first-child'])
    assert.equal(usesOfficialBeforeLayer("body [data-testid='todo-panel']"), false)
    assert.equal(usesOfficialBeforeLayer("body [data-goal-bar] > :first-child"), false)
  })

  it('颜色应该 全部走变量（换色调 / 切轴时自动跟随，不由本模块重写）', () => {
    for (const name of [GRAIN_TILE_VARIABLE, TOP_VARIABLE, BOTTOM_VARIABLE, PANEL_VARIABLE]) {
      assert.ok(css.includes(`var(${name}`), `缺变量 ${name}`)
    }
    // 硬编码色值 = 有人把色调写死在了这里。
    // ⚠️ 断言前**必须剥注释**：注释里记录实测到的官方色值（如后台任务弹层 ::before 的半透明填充）
    // 是有价值的排查证据，不该被读成「把色调写死」；真正要拦的是**声明**里的硬编码。
    // `blockFor` 出于同样的理由先剥注释。
    const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.ok(!/#[0-9a-f]{3,8}\b/iu.test(code), `表面表里不得出现硬编码色值：${code}`)
    assert.ok(!/\brgba?\(/u.test(code), '表面表里不得出现硬编码色值')
  })

  it('输入框里的图标按钮应该 默认去底、保留 hover 底', () => {
    // owner：「这两个按钮得适配下，我觉得**像下拉菜单一样，默认底就不要了，保留 hover 底就行**。」
    // 官方默认底是 var(--dsw-specific-selector) = **不透明实色**，而按钮坐在**玻璃卡片**里
    // → 读成两块贴在玻璃上的塑料片。置 transparent 后露出卡片自己的玻璃。
    const gated = COMPOSER_ICON_BUTTON_SCOPE.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
    const at = css.indexOf(`${gated} {`)
    assert.ok(at >= 0, `缺图标按钮规则 ${gated}`)
    const body = css.slice(at, css.indexOf('}', at))
    assert.match(body, /--dsw-specific-selector:\s*transparent/u, '默认底要置为透明')
    // 只要**这一个** token：官方 hover 走的是另一个（--dsw-alias-interactive-bg-hover-solid），
    // 所以改这个不影响 hover —— 不许顺手把 hover 也写了（那会重复官方的职责）。
    assert.ok(!/hover/u.test(body), '不该自己重写 hover（官方那条规则天然保留）')
    // ⚠️ 不许写到 body 上：这 token 语义通用（现在只有 .uV2eYG_add 一个消费方，
    // 官方将来若接上别的组件，写 body 会误伤）。范围收在卡片里。
    //
    // ⚠️ 这里的 `m` 标志**不能省**：`buildSurfaceCss()` 的产物以注释 `/* … */` 开头，
    // 没有 `m` 时 `^` 只锚定整个字符串的起点 → 永远匹配不到 → `!test(...)` 恒为真，
    // 这条断言对任何输入都不动（实测：构造一份真的把该 token 写到 body 上的产物，
    // 无 `m` 时为 false、加 `m` 后为 true）。故断言改写为「逐规则找是否有 body 级声明」，
    // 比正则更直白且不受锚点影响。
    for (const rule of css.matchAll(/(^|\n)([^{}\n]+)\{([^{}]*)\}/gu)) {
      const selector = rule[2].trim()
      const bodyText = rule[3]
      if (!/^body[^ ]*$\s*/u.test(selector) && selector !== 'body') continue
      assert.ok(
        !bodyText.includes('--dsw-specific-selector'),
        `不得把该 token 覆盖写到 body 上（会外溢到别的组件）：${selector}`,
      )
    }
    // 正向确认：该 token 确实写在图标按钮那条规则里（否则上面那条循环会「空过」）
    assert.ok(body.includes('--dsw-specific-selector'), '该 token 应写在图标按钮规则里')
  })

  it('不应该 依赖官方 hashed 类名，也不应该 限定相位', () => {
    // 同样先剥注释：注释里会引用实测到的官方 hashed 类名（如弹层 ::before 那条规则）作为证据。
    const code = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(code), '不得出现 hashed 类名')
    assert.ok(!code.includes('data-phase'), 'hero 相位下侧栏菜单照样要弹')
  })
})
