/**
 * 视口相位的**几何解算**（纯函数，无 DOM 依赖，便于单测）：不用 `background-attachment: fixed`（让「图片盒 == 视口」，语义对但每帧按视口栅格化 ⇒ 滚动卡顿），改用 `scroll` + 显式相位 —— 正确性落在**背景定位区左上角在视口里的坐标**上，把偏移写成该坐标取负即可把图片左上角钉回视口左上角（与元素宽高无关）。
 * 该量必须运行期测：右栏一开，左栏偏移与右栏宽同时变，官方没把右栏宽发布成 CSS 变量 ⇒ 纯 CSS 推不出。
 * 异常输入一律返回 `null`，调用方退回 `fixed`。
 */

/** 视口尺寸（px）。 */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

/** 解算结果：两个可直接写进 `background-position` 的 CSS 长度（定位区左/上缘到视口左/上缘的距离）。 */
export interface PhaseOrigin {
  readonly left: string
  readonly top: string
}

/** 容忍的亚像素误差（px）：布局取整 / 缩放比换算带来的零点几像素偏差；相位错 1px 也看不出来。 */
const EPSILON = 0.5

/** 格式化成 **CSS 长度**（px，三位小数）：`getBoundingClientRect` 会给小数，取整会让相位在边界上抖。 */
export function px(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`
}

/**
 * 求一个绝对定位**伪元素**的定位区左上角（视口坐标系）= 宿主边框盒左/上缘 + 宿主左/上边框 + 伪元素自身
 * `left`/`top`：伪元素没有 `getBoundingClientRect`，但绝对定位盒的包含块正是宿主的 padding 盒、且这两个
 * 计算值在绝对定位下是用值（px）。⚠️ 别改用宿主或卡片矩形代替 —— 宿主是全宽的（左缘与缺口伪元素差一个
 * 大内边距），卡片矩形则依赖实测不变量、官方一改内边距就静默错位；本函数只依赖 CSS 定位语义。
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
 * 校验并格式化一个载体的相位原点：坐标须为有限数、视口宽高 > 0、且落在视口内（负值 / 越界说明取错了元素）。
 * ⚠️ **不校验宽度**：相位只用到左上角，宽度既不影响正确性、也不该成为「不生效」的理由。
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
