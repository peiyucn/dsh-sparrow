

import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { DeskError } from '../http.js'


export interface WorkspaceRegistryLike {
  get(id: WorkspaceId): { readonly path: string } | undefined
}


export function workspaceRootOf(registry: WorkspaceRegistryLike, workspaceId: string): string {
  if (workspaceId.trim() === '') throw new DeskError('BAD_BODY', '缺少 workspaceId')
  const workspace = registry.get(WorkspaceId(workspaceId))
  if (workspace === undefined) throw new DeskError('UNKNOWN_WORKSPACE', '工作区不存在', 404)
  return workspace.path
}
