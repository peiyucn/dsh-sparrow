/**
 * 输入框玻璃的 bezel 透镜：按卡片实际尺寸 / 圆角生成位移图，注入 SVG 滤镜供
 * `backdrop-filter: url(#id)` 使用；不动官方布局，只决定「玻璃边缘怎么弯折背景」。
 *
 * 两个必须守住的事实：
 * - `feImage` 的 100% 按 **SVG 视口**解析 ⇒ SVG 的 width/height 必须等于卡片尺寸；
 *   留 0×0 会退化成黑图，整块内容被常量位移（表现为错位 / 镜像）。
 * - 位移图按「朝卡片中心」取样（scale 为正）：四条边各自把卡内内容向外放大，
 *   上 / 下 / 左 / 右是四个独立方向；中心不动，也不依赖卡外内容。
 *
 * 卡片可能晚于插件挂载出现：rAF 轮询有上限，找到后挂 ResizeObserver，尺寸 / 圆角
 * 变化经 rAF 合并重建。不支持 `backdrop-filter: url()` 或找不到卡片时静默走纯 blur。
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

const SVG_NS = 'http://www.w3.org/2000/svg'
const CARD_SELECTOR = '[data-composer-card]'
/** 卡片未渲染时的 rAF 轮询上限（≈2s @60fps），到顶即安静降级。 */
export const LENS_ATTACH_MAX_FRAMES = 120
/** 探测引擎是否支持 `backdrop-filter` 引用 SVG 滤镜。 */
const SUPPORT_PROBE = `backdrop-filter: blur(1px) url(#${LENS_FILTER_ID})`
/** 读不到计算圆角时的缺省值（只影响位移图，不改布局）。 */
const FALLBACK_RADIUS_PX = 20

/** 挂载 / 卸载透镜；dispose 必须同时摘掉 SVG 与 body 标记。 */
export interface LensController {
  dispose(): void
}

/** 滤镜定义；`mapHref` 是当前卡片的位移图。 */
export function buildLensFilterMarkup(mapHref: string): string {
  return `<defs><filter id="${LENS_FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
    + `<feImage id="${LENS_IMAGE_ID}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" href="${mapHref}"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="map" scale="${LENS_MAP_SCALE}" xChannelSelector="R" yChannelSelector="G"/>`
    + '</filter></defs>'
}

/** 创建隐藏的滤镜宿主 SVG；尺寸决定 feImage 百分比，fixed 避免撑高文档。 */
function mountSvg(host: HTMLElement, mapHref: string, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute(LENS_ATTR, '')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  // fixed：absolute 会以 body 末尾为静态位置，把卡片高度算进文档滚动高度（页面变长）。
  Object.assign(svg.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' })
  svg.innerHTML = buildLensFilterMarkup(mapHref)
  host.appendChild(svg)
  return svg
}

/** 卡片计算圆角（px）；百分比按短边半径折算，读不到时给缺省值。 */
function readRadiusPx(card: Element, maxRadius: number): number {
  const raw = getComputedStyle(card).borderTopLeftRadius
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return Math.min(FALLBACK_RADIUS_PX, maxRadius)
  return Math.min(raw.trim().endsWith('%') ? (maxRadius * value) / 100 : value, maxRadius)
}

export function attachLensFilter(): LensController | null {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return null
  if (!cssSupports(SUPPORT_PROBE)) return null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) return null
  const body = document.body

  let disposed = false
  let frame = 0
  let pollFrames = 0
  let observer: ResizeObserver | null = null
  let svg: SVGSVGElement | null = null
  let card: Element | null = null
  let lastKey = ''

  /** 按当前几何重建位移图；尺寸 / 圆角没变就跳过（ResizeObserver 常走这条）。 */
  const paint = (): void => {
    if (disposed || card === null) return
    const box = card.getBoundingClientRect()
    const width = Math.round(box.width)
    const height = Math.round(box.height)
    // 卡片隐藏 / 尚未测量时没有可用几何，等下一次 observe 回调。
    if (width < 2 || height < 2) return
    const radius = readRadiusPx(card, Math.min(width, height) / 2)
    const key = `${width}x${height}r${Math.round(radius)}`
    if (key === lastKey) return
    const map = buildLensMap({
      width,
      height,
      radius,
      bezel: LENS_BEZEL_PX,
      depth: LENS_DEPTH_PX,
    })
    canvas.width = map.width
    canvas.height = map.height
    const pixels = context.createImageData(map.width, map.height)
    pixels.data.set(map.data)
    context.putImageData(pixels, 0, 0)
    let href: string
    try {
      href = canvas.toDataURL('image/png')
    } catch {
      // 不可导出（罕见）时保持纯 blur，下次 resize 再试。
      return
    }
    if (svg === null) {
      svg = mountSvg(body, href, width, height)
    } else {
      // 重建滤镜图而非只改 feImage href：Chromium 对 backdrop-filter 里动态换图不一定重绘。
      svg.innerHTML = buildLensFilterMarkup(href)
      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String(height))
    }
    // 位移图就绪后才启用 CSS 增强声明；之前 / 失败时只走纯 blur。
    body.setAttribute(LENS_ATTR, '')
    lastKey = key
  }

  /** rAF 合并：一轮 ResizeObserver 风暴只重建一次。 */
  const schedule = (): void => {
    if (disposed || frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      paint()
    })
  }

  const watch = (found: Element): void => {
    card = found
    paint()
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(schedule)
      observer.observe(found)
    }
  }

  const poll = (): void => {
    if (disposed) return
    const found = document.querySelector(CARD_SELECTOR)
    if (found !== null) {
      watch(found)
      return
    }
    pollFrames += 1
    if (pollFrames >= LENS_ATTACH_MAX_FRAMES) return
    frame = requestAnimationFrame(() => {
      frame = 0
      poll()
    })
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    observer?.disconnect()
    observer = null
    card = null
    svg?.remove()
    svg = null
    body.removeAttribute(LENS_ATTR)
  }

  const found = document.querySelector(CARD_SELECTOR)
  if (found !== null) watch(found)
  else {
    frame = requestAnimationFrame(() => {
      frame = 0
      poll()
    })
  }

  return { dispose }
}
