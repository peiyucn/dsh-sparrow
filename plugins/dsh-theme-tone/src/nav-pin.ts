/**
 * 轮次导航（Turn Navigation）在窄列不消失 + 会话内容宽度钳制 —— 自 `dsh-nav-pin` 并入的**功能**。
 * 纯 CSS，无运行期探测：官方把 `display: none` 直接写在 `<nav aria-label=…>` 上，aria-label 是公开
 * 锚点（两套文案），按属性选择器即可压过官方 CSS-module 类名的特异性。断点与宽度公式照官方常量取。
 */

/** 官方 nav 的 aria-label 文案（中 / 英）。 */
export const NAV_ARIA_LABELS: readonly string[] = ['Turn navigation', '轮次导航']

/** 官方在 900px 隐藏；并到 700px 才停显。 */
export const HOVER_HIDE_BREAKPOINT_PX = 700

/** 浮现过渡（与旧版一致）。 */
const OPACITY_TRANSITION_MS = 120
const NATIVE_HEIGHT_TRANSITION = 'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'

/** 内容宽度钳制：宽列每侧至少留 120px，窄列地板 640px（官方最小内容宽）。 */
export const CONTENT_MAX_SIDE_CLEARANCE_PX = 120
export const CONTENT_MIN_FLOOR_PX = 640
/** 输入卡片比内容宽 32px（官方 `--dsh-composer-card-max-width` 公式）。 */
const CARD_EXTRA_WIDTH_PX = 32

function navSelector(): string {
  return NAV_ARIA_LABELS.map(label => `nav[aria-label=${JSON.stringify(label)}]`).join(',\n')
}

/** 官方内容宽度公式（`clamp(680px, column × 0.64, 920px)`）加本插件的两侧留白钳制。 */
function clampedContentWidth(): string {
  const derived = 'clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * 0.64), 920px)'
  return `min(${derived}, max(${CONTENT_MIN_FLOOR_PX}px, calc(var(--dsh-conversation-column-width, 0px) - ${CONTENT_MAX_SIDE_CLEARANCE_PX * 2}px)))`
}

export function buildNavPinCss(): string {
  const nav = navSelector()
  return `/* 1) 恒显：压过官方 @container (max-width: 900px) 的 display: none */
${nav} {
  display: block;
}

/* 2) ≤${HOVER_HIDE_BREAKPOINT_PX}px：默认隐身（保留指针命中），hover / 键盘 focus 淡入；只做 opacity */
@container (max-width: ${HOVER_HIDE_BREAKPOINT_PX}px) {
  ${nav} {
    opacity: 0;
    box-sizing: border-box;
    transition: opacity ${OPACITY_TRANSITION_MS}ms ease-out, ${NATIVE_HEIGHT_TRANSITION};
  }

  ${NAV_ARIA_LABELS.map(label => `nav[aria-label=${JSON.stringify(label)}]::before`).join(',\n')} {
    content: '';
    position: absolute;
    inset: -8px 0 -8px -16px;
  }

  ${NAV_ARIA_LABELS.flatMap((label) => {
    const sel = `nav[aria-label=${JSON.stringify(label)}]`
    return [`${sel}:hover`, `${sel}:focus-within`]
  }).join(',\n')} {
    opacity: 1;
  }
}

/* 3) 内容宽度钳制：滚动体与拖拽条共用同一宽度轴，卡片宽度同步重算 */
[data-conversation-scroll],
[data-width-handle] {
  --dsh-chat-content-width: ${clampedContentWidth()};
}
[data-conversation-scroll] {
  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + ${CARD_EXTRA_WIDTH_PX}px);
}

@media (prefers-reduced-motion: reduce) {
  @container (max-width: ${HOVER_HIDE_BREAKPOINT_PX}px) {
    ${nav} {
      transition: none;
    }
  }
}
`
}
