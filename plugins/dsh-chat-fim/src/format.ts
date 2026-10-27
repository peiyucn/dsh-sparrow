/** 展示格式化：token 数等纯格式化（无 Node / 浏览器依赖）。 */

/** token 数展示格式化：千分位逗号（1234 → 1,234）。候选菜单用；纯格式化、无 Node 依赖（单测也钉着它）。 */
export function formatTokenCount(count: number): string {
  const safe = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
}
