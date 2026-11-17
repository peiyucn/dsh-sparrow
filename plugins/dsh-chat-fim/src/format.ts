


export function formatTokenCount(count: number): string {
  const safe = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
}
