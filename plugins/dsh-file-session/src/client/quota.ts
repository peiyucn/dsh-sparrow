/** dsh-file-session 客户端纯逻辑：配额进度条计算（不 import Node 模块）。 @module dsh-file-session/client/quota */

/** 存储用量比例：钳到 [0, 1]；used/quota 非正时返回 0（不除零）。 */
export function storageUsageRatio(usedBytes: number, quotaBytes: number): number {
  if (!Number.isFinite(usedBytes) || usedBytes <= 0) return 0
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) return 0
  return Math.min(1, Math.max(0, usedBytes / quotaBytes))
}

/** 用量百分比文案：<10% 保留一位小数（网盘风格），≥10% 取整。 */
export function formatUsagePercent(ratio: number): string {
  const percent = Math.min(1, Math.max(0, ratio)) * 100
  return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`
}
