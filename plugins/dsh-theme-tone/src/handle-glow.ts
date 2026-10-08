/**
 * dsh-theme-tone：把官方宽度拖拽条的**悬停光带**钉到指针上（修官方自己的一个 bug）。**本条不带色调门、两个档位都生效** —— 修的是官方无意的 bug（= 复原官方本该有的行为，判据与反例见 `nav-pin.ts`），故不得依赖插件 token 层：只用 JS 写官方自己消费的那个变量（官方改名即静默失效、页面回到官方现状，不会更糟）；不替换 / 不包装 / 不覆写官方函数 ⇒ 不属私有 seam。
 * 官方 `--dsh-width-handle-pointer-y` 只在**拖拽中**写，纯悬停从未被写 ⇒ CSS 只能走兜底 `50%`，而它相对拖拽条盒子（被官方顶栏压下）算，光带因此比屏幕中心低 38px；补写变量取元素实测矩形。
 * ⚠️ 拖拽期间不插手（那时变量归官方维护，抢写会打架）。
 */

/** 官方光带位置变量名（由 `.widthHandle::after` 消费）；官方改名即本修法静默失效。 */
export const POINTER_Y_VARIABLE = '--dsh-width-handle-pointer-y'

/** 拖拽条的官方公开属性（`.widthHandle`）。 */
export const HANDLE_SELECTOR = '[data-width-handle]'

/** 官方在**拖拽期间**给拖拽条打的标记：此刻变量归官方维护，我们不插手。 */
export const DRAGGING_ATTR = 'data-dragging'

/** 本模块操作所需的最小元素面（便于用假对象单测，不依赖真实 DOM）。 */
export interface GlowTargetLike {
  hasAttribute(name: string): boolean
  getBoundingClientRect(): { readonly top: number }
  readonly style: {
    setProperty(name: string, value: string): void
    getPropertyValue(name: string): string
  }
}

/** 光带相对拖拽条盒子顶部的偏移（px）。⚠️ 必须与官方 `onPointerMove` 的公式**逐字一致**，否则悬停与拖拽的交界处光带会跳一下。 */
export function glowOffsetPx(boxTop: number, clientY: number): number {
  return clientY - boxTop
}

/** 要写进 {@link POINTER_Y_VARIABLE} 的 CSS 值（形如 `123px`）。 */
export function glowValue(boxTop: number, clientY: number): string {
  return `${glowOffsetPx(boxTop, clientY)}px`
}

/** 该由本插件写光带变量吗：官方拖拽中自己会写、抢写会打架；纯悬停官方从不写 —— 那正是光带靠下的根因。 */
export function shouldDriveGlow(target: GlowTargetLike): boolean {
  return !target.hasAttribute(DRAGGING_ATTR)
}

/** 把光带挪到指针处（纯逻辑，不触碰真实 DOM）；拖拽中是**空操作**，那时官方在写同一个属性。 */
export function applyGlow(target: GlowTargetLike, clientY: number): boolean {
  if (!shouldDriveGlow(target)) return false
  const value = glowValue(target.getBoundingClientRect().top, clientY)
  // 同值不重写：省掉一次样式失效，也避免与官方内联值来回拉锯。
  if (target.style.getPropertyValue(POINTER_Y_VARIABLE) === value) return false
  target.style.setProperty(POINTER_Y_VARIABLE, value)
  return true
}
