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