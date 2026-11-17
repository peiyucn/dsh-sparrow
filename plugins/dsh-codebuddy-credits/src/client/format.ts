


export function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}


export function formatCapacity(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1_000) {

    const thousands = Math.round(value / 1_000)
    return thousands >= 1_000 ? `${Math.round(value / 100_000) / 10}M` : `${thousands}K`
  }
  return String(Math.round(value))
}


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
