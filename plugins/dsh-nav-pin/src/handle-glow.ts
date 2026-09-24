/**
 * dsh-nav-pin：把官方宽度拖拽条的**悬停光带**钉到指针上（修官方自己的一个 bug）。
 *
 * ## 官方的问题
 *
 * 官方光带位置读 `var(--dsh-width-handle-pointer-y, 50%)`
 * （`ConversationRoot.module.css` 的 `.widthHandle::after`），而那个变量**只在拖拽中**被写：
 *
 *     onPointerMove:
 *       if (!dragging.current) return                      // ← 没按住就什么都不做
 *       if (!hasPointerCapture(event.pointerId)) return
 *       setProperty('--dsh-width-handle-pointer-y', `${event.clientY - box.top}px`)
 *
 * 于是**纯悬停**时变量从未被写 → CSS 只能用兜底 `50%`。而 `50%` 是相对**拖拽条盒子**
 * 算的，那个盒子是 `.body` 里的 `top: 0; bottom: 0` —— 官方顶栏在流内占 76px，
 * 所以盒子是 `[76, 720]`、`50% = 398`，而视口中心是 360：
 *
 * | 状态 | 光带 Y |
 * | :--- | ---: |
 * | 悬停（变量未写，走兜底 50%） | **398**（比屏幕中心低 38px） |
 * | 按住拖动（官方写真实 clientY） | 跟随鼠标 |
 *
 * owner 在**同事机器的干净官方安装**上复现了同样的偏移，确认是官方 bug 而非本插件所致。
 *
 * ## 为什么用「补写官方变量」而不是「改 CSS 兜底值」
 *
 * 曾考虑纯 CSS：把兜底从 `50%` 改成 `calc(50% - 38px)`。**两处硬伤**，故弃：
 *
 * 1. **修不掉「点住才回到鼠标」**：那只把悬停的**固定**位置从 398 挪到 360，
 *    指针在 y=200 时按下，光带照样从 360 跳到 200。
 * 2. **要跨插件护栏**：那个 38px 偏移**只**在「官方顶栏在流内（占 76px）」时存在；
 *    一旦 dsh-theme-tone 的玻璃把顶栏浮层化，`.body` 从 y=0 起、盒子变成 `[0,720]`，
 *    `50%` **本来就在正中** —— 全局减 38px 会让那种情况反而偏高 76px。
 *
 * 补写变量则**与顶栏是否浮层无关**：公式取的是元素实测矩形，任何布局都对。
 *
 * ## 边界（都取 fail-safe）
 *
 * * **拖拽期间不插手**（见 {@link shouldDriveGlow}）：那段时间变量归官方维护
 *   （它有自己的 rAF 节流），抢写会两边打架。
 * * 只写**官方自己那个变量**，不写 `!important`、不碰 `top/bottom/width`、
 *   不改任何几何 —— 官方若改名或删掉它，我们写的就是一个没人消费的自定义属性，
 *   规则静默失效、页面回到官方现状，**不会更糟**。
 * * 全部判定做成纯函数，浏览器接线只负责取事件与元素。
 *
 * ## 语义说明（避免误读为「包装官方」）
 *
 * 本模块**不替换、不包装、不覆写**官方任何函数，也不读官方内部状态；
 * 只是把官方**自己公开消费**的那个自定义属性补上一个它漏掉的取值 ——
 * 与「官方自己写、我们只是把漏的那半边补上」完全同构。故不是私有 seam。
 */

/**
 * 官方光带位置变量名（由 `.widthHandle::after` 消费，见模块头）。
 * 官方改名即本修法静默失效（fail-safe）。
 */
export const POINTER_Y_VARIABLE = '--dsh-width-handle-pointer-y'

/** 拖拽条的官方公开属性（`ConversationRoot.tsx` 的 `.widthHandle`）。 */
export const HANDLE_SELECTOR = '[data-width-handle]'

/** 官方在**拖拽期间**给自己打的标记：此刻变量归官方维护，我们不插手。 */
export const DRAGGING_ATTR = 'data-dragging'

/** 本模块操作所需的最小元素面（便于用假对象单测，不依赖真实 DOM）。 */
export interface GlowTargetLike {
  /** 是否带某个属性（用于识别官方拖拽标记）。 */
  hasAttribute(name: string): boolean
  /** 实测矩形（只用 `top`）。 */
  getBoundingClientRect(): { readonly top: number }
  /** 内联样式读写面（官方同样写内联，天然互相覆盖、不残留）。 */
  readonly style: {
    setProperty(name: string, value: string): void
    getPropertyValue(name: string): string
  }
}

/**
 * 光带相对拖拽条盒子顶部的偏移（px）。
 *
 * ⚠️ 必须与官方 `onPointerMove` 的公式**逐字一致**（`event.clientY - box.top`）：
 * 差一点点，悬停与拖拽的交界处就会看到光带**跳一下**。
 * @param boxTop - `handle.getBoundingClientRect().top`。
 * @param clientY - 指针事件的 `clientY`。
 * @returns 偏移像素值（可为负：指针在盒子之上）。
 */
export function glowOffsetPx(boxTop: number, clientY: number): number {
  return clientY - boxTop
}

/**
 * 要写进 {@link POINTER_Y_VARIABLE} 的 CSS 值。
 * @param boxTop - `handle.getBoundingClientRect().top`。
 * @param clientY - 指针事件的 `clientY`。
 * @returns 形如 `123px` 的自定义属性值。
 */
export function glowValue(boxTop: number, clientY: number): string {
  return `${glowOffsetPx(boxTop, clientY)}px`
}

/**
 * 这一刻该不该由本插件写光带变量。
 *
 * 官方拖拽中**自己**写它（见模块头那段 `onPointerMove`），我们抢写会与官方打架；
 * 非拖拽（= 纯悬停）官方从不写，只能用 CSS 兜底 `50%` —— 那正是「光带靠下」的根因。
 * @param target - 拖拽条元素。
 * @returns 该由我们写时为 true。
 */
export function shouldDriveGlow(target: GlowTargetLike): boolean {
  return !target.hasAttribute(DRAGGING_ATTR)
}

/**
 * 把光带挪到指针处（纯逻辑，不触碰真实 DOM）。
 *
 * 拖拽中（{@link shouldDriveGlow} 为 false）是**空操作** —— 那时官方在写同一个属性。
 * @param target - 拖拽条元素。
 * @param clientY - 指针事件的 `clientY`。
 * @returns 真的写入时为 true；被让位 / 无变化时为 false。
 */
export function applyGlow(target: GlowTargetLike, clientY: number): boolean {
  if (!shouldDriveGlow(target)) return false
  const value = glowValue(target.getBoundingClientRect().top, clientY)
  // 同值不重写：省掉一次样式失效，也避免与官方内联值来回拉锯。
  if (target.style.getPropertyValue(POINTER_Y_VARIABLE) === value) return false
  target.style.setProperty(POINTER_Y_VARIABLE, value)
  return true
}
