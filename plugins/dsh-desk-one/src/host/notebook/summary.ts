/**
 * Annotation landing summary: pending drafts, submitted records, and recent reviews, enriched
 * with the workspace each file belongs to. Root-free by design (the notebook library is gone).
 */

import type { NotebookSummaryResponse, NotebookSummaryRow } from '../../notebook-contract.js'
import type { DeskStore } from '../store.js'
import {
  workspaceRefOfId, workspaceRefOfPath, type WorkspaceListRegistryLike, type WorkspaceRef,
} from './workspace-root.js'

/** Newest-first caps for the three lists. */
const DRAFT_LIMIT = 50
const RECORD_LIMIT = 50
const RECENT_LIMIT = 20

/** Display title from a workspace-relative path. */
function titleOfPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.(?:md|markdown|txt)$/iu, '')
}

/** Workspace metadata for one file identity's root (longest path match). */
function workspaceOfRoot(registry: WorkspaceListRegistryLike, rootPath: string): WorkspaceRef | undefined {
  return workspaceRefOfPath(registry, rootPath)
}

/** Sort newest first and cap the list. */
function newest<T extends { readonly updatedAt: string }>(rows: T[], limit: number): T[] {
  return rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit)
}

/**
 * Build the landing page's three lists.
 * @param store - unified desk store.
 * @param registry - workspace registry (id/title lookup and path matching).
 * @returns drafts, submitted records, and recent review sessions, newest first.
 */
export function buildSummary(store: DeskStore, registry: WorkspaceListRegistryLike): NotebookSummaryResponse {
  const drafts = store.listNoteDrafts()
    .filter(draft => draft.drafts.length > 0)
    .map((draft): NotebookSummaryRow => {
      const workspace = workspaceOfRoot(registry, draft.rootPath)
      return {
        key: draft.id,
        fileId: draft.fileId,
        path: draft.path,
        title: titleOfPath(draft.path),
        ...workspace === undefined ? {} : { workspaceId: String(workspace.id), workspaceTitle: workspace.title },
        updatedAt: draft.updatedAt,
        count: draft.drafts.length,
      }
    })

  const records = store.listReviewRecords().map((record): NotebookSummaryRow => {
    const file = store.getNoteFile(record.fileId)
    const workspace = record.workspaceId === undefined
      ? (file === undefined ? undefined : workspaceOfRoot(registry, file.rootPath))
      : workspaceRefOfId(registry, record.workspaceId)
    return {
      key: record.id,
      fileId: record.fileId,
      path: record.pathSnapshot,
      title: record.fileTitle,
      ...workspace === undefined ? {} : { workspaceId: String(workspace.id), workspaceTitle: workspace.title },
      updatedAt: record.createdAt,
      count: record.annotations.length,
    }
  })

  const recent: NotebookSummaryRow[] = []
  for (const marker of store.listReviewSessions()) {
    if (marker.fileId === undefined) continue
    const file = store.getNoteFile(marker.fileId)
    const workspace = marker.workspaceId === undefined
      ? (file === undefined ? undefined : workspaceOfRoot(registry, file.rootPath))
      : workspaceRefOfId(registry, marker.workspaceId)
    recent.push({
      key: marker.sessionId,
      fileId: marker.fileId,
      ...file === undefined ? {} : { path: file.path },
      title: file === undefined ? marker.fileId : titleOfPath(file.path),
      ...workspace === undefined ? {} : { workspaceId: String(workspace.id), workspaceTitle: workspace.title },
      updatedAt: marker.updatedAt,
      count: 0,
    })
  }

  return {
    drafts: newest(drafts, DRAFT_LIMIT),
    records: newest(records, RECORD_LIMIT),
    recent: newest(recent, RECENT_LIMIT),
  }
}
