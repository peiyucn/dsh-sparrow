


export { PACKAGE_NAME } from '../../constants.js'


export const PREFIX = '/api/desk-one/sessions'


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


export const TRASH_SIDECAR = 'dsh-archive-manage.json'

export const SIDECAR_VERSION = 2


export const HEADER_CACHE_TTL_MS = 30_000


export const TITLE_FOLD_CONCURRENCY = 4

export const TITLE_FOLD_BUDGET_MS = 8_000

export const LABEL_FOLD_TIMEOUT_MS = 15_000


export const FOLDED_LABEL_CACHE_MAX_ENTRIES = 256


export const PROJECTION_SEED_BUDGET_MS = 8_000

export const PROJECTION_SEED_BACKGROUND_BUDGET_MS = 60_000


export const STARTUP_SCAN_DELAY_MS = 30_000


export const PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE = '@deepseek-ai/dsh-session-projection-cache'
export const PROJECTION_CACHE_DOMAIN_FALLBACK = Object.freeze({
  name: 'session_projcache',
  table: 'sessions',
})

export interface ProjectionCacheDomain {
  readonly name: string
  readonly table: string
}


export function projectionCacheDomainOf(spec: unknown): ProjectionCacheDomain {
  const record = typeof spec === 'object' && spec !== null ? spec as Record<string, unknown> : {}
  const name = typeof record.name === 'string' && record.name !== ''
    ? record.name
    : PROJECTION_CACHE_DOMAIN_FALLBACK.name
  const tables = record.tables
  const declaredTables = typeof tables === 'object' && tables !== null ? Object.keys(tables) : []

  const table = declaredTables.includes(PROJECTION_CACHE_DOMAIN_FALLBACK.table)
    ? PROJECTION_CACHE_DOMAIN_FALLBACK.table
    : declaredTables[0] ?? PROJECTION_CACHE_DOMAIN_FALLBACK.table
  return { name, table }
}


export const PROJECTION_CACHE_INVALIDATE_ATTEMPTS = 2


export const ENOENT = 'ENOENT'
