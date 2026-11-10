/**
 * Constants shared by the plugin (both host and client halves may import them; no runtime dependencies allowed).
 * Every value crossing requests / renders lives here so the same semantics does not drift between host and client.
 */

export const PACKAGE_NAME = 'dsh-desk-one'

/** Route prefix: longer than the official `/api` fence, so this plugin does its own trust check. */
export const PREFIX = '/api/desk-one/sessions'

/** Note: `/trash` serves both GET (list) and POST (move to trash), so 11 paths map to 12 method routes. */
export const ROUTES = Object.freeze({
  list: `${PREFIX}/list`,
  strays: `${PREFIX}/strays`,
  trash: `${PREFIX}/trash`,
  trashDir: `${PREFIX}/trash-dir`,
  unarchive: `${PREFIX}/unarchive`,
  archive: `${PREFIX}/archive`,
  delete: `${PREFIX}/delete`,
  trashDelete: `${PREFIX}/trash-delete`,
  restore: `${PREFIX}/restore`,
  trashRestoreAll: `${PREFIX}/trash-restore-all`,
  trashDeleteAll: `${PREFIX}/trash-delete-all`,
})

/** Trash bookkeeping file: the file name is part of the on-disk format; renaming it would degrade existing trash entries to "old format". */
export const TRASH_SIDECAR = 'dsh-archive-manage.json'
/** Current sidecar version; v1 is read-only (no subagents field), v2 adds sub-session bookkeeping. */
export const SIDECAR_VERSION = 2

/** Write-route request body cap; going over means 400 instead of reading the whole payload into memory first. */
export const MAX_BODY_BYTES = 64 * 1024

/** Header-facts cache TTL: a fallback beyond write-through invalidation, so event-less edge paths do not leave a stale membership table. */
export const HEADER_CACHE_TTL_MS = 30_000

/** Bounded concurrency for cold-session log folding: at most N cold sessions fold at the same time. */
export const TITLE_FOLD_CONCURRENCY = 4
/** Overall budget for title folding: folds unfinished at the timeout count as failures and fall back to the session id. */
export const TITLE_FOLD_BUDGET_MS = 8_000
/** Single observation timeout for re-folding a projection from logs for a third-party entry (cold, unseeded). */
export const LABEL_FOLD_TIMEOUT_MS = 15_000

/** Cap on remembered folded labels: the memory grows with the number of observed sessions, so an LRU cap prevents unbounded accumulation. */
export const FOLDED_LABEL_CACHE_MAX_ENTRIES = 256

/**
 * Whole-batch budget for backfilling projection cache rows on restore / startup repair: the backfill must read
 * complete cold logs (same order as title folding); rows unfinished at the timeout count as failures and the
 * remainder is left to the next startup repair.
 */
export const PROJECTION_SEED_BUDGET_MS = 8_000
/**
 * Budget for **background** projection-row backfill after the "restore all" response is sent: the count can be
 * large (measured: 43 trash entries / 139 MB) and must not block the request; unfinished parts are completed by
 * the next startup repair.
 */
export const PROJECTION_SEED_BACKGROUND_BUDGET_MS = 60_000

/**
 * Fallback delay for the three startup scans: they are not started inside apply, so they do not contend with the
 * official session list for the same full disk scan; opening the panel triggers an immediate catch-up run, and this
 * only guarantees the cleanup eventually happens when the panel is never opened.
 */
export const STARTUP_SCAN_DELAY_MS = 30_000

/** Official projection cache domain: read the official `projectionCacheDomainSpec` first, fall back to the values below only when unavailable. */
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
 * Extract the domain and table names from the official domain spec. The official package is not among this
 * plugin's dependencies (it only lives in the host install tree), so callers use a dynamic import and do their
 * best; when the shape does not match or the read fails, fall back to the literals so an official rename does
 * not disable the plugin.
 */
export function projectionCacheDomainOf(spec: unknown): ProjectionCacheDomain {
  const record = typeof spec === 'object' && spec !== null ? spec as Record<string, unknown> : {}
  const name = typeof record.name === 'string' && record.name !== ''
    ? record.name
    : PROJECTION_CACHE_DOMAIN_FALLBACK.name
  const tables = record.tables
  const declaredTables = typeof tables === 'object' && tables !== null ? Object.keys(tables) : []
  // The official domain currently declares one table; prefer `sessions`, take the first declared table if it is renamed, and fall back only when nothing can be read.
  const table = declaredTables.includes(PROJECTION_CACHE_DOMAIN_FALLBACK.table)
    ? PROJECTION_CACHE_DOMAIN_FALLBACK.table
    : declaredTables[0] ?? PROJECTION_CACHE_DOMAIN_FALLBACK.table
  return { name, table }
}

/** Retry count for invalidating the projection cache after move-to-trash / delete (including the first attempt; leftovers after the second only log a warning and are handled by the startup sweep). */
export const PROJECTION_CACHE_INVALIDATE_ATTEMPTS = 2

/** Native fs "not found" error code: several places forgive it idempotently, so the string is not scattered. */
export const ENOENT = 'ENOENT'
