/**
 * 色调表（纯数据，无宿主依赖 —— 客户端 bundle 会内联本模块，故此处**绝不 import schemastery / Node 模块**）。
 * 一条色调 = 底色 + 左栏填充 + 本色 + 顶部 / 底部径向染色 + 颗粒开关；`available: false` 的是**留位色**（设置行不渲染）。
 */

import {
  BOTTOM_VARIABLE,
  GRAIN_ALPHA,
  GRAIN_ALPHA_VARIABLE,
  GRAIN_TILE_VARIABLE,
  LEFT_VARIABLE,
  PANEL_VARIABLE,
  TOP_STOP_VARIABLE,
  TOP_VARIABLE,
  grainTileUri,
  popupGrainAlpha,
} from './constants.js'

/** **顶光收束点**（两轴同值）：浅色轴的几何一律照深色轴那束金（两轴严格镜像），三层光都是淡光、收束点那道边看不出来，故共用一个值。 */
export const TOP_STOP = '62%'

export type ColorScheme = 'light' | 'dark'

/** 浅色轴可选色调 id（插入顺序 = 设置行渲染顺序），**逐位对应深色轴**：`blue` ↔ `violet`、`sakura` 樱花粉 ↔ `crimson`（两轴这一位都是暖色）、`green` ↔ `forest`。 */
export const LIGHT_TONE_IDS = ['official', 'blue', 'sakura', 'green'] as const

/** 深色轴可选色调 id（插入顺序 = 设置行渲染顺序）。 */
export const DARK_TONE_IDS = ['official', 'violet', 'crimson', 'forest'] as const

export type LightToneId = typeof LIGHT_TONE_IDS[number]

export type DarkToneId = typeof DARK_TONE_IDS[number]

export type ToneId = LightToneId | DarkToneId

/** 一条色调的取值。 */
export interface ToneSpec {
  /** 是否可在设置行里选中。false = 留位（色值未调好，不暴露给用户）。 */
  available: boolean
  /** 应用底色，落到 `--dsw-alias-bg-base`。 */
  base: string
  /** 左栏（及标题行）填充，落到 `--dsw-specific-sidebar-fill`。 */
  sidebarFill: string
  /** 该色调的**本色** —— `'R, G, B'` 通道值（不透明）。**一处定义、两处派生**：底部辉光与抬升面（浮层）染色。`''` = 没有本色（「官方默认」）。 */
  tint: string
  /** 顶部径向染色色值；`''` = 不画（背景层隐藏）。 */
  top: string
  /** 底部径向染色色值（由 {@link ToneSpec.tint} 派生）；`''` = 不画。 */
  bottom: string
  /** **左侧金色过渡**（额外一层，可选）：锚在视口左上角的暖色洗染，让左边栏也吃到金色并在左栏与对话列的接缝一带形成渐变。`''` = 不画（默认）。 */
  left: string
  /** 是否叠颗粒星尘。 */
  grain: boolean
}

/** 底部辉光（纵深）的**共享 alpha**：两轴各一档，改浓度只改这一个数字。浅色轴取 `.30` 而非深色的 `.18` —— 白底对浅色主色的通道余量只有深底对金的一半，观感等重需约 1.8 倍 alpha。 */
export const DEPTH_ALPHA: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.30, dark: 0.18 })

/**
 * **抬升面（浮层）面板**的染色比例：浅色轴取 **0** —— 口径是「官方底色配置 + 打光用主色」，再往面上染色必然改动官方底色
 * （实测还会撞掉官方浅灰面、代码块等不再可辨）；深色轴 `.14`（其面板与地面同源）。
 */
export const PANEL_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0, dark: 0.14 })

/**
 * 交互态面 / 滚动条的染色比例（两轴同档）。浅色轴上调到 `.14`：弹层 / 菜单 / 卡片是界面里**面积最大**的不透明面，比例低了「三款分不清」；
 * 代价是浮层**比内容底更暗**（浅底上染色只可能变暗），靠阴影 + 描边读成抬升。
 */
export const SURFACE_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.14, dark: 0.14 })

export type SurfaceRung = 'layer1' | 'layer2' | 'layer3' | 'tip'

/** **官方自己的绑定**：「默认」这一轴必须**逐条回给官方**，否则官方默认下的 `layer-3` 会从官方的 `800` 被改成我们选的 `875`，「完全不介入」当场破功。 */
export const OFFICIAL_RUNGS: Readonly<Record<ColorScheme, Readonly<Record<SurfaceRung, string>>>> = Object.freeze({
  light: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-60',
  }),
  dark: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-850',
    layer3: '--dsw-static-neutral-bluish-800',
    tip: '--dsw-static-neutral-bluish-800',
  }),
})

/**
 * 抬升面 rung 表 —— **两轴各自收敛成一档**（仅在有色调时生效），传**官方 static 变量引用**而非硬编码色值：刻意引用
 * `--dsw-static-neutral-bluish-*` 而不是 `--dsw-alias-bg-layer-*`（后者正是要覆盖的 token，引用会成自引用环）；收敛成一档后
 * 分层改由描边、阴影、hover 洗染承担，而不是一堆肉眼难辨的灰阶（官方浅轴自己也是这么做的）。
 */
export const SURFACE_RUNGS: Readonly<Record<ColorScheme, Readonly<Record<SurfaceRung, string>>>> = Object.freeze({
  light: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-00',
  }),
  dark: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-875',
    layer3: '--dsw-static-neutral-bluish-875',
    tip: '--dsw-static-neutral-bluish-875',
  }),
})

/**
 * 「弹出来的框」落在哪几个官方 token 上：`--dsw-alias-bg-layer-1/2/3` 与 `--dsw-specific-input-major`（**问询卡片**用的那个，
 * 归 `layer2` —— 官方把两个 token 绑在同一个 static 变量上）；**有意不染**工具提示 / 轻提示 / 对比按钮底（两轴都是**反色**）、
 * 悬停卡（组件内字面量，只能靠 hashed 类名覆盖 = 本插件红线）。
 */
export const SURFACE_TOKENS: readonly Readonly<{ token: string; rung: SurfaceRung }>[] = Object.freeze([
  Object.freeze({ token: '--dsw-alias-bg-layer-1', rung: 'layer1' as const }),
  Object.freeze({ token: '--dsw-alias-bg-layer-2', rung: 'layer2' as const }),
  Object.freeze({ token: '--dsw-alias-bg-layer-3', rung: 'layer3' as const }),
  Object.freeze({ token: '--dsw-specific-input-major', rung: 'layer2' as const }),
])

/**
 * **菜单族**两个 token —— 与 {@link SURFACE_TOKENS} 同法：**只装颜色，不装图层**（图层交给 `surface.ts` 的选择器表）。装图层会让**粘性分组标题**烂掉：官方把同一个 `--dsw-specific-menu` 也用在 `.groupTitle` 上，那条必须与菜单主体同色的 24px sticky 横条会被百分比渐变重新压成一道硬边金带。
 * ⚠️ 该 token 是**半透明玻璃色**（配 `backdrop-filter`）⇒ 走 {@link washFill}（只换 RGB、alpha 一字不动）保住官方玻璃。
 * ⚠️ **两个名字都要染且同值**（官方 `.material` 读 `--dsw-menu-surface-fill`，`.groupTitle` 与自家 codebuddy 菜单读别名），只染一个会让卡片与粘性标题分叉成色差横带；`official` 快照须与官方对齐，否则官方档也发过期色。
 */
export const POPUP_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-menu-surface-fill',
    official: Object.freeze({ light: 'rgba(248, 249, 250, 0.58)', dark: 'rgba(67, 69, 74, 0.45)' }),
  }),
  // 别名那一半：大量消费方直接读它（官方 .groupTitle、自家 codebuddy 模型菜单），macOS 分支还会单独改写。
  Object.freeze({
    token: '--dsw-specific-menu',
    official: Object.freeze({ light: 'rgba(248, 249, 250, 0.58)', dark: 'rgba(67, 69, 74, 0.45)' }),
  }),
])
// `--dsw-specific-tip` 不在此表：它的消费方是三张停靠卡（不是菜单），且要「比地面重」（与菜单族目标相反）⇒ 归 {@link INSET_TOKENS}。

/**
 * **浅灰内嵌面**（inset surface）的染色比例 —— 独立通道：它们**嵌在地面之内**、需要**比地面重**才读得出（与抬升面目标相反）。
 * 取 `.12`（`.18` 真机嫌重）：仍显著高于官方灰与背景的 5–9 阶差，又不像灰板；深色轴 `.14`。
 */
export const INSET_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.12, dark: 0.14 })

/** **浅灰内嵌面**的 token 表 —— 底色取**官方自己那一档**（逐条写，两轴不同档；引用 static 原始色阶而非 alias 以免自引用环）。
 * 「默认」轴走每条自带的 `official` 字段（逐条回官方绑定），保证完全不介入。 */
export const INSET_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-markdown-code-block',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-900' }),
  }),
  Object.freeze({
    token: '--dsw-alias-markdown-code-block-banner',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-850' }),
  }),
  Object.freeze({
    token: '--dsw-specific-tip',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' }),
  }),
])

/** 底部辉光色值 = **本色 @ 该轴的共享 alpha**（`''` → 不画）。两轴同构 —— 深色轴本色比近黑底亮（辉光）、浅色轴比近白底暗（纵深）；判据是**有没有色相的纵向渐变**，不是亮 / 暗。 */
function depthGlow(tint: string, scheme: ColorScheme): string {
  return tint === '' ? '' : `rgba(${tint}, ${DEPTH_ALPHA[scheme]})`
}

/** 深色轴**共享金光**的通道值（pyai.site 原值）—— 三款深色色调**共用这一束光**：切换色调改变的是「空间」（底色 + 底部纵深），不是「光源」。 */
export const DARK_GOLD_TINT = '232, 162, 74'

/**
 * 深色轴**顶上那两道金光**的 alpha（`top` = 顶部居中、`left` = 左上角金晕）。上限被两条既有不变量卡住：`left < bottom`（`.18`）
 * ⇒ `left` 最高 `.17`；深色光层是环境级小值（`top < .15`）⇒ `top` 最高 `.14`。⚠️ 只管深色轴，浅色轴那两道用的是本色。
 */
export const DARK_GOLD_ALPHA: Readonly<Record<'top' | 'left', number>> = Object.freeze({
  top: 0.14,
  left: 0.17,
})

/** 浅色轴**上光 / 侧光**的 alpha（本色 @ 各自档，底部在 {@link DEPTH_ALPHA}）：口径是「官方底色配置 + 打光用主色」，方向 / 位置 / 收束点与深色轴那束金逐字相同；约为深色的 1.8 倍是**物理约束**。 */
export const LIGHT_GLOW_ALPHA: Readonly<Record<'top' | 'left', number>> = Object.freeze({
  top: 0.16,
  left: 0.19,
})

/** 把本色按给定 alpha 组成「一层光」（`''` → 不画）。 */
function toneGlow(tint: string, alpha: number): string {
  return tint === '' ? '' : `rgba(${tint}, ${alpha})`
}

/** 抬升面（浮层）色值：把本色按该轴的比例混进官方中性 rung。 */
function surfaceFill(tint: string, scheme: ColorScheme, rung: SurfaceRung): string {
  // 「默认」逐条回官方绑定（不是我们选的档），否则官方默认下 layer-3 会被我们改深。
  if (tint === '') return `var(${OFFICIAL_RUNGS[scheme][rung]})`
  // 面板走**专用**的 {@link PANEL_TINT}（地面已回官方无色，面板太艳会与地面「两张皮」）；交互态 / 滚动条仍用 SURFACE_TINT。
  return rungFill(tint, SURFACE_RUNGS[scheme][rung], PANEL_TINT[scheme])
}

/** 把本色混进**任意一档官方原始色阶**（`--dsw-static-*`）—— 引用 static 而**不是** alias（alias 正是要覆盖的东西，会自引用环）；
 * 比例由调用方按轴给出，本函数**不感知明暗轴**。 */
function rungFill(tint: string, rung: string, scale: number): string {
  const reference = `var(${rung})`
  // 比例为 0 时直通官方引用 —— 不产出 `color-mix(… 0%, …)` 那种恒等包装，「官方底色不动」在产物里逐字符可见。
  if (tint === '' || scale === 0) return reference
  return `color-mix(in srgb, rgb(${tint}) ${Math.round(scale * 100)}%, ${reference})`
}

/** 浮层面板底色 = 本色混进 {@link SURFACE_RUNGS} 那一档（官方默认下即官方色阶引用）。 */
export function panelFill(tone: ToneSpec, scheme: ColorScheme, rung: SurfaceRung): string {
  return surfaceFill(tone.tint, scheme, rung)
}

/** **交互态**（hover / 按下 / 强调）的染色比例 —— 比面高一点：这些是**低 alpha 洗染**（深色轴上就是一层 8% 的白），比例给低了色相读不出来。 */
export const WASH_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.25, dark: 0.25 })

/**
 * 交互态的**低 alpha 洗染** —— 官方的 hover / 按下 / 强调底色（末条 `--dsw-alias-bg-skeleton` 是 @ 菜单加载态的骨架条，同一种东西）。
 * 官方写的是**字面量** `rgba(...)`，且 alpha 就是效果的全部 ⇒ **不能**像面那样直接 `color-mix`（会把 alpha 一起加权平均、
 * 四个档位全糊成一片），必须**只混 RGB、原样保留 alpha**。官方原值逐字抄自 `design-platform.css`，有测试钉住。
 */
export const WASH_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-interactive-bg-hover',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-interactive-bg-active',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.1)', dark: 'rgba(255, 255, 255, 0.14)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-interactive-bg-hover-accent',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.14)', dark: 'rgba(255, 255, 255, 0.24)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-bg-skeleton',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.08)' }),
  }),
])

/**
 * **描边 / 分隔线**（发丝线）—— 与 {@link WASH_TOKENS} 同法（官方 `rgba(...)` 字面量 ⇒ **只换 RGB、alpha 一字不动**）：
 * 它们是浮层内部仅剩的中性命中（菜单卡外描边、`.separator`、`.footer` 顶线、分区线），那 4–20% 的 alpha 叠在已染过的面上
 * 几乎读不出色相 ⇒「框里还是灰的」。**有意不含** `--dsw-alias-border-inverted*`（两轴都是全透明，染了等于凭空画线）。
 */
export const BORDER_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-border-l1',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.06)' }),
  }),
  Object.freeze({
    // 深色轴的「细一档」变体（浅色轴与 l2 同值）。
    token: '--dsw-alias-border-l2-darkmode-thin',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.06)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l2',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.12)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l3',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.16)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l4',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.16)', dark: 'rgba(255, 255, 255, 0.2)' }),
  }),
])

/** **滚动条滑块** —— 浮层里最后一处**纯中性**（官方绑 `--dsw-static-neutral-*`），不染就会从染过的面板上横切过去；它们是实心变量引用（不是低 alpha 字面量），故走 {@link rungFill}。 */
export const SCROLLBAR_TOKENS: readonly Readonly<{
  token: string
  light: string
  dark: string
}>[] = Object.freeze([
  Object.freeze({ token: '--dsw-alias-scrollbar-bg-l1', light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-700' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-bg-l2', light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-600' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-hover-l1', light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-600' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-hover-l2', light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-550' }),
])

/** **不透明的中性态面**：选中 / hover 的导航底、设置里的模块面板、各类按钮面（每条给出两轴的官方原始色阶名）。**有意不含**：危险态（红）、主按钮（品牌 = 反色对比）、成功 / 错误 / 警告等语义色、遮罩、代码块。 */
export const STATE_TOKENS: readonly Readonly<{
  token: string
  light: string
  dark: string
}>[] = Object.freeze([
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-active', light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-hover', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-850' }),
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-active-accent', light: '--dsw-static-deepseek-100', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-bg-module-platform', light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-interactive-bg-hover-solid', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-button-elevated-fill', light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-alias-button-floating-fill', light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-850' }),
  Object.freeze({ token: '--dsw-alias-button-floating-hover', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-button-ghost-active-fill', light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-alias-button-ghost-active-hover', light: '--dsw-static-neutral-bluish-150', dark: '--dsw-static-neutral-bluish-700' }),
])

/** 洗染色值：**只换 RGB，alpha 一字不动**（不匹配 `rgba()` 形式时**原样返回**官方字面量，安全默认）；`scale` 省略时取 {@link WASH_TINT}，菜单族传 `PANEL_TINT`。 */
export function washFill(tint: string, scheme: ColorScheme, official: string, scale = WASH_TINT[scheme]): string {
  if (tint === '' || scale === 0) return official
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/u.exec(official)
  if (match === null) return official
  const hue = tint.split(',').map(part => Number.parseInt(part.trim(), 10))
  const mixed = [0, 1, 2].map(i => Math.round(hue[i] * scale + Number(match[i + 1]) * (1 - scale)))
  return `rgba(${mixed[0]}, ${mixed[1]}, ${mixed[2]}, ${match[4]})`
}

/** 持久化的色调选择：明暗各一份，切轴不丢选择。 */
export interface ThemeToneSettings {
  lightTone: LightToneId
  darkTone: DarkToneId
}

/** 无用户写入时的默认值（也是 settings 的 base 层）。 */
export const DEFAULT_SETTINGS: ThemeToneSettings = Object.freeze({
  lightTone: 'official',
  darkTone: 'violet',
})

/** 浅色轴色调表（规则见 docs/spec/03-palette.md L1–L4）—— 与深色轴**严格镜像**：空间都用官方底色、光源用本色；**底色不染色**（三款共用同一个官方底色变量），色调只由打光表达。 */
export const LIGHT_TONES: Readonly<Record<LightToneId, ToneSpec>> = Object.freeze({
  official: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '',
    top: '',
    bottom: '',
    left: '',
    grain: false,
  }),
  sakura: Object.freeze({
    available: true,
    // 底色 = **官方配置**（三款相同，不再按本色染）—— 色调的差异只在光上。
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    /** **樱花粉**本色。色度取到 50：本色只以 `.16 ~ .30` 的 alpha 出现，叠在官方白底上后**色度会被压掉约 3 倍**
     * （旧值色度 8 → 实机只剩 2，就是「看不出是什么颜色」）；取 50 才与另两款（绿 50 / 蓝 90）音量对齐。 */
    tint: '248, 198, 214',
    top: toneGlow('248, 198, 214', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('248, 198, 214', 'light'),
    left: toneGlow('248, 198, 214', LIGHT_GLOW_ALPHA.left),
    grain: true,
  }),
  blue: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '145, 215, 235',
    top: toneGlow('145, 215, 235', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('145, 215, 235', 'light'),
    left: toneGlow('145, 215, 235', LIGHT_GLOW_ALPHA.left),
    grain: true,
  }),
  green: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '176, 226, 186',
    top: toneGlow('176, 226, 186', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('176, 226, 186', 'light'),
    left: toneGlow('176, 226, 186', LIGHT_GLOW_ALPHA.left),
    grain: true,
  }),
})

/**
 * 深色轴色调表（规则见 docs/spec/03-palette.md D1–D5）：**三款共享同一束金色光源**（`top` / `left` 都是 {@link DARK_GOLD_TINT}，
 * alpha 取 {@link DARK_GOLD_ALPHA}）—— 切换色调改变的是「空间」不是「光源」，差异只在底色与底部纵深。
 */
export const DARK_TONES: Readonly<Record<DarkToneId, ToneSpec>> = Object.freeze({
  official: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-950)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-900)',
    tint: '',
    top: '',
    bottom: '',
    left: '',
    grain: false,
  }),
  violet: Object.freeze({
    available: true,
    base: '#0a0a10',
    sidebarFill: '#14141c',
    // 本色 = pyai.site 的蓝紫（底色与纵深都以它为基准）。
    tint: '96, 78, 168',
    // 顶上两道**共享金光**（顶部居中 + 左上角金晕），alpha 由 DARK_GOLD_ALPHA 一处定，三款同步。
    top: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.top),
    // 本色仍是 pyai.site 原值；浓度按满屏 UI 上调（pyai.site 是留白为主的博客），alpha 见 {@link DEPTH_ALPHA}。
    bottom: depthGlow('96, 78, 168', 'dark'),
    left: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.left),
    grain: true,
  }),
  crimson: Object.freeze({
    available: true,
    // 底色色相跨度 5（violet 是 6）；三通道和仍是 36 ⇒ 亮度与 violet 严格相等，正文对比度不变。
    base: '#0f0a0b',
    sidebarFill: '#191415',
    // 本色：饱和度 S≈.43（原值 .49 偏夸张、压到 .37 又过头，取中间），只保留 crimson 的色相。
    tint: '144, 58, 86',
    top: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.top),
    bottom: depthGlow('144, 58, 86', 'dark'),
    left: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.left),
    grain: true,
  }),
  forest: Object.freeze({
    available: true,
    base: '#0a0f0b',
    sidebarFill: '#141915',
    tint: '55, 118, 92',
    top: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.top),
    bottom: depthGlow('55, 118, 92', 'dark'),
    left: toneGlow(DARK_GOLD_TINT, DARK_GOLD_ALPHA.left),
    grain: true,
  }),
})

/**
 * 插件**自己的光色变量**（不是官方 token）：背景层与浮层共用同一套色值，且必须发到 `body` 上 ——
 * 背景层的值写在它自己的内联样式上，而**浮层是官方元素**（portal 到 `body`），读不到那个元素上的变量。
 * `pick` 把色调表里的空串（= 不画）翻成 CSS 字面量 —— 空串在自定义属性里非法。
 */
export const LIGHT_TOKENS: readonly Readonly<{
  token: string
  pick: (tone: ToneSpec, scheme: ColorScheme) => string
}>[] = Object.freeze([
  Object.freeze({
    token: TOP_VARIABLE,
    pick: (tone: ToneSpec) => tone.top === '' ? 'transparent' : tone.top,
  }),
  Object.freeze({
    token: BOTTOM_VARIABLE,
    pick: (tone: ToneSpec) => tone.bottom === '' ? 'transparent' : tone.bottom,
  }),
  /** **左侧光晕**必须发到 `body` 上：浮层是 portal 到 `body` 的官方元素，读不到背景层元素上的内联变量 —— 漏了它所有弹层的左光一直是缺的。 */
  Object.freeze({
    token: LEFT_VARIABLE,
    pick: (tone: ToneSpec) => tone.left === '' ? 'transparent' : tone.left,
  }),
  Object.freeze({
    token: GRAIN_TILE_VARIABLE,
    // 贴图里烘的 alpha = `GRAIN_ALPHA` × `POPUP_GRAIN_COMPENSATION`（唯一来源在 constants.ts）。
    // ⚠️ **不能直接用 GRAIN_ALPHA**：浮层那条路没有 `mix-blend-mode: screen`，同一 alpha 会比背景层重约 43%。
    pick: (tone: ToneSpec, scheme: ColorScheme) =>
      tone.grain ? grainTileUri(popupGrainAlpha(scheme)) : 'none',
  }),
  /** **颗粒强度的运行期变量**（伪元素那种「贴图 + 独立 `opacity`」的颗粒层读它）—— 与上面那张贴图同源：两路都从 {@link GRAIN_ALPHA} 派生，减弱 = 改这一个对象。 */
  Object.freeze({
    token: GRAIN_ALPHA_VARIABLE,
    pick: (_tone: ToneSpec, scheme: ColorScheme) => String(GRAIN_ALPHA[scheme]),
  }),
])

/** 某一轴的完整色调表。 */
const TONES_BY_SCHEME: Readonly<Record<ColorScheme, Readonly<Record<string, ToneSpec>>>> = Object.freeze({
  light: LIGHT_TONES,
  dark: DARK_TONES,
})

/** 把任意输入收敛到一个合法明暗轴 —— **纯函数硬化**：非法值一律当浅色轴（与 {@link toneFieldFor} 同口径）；合法调用方永远给 `'light' | 'dark'`，这不是在修 bug。 */
export function normalizeScheme(scheme: unknown): ColorScheme {
  return scheme === 'dark' ? 'dark' : 'light'
}

/** 某一轴的色调 id 顺序。 */
export function toneIdsFor(scheme: ColorScheme): readonly ToneId[] {
  return scheme === 'dark' ? DARK_TONE_IDS : LIGHT_TONE_IDS
}

/** 某一轴的**可取**色调 id（设置行只渲染这些）。 */
export function availableToneIds(scheme: ColorScheme): ToneId[] {
  const tones = TONES_BY_SCHEME[normalizeScheme(scheme)]
  return toneIdsFor(normalizeScheme(scheme)).filter(id => tones[id]?.available === true)
}

/** 取某一轴上某个 id 的色调；id 不属于该轴（脏设置 / 跨轴串味）时回落到该轴默认。 */
export function toneFor(scheme: ColorScheme, id: ToneId): ToneSpec {
  const axis = normalizeScheme(scheme)
  const tones = TONES_BY_SCHEME[axis]
  const direct = tones[id]
  if (direct !== undefined && direct.available) return direct
  const fallbackId = axis === 'dark' ? DEFAULT_SETTINGS.darkTone : DEFAULT_SETTINGS.lightTone
  return tones[fallbackId] ?? LIGHT_TONES.official
}

/** 读某一轴当前选中的色调 id；脏值（不属于该轴、或仍是留位色）一律回落到该轴默认，避免「选中态显示 A、实际画 B」。 */
export function toneIdOf(settings: ThemeToneSettings, scheme: ColorScheme): ToneId {
  const axis = normalizeScheme(scheme)
  const candidate = axis === 'dark' ? settings?.darkTone : settings?.lightTone
  const spec = candidate === undefined ? undefined : TONES_BY_SCHEME[axis][candidate]
  if (spec !== undefined && spec.available) return candidate as ToneId
  return axis === 'dark' ? DEFAULT_SETTINGS.darkTone : DEFAULT_SETTINGS.lightTone
}

/** 某一轴对应的设置字段名 —— 立方块点击要写哪一个字段。 */
export function toneFieldFor(scheme: ColorScheme): 'lightTone' | 'darkTone' {
  return scheme === 'dark' ? 'darkTone' : 'lightTone'
}

/** 一侧的模式值对。 */
export interface TokenModes {
  light: string
  dark: string
}

/** 覆盖层的 token 字典（结构兼容官方 `ThemeTokenOverrides`，此处不 import 官方类型以保持本模块零依赖）。 */
export type TokenOverrides = Record<string, TokenModes>

/**
 * 由设置节算出 token 覆盖层。**两个模式都必须给**（官方对裸字符串抛错），各自取该轴当前选中款 —— 切轴时颜色已在位。
 * 四族：① 官方面（底色 / 左栏 / 抬升面 / 菜单族）；② 面内的中性件（交互态洗染、描边、滚动条）；
 * ③ 插件自己的光色（必须发到 `body`，浮层读不到背景层元素上的内联变量）；④ 浮层面板底色 `PANEL_VARIABLE`。
 */
export function tokenOverrides(settings: ThemeToneSettings): TokenOverrides {
  const light = toneFor('light', toneIdOf(settings, 'light'))
  const dark = toneFor('dark', toneIdOf(settings, 'dark'))
  const overrides: TokenOverrides = {
    '--dsw-alias-bg-base': { light: light.base, dark: dark.base },
    '--dsw-specific-sidebar-fill': { light: light.sidebarFill, dark: dark.sidebarFill },
  }
  for (const { token, rung } of SURFACE_TOKENS) {
    overrides[token] = {
      light: surfaceFill(light.tint, 'light', rung),
      dark: surfaceFill(dark.tint, 'dark', rung),
    }
  }
  // 菜单族：只给颜色，且保住官方 alpha（涂不透明会吃掉官方 backdrop-filter）；比例用 PANEL_TINT（浅色轴 0 → 直通官方）。
  for (const { token, official } of POPUP_TOKENS) {
    overrides[token] = {
      light: washFill(light.tint, 'light', official.light, PANEL_TINT.light),
      dark: washFill(dark.tint, 'dark', official.dark, PANEL_TINT.dark),
    }
  }
  // 浅灰内嵌面（代码块 / 三张停靠卡）：**独立通道、独立比例**，取官方自己那一档。
  for (const { token, official } of INSET_TOKENS) {
    overrides[token] = {
      light: rungFill(light.tint, official.light, INSET_TINT.light),
      dark: rungFill(dark.tint, official.dark, INSET_TINT.dark),
    }
  }
  // 浮层面板底色：单独发一份，给「自带硬编码底色」的弹层兜底（surface.ts 的选择器读它）。
  overrides[PANEL_VARIABLE] = {
    light: panelFill(light, 'light', 'layer3'),
    dark: panelFill(dark, 'dark', 'layer3'),
  }
  // 插件自己的光色：空串在 CSS 里非法，统一换成「什么都不画」的字面量。
  for (const { token, pick } of LIGHT_TOKENS) {
    overrides[token] = { light: pick(light, 'light'), dark: pick(dark, 'dark') }
  }
  // 顶光收束点：两轴同值（见 TOP_STOP）。
  overrides[TOP_STOP_VARIABLE] = { light: TOP_STOP, dark: TOP_STOP }
  // 交互态：无 alpha 的面走 color-mix，低 alpha 的洗染只换 RGB、保住 alpha。
  for (const entry of STATE_TOKENS) {
    overrides[entry.token] = {
      light: rungFill(light.tint, entry.light, SURFACE_TINT.light),
      dark: rungFill(dark.tint, entry.dark, SURFACE_TINT.dark),
    }
  }
  for (const { token, official } of [...WASH_TOKENS, ...BORDER_TOKENS]) {
    overrides[token] = {
      light: washFill(light.tint, 'light', official.light),
      dark: washFill(dark.tint, 'dark', official.dark),
    }
  }
  // 滚动条：实心变量引用，走 color-mix（与抬升面同一个比例）。
  for (const { token, light: lightRung, dark: darkRung } of SCROLLBAR_TOKENS) {
    overrides[token] = {
      light: rungFill(light.tint, lightRung, SURFACE_TINT.light),
      dark: rungFill(dark.tint, darkRung, SURFACE_TINT.dark),
    }
  }
  return overrides
}
