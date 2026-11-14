/**
 * Workspace-scoped file addressing for annotation.
 *
 * The client names the workspace it is browsing; the host resolves the directory from the official
 * registry instead of trusting a path from the request. Keeping this rule in one small function
 * makes the trust boundary unit-testable without HTTP.
 */

import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { DeskError } from '../http.js'

/** Minimal face of the official workspace registry. */
export interface WorkspaceRegistryLike {
  get(id: WorkspaceId): { readonly path: string } | undefined
}

/** One workspace record the annotation landing page displays. */
export interface WorkspaceRef {
  readonly id: WorkspaceId
  readonly path: string
  readonly title: string
}

/** Registry face that can also enumerate workspaces (landing-page rows need titles). */
export interface WorkspaceListRegistryLike {
  get(id: WorkspaceId): WorkspaceRef | undefined
  list(): readonly WorkspaceRef[]
}

/**
 * Absolute root of one registered workspace.
 * @param registry - official workspace registry.
 * @param workspaceId - workspace id from the request.
 * @returns the workspace's absolute directory.
 * @throws DeskError BAD_BODY for an empty id, UNKNOWN_WORKSPACE for an unregistered one.
 */
export function workspaceRootOf(registry: WorkspaceRegistryLike, workspaceId: string): string {
  if (workspaceId.trim() === '') throw new DeskError('BAD_BODY', '缺少 workspaceId')
  const workspace = registry.get(WorkspaceId(workspaceId))
  if (workspace === undefined) throw new DeskError('UNKNOWN_WORKSPACE', '工作区不存在', 404)
  return workspace.path
}

/** Normalize one absolute path for prefix comparison (`/`, no trailing separator). */
function normalizeAbsolute(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

/**
 * Find the workspace that contains one absolute path; the longest matching root wins so a nested
 * workspace is not shadowed by its parent (same rule as the client-side matcher).
 * @param registry - registry that can enumerate workspaces.
 * @param absolutePath - file path.
 * @returns the owning workspace, or `undefined` when the path is outside every workspace.
 */
export function workspaceRefOfPath(
  registry: WorkspaceListRegistryLike,
  absolutePath: string,
): WorkspaceRef | undefined {
  const file = normalizeAbsolute(absolutePath)
  const caseless = /^[A-Za-z]:\//u.test(file) || file.startsWith('//')
  const fold = (value: string): string => (caseless ? value.toLowerCase() : value)
  const target = fold(file)
  let best: WorkspaceRef | undefined
  let bestLength = -1
  for (const workspace of registry.list()) {
    const prefix = fold(normalizeAbsolute(workspace.path))
    if (target !== prefix && !target.startsWith(`${prefix}/`)) continue
    if (prefix.length > bestLength) {
      best = workspace
      bestLength = prefix.length
    }
  }
  return best
}

/**
 * Look up one workspace by id.
 * @param registry - official workspace registry.
 * @param workspaceId - workspace id.
 * @returns the workspace record when registered.
 */
export function workspaceRefOfId(
  registry: WorkspaceListRegistryLike,
  workspaceId: string,
): WorkspaceRef | undefined {
  return registry.get(WorkspaceId(workspaceId))
}
