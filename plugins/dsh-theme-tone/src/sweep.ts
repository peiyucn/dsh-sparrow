/**
 * 官方「运行中」扫光带（sweep）—— **照我们自己的背景画**（owner 定的 A 方案）。
 *
 * ## 官方那套的完整逻辑
 *
 * 官方带子画的是 `color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent)`，
 * 而**官方对话区的底色恰好就是 `bg-base`**（`ConversationRoot.module.css:7`
 * 的 `.root { background: var(--dsw-alias-bg-base) }`，一块**纯色**）。于是：
 *
 * * 压在背景上：`0.6 × bg-base + 0.4 × bg-base = bg-base` → **与背景逐像素相同，看不见**；
 * * 压过字形：`0.6 × bg-base + 0.4 × 字形` → 把字往背景色洗 → 那行字一亮一暗地扫过。
 *
 * 官方注释写的正是这个意图：「washing glyphs and icon toward the background as it passes」。
 * 换句话说：**官方是照它自己的背景画的**；带子从来不是给眼睛看的图形。
 *
 * ## 我们照做（owner：「我们也应该根据自己的背景画这个脉冲条」）
 *
 * 我们的背景 = `bg-base` **+ 背景层那串光 + 颗粒** —— 所以照搬官方那支
 * 「纯 `bg-base` 的 60%」必然与背景差一档（前三版都栽在这：任何**固定颜色**的带子都会显形）。
 *
 * 正确做法只有一句：**把「我们自己的背景」按 60% 画上去**：
 *
 * | 官方 | 我们 |
 * | :--- | :--- |
 * | `bg-base`（它的背景） | `var(--dsw-alias-bg-base)`（色调底色，同一个 token） |
 * | ——（官方背景没有光） | **背景层那串渐变**（`BACKDROP_GRADIENTS`，同源不复制数值） |
 * | ——（官方背景没有颗粒） | **颗粒瓦片**（`GRAIN_TILE_VARIABLE`） |
 * | 颜色里的 `60%` | **`mask` 的峰值 alpha `60%`** |
 *
 * ## ⚠️ 锚点必须收窄（上一版的回归，别再犯）
 *
 * 上一版锚点写成 `[data-state='running']::after` + `[data-state='running'] [class*='_row']::after`
 * —— **太宽**：`data-state` 是通用属性、`_row` 是通用后缀，官方给元素写 `::after` 的理由
 * 五花八门（分隔线 / 描边 / 拖拽柄 / 展开箭头…），于是给一堆无关伪元素刷上了背景板，
 * owner 报「**整个对话区域的底部好像被一个纯色块给盖住了**」。
 *
 * 现在**必须**同时要求官方那 5 处各自独有的语义属性（逐个核过源码）：
 *
 * | 组件 | 独有属性 | 扫光带长在哪 |
 * | :--- | :--- | :--- |
 * | `ui-tool` bash-sample | `data-sample="bash"` / `data-variant="bash"` | 容器自身 `::after` |
 * | `ui-chat` ReasoningRow | `data-variant="think"` | `.row::after` |
 * | `ui-chat` GenericCommandCard | `data-variant="others"` | `.row::after` |
 * | `ui-tool` ToolRow | `data-variant` + `data-tool` | `.row::after` |
 * | `ui-skill` SkillRow | `data-tool="skill"` | `.row::after` |
 *
 * 五处都带 `data-variant` 或 `data-tool` —— 这就是收窄的判据（测试里钉死）。
 */

import { GRAIN_TILE_VARIABLE, PLAIN_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS } from './backdrop.js'

/**
 * 扫光带的锚点 —— 覆盖官方那 5 处实现，**且只覆盖它们**（理由见文件头）。
 *
 * 每个锚点都要求 `[data-state='running']` **加上** `data-variant` / `data-tool`
 * —— 只有那 5 个组件同时具备，通用容器（对话区、底座、队列卡的 `::after`…）不会误中。
 */
export const SWEEP_ANCHORS: readonly string[] = Object.freeze([
  "body [data-state='running'][data-variant]::after",
  "body [data-state='running'][data-tool]::after",
  "body [data-state='running'][data-variant] [class*='_row']::after",
  "body [data-state='running'][data-tool] [class*='_row']::after",
])

/**
 * 背景板的强度 —— **与官方那支颜色的 `60%` 对齐**。
 *
 * 这个数字不是我们挑的：官方就是「背景 × 60%」，而「带子颜色恰好等于背景」正是
 * 「压在背景上看不见」的全部原因。换源之后比例必须照旧，否则又会对不上背景。
 */
export const SWEEP_PLATE_ALPHA = 0.6

/**
 * 官方那条横向渐变的**峰位**（`transparent 0% → 55% → transparent 100%`）。
 *
 * 与 {@link SWEEP_PLATE_ALPHA} 一样是**必须与官方一致**的契约，故同样命名 ——
 * 改了它，扫光的节奏与位置手感就变了（`sweep.test.mjs` 钉住这个字面量）。
 */
export const SWEEP_PEAK_STOP = '55%'

/**
 * 背景板要画的图层（**从上到下**）—— 与「我们自己那块地面」逐项对应：
 *
 * 1. **颗粒瓦片**（`GRAIN_TILE_VARIABLE`）—— 漏了它带子就成了唯一「干净」的一条；
 * 2. **背景层那串光**（`BACKDROP_GRADIENTS`）—— 与背景层**同源**，不复制数值。
 *
 * 底色不在图层里（它走 `background-color`）。整块一起被 {@link SWEEP_SHAPE_MASK} 乘 0.6。
 */
export const SWEEP_PLATE_LAYERS =
  `var(${GRAIN_TILE_VARIABLE}, none),\n    ${BACKDROP_GRADIENTS}`

/**
 * 带子的**形状 + 强度**（`mask`）—— 一块 mask 干两件事：
 *
 * * **形状**：与官方那条横向渐变的 alpha 剖面一致（`transparent 0% → 55% → transparent 100%`）；
 * * **强度**：峰值 `rgb(0 0 0 / 60%)`，把整块背景板乘 `0.6`（与官方那支颜色的 60% 对齐）。
 *
 * **停点必须与官方一致**（{@link SWEEP_PEAK_STOP}），否则扫光的节奏与位置手感就变了；
 * **峰值必须保持 60%**，否则「压在背景上＝背景」这条等式不成立（大了显形、小了洗不动字）。
 */
export const SWEEP_SHAPE_MASK =
  `linear-gradient(90deg, transparent 0%, rgb(0 0 0 / ${Math.round(SWEEP_PLATE_ALPHA * 100)}%) ${SWEEP_PEAK_STOP}, transparent 100%)`

/**
 * 给锚点挂上「官方默认」门（与 `surface.ts` 的 `gatedAnchor` 同法：门并进锚点自己的 `body`）。
 * @param anchor - {@link SWEEP_ANCHORS} 里的一条。
 * @returns 带门的选择器。
 */
function gated(anchor: string): string {
  return anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
}

/**
 * 扫光带样式表文本 —— **照我们自己的背景画**：底色 + 同源的光 + 颗粒，整块乘 60%。
 *
 * `background-attachment: fixed` 不能省：它让百分比按**视口**解析，那串光才与背景层逐像素对齐。
 * ⚠️ **必须写成单个 `fixed`，不能写 `scroll, fixed`**：本规则的 `background-image` 有 **4 层**
 * （颗粒 + 三段渐变），而 per-layer 属性值少于层数时会**按顺序循环补齐** ——
 * `scroll, fixed` 实际是 `scroll, fixed, scroll, fixed`，第 1、3 段渐变会退回按元素自己的盒子解析。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildSweepCss(): string {
  return `/* ===== dsh-theme-tone 官方运行扫光带：照**我们自己的背景**画（owner 定的 A 方案） =====
   官方带子 = 它的背景 × 60%，而官方背景恰好是纯 bg-base → 压在背景上恒等于背景（看不见），
   只把字形往背景色洗。我们的背景 = bg-base + 背景层的光 + 颗粒，所以照搬官方那支
   「纯 bg-base 的 60%」必然差一档。
   本版：底色 + **同源**的光 + **颗粒**按原样画满，再让一整块 mask 把它乘 0.6 ——
   mask 同时承担「形状」（停点与官方一致）与「强度」（峰值 60%）。
   ⚠️ 锚点必须带 data-variant / data-tool（只有官方那 5 处同时具备）——
      上一版只按 data-state + _row 泛匹配，误伤了无关伪元素（owner 报「纯色块盖住底部」）。
   ⚠️ 不得声明 width / left / top / bottom / content / animation —— 全是官方几何。
   选择器带 ${PLAIN_ATTR} 门：官方默认下整表不命中（owner 定案：只在我们色调档实现）。 */
${SWEEP_ANCHORS.map(anchor => `${gated(anchor)} {
  /* 背景板：底色 + 同源的光 + 颗粒（照我们自己的地面，一项都不许少） */
  background-color: var(--dsw-alias-bg-base);
  background-image: ${SWEEP_PLATE_LAYERS};
  background-attachment: fixed;
  /* 形状与强度：官方剖面 + 峰值 60%（一块 mask 干两件事） */
  -webkit-mask-image: ${SWEEP_SHAPE_MASK};
  mask-image: ${SWEEP_SHAPE_MASK};
}`).join('\n')}
`
}
