


export const NAV_SELECTOR = '[data-conversation-scroll] nav'


export const HOVER_HIDE_BREAKPOINT_PX = 700


const OPACITY_TRANSITION_MS = 120
const NATIVE_HEIGHT_TRANSITION = 'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'


export const CONTENT_MAX_SIDE_CLEARANCE_PX = 120
export const CONTENT_MIN_FLOOR_PX = 640

const CARD_EXTRA_WIDTH_PX = 32


function clampedContentWidth(): string {
  const derived = 'clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * 0.64), 920px)'
  const adaptive = `min(${derived}, max(${CONTENT_MIN_FLOOR_PX}px, calc(var(--dsh-conversation-column-width, 0px) - ${CONTENT_MAX_SIDE_CLEARANCE_PX * 2}px)))`
  return `var(--dsh-chat-user-width, ${adaptive})`
}

export function buildNavPinCss(): string {
  const nav = NAV_SELECTOR
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

  ${nav}::before {
    content: '';
    position: absolute;
    inset: -8px 0 -8px -16px;
  }

  ${nav}:hover,
  ${nav}:focus-within {
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
