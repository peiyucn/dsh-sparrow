/**
 * dsh-theme-tone：轮次导航窄屏不消失 + 会话宽度钳制。**四段规则全部带色调门**（`body:not([PLAIN_ATTR])`）：它们改的是官方有意的设计选择（断点、留白）—— 判据是「恢复官方本该有的行为」不带门、「改变官方有意的设计选择」带门（反例见 `handle-glow.ts`）。
 * ⚠️ `display: block` 那条**也必须带门**：它是「改官方断点」的核心动作，漏掉等于官方默认档也被改了，对外契约（官方档 = 逐像素一致）当场作废。
 */

import { PLAIN_ATTR } from './constants.js'
import { ANCHOR, anchorSelector } from './anchors.js'

/** 官方轮次导航 nav 的 aria-label 文案（zh / en 两套；官方改文案需同步更新）。 */
export const NAV_ARIA_LABELS: readonly string[] = ['Turn navigation', '轮次导航']

/** 「自动」档隐藏断点：对话列窄到多少 px 才默认隐藏轮次导航（官方为 900px，本插件提到 700px）。 */
export const HOVER_HIDE_BREAKPOINT_PX = 700

/** 浮现 / 隐藏的透明度过渡时长。 */
const OPACITY_TRANSITION_MS = 120

/** 官方 .frame 的高度过渡（复刻：覆盖 transition 简写会吃掉官方的高度动画）。 */
const NATIVE_HEIGHT_TRANSITION = 'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'

/** 会话内容每侧最小留白（官方为 88px）：钳制拖宽上限，右侧拖拽条不再挤占轮次导航命中区。 */
export const CONTENT_MAX_SIDE_CLEARANCE_PX = 120

/** 钳制地板 = 官方最小内容宽度（CONTENT_MIN 640）：窄列下内容不压过 640px。 */
export const CONTENT_MIN_FLOOR_PX = 640

/** 官方输入卡片比内容宽的固定增量（--dsh-composer-card-max-width = 内容宽 + 32px）。 */
const CARD_EXTRA_WIDTH_PX = 32

/** 色调门前缀：与 `backdrop.ts` / `glass.ts` 同一套写法；官方默认档下 body 带 PLAIN_ATTR ⇒ 下列规则都不命中。 */
const GATE = `body:not([${PLAIN_ATTR}]) `

/**
 * 轮次导航 slot 定位选择器：对话滚动体内、轮次导航 nav 的**直接父元素**（slot 是官方 `display: none`
 * 的作用目标，本规则以更高特异性压过它）。判据走**锚点属性** `ANCHOR.turnNavHost`（由 client half 维护、
 * 只认 {@link NAV_ARIA_LABELS} 里那两个文案），不用 `:has()` —— 它的失效跟踪是样式重算成本大头。
 * 选择器**不带门**，由调用方加；`_label` 仅为兼容既有调用保留。
 */
export function slotSelector(_label: string): string {
  return `${anchorSelector(ANCHOR.turnNavHost)}`
}

/**
 * 恒显规则：压过官方 `@container (max-width: 900px)` 的 `display: none`（特异性更高，无需 !important）。
 * ⚠️ 必须打到 **nav** 上（`.frame` 就是那个 `<nav aria-label=…>`）—— 打在外层 slot 上是空操作。
 */
function alwaysVisibleRule(labels: readonly string[]): string {
  const navs = labels.map(label => `${GATE}${slotSelector(label)} > nav`).join(',\n')
  return `${navs} {
  display: block;
}`
}

/** ≤断点：默认隐身（保留指针命中），hover / 键盘 focus 淡入浮现；只做 opacity，不加框 / 底色 / 阴影。 */
function hoverRevealBlock(labels: readonly string[], breakpointPx: number): string {
  const navs = labels.map(label => `${GATE}${slotSelector(label)} > nav`).join(',\n')
  const hitAreas = labels.map(label => `${GATE}${slotSelector(label)} > nav::before`).join(',\n')
  const reveals = labels.flatMap(label => [
    `${GATE}${slotSelector(label)} > nav:hover`,
    `${GATE}${slotSelector(label)} > nav:focus-within`,
  ]).join(',\n')
  return `@container (max-width: ${breakpointPx}px) {
  ${navs} {
    opacity: 0;
    box-sizing: border-box;
    /* 与官方 .frame 的高度过渡并列：覆盖 transition 简写会吃掉官方的高度动画。 */
    transition: opacity ${OPACITY_TRANSITION_MS}ms ease-out, ${NATIVE_HEIGHT_TRANSITION};
  }

  /* 命中区：frame 自身 28px 轨道 + ::before 向左扩 16px、上下各 8px（left 取负值越出 frame 左缘）。 */
  ${hitAreas} {
    content: '';
    position: absolute;
    inset: -8px 0 -8px -16px;
  }

  ${reveals} {
    opacity: 1;
  }
}`
}

/**
 * 会话内容最大宽度钳制：宽列拖宽上限收紧（官方 88px → 120px / 侧）、窄列地板 640 让出导航余量。
 * ⚠️ **捕获点必须落在真正定义 `--dsh-chat-content-width` 的元素上**（`[data-phase]` 下那个含滚动体的直接子元素，两版都成立）——
 * 写在外层 `[data-phase]` 自身上时该变量解析为空 → 下游 `min(空, …)` 让整条自定义属性 invalid → 滚动体与拖拽条的宽度轴**全部失效**。
 */
function widthCapBlock(): string {
  const body = `${GATE}[data-phase] > ${anchorSelector(ANCHOR.scrollWrap)}`
  return `${body} {
  --dsh-nav-pin-official-width: var(--dsh-chat-content-width);
}
${body} > [data-conversation-scroll],
${body} [data-width-handle] {
  --dsh-chat-content-width: min(
    var(--dsh-nav-pin-official-width),
    max(${CONTENT_MIN_FLOOR_PX}px, calc(var(--dsh-conversation-column-width) - ${CONTENT_MAX_SIDE_CLEARANCE_PX * 2}px))
  );
}
${body} > [data-conversation-scroll] {
  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + ${CARD_EXTRA_WIDTH_PX}px);
}`
}

/** reduced-motion：关闭 opacity 过渡。 */
function reducedMotionBlock(labels: readonly string[], breakpointPx: number): string {
  const navs = labels.map(label => `${GATE}${slotSelector(label)} > nav`).join(',\n')
  return `@media (prefers-reduced-motion: reduce) {
  @container (max-width: ${breakpointPx}px) {
    ${navs} {
      transition: none;
    }
  }
}`
}

/**
 * 生成注入样式表：恒显 + hover 浮层 + 宽度钳制 + reduced-motion 四段拼接（**四段全带色调门**）。
 * 异常输入取安全默认：空标签集 → 空串（无目标不注入任何规则）；非正断点 → 回退默认断点。
 */
export function buildNavPinCss(
  labels: readonly string[] = NAV_ARIA_LABELS,
  breakpointPx: number = HOVER_HIDE_BREAKPOINT_PX,
): string {
  if (labels.length === 0) return ''
  const breakpoint = Number.isFinite(breakpointPx) && breakpointPx > 0 ? breakpointPx : HOVER_HIDE_BREAKPOINT_PX
  return `/* dsh-theme-tone：轮次导航窄屏不消失（官方 900px 断点提到 ${breakpoint}px；更窄时 hover 浮现为浮层）——
 * 四组规则全部带色调门 body:not([${PLAIN_ATTR}])，官方默认档下一条都不命中。 */

/* 1) 恒显：压过官方 @container (max-width: 900px) 的 display: none（特异性更高，无需 !important）。 */
${alwaysVisibleRule(labels)}

/* 2) ≤${breakpoint}px：默认隐身（保留指针命中），hover / 键盘 focus 淡入浮现；只做 opacity。 */
${hoverRevealBlock(labels, breakpoint)}

/* 3) 会话内容最大宽度钳制：官方宽度值先捕获到含滚动体的那层（自定义属性自引用会成环失效），
 * 再在滚动体 / 拖拽条上 min() 钳制；卡片宽度公式（内容宽 + 32px）同步重算。 */
${widthCapBlock()}

${reducedMotionBlock(labels, breakpoint)}
`
}
