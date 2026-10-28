/**
 * 输入框玻璃的边缘折射（Apple Liquid Glass 的 bezel 透镜近似）：一次注入 SVG 位移滤镜，
 * CSS 用 `backdrop-filter: url(#id)` 引用。
 *
 * 位移图按卡片**实际尺寸与圆角**逐像素生成（{@link buildLensMap}），canvas → dataURL 写进
 * `<feImage>`；`feDisplacementMap scale="-255"` 把 128±dx 编码还原成像素位移，负号让边缘
 * 向卡片**外侧**取样 —— 卡外内容被凸透镜折射/放大进来（Apple 式 bezel lens），中心不动。
 * 边缘处位移最大、向内 bezel 宽度按平方曲线归零，四边与圆角同构。
 *
 * 关键：`<feImage>` 的 100% 百分比按 **SVG 视口**解析，所以隐藏 SVG 的 width/height 必须
 * 跟随卡片尺寸；若留 0×0，位移图在 backdrop-filter 里会退化成黑图（整块内容被常量位移）。
 *
 * 宿主 DOM 的 `[data-composer-card]` 可能晚于插件安装出现：用一次性 rAF 轮询（上限
 * {@link LENS_ATTACH_MAX_FRAMES} 帧）找到后再挂 ResizeObserver；尺寸变化经 rAF 合并重建。
 * 找不到卡片 / 浏览器不支持 `backdrop-filter: url()` 时安静降级：不设 body 标记，CSS 保持纯 blur。
 */

import { cssSupports } from '../compat.js'
import {
  LENS_ATTR,
  LENS_BEZEL_PX,
  LENS_DEPTH_PX,
  LENS_FILTER_ID,
  LENS_IMAGE_ID,
  LENS_MAP_SCALE,
} from '../constants.js'
import { buildLensMap } from './lens-map.js'

const NS = 'http://www.w3.org/2000/svg'
/** 输入框卡片锚点（官方 data 属性；官方改名时安静降级为纯 blur，不崩）。 */
const CARD_SELECTOR = '[data-composer-card]'
/** 卡片尚未渲染时的 rAF 轮询上限（约 2s @60fps），到顶即安静降级。 */
export const LENS_ATTACH_MAX_FRAMES = 120
/** 探测 `backdrop-filter` 能否引用 SVG 滤镜；不支持时只用纯 blur。 */
const LENS_SUPPORT_PROBE = `backdrop-filter: blur(1px) url(#${LENS_FILTER_ID})`
/** 中性 1×1 位移图（R=G=128）：真实位移图生成前不产生任何位移。 */
const NEUTRAL_MAP_HREF = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect width='1' height='1' fill='%23808000'/%3E%3C/svg%3E"
/** 读不到官方计算圆角时的缺省值（与卡片官方圆角同量级，只影响位移图，不改布局）。 */
const FALLBACK_RADIUS_PX = 20

/** 滤镜定义（纯静态字符串，供 `<svg>` 的 innerHTML 使用）。 */
export function buildLensFilterMarkup(mapHref: string = NEUTRAL_MAP_HREF): string {
  return `<defs><filter id="${LENS_FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
    + `<feImage id="${LENS_IMAGE_ID}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" href="${mapHref}"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="map" scale="${LENS_MAP_SCALE}" xChannelSelector="R" yChannelSelector="G"/>`
    + '</filter></defs>'
}

/** 注入 / 复用滤镜 `<svg>`（调用方负责移除）；非浏览器环境返回 null。 */
function installLensFilter(): SVGSVGElement | null {
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

/** 卡片计算圆角（px，已按卡片短边一半钳制）；读不到时退回缺省值。 */
function readRadiusPx(card: Element, maxRadius: number): number {
  try {
    const raw = getComputedStyle(card).borderTopLeftRadius
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value) || value <= 0) return Math.min(FALLBACK_RADIUS_PX, maxRadius)
    const px = raw.trim().endsWith('%') ? (maxRadius * value) / 100 : value
    return Math.min(px, maxRadius)
  } catch {
    return Math.min(FALLBACK_RADIUS_PX, maxRadius)
  }
}

/** 挂载 / 卸载边缘折射；返回 null 表示环境不支持（调用方保持纯 blur 回退）。 */
export interface LensController {
  dispose(): void
}

export function attachLensFilter(): LensController | null {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return null
  if (!cssSupports(LENS_SUPPORT_PROBE)) return null
  const svg = installLensFilter()
  if (svg === null) return null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) {
    svg.remove()
    return null
  }
  const body: HTMLElement | null = document.body

  let disposed = false
  let rafId = 0
  let pollFrames = 0
  let observer: ResizeObserver | null = null
  let card: Element | null = null
  let lastKey = ''

  /** 按卡片当前几何重建位移图；尺寸 / 圆角没变就跳过（rAF 合并后常走这条）。 */
  const paint = (): void => {
    if (disposed || card === null) return
    const rect = card.getBoundingClientRect()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    // 卡片隐藏（phase 切换 / 尚未测量）时没有可生成的几何，等 ResizeObserver 再回调。
    if (width < 2 || height < 2) return
    const radius = readRadiusPx(card, Math.min(width, height) / 2)
    const key = `${width}x${height}r${Math.round(radius)}`
    if (key === lastKey) return
    const map = buildLensMap({ width, height, radius, bezel: LENS_BEZEL_PX, depth: LENS_DEPTH_PX })
    canvas.width = map.width
    canvas.height = map.height
    const pixels = context.createImageData(map.width, map.height)
    pixels.data.set(map.data)
    context.putImageData(pixels, 0, 0)
    let href: string
    try {
      href = canvas.toDataURL('image/png')
    } catch {
      // canvas 不可导出（罕见）时保持纯 blur，并在下次 resize 再试。
      lastKey = ''
      return
    }
    // 重建滤镜图而不是只改 feImage href：Chromium 对 backdrop-filter 里动态换图不一定重绘。
    svg.innerHTML = buildLensFilterMarkup(href)
    // feImage 的 100% 百分比按 SVG 视口解析：视口必须等于卡片尺寸，否则位移图会退化成黑图。
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    // 位移图就绪后才打开 CSS 增强声明；在此之前 / 失败时 CSS 只走纯 blur。
    body?.setAttribute(LENS_ATTR, '')
    lastKey = key
  }

  /** rAF 合并：一次 ResizeObserver 风暴只重建一帧。 */
  const schedulePaint = (): void => {
    if (disposed || rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      paint()
    })
  }

  const observe = (found: Element): void => {
    card = found
    paint()
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(schedulePaint)
      observer.observe(found)
    }
  }

  const poll = (): void => {
    if (disposed) return
    const found = document.querySelector<Element>(CARD_SELECTOR)
    if (found !== null) {
      observe(found)
      return
    }
    pollFrames += 1
    if (pollFrames >= LENS_ATTACH_MAX_FRAMES) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      poll()
    })
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    observer?.disconnect()
    observer = null
    card = null
    svg.remove()
    body?.removeAttribute(LENS_ATTR)
  }

  // 先同步找一次：卡片通常已在 DOM 里，省掉一帧等待。
  const immediate = document.querySelector<Element>(CARD_SELECTOR)
  if (immediate !== null) observe(immediate)
  else {
    rafId = requestAnimationFrame(() => {
      rafId = 0
      poll()
    })
  }

  return { dispose }
}
