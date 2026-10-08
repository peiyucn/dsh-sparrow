/**
 * 「未选工作区」待启动态的判定（命中即撤掉本插件的边光，把边界让回官方）—— 纯函数，便于单测。
 * 哈希类名不能写（仓库红线）、官方同时写入的语义属性在普通态下也全为真，只能读计算样式签名：
 * `mask-image` 含 `stroke-dasharray`（官方内联 SVG 遮罩，页面上查不到 `border-style: dashed`）
 * 且 `content` 在渲染，缺一都可能被别的规则误命中。
 */

/** 判定所需的 `::after` 计算值子集（取自 `getComputedStyle(el, '::after')`；`mask-image` 浏览器可能只给 `-webkit-` 那份）。 */
export interface WorkstartProbe {
  content: string
  maskImage: string
  webkitMaskImage: string
}

/** 未生效的伪元素 `content` 给 `none` / 空串；在渲染的 `content: ""` 给带引号的 `'""'`。 */
export function rendersContent(content: string): boolean {
  const value = content.trim()
  if (value === '' || value === 'none' || value === 'normal') return false
  return true
}

/** 遮罩是否是官方那条「虚线圆角框」。 */
export function isDashedRing(probe: WorkstartProbe): boolean {
  if (!rendersContent(probe.content)) return false
  const masks = `${probe.maskImage} ${probe.webkitMaskImage}`.toLowerCase()
  // 浏览器可能把 data URI 原样给出（含 `stroke-dasharray`），也可能已解码成 SVG 源码，两种都认。
  return masks.includes('stroke-dasharray') || masks.includes('stroke-dasharray%3d')
}

export function isWorkstartProbe(probe: WorkstartProbe): boolean {
  return isDashedRing(probe)
}
