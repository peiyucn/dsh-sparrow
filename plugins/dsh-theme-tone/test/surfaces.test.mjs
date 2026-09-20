import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BORDER_TOKENS,
  DARK_TONES,
  DEFAULT_SETTINGS,
  DEPTH_ALPHA,
  INSET_TINT,
  INSET_TOKENS,
  LIGHT_GLOW_ALPHA,
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
import { GRAIN_DATA_URI } from '../lib/backdrop.js'
import { COMPOSER_CARD_ANCHORS, COMPOSER_ICON_BUTTON_SCOPE, GROUPED_MENU_SELECTOR, GROUPED_MENU_TITLE_SELECTOR, SURFACE_ANCHORS, buildSurfaceCss, menuSurfaceLayers, surfaceLayers } from '../lib/surface.js'
import {
  BOTTOM_VARIABLE,
  DIALOG_ANCHOR,
  GRAIN_TILE_VARIABLE,
  HOVER_CARD_ANCHOR,
  HOVER_CARD_TEXT_TOKENS,
  PANEL_VARIABLE,
  PLAIN_ATTR,
  POPUP_BOTTOM_SHAPE,
  POPUP_GRAIN_DATA_URI,
  POPUP_STOP,
  POPUP_TOP_SHAPE,
  TOP_VARIABLE,
  LEFT_VARIABLE,
} from '../lib/constants.js'
import { buildGlassCss, GLASS_SPECULAR_RING } from '../lib/glass.js'

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
    // 浅色的每一档都应**重于**深色对应的档（白底余量只有一半，见上一条）
    assert.ok(LIGHT_GLOW_ALPHA.top > 0.09, '浅色顶光应重于深色顶光 .09')
    assert.ok(LIGHT_GLOW_ALPHA.left > 0.11, '浅色侧光应重于深色侧光 .11')
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

  it('菜单族应该 单独成组，但只装颜色（图层归 surface.ts，见 POPUP_TOKENS）', () => {
    // 菜单走 POPUP_TOKENS：**只给颜色**。曾经塞过整份图层配方，但官方把这个
    // token 也用在 sticky 分组标题上，百分比渐变按元素盒子缩放会把小条压成硬边金带。
    // ⚠️ 2026-09-20：`--dsw-specific-tip` **已移出本表** —— 它的消费方是三张停靠卡
    // （TodoPanel / GoalBar / QueueDock），不是菜单；且它要「比地面重」而菜单族要「比地面浅」，
    // 目标相反。现归 INSET_TOKENS（见下一条）。
    assert.deepEqual(POPUP_TOKENS.map(entry => entry.token), ['--dsw-specific-menu'])
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

  it('菜单族应该 与 layer-3 同色（rung 名可以不同，值必须一样）', () => {
    // `tip` 走的是 `tip` 那个档位名，但 SURFACE_RUNGS 已经把整族收敛成同一个色阶，
    // 所以「档位名不同」不影响「颜色相同」—— 这条正是这个家族统一与否的判据。
    const layer3 = SURFACE_TOKENS.find(entry => entry.token === '--dsw-alias-bg-layer-3')
    for (const entry of POPUP_TOKENS) {
      for (const scheme of SCHEMES) {
        assert.equal(
          SURFACE_RUNGS[scheme][entry.rung],
          SURFACE_RUNGS[scheme][layer3.rung],
          `${scheme}: ${entry.token} 应与 layer-3 同色`,
        )
      }
    }
  })

  it('「默认」应该 逐条等于官方绑定（不是我们选的档）—— 这是「完全不介入」的底线', () => {
    // 曾经真的错在这里：`surfaceFill` 在官方默认下也发 `SURFACE_RUNGS`（我们选的 875），
    // 于是官方默认的 `layer-3` 从官方的 `800` 被改深了 —— 「官方默认的都不要动」当场就破了。
    const identity = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const scheme of SCHEMES) {
      for (const { token, rung } of [...SURFACE_TOKENS, ...POPUP_TOKENS]) {
        assert.equal(identity[token][scheme], `var(${RUNG_VARIABLE[scheme][rung]})`, `${token}.${scheme}`)
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
    for (const { token, rung } of [...SURFACE_TOKENS, ...POPUP_TOKENS]) {
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
    for (const { token, rung } of [...SURFACE_TOKENS, ...POPUP_TOKENS]) {
      assert.equal(
        overrides[token].light,
        `var(${SURFACE_RUNGS.light[rung]})`,
        `${token} 的浅色轴必须是纯官方引用`,
      )
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
      for (const { token } of POPUP_TOKENS) {
        assert.ok(overrides[token][scheme].endsWith(expected), `${token}.${scheme} 的底色层应是同一个值`)
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

  it('浮层的配方应该 三层齐备（颗粒 / 顶光 / 底光）—— 但画在选择器那层，不进 token', () => {
    // 曾经这条测的是 `--dsw-specific-menu` 的值，现在配方归 `surfaceLayers()`：
    // token 只装颜色（否则 sticky 分组标题会把百分比渐变压成硬边金带，见 05-surfaces §8.2）。
    const layers = surfaceLayers().split(',\n    ')
    assert.equal(layers.length, 3, '颗粒 + 顶光 + 底光')
    assert.equal(layers[0], `var(${GRAIN_TILE_VARIABLE}, none)`, '颗粒压在最上面才像砂面')
    assert.ok(layers[1].includes(POPUP_TOP_SHAPE), '第二层是顶光')
    assert.ok(layers[2].includes(POPUP_BOTTOM_SHAPE), '第三层是底光')
    for (const layer of layers.slice(1)) {
      assert.ok(layer.includes(POPUP_STOP), `每层都以同一个收束点结束：${POPUP_STOP}`)
    }
  })

  it('官方默认的菜单族应该 直通官方色阶（不带任何图层）', () => {
    // 「默认 = 完全不介入」在 token 层也要成立：值里不能出现 gradient / 颗粒，
    // 且色阶必须是**官方**的（`RUNG_VARIABLE`），不是我们选的档。
    const official = tokenOverrides({ lightTone: 'official', darkTone: 'official' })
    for (const { token, rung } of POPUP_TOKENS) {
      for (const scheme of SCHEMES) {
        const value = official[token][scheme]
        assert.equal(value, `var(${RUNG_VARIABLE[scheme][rung]})`, `${token}.${scheme}`)
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
  it('四个光色变量应该 都发到 token 层，且两个模式都给', () => {
    // 浮层是 portal 到 body 的官方元素，读不到背景层元素上的内联变量 —— 必须发到 body 上。
    const overrides = tokenOverrides(DEFAULT_SETTINGS)
    for (const { token } of LIGHT_TOKENS) {
      assert.ok(overrides[token], `tokenOverrides 缺少 ${token}`)
      assert.ok(overrides[token].light.length > 0 && overrides[token].dark.length > 0, `${token} 两模式都要给`)
    }
    // 回归守卫：**left 曾经漏在这里**（只在背景层元素上写内联样式）→ 浮层读不到，
    // 所有弹层的左光一直是缺的（owner 报「其他能弹出的…都没有下面的光」那次一并查出）。
    assert.deepEqual(
      LIGHT_TOKENS.map(entry => entry.token),
      [TOP_VARIABLE, BOTTOM_VARIABLE, LEFT_VARIABLE, GRAIN_TILE_VARIABLE],
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
    assert.equal(on[GRAIN_TILE_VARIABLE].dark, POPUP_GRAIN_DATA_URI)
    // owner：「浅色版也可以和深色版有相同的渐变质感」→ 浅色轴也开颗粒
    assert.equal(on[GRAIN_TILE_VARIABLE].light, POPUP_GRAIN_DATA_URI, '浅色轴现在也叠颗粒')
    for (const scheme of SCHEMES) {
      for (const id of NON_OFFICIAL[scheme]) {
        const spec = TONES[scheme][id]
        const expected = spec.grain ? POPUP_GRAIN_DATA_URI : 'none'
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
    // 背景层那张靠 `::after { opacity: .13 }`。数值必须一致，否则两种材质看起来不是一种。
    const strip = uri => uri.replace(" opacity='0.13'", '')
    assert.equal(strip(POPUP_GRAIN_DATA_URI), GRAIN_DATA_URI, '两张贴图除 opacity 外必须逐字一致')
    assert.ok(POPUP_GRAIN_DATA_URI.includes("opacity='0.13'"), '浮层那张要烘 .13')
    assert.ok(POPUP_GRAIN_DATA_URI.includes("baseFrequency='0.8'"), '同一套 feTurbulence 参数')
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

describe('抬升面：表面绘制', () => {
  const css = buildSurfaceCss()
  const layers = surfaceLayers()

  it('锚点应该 覆盖菜单族 / listbox 弹层 / 模态弹窗 / 血缘树 / 任务列表 / 提示条，并排除图片灯箱', () => {
    assert.deepEqual([...SURFACE_ANCHORS], [
      "body [role='menu']",
      'body [data-trigger-menu]',
      "body :has(> [role='listbox'])",
      "body [role='listbox']:not([data-trigger-menu] *)",
      DIALOG_ANCHOR,
      "body > [role='tree']",
      "body [data-slot='conversation.session.header.actions'] ul",
      "body [role='tooltip']:not([data-side])",
    ])
    // 模态弹窗**不做玻璃**（它是内容面，Apple HIG：Don't put glass on lists/cards/content）
    assert.ok(!css.includes('backdrop-filter'), `表面表里不该有任何 backdrop-filter（玻璃在 glass.ts）：${DIALOG_ANCHOR}`)
  })

  it('模态弹窗应该 与菜单同一套**实色**面 —— 玻璃只留给控制层（输入框 / 顶栏）', () => {
    // 一段撤掉的弯路：owner 说「对话框要有液态玻璃」，**我理解成 `[role='dialog']` 模态弹窗**，
    // 于是给它做了玻璃 —— 结果设置 / 云端文件 / 归档三个**内容面**变玻璃（其中两个内容还透出来），
    // 而 owner 真正指的**输入框**一动没动（owner 澄清：「**就是我输入对话的对话框啊**」）。
    // Apple HIG 也支持撤：「Don't put glass on lists, cards, or media content」——
    // 玻璃是给 navigation/control layer 的，不是给内容面的。
    assert.equal(DIALOG_ANCHOR, "body [role='dialog']:not(:has(> img))", '模态弹窗回到普通实色锚点（含灯箱排除）')
    assert.ok(!DIALOG_ANCHOR.includes('aria-modal'), '不再按 aria-modal 分流（两类弹窗都走实色）')
    assert.ok(!css.includes('backdrop-filter'), '表面表里不该有任何 backdrop-filter（玻璃都在 glass.ts）')
    // 玻璃确实做在了控制层：输入框卡片带**沿圆角一圈**的镜面高光（inset 阴影）
    assert.ok(buildGlassCss().includes(`inset ${GLASS_SPECULAR_RING[0].x}px ${GLASS_SPECULAR_RING[0].y}px`), '输入框卡片应带镜面高光')
  })

  it('带分组标题的菜单应该 保留质感、只去掉顶光（不能整条排除 → 会变成纯色）', () => {
    // owner 前后两条反馈把解夹死了：
    // ①「模型选择器里面两个分类标题的背景，也得处理下。官方默认样式里是看不到这个背景条的。」
    // ②（我第一版把整个菜单 `:not(:has([role='group']))` 排除出图层之后）
    //   「模型选择列表那个框好像没有适配咱们样式，是纯色的。」
    // 所以：顶光必须去掉（它锚盒子**顶部**，正好被吸顶的分组标题压住 → 横带就是它造的），
    // 颗粒与底光必须留（质感来源；底光锚盒子**底部**、与吸顶标题不相遇）。
    const menu = SURFACE_ANCHORS.find(a => a.includes("[role='menu']"))
    assert.equal(menu, "body [role='menu']", '菜单族必须全量收录（排除 = 纯色）')

    const gated = GROUPED_MENU_SELECTOR.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
    assert.ok(css.includes(gated), `必须有去顶光那条规则：${gated}`)

    const layers = menuSurfaceLayers()
    assert.ok(layers.includes(GRAIN_TILE_VARIABLE), '颗粒要留（质感来源，且与盒子高度无关 → 不造横带）')
    assert.ok(layers.includes(POPUP_BOTTOM_SHAPE), '底光要留（锚盒子底部，与吸顶标题不相遇）')
    assert.ok(!layers.includes(POPUP_TOP_SHAPE), '**顶光必须去掉** —— 它是横带的唯一来源')
    assert.ok(!layers.includes(TOP_VARIABLE), '顶光变量也不该出现在这条里')
    assert.ok(css.includes(layers), '去顶光的图层串必须在表里')

    // 标题条本身也要拿回颗粒，否则标题上没颗粒、菜单上有 → 一层极淡的接缝
    const titleRule = `${gated} ${GROUPED_MENU_TITLE_SELECTOR}`
    assert.ok(css.includes(titleRule), `标题条要单独补颗粒：${titleRule}`)
    assert.ok(css.includes(`var(${GRAIN_TILE_VARIABLE}, none) !important`), '补的是同款颗粒瓦片')
    // 结构锚点，不碰 hashed 类名（codebuddy 那个类还是非哈希的 ccb-model-groupTitle）
    assert.ok(GROUPED_MENU_TITLE_SELECTOR.includes("role='group'"), '标题用 role=group 的结构锚定')
    assert.ok(!/class\*?=/.test(GROUPED_MENU_TITLE_SELECTOR), '不得用类名匹配标题')
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

  it('悬停卡应该 面与字**一起**掰回主题，且**两个档都修**（唯一不带官方默认门的规则）', () => {
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

    // ③ **不带官方默认门** —— owner 明确要求两个档都修，这是全插件唯一一处刻意动官方默认外观。
    //    判据看**选择器**（注释里会出现这个词当说明，所以只查拼接出来的那条选择器）。
    assert.ok(
      !css.includes(`body:not([${PLAIN_ATTR}]) > [role='button']`),
      '悬停卡选择器不该带官方默认门（两个档都要修）',
    )
    assert.ok(css.includes(`${HOVER_CARD_ANCHOR} {`), '应有一条直接以悬停卡锚点开头的规则')
    assert.ok(css.includes(`var(${PANEL_VARIABLE})`), '面应取面板变量（官方默认档下即官方自己的 layer3）')

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
      const at = css.indexOf(`${gated} {`)
      assert.ok(at >= 0, `缺规则 ${gated}`)
      const body = css.slice(at, css.indexOf('}', at))
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
      assert.ok(body.includes(menuSurfaceLayers()), `${anchor} 要画「颗粒 + 底光」`)
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
      assert.ok(!/border[a-z-]*radius/u.test(block), `${anchor} 不得改圆角（官方三张卡本就不一致）`)
    }
    // 整张表里都不许出现针对停靠卡的 margin / radius 规则
    assert.ok(
      !/margin-bottom:\s*calc\(0px - var\(--dsh-composer-stack-gap\)\)/u.test(css),
      '不得收停靠卡的栈间距（那是 QueueDock 专属做法，官方只对它自己做）',
    )
    assert.ok(
      !/\[data-testid='todo-panel'\][^{]*\{[^}]*border-[a-z-]*radius/u.test(css),
      '不得改待办卡圆角',
    )
    assert.ok(
      !/\[data-goal-bar\][^{]*\{[^}]*border-[a-z-]*radius/u.test(css),
      '不得改目标卡圆角',
    )
    // 也不得给它们加顶角规则（兄弟选择器那套一并撤回）
    assert.ok(
      !/\[data-slot='conversation\.input\.dock'\][^{]*~/u.test(css),
      '不得用兄弟选择器给停靠卡排圆角',
    )
  })


  it('锚点必须带 body 前缀 —— 官方写的是 background 简写，裸属性选择器会被反压', () => {
    for (const anchor of SURFACE_ANCHORS) {
      assert.match(anchor, /^body /u, `${anchor} 要有 body 前缀抬特异度`)
    }
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
    assert.equal((layers.match(new RegExp(POPUP_STOP, 'gu')) ?? []).length, 2, '两层都用浮层收束位置')
  })

  it('每一条锚点规则应该 只改填充与图层两样，且都带官方默认门', () => {
    for (const anchor of SURFACE_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      const at = css.indexOf(`${gated} {`)
      assert.ok(at >= 0, `缺规则 ${gated}`)
      const body = css.slice(at, css.indexOf('}', at))
      assert.ok(body.includes(`background-color: var(${PANEL_VARIABLE}) !important`), `${anchor} 要锚面板底色`)
      assert.ok(body.includes('background-image:'), `${anchor} 要画图层`)
      assert.ok(!body.includes('backdrop-filter'), `${anchor} 不透明，不需要模糊`)
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
    // 正面断言：每条锚点都变成 `body:not([…]) [role=…]` 这种形状
    for (const anchor of SURFACE_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      assert.ok(css.includes(`${gated} {`), `缺带门规则 ${gated}`)
      assert.equal((gated.match(/\bbody\b/gu) ?? []).length, 1, `${gated} 里只该有一个 body`)
    }
  })

  it('颜色应该 全部走变量（换色调 / 切轴时自动跟随，不由本模块重写）', () => {
    for (const name of [GRAIN_TILE_VARIABLE, TOP_VARIABLE, BOTTOM_VARIABLE, PANEL_VARIABLE]) {
      assert.ok(css.includes(`var(${name}`), `缺变量 ${name}`)
    }
    // 硬编码色值 = 有人把色调写死在了这里
    assert.ok(!/#[0-9a-f]{3,8}\b/iu.test(css), `表面表里不得出现硬编码色值：${css}`)
    assert.ok(!/\brgba?\(/u.test(css), '表面表里不得出现硬编码色值')
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
    assert.ok(
      !/^body:not\(\[[^\]]*\]\) \{\s*--dsw-specific-selector/u.test(css),
      '不得把该 token 覆盖写到 body 上（会外溢到别的组件）',
    )
  })

  it('不应该 依赖官方 hashed 类名，也不应该 限定相位', () => {
    assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(css), '不得出现 hashed 类名')
    assert.ok(!css.includes('data-phase'), 'hero 相位下侧栏菜单照样要弹')
  })
})



