/**
 * Sessions host constants (migrated from dsh-archive-manage).
 *
 * Kept inside `host/sessions/` on purpose: the disk sidecar name and the timing budgets are a
 * self-contained capability, not cross-half values of the desk itself. Client constants (panel id /
 * page size / DOM events) will move in Phase 3 when the management UI lands.
 */

/** Plugin name used in user-facing log lines / disabled notices. */
export const PLUGIN_NAME = 'dsh-desk-one'

/** Session-management routes live under the plugin prefix; the desk router applies the trust fence. */
export const SESSIONS_PREFIX = '/api/desk-one/sessions'

/** Note: `/trash` serves both GET (list) and POST (move to trash), so 11 paths yield 12 method routes. */
export const ROUTES = Object.freeze({
  list: `${SESSIONS_PREFIX}/list`,
  strays: `${SESSIONS_PREFIX}/strays`,
  trash: `${SESSIONS_PREFIX}/trash`,
  trashDir: `${SESSIONS_PREFIX}/trash-dir`,
  unarchive: `${SESSIONS_PREFIX}/unarchive`,
  archive: `${SESSIONS_PREFIX}/archive`,
  delete: `${SESSIONS_PREFIX}/delete`,
  trashDelete: `${SESSIONS_PREFIX}/trash-delete`,
  restore: `${SESSIONS_PREFIX}/restore`,
  trashRestoreAll: `${SESSIONS_PREFIX}/trash-restore-all`,
  trashDeleteAll: `${SESSIONS_PREFIX}/trash-delete-all`,
})

/**
 * Trash sidecar file name: part of the on-disk format. Renaming would turn every existing trash
 * entry into an unrecoverable "legacy" entry, so this value must keep matching dsh-archive-manage.
 */
export const TRASH_SIDECAR = 'dsh-archive-manage.json'
/** Current sidecar version; v1 is read-only compatible (no subagents), v2 records child sessions. */
export const SIDECAR_VERSION = 2

/** header fact cache TTL: safety net for paths that miss an invalidation (events cover the rest). */
export const HEADER_CACHE_TTL_MS = 30_000

/** Bounded concurrency for cold-session log folds. */
export const TITLE_FOLD_CONCURRENCY = 4
/** Overall budget for title folding: unfinished folds fail and fall back to the session id. */
export const TITLE_FOLD_BUDGET_MS = 8_000
/** One observation budget for third-tier (cold, unseeded) subagent-label folding. */
export const LABEL_FOLD_TIMEOUT_MS = 15_000

/** LRU bound for folded label memory (grows with observed sessions, so it must be bounded). */
export const FOLDED_LABEL_CACHE_MAX_ENTRIES = 256

/**
 * Budget for backfilling projection rows on restore / startup repair: a row needs the full cold
 * log, same order of magnitude as title folding; unfinished rows are retried on the next pass.
 */
export const PROJECTION_SEED_BUDGET_MS = 8_000
/**
 * Budget for the *background* projection backfill after "restore all": entry counts can be large
 * (43 entries / 139 MB measured), so it must not block the response.
 */
export const PROJECTION_SEED_BACKGROUND_BUDGET_MS = 60_000

/**
 * Startup scans are delayed rather than started inside apply: the three scans would contend with
 * the official session-list scan on first page load; the first `GET /list` re-runs them instead.
 */
export const STARTUP_SCAN_DELAY_MS = 30_000

/** Official projection cache domain: read the official spec first, fall back to these literals. */
export const PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE = '@deepseek-ai/dsh-session-projection-cache'
export const PROJECTION_CACHE_DOMAIN_FALLBACK = Object.freeze({
  name: 'session_projcache',
  table: 'sessions',
})

export interface ProjectionCacheDomain {
  readonly name: string
  readonly table: string
}

/**
 * Extract domain/table names from an official domain spec. The official package is only present in
 * the host install tree (not our dependency surface), so callers dynamic-import it and fall back to
 * the literals when the shape is unknown — never take the whole plugin down for a rename.
 */
export function projectionCacheDomainOf(spec: unknown): ProjectionCacheDomain {
  const record = typeof spec === 'object' && spec !== null ? spec as Record<string, unknown> : {}
  const name = typeof record.name === 'string' && record.name !== ''
    ? record.name
    : PROJECTION_CACHE_DOMAIN_FALLBACK.name
  const tables = record.tables
  const declaredTables = typeof tables === 'object' && tables !== null ? Object.keys(tables) : []
  // The official domain currently declares one table; prefer `sessions`, else take the first one.
  const table = declaredTables.includes(PROJECTION_CACHE_DOMAIN_FALLBACK.table)
    ? PROJECTION_CACHE_DOMAIN_FALLBACK.table
    : declaredTables[0] ?? PROJECTION_CACHE_DOMAIN_FALLBACK.table
  return { name, table }
}

/** Invalidation attempts after trashing / deleting (first try + one retry; startup sweep is the net). */
export const PROJECTION_CACHE_INVALIDATE_ATTEMPTS = 2

/** Native fs "not found" code: several places forgive it idempotently instead of scattering strings. */
export const ENOENT = 'ENOENT'
