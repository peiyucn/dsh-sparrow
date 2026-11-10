/** dsh-archive-manage pure logic: config, confirmation strength, trash directory, sidecar parsing. */

import { join } from 'node:path'
import { nestTree } from '../../tree.js'
import { SIDECAR_VERSION, TRASH_SIDECAR } from './constants.js'
import type { LegacyTrashItem, TrashItem } from '../../session-admin.js'

export { TRASH_SIDECAR }
/** Trash directory name (the . prefix distinguishes it from official DSH directories). */
const DEFAULT_TRASH_DIR = '.sessions-trash'

export interface ArchiveConfig {
  readonly trashRoot: string
}

export interface ArchiveSubagentSidecar {
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly workspaceIds: readonly string[]
  /** Parent session id of this child session (the trash area restores the hierarchy from it); old entries lack this field → rendered flat. */
  readonly parentSessionId?: string
}

export interface ArchiveSidecar {
  readonly version: 1 | 2
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  /** version 2: subagent sessions moved into the trash together with their parent session. */
  readonly subagents?: readonly ArchiveSubagentSidecar[]
}

/** DSH data home directory ($DSH_HOME takes precedence, defaults to ~/.dsh). */
function dshHomeBase(): string {
  const fallbackHome = join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  return process.env.DSH_HOME?.trim() || fallbackHome
}

/** Absolute path of the default trash directory. */
function defaultTrashDir(): string {
  return join(dshHomeBase(), DEFAULT_TRASH_DIR)
}

export function normalizeArchiveConfig(input: Readonly<Partial<ArchiveConfig>> | undefined): ArchiveConfig {
  const trash = input?.trashRoot?.trim()
  if (trash !== undefined && trash === '') throw new Error('dsh-archive-manage: trashRoot 不能为空')
  return { trashRoot: trash || defaultTrashDir() }
}

/** Permanent-delete hard confirmation: the user input must match the session's current title exactly (compared after trim). */
export function isDeleteConfirmationSufficient(expectedTitle: string, input: unknown): boolean {
  return typeof input === 'string' && input.trim() === expectedTitle.trim() && expectedTitle.trim() !== ''
}

/** Trash directory / trash id may contain only ASCII letters, digits, - and _, to avoid path traversal. */
export function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]/gu, '_')
  return /[A-Za-z0-9]/u.test(safe) ? safe : 'unknown'
}

/**
 * Safety check for an official jsonl-backend single-session directory name (rc.1 layout `<root>/<project>/<encodeSegment(id)>/`):
 * - Plain form: ASCII letters, digits, -, _ (official session ids are UUID / session-<uuid> / webhook-<uuid> and land on disk as-is);
 * - Official encodeSegment escape form: `~XXXX` (4 uppercase hex digits) interleaved within `[A-Za-z0-9._-]`
 *   (any externally injected session id — e.g. ACP — is escaped by the official code into this form).
 * Neither form contains a path separator or a drive colon; `.`, `..` and the empty string are always rejected (`.` hits the escape-form charset, so it must be excluded explicitly).
 */
export function isSafeSessionDirName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false
  return /^(?:[A-Za-z0-9._-]|~[0-9A-F]{4})+$/u.test(name)
}

/**
 * Mask the home directory prefix as `~` (cross-platform): handles both Windows backslashes and POSIX slashes;
 * exact match first, then a case-insensitive fallback (Windows drive paths are case-insensitive).
 * Paths outside home are returned unchanged.
 */
export function maskHomePath(path: string, homeDir: string): string {
  const home = homeDir.replace(/[\\/]+$/u, '')
  if (home === '') return path
  const hasPrefix = (candidate: string, prefix: string): boolean =>
    candidate === prefix || candidate.startsWith(`${prefix}\\`) || candidate.startsWith(`${prefix}/`)
  if (hasPrefix(path, home)) return `~${path.slice(home.length)}`
  if (hasPrefix(path.toLowerCase(), home.toLowerCase())) return `~${path.slice(home.length)}`
  return path
}

/** Parse safe restore information from a trash sidecar; invalid input returns undefined. */
export function parseTrashSidecar(value: unknown): ArchiveSidecar | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const sidecar = value as Record<string, unknown>
  if (sidecar.version !== 1 && sidecar.version !== SIDECAR_VERSION) return undefined
  if (typeof sidecar.sessionId !== 'string' || sidecar.sessionId.trim() === '') return undefined
  if (typeof sidecar.originalPath !== 'string' || sidecar.originalPath.trim() === '') return undefined
  if (typeof sidecar.archivedAt !== 'string') return undefined
  if (!Array.isArray(sidecar.workspaceIds) || !sidecar.workspaceIds.every(id => typeof id === 'string')) return undefined
  let subagents: ArchiveSubagentSidecar[] | undefined
  if (sidecar.version === SIDECAR_VERSION && sidecar.subagents !== undefined) {
    if (!Array.isArray(sidecar.subagents)) return undefined
    subagents = sidecar.subagents.map((item): ArchiveSubagentSidecar | undefined => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
      const child = item as Record<string, unknown>
      if (typeof child.sessionId !== 'string' || child.sessionId.trim() === '') return undefined
      if (typeof child.originalPath !== 'string' || child.originalPath.trim() === '') return undefined
      if (!Array.isArray(child.workspaceIds) || !child.workspaceIds.every(id => typeof id === 'string')) return undefined
      return {
        sessionId: child.sessionId,
        title: typeof child.title === 'string' ? child.title : child.sessionId,
        originalPath: child.originalPath,
        workspaceIds: child.workspaceIds,
        // The hierarchy field only affects display: drop it when its shape is wrong (fall back to flat)
        // instead of letting one malformed field make the whole trash entry unrestorable (restore only needs originalPath).
        ...typeof child.parentSessionId === 'string' && child.parentSessionId.trim() !== ''
          ? { parentSessionId: child.parentSessionId }
          : {},
      }
    }).filter((item): item is ArchiveSubagentSidecar => item !== undefined)
    if (subagents.length !== (sidecar.subagents as unknown[]).length) return undefined
  }
  return {
    version: sidecar.version,
    sessionId: sidecar.sessionId,
    title: typeof sidecar.title === 'string' ? sidecar.title : sidecar.sessionId,
    originalPath: sidecar.originalPath,
    archivedAt: sidecar.archivedAt,
    workspaceIds: sidecar.workspaceIds,
    subagents,
  }
}

/** sidecar → list-item view; when v1 has no subagent records, subagents is an empty array. */
export function trashItemView(trashId: string, sidecar: ArchiveSidecar): TrashItem {
  return {
    trashId,
    sessionId: sidecar.sessionId,
    title: sidecar.title,
    archivedAt: sidecar.archivedAt,
    workspaceIds: sidecar.workspaceIds,
    legacy: false,
    subagents: (sidecar.subagents ?? []).map(child => ({
      sessionId: child.sessionId,
      title: child.title,
      ...child.parentSessionId === undefined ? {} : { parentSessionId: child.parentSessionId },
    })),
  }
}

/**
 * Build a list item from a legacy-format directory; the timestamp comes from the directory mtime.
 * @param name - Trash directory name (equal to the session id in the legacy format).
 * @param mtimeMs - Directory last-modified time (millisecond timestamp).
 */
export function legacyTrashItem(name: string, mtimeMs: number): LegacyTrashItem {
  return {
    trashId: name,
    sessionId: name,
    title: name,
    archivedAt: new Date(mtimeMs).toISOString(),
    workspaceIds: [],
    legacy: true,
  }
}

/**
 * Stray session detection (three-way set difference, see docs/spec/05-stray-sessions.md):
 * present in the persisted list ∧ not in the archived set ∧ not attached to any workspace. Input order is preserved.
 * @param persistedIds - Session ids from sessionPersistence.list().
 * @param archivedIds - `archivedSessionIds` of the workspace domain.
 * @param attachedIds - Union of all workspace.sessionIds.
 */
export function straySessionIds(
  persistedIds: readonly string[],
  archivedIds: readonly string[],
  attachedIds: readonly string[],
): string[] {
  const archived = new Set(archivedIds)
  const attached = new Set(attachedIds)
  return persistedIds.filter(id => !archived.has(id) && !attached.has(id))
}

/**
 * Parse the "blank session" signal from an official projection row (session_projcache row shape: { version, record: { identity, rows } }):
 * blank = sessionListMetadata.blank === true or sessionStats.turns === 0.
 * A missing row / malformed shape / explicitly non-blank all return undefined (callers conservatively treat that as non-blank).
 */
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

/** Session stats and list metadata (display only; v5/v6 dual shape, same record ?? outer fallback as parseBlankProjection). */
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

/** Structural subset of SessionHeader needed to build the tree (pure module, zero dependencies; the host side passes the real header). */
export interface SessionTreeHeader {
  readonly id: string
  readonly createdAt: number
  readonly parentSession?: string
  readonly origin?: 'subagent'
}

export interface SessionTreeNode {
  readonly header: SessionTreeHeader
  readonly children: SessionTreeNode[]
}

/**
 * Build the parent/child tree from the full set of session headers:
 * - Child sessions (origin === 'subagent' and parent present in the list) hang under their parent, siblings sorted by createdAt ascending;
 * - Top-level sessions and orphan child sessions (parent absent from the list) are roots, sorted by createdAt descending;
 * - Orphans are treated as top-level sessions (no parent to follow; the panel handles them manually).
 */
export function buildSessionTree(headers: readonly SessionTreeHeader[]): SessionTreeNode[] {
  const nodes = nestTree(headers, {
    idOf: header => header.id,
    parentIdOf: header => (header.origin === 'subagent' ? header.parentSession : undefined),
    sortRoots: (left, right) => right.createdAt - left.createdAt,
    sortChildren: (left, right) => left.createdAt - right.createdAt,
  })
  const convert = (node: (typeof nodes)[number]): SessionTreeNode => ({
    header: node.value,
    children: node.children.map(convert),
  })
  return nodes.map(convert)
}

interface ArchiveAlignment {
  readonly add: string[]
  readonly remove: string[]
}

/**
 * Compute the parent/child archive alignment diff (state invariant: children mirror their parent):
 * - Parent archived but child not → added to `add`;
 * - Parent not archived but child archived → added to `remove`;
 * - Orphan child sessions (parent absent from the list) and top-level sessions are not involved.
 *
 * A subagent can itself spawn further subagents, so "children mirror their parent" must travel down the
 * parent/child chain to **all descendants**: BFS from every top-level node propagates the ancestor's archive
 * state down level by level (each node is visited once when ids are unique, O(n)). The old implementation that
 * looked at only one level per pass aligned a single level on multi-level trees and relied on its own write
 * triggering another `domain/changed` round to converge — betting correctness on the event chain — and the
 * panel's lazy alignment could only advance one level per open. With no root node (parent/child cycle) nobody
 * can propagate, so no alignment is done at all.
 *
 * The `seen` guard (same one added to `collectSubtreeIds` in the same batch): when ids are unique a cycle is
 * necessarily unreachable; but in malformed data two headers sharing one id can create a cycle that is
 * **reachable from a root** (one of them sits at the tail of the chain and points back to an ancestor), and
 * without the guard this function would spin forever inside the host's `domain/changed` listener and the
 * `/list` route (2026-09-12 audit S1).
 */
export function archiveAlignmentForChildren(
  headers: readonly SessionTreeHeader[],
  archivedIds: readonly string[],
): ArchiveAlignment {
  const byId = new Map(headers.map(header => [header.id, header]))
  const childrenOf = new Map<string, string[]>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    const list = childrenOf.get(header.parentSession) ?? []
    list.push(header.id)
    childrenOf.set(header.parentSession, list)
  }
  const archived = new Set(archivedIds)
  const add: string[] = []
  const remove: string[] = []
  const queue: string[] = []
  const seen = new Set<string>()
  for (const header of headers) {
    const hasParent = header.origin === 'subagent' && header.parentSession !== undefined && byId.has(header.parentSession)
    if (hasParent || seen.has(header.id)) continue
    seen.add(header.id)
    queue.push(header.id)
  }
  for (let i = 0; i < queue.length; i++) {
    const ancestorArchived = archived.has(queue[i])
    for (const childId of childrenOf.get(queue[i]) ?? []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      if (ancestorArchived !== archived.has(childId)) {
        if (ancestorArchived) {
          archived.add(childId)
          add.push(childId)
        } else {
          archived.delete(childId)
          remove.push(childId)
        }
      }
      queue.push(childId)
    }
  }
  return { add, remove }
}

/** Set of child session ids that have a parent (parent present in the list) — they follow their parent and never show up alone in the stray area. */
export function livingChildIds(headers: readonly SessionTreeHeader[]): Set<string> {
  const byId = new Set(headers.map(header => header.id))
  const out = new Set<string>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (byId.has(header.parentSession)) out.add(header.id)
  }
  return out
}

/** Root session id plus all its descendant ids (any depth, BFS order preserved, root first; used when archiving / trashing / deleting a parent as a unit). */
export function collectSubtreeIds(headers: readonly SessionTreeHeader[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>()
  const byId = new Set(headers.map(header => header.id))
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    const list = childrenOf.get(header.parentSession) ?? []
    list.push(header.id)
    childrenOf.set(header.parentSession, list)
  }
  const out: string[] = [rootId]
  // seen guard: the parent/child chain comes from on-disk headers and is acyclic in theory; should a cycle
  // appear (manual disk edits / abnormal upstream writes), BFS must still terminate — callers do file-level moves / deletes, and hanging is worse than moving less.
  const seen = new Set(out)
  for (let i = 0; i < out.length; i++) {
    for (const child of childrenOf.get(out[i]) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      out.push(child)
    }
  }
  return out
}

/**
 * subagent session ids to move / delete together with the root session: **all descendants** of the root
 * (any depth, BFS with parents before children, root excluded). A subagent can spawn further subagents, so
 * the depth is not fixed at one level — taking only direct children would miss deeper descendants.
 */
export function subagentDescendantIds(headers: readonly SessionTreeHeader[], rootId: string): string[] {
  return collectSubtreeIds(headers, rootId).slice(1)
}

/**
 * Ids to remove from the archived set after trashing / permanently deleting: the root plus the **child
 * sessions actually moved/deleted** (deduplicated, root first). Callers pass the **full descendant set**
 * returned by `listSubagentTargets` (any depth) — trash/delete moves/deletes the entire subtree one by one,
 * so the whole subtree must leave the archived set; removing only direct children would leave descendants at
 * depth ≥2 as permanent orphan roots (their parent is no longer persisted and parent/child alignment cannot
 * see them either; verified 2026-09-12).
 */
export function archivedIdsToRemove(rootId: string, subagentIds: readonly string[]): string[] {
  const out: string[] = [rootId]
  const seen = new Set(out)
  for (const id of subagentIds) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Header-facts cache store (pure logic, unit-testable): returns the cache directly within the TTL; once
 * expired it fills single-flight (concurrent calls share one promise); invalidate clears the cache so the
 * next get rescans. Safety basis: jsonl headers are immutable once materialized, so caching by id only needs
 * to handle members appearing/disappearing (write-through invalidation).
 *
 * Invalidation generation: invalidate voids an in-flight load — a scan started before the invalidation may
 * not write its result back to the cache, otherwise write-through invalidation would be cancelled out by
 * "the old member table refilling the cache" (stale for the whole TTL); a voided promise still settles
 * normally for whoever was waiting on it (snapshot semantics), it just isn't cached.
 */
export interface HeaderFactsStore<F> {
  get(): Promise<F>
  invalidate(): void
}

export function createHeaderFactsStore<F>(
  load: () => Promise<F>,
  ttlMs: number,
  now: () => number = Date.now,
): HeaderFactsStore<F> {
  let cached: F | undefined
  let fetchedAt = -Infinity
  let inflight: Promise<F> | undefined
  let generation = 0
  return {
    async get(): Promise<F> {
      if (cached !== undefined && now() - fetchedAt < ttlMs) return cached
      if (inflight === undefined) {
        const startedAt = generation
        const attempt = load().then(value => {
          if (generation === startedAt) {
            cached = value
            fetchedAt = now()
          }
          return value
        }).finally(() => {
          // Only clear its own generation: after invalidate a new load has already replaced inflight, so an old load settling must not clear the new generation by mistake.
          if (inflight === attempt) inflight = undefined
        })
        inflight = attempt
      }
      return inflight
    },
    invalidate(): void {
      generation += 1
      cached = undefined
      fetchedAt = -Infinity
      inflight = undefined
    },
  }
}

/**
 * Value of the official subagent projection unit (the minimal shape of `SubagentIdentityProjection`,
 * official projection-types.ts:28): a discriminated union (mode one-shot / continuable) plus an optional label.
 * This plugin only cares whether a label exists, so it asserts the minimal shape and does not replicate the
 * official mode discriminant.
 */
export interface SubagentIdentityValue {
  readonly label?: string
  /**
   * Position of the `subagent/descriptor` event that folded this identity. The official code uses it to prove
   * the descriptor comes from the child session's **own** suffix (`Session.isOwnSeq`, the own-suffix gate at
   * official list-children.ts:224-225) rather than an ancestor descriptor inherited from the fork seed.
   * Missing/malformed means ownership cannot be verified.
   */
  readonly seq?: number
}

/**
 * Authoritative identity → label conclusion.
 *
 * A non-null `identity` means the official code already folded a subagent descriptor on this log (the official
 * `subagent` unit's view = `state.identity ?? null`, projection.ts:178); a descriptor is immutable once
 * appended (official note "a descriptor is immutable once appended") and sits at the start of the child
 * session's log, so folding it once holds forever. `label` is **optional** for one-shot child sessions
 * (projection-types.ts:30-33), so the correct reading of "identity but no label" is "this session really has
 * no label", not "not folded yet" — there is no reason to re-fold the whole log for it.
 *
 * @param identity - Value of the official subagent projection unit (same shape in the live snapshot / cache row / log fold).
 * @returns With label = the label string; authoritatively no label = `null`; undeterminable (identity missing or null) = `undefined`.
 */
export function labelFromSubagentIdentity(identity: SubagentIdentityValue | null | undefined): string | null | undefined {
  if (identity === null || typeof identity !== 'object') return undefined
  const label: unknown = identity.label
  return typeof label === 'string' && label.trim() !== '' ? label : null
}

/**
 * Bounded LRU cache (pure logic, unit-testable): Map insertion order is access order,
 * a get hit deletes and re-inserts = moves to newest; a set beyond the cap evicts the least recently used entry.
 * The value domain excludes undefined (a missing key is indistinguishable from "value is undefined"); null is
 * allowed (conclusions like "authoritatively no label" must be remembered too, otherwise the log would be
 * re-folded every time), so callers must never store undefined values.
 */
interface LruCache<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V): void
  readonly size: number
}

export function createLruCache<K, V>(maxEntries: number): LruCache<K, V> {
  const entries = new Map<K, V>()
  return {
    get(key) {
      const value = entries.get(key)
      if (value !== undefined) {
        entries.delete(key)
        entries.set(key, value)
      }
      return value
    },
    set(key, value) {
      entries.delete(key)
      entries.set(key, value)
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next().value as K | undefined
        if (oldest !== undefined) entries.delete(oldest)
      }
    },
    get size() {
      return entries.size
    },
  }
}

/**
 * Budget signal that can be released early (pure logic, unit-testable): AbortSignal.timeout's timer stays
 * alive until the deadline even after the batch ends (it isn't released on the success path); here we build our
 * own AbortController + timer instead, and release() clears the timer on both success and failure paths, so no
 * handle lingers.
 */
export function createBudgetSignal(timeoutMs: number): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`预算超时（${timeoutMs}ms）`))
  }, timeoutMs)
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer)
    },
  }
}

/**
 * Bounded-concurrency execution (pure logic, unit-testable): at most `limit` workers pull tasks in order;
 * a single task failure only records undefined at its position and does not abort the others; results stay
 * aligned with the input.
 */
export async function runBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array<R | undefined>(items.length)
  if (items.length === 0) return results
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      const item = items[index] as T
      try {
        results[index] = await work(item)
      } catch {
        results[index] = undefined
      }
    }
  })
  await Promise.all(workers)
  return results
}

