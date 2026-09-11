/** dsh-codebuddy-credits 客户端纯逻辑：只读模型清单与积分的展示格式化。 */

/**
 * 积分数字：整数不挂小数位（2000），非整数保留两位（0.41/1999.59）。
 * 会话胶囊、每轮胶囊与两者的弹层标题共用这一个口径。
 */
export function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/**
 * 容量（token 数）→ 短串：百万级用 M（至多一位小数、整数不带 .0），千级用 K，其它原样；
 * 非法值返回 undefined（渲染侧按缺省处理）；999_500 以上收成 M，不出现 1000K。
 */
export function formatCapacity(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1_000) {
    // 999_500+ 四舍五入到 1000K 时收成 1M，避免出现「1000K」这种边界串。
    const thousands = Math.round(value / 1_000)
    return thousands >= 1_000 ? `${Math.round(value / 100_000) / 10}M` : `${thousands}K`
  }
  return String(Math.round(value))
}

/**
 * 模型右侧只读事实串：系数 · 上下文长度（`x0.00 · 1M`）。
 * 系数原样透传（零系数就是 `x0.00`，不映射 free/免费）；两者都缺省时返回
 * undefined——渲染侧此时只显示模型名，不显示占位符。
 * 设置清单、模型选择器行、额度卡模型卡共用这一个口径。
 */
export function formatModelFacts(
  model: { credits?: string; contextWindow?: number } | undefined,
): string | undefined {
  if (model === undefined) return undefined
  const credits = typeof model.credits === 'string' && model.credits.length > 0
    ? model.credits
    : undefined
  const parts = [credits, formatCapacity(model.contextWindow)]
    .filter((part): part is string => part !== undefined)
  return parts.length === 0 ? undefined : parts.join(' · ')
}
