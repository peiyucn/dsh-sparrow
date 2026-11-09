/** Pure grouping/tree helpers for the Sessions view (no React, unit-tested separately). */

import type { SessionChipInfo, SessionWorkspaceGroupInfo } from './contract.js'

export interface SessionWorkspaceGroup {
  /** Stable key: workspace id, cwd fallback, or '' for sessions without both. */
  readonly key: string
  /** Display label: workspace title, then last path segment; empty means "no workspace". */
  readonly label: string
  /** All sessions in the group (flat, for counts and compatibility). */
  readonly sessions: readonly SessionChipInfo[]
  /** Parent-first rows: subagents follow their parent at depth 1, same nesting as the archive tree. */
  readonly rows: readonly ActiveSessionRow[]
}

export interface ActiveSessionRow {
  readonly session: SessionChipInfo
  readonly depth: number
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
 * to the session's cwd basename for sessions outside any workspace. Subagent sessions are nested
 * under their parent (same lineage rule as the archive tree), never shown as a separate group.
 */
export function activeSessionGroups(
  sessions: readonly SessionChipInfo[],
  workspaces: readonly SessionWorkspaceGroupInfo[] = [],
): SessionWorkspaceGroup[] {
  const workspaceBySession = new Map<string, SessionWorkspaceGroupInfo>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) workspaceBySession.set(sessionId, workspace)
  }
  const active = sessions.filter(session => session.availability !== 'archived')
  const byId = new Map(active.map(session => [session.id, session]))
  const children = new Map<string, SessionChipInfo[]>()
  const roots: SessionChipInfo[] = []
  for (const session of active) {
    const parent = session.parentId === undefined ? undefined : byId.get(session.parentId)
    if (parent === undefined) roots.push(session)
    else {
      const siblings = children.get(parent.id) ?? []
      siblings.push(session)
      children.set(parent.id, siblings)
    }
  }
  type Group = { label: string; sessions: SessionChipInfo[]; rows: ActiveSessionRow[] }
  const groups = new Map<string, Group>()
  const addRows = (group: Group, session: SessionChipInfo, depth: number): void => {
    group.sessions.push(session)
    group.rows.push({ session, depth })
    const nested = (children.get(session.id) ?? []).sort(byActivity)
    for (const child of nested) addRows(group, child, depth + 1)
  }
  for (const root of roots.sort(byActivity)) {
    const workspace = workspaceBySession.get(root.id)
    const key = workspace === undefined ? (root.cwd === undefined ? '' : `cwd:${root.cwd}`) : `ws:${workspace.id}`
    const label = workspace?.title ?? workspaceLabel(root.cwd)
    let group = groups.get(key)
    if (group === undefined) {
      group = { label, sessions: [], rows: [] }
      groups.set(key, group)
    }
    addRows(group, root, 0)
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, sessions: [...group.sessions].sort(byActivity), rows: group.rows }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key))
}

