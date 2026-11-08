/** Pure grouping/tree helpers for the Sessions view (no React, unit-tested separately). */

import type { SessionChipInfo, SessionWorkspaceGroupInfo } from './contract.js'

export interface SessionWorkspaceGroup {
  /** Stable key: workspace id, cwd fallback, or '' for sessions without both. */
  readonly key: string
  /** Display label: workspace title, then last path segment; empty means "no workspace". */
  readonly label: string
  readonly sessions: readonly SessionChipInfo[]
}

/** Last path segment for either Windows or POSIX cwd strings. */
export function workspaceLabel(cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return ''
  const trimmed = cwd.replace(/[\\/]+$/u, '')
  const parts = trimmed.split(/[\\/]/u)
  return parts[parts.length - 1] ?? ''
}

function byActivity(left: SessionChipInfo, right: SessionChipInfo): number {
  return Number(right.running) - Number(left.running)
    || right.updatedAt - left.updatedAt
    || left.title.localeCompare(right.title)
}

/**
 * Active catalog grouped by host Workspace first (the registry's title/sessionIds), falling back
 * to the session's cwd basename for sessions outside any workspace. Archived rows are handled by
 * the archive tree; subagent rows stay in their group and are tagged in the UI.
 */
export function activeSessionGroups(
  sessions: readonly SessionChipInfo[],
  workspaces: readonly SessionWorkspaceGroupInfo[] = [],
): SessionWorkspaceGroup[] {
  const workspaceBySession = new Map<string, SessionWorkspaceGroupInfo>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) workspaceBySession.set(sessionId, workspace)
  }
  const groups = new Map<string, { label: string; sessions: SessionChipInfo[] }>()
  for (const session of sessions) {
    if (session.availability === 'archived') continue
    const workspace = workspaceBySession.get(session.id)
    const key = workspace === undefined ? (session.cwd === undefined ? '' : `cwd:${session.cwd}`) : `ws:${workspace.id}`
    const label = workspace?.title ?? workspaceLabel(session.cwd)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { label, sessions: [session] })
    else group.sessions.push(session)
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, sessions: [...group.sessions].sort(byActivity) }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key))
}

