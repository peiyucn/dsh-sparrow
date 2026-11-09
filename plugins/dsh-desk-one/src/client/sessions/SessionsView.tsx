/**
 * Sessions (Agent会话) view: active catalog (Phase 1, client snapshot) + archive management
 * (Phase 3/A2, host routes). Active rows can be archived or moved to trash; archived / stray /
 * trash operations live in ArchiveSections and all mutations go through the host's routes.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import type { SessionChipInfo, SessionLinkSnapshot } from './contract.js'
import type { SessionsArchiveApi } from './archiveApi.js'
import { activeSessionGroups } from './catalog.js'
import { ArchiveSections } from './ArchiveSections.js'
import { SessionRowAction } from './SessionRowAction.js'
import { SessionTreeRow } from './SessionTreeRow.js'
import { formatDate, formatTokens } from '../app/utils.js'

interface SessionsViewProps {
  readonly snapshot: SessionLinkSnapshot
  readonly t: DeskTranslator
  readonly onOpen: (sessionId: string) => void
  readonly archive: SessionsArchiveApi
}

function stateText(t: DeskTranslator, session: SessionChipInfo): string {
  if (session.availability === 'archived') return t('task.session.archived')
  if (session.availability === 'unavailable') return t('task.session.unavailable')
  if (session.availability === 'loading') return t('task.session.loading')
  return session.running ? t('task.session.running') : t('task.session.idle')
}

function sessionMeta(t: DeskTranslator, session: SessionChipInfo): string {
  const parts: string[] = []
  if (session.turns !== undefined) parts.push(`${session.turns} ${t('sessions.archive.turns')}`)
  const tokens = (session.inputTokens ?? 0) + (session.outputTokens ?? 0) + (session.cacheReadTokens ?? 0) + (session.cacheWriteTokens ?? 0)
  if (tokens > 0) parts.push(formatTokens(tokens))
  parts.push(formatDate(new Date(session.updatedAt).toISOString()))
  return parts.join(' · ')
}

function SessionRow({
  session, depth, t, onOpen, childCount, collapsed, onToggle, actions, badges,
}: {
  readonly session: SessionChipInfo
  readonly depth?: number
  readonly t: DeskTranslator
  readonly onOpen: (sessionId: string) => void
  readonly childCount: number
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly actions?: ReactElement
  readonly badges?: ReactElement
}): ReactElement {
  const archived = session.availability === 'archived'
  const unavailable = session.availability === 'unavailable' || session.availability === 'loading'
  const openable = !archived && !unavailable
  return (
    <li>
      <SessionTreeRow
        variant="active"
        title={session.title}
        depth={depth ?? 0}
        subagent={session.subagent}
        tag={t('sessions.subagent')}
        live={archived}
        disabled={!openable}
        status={stateText(t, session)}
        meta={sessionMeta(t, session)}
        hasChildren={childCount > 0}
        expanded={!collapsed}
        onToggleExpand={onToggle}
        actions={actions}
        badges={badges}
        onOpen={() => onOpen(session.id)}
        expandLabel={t('sessions.archive.expand')}
        collapseLabel={t('sessions.archive.collapse')}
      />
    </li>
  )
}
export function SessionsView({ snapshot, t, onOpen, archive }: SessionsViewProps): ReactElement {
  const groups = activeSessionGroups(snapshot.sessions, snapshot.workspaces)
  const activeCount = groups.reduce((sum, group) => sum + group.sessions.length, 0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const act = async (sessionId: string, task: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await task()
      setHidden(previous => new Set(previous).add(sessionId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  const toggleCollapsed = (id: string): void => {
    setCollapsed(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  type ActiveNode = { session: SessionChipInfo; depth: number; childCount: number; children: ActiveNode[] }
  /** Parent-first flat rows -> nested tree, so children can live in a real nested list with one rail. */
  const treeOf = (rows: readonly { session: SessionChipInfo; depth: number; childCount: number }[]): ActiveNode[] => {
    const roots: ActiveNode[] = []
    const stack: ActiveNode[] = []
    for (const row of rows) {
      const node: ActiveNode = { ...row, children: [] }
      while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= row.depth) stack.pop()
      const parent = stack[stack.length - 1]
      if (parent === undefined) roots.push(node)
      else parent.children.push(node)
      stack.push(node)
    }
    return roots
  }
  const renderNode = (node: ActiveNode): ReactElement | null => {
    if (hidden.has(node.session.id)) return null
    const isCollapsed = collapsed.has(node.session.id)
    const children = isCollapsed ? [] : node.children
    return (
      <li key={node.session.id}>
        <SessionRow
          session={node.session}
          depth={0}
          t={t}
          onOpen={onOpen}
          childCount={node.children.length}
          collapsed={isCollapsed}
          onToggle={() => toggleCollapsed(node.session.id)}
          badges={node.children.length === 0 ? undefined : (
            <span className="dsh-desk-archive-badge">{t('sessions.childCount', { count: node.children.length })}</span>
          )}
          actions={node.depth === 0 ? (
            <SessionRowAction
              kind="archive"
              label={t('sessions.archive.archive')}
              disabled={busy}
              onClick={() => { void act(node.session.id, () => archive.archive(node.session.id)) }}
            />
          ) : undefined}
        />
        {children.length === 0 ? null : (
          <ul className="dsh-desk-tree-children">
            {children.map(renderNode)}
          </ul>
        )}
      </li>
    )
  }
  return (
    <div className="dsh-desk-sessionsview">
      {snapshot.enabled ? (
        <section className="dsh-desk-session-section" data-active="true">
          <header className="dsh-desk-session-section-head">
            <h2 className="dsh-desk-session-section-title">{t('sessions.active')}</h2>
            <span className="dsh-desk-session-section-count">{t('sessions.count', { count: activeCount })}</span>
          </header>
          {error === null ? null : <p className="dsh-desk-archive-error">{error}</p>}
          {groups.length === 0
            ? <p className="dsh-desk-wall-hint">{t('sessions.activeEmpty')}</p>
            : groups.map(group => (
                <div className="dsh-desk-session-group" key={group.key}>
                  <div className="dsh-desk-session-group-head" title={group.key}>
                    <span className="dsh-desk-session-group-title">
                      {group.label === '' ? t('sessions.noWorkspace') : group.label}
                    </span>
                    <span className="dsh-desk-session-group-count">{group.sessions.length}</span>
                  </div>
                  <ul className="dsh-desk-session-list">
                    {treeOf(group.rows).map(renderNode)}
                  </ul>
                </div>
              ))}
        </section>
      ) : <p className="dsh-desk-wall-hint">{t('sessions.disabled')}</p>}
      <ArchiveSections t={t} api={archive} onOpen={onOpen} />
    </div>
  )
}