import {
  ABOVE_CONTENT_Z_INDEX,
  BACKDROP_CLASS,
  BACKDROP_Z_INDEX,
  BOTTOM_VARIABLE,
  CONTENT_ATTR,
  CONTENT_Z_INDEX,
  LEFT_VARIABLE,
  MARKER_ATTR,
  PLAIN_ATTR,
  RIGHT_PANEL_ATTR,
  SHELL_OVERLAY_ATTR,
  SIDE_ATTR,
  TOP_STOP_VARIABLE,
  TOP_VARIABLE,
  WIDTH_HANDLE_ATTR,
} from './constants.js'
import { normalizeScheme, toneFor, toneIdOf, type ColorScheme, type ThemeToneSettings, type ToneId } from './tones.js'

export const TOP_SHAPE = 'ellipse 80vw 45vh at 50% -10vh'
export const BOTTOM_SHAPE = 'ellipse 70vw 45vh at 50% 112vh'
export const LEFT_SHAPE = 'ellipse 38vw 58vh at 0% -6vh'
export const TOP_STOP = '62%'
export const BOTTOM_STOP = 'transparent 95%'
export const LEFT_STOP = 'transparent 68%'

export const PREVIEW_TOP_SHAPE = 'ellipse 86% 70% at 50% -14%'
export const PREVIEW_BOTTOM_SHAPE = 'ellipse 83% 70% at 50% 114%'
export const PREVIEW_LEFT_SHAPE = 'ellipse 44% 80% at 0% -7%'
export const PREVIEW_STOP = 'transparent 71%'

export const PREVIEW_ALPHA_SCALE: Readonly<Record<ColorScheme, Readonly<Record<'light' | 'depth', number>>>> = Object.freeze({
  light: Object.freeze({ light: 3, depth: 1.8 }),
  dark: Object.freeze({ light: 1, depth: 3 }),
})

export const REQUIRED_CSS_FEATURES: readonly { name: string; probe: string }[] = Object.freeze([
  Object.freeze({ name: 'radial-gradient()', probe: 'background: radial-gradient(red, blue)' }),
  Object.freeze({ name: 'color-mix()', probe: 'color: color-mix(in srgb, red 50%, blue)' }),
])

export const BACKDROP_GRADIENTS = `radial-gradient(${TOP_SHAPE}, var(${TOP_VARIABLE}, transparent), transparent var(${TOP_STOP_VARIABLE}, ${TOP_STOP})),
    radial-gradient(${BOTTOM_SHAPE}, var(${BOTTOM_VARIABLE}, transparent), ${BOTTOM_STOP}),
    radial-gradient(${LEFT_SHAPE}, var(${LEFT_VARIABLE}, transparent), ${LEFT_STOP})`

/**
 * 1 LSB 有序抖动（2×2 棋盘，半像素 +1/255 白）：地面光是低对比大面积径向渐变，
 * 8-bit 量化后会出现「老显示器色带」（水波纹）；铺一层 1 LSB 抖动把量化台阶打散。
 * 幅度只有 1/255，正常观看不可见。
 */
export const DITHER_TILE = `repeating-conic-gradient(rgba(255, 255, 255, 0.0086) 0% 25%, transparent 25% 50%)`
/** 抖动层的平铺尺寸与重复：三者必须与 {@link BACKDROP_GRADIENTS} 的层数对齐（3 渐变 + 1 抖动）。 */
export const DITHER_SIZE = '2px 2px'
export const BACKDROP_SIZE = `100% 100%, 100% 100%, 100% 100%, ${DITHER_SIZE}`
export const BACKDROP_REPEAT = 'no-repeat, no-repeat, no-repeat, repeat'

export function buildBackdropCss(): string {
  return `.${BACKDROP_CLASS} {
  position: fixed;
  inset: 0;
  z-index: ${BACKDROP_Z_INDEX};
  pointer-events: none;
  background-image: ${BACKDROP_GRADIENTS}, ${DITHER_TILE};
  background-size: ${BACKDROP_SIZE};
  background-repeat: ${BACKDROP_REPEAT};
}
.${BACKDROP_CLASS}[hidden] { display: none; }
/* 官方座位（composerSeat）默认铺一块 bg-base 渐隐板，会在对话底部形成一大块实色背景。
   这里直接清掉它：不保留黑块，也不再重绘 / 补光；页面底光从透明的座位后自然透出。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat] {
  background: transparent;
}
body:not([${PLAIN_ATTR}]) [${CONTENT_ATTR}] { position: relative; z-index: ${CONTENT_Z_INDEX}; }
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}],
body:not([${PLAIN_ATTR}]) [${SHELL_OVERLAY_ATTR}] { z-index: ${ABOVE_CONTENT_Z_INDEX}; }
/* 官方两条「调整对话宽度」拖拽条（AppFrame 的 data-side、ConversationRoot 的 data-width-handle）：
   官方给低 z-index，会被抬到 81 的内容层整条盖掉（表现为拖拽条消失、拖不动）。抬到内容层之上。
   [data-side] 官方还挂在 Tooltip 的 placement 上，必须排除 role=tooltip，否则把 tooltip 一起抬起来。 */
body:not([${PLAIN_ATTR}]) [${WIDTH_HANDLE_ATTR}],
body:not([${PLAIN_ATTR}]) [${SIDE_ATTR}]:not([role='tooltip']) {
  z-index: ${ABOVE_CONTENT_Z_INDEX};
}
`
}

export interface BackdropPlan {
  scheme: ColorScheme
  hidden: boolean
  top: string
  bottom: string
  left: string
}

export function backdropPlan(scheme: ColorScheme, settings: ThemeToneSettings): BackdropPlan {
  const axis = normalizeScheme(scheme)
  const tone = toneFor(axis, toneIdOf(settings, axis))
  const painted = tone.top !== '' && tone.bottom !== ''
  return { scheme: axis, hidden: !painted, top: tone.top, bottom: tone.bottom, left: painted ? tone.left : '' }
}

export function boostAlpha(color: string, scale: number): string {
  if (scale === 1) return color
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/u.exec(color)
  if (match === null) return color
  const alpha = Math.min(1, Number(match[4]) * scale)
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(3)})`
}

export function tonePreview(scheme: ColorScheme, id: ToneId): { backgroundColor: string; backgroundImage: string } {
  const axis = normalizeScheme(scheme)
  const tone = toneFor(axis, id)
  if (tone.top === '' || tone.bottom === '') return { backgroundColor: tone.base, backgroundImage: 'none' }
  const scale = PREVIEW_ALPHA_SCALE[axis]
  const layers = [
    `radial-gradient(${PREVIEW_TOP_SHAPE}, ${boostAlpha(tone.top, scale.light)}, ${PREVIEW_STOP})`,
    `radial-gradient(${PREVIEW_BOTTOM_SHAPE}, ${boostAlpha(tone.bottom, scale.depth)}, ${PREVIEW_STOP})`,
  ]
  if (tone.left !== '') layers.push(`radial-gradient(${PREVIEW_LEFT_SHAPE}, ${boostAlpha(tone.left, scale.light)}, ${PREVIEW_STOP})`)
  return { backgroundColor: tone.base, backgroundImage: layers.join(', ') }
}

export const BACKDROP_SELECTOR = `[${MARKER_ATTR}]`
export const LAYER_SELECTOR = `div[${MARKER_ATTR}]`
export const STYLE_SELECTOR = `style[${MARKER_ATTR}]`
