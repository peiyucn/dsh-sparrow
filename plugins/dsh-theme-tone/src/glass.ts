/**
 * 玻璃效果（`backdrop-filter`）：对话顶栏 + 输入框。只有「压在滚动内容之上」的元素才配做玻璃（背后是纯色，模糊纯色 = 肉眼零变化）；浮层走 `src/surface.ts` 的实色 + 颗粒，两件事正交。
 * 本表每条规则都带 `body:not([PLAIN_ATTR])` 前缀：选「官方默认」轴时整表不命中，外观与没装插件逐像素一致。
 * ⚠️ `buildGlassCss` / `buildCardNotchCss` / `buildSeamCss` 的模板字符串里的注释**不能出现反引号**（会截断字符串）。
 */

import { ABOVE_CONTENT_Z_INDEX, GRAIN_ALPHA_VARIABLE, PHASE_BAND_ATTR, PHASE_BAND_TOP_VARIABLE, PHASE_BAND_VARIABLE, PHASE_NOTCH_ATTR, PHASE_NOTCH_TOP_VARIABLE, PHASE_NOTCH_VARIABLE, PLAIN_ATTR, RIGHT_PANEL_ATTR, WORKSTART_ATTR } from './constants.js'
import { ANCHOR, anchorSelector } from './anchors.js'
import { BACKDROP_GRADIENTS, GRAIN_DATA_URI, GRAIN_OPACITY, GRAIN_OPACITY_LIGHT, compensatedBackdropGradients, grainOverGradients } from './backdrop.js'

/** 顶栏高度（px）：官方钉死 76px（= 左栏两条 38px 带之和），本模块的补高 / 滚条偏移 / 拖拽条裁切都按它算。 */
export const HEADER_HEIGHT_PX = 76

/** 右栏顶部**两条 38px 带**里上面那条（dockkit 条）的高度；两条带叠成 {@link HEADER_HEIGHT_PX}，而「内容从带下滚过」的补偿量要按**两条之和**算（两条带各自是独立盒子）。 */
export const PANEL_BAND_PX = 38

/** 右栏面板的滚区**上提量**（px）= 两条带之和：把裁切框提到这 76px 之上，正文才真的从两条带下面滚过（否则糊一块均匀纯色 = 零变化）；⚠️ 补偿位移**只能用 transform，不能用 padding-top**（官方跳行吃 `offsetTop`，它算 padding、不算 transform）。 */
export const PANEL_SCROLLER_LIFT_PX = PANEL_BAND_PX * 2

/** 底座下半段**实色**带的高度（px）：只到卡片下沿为止，盖住下面那条统计行；取**不透明**是因为要恒等于周围页面色（C = P，a = 1 时原样画满即可，没有可调错的比例）。 */
// ⚠️ 只许锚座底、只许很矮 —— 曾经做成覆盖**整个底座**的 `::before { inset: 0 }`，两侧留白被糊成两块竖直暗矩形且跟着输入框变高，已撤，别再加回来。
export const SEAT_SOLID_PX = 36

/** 上面那条实色带**顶端**的过渡高度（px）：硬切会在带顶留一道边；这段过渡**落在卡片背后**（卡片不透明到哪里，过渡就藏到哪里），故既不产生缝、也不抢卡片的玻璃。 */
export const SEAT_SOLID_RAMP_PX = 10

/** **顶栏 / 输入框底座**的模糊：只提饱和不加亮度，避免玻璃面在深色底上发灰；大模糊会**抹掉背后内容的形状**、只剩一团平均色（读起来像磨砂塑料），故收到 `12px`（仍化得开文字与图标，又保留可辨的形状与流动感）。 */
export const GLASS_BLUR = 'blur(12px) saturate(1.15)'

/** **镜面高光的四条边**（从上开始顺时针）—— 液态玻璃的「玻璃厚度」：高光沿玻璃**整圈边缘**、随主光方向强弱不同（四条等亮的边是塑料描边，不是玻璃）；按主光来自左上分配为上 `30%` / 左 `20%` / 右 `12%`（背光）/ 下 `8%`（地面反射）。 */
// ⚠️ 只用在**输入框卡片**上 —— 模态弹窗是内容面（列表 / 卡片 / 媒体内容），不做玻璃。
/** 镜面高光环的一条（`inset` 阴影）。 */
export interface GlassRing {
  key: 'top' | 'bottom' | 'left' | 'right'
  /** 偏移把亮边推到**对侧**：`x: 1` → 亮在**左**缘。 */
  x: number
  /** 同 x 的对侧规则：`y: 1` → 亮在**上**缘。 */
  y: number
  /** 模糊半径：0 = 锐利窄线（直射高光）；> 0 = 柔和宽晕（焦散）。 */
  blur: number
  spread: number
  alpha: number
}

/** 玻璃边光的**光路模型** —— 光从**左上方**打来：两边高光 + 一边阴影（右缘，背光侧壁）+ 底缘焦散；四边都给光就丢了光源方向，那正是「看着假」的根源。 */
// ⚠️ 主光是 `background-image` 的两条细长椭圆（{@link GLASS_EDGE_TOP} / {@link GLASS_EDGE_LEFT}），本常量里的 `top` / `bottom` 只是**底光**；右缘阴影在 {@link GLASS_SHADE_RING}。
export const GLASS_SPECULAR_RING: readonly GlassRing[] = Object.freeze([
  // ⚠️ 这些只是**底光**（主光是 background-image 的两条细长椭圆，见 GLASS_EDGE_TOP/LEFT）。
  // 数值别再单方向推：回落幅度总要**小于**当初的加大幅度，「柔但不厚」的区间是 2~2.2px，回到 0 就又变回描边。
  Object.freeze({ key: 'top', x: 0, y: 1, blur: 2, spread: 0, alpha: 0.14 }),
  Object.freeze({ key: 'bottom', x: 0, y: -1, blur: 2.2, spread: 0, alpha: 0.09 }),
  // ⚠️ **没有 left** —— 左边由渐变层（GLASS_EDGE_LEFT）单独负责，两处都写会**叠加**把左缘又拉宽回去。
  // ⚠️ **没有 right** —— 右缘是**阴影**，在 GLASS_SHADE_RING 里，不是这里。
])

/** **沿边衰减的边光**（`background-image` 图层）：`inset box-shadow` 的每条边天生均匀、只能做「一圈等亮的壁」（读起来就是一圈薄描边），故改用锚在光源角落的**细长椭圆** `radial-gradient` —— 横向半径给出沿边衰减、很扁的纵向半径给出向内柔化，两条都锚在同一个角 ⇒ 左上角最亮。 */
export interface GlassEdgeFade {
  /** 横向半径（占元素宽度的比例；`>1` 表示铺满整条边）。 */
  rx: number
  ry: number
  alpha: number
  /** 衰减到透明的停止点（占半径的比例）。大 = 收得晚、光更长。 */
  stop: number
}

/** 上缘的光（横向长、纵向极扁）：沿上边向右衰减、同时往内柔化；`ry` 是**厚度感的主要来源**（与 {@link GLASS_SPECULAR_RING} 的 `bottom.blur` 一起决定「看起来多厚」，调一个要想到另一个）。 */
// ⚠️ `ry` 下界 `0.03` 是量出来的**描边阈值**（`0.020` 那档可见带只剩 2px、已「过于锐利」）、上界 `0.05`；且**别用压 `alpha` 代替收宽度** —— 要的是「薄」（宽度）不是「淡」（亮度），收亮度会让光源方向丢掉。
export const GLASS_EDGE_TOP: GlassEdgeFade = Object.freeze({
  rx: 1.1,
  ry: 0.03,
  alpha: 0.28,
  stop: 0.60,
})

/** 左缘的光（纵向长、横向**很窄**）：沿左边向下衰减、同时往内柔化；⚠️ alpha 必须**明显低于上缘**（不是「略低」）、横向半径必须小 —— 侧壁的光只是「透过玻璃看到厚度」，否则就从「侧壁光」变成「左侧那一块亮」。 */
export const GLASS_EDGE_LEFT: GlassEdgeFade = Object.freeze({
  rx: 0.016,
  ry: 1.1,
  alpha: 0.12,
  stop: 0.55,
})




/** **阴影侧**（右缘）= 玻璃**背光的那面壁**：有厚度的玻璃被左上方光照亮时它比背景**更暗**，同时给出光的方向（左亮右暗）与玻璃的厚度；两轴共用（它是**光路**的产物、与明暗轴无关），差别只在浓度（见 {@link SHADE_ALPHA}）。 */
export const GLASS_SHADE_RING: readonly GlassRing[] = Object.freeze([
  Object.freeze({ key: 'right', x: -1, y: 0, blur: 2, spread: 0, alpha: 0.10 }),
])

/** 阴影侧在两个轴上的浓度：浅色轴 `10%`（近白底上需要它来立形）、深色轴 `6%`（暗底上重了会发脏）；⚠️ **要再收厚度就先动 {@link GLASS_EDGE_TOP} 的 `ry` 与底光的 `blur`，别动这个** —— 阴影弱到看不见，光源方向就丢了。 */
export const SHADE_ALPHA: Readonly<Record<'light' | 'dark', number>> = Object.freeze({
  light: 0.10,
  dark: 0.06,
})

/** 把一组环拼成 `box-shadow` 的 `inset` 串（每条 = `inset <x>px <y>px <blur>px <spread>px <color>`）；阴影沿元素自身的 `border-radius` 走，光才会**绕过圆角连成一圈**（`linear-gradient` 画不出圆角）。 */
const rimShadows = (ring: readonly GlassRing[], color: string): string =>
  ring
    .map(({ x, y, blur, spread, alpha }) =>
      `inset ${x}px ${y}px ${blur}px ${spread}px color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`,
    )
    .join(',\n    ')

const LIGHT_TINT = 'var(--dsw-static-neutral-bluish-00)' // 官方最亮静态色
const SHADE_TINT = 'var(--dsw-static-neutral-bluish-1000)' // 官方最深静态色

/** 镜面高光的 `inset` 阴影串 —— 卡片规则里要接到**官方那条外投影之后**（`box-shadow: var(--dsw-elevation-soft), <我们这几条>`）；⚠️ **不能**只用 `!important` 覆盖官方 `box-shadow`，那会把官方的抬升感一起抹掉。 */
export const GLASS_SPECULAR = rimShadows(GLASS_SPECULAR_RING, LIGHT_TINT)

/** 完整边光串（**两轴共用**）：**阴影侧在前、高光在后**（CSS `box-shadow` 第一条在最上层，观感更符合直觉）；`scheme` 只决定阴影浓度（见 {@link SHADE_ALPHA}）。 */
export const rimFor = (scheme: 'light' | 'dark'): string => {
  const ring = GLASS_SHADE_RING.map(e => ({ ...e, alpha: SHADE_ALPHA[scheme] }))
  return `${rimShadows(ring, SHADE_TINT)},\n    ${GLASS_SPECULAR}`
}

/** 把一条「沿边衰减」的光拼成 `radial-gradient` 图层；两条光**都锚在左上角**（光源处），只是椭圆长轴方向不同，形状全由 `rx` / `ry` 决定。 */
const edgeFade = (edge: GlassEdgeFade, color: string): string => {
  // ⚠️ 与模块级 {@link pct}（取整）**故意不同、不要合并**：这里给的是椭圆半径，必须保留两位小数，
  // 否则 `1.1 * 100` 会漏出浮点噪声（110.00000000000001）；那个取整是给 alpha 用的，进位规则一改就会动几何。
  const pctExact = (v: number): string => `${Number((v * 100).toFixed(2))}%`
  const a = Math.round(edge.alpha * 100)
  const stop = Math.round(edge.stop * 100)
  return `radial-gradient(ellipse ${pctExact(edge.rx)} ${pctExact(edge.ry)} at 0% 0%, `
    + `color-mix(in srgb, ${color} ${a}%, transparent) 0%, transparent ${stop}%)`
}

/** 边光的 `background-image` 图层（**两轴共用**）：上缘一条、左缘一条，都锚在**左上角** ⇒ 左上角最亮（两层叠加），向右、向下各自衰减 —— 这就是「光从左上方来」。 */
export const edgeFadeLayers = (scheme: 'light' | 'dark'): string => {
  void scheme // 光这一侧两轴同值；参数留着是为了将来按轴调光（暗底上光该更强）
  return [
    edgeFade(GLASS_EDGE_TOP, LIGHT_TINT),
    edgeFade(GLASS_EDGE_LEFT, LIGHT_TINT),
  ].join(',\n    ')
}

/** **输入框卡片**的模糊：`10px`（**刻意不与顶栏的 12px 同档** —— 两者在版面上永不相邻、没有交界可露，通透感由卡片自己定）；通透靠**提饱和**（`1.45`）补，模糊与填充都在压通透、同向调会叠加，`10px` 是「变化看得见、又不至于化不开」的一档。 */
export const GLASS_CARD_BLUR = 'blur(10px) saturate(1.45)'

/** 顶栏底的透出比例（只覆盖一层，无叠加问题）。 */
export const GLASS_HEADER_ALPHA = 0.7

/** 顶栏**光层**的强度比例 —— 与底色的 {@link GLASS_HEADER_ALPHA} **分离**：光必须**足额**画出来（×1.0），不能跟着填充 alpha 一起压，否则整条带比下方暗一档、观感就是「一条暗带把顶光挡住了」；⚠️ 与 {@link POPUP_LIGHT_COMPENSATION}（浮层那条「压下去的系数」）不是同一件事。 */
export const HEADER_LIGHT_SCALE = 1

/** 顶栏 / 右栏那些**玻璃面**重画的光要不要再补一档（见 {@link compensatedBackdropGradients}）：这些面是「深色填充 + 普通合成」，同档 alpha 读出的**亮度**天然低于背景层的 `screen` 加法，故补 `0.25`；⚠️ 上限是**台阶必须保持为正**（顶栏仍是一块略暗的玻璃），三个面同参共用本值。 */
export const HEADER_LIGHT_BOOST = 0.25

/** 输入框**卡片**的填充比例：底座那个夹层撤掉后**卡片这一层就是最终不透明度**（不再与谁合成）；与模糊**同向** —— 填充越淡、背后内容越亮，两处一起收通透感才出得来。 */
export const GLASS_CARD_ALPHA = 0.58

/** **输入框卡片的悬浮投影** —— 叠在官方 `--dsw-elevation-soft` 之上（逗号并列，**不替换、不用 `!important`**），做出「浮在背景上」的托起感（官方那条只有 3% 黑，在这套带色调光的背景上读不出抬升）。 */
// ⚠️ 调整时**三项一起收**（alpha / blur / y）：只降 alpha 会「淡但远处糊一片」、只减 blur 会「小而硬」；测试把下限钉在 alpha ≥ 0.15，且**只许动本常量**（`GLASS_SPECULAR_RING` 那几条 `inset` 是边光，另一件事）。
export const GLASS_CARD_LIFT = '0 7px 20px rgba(0, 0, 0, 0.21),\n    0 2px 5px rgba(0, 0, 0, 0.17)'

/** 玻璃卡片要覆盖的**相位**：`active`（对话中）+ `hero`（新建会话首页，否则那张卡留着官方的不透明实色；`settling` 官方已把底座设成 `visibility: hidden`，不入列）。 */
// ⚠️ **只许放宽卡片这两条**：底座 `::after` / 顶栏浮层 / 滚区补 76px / 拖拽条必须**留在 active** —— hero 下底座是 static，那条带会改锚到 `.root`、在整个对话区底部横着画一条实色带。
export const GLASS_CARD_PHASES: readonly string[] = Object.freeze(['active', 'hero'])

/** 把相位清单拼成选择器片段：单相位 → `[data-phase='x']`；多相位 → `:is(a, b)`。⚠️ 用 `:is()` 而不是并列选择器是为了**不改变特异度**（本插件有过特异度算错、被官方规则盖掉的代价）。 */
export function phaseGate(phases: readonly string[]): string {
  const parts = phases.map(phase => `[data-phase='${phase}']`)
  return parts.length === 1 ? parts[0] : `:is(${parts.join(', ')})`
}

/** 0–1 的不透明度 → CSS 百分比字面量（**取整**），只给 alpha / 停点用；⚠️ 几何类的百分比（椭圆半径）走 {@link edgeFade} 内的 `pctExact` —— 那里必须保留两位小数，别合并。 */
function pct(alpha: number): string {
  return `${Math.round(alpha * 100)}%`
}

/** 「按背景**原样画满**」的三层配方：不透明底色 + 与背景层同源的**光** + **颗粒**（座底不透带与「缝挡板」共用）—— 不透明是关键，要逐像素等于周围就必须 C = P，取 a = 1 只要原样画满即可。 */
// ⚠️ 默认走 `background-attachment: fixed`（百分比按视口解析、与元素几何无关），滚动在场地两条另有性能档（{@link bandPhasePaint} / {@link notchPhasePaint}）。
function backingPaint(): string {
  return `background-color: var(--dsw-alias-bg-base);
  background-image: ${grainOverGradients()};
  background-attachment: fixed;`
}

/** 「**用显式视口相位代替 `background-attachment: fixed`**」的逐层声明：偏移 = 「该载体定位区原点在视口里的坐标取负」，于是图片盒与视口重合，正是 `fixed` 的语义。 */
// ⚠️ 两个方向都必须用**长度**、不许用百分比（百分比按「定位区尺寸 − 图片尺寸」解析 ⇒ 依赖元素自身宽高）；`L`/`T` 是**伪元素自己**的定位区原点（不是宿主的，差一整个内边距）。
// ⚠️ 本函数只许挂在**该载体的门属性**下：`var()` 不带回退值，变量缺失时 `background-position` 会退成 `0% 0%` —— 那是**错位**而不是降级。
function viewportPhaseDecls(vars: { readonly left: string; readonly top: string }): string {
  const L = `var(${vars.left})`
  const T = `var(${vars.top})`
  return `background-attachment: scroll;
  background-size: auto, 100vw 100vh, 100vw 100vh, 100vw 100vh;
  background-repeat: repeat, no-repeat, no-repeat, no-repeat;
  background-position: calc(0px - ${L}) calc(0px - ${T}),
    calc(0px - ${L}) calc(0px - ${T}),
    calc(0px - ${L}) calc(0px - ${T}),
    calc(0px - ${L}) calc(0px - ${T});`
}

/** 座底不透带的相位声明（定位区 = 座位自身）。 */
export function bandPhasePaint(): string {
  return viewportPhaseDecls({ left: PHASE_BAND_VARIABLE, top: PHASE_BAND_TOP_VARIABLE })
}

/** 卡片缺口的相位声明（定位区 = **卡片宽的伪元素自身**，与宿主不是同一个盒子）。 */
export function notchPhasePaint(): string {
  return viewportPhaseDecls({ left: PHASE_NOTCH_VARIABLE, top: PHASE_NOTCH_TOP_VARIABLE })
}

/** 玻璃效果样式表文本（注入 `<style>`）。 */
export function buildGlassCss(): string {
  const fill = (token: string, alpha: number): string => `color-mix(in srgb, ${token} ${pct(alpha)}, transparent)`
  return `/* ===== dsh-theme-tone: 玻璃效果（顶栏 + 输入框；卸载即随样式表移除） ===== */

/* --- 顶栏：改成浮层，内容才会从它下面滚过 ---
   ⚠️ 打的是**真正生成盒子的那个 header 元素**（[data-slot='conversation.header'] > header），别改回去打槽位的直接子元素 —— 那个槽位是 display:contents、其子元素是官方 .titleRow，会把标题行抽成绝对定位浮层、header 塌成 10px，整条顶栏崩掉。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] {
  position: relative;
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-slot='conversation.header'] > header {
  /* 官方 .header 是 grid / min-height 76px / 自带 padding 与下边框，这里只把它浮起来 */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* ⚠️ **必须高于「用户内容层」**（CONTENT_Z_INDEX = 81，见 constants.ts）：内容层是正 z-index 的定位元素，会盖掉一切更小的层。
     统一取 ABOVE_CONTENT_Z_INDEX（82）：仍高于拖拽条 8 / 底座 7，仍低于菜单 100 —— 别再改回 9（那会被内容层盖住）。 */
  z-index: ${ABOVE_CONTENT_Z_INDEX};
  /* ⚠️ 本体**不承担玻璃**（刻意不写 background-color / background-image / backdrop-filter）—— 理由见下面 ::before 那条；本体只负责「浮起来」。 */
}

/* 玻璃（填充 + 渐变 + 模糊）挂在顶栏的 **::before** 上，不挂本体，并自己画一遍背景层的渐变栈（顶栏抬到背景层之上就吃不到那层光）。
   ⚠️ 不能挂本体：带 backdrop-filter 的元素会成为**后代的 backdrop root**、fixed 后代的**包含块**，而官方弹层大量渲染在顶栏子树里 —— 挂本体就把它们的模糊关进子树（读成全透明 / 串色）。伪元素没有后代，z-index: -1 正好落在内容之下、页面内容之上。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-slot='conversation.header'] > header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: ${fill('var(--dsw-alias-bg-base)', GLASS_HEADER_ALPHA)};
  background-image: ${compensatedBackdropGradients(HEADER_LIGHT_SCALE, HEADER_LIGHT_BOOST)};
  background-attachment: fixed;
  backdrop-filter: ${GLASS_BLUR};
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-scroll] {
  /* ③ 滚区顶部补出顶栏高度（与浮层是一对，少一个正文首行会被盖住）。⚠️ 必须用 **padding-top**：padding box 才从 y=0 起、正文能滚到顶栏下面去（玻璃有东西可透）；
     改成 border-top 会把溢出裁剪线一起下移，顶栏底下再没有内容滚过、玻璃退化成一条平板（滚动条位置另由下一条轨道规则负责）。 */
  padding-top: ${HEADER_HEIGHT_PX}px;
}
/* --- ③b 滚动条：把轨道整体下推到顶栏下缘 ---
     根因：**滚动条画在滚动容器的 padding box 上，padding-top 只推内容、不推它** —— 轨道与滑块仍从 y=0 起画，前 76px 正落在半透明顶栏下。
     ⚠️ **不要用 border-top 去推**（见上一条），轨道要单独推；值取 **78px 而不是 76** —— 官方轨道自己留 2px 上边距，加起来正是官方档下滑块顶端的 y=78（四值写法只加上边距）。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-scroll]::-webkit-scrollbar-track {
  margin: calc(${HEADER_HEIGHT_PX}px + 2px) 2px 2px;
}
/* --- ④ 拖拽条：把上段裁到顶栏下缘（**恢复官方几何**，不新造基准）---
   官方 .widthHandle 是 .body 里的 absolute + top/bottom: 0，而官方顶栏在流内占 76px ⇒ 光带天然画在顶栏下缘以下；顶栏浮层化后 .body 从 y=0 起，光带会爬进半透明顶栏区（穿模），故把盒子还原成官方那一份。
   ⚠️ 只挂 "active" 相位：hero 等下官方顶栏本就在流内、.body 已从 76 起，再压一次会多推 76px（hover / 拖拽时官方与 nav-pin 写的真实 clientY 是内联样式，优先级更高、不受影响）。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-width-handle] {
  top: ${HEADER_HEIGHT_PX}px;
}

/* --- 输入框底座：只撤掉官方那条实色渐隐带，**玻璃完全由卡片自己承担** ---
   ⚠️ 别再加回「夹层」：早先在底座挂 ::before { inset: 0 } 做「渐隐 + 玻璃」，而底座是**全宽**的（卡片自己有 max-width、两侧留白）—— 那两条留白于是也被糊上一层、读成两块**竖直的暗矩形**，还跟着输入框一起变高。玻璃归卡片，底座两侧什么都不画。
   底座不画填充也不会露出正文：正文列比卡片窄（--dsh-chat-content-width 比卡片少 32px），两侧留白背后本来就没有内容。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat] {
  /* ⚠️ **不要在这里写 position** —— 本选择器特异度比官方那条高（多一个 body 计数），写什么都会盖掉官方：
     曾经写 position: relative 当「兜底定位上下文」，实际生效后底座从 sticky 变 relative、**输入框跟着内容滚走**。底座官方本来就是 sticky（定位元素），::after 的包含块已成立。 */
  background: none !important;
  backdrop-filter: none;
}

/* --- 底座**下半段**：卡片下沿到座底那一小条，**不透明**，且按背景底部的样子重画（这才是官方渐隐带真正的职责：挡住从卡片下方滚过去的正文）---
   ⚠️ 不能只刷一个 bg-base：底座在背景层（z 80）**之上**，实色会把那一带的色调光与颗粒一起盖掉 → 平块；高度只到卡片下沿为止，上面那 RAMP 段是过渡、藏在卡片背后。
   ⚠️ 必须写成**单个 fixed**：本规则 4 层 background-image，per-layer 值少于层数时会**按顺序循环补齐**（「scroll, fixed」会让第 1、3 段渐变退回按元素自身盒子解析）。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${SEAT_SOLID_PX + SEAT_SOLID_RAMP_PX}px;
  z-index: -1; /* 同层，DOM 次序在后 → 压在上面 */
  pointer-events: none;
  ${backingPaint()}
  -webkit-mask-image: linear-gradient(180deg, transparent 0px, black ${SEAT_SOLID_RAMP_PX}px);
  mask-image: linear-gradient(180deg, transparent 0px, black ${SEAT_SOLID_RAMP_PX}px);
}

/* --- 上一条的**性能档**：同一份漆，改用显式视口相位（不吃 fixed 的「每帧按视口栅格化」）---
   ⚠️ 门必须由运行期几何决定（data-dsh-theme-tone-phase-band，见 constants 的 PHASE_BAND_ATTR）—— 纯 CSS 推不出右栏打开时该载体的定位区原点；**门没挂 = 本档整条不命中 = 落回上面那条 fixed 档**（慢、但任何布局状态都正确）。
   ⚠️ 两条规则的**层序必须与上面完全一致**（颗粒在最上、三段光其次、底色在下），否则同一像素会算出两种颜色 —— 相位对齐了也没用。 */
body:not([${PLAIN_ATTR}])[${PHASE_BAND_ATTR}] [data-phase='active'] [data-composer-seat]::after {
  ${bandPhasePaint()}
}

/* --- 输入框卡片：用户盯着的那个面（数据锚点 data-composer-card）---
   边光两层：background-image 的两条细长椭圆（锚左上角，沿边衰减 + 往内柔化）+ inset 环（绕得过圆角的**底光**）；官方那条外投影 --dsw-elevation-soft **要保留**，写成「官方 + 我们」并列、不用 !important。
   ⚠️ 相位用 GLASS_CARD_PHASES（active + hero）—— 首页（hero）也要玻璃，否则那张卡会留着官方的**不透明实色**；**只有这两条卡片规则**放宽相位，底座 ::after 等仍死守 active。 */
body:not([${PLAIN_ATTR}]) ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card] {
  /* ⚠️ 卡片本体不承担玻璃（不写 background-color / background-image / backdrop-filter）—— 与顶栏同一条理由：卡片的子树里也渲染官方弹层（输入触发器菜单以 closest('[data-composer-card]') 为锚），本体一带就把它们的模糊关进子树。
     position: relative 官方 .card 本来就有（给 ::before 包含块）；z-index: 0 是为了**自成层叠上下文**、好让 ::before 的 z-index: -1 留在卡内；background-color: transparent 必须写 —— 官方 .card 自己刷的是不透明 --dsw-specific-input-major。 */
  position: relative;
  z-index: 0;
  background-color: transparent;
  background-image: none;
  /* ⚠️ 本体只留**外**投影：官方那条抬升（--dsw-elevation-soft）+ 我们的悬浮（GLASS_CARD_LIFT）。
     **inset 边光（rimFor）不能写在这里** —— 绘制顺序是「元素自己的背景/边框/box-shadow」先画、**负 z-index 子层随后盖上去**，::before 那道玻璃会把本体的 inset 环整个埋掉。 */
  box-shadow: var(--dsw-elevation-soft),
    ${GLASS_CARD_LIFT};
}
/* 卡片玻璃本体（填充 + 边光渐变 + **inset 边光** + 模糊）—— 挂 ::before，理由见上面卡片规则内。
   border-radius: inherit 必须写（官方 .card 走 --dsw-radius-panel，伪元素不继承就画成方角）；pointer-events: none 让玻璃层不参与命中测试；⚠️ inset 环必须与填充在**同一层**（放本体就会被这层玻璃埋掉）。 */
body:not([${PLAIN_ATTR}]) ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  background-color: ${fill('var(--dsw-specific-input-major)', GLASS_CARD_ALPHA)};
  background-image: ${edgeFadeLayers('dark')};
  box-shadow: ${rimFor('dark')};
  backdrop-filter: ${GLASS_CARD_BLUR};
}
/* 浅色轴：同样的光路，只有**阴影浓度**不同（近白底上阴影要更明显才立得住形）。
   ⚠️ 官方默认门（body:not([PLAIN])）必须写在**最前** —— 有一条守卫按前缀认它。 */
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card]::before {
  background-image: ${edgeFadeLayers('light')};
  box-shadow: ${rimFor('light')};
}

/* --- 未选工作区（待启动态）：**把边界让回官方那条虚线框** ---
   官方此时用卡片自己的 ::after 画一圈虚线圆角框，并**同时**把 --dsw-elevation-stroke-color 设成 transparent —— 它刻意让虚线成为**唯一**的边界；我们的玻璃无条件给卡片加了悬浮投影 + 内嵌边光，两套边缘语言叠加后「不和谐」。
   故撤掉**两条与边缘有关**的（悬浮投影 GLASS_CARD_LIFT + inset 边光 rimFor），**保留**官方自己的 --dsw-elevation-soft 与玻璃本身。
   ⚠️ 判定属性由 client 的**行为探针**打上（WORKSTART_ATTR —— 官方那条类名是哈希、语义属性又全被污染，只有读 ::after 的 mask 才认得出）；这两条必须放在上面两条**之后**（同特异性下靠后者胜出）。 */
body:not([${PLAIN_ATTR}])[${WORKSTART_ATTR}] ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card] {
  box-shadow: var(--dsw-elevation-soft);
}
/* ⚠️ 边光与玻璃同在 ::before —— 待启动态要撤的那条 inset 环也必须打在这里：只改本体的话边光会留着，与官方虚线框并存（边缘让给官方）。 */
body:not([${PLAIN_ATTR}])[${WORKSTART_ATTR}] ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card]::before {
  box-shadow: none;
}

/* ===== 右边栏：自己画一遍背景层的光与颗粒 =====
   右边栏为了不被抬到 81 的内容层盖住而被抬到 82（见 backdrop.ts 的不变式），而背景层在 80 ⇒ 吃不到那层色调的光与颗粒；底色已被 token 染对，缺的只是质感，把背景层那套渐变与颗粒**叠上去**即可（用 background-image 与 background-color 分层，不碰官方底色）；⚠️ 0.1.7 起真正刷底色的是 dockkit 的**内容宿主** [data-dockkit-pane]（不透明，且是 .panel 的**后代**），不一起画就被它整个盖掉、右边栏看着是一块没有任何色调质感的纯色板 —— .panel 那条保留（它仍负责面板本体、浮动面板与空态）。
   ⚠️ **不能再用 background-attachment: fixed**：只要元素或任一祖先带非 none 的 transform，fixed 就会**静默**把定位区改判成元素自己的盒子（任意深度、静态与动态 transform 都算），而官方 .panel 的开关动画恰恰就是 translateX ⇒ 动画中顶光 / 底光会灌进面板；故改成「显式 100vw x 100vh 背景盒 + 右对齐」：.panel 是 absolute + right: 0、承载它的 frame 又是全窗宽 ⇒ **面板右缘恒等于视口右缘**，两种 regime 同解。
   ⚠️ **颗粒必须与背景层「同构」**：背景层是「3 层渐变写在自己身上 + 颗粒走 ::after + opacity + 深色轴 mix-blend-mode: screen」，把颗粒当成**第 4 个背景层**正常合成 ⇒ 深色轴上 screen 是纯加法、正常合成还会压暗黑像素 ⇒ 会话区交界处一条**竖直分界线**；故这里也是「3 层渐变 + ::after 颗粒」，opacity 与混合模式**逐字对齐背景层**（直引 GRAIN_OPACITY / GRAIN_OPACITY_LIGHT / GRAIN_DATA_URI，不复制数值）；⚠️ background-size / -position / -repeat 现在是 **3 层**，**必须给足 3 个值** —— 值少于层数时会**按顺序循环补齐**。
   ⚠️⚠️ **[data-sidebar-right-panel] 本体绝不能写 position**：它靠官方 .panel 的 absolute + top: 0 / bottom: 0 拉满可视高，内部的 .paneBody{overflow:auto} 才有一个**有界**的滚动区；写成 relative 后 bottom: 0 从「拉满高度」退化成「相对偏移」，面板高度改由内容撑开、内层滚动条因没有可滚余量而**彻底失效**（实测长文件预览 panel 高 11842px、视口 720px）—— 故定位上下文只在官方 static 的 dockkit 宿主上补。⚠️⚠️ **面板那条必须门在 [data-sidebar-right-open] 上**：官方 .panel 是常驻元素，**收起时并不消失、也不变窄**（宽度来自持久化的 --dsh-sidebar-width），收起时官方只把里面的 dockkit 宿主移走 + visibility:hidden ⇒ 我们这片 100vw x 100vh 的渐变会以 screen 压在会话区右侧（「打开过一次，背景就花了」）；官方在滑动开始前就置该属性，故动画期间照常生效。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open],
body:not([${PLAIN_ATTR}]) [data-dockkit-pane],
body:not([${PLAIN_ATTR}]) [data-dockkit-empty] {
  background-image: ${BACKDROP_GRADIENTS};
  background-attachment: scroll;
  background-size: 100vw 100vh, 100vw 100vh, 100vw 100vh;
  /* 垂直相位 = 视口顶 **减去 caption 高度**：桌面端（Windows 标题栏）面板被 caption 挤下，不减就差 40px、失去像素同相。
     该变量由 apps/desktop 的 preload 置在 html 上、沿继承树传给 body；**web 下不存在** ⇒ 兜底 0px，与改动前逐像素一致，故不需要按平台分两条规则。 */
  background-position:
    right calc(0px - var(--dsh-windows-titlebar-height, 0px)),
    right calc(0px - var(--dsh-windows-titlebar-height, 0px)),
    right calc(0px - var(--dsh-windows-titlebar-height, 0px));
  background-repeat: no-repeat, no-repeat, no-repeat;
}
/* ::after 的包含块：只给官方 static 的 dockkit 宿主（**不含** panel —— 那条见上）。补定位不改几何：relative + 无偏移不移动、不改尺寸。 */
body:not([${PLAIN_ATTR}]) [data-dockkit-pane],
body:not([${PLAIN_ATTR}]) [data-dockkit-empty] {
  position: relative;
}
/* 渐变本身的合成方式也必须同构：深色轴上背景层**整层**是 mix-blend-mode: screen，而面板这里的背景层是**正常合成** ⇒ 同样的渐变在两边亮度不同，交界处又是一条分界线。
   background-blend-mode 让面板自己的背景层与它的 background-color（官方 bg-base）按 screen 混合，等效于背景层与页面底色混合。浅色轴背景层用 normal（见 backdrop.ts），故这里不需要浅色规则。 */
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open],
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-pane],
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-empty] {
  background-blend-mode: screen, screen, screen;
}
body:not([${PLAIN_ATTR}]) [data-dockkit-pane]::after,
body:not([${PLAIN_ATTR}]) [data-dockkit-empty]::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: ${GRAIN_DATA_URI};
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY});
}
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-pane]::after,
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-empty]::after {
  mix-blend-mode: screen;
}
body:not([data-ds-dark-theme]):not([${PLAIN_ATTR}]) [data-dockkit-pane]::after,
body:not([data-ds-dark-theme]):not([${PLAIN_ATTR}]) [data-dockkit-empty]::after {
  mix-blend-mode: multiply;
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY_LIGHT});
}

/* ===== 右栏顶部的两条 38px 带（dockkit 条 + 文件面板头行）：补上顶栏那份**玻璃**（同 blur、同 0.7 alpha、同光层）=====
   官方面板 0..76 里，条的颗粒是**生的**（没被 blur 糊过）、也没有那层半透明填充把它压到与顶栏同一档 ⇒ 右栏顶部看起来和别处不是一个材质。
   ⚠️ 面挂在**各标签自己的头行**的 ::before 上、并**向上铺满 0..76** —— blur 的采样区是**边框盒**，只有两个面的盒子完全重合、y=38 两侧算出的颜色才一致（分两个盒子必出缝）；⚠️ 面只能锚在**确有 38px 头行**的标签上：终端（data-sidebar-terminal）没有头行、正文正落在 38..76，盖上去等于糊住内容 —— 不许图省事锚在公共祖先 [data-dockkit-pane] 上；⚠️ 高度用 bottom: 0（止于内边距盒底）而不是写死 76px —— 否则会把官方头行那 1px 下边框压在自己那层填充之下、细线被洗掉。
   层序（都在 pane 内部）：玻璃面 z-index -1 → 头行 z-index 2（文字 / 图标在玻璃**之上**、仍锐利）→ 条 z-index 3（否则条内标签 / 加号 /「关闭」按钮被那层填充压暗）→ 正文滚区不抬。
   ⚠️ **两条带都要做**（0..38 与 38..76，官方把它们叠成与对话区顶栏同高的 76px），只做上面那条会在 y=38 切出一条新缝；第二行必须**按标签类型逐种覆盖**（文件树 / 文档预览各自的状态属性），且**不用 :has()**（玻璃表有一条守卫明令不许出现它）—— 文档预览的头行**不一定是第一个孩子**（元数据失败 / 文件已变更时会先插横幅），故除 first-child 外还要补「横幅的下一个兄弟」那两条。⚠️ 本条**不吃 [data-phase] 相位门**（右栏在 hero 相位同样存在、也能开文件面板）；相位**不能**用 background-attachment: fixed（右栏面板会被官方 translate），改用与右栏材质同一套 100vw x 100vh + 右对齐 —— backdrop-filter 要求背后真有东西可糊，而条下方紧邻的就是 pane 的颗粒层。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-files-state='tree'] > *:first-child,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='unsupported'] > *:first-child,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'] > *:first-child:not([data-textpreview-changed]):not([data-textpreview-meta-failed]),
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'] > [data-textpreview-changed] + *,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'] > [data-textpreview-meta-failed] + * {
  /* 头行抬到自己的玻璃面之上（玻璃面就在这条规则自己的 ::before 上，z-index: -1），于是路径文字 / 按钮不被那层 70% 填充压暗；
     同时也抬到 pane 的颗粒层 ::after 之上，玻璃面才有东西可糊（实测不抬时 HF 仍是 2.3 = 没生效）。relative + 无偏移不改几何。 */
  position: relative;
  z-index: 2;
}
/* ⚠️ 条必须抬到**头行那层之上**（头行 z-index 2、它的面又向**上**铺满条区 0..38），否则条内标签 / 加号 /「关闭」按钮会被那层填充压暗。
   条自己不画面：有头行的标签由头行的面连条区一起盖住；没有头行的标签（终端等）本来就不许被盖。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-strip] {
  position: relative;
  z-index: 3;
}

/* ===== 真磨砂：让正文**真的从这两条 38px 带下面滚过去** =====
   官方面板里「带 0..76」与「滚区 76..底」是上下相邻的两个盒子 ⇒ 那 76px 里永远只有面板自己的纯色底 + 均匀颗粒，拿模糊去糊一块**均匀色**还是那块均匀色，只剩「把这条压暗一层」，读起来是**实心深色板**。修法只有一件事：把滚区的**裁切框上提**到这 76px 之上，正文于是真的从两条带下面滚过去（玻璃靠「背后有东西在动」才像玻璃）。
   ⚠️ 只提滚区还不够 —— **0..38 仍然画不出东西**：条在文档流里、官方 pane 是 flex 纵列（头行 38px + 体），体那两层都从 y=38 起且都裁剪 ⇒ 上带背后永远只有面板自己的纯色；故再把**头行**在流内占的高度还回去（margin-bottom: -38px，只改流内占位高度），体于是从 y=0 起、两层裁剪线消失。
   ⚠️ 补偿位移**只能用 transform，不能用 padding-top**：官方「跳转到第 N 行」吃 offsetTop，而 offsetTop 把 padding 算进去、不把 transform 算进去 —— 用 padding 会把正文首行藏到两条带后面。⚠️ 只给「流式文档」滚区（白名单锚官方的**渲染器 id**：data-document-preview 以 /markdown、/text 结尾两条），**填满型**（code / pdf / image / excel / office，内容根 flex 填满整个 body、永远不从带下流过）与 loading / unsupported 都不给 —— 上提 + 下移只会让内容根落到 76..976 而 body 裁到 900，白掉底部 76px。白名单的兜底是优雅降级：官方若改 id，这几条静默不命中、回到「两条带是实心板」。
   内容根**不是** body 的直接子元素（中间隔一层 display: contents 的插槽包装，打它上面 transform 无效）：预览写「> * > *」、文件树写「> *」；滚区里另外几个直接孩子（[data-document-loading] / [data-textpreview-failed] / [data-textpreview-more]）只写「> *」，别一并套上内容根那层（会叠成 +152）。⚠️ 这里**不写 position / z-index**：内容根带 transform 会自建层叠上下文，次序天然正确；官方滚区自己就是 position: relative，不该再动它。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-files-state='tree'] [data-files-body] {
  margin-top: -${PANEL_SCROLLER_LIFT_PX}px;
}
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > * > *,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > * > *,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > [data-document-loading],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > [data-textpreview-failed],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body] > [data-textpreview-more],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > [data-document-loading],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > [data-textpreview-failed],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body] > [data-textpreview-more],
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-files-state='tree'] [data-files-body] > * {
  transform: translateY(${PANEL_SCROLLER_LIFT_PX}px);
}
/* 把 pane 头行（= dockkit 条那一行）在流内占的高度还回去，让体从 y=0 起 ——
   否则体那两层都从 38 起且都裁剪，0..38 里永远画不出内容。只加负底距：条的盒子 / 定位 / 层叠一概不动。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] > *:first-child {
  margin-bottom: -${PANEL_BAND_PX}px;
}
/* 体把负底距让出的 38px 补回来，各标签的内容于是仍从 y=38 开始（照原位）。
   ⚠️ border-box 必须有：体通常是 height:100%，content-box 下加 padding 会把盒子撑到 938，外层 paneBody(overflow:auto) 于是多出 38px 外滚动。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] > *:last-child > [data-sidebar-right-tab] {
  padding-top: ${PANEL_BAND_PX}px;
  box-sizing: border-box;
}
/* --- 右栏滚区的滚动条：把轨道整体下推到玻璃带下缘 ---
   与对话区那次（见上面 ③b）**同因同解**：滚动条画在滚动容器的 **padding box** 上，我们那件「负底距 + padding-top 补高」只推内容、不推它 —— 轨道与滑块仍从 y=0 起画，前 76px 正落在半透明玻璃带下面。
   ⚠️ 单写轨道 margin 即可，**不要**顺手重声明滚动条本体（::-webkit-scrollbar）—— 那会把官方的 width 一起覆盖掉。
   ⚠️ 值与对话区那份逐字同参（calc(HEADER_HEIGHT_PX + 2px) = 78px，官方轨道自己留 2px 上边距）；范围只放**流式文档的滚区**（代码 / PDF / 图片 / 表格 / office 这些填满盒子的渲染器自己有内层滚动容器，动它们的轨道等于改官方布局）。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/markdown'] [data-textpreview-body]::-webkit-scrollbar-track,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'][data-document-preview$='/text'] [data-textpreview-body]::-webkit-scrollbar-track,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-files-state='tree'] [data-files-body]::-webkit-scrollbar-track {
  margin: calc(${HEADER_HEIGHT_PX}px + 2px) 2px 2px;
}
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-files-state='tree'] > *:first-child::before,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='unsupported'] > *:first-child::before,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'] > *:first-child:not([data-textpreview-changed]):not([data-textpreview-meta-failed])::before,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'] > [data-textpreview-changed] + *::before,
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-textpreview-state='text'] > [data-textpreview-meta-failed] + *::before {
  content: '';
  position: absolute;
  /* ⚠️ 向上铺满 38px，让盒子覆盖**面板坐标 0..75**（不只是头行自己那 38..75）—— 这就是「无缝」的关键：
     blur 的采样区是**边框盒**，只有两个面的盒子完全重合，y=38 两侧算出的颜色才一致。 */
  top: -${PANEL_BAND_PX}px;
  /* ⚠️ **必须 bottom: 0 + height: auto**，不能写死 height: HEADER_HEIGHT_PX（76px）：官方头行的 border-bottom: 1px 画在它**边框盒**的最后 1px（75..76），写死 76px 会让这个面铺到 76、把那条细线压在自己那层 70% 填充之下（细线被洗掉）。
     ⚠️ bottom: 0 让面止于**内边距盒**底（= 75），这也让本面的盒子与**对话区顶栏那个面**完全相同（那边是 inset: 0）—— 两处观感要一致，盒子就得先一致。 */
  bottom: 0;
  left: 0;
  right: 0;
  height: auto;
  z-index: -1;
  pointer-events: none;
  background-color: ${fill('var(--dsw-alias-bg-base)', GLASS_HEADER_ALPHA)};
  backdrop-filter: ${GLASS_BLUR};
  /* ⚠️ 这里**不能**用 background-attachment: fixed（顶栏那条用了，是因为它自己就是 absolute 浮层、祖先无 transform）：
     右栏面板在开关 / 全屏切换时会被官方 translate，fixed 会被重解析到 transform 后的坐标系；改用与右栏材质那几条**同一套** 100vw x 100vh + 右对齐相位（那套本就是为「面板会被 transform」设计的）。 */
  background-image: ${compensatedBackdropGradients(HEADER_LIGHT_SCALE, HEADER_LIGHT_BOOST)};
  background-attachment: scroll;
  background-size: 100vw 100vh, 100vw 100vh, 100vw 100vh;
  background-position:
    right calc(0px - var(--dsh-windows-titlebar-height, 0px)),
    right calc(0px - var(--dsh-windows-titlebar-height, 0px)),
    right calc(0px - var(--dsh-windows-titlebar-height, 0px));
  background-repeat: no-repeat, no-repeat, no-repeat;
}

/* ===== 右栏「开始」页：一个**没有 38px 头行**的标签，面要单独挂 =====
   右栏停在「开始」（guide）页时，面板 0..76 里**一个玻璃面都没有**（正文直接从 y=38 起、首屏内容在 y=301）—— 顶带是生颗粒，也没有光画在玻璃上（上面那条面的锚点是「标签自己的 38px 头行」，guide 页没有那样一条头行）。
   ⚠️ **不是所有没头行的标签都该补，别把这条当通则照抄**：终端（[data-sidebar-terminal]）同样没有头行，但它的**正文**正好落在 38..76，盖一层 70% 填充就等于糊住内容。判据 = **那一带里有没有正文**，不是「有没有头行」。
   锚点 = [data-sidebar-right-guide]（官方 GuideBody 的根，只在 guide 页存在 ⇒ 天然门：切到别的标签时它整棵卸载，不会与上面那条面叠成双层）。
   ⚠️ 它的 position 是 static ⇒ 这个 ::before 的包含块是**最近的已定位祖先**（面板坐标 0..900）⇒ top: 0 正好落在面板 y=0；别照抄上面那条的 top: -PANEL_BAND_PX（那只适用于「锚点自己就是头行」的面）。
   z-index: 2 把面抬到 pane 的颗粒层 ::after 之上，backdrop-filter 才有东西可糊；同时仍低于条那一层（z-index 3），条里的标签 / 关闭 / 加号才不被这层填充压暗。 */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}][data-sidebar-right-open] [data-dockkit-pane] [data-sidebar-right-guide]::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* ⚠️ 用 HEADER_HEIGHT_PX 而不是 bottom: 0：本锚点是**整页元素**，bottom: 0 会一路铺到 y=900；这里也没有头行那条 1px 下边框要避让。 */
  height: ${HEADER_HEIGHT_PX}px;
  z-index: 2;
  pointer-events: none;
  background-color: ${fill('var(--dsw-alias-bg-base)', GLASS_HEADER_ALPHA)};
  backdrop-filter: ${GLASS_BLUR};
  background-image: ${compensatedBackdropGradients(HEADER_LIGHT_SCALE, HEADER_LIGHT_BOOST)};
  background-attachment: scroll;
  background-size: 100vw 100vh, 100vw 100vh, 100vw 100vh;
  background-position:
    right calc(0px - var(--dsh-windows-titlebar-height, 0px)),
    right calc(0px - var(--dsh-windows-titlebar-height, 0px)),
    right calc(0px - var(--dsh-windows-titlebar-height, 0px));
  background-repeat: no-repeat, no-repeat, no-repeat;
}

/* ===== 官方那些**吸顶遮罩行**：底色要等于它盖住的内容底 =====
   官方给展开的 Think 行刷**不透明纯色** var(--dsw-alias-bg-base) 并吸在滚区顶部、压住滚过去的正文；官方档下那就是地面纯色、看不出带子，而我们的地面是**渐变光带 + 颗粒** ⇒ 纯色底一盖上去就显成一条「黑框」。
   修法与顶栏同一套（同一类东西：抬到地面之上、又必须等于地面）：**把地面原样重画一遍**（同色 + 同渐变 + 同颗粒），并用 background-attachment: fixed 让百分比按视口解析（行的盒子很小，按自身盒子解析会把渐变压成硬边带）。
   ⚠️ 锚点用公开属性 data-disclosure-row（哈希前缀类名仓库红线禁止写），并**收窄到官方自己加底的那个状态**（[data-expanded] [data-open]，逐字对齐官方那条规则）—— 只写 [data-disclosure-row] 会把**所有**折叠行都刷上一层底。
   ⚠️ 只挂色调档 —— 官方默认档下地面本来就是纯色，重画等于没事找事。 */
body:not([${PLAIN_ATTR}]) [data-expanded] [data-open] [data-disclosure-row] {
  ${backingPaint()}
}

/* ===== 轨迹视图：把我们的地面**铺满它自己的不透明面** =====
   轨迹视图根 [data-conversation-composer-overlay] **自己刷了一层不透明底色** --dsw-alias-bg-layer-1，又在本插件里被抬到 81 之上 ⇒ 整块**盖住**我们的装饰层（z 80）；而座底那条带子按自己的配方重画 ⇒ 带上与带上方的轨迹地面**差出一整档**，读成一条横带。修法与右边栏那次同型：**把我们的材质原样画到那个不透明面上**，而不是去改座底那条带子。
   ⚠️ 只用公开属性锚定：[data-conversation-composer-overlay]（轨迹视图根）与 [data-trajectory-scroll]（表格滚区）；内层「页面级地面」的 .split / .table 是**哈希类名**，仓库红线禁止写。
   ⚠️⚠️ **这条选择器表不是穷举证明，只是覆盖手段**：官方若再加一层不透明面，表会漏掉它、而守卫只能钉住「已列出的这些选择器各自合规」。真正的安全网是**覆盖率指标**（修复前官方平地色占视图 69.61% → 修复后 0.02%，轨迹地面与对话页同点色差 31 → 2）—— **跟版审计时重跑这些数**，显著回退即说明有新的不透明面冒出来。
   ⚠️ 只挂色调档 + active 相位（该视图只存在于会话页）；本页祖先链**没有** transform / filter / contain，故沿用 fixed 是安全的 —— 右边栏那条**不能**用 fixed 是因为官方 .panel 的开关动画就是 transform。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay],
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] > div,
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] > div > div,
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] > div > div > div,
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] > section,
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] > section > div,
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] table,
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-composer-overlay] aside {
  ${backingPaint()}
}

/* 模态弹窗（[role='dialog']）**不做玻璃** —— 它是内容面（设置 / 文件 / 归档列表），走 src/surface.ts 的实色抬升面（Apple HIG：别把玻璃放在列表 / 卡片 / 媒体内容上）。
   ⚠️ 本段整块在模板字符串里 —— **注释里不能出现反引号**，否则字符串被截断；弹窗遮罩的模糊恢复不在这里（它既不属玻璃、也不受相位约束，故独立成 src/mask.ts）。 */
`
}

/** 「缝挡板」往**圆角缺口**里多伸的高度（px）：停靠卡（`border-radius: 12px`）圆角弧线以外、包围盒以内那一小块三角会露出背后的正文，官方那条底座背衬本来顺手盖住了它；取 16 > 12 留 4px 余量（深处被卡片自己的不透明背景盖住，只有缺口那点三角显示成背景色）。 */
export const SEAM_NOTCH_PX = 16

/** **输入框卡自己**那个上圆角（官方 `--dsw-radius-panel`）的 mask 半径 —— 用官方半径 token，不写死数值。 */
// ⚠️ 与 {@link SEAM_NOTCH_PX}（停靠卡的缝）不是同一件事；写死 28 会在官方改半径时静默错位，而这块补丁**错位就是误伤**（补丁伸进卡片会把卡面涂成背景色）。
export const CARD_NOTCH_RADIUS = 'var(--dsw-radius-panel, 28px)'

/** 卡片宽度 —— 与官方 `.card { width: 100%; max-width: var(--dsh-composer-card-max-width) }` 在**居中容器**（`align-items: center` 的 flex 列、左右各留 `--dsh-composer-side-clearance`）里的解析结果同一个表达式。 */
// ⚠️ 补丁必须与卡片**同宽同左边**，否则补到卡片外的留白上 —— 那就是被否决过的「误伤」。
export const CARD_NOTCH_WIDTH =
  'min(var(--dsh-composer-card-max-width, 100%), 100% - 2 * var(--dsh-composer-side-clearance, 16px))'

/**
 * 输入框卡**上圆角缺口**的补丁样式表文本：卡片圆角弧线以外、包围盒以内那一小块三角元素自己不绘制，背后滚过去的正文会从那里露出来（平时被排队卡盖住，独卡时没人盖）。
 * ⚠️ 只补**上面**两个角（下两角已被座底那条 46px 不透带盖住，残余读数背后的正文敏感度 0.00–0.04，不是可见漏字）；⚠️ 用 mask 而不是实心方块 —— 卡面半透明（玻璃 58%），实心块会把圆角处染成背景色，那是**新的误伤**。
 * ⚠️ 挂在**卡的父元素**上而不是卡自己的 `::after`：官方在「未选工作区」态用卡片自己的 `::after` 画虚线圆角框，而 `mask-image` 会把那条官方虚线一起擦掉。门与缝挡板其余三条一致（官方默认让路 + 只 `active`）。
 */
function buildCardNotchCss(): string {
  /** 三个缝挡板共用的门（官方默认门 + 只 active）。 */
  const gate = `body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat]`
  /**
   * 缺口补丁的宿主：**卡的父元素** —— 卡片自己带 `backdrop-filter` 自成层叠上下文，挂它身上的伪元素（哪怕 z-index 负）会画在停靠卡之上。
   * 判据走**锚点属性**（`composerHost`，由 client half 维护），不用 `:has()`（开销实测见 docs/spec/11）。
   */
  const host = `${gate} ${anchorSelector(ANCHOR.composerHost)}`
  /**
   * 缺口补丁的**性能档**选择器：在门上再加「运行期相位已就绪」。
   * ⚠️ 比基础档**多一个属性选择器** ⇒ 特异度更高，两处同时命中时恒以本档为准；⚠️ 必须**写在基础档之前** —— 缝表那边的守卫按「最后一条缺口补丁本体」取它。
   */
  const phaseHost = `body:not([${PLAIN_ATTR}])[${PHASE_NOTCH_ATTR}] [data-phase='active'] [data-composer-seat] ${anchorSelector(ANCHOR.composerHost)}`
  return `/* ===== dsh-theme-tone: 输入框卡上圆角缺口（卡片圆角弧外的三角露正文）===== */
${host} {
  /* 只补包含块，不改布局（无偏移、无 z-index）：父元素官方是 static，绝对定位伪元素需要它当包含块。 */
  position: relative;
}
/* --- 上一条的**性能档**：同一份漆、**同一个盒子、一字不改的遮罩**，只把 fixed 换成显式视口相位 ---
   ⚠️ 这里**只覆盖 background-* 四条**，盒子几何与遮罩全部继承基础档 —— 相位与元素宽高无关，故不必为了凑相位改盒子（曾把盒子改成 inset:0 撑满宿主，瓦片于是跑到宿主两角、卡片顶边与基础档不同）。
   ⚠️ 门是 data-dsh-theme-tone-phase-notch（运行期几何就绪），**不是**「右栏折叠」（右栏开时相位原料照样测得到）。
   ⚠️ 本档与座底那条**必须同进同退**：滚动容器里只要还留着一条 fixed，那笔按视口栅格化的开销就仍要付。 */
${phaseHost}::after {
  ${notchPhasePaint()}
}
${host}::after {
  content: '';
  position: absolute;
  /* 卡片是父元素第一个在流子元素、父元素无上内边距 ⇒ 父元素顶就是卡片顶。 */
  top: 0;
  /* 与卡片同宽同左边（父元素是居中 flex 列）：左缘 = 50% − 宽/2；宽度表达式与官方 .card 同源。 */
  left: calc(50% - ${CARD_NOTCH_WIDTH} / 2);
  width: ${CARD_NOTCH_WIDTH};
  height: ${CARD_NOTCH_RADIUS};
  z-index: -1; /* 画在卡片**背后**（卡片 z-index:0 自成层叠上下文） */
  pointer-events: none;
  /* 与座底那条同一份漆：不透明 ⇒ 逐像素等于背景，看不出补丁边界 */
  ${backingPaint()}
  /* 瓦片 = 圆角半径见方，弧心在瓦片**内侧角**；「距弧心 > 半径」就是弧线以外 ⇒ 涂不透明漆，弧线以内保持透明 ⇒ 完全不碰卡片面与玻璃。
     ⚠️ 只给上面两个角（下两角已由座底那条 46px 不透带盖住）；⚠️ 颜色写 black 关键字而不是十六进制 —— 守卫禁止硬编码色值。 */
  -webkit-mask-image: radial-gradient(circle at ${CARD_NOTCH_RADIUS} ${CARD_NOTCH_RADIUS}, transparent ${CARD_NOTCH_RADIUS}, black ${CARD_NOTCH_RADIUS}), radial-gradient(circle at 0px ${CARD_NOTCH_RADIUS}, transparent ${CARD_NOTCH_RADIUS}, black ${CARD_NOTCH_RADIUS});
  mask-image: radial-gradient(circle at ${CARD_NOTCH_RADIUS} ${CARD_NOTCH_RADIUS}, transparent ${CARD_NOTCH_RADIUS}, black ${CARD_NOTCH_RADIUS}), radial-gradient(circle at 0px ${CARD_NOTCH_RADIUS}, transparent ${CARD_NOTCH_RADIUS}, black ${CARD_NOTCH_RADIUS});
  -webkit-mask-size: ${CARD_NOTCH_RADIUS} ${CARD_NOTCH_RADIUS}, ${CARD_NOTCH_RADIUS} ${CARD_NOTCH_RADIUS};
  mask-size: ${CARD_NOTCH_RADIUS} ${CARD_NOTCH_RADIUS}, ${CARD_NOTCH_RADIUS} ${CARD_NOTCH_RADIUS};
  -webkit-mask-position: 0 0, 100% 0;
  mask-position: 0 0, 100% 0;
  -webkit-mask-repeat: no-repeat, no-repeat;
  mask-repeat: no-repeat, no-repeat;
}
`
}

/**
 * 「缝挡板」样式表文本 —— 停靠卡与输入框卡之间那条 6px 缝（官方 `--dsh-composer-stack-gap`）用**背景原样的不透明带**挡住：底座在本插件里不画填充，那 6px 就是一条**没有遮挡的窗口**（卡片上被玻璃化开的正文，在缝里却是原样清晰的）；⚠️ 遮住而不「接上」—— 那 6px 间距是官方有意的语义（颜色标记**单个东西的身份**、间距标记**分组边界**）。
 * 做法：缝**下面那个条目**挂 `::before` 向上铺满、复用 {@link backingPaint}（不透明 ⇒ 静态观感零变化），高度 = 缝间距 + 两头圆角缺口（见 {@link SEAM_NOTCH_PX}）；⚠️ **不能往输入框卡顶里伸**（那是玻璃，背衬塞到玻璃背后那一片就不再透正文），挂「下面那个」是因为待办卡根元素 `overflow: hidden` 会**裁掉**向下伸的伪元素。
 * ⚠️ 三条缝各自的**门**不可省（排队卡自带负 `margin-bottom` 塞到输入框卡下面、本来就没缝；无停靠卡时上方也没有缝），**无条件挂会把带子画到底座外、盖住正文**；最后一条挂的是**卡的父元素**而非卡自己（卡片带 `backdrop-filter` 自成层叠上下文，伪元素会画到停靠卡之上），门挂**座位**上、宿主是它里面的父元素 ⇒ 两者之间必须有**后代组合符**。⚠️ **本表故意与另外两张表分开**：玻璃表守卫「不许出现 `:has()`」、surface 表守卫「不许出现 `data-phase`」，而本表两条都要用 —— 别为省一个 `<style>` 把它们合并。
 */
export function buildSeamCss(): string {
  /** 三条缝的公共门：官方默认让路 + 只 active。 */
  const gate = `body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat]`
  /**
   * 缝**下面那个条目**的锚点 → 铺一条不透明带。`bothNotches` = 是否连带上、下**两张卡**的圆角缺口一起盖：
   * 停靠卡之间两张都是不透明卡、两边都盖；「停靠卡 ↔ 输入框卡」下面那张是**玻璃**，往它顶里伸会把背衬塞到玻璃背后，故只往上盖。
   */
  const band = (selector: string, bothNotches: boolean): string => {
    const height = bothNotches
      ? `calc(var(--dsh-composer-stack-gap, 6px) + ${2 * SEAM_NOTCH_PX}px)`
      : `calc(var(--dsh-composer-stack-gap, 6px) + ${SEAM_NOTCH_PX}px)`
    const bottom = bothNotches ? `calc(100% - ${SEAM_NOTCH_PX}px)` : '100%'
    return `${selector}::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: ${bottom};
  height: ${height};
  z-index: -1;
  pointer-events: none;
  ${backingPaint()}
}`
  }
  /** 官方那两个 wrapper 是 static，补成包含块（无偏移，不改布局）。 */
  const host = (selector: string): string => `${selector} {
  position: relative;
}`
  const goalBand = `${gate} [data-testid='todo-panel'] ~ [data-goal-bar]`
  const queueBand = `${gate} :is([data-testid='todo-panel'], [data-goal-bar]) ~ [data-queue-dock]`
  const cardBand = `${gate}${anchorSelector(ANCHOR.seatDocked)} ${anchorSelector(ANCHOR.composerHost)}`
  return `/* ===== dsh-theme-tone: 缝挡板（停靠卡与输入框卡之间的 6px 缝） ===== */
${host(goalBand)}
${band(goalBand, true)}
${host(queueBand)}
${band(queueBand, true)}
${host(cardBand)}
${band(cardBand, false)}
${buildCardNotchCss()}`
}
