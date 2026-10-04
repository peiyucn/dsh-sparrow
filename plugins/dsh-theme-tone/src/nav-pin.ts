/**
 * dsh-theme-tone：轮次导航窄屏不消失 + 会话宽度钳制。
 *
 * **自 `dsh-nav-pin` 并入（2026-09-29，owner 拍板，方案见 `docs/spec/09-nav-pin-merge.md`）**：
 * 官方 900px 断点被提到 700px；≤700px 时导航默认隐身、hover / 键盘 focus 浮现为浮层；
 * 同时把会话内容每侧留白从官方 88px 收到 120px，让导航命中区不被拖拽条压住。
 *
 * ⚠️⚠️ **四段规则全部带色调门**（方案 §3.1 决策 3）：这是「改变官方有意的设计选择」
 * （断点、留白），属"有意改官方策略"，故**只在本插件色调生效时叠加**；
 * 官方默认档下一条都不命中 —— 用户选了色调才拿到这套布局优化。
 * 判据：**"恢复官方本该有的行为"不带门；"改变官方有意的设计选择"带门。**
 * （反例见同目录 `handle-glow.ts`：那条修的是官方无意的 bug，**不带门**、两档都生效。）
 *
 * ⚠️ `display: block` 那条**也必须带门** —— 它是"改官方断点"的核心动作，
 * 漏掉等于官方默认档也被改了，本插件的对外契约（官方档 = 逐像素一致）当场作废。
 *
 * 原 `dsh-nav-pin` 的 `REQUIRED_CSS_FEATURES`（`:has()` / `@container` 两条探针）**不再需要**：
 * theme-tone 的能力门不门这两项（依据见 `backdrop.ts` 的 REQUIRED_CSS_FEATURES 注释 ——
 * 缺失只是这几条规则不命中、退回官方外观，不该为它停掉整个色调）。dsh Web 只跑 Chromium。
 *
 * @module dsh-theme-tone/nav-pin
 */

import { PLAIN_ATTR } from './constants.js'

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

/**
 * 色调门前缀：与 `backdrop.ts` / `glass.ts` 同一套写法（`body:not([plain])`）。
 * 官方默认档下 body 带 PLAIN_ATTR ⇒ 下列每条规则都不命中。
 */
const GATE = `body:not([${PLAIN_ATTR}]) `

/** CSS 双引号属性选择器内的转义：反斜杠与双引号前置反斜杠，防标签内容破坏 / 注入选择器。 */
function escapeCssString(value: string): string {
  return value.replace(/[\\"]/gu, character => '\\' + character)
}

/**
 * 轮次导航 slot 定位选择器：对话滚动体（公开 DOM 标记）内、轮次导航 nav 的直接父元素。
 * slot 是官方隐藏规则（display: none）作用的目标，本规则以更高特异性压过它。
 * @param label - 官方 nav 的 aria-label 文案（自动做 CSS 转义）。
 * @returns slot 元素的 CSS 选择器（**不带门**，由调用方加）。
 */
export function slotSelector(label: string): string {
  return `[data-conversation-scroll] div:has(> nav[aria-label="${escapeCssString(label)}"])`
}

/**
 * 恒显规则：压过官方 `@container (max-width: 900px)` 的 `display: none`（特异性更高，无需 !important）。
 *
 * ⚠️ 隐藏规则的作用目标换过一次，**换点是 0.1.7-alpha.2**（逐 tag 实测
 * `packages/client/ui-chat/src/client/chat/TurnNavigator.module.css`，注意不在 ui-conversation）：
 * v0.1.5-rc.2 / v0.1.6-alpha.2 隐藏外层 `.slot`（:217-221 / :217-221），v0.1.7-alpha.1 仍隐藏 `.slot`（:200-204），
 * **v0.1.7-alpha.2 起改为隐藏 `nav.frame` 本身**（alpha.2 :206-210、rc.1 :206-210、rc.2 :207-211），
 * 而 `.frame` 就是那个 `<nav aria-label=…>`。
 * ⚠️ 本注释原先写成「0.1.7 起换、rc.1 才换」并把行号写成 rc.2 的 217-221 —— **两处都错**：
 * 217-221 落在 `@media (prefers-reduced-motion: reduce)` 段，与隐藏规则无关。
 * 结论不变且仍然必须遵守：本规则要跟着打到 **nav** 上，
 * 打在外层 slot 上等于空操作（实测：≤900px 导航依旧 display:none）。
 */
function alwaysVisibleRule(labels: readonly string[]): string {
  const navs = labels.map(label => `${GATE}${slotSelector(label)} > nav`).join(',\n')
  return `${navs} {
  display: block;
}`
}

/** ≤断点：默认隐身（保留指针命中），hover / 键盘 focus 淡入浮现；不加载框 / 底色 / 阴影（owner 实测拍板）。 */
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

  /* 命中区：frame 自身（28px 轨道）+ ::before 向左扩 16px、上下各 8px。
   *  left 取负值向左越出 frame 左缘（正值会落在 frame 内部，变成 12px 窄条）。 */
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
 * 会话内容最大宽度钳制：宽列拖宽上限收紧（官方 88px → 插件 120px / 侧）、窄列地板 640 让出导航余量。
 *
 * ⚠️ **捕获点必须落在真正定义 `--dsh-chat-content-width` 的那个元素上**（owner 真机报
 * 「官方调整对话界面整体宽度的按钮没了、两边很挤」的根因）：
 *
 * | 版本 | `--dsh-chat-content-width` 定义在 |
 * | :--- | :--- |
 * | 0.1.5-rc.2 | `.root`（= `[data-phase]`） |
 * | 0.1.7-rc.1 | `.body`（`[data-phase]` 的**子**元素） |
 *
 * 旧写法把捕获写在 `[data-phase]` 上。rc.1 里那个元素**自己没有**该变量、只有一个后代才有，
 * 于是 `var(--dsh-chat-content-width)` 在 `[data-phase]` 上解析为空 → `--dsh-nav-pin-official-width`
 * 是空值 → 下游 `min(空, …)` 整条自定义属性变成 invalid → `--dsh-chat-content-width` 在滚动体
 * 与拖拽条上**全部失效**（实测两者都拿到空值，拖拽条宽度从 10px 塌成 0）。
 *
 * 现在捕获在 `.body`（`[data-phase]` 下那个含滚动体的直接子元素）上：**两版都成立** ——
 * rc.1 上它自带该变量；0.1.5 上它从 `.root` 继承（自定义属性会继承，`var()` 照样解析得到值）。
 */
function widthCapBlock(): string {
  const body = `${GATE}[data-phase] > div:has(> [data-conversation-scroll])`
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
 * 异常输入返回安全默认值：空标签集 → 空串（无目标不注入任何规则）；非正断点 → 回退默认断点。
 * @param labels - 官方 nav 标签集合（默认 NAV_ARIA_LABELS）。
 * @param breakpointPx - 隐藏断点（默认 HOVER_HIDE_BREAKPOINT_PX）。
 * @returns 完整样式表文本（官方默认档下一条都不命中）。
 */
export function buildNavPinCss(
  labels: readonly string[] = NAV_ARIA_LABELS,
  breakpointPx: number = HOVER_HIDE_BREAKPOINT_PX,
): string {
  if (labels.length === 0) return ''
  const breakpoint = Number.isFinite(breakpointPx) && breakpointPx > 0 ? breakpointPx : HOVER_HIDE_BREAKPOINT_PX
  return `/* dsh-theme-tone：轮次导航窄屏不消失（官方 900px 断点提到 ${breakpoint}px；更窄时 hover 右缘浮现为浮层）。 */
/* ⚠️ 本段四组规则**全部带色调门**（body:not([${PLAIN_ATTR}])）——官方默认档下一条都不命中。 */

/* 1) 恒显：压过官方 @container (max-width: 900px) 的 display: none（特异性更高，无需 !important）。 */
${alwaysVisibleRule(labels)}

/* 2) ≤${breakpoint}px：默认隐身（保留指针命中），hover / 键盘 focus 淡入浮现。
 *    只做 opacity，不加载框 / 底色 / 阴影——与官方宽屏轨道形态一致（owner 实测拍板）。 */
${hoverRevealBlock(labels, breakpoint)}

/* 3) 会话内容最大宽度钳制：官方拖宽上限每侧留 88px（CONTENT_EDGE_BUDGET 176 / 2），
 *    右侧拖拽条（z-index 8）会压到轮次导航命中区（轨道 28px + 本插件 ::before 16px ≈ 右缘 56px）。
 *    每侧留白收紧到 120px：宽列下拖拽条外缘停在导航命中区之外；窄列下地板为官方最小内容宽度 640px（默认内容 680→640 换导航余量）。
 *    官方宽度值先捕获到含滚动体的那层上的 --dsh-nav-pin-official-width（自定义属性自引用会成环失效），
 *    再在滚动体 / 拖拽条上 min() 钳制；卡片宽度公式（内容宽 + 32px，InputBar 消费）同步重算。 */
${widthCapBlock()}

${reducedMotionBlock(labels, breakpoint)}
`
}
