/** client half 纯逻辑：只读测量几何（矩形/锚点）的数值比较。 */

/** 矩形（旋转光环跟随的 composer 卡片矩形等只读测量结果）。 */
export interface RectLike {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** 弹层锚点（灵敏度弹层：钉在胶囊右缘的 x、上/下缘的 y、空间不足向上翻转）。 */
export interface AnchorPointLike {
  readonly x: number
  readonly y: number
  readonly up: boolean
}

/**
 * 两个矩形数值相等（null 只与 null 相等）。
 * 高频测量回调（旋转光环 300ms 周期 + resize/scroll）据此跳过无变化的状态写入——
 * 否则每拍都写入新对象触发一次无意义重渲染。
 */
export function rectsEqual(left: RectLike | null, right: RectLike | null): boolean {
  if (left === null || right === null) return left === right
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}

/**
 * 两个锚点数值相等（null 只与 null 相等）。
 * 灵敏度弹层的滚动/缩放重定位按此跳过无变化的状态写入（滚动事件高频，逐事件重渲染无必要）。
 */
export function anchorPointsEqual(left: AnchorPointLike | null, right: AnchorPointLike | null): boolean {
  if (left === null || right === null) return left === right
  return left.x === right.x && left.y === right.y && left.up === right.up
}
