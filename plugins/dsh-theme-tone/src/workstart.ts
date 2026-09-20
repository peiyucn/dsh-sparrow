/**
 * 「未选工作区」待启动态的判定 —— **纯函数**，与 DOM / 主题无关，便于单测。
 *
 * ## 背景
 *
 * 官方在「还没选工作区」时给输入框卡片加一个 CSS-module 哈希类
 * （`.…_cardWorkspaceTrigger`），由 `::after` 画一圈虚线圆角框，并同时把
 * `--dsw-elevation-stroke-color` 设成 `transparent` —— 官方刻意让那条虚线成为唯一边界。
 *
 * 本插件的玻璃给卡片**无条件**加了悬浮投影 + 内嵌边光，于是两套边缘语言叠加（不和谐）。
 * 这个状态下要撤掉我们的边光，把边界让回官方。
 *
 * ## 为什么不能用 CSS 选择器
 *
 * 哈希类名不能写（仓库红线）。而官方同时写入的语义属性都不可用 —— 实测普通态下
 * `:has([aria-haspopup='menu'])`、`:has([aria-haspopup])`、`:has([contenteditable])`
 * **全部为真**（分别被本插件的模型触发器、附件/权限按钮、输入框污染）。
 * 故只能读**计算样式**里那条虚线自身的签名。
 *
 * ## 签名
 *
 * 官方那条 `::after` 有两个稳定特征，任一单独都不够（都可能被别的规则满足）：
 *
 * 1. `content` 不是 `none` / `normal` / `''`（伪元素真的在渲染）；
 * 2. `mask-image`（或 `-webkit-mask-image`）里含 `stroke-dasharray` —— 官方用一段
 *    内联 SVG 圆角矩形做遮罩，这是「虚线」二字的来源（所以页面上**查不到**任何
 *    `border-style: dashed`）。
 *
 * 两者同时成立才判为待启动态。
 */

/** 判定所需的 `::after` 计算值子集（从 `getComputedStyle(el, '::after')` 取）。 */
export interface WorkstartProbe {
  /** `content` 的计算值。 */
  content: string
  /** `mask-image` 的计算值（浏览器可能只给 `-webkit-` 那份）。 */
  maskImage: string
  /** `-webkit-mask-image` 的计算值。 */
  webkitMaskImage: string
}

/**
 * `content` 是否表示「伪元素真的在渲染」。
 *
 * `getComputedStyle` 对未生效的伪元素给 `none`（或空串）；写 `content: ""` 的元素给 `'""'`
 * （带引号的空串）—— 后者**是**在渲染，官方那条正是 `content: ""`。
 * @param content - `content` 的计算值。
 * @returns 是否在渲染。
 */
export function rendersContent(content: string): boolean {
  const value = content.trim()
  if (value === '' || value === 'none' || value === 'normal') return false
  return true
}

/**
 * 遮罩是否是官方那条「虚线圆角框」。
 * @param probe - 三个计算值。
 * @returns 是否命中。
 */
export function isDashedRing(probe: WorkstartProbe): boolean {
  if (!rendersContent(probe.content)) return false
  const masks = `${probe.maskImage} ${probe.webkitMaskImage}`.toLowerCase()
  // 浏览器可能把 data URI 原样给出（含 stroke-dasharray），也可能已解码成 SVG 源码，两种都认。
  return masks.includes('stroke-dasharray') || masks.includes('stroke-dasharray%3d')
}

/**
 * 给定的 `::after` 探针是否表示「未选工作区」待启动态。
 * @param probe - `::after` 的三个计算值。
 * @returns 是否处于待启动态。
 */
export function isWorkstartProbe(probe: WorkstartProbe): boolean {
  return isDashedRing(probe)
}
