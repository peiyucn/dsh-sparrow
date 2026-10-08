/**
 * 背景层样式与渲染计划（纯逻辑，无宿主依赖）—— 承载官方 token 装不下的东西（两个径向染色与颗粒纹理）；层的显隐与
 * 色值由调用方按 {@link backdropPlan} 写进 DOM（不用 CSS 表达式：`display` 无法由自定义属性决定）。
 */

import {
  ABOVE_CONTENT_Z_INDEX,
  BACKDROP_CLASS,
  BACKDROP_Z_INDEX,
  BOTTOM_VARIABLE,
  CONTENT_ATTR,
  CONTENT_Z_INDEX,
  DOCKKIT_MENU_ATTR,
  GRAIN_ALPHA,
  GRAIN_ALPHA_VARIABLE,
  GRAIN_ATTR,
  GRAIN_TILE_VARIABLE,
  LEFT_VARIABLE,
  MARKER_ATTR,
  PLAIN_ATTR,
  RIGHT_PANEL_ATTR,
  SHELL_OVERLAY_ATTR,
  SIDE_ATTR,
  TAB_MENU_Z_INDEX,
  TOP_STOP_VARIABLE,
  TOP_VARIABLE,
  WIDTH_HANDLE_ATTR,
} from './constants.js'
import { normalizeScheme, toneFor, toneIdOf, type ColorScheme, type ThemeToneSettings, type ToneId } from './tones.js'


/**
 * 颗粒叠加层不透明度（**深色轴**）。**唯一来源是 constants.ts 的 {@link GRAIN_ALPHA}**（这里保留名字只为兼容既有引用），
 * **不要再在这里改数字**；浅色轴见 {@link GRAIN_OPACITY_LIGHT}。
 */
export const GRAIN_OPACITY = GRAIN_ALPHA.dark

/**
 * 颗粒不透明度（**浅色轴**）—— 取值 `.16`：两轴颗粒方向相反（深色轴 `screen` 加亮、浅色轴只能 `multiply` 压暗），
 * 近白底往上只剩几级余量 ⇒ 纹理与亮度是**线性权衡**：`.13` 太弱、`.28` 会全屏压暗一档。
 */
export const GRAIN_OPACITY_LIGHT = GRAIN_ALPHA.light

/** 颗粒纹理：200×200 `feTurbulence`，逐字取自 pyai.site `global.css`；data URI 可行是因为应用外壳未设 CSP。 */
export const GRAIN_DATA_URI
  = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/**
 * 深色轴径向染色的形状（与 pyai.site 同参数）。**几何一律用 `vw` / `vh` 不用 `%`**：顶栏（76px 高）复用同一串
 * 渐变时，`%` 会按顶栏自身盒子解析、把 `45%` 压成扁椭圆 ⇒ 金光只剩顶部一条细边。
 */
export const DARK_RADIAL_SHAPE = 'ellipse 80vw 45vh at 50% -10vh'

export const BOTTOM_RADIAL_SHAPE = 'ellipse 70vw 45vh at 50% 112vh'

/** 上方金光的**默认**收束位置（pyai.site 原值 `62%`）—— 运行期经 {@link TOP_STOP_VARIABLE} 由 `tones.ts` 的 `TOP_STOP` 发出；本常量只是 CSS 变量 fallback。 */
export const RADIAL_STOP = '62%'

/**
 * **底部辉光单独的收束位置**（`transparent 95%`，pyai.site 是 62%）：62% 只覆盖约 16% 屏高、而屏幕底部那带
 * 最密（composer 与各种面板），很容易看漏；95% 覆盖约 31% 屏高。上方金光的收束**不跟着改**。
 */
export const BOTTOM_RADIAL_STOP = 'transparent 95%'

/** 左侧金晕的形状：锚在**视口左上角**的椭圆 —— 官方没把左栏宽度暴露成 CSS 变量（`SidebarRoot`
 * 是 inline width + hashed 类名），锚左上角无需知道接缝在哪，左栏宽度变化时观感都成立。 */
export const LEFT_RADIAL_SHAPE = 'ellipse 38vw 58vh at 0% -6vh'

/** 左侧金晕的收束位置（比主染色更早收，免得糊到对话列中间）。 */
export const LEFT_RADIAL_STOP = 'transparent 68%'

/**
 * 色调卡预览专用的染色形状：与整屏配方**同色相、同构成**，几何按卡片尺度放大 —— **卡面天生不可能等于实况**
 * （实况顶部金光只覆盖约 18% 屏高，照搬到 83px 高的卡上就是顶边十几像素、卡片会读成纯色）。
 */
export const PREVIEW_TOP_SHAPE = 'ellipse 86% 70% at 50% -14%'

export const PREVIEW_BOTTOM_SHAPE = 'ellipse 83% 70% at 50% 114%'

export const PREVIEW_LEFT_SHAPE = 'ellipse 44% 80% at 0% -7%'

/** 预览染色的收束位置（比整屏的 `62%` 晚收一点，好让小卡也看得清渐变）。 */
export const PREVIEW_STOP = 'transparent 71%'

/**
 * 色调卡预览的**染色放大倍数**，按层给（判据 = 「这一层是否提供区分度」）：共享光层 `light` 深色轴 ×1
 * （共享金，放大没意义）、浅色轴 ×3（浅轴实况 alpha 低，不放大卡面读不出色）；`depth` 深色 ×3、浅色 ×1.8。
 */
export const PREVIEW_ALPHA_SCALE: Readonly<Record<ColorScheme, Readonly<Record<'light' | 'depth', number>>>> = Object.freeze({
  light: Object.freeze({ light: 3, depth: 1.8 }),
  dark: Object.freeze({ light: 1, depth: 3 }),
})

/** 放大一个 `rgba(r, g, b, a)` 颜色的不透明度（上限 1）；形式不匹配（空串 / hex / 变量引用）时**原样返回**（安全默认，不猜）。 */
export function boostAlpha(color: string, scale: number): string {
  // 倍数 1 = 恒等：不重排字符串格式，让卡面与色调表逐字一致（浅色轴就是不放大）
  if (scale === 1) return color
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/u.exec(color)
  if (match === null) return color
  const alpha = Math.min(1, Number(match[4]) * scale)
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(3)})`
}

/**
 * 浏览器特性门 —— 任一缺失即自停用（**不降级**）：三条缺了都是「整个插件不成立」而非「少点质感」（缺 `color-mix()` 会让
 * 22 / 38 个 token 的值直接失效）；`backdrop-filter` / `:has()` **有意不在门里**（缺了只是玻璃退化 / 少覆盖几个面）。
 */
export const REQUIRED_CSS_FEATURES: readonly { name: string; probe: string }[] = Object.freeze([
  Object.freeze({ name: 'mix-blend-mode: screen', probe: 'mix-blend-mode: screen' }),
  Object.freeze({ name: 'radial-gradient()', probe: 'background: radial-gradient(red, blue)' }),
  Object.freeze({ name: 'color-mix()', probe: 'color: color-mix(in srgb, red 50%, blue)' }),
])

/**
 * 背景层的**三段渐变栈**（上光 / 下深 / 左光）—— 被抬到背景层**之上**的 chrome（顶栏）吃不到这层光，
 * 必须**自己把这套渐变再画一遍**，两边必须同源；用它要配 `background-attachment: fixed`，否则 `%` 按自身盒子解析。
 */
export const BACKDROP_GRADIENTS = `radial-gradient(${DARK_RADIAL_SHAPE}, var(${TOP_VARIABLE}, transparent), transparent var(${TOP_STOP_VARIABLE}, ${RADIAL_STOP})),
    radial-gradient(${BOTTOM_RADIAL_SHAPE}, var(${BOTTOM_VARIABLE}, transparent), ${BOTTOM_RADIAL_STOP}),
    radial-gradient(${LEFT_RADIAL_SHAPE}, var(${LEFT_VARIABLE}, transparent), ${LEFT_RADIAL_STOP})`

/** 「**颗粒 + 背景层那串光**」两行 —— 凡把背景原样重画一遍的地方都用它（底座 / 右边栏 / 扫光带）；
 * 共用的是这两行、不是整条规则（三处外围各异），抽出来只为「颗粒与光必须同源」不被漏抄。 */
export function grainOverGradients(): string {
  return `var(${GRAIN_TILE_VARIABLE}, none),\n    ${BACKDROP_GRADIENTS}`
}

/*
 * 把上面这串渐变**按比例压强度**（形状与几何一字不改）：重画背景的面必须**按该面自己的填充 alpha 同步压光**，否则画出来是
 * 「淡的底色 + 满的光」、比周围亮一截（数学：面画 alpha `a` 时 `C = a·底 + a·光` ⇒ 底色与光都要乘 `a`，本函数负责光那一半）。
 */
export function dimmedBackdropGradients(scale: number): string {
  const dim = (token: string): string =>
    `color-mix(in srgb, var(${token}, transparent) ${Math.round(scale * 100)}%, transparent)`
  return `radial-gradient(${DARK_RADIAL_SHAPE}, ${dim(TOP_VARIABLE)}, transparent var(${TOP_STOP_VARIABLE}, ${RADIAL_STOP})),
    radial-gradient(${BOTTOM_RADIAL_SHAPE}, ${dim(BOTTOM_VARIABLE)}, ${BOTTOM_RADIAL_STOP}),
    radial-gradient(${LEFT_RADIAL_SHAPE}, ${dim(LEFT_VARIABLE)}, ${LEFT_RADIAL_STOP})`
}

/**
 * 把 {@link dimmedBackdropGradients} 那束光**叠成两层**（第二层按 `boost` 压过）—— 形状 / 中心 / stop 不动，只抬有效 alpha。
 * ⚠️ `scale` 拧不过 1（`color-mix` 百分比超 100% 会被钳到 100%），想画强一档只能**再叠一层**；补偿有上限（台阶翻负即过）。
 */
export function compensatedBackdropGradients(base: number, boost: number): string {
  if (boost <= 0) return dimmedBackdropGradients(base)
  return `${dimmedBackdropGradients(base)},\n    ${dimmedBackdropGradients(boost)}`
}

/**
 * 背景层的样式表文本（z-index 与标记属性都来自常量，便于单测钉住契约）。⚠️ 表内**不写注释**（会随发布产物出货）：
 * 层级不变式见 constants.ts 的 ABOVE_CONTENT_Z_INDEX 与 WIDTH_HANDLE_ATTR（`data-side` 三处消费 ⇒ 必须排除 `role='tooltip'`）。
 */
export function buildBackdropCss(): string {
  return `/* dsh-theme-tone 背景层（插件自有；卸载时整表移除即恢复官方外观） */
.${BACKDROP_CLASS} {
  position: fixed;
  inset: 0;
  z-index: ${BACKDROP_Z_INDEX};
  pointer-events: none;
  background-image: ${BACKDROP_GRADIENTS};
}
.${BACKDROP_CLASS}[hidden] {
  display: none;
}
.${BACKDROP_CLASS}::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY});
  background-image: ${GRAIN_DATA_URI};
}
.${BACKDROP_CLASS}[${GRAIN_ATTR}='off']::after {
  display: none;
}
body[data-ds-dark-theme] .${BACKDROP_CLASS},
body[data-ds-dark-theme] .${BACKDROP_CLASS}::after {
  mix-blend-mode: screen;
}
body:not([data-ds-dark-theme]) .${BACKDROP_CLASS} {
  mix-blend-mode: normal;
}
body:not([data-ds-dark-theme]) .${BACKDROP_CLASS}::after {
  mix-blend-mode: multiply;
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY_LIGHT});
}
body:not([${PLAIN_ATTR}]) [${CONTENT_ATTR}] {
  position: relative;
  z-index: ${CONTENT_Z_INDEX};
}
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}],
body:not([${PLAIN_ATTR}]) [${SHELL_OVERLAY_ATTR}] {
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
body:not([${PLAIN_ATTR}]) [${DOCKKIT_MENU_ATTR}] {
  z-index: ${TAB_MENU_Z_INDEX};
}
body:not([${PLAIN_ATTR}]) [${WIDTH_HANDLE_ATTR}],
body:not([${PLAIN_ATTR}]) [${SIDE_ATTR}]:not([role='tooltip']) {
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
`
}

/** 一次渲染要写进背景层的全部信息（`left` = `''` 表示不画）。 */
export interface BackdropPlan {
  scheme: ColorScheme
  hidden: boolean
  top: string
  bottom: string
  left: string
  grain: boolean
}

/** 由当前轴与设置节算出渲染计划。该轴的色调没有染色色值（`official` 或留位色被脏写入）时隐藏整层。 */
export function backdropPlan(scheme: ColorScheme, settings: ThemeToneSettings): BackdropPlan {
  const axis = normalizeScheme(scheme)
  const tone = toneFor(axis, toneIdOf(settings, axis))
  const painted = tone.top !== '' && tone.bottom !== ''
  return {
    scheme: axis,
    hidden: !painted,
    top: tone.top,
    bottom: tone.bottom,
    left: painted ? tone.left : '',
    grain: painted && tone.grain,
  }
}

/**
 * 色调卡的**所见即所得预览**：同一套色值与构成，按卡片尺度换几何（见 {@link PREVIEW_TOP_SHAPE}）、共享光层不放大而各款纵深放大
 * （判据见 {@link PREVIEW_ALPHA_SCALE}）；颗粒由样式表的 `.cube::after` 承担，组件只需按 `tone.grain` 打 `data-grain`。
 */
export function tonePreview(scheme: ColorScheme, id: ToneId): { backgroundColor: string; backgroundImage: string } {
  const axis = normalizeScheme(scheme)
  const tone = toneFor(axis, id)
  if (tone.top === '' || tone.bottom === '') {
    return { backgroundColor: tone.base, backgroundImage: 'none' }
  }
  const scale = PREVIEW_ALPHA_SCALE[axis]
  const light = (color: string): string => boostAlpha(color, scale.light)
  const depth = (color: string): string => boostAlpha(color, scale.depth)
  const layers = [
    `radial-gradient(${PREVIEW_TOP_SHAPE}, ${light(tone.top)}, ${PREVIEW_STOP})`,
    `radial-gradient(${PREVIEW_BOTTOM_SHAPE}, ${depth(tone.bottom)}, ${PREVIEW_STOP})`,
  ]
  if (tone.left !== '') layers.push(`radial-gradient(${PREVIEW_LEFT_SHAPE}, ${light(tone.left)}, ${PREVIEW_STOP})`)
  return { backgroundColor: tone.base, backgroundImage: layers.join(', ') }
}

/** 背景层元素的标记属性选择器。 */
export const BACKDROP_SELECTOR = `[${MARKER_ATTR}]`

/** 背景层**元素**选择器：带 `div` 限定，避免命中同样带标记属性的 `<style>`。 */
export const LAYER_SELECTOR = `div[${MARKER_ATTR}]`

export const STYLE_SELECTOR = `style[${MARKER_ATTR}]`
