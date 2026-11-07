/** Pure grouping/tree helpers for the Sessions view (no React, unit-tested separately). */

import type { SessionChipInfo } from './contract.js'

export interface SessionWorkspaceGroup {
  /** Stable key: the workspace cwd, or '' for sessions without one. */
  readonly key: string
  /** Display label: the last path segment; empty means "no workspace". */
  readonly label: string
  readonly sessions: readonly SessionChipInfo[]
}

export interface ArchivedSessionNode {
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
 * Active catalog grouped by workspace (cwd). Archived rows are handled by the archive tree;
 * subagent rows stay in their workspace list and are tagged in the UI.
 */
export function activeSessionGroups(sessions: readonly SessionChipInfo[]): SessionWorkspaceGroup[] {
  const groups = new Map<string, SessionChipInfo[]>()
  for (const session of sessions) {
    if (session.availability === 'archived') continue
    const key = session.cwd ?? ''
    const list = groups.get(key)
    if (list === undefined) groups.set(key, [session])
    else list.push(session)
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, label: workspaceLabel(key), sessions: [...list].sort(byActivity) }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key))
}

/**
 * Archived sessions as a depth-first tree. A row whose parent is not archived is promoted to a
 * root, so a partially archived tree is never dropped or duplicated; cycles degrade to roots.
 */
export function archivedSessionTree(sessions: readonly SessionChipInfo[]): ArchivedSessionNode[] {
  const archived = sessions.filter(session => session.availability === 'archived')
  const byId = new Map(archived.map(session => [session.id, session]))
  const children = new Map<string, SessionChipInfo[]>()
  const roots: SessionChipInfo[] = []
  for (const session of archived) {
    const parent = session.parentId === undefined ? undefined : byId.get(session.parentId)
    if (parent === undefined) {
      roots.push(session)
      continue
    }
    const list = children.get(parent.id)
    if (list === undefined) children.set(parent.id, [session])
    else list.push(session)
  }
  const sort = (list: SessionChipInfo[]): SessionChipInfo[] => [...list].sort(byActivity)
  const out: ArchivedSessionNode[] = []
  const visited = new Set<string>()
  const walk = (session: SessionChipInfo, depth: number): void => {
    if (visited.has(session.id)) return
    visited.add(session.id)
    out.push({ session, depth })
    for (const child of sort(children.get(session.id) ?? [])) walk(child, depth + 1)
  }
  for (const root of sort(roots)) walk(root, 0)
  // Unreachable nodes (cycles): surface them as roots rather than hiding them.
  for (const session of sort(archived)) if (!visited.has(session.id)) walk(session, 0)
  return out
}

/** Count label helper shared by the two sections. */
export function sessionCountLabel(count: number): string {
  return String(count)
}
