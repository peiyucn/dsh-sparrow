/**
 * 弹层定位纯逻辑：把滚动/缩放高频事件的「要不要动 state」决策收成纯函数，
 * 供组件节流复用，并让 node:test 直接覆盖（rAF 调度本身留在组件里）。
 */

/** 弹层定位点：视口坐标 + 是否向上翻转（下方放不下时翻到按钮上方）。 */
export interface PopoverPoint {
  readonly x: number
  readonly y: number
  readonly up: boolean
}

/** 重定位决策：close = 关弹层摘监听；skip = 位置未变不动 state；apply = 更新定位。 */
export type RepositionDecision = 'close' | 'skip' | 'apply'

/**
 * 滚动/缩放后的重定位决策：
 * - next 为 null（按钮矩形读不到，如图标已隐藏/卸载）→ close：关弹层、摘监听；
 * - 与上次位置相同 → skip：不 setState（React 状态引用不变即跳过重渲染）；
 * - 位置变化或首次定位 → apply：更新定位。
 */
export function repositionDecision(prev: PopoverPoint | null, next: PopoverPoint | null): RepositionDecision {
  if (next === null) return 'close'
  if (prev !== null && prev.x === next.x && prev.y === next.y && prev.up === next.up) return 'skip'
  return 'apply'
}
