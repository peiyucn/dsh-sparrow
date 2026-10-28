/**
 * 输入框玻璃的边缘折射（Apple liquid glass 的近似）：一次注入 SVG 位移滤镜，
 * CSS 用 backdrop-filter 的 url(#id) 引用。
 *
 * 位移图是两张线性渐变：R 通道横向 0→255、G 通道纵向 0→255；配合负 scale，
 * 四边都向卡片内部取样 —— 边缘被轻微「向内折」，中心保持不动。因此不会把卡片
 * 外的内容拉进来，也不会产生边缘接缝。滤镜不可用时 CSS 里保留了纯 blur 的声明作回退。
 */

import { LENS_ATTR, LENS_FILTER_ID, LENS_SCALE } from '../constants.js'

const NS = 'http://www.w3.org/2000/svg'

/** 横向位移图：R 通道从左 0 到右 255，G/B 为 0。 */
const MAP_H = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23000'/%3E%3Cstop offset='1' stop-color='%23f00'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='8' height='8' fill='url(%23g)'/%3E%3C/svg%3E"
/** 纵向位移图：G 通道从上 0 到下 255，R/B 为 0。 */
const MAP_V = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23000'/%3E%3Cstop offset='1' stop-color='%230f0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='8' height='8' fill='url(%23g)'/%3E%3C/svg%3E"

/** 滤镜定义（纯静态字符串，供 `<svg>` 的 innerHTML 使用）。 */
export function buildLensFilterMarkup(): string {
  return `<defs><filter id="${LENS_FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
    + `<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="h" href="${MAP_H}"/>`
    + `<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="v" href="${MAP_V}"/>`
    + `<feBlend in="h" in2="v" mode="screen" result="map"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="map" scale="${LENS_SCALE}" xChannelSelector="R" yChannelSelector="G"/>`
    + '</filter></defs>'
}

/** 注入 / 复用滤镜 `<svg>`；调用方负责在卸载时移除并摘掉 body 上的标记属性。 */
export function installLensFilter(): SVGSVGElement | null {
  if (typeof document === 'undefined') return null
  const existing = document.querySelector<SVGSVGElement>(`svg[${LENS_ATTR}]`)
  if (existing !== null) return existing
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute(LENS_ATTR, '')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.style.position = 'absolute'
  svg.innerHTML = buildLensFilterMarkup()
  document.body.appendChild(svg)
  return svg
}
