

import { nestTree } from '../../tree.js'
import type { SessionChipInfo, SessionWorkspaceGroupInfo } from './contract.js'

interface SessionWorkspaceGroup {

  readonly key: string

  readonly label: string

  readonly sessions: readonly SessionChipInfo[]

  readonly rows: readonly ActiveSessionRow[]
}

interface ActiveSessionRow {
  readonly session: SessionChipInfo
  readonly depth: number
  readonly childCount: number
}


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


export function activeSessionGroups(
  sessions: readonly SessionChipInfo[],
  workspaces: readonly SessionWorkspaceGroupInfo[] = [],
): SessionWorkspaceGroup[] {
  const workspaceBySession = new Map<string, SessionWorkspaceGroupInfo>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) workspaceBySession.set(sessionId, workspace)
  }
  const active = sessions.filter(session => session.availability !== 'archived')
  const nodes = nestTree(active, {
    idOf: session => session.id,
    parentIdOf: session => session.parentId,
    sortRoots: byActivity,
    sortChildren: byActivity,
  })
  type Group = { label: string; sessions: SessionChipInfo[]; rows: ActiveSessionRow[] }
  const groups = new Map<string, Group>()
  for (const node of nodes) {
    const root = node.value
    const workspace = workspaceBySession.get(root.id)
    const key = workspace === undefined ? (root.cwd === undefined ? '' : `cwd:${root.cwd}`) : `ws:${workspace.id}`
    const label = workspace?.title ?? workspaceLabel(root.cwd)
    let group = groups.get(key)
    if (group === undefined) {
      group = { label, sessions: [], rows: [] }
      groups.set(key, group)
    }
    const addRows = (item: typeof node, depth: number): void => {
      group.sessions.push(item.value)
      group.rows.push({ session: item.value, depth, childCount: item.children.length })
      for (const child of item.children) addRows(child, depth + 1)
    }
    addRows(node, 0)
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, sessions: [...group.sessions].sort(byActivity), rows: group.rows }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key))
}
