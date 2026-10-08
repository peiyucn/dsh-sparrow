/**
 * 视口相位的**几何解算**（纯函数，无 DOM 依赖，便于单测）。
 *
 * ## 它解决什么
 * 座底不透带与卡片缺口这两条规则原本靠 `background-attachment: fixed` 让
 * 「图片盒 == 视口」。`fixed` 的语义**与元素几何无关** ⇒ 任何布局状态都对，
 * 但它要**每帧按视口栅格化**，实测是滚动卡顿的主因（`docs/spec/10-fixed-attachment-cost.md`）。
 *
 * 换成 `scroll` + 显式相位后，正确性落到**背景定位区左上角在视口里的坐标**上：
 * `background-position` 的长度相对**元素自身**的定位区解析，故把偏移写成该坐标取负，
 * 即可把图片左上角钉回**视口左上角** —— 这正是 `fixed` 的语义，
 * 且与元素宽高**完全无关**（于是不必为了相位改任何盒子几何）。
 *
 * ## 为什么必须运行期测，不能纯 CSS 推
 * 纯 CSS 只能写出「右栏折叠」时的值（`100vw − var(--dsh-conversation-column-width)`）。
 * **右栏一开就推不出** —— 左栏偏移与右栏宽同时变，一个方程两个未知量
 *（实测该载体左缘仍是 280、右缘却从 2873 变 1577）。而官方把右栏宽只写成
 * `gridTemplateColumns` 内联样式、没发布成 CSS 变量，面板宽也只写在面板自己身上
 * ⇒ 纯 CSS 读不到。所以这个量**测**出来：测到了就统一走快档，
 * 不再有「右栏开着时性能档不生效」这种例外。
 *
 * ## 纯函数边界
 * 任何异常输入（非有限数、零宽、负坐标、越出视口）都返回 `null` —— 调用方据此不挂门，
 * 该条规则退回 `fixed`（正确但慢），绝不写一个可能错位的值。
 */

/** 视口尺寸（px）。 */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

/** 解算结果：两个可直接写进 `background-position` 的 CSS 长度。 */
export interface PhaseOrigin {
  /** 定位区左缘到视口左缘的距离。 */
  readonly left: string
  /** 定位区上缘到视口上缘的距离。 */
  readonly top: string
}

/**
 * 容忍的亚像素误差（px）。布局取整、缩放比换算都会带来零点几像素的偏差，
 * 而这个量只是**相位偏移**（错 1px 都看不出来），不需要更严。
 */
const EPSILON = 0.5

/**
 * 把一个像素值格式化成 **CSS 长度**（px，三位小数）。
 *
 * 三位小数是有意的：`getBoundingClientRect` 在缩放比 / 分数像素下会给出小数，
 * 取整会引入最多 0.5px 的相位偏移（肉眼不可见，但会让「逐像素等价」的
 * 验收断言在边界上抖）。三位足够精确，又不至于让字符串过长。
 * @param value - 像素值。
 * @returns 形如 `280.5px` 的字符串。
 */
export function px(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`
}

/**
 * 求一个绝对定位**伪元素**的定位区左上角（视口坐标系）。
 *
 * ## 为什么要这么绕
 * 相位要的是「**背景定位区**（= 伪元素的 padding 盒）左上角在视口里的坐标」，
 * 而伪元素没有 `getBoundingClientRect`。好在绝对定位盒的包含块是宿主
 *（`position: relative` / `sticky`）的 **padding 盒**，且 `getComputedStyle(host, '::after')`
 * 的 `left`/`top` 在绝对定位下返回**用值**（px）——于是可以精确还原：
 *
 * ```
 * 伪元素视口左缘 = 宿主边框盒左缘 + 宿主左边框 + 伪元素自身的 left
 * 伪元素视口上缘 = 宿主边框盒上缘 + 宿主上边框 + 伪元素自身的 top
 * ```
 *
 * ⚠️ **不能拿宿主矩形代替**：缺口伪元素是卡片宽的（宿主是全宽的），两者左缘差一个
 * 大内边距 —— 本轮真拿宿主算过，卡片顶边因此有 712 个像素画错。
 * ⚠️ **也不该拿卡片矩形代替**（虽然本轮一度这么做）：那依赖「卡片与伪元素同宽同左、
 * 宿主无上内边距」这类**实测不变量**；官方一改内边距就静默错位。
 * 本函数只依赖 CSS 定位语义，没有这类隐含前提。
 *
 * @param hostLeft - 宿主**边框盒**左缘（`getBoundingClientRect().left`）。
 * @param hostTop - 宿主边框盒上缘。
 * @param borderLeft - 宿主左边框宽（px）。
 * @param borderTop - 宿主上边框宽（px）。
 * @param pseudoLeft - 伪元素计算样式里的 `left`（px）。
 * @param pseudoTop - 伪元素计算样式里的 `top`（px）。
 * @returns 定位区左上角（视口坐标）；任一入参不是有限数时返回 `null`。
 */
export function pseudoOrigin(
  hostLeft: number,
  hostTop: number,
  borderLeft: number,
  borderTop: number,
  pseudoLeft: number,
  pseudoTop: number,
): { readonly left: number; readonly top: number } | null {
  const nums = [hostLeft, hostTop, borderLeft, borderTop, pseudoLeft, pseudoTop]
  if (nums.some((n) => !Number.isFinite(n))) return null
  return { left: hostLeft + borderLeft + pseudoLeft, top: hostTop + borderTop + pseudoTop }
}

/**
 * 校验并格式化一个载体的相位原点。
 *
 * 可用判据（任一不满足即 `null`）：
 * * 两个坐标都是有限数、视口宽高 > 0；
 * * 左缘 / 上缘不小于 `−EPSILON`（视口坐标系里负值说明取错了元素）；
 * * 左缘 / 上缘不超出视口右 / 下缘（同样说明取错了元素）。
 *
 * ⚠️ **不校验宽度**：相位只用到左上角，宽度既不影响正确性、也不该成为「不生效」的理由
 *（曾要求宽度 > 1px，结果元素一时没布局就把整档拖回慢档）。
 *
 * @param origin - 定位区左上角（视口坐标）。
 * @param viewport - 视口尺寸（`innerWidth` / `innerHeight`）。
 * @returns 两个 CSS 长度；几何不可用时返回 `null`（调用方须退回 `fixed` 档）。
 */
export function solvePhaseOrigin(
  origin: { readonly left: number; readonly top: number } | null,
  viewport: ViewportSize,
): PhaseOrigin | null {
  if (origin === null) return null
  const { left, top } = origin
  const { width, height } = viewport
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  if (left < -EPSILON || top < -EPSILON) return null
  if (left > width + EPSILON || top > height + EPSILON) return null
  return { left: px(Math.max(0, left)), top: px(Math.max(0, top)) }
}
