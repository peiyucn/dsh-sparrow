/**
 * 输入框玻璃的 bezel 透镜位移图（纯函数，不碰 DOM / canvas，供单测直接跑）。
 *
 * 按卡片的**实际尺寸与圆角**逐像素生成 `feDisplacementMap` 的位置图：
 *
 * - 圆角矩形边界用标准 SDF 求「像素到边界的内侧距离」`d`；
 * - 只在 `d < bezel` 的斜面内位移，`t = d / bezel`，`magnitude = depth * (1 - t)^2`
 *   —— 边缘（t=0）最大、向内到 bezel 处（t=1）平滑归零；
 * - 方向取「最近边界点指向卡片内部」：直边取轴向，圆角取径向（指向角圆心）；
 * - 编码 R = G = 128 为中性，R = 128 + dx、G = 128 + dy（单位 CSS px），B=0、A=255。
 *
 * 图里编码的是**采样偏移**；滤镜用负 scale 反向消费，让采样点落在卡外，形成边缘放大。
 */
export interface LensMapOptions {
  /** 卡片宽（CSS px）。 */
  readonly width: number
  /** 卡片高（CSS px）。 */
  readonly height: number
  /** 圆角半径（CSS px，内部钳到 min(width, height) / 2）。 */
  readonly radius: number
  /** 透镜斜面宽度（CSS px，内部钳到 (0, min(width, height) / 2]）。 */
  readonly bezel: number
  /** 边缘处最大位移（CSS px）。 */
  readonly depth: number
}

export interface LensMap {
  readonly width: number
  readonly height: number
  /** RGBA，长度 = width * height * 4。 */
  readonly data: Uint8ClampedArray
}

/** 位移图中性值（R / G 通道）；0 位移时两个通道都是 128。 */
const NEUTRAL_CHANNEL = 128

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return value < min ? min : value > max ? max : value
}

/**
 * 生成一张圆角矩形卡片的 bezel 位移图。
 * `width / height` 取整（与 canvas 像素对齐），其余参数按卡片几何钳制。
 */
export function buildLensMap(options: LensMapOptions): LensMap {
  const width = Math.max(1, Math.round(options.width))
  const height = Math.max(1, Math.round(options.height))
  const maxRadius = Math.min(width, height) / 2
  const radius = clamp(options.radius, 0, maxRadius)
  const bezel = clamp(options.bezel, 1, maxRadius)
  // 编码是 128 ± depth，深度 > 127 会被 Uint8ClampedArray 钳掉，直接限死在上限内。
  const depth = clamp(options.depth, 0, 127)
  const cx = width / 2
  const cy = height / 2
  // 圆角内缩后的直边半长；|px| 超过它即落进圆角的四分之一圆区域。
  const innerHalfWidth = width / 2 - radius
  const innerHalfHeight = height / 2 - radius
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const py = y + 0.5 - cy
    const qy = Math.abs(py) - innerHalfHeight
    const signY = py < 0 ? -1 : 1
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const px = x + 0.5 - cx
      const qx = Math.abs(px) - innerHalfWidth
      const signX = px < 0 ? -1 : 1

      // 标准圆角矩形 SDF：负值在形内；`distance` 是到边界的内侧距离。
      const overX = qx > 0 ? qx : 0
      const overY = qy > 0 ? qy : 0
      const outside = overX === 0 ? overY : overY === 0 ? overX : Math.hypot(overX, overY)
      const distance = radius - outside - Math.min(Math.max(qx, qy), 0)

      let dx = 0
      let dy = 0
      if (distance > 0 && distance < bezel) {
        const remaining = 1 - distance / bezel
        const magnitude = depth * remaining * remaining
        if (qx > 0 && qy > 0) {
          // 圆角段：最近边界点在角圆心方向上，朝角圆心即朝卡内。
          const length = Math.hypot(qx, qy)
          if (length > 0) {
            dx = (-magnitude * (signX * qx)) / length
            dy = (-magnitude * (signY * qy)) / length
          }
        } else if (qx > qy) {
          // 左右直边：位移沿 x 轴指向卡内。
          dx = -signX * magnitude
        } else {
          // 上下直边：位移沿 y 轴指向卡内。
          dy = -signY * magnitude
        }
      }

      data[index] = NEUTRAL_CHANNEL + dx
      data[index + 1] = NEUTRAL_CHANNEL + dy
      data[index + 2] = 0
      data[index + 3] = 255
    }
  }

  return { width, height, data }
}
