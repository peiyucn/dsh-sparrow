/** 官方「运行中」扫光带 —— **照我们自己的背景画**：官方那支 =「它自己的背景 × 60%」，压在背景上恒等于背景。
 * 做法 = 底色 + 同源的光（`BACKDROP_GRADIENTS`）+ 颗粒，整块乘 60%。
 * ⚠️ 锚点必须带 `data-variant` / `data-tool` —— 只按 `data-state` + `_row` 泛匹配会误伤无关伪元素（曾盖住对话区底部）。
 * 官方 rc.2 只剩 2 处在画带子，前两条锚点当前静默失效（保留以防官方改回容器级画法）。 */

import { PLAIN_ATTR } from './constants.js'
import { faceLayerGeometry, backdropGradients } from './backdrop.js'

/** 扫光带的锚点 —— 官方那几处 `::after`，**只覆盖它们**；每条都要求 `data-state='running'` **加上** `data-variant` / `data-tool`。 */
export const SWEEP_ANCHORS: readonly string[] = Object.freeze([
  "body [data-state='running'][data-variant]::after",
  "body [data-state='running'][data-tool]::after",
  "body [data-state='running'][data-variant] [class*='_row']::after",
  "body [data-state='running'][data-tool] [class*='_row']::after",
])

/** 背景板的强度 —— **必须与官方那支颜色的 `60%` 对齐**：「带子颜色恰好等于背景」正是「压在背景上看不见」的全部原因。 */
export const SWEEP_PLATE_ALPHA = 0.6

/** 官方横向渐变的**峰位**（`0% → 55% → 100%`）—— 改了它扫光的节奏与位置手感就变了（测试钉住字面量）。 */
export const SWEEP_PEAK_STOP = '55%'

/** 背景板要画的图层（从上到下）：**颗粒瓦片** + **同源的光**（`BACKDROP_GRADIENTS`，不复制数值）；底色走 `background-color`，整块再被 {@link SWEEP_SHAPE_MASK} 乘 0.6。 */
export const SWEEP_PLATE_LAYERS = backdropGradients()

/** 一块 mask 干两件事：**形状**（停点与官方一致，见 {@link SWEEP_PEAK_STOP}）与**强度**（峰值 60%，大了显形、小了洗不动字）。 */
export const SWEEP_SHAPE_MASK =
  `linear-gradient(90deg, transparent 0%, rgb(0 0 0 / ${Math.round(SWEEP_PLATE_ALPHA * 100)}%) ${SWEEP_PEAK_STOP}, transparent 100%)`

/**
 * 扫光带的**背景几何**：与背景层同尺寸（`100vw 100vh`）+ 不重复 + 相位写死 `0 0`。
 *
 * ⚠️ 为什么可以用 `scroll` 而不吃 `background-attachment: fixed`：
 *  - `fixed` 让**定位区 = 视口**，于是每帧都要按视口重新栅格化——这是滚动掉帧的主因（spec 10 已实测，
 *    且「缩小声明尺寸也不省」，成本只与 `fixed` 本身有关）。
 *  - 这条带子的可见范围由 {@link SWEEP_SHAPE_MASK}（**横向** 0 → 55% → 100% 渐变）决定，
 *    叠加的背景板是「颗粒 + 三层光」。换 `scroll` 后**竖直**相位不再恒等于视口原点，
 *    但带子自身高度只有一行高（20–30px），竖直方向上光层的变化在掩膜内几乎不可见 ——
 *    真机逐像素实测：**0.006% 像素改变 / 全屏 160 万点**（`docs/spec/13-running-sweep-cost.md`）。
 *  - 这是「多会话同时工作就卡」的直接热源：**每个 running 行**都挂一层按视口栅格化的 `fixed`。
 * ⚠️ 必须**逐层**给 size / repeat / position，且层数要跟 `backdropGradients()` 一致 ——
 *    颗粒总开关会改变层数，故由 `faceLayerGeometry` 统一产出，不要手写 4 个值。
 */
export const SWEEP_BACKGROUND_GEOMETRY = (() => {
  const g = faceLayerGeometry('100vw 100vh')
  return `background-attachment: scroll;
  background-size: ${g.size};
  background-repeat: ${g.repeat};
  background-position: ${g.position};`
})()

/** 给锚点挂上「官方默认」门 —— 与 `surface.ts` 的 `gatedAnchor` 同法：门并进锚点自己的 `body`。 */
function gated(anchor: string): string {
  return anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
}

/**
 * 扫光带样式表文本 —— 底色 + 同源的光 + 颗粒，整块乘 60%。
 *
 * ⚠️ 不要改回 `background-attachment: fixed`：那条让**每个 running 行**每帧按视口重新栅格化，
 * 多会话并行时是主要掉帧来源；改用 {@link SWEEP_BACKGROUND_GEOMETRY} 的 `scroll` + 显式几何，
 * 逐像素等价（实测 0.006%）。
 */
export function buildSweepCss(): string {
  return `/* dsh-theme-tone 官方运行扫光带：照我们自己的背景画（底色 + 同源的光 + 颗粒，整块乘 60%）；锚点带 data-variant / data-tool 以收窄；选择器带 ${PLAIN_ATTR} 门，官方默认下整表不命中。 */
${SWEEP_ANCHORS.map(anchor => `${gated(anchor)} {
  background-color: var(--dsw-alias-bg-base);
  background-image: ${SWEEP_PLATE_LAYERS};
  ${SWEEP_BACKGROUND_GEOMETRY}
  -webkit-mask-image: ${SWEEP_SHAPE_MASK};
  mask-image: ${SWEEP_SHAPE_MASK};
}`).join('\n')}
`
}
