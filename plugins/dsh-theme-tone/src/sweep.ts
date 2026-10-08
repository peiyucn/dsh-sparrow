/** 官方「运行中」扫光带 —— **照我们自己的背景画**：官方那支 =「它自己的背景 × 60%」，压在背景上恒等于背景。
 * 做法 = 底色 + 同源的光（`BACKDROP_GRADIENTS`）+ 颗粒，整块乘 60%。
 * ⚠️ 锚点必须带 `data-variant` / `data-tool` —— 只按 `data-state` + `_row` 泛匹配会误伤无关伪元素（曾盖住对话区底部）。
 * 官方 rc.2 只剩 2 处在画带子，前两条锚点当前静默失效（保留以防官方改回容器级画法）。 */

import { PLAIN_ATTR } from './constants.js'
import { grainOverGradients } from './backdrop.js'

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
export const SWEEP_PLATE_LAYERS = grainOverGradients()

/** 一块 mask 干两件事：**形状**（停点与官方一致，见 {@link SWEEP_PEAK_STOP}）与**强度**（峰值 60%，大了显形、小了洗不动字）。 */
export const SWEEP_SHAPE_MASK =
  `linear-gradient(90deg, transparent 0%, rgb(0 0 0 / ${Math.round(SWEEP_PLATE_ALPHA * 100)}%) ${SWEEP_PEAK_STOP}, transparent 100%)`

/** 给锚点挂上「官方默认」门 —— 与 `surface.ts` 的 `gatedAnchor` 同法：门并进锚点自己的 `body`。 */
function gated(anchor: string): string {
  return anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
}

/**
 * 扫光带样式表文本 —— 底色 + 同源的光 + 颗粒，整块乘 60%。
 * ⚠️ `background-attachment` **必须写成单个 `fixed`，不能写 `scroll, fixed`**：本条 `background-image` 有 4 层，per-layer 值不足会被循环补齐、第 1 / 3 段渐变退回按元素自身盒子解析。
 */
export function buildSweepCss(): string {
  return `/* dsh-theme-tone 官方运行扫光带：照我们自己的背景画（底色 + 同源的光 + 颗粒，整块乘 60%）；锚点带 data-variant / data-tool 以收窄；选择器带 ${PLAIN_ATTR} 门，官方默认下整表不命中。 */
${SWEEP_ANCHORS.map(anchor => `${gated(anchor)} {
  background-color: var(--dsw-alias-bg-base);
  background-image: ${SWEEP_PLATE_LAYERS};
  background-attachment: fixed;
  -webkit-mask-image: ${SWEEP_SHAPE_MASK};
  mask-image: ${SWEEP_SHAPE_MASK};
}`).join('\n')}
`
}
