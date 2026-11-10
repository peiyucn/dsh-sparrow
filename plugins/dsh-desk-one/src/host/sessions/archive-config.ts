/**
 * Session archive configuration: trash directory, confirmation strength, path masking and the
 * trash sidecar format (v1 legacy entries and v2 parent/child bookkeeping).
 */

import { join } from 'node:path'
import { SIDECAR_VERSION, TRASH_SIDECAR } from './constants.js'
import type { LegacyTrashItem, TrashItem } from '../../session-admin.js'

export { TRASH_SIDECAR }

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
