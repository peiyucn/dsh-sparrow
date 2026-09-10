/** dsh-codebuddy-credits 客户端纯逻辑：只读模型清单的展示格式化。 */

/**
 * 容量（token 数）→ 短串：百万级用 M（至多一位小数、整数不带 .0），千级用 K，其它原样；
 * 非法值返回 undefined（渲染侧按缺省处理）。口径对齐官方 DeepSeek 编辑器的容量显示（`1M` / `256K`）。
 */
export function formatCapacity(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
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