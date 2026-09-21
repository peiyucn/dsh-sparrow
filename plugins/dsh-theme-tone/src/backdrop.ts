/**
 * 背景层样式与渲染计划（纯逻辑，无宿主依赖）。
 *
 * 承载官方 token 装不下的东西：两个径向染色与颗粒纹理。
 * 层的显隐与色值由调用方按 {@link backdropPlan} 写进 DOM —— 不用 CSS 表达式，
 * 因为 `display` 无法由自定义属性决定。
 */

import {
  ABOVE_CONTENT_Z_INDEX,
  ABOVE_FLOAT_HOST_Z_INDEX,
  BACKDROP_CLASS,
  BACKDROP_Z_INDEX,
  BOTTOM_VARIABLE,
  CONTENT_ATTR,
  CONTENT_Z_INDEX,
  DOCKKIT_MENU_ATTR,
  GRAIN_ATTR,
  LEFT_VARIABLE,
  MARKER_ATTR,
  PLAIN_ATTR,
  RIGHT_PANEL_ATTR,
  RIGHT_FLOAT_HOST_ATTR,
  SHELL_OVERLAY_ATTR,
  SIDE_ATTR,
  TOP_STOP_VARIABLE,
  TOP_VARIABLE,
  WIDTH_HANDLE_ATTR,
} from './constants.js'
import { normalizeScheme, toneFor, toneIdOf, type ColorScheme, type ThemeToneSettings, type ToneId } from './tones.js'


/**
 * 颗粒叠加层不透明度（**深色轴**）—— 与 pyai.site `global.css:75` 一致。
 *
 * 浅色轴要更大的值，见 {@link GRAIN_OPACITY_LIGHT}。
 */
export const GRAIN_OPACITY = 0.13

/**
 * 颗粒不透明度（**浅色轴**）—— `.16`。
 *
 * ## 为什么比深色轴低，而且**不能**照抄 `.13`
 *
 * 两个轴的颗粒**方向相反**：深色轴 `screen` 是**加亮**（白点在暗底上 = 星光），
 * 浅色轴只能 `multiply` 是**压暗**（灰点盖白底）。所以：
 *
 * * 照抄 `.13` 太弱 —— 实测高频只有 1.641（深色轴 3.369）
 * * 但拉高到 `.28`（曾达到质感等值 3.446）会**全屏压暗 ~9 级**，
 *   owner 随即反馈「整体变亮」「水灵」—— 那层灰纱正是「不水灵」的来源
 *
 * 实测（真机，同一无 UI 区域；整体 = 三列 × 九点均值，Default 参照 252.4）：
 *
 * | opacity | 整体亮度 | 高频（质感） |
 * | :--- | :--- | :--- |
 * | 关 | 246.0 | 0.226 |
 * | `.28`（曾用） | 236.1 | 3.457 |
 * | **`.16`（本值）** | **240.1** | **2.129** |
 *
 * ## 为什么停在 `.16`：纹理与亮度是**线性权衡**，没有免费午餐
 *
 * 量了「偏白噪声」（`feComponentTransfer` 把噪声压向白端）能否两全：
 * 效率只高约 20%（质感/亮度损失 0.46 vs 0.39），**不值得多引入一张贴图**。
 * 根因是物理的：底色已近白，往上只剩几级余量，而纹理 = 方差 —— 近白面上要出纹理
 * **只能往下刻**，刻多深就掉多少亮度。
 * 所以浅色轴的质感**注定比深色轴弱一档**，这是近白底的固有代价，不是取值没调好。
 */
export const GRAIN_OPACITY_LIGHT = 0.16

/**
 * 颗粒纹理：200×200 `feTurbulence`（`fractalNoise` / `baseFrequency .8` /
 * `numOctaves 4` / `stitchTiles`）逐字取自 pyai.site `global.css:76`。
 * data URI 可行：应用外壳未设 CSP（`packages/**` 全树只有媒体响应自带 CSP）。
 */
export const GRAIN_DATA_URI
  = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/**
 * 深色轴径向染色的形状（与 pyai.site `SpaceBackdrop.astro:29-39` 同参数）。
 *
 * **几何一律用视口单位 `vw` / `vh`，不用 `%`** —— 背景层本身是满视口的 `position: fixed`，
 * 两者对它**完全等价**；但顶栏也要复用这串渐变（见 `BACKDROP_GRADIENTS`），而它只有 76px 高 ——
 * `%` 会按顶栏自身的盒子解析，把 `45%` 压成 34px 的扁椭圆，金光只剩顶部一条细边
 * （owner 反馈「**能看出来有一点，但不是特别明显**」的根因）。
 * 唯一的例外是横向中心 `at 50%`：它按**盒子**居中（背景层 = 视口中心；顶栏 = 中列中心，
 * 相差约一个左栏宽度，可接受 —— 用 `50vw` 反而会以盒子左缘为原点，偏得更多）。
 */
export const DARK_RADIAL_SHAPE = 'ellipse 80vw 45vh at 50% -10vh'

/** 底部径向染色的形状。 */
export const BOTTOM_RADIAL_SHAPE = 'ellipse 70vw 45vh at 50% 112vh'

/**
 * 上方金光的**默认**收束位置 —— pyai.site 原值 `62%`。
 *
 * 真机上的值经 {@link TOP_STOP_VARIABLE} 由 `tones.ts` 的 `TOP_STOP` 发出（两轴同值 `62%`，
 * 与这里一致）；本常量作为 **CSS 变量的 fallback** —— 变量缺失时（理论上不会，但守卫掉）
 * 退回原值，而不是退成「没有收束点」。
 */
export const RADIAL_STOP = '62%'

/**
 * **底部辉光单独的收束位置**（`transparent 95%`，pyai.site 是 62%）。
 *
 * 62% 时底部辉光只覆盖约 **16% 屏高**（中心 112%、竖直半径 45% → 112 − 45×0.62 = 84.1%）——
 * 一条 16% 高的极淡色带，而屏幕底部那带正好是 composer 与各种面板最密的地方，很容易看漏
 * （owner 反馈「底部辉光还是不明显」的根因）。收到 95% 则覆盖约 **31% 屏高**：从「一条边带」
 * 变成「一片底光」。
 *
 * 上方金光的收束**不跟着改** —— 把两处分开正是为了能单独调这一个方向。
 */
export const BOTTOM_RADIAL_STOP = 'transparent 95%'

/**
 * 左侧金晕的形状：锚在**视口左上角**的椭圆。
 * 官方没把左栏宽度暴露成 CSS 变量（`SidebarRoot` 是 inline width + hashed 类名），
 * 所以不按接缝定位 —— 锚左上角的椭圆让金色自然铺满左栏、并在左栏右缘一带收束成渐变，
 * 左栏宽度在 264–420px 之间变化时观感都成立。
 */
export const LEFT_RADIAL_SHAPE = 'ellipse 38vw 58vh at 0% -6vh'

/** 左侧金晕的收束位置（比主染色更早收，免得糊到对话列中间）。 */
export const LEFT_RADIAL_STOP = 'transparent 68%'

/**
 * 色调卡预览专用的染色形状。与整屏配方**同色相、同构成**，但几何按卡片尺寸放大。
 *
 * **卡面天生不可能等于实况**：实况的顶部金光（`ellipse 80% 45% at 50% -10%` + `62%`）
 * 只覆盖约 18% 的屏高 —— 照搬到一张 83px 高的卡上就是顶边十几像素，卡片会读成纯色
 * （owner 最早反馈的正是这个）。所以卡面按下面的几何做「同色相示意」：
 * 比实况铺得开，但比早期版本收了一档（owner 反馈「渐变有点过、和最终效果差距略大」）。
 * 拉回的程度由 `PREVIEW_ALPHA_SCALE` 与这几个形状共同决定，两者都可单独调。
 */
export const PREVIEW_TOP_SHAPE = 'ellipse 86% 70% at 50% -14%'

/** 预览底部染色形状。 */
export const PREVIEW_BOTTOM_SHAPE = 'ellipse 83% 70% at 50% 114%'

/** 预览左侧金晕形状。 */
export const PREVIEW_LEFT_SHAPE = 'ellipse 44% 80% at 0% -7%'

/** 预览染色的收束位置（比整屏的 `62%` 晚收一点，好让小卡也看得清渐变）。 */
export const PREVIEW_STOP = 'transparent 71%'

/**
 * 色调卡预览的**染色放大倍数**，**按层给**（不是按轴，也不是全局一个数）。
 *
 * 判据是「**这一层是否提供区分度**」：
 *
 * * `light`（`top` / `left`）：深色轴 = `1`（共享金，放大没意义）；
 *   浅色轴 = **`3`** —— 见下「2026-09-18 结构改动后的重算」。
 * * `depth`（各款自己的 `bottom`）= **按轴给**：深色 `3`、浅色 **`1.8`**。
 *
 * 取 1 的好处是**卡面的光与实况逐字一致**（1:1 保真），但那条只在「实况本身够显」时成立。
 *
 * ## 2026-09-18 结构改动后的重算（**这条倍数的职责没有变**）
 *
 * 倍数的唯一职责是「**让小卡看得见**」—— 判据 = 「卡面需要多少」÷「实况已有多少」。
 *
 * 浅色轴那次结构改动把三层光的实况 alpha 从 `.48/.54/.38` 降到 **`.16/.30/.19`**
 * （官方底色 + 主色打光，见 `tones.ts`）。而卡面 alpha 是**从色调表派生**的，
 * 于是跟着一起降 —— **实测三款区分度掉到阈下**（gray-green 5.7 / blue-green 5.8，
 * 人眼阈约 8），即 owner 早先抱怨过的「三种颜色在色卡上显示不是特别明显，看不出区别」。
 *
 * **修法：把倍数设成「把 alpha 抬回结构改动前那一档」** ——
 * `.16 × 3 = .48`、`.19 × 2 = .38`、`.30 × 1.8 = .54`，正好还原 owner 批准色卡时的观感：
 *
 * | 倍数 | gray-green | blue-green | 判定 |
 * | :--- | ---: | ---: | :--- |
 * | `1 / 1`（跟实况一起降） | 5.7 | 5.8 | ⚠️ 阈下，分不清 |
 * | **`3 / 1.8`（本值）** | **10.3** | **10.5** | ✅ 可辨 |
 * | `2 / 2` | 11.4 | 11.6 | ✅（更强，但卡面比实况浓得更多） |
 *
 * 代价是**浅色卡面不再与实况逐字相等**（这是刻意的：小卡需要更强的染色才看得见，
 * 与深色轴 `×3` 同一个道理）；「色卡与实况一致」这条在**深色轴**仍然成立。
 *
 * ## 为什么 `depth` 要按轴给（owner：「得和色卡看起来一样」）
 *
 * 它曾经对两轴都是 ×3，于是浅色轴出现一处**不对称**：卡面被放大 ×3、实况没有，
 * 结果「色卡上底部的渐变，在对话区和左边栏都看不出来」。
 * 现在两轴各自按需取：浅色 `1.8`（实况 `.30` 比深色显，倍数就该更小）、深色 `3`。
 *
 * **判据（以后新增轴/色调沿用）**：卡面倍数 = 「卡面需要多少」÷「实况已有多少」。
 */
export const PREVIEW_ALPHA_SCALE: Readonly<Record<ColorScheme, Readonly<Record<'light' | 'depth', number>>>> = Object.freeze({
  light: Object.freeze({ light: 3, depth: 1.8 }),
  dark: Object.freeze({ light: 1, depth: 3 }),
})

/**
 * 放大一个 `rgba(r, g, b, a)` 颜色的不透明度（上限 1）。
 * 不匹配该形式（空串、未来可能出现的 hex / 变量引用）时**原样返回** —— 安全默认，不猜。
 * @param color - 候选颜色字符串。
 * @param scale - 放大倍数。
 * @returns 放大 alpha 后的颜色，或原串。
 */
export function boostAlpha(color: string, scale: number): string {
  // 倍数 1 = 恒等：不重排字符串格式，让卡面与色调表逐字一致（浅色轴就是不放大）
  if (scale === 1) return color
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/u.exec(color)
  if (match === null) return color
  const alpha = Math.min(1, Number(match[4]) * scale)
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(3)})`
}

/**
 * 浏览器特性门 —— 任一缺失即自停用（**不降级**）。
 *
 * 三条都是「缺了整个插件就不成立」，而不是「缺了只是少点质感」：
 *
 * | 特性 | 缺了会怎样 | 为什么不能降级 |
 * | :--- | :--- | :--- |
 * | `mix-blend-mode: screen` | 深色轴的颗粒与光会改用正常合成 | 正常合成是**压暗**，会把内容一起压黑（不是「少一点效果」） |
 * | `radial-gradient()` | 背景层的光晕整个没了 | 色调的存在感主要靠它 |
 * | `color-mix()` | **22 / 38 个 token 的值直接失效** | 这些 token 是**染色本身**（抬升面 / 交互态 / 内嵌面的色值全靠它算），失效后多数面回落到官方原色 —— 等于插件基本没生效，却还占着设置行 |
 *
 * **`backdrop-filter` 有意不在门里**（判据见 04-glass §6）：缺它只是玻璃退化成半透明面板，
 * 色调那部分照常工作 —— 为它停用整个插件不划算。
 *
 * **`:has()` 也有意不门**：它只用在几条**锚点**规则上（surface 表 4 处 / 缝挡板 6 处），
 * 缺失时那几条规则不命中、那些面退化回官方外观，但 token 层与背景层照常工作 ——
 * 属于「少覆盖几个面」而非「插件失效」。旧引擎多半正是缺 `:has()` 的那一类，
 * 为它停用会让本可正常工作的色调一起没了。
 */
export const REQUIRED_CSS_FEATURES: readonly { name: string; probe: string }[] = Object.freeze([
  Object.freeze({ name: 'mix-blend-mode: screen', probe: 'mix-blend-mode: screen' }),
  Object.freeze({ name: 'radial-gradient()', probe: 'background: radial-gradient(red, blue)' }),
  Object.freeze({ name: 'color-mix()', probe: 'color: color-mix(in srgb, red 50%, blue)' }),
])

/**
 * 背景层的**三段渐变栈**（上光 / 下深 / 左光）—— 抽出来给两处共用。
 *
 * **为什么需要共用**：被抬到背景层**之上**的 chrome 会**吃不到这层光**。顶栏就是受害者 ——
 * 它原本在 z-index 9，背景层（80）压在它上面，那层顶光其实是**直接盖在顶栏上**的；
 * 顶栏为了不被内容盖住而抬到 82 之后，光就没了（owner：「怎么顶栏的金光没有了」）。
 * 所以顶栏要**自己把这套渐变再画一遍**（见 `glass.ts` 的顶栏规则），两边必须同源。
 *
 * 用它的地方要配 `background-attachment: fixed` —— 背景层自己是 `position: fixed`，
 * 百分比天然按视口解析；而顶栏只有 76px 高，同一串 `ellipse 80% 45%` 若按**自身盒子**
 * 解析会重新缩放成一条硬边带（`surface.ts` 记过这个坑）。`fixed` 让百分比也按视口解析，
 * 于是两处的渐变**逐像素对齐**。
 */
export const BACKDROP_GRADIENTS = `radial-gradient(${DARK_RADIAL_SHAPE}, var(${TOP_VARIABLE}, transparent), transparent var(${TOP_STOP_VARIABLE}, ${RADIAL_STOP})),
    radial-gradient(${BOTTOM_RADIAL_SHAPE}, var(${BOTTOM_VARIABLE}, transparent), ${BOTTOM_RADIAL_STOP}),
    radial-gradient(${LEFT_RADIAL_SHAPE}, var(${LEFT_VARIABLE}, transparent), ${LEFT_RADIAL_STOP})`

/*
 * `dimmedBackdropGradients(scale)` —— 把上面这串渐变**按比例压强度**（形状与几何一字不改）。
 *
 * 为什么需要：**被抬到背景层之上的面要把背景"原样重画一遍"**，否则那一块没有光（顶栏、
 * 右边栏、输入框底座三处都是这个处境）。但重画时必须**按该面自己的填充 alpha 同步压光**，
 * 否则画出来的是「淡的底色 + 满的光」，比周围**亮一截** —— owner 一眼看出「**相当于两层光了**」。
 *
 * 数学：设该点的页面色 `P = 底色 + L`，面以 alpha `a` 画 `C`，合成 `a·C + (1−a)·P`。
 * 要让结果**恒等于 P**，必须 `C = P`；而面只能画 `a` 档，所以 `C = a·P = a·底 + a·L`
 * —— **底色与光都要乘 `a`**。本函数负责乘光那一半。
 *
 * ⚠️ 曾被误删过一次（当时只有扫光带在用，随那次改动一起撤了）；底座的「纯色平板」
 * 与「两层光」两个 bug 都指向同一件事，故以带注释的形式固定在这里。
 */
export function dimmedBackdropGradients(scale: number): string {
  const dim = (token: string): string =>
    `color-mix(in srgb, var(${token}, transparent) ${Math.round(scale * 100)}%, transparent)`
  return `radial-gradient(${DARK_RADIAL_SHAPE}, ${dim(TOP_VARIABLE)}, transparent var(${TOP_STOP_VARIABLE}, ${RADIAL_STOP})),
    radial-gradient(${BOTTOM_RADIAL_SHAPE}, ${dim(BOTTOM_VARIABLE)}, ${BOTTOM_RADIAL_STOP}),
    radial-gradient(${LEFT_RADIAL_SHAPE}, ${dim(LEFT_VARIABLE)}, ${LEFT_RADIAL_STOP})`
}

/**
 * 背景层的样式表文本。z-index 与标记属性都来自常量，便于单测钉住契约。
 * @returns 注入 `<style>` 的 CSS 文本。
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
  opacity: ${GRAIN_OPACITY};
  background-image: ${GRAIN_DATA_URI};
}
.${BACKDROP_CLASS}[${GRAIN_ATTR}='off']::after {
  display: none;
}
/* 深色轴：screen 是纯加法，只加亮、永不压暗或遮住内容，故敢压在内容之上 */
body[data-ds-dark-theme] .${BACKDROP_CLASS},
body[data-ds-dark-theme] .${BACKDROP_CLASS}::after {
  mix-blend-mode: screen;
}
/* 浅色轴：白底上 screen 饱和失效（1-(1-a)(1-b) 仍接近白），改用 multiply + 更大的
   opacity（见 GRAIN_OPACITY_LIGHT）—— 这样两个轴的**质感强度**才对等（实测高频 3.4 vs 3.4）。 */
body:not([data-ds-dark-theme]) .${BACKDROP_CLASS} {
  mix-blend-mode: normal;
}
body:not([data-ds-dark-theme]) .${BACKDROP_CLASS}::after {
  mix-blend-mode: multiply;
  opacity: ${GRAIN_OPACITY_LIGHT};
}
/* ===== 用户内容豁免 =====
   背景层为了给「应用底 + 左右栏 + 对话区」着色，必须压在内容之上；但用户内容
   （消息正文、**用户发的图片**、输入框）不该被染色或上颗粒。
   修法：把**对话内容整体**抬到背景层之上 —— 不是抬单个 img，因为 img 会同时高过
   没有 z-index 的输入框（图片滚动时浮在输入框上），而输入框就在同一个滚动容器里。
   对话区底色由祖先 root 画，仍在层下 → **背景照常着色，内容干净**。 */
body:not([${PLAIN_ATTR}]) [${CONTENT_ATTR}] {
  position: relative;
  z-index: ${CONTENT_Z_INDEX};
}
/* 内容抬到 81 后，这些官方层必须跟着抬到 82 才不会被内容盖住。
   清单与「为什么」见 constants.ts 的 ABOVE_CONTENT_Z_INDEX —— 那是一条**不变式**：
   凡 z-index < 81 且要压在内容之上的官方层，都得抬。
   对话顶栏不在这里（它的 z-index 在 glass.ts，是玻璃规则的一部分），同样取 82。
   注意 dockkit 标签菜单取的是**更高一档**（83）—— 官方明写它必须高于右栏浮层宿主
   （dockkit.module.css:438-443 原话：a menu opened from a tab must never sit under a panel），
   两个层号必须一起抬才能保住这个次序（60/70 → 82/83）。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}],
body:not([${PLAIN_ATTR}]) [${SHELL_OVERLAY_ATTR}],
body:not([${PLAIN_ATTR}]) [${RIGHT_FLOAT_HOST_ATTR}] {
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
body:not([${PLAIN_ATTR}]) [${DOCKKIT_MENU_ATTR}] {
  z-index: ${ABOVE_FLOAT_HOST_Z_INDEX};
}
/* **拖拽条**（拖它调左右栏 / 对话区宽度）—— owner 真机报「调整对话区域的条整没了」。
   官方有**两条**，属性不同（见 constants.ts 的 WIDTH_HANDLE_ATTR）：
   ① ConversationRoot 那条有独有属性 data-width-handle；
   ② AppFrame 那条只有 data-side，而官方**三处**在用 data-side（含 Tooltip 的 placement），
      所以必须排除掉 tooltip（它自己就是浮层，是 role='tooltip'）。
   两条本来都是低 z-index 的 absolute 元素，会被抬到 81 的内容层整条盖掉。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) [${WIDTH_HANDLE_ATTR}],
body:not([${PLAIN_ATTR}]) [${SIDE_ATTR}]:not([role='tooltip']) {
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
`
}

/** 一次渲染要写进背景层的全部信息。 */
export interface BackdropPlan {
  /** 当前明暗轴。 */
  scheme: ColorScheme
  /** 是否隐藏整层（当前色调没有染色 → 等价于不画）。 */
  hidden: boolean
  /** 顶部染色色值。 */
  top: string
  /** 底部染色色值。 */
  bottom: string
  /** 左侧金晕色值；`''` = 不画。 */
  left: string
  /** 是否叠颗粒。 */
  grain: boolean
}

/**
 * 由当前轴与设置节算出渲染计划。当前轴的色调没有染色色值（`official` 或留位色被脏写入）时隐藏整层。
 * @param scheme - 当前解析出的明暗轴（`system` 已由 ui-theme 解析；脏值按浅色轴处理）。
 * @param settings - 已解析的设置节（`null` / `undefined` 按空设置处理）。
 * @returns 背景层渲染计划。
 */
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
 * 色调卡的**所见即所得预览**：同一套色值与同一套构成（底色 + 顶部 / 底部染色 +
 * 左侧金晕），按卡片尺度做两处调整 ——
 * 1. 几何换成 {@link PREVIEW_TOP_SHAPE} 一类的**卡片尺度**形状（整屏形状在小卡上会把染色全落在盒外）；
 * 2. **共享光层不放大、各款自己的纵深放大**，判据见 {@link PREVIEW_ALPHA_SCALE} ——
 *    放大「大家都一样的部分」只会让三张卡互相盖住，卡面就看不出区别了。
 *
 * 颗粒由样式表的 `.cube::after` 承担（`mix-blend-mode: screen` 没法用 inline style 表达），
 * 组件只需按 `tone.grain` 打 `data-grain`。
 * @param scheme - 明暗轴（脏值按浅色轴处理）。
 * @param id - 该轴上要预览的色调 id。
 * @returns 可直接摊进 React `style` 的背景两件套。
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

/** 背景层元素的标记属性选择器（HMR / 重载去重与卸载清理共用）。 */
export const BACKDROP_SELECTOR = `[${MARKER_ATTR}]`

/** 背景层**元素**选择器：带 `div` 限定，避免命中同样带标记属性的 `<style>`。 */
export const LAYER_SELECTOR = `div[${MARKER_ATTR}]`

/** 背景层样式表的选择器。 */
export const STYLE_SELECTOR = `style[${MARKER_ATTR}]`

