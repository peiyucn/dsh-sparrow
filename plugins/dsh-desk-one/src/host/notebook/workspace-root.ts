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
