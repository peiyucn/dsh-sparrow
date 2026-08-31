/** dsh-nav-pin 纯逻辑：轮次导航定位选择器与样式生成。 @module dsh-nav-pin/nav-pin */

/** 官方轮次导航 nav 的 aria-label 文案（zh / en 两套；官方改文案需同步更新，见插件 AGENTS.md）。 */
export const NAV_ARIA_LABELS: readonly string[] = ['Turn navigation', '轮次导航']

/** 「自动」档隐藏断点：对话列窄到多少 px 才默认隐藏轮次导航（官方为 900px，本插件提到 700px）。 */
export const HOVER_HIDE_BREAKPOINT_PX = 700

/** 浮现 / 隐藏的透明度过渡时长。 */
export const OPACITY_TRANSITION_MS = 120

/** 官方 .frame 的高度过渡（复刻：覆盖 transition 简写会吃掉官方的高度动画）。 */
const NATIVE_HEIGHT_TRANSITION = 'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'

/**
 * 轮次导航 slot 定位选择器：对话滚动体（公开 DOM 标记）内、轮次导航 nav 的直接父元素。
 * slot 是官方隐藏规则（display: none）作用的目标，本规则以更高特异性压过它。
 * @param label - 官方 nav 的 aria-label 文案。
 * @returns slot 元素的 CSS 选择器。
 */
export function slotSelector(label: string): string {
  return `[data-conversation-scroll] div:has(> nav[aria-label="${label}"])`
}

/**
 * 生成注入样式表：恒显规则 + ≤断点宽度的 hover 浮层规则 + reduced-motion 分支。
 * @param labels - 官方 nav 标签集合（默认 NAV_ARIA_LABELS）。
 * @param breakpointPx - 隐藏断点（默认 HOVER_HIDE_BREAKPOINT_PX）。
 * @returns 完整样式表文本。
 */
export function buildNavPinCss(
  labels: readonly string[] = NAV_ARIA_LABELS,
  breakpointPx: number = HOVER_HIDE_BREAKPOINT_PX,
): string {
  const slots = labels.map(slotSelector).join(',\n')
  const navs = labels.map(label => `${slotSelector(label)} > nav`).join(',\n')
  const hitAreas = labels.map(label => `${slotSelector(label)} > nav::before`).join(',\n')
  const reveals = labels.flatMap(label => [
    `${slotSelector(label)} > nav:hover`,
    `${slotSelector(label)} > nav:focus-within`,
  ]).join(',\n')

  return `/* dsh-nav-pin：轮次导航窄屏不消失（官方 900px 断点提到 ${breakpointPx}px；更窄时 hover 右缘浮现为浮层）。 */

/* 1) 恒显：压过官方 @container (max-width: 900px) 的 display: none（特异性更高，无需 !important）。 */
${slots} {
  display: block;
}

/* 2) ≤${breakpointPx}px：默认隐身（保留指针命中），hover / 键盘 focus 淡入浮现。
 *    只做 opacity，不加载框 / 底色 / 阴影——与官方宽屏轨道形态一致（owner 实测拍板）。 */
@container (max-width: ${breakpointPx}px) {
  ${navs} {
    opacity: 0;
    box-sizing: border-box;
    /* 与官方 .frame 的高度过渡并列：覆盖 transition 简写会吃掉官方的高度动画。 */
    transition: opacity ${OPACITY_TRANSITION_MS}ms ease-out, ${NATIVE_HEIGHT_TRANSITION};
  }

  /* 命中区：frame 自身（28px 轨道）+ ::before 向左扩 16px、上下各 8px。 */
  ${hitAreas} {
    content: '';
    position: absolute;
    inset: -8px 0 -8px 16px;
  }

  ${reveals} {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  @container (max-width: ${breakpointPx}px) {
    ${navs} {
      transition: none;
    }
  }
}
`
}
