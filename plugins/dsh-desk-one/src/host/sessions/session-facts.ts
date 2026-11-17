

export function straySessionIds(
  persistedIds: readonly string[],
  archivedIds: readonly string[],
  attachedIds: readonly string[],
): string[] {
  const archived = new Set(archivedIds)
  const attached = new Set(attachedIds)
  return persistedIds.filter(id => !archived.has(id) && !attached.has(id))
}


export function parseBlankProjection(row: unknown): { blank: true } | undefined {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  const outer = row as Record<string, unknown>
  const recordCandidate = outer.record
  const record = (typeof recordCandidate === 'object' && recordCandidate !== null && !Array.isArray(recordCandidate)
    ? recordCandidate
    : outer) as Record<string, unknown>
  const rowsCandidate = record.rows
  if (typeof rowsCandidate !== 'object' || rowsCandidate === null || Array.isArray(rowsCandidate)) return undefined
  const rows = rowsCandidate as Record<string, unknown>
  const metaVal = (rows.sessionListMetadata as Record<string, unknown> | undefined)?.val
  const statsVal = (rows.sessionStats as Record<string, unknown> | undefined)?.val
  const metaBlank = (metaVal as Record<string, unknown> | undefined)?.blank
  const statsTurns = (statsVal as Record<string, unknown> | undefined)?.turns
  if (metaBlank === true || statsTurns === 0) return { blank: true }
  return undefined
}


export interface SessionFacts {
  readonly turns?: number
  readonly decodeTokens?: number
  readonly lastPromptAt?: number
}

export function parseSessionFacts(row: unknown): SessionFacts | undefined {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  const outer = row as Record<string, unknown>
  const recordCandidate = outer.record
  const record = (typeof recordCandidate === 'object' && recordCandidate !== null && !Array.isArray(recordCandidate)
    ? recordCandidate
    : outer) as Record<string, unknown>
  const rowsCandidate = record.rows
  if (typeof rowsCandidate !== 'object' || rowsCandidate === null || Array.isArray(rowsCandidate)) return undefined
  const rows = rowsCandidate as Record<string, unknown>
  const statsVal = (rows.sessionStats as Record<string, unknown> | undefined)?.val as Record<string, unknown> | undefined
  const metaVal = (rows.sessionListMetadata as Record<string, unknown> | undefined)?.val as Record<string, unknown> | undefined
  const turns = typeof statsVal?.turns === 'number' ? statsVal.turns : undefined
  const decodeTokens = typeof statsVal?.decodeTokens === 'number' ? statsVal.decodeTokens : undefined
  const lastPromptAt = typeof metaVal?.lastPromptAt === 'number' ? metaVal.lastPromptAt : undefined
  if (turns === undefined && decodeTokens === undefined && lastPromptAt === undefined) return undefined
  const facts: SessionFacts = {
    ...(turns === undefined ? {} : { turns }),
    ...(decodeTokens === undefined ? {} : { decodeTokens }),
    ...(lastPromptAt === undefined ? {} : { lastPromptAt }),
  }
  return facts
}
