/** dsh-file-manage 客户端纯逻辑：配额进度条计算（不 import Node 模块）。 @module dsh-file-manage/client/quota */

/** 存储用量比例：钳到 [0, 1]；used/quota 非正时返回 0（不除零）。 */
export function storageUsageRatio(usedBytes: number, quotaBytes: number): number {
  if (!Number.isFinite(usedBytes) || usedBytes <= 0) return 0
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) return 0
  return Math.min(1, Math.max(0, usedBytes / quotaBytes))
}

/** 用量百分比文案（网盘风格自适应精度）：≥10% 取整、≥1% 一位、≥0.1% 两位、≥0.01% 三位、更小四位——25GiB 配额下常见 0.01% 量级，避免人人 0.0%。 */
export function formatUsagePercent(ratio: number): string {
  const percent = Math.min(1, Math.max(0, ratio)) * 100
  if (percent >= 10) return `${Math.round(percent)}%`
  if (percent >= 1) return `${percent.toFixed(1)}%`
  if (percent >= 0.1) return `${percent.toFixed(2)}%`
  if (percent >= 0.01) return `${percent.toFixed(3)}%`
  return `${percent.toFixed(4)}%`
}
