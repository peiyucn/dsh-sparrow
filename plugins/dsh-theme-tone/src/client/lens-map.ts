/**
 * bezel 透镜位移图（纯函数，不碰 DOM / canvas，Node 单测直接跑）。
 *
 * 每像素算到圆角矩形边界的**内侧距离** d：d < bezel 时属于斜面，
 * t = d / bezel，幅值 = depth * (1 - t)^2（边缘最大、以内沿归零）。
 * 方向取 SDF 外法线的反向（直边轴向、圆角径向）；inward 时整体取反，四边都向卡内取样。
 *
 * 编码 R = 128 + dx、G = 128 + dy（CSS px），B = 0、A = 255；
 * 滤镜侧用 scale ±255 还原成像素位移，128 即中性。
 */

export interface LensMapOptions {
  /** 卡片宽（CSS px）。 */
  readonly width: number
  /** 卡片高（CSS px）。 */
  readonly height: number
  /** 圆角半径（CSS px）；内部钳到短边一半。 */
  readonly radius: number
  /** 斜面宽度（CSS px）；内部钳到 (0, 短边一半]。 */
  readonly bezel: number
  /** 边缘处最大位移（CSS px，须 < 128）。 */
  readonly depth: number
  /**
   * 四边都向卡内取样（取反）：卡外常是实色地面带 / 空白，向卡外取会把内容拉没；
   * 卡内取样让四条边视觉一致地「拉长」。不传时按外法线（向卡内编码、滤镜负 scale 后向外）。
   */
  readonly inward?: boolean
}

export interface LensMap {
  readonly width: number
  readonly height: number
  /** RGBA，长度 = width * height * 4。 */
  readonly data: Uint8ClampedArray
}

const NEUTRAL = 128

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function buildLensMap(options: LensMapOptions): LensMap {
  const width = Math.max(1, Math.round(options.width))
  const height = Math.max(1, Math.round(options.height))
  const maxRadius = Math.min(width, height) / 2
  const radius = clamp(options.radius, 0, maxRadius)
  const bezel = clamp(options.bezel, 1, maxRadius)
  const depth = clamp(options.depth, 0, 127)
  const cx = width / 2
  const cy = height / 2
  // 圆角内缩后的直边半长：|px| 超过它即落进四分之一圆区域。
  const straightX = width / 2 - radius
  const straightY = height / 2 - radius
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const py = y + 0.5 - cy
    const qy = Math.abs(py) - straightY
    const signY = py < 0 ? -1 : 1
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const px = x + 0.5 - cx
      const qx = Math.abs(px) - straightX
      const signX = px < 0 ? -1 : 1

      // 标准圆角矩形 SDF（负值在形内）；distance 即到边界的内侧距离。
      const outside = qx > 0 && qy > 0 ? Math.hypot(qx, qy) : Math.max(qx, qy)
      const distance = radius - outside - Math.min(Math.max(qx, qy), 0)

      let dx = 0
      let dy = 0
      if (distance > 0 && distance < bezel) {
        const remaining = 1 - distance / bezel
        const magnitude = depth * remaining * remaining
        // 外法线（指向形外）；取反即默认朝卡内。
        const nx = qx > 0 ? signX * qx : 0
        const ny = qy > 0 ? signY * qy : 0
        const length = Math.hypot(nx, ny)
        if (length > 0) {
          dx = (-magnitude * nx) / length
          dy = (-magnitude * ny) / length
        }
      }

      if (options.inward === true) {
        dx = -dx
        dy = -dy
      }

      data[index] = NEUTRAL + dx
      data[index + 1] = NEUTRAL + dy
      data[index + 2] = 0
      data[index + 3] = 255
    }
  }

  return { width, height, data }
}
