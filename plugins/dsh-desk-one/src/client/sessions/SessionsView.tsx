/** Sessions (Agent会话) view — Phase 1: read-only catalog, no file mutations yet. */

import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import type { SessionChipInfo, SessionLinkSnapshot } from './contract.js'
import { activeSessionGroups, archivedSessionTree } from './catalog.js'

interface SessionsViewProps {
  readonly snapshot: SessionLinkSnapshot
  readonly t: DeskTranslator
  readonly onOpen: (sessionId: string) => void
}

function stateText(t: DeskTranslator, session: SessionChipInfo): string {
  if (session.availability === 'archived') return t('task.session.archived')
  if (session.availability === 'unavailable') return t('task.session.unavailable')
  if (session.availability === 'loading') return t('task.session.loading')
  return session.running ? t('task.session.running') : t('task.session.idle')
}

function SessionRow({
  session, depth, t, onOpen,
}: {
  readonly session: SessionChipInfo
  readonly depth?: number
  readonly t: DeskTranslator
  readonly onOpen: (sessionId: string) => void
}): ReactElement {
  const archived = session.availability === 'archived'
  const unavailable = session.availability === 'unavailable' || session.availability === 'loading'
  const openable = !archived && !unavailable
  const status = stateText(t, session)
  return (
    <li>
      <button
        type="button"
        className="dsh-desk-session-row"
        data-state={archived ? 'archived' : session.running ? 'running' : 'idle'}
        data-subagent={session.subagent}
        disabled={!openable}
        style={depth === undefined || depth === 0 ? undefined : { paddingLeft: `calc(12px + ${depth} * 16px)` }}
        aria-label={`${session.title} · ${status}`}
        title={openable ? t('sessions.open') : status}
        onClick={() => { if (openable) onOpen(session.id) }}
      >
        <span className="dsh-desk-session-row-main">
          <span className="dsh-desk-session-row-title">{session.title}</span>
          {session.subagent ? <span className="dsh-desk-session-tag">{t('sessions.subagent')}</span> : null}
        </span>
        <span className="dsh-desk-session-row-meta">{status}</span>
      </button>
    </li>
  )
}

export function SessionsView({ snapshot, t, onOpen }: SessionsViewProps): ReactElement {
  if (!snapshot.enabled) {
    return <p className="dsh-desk-wall-hint">{t('sessions.disabled')}</p>
  }
  const groups = activeSessionGroups(snapshot.sessions, snapshot.workspaces)
  const archived = archivedSessionTree(snapshot.sessions)
  const activeCount = groups.reduce((sum, group) => sum + group.sessions.length, 0)
  return (
    <div className="dsh-desk-sessionsview">
      <section className="dsh-desk-session-section">
        <header className="dsh-desk-session-section-head">
          <h2 className="dsh-desk-session-section-title">{t('sessions.active')}</h2>
          <span className="dsh-desk-session-section-count">{t('sessions.count', { count: activeCount })}</span>
        </header>
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
                  {group.sessions.map(session => (
                    <SessionRow key={session.id} session={session} t={t} onOpen={onOpen} />
                  ))}
                </ul>
              </div>
            ))}
      </section>
      <section className="dsh-desk-session-section">
        <header className="dsh-desk-session-section-head">
          <h2 className="dsh-desk-session-section-title">{t('sessions.archived')}</h2>
          <span className="dsh-desk-session-section-count">{t('sessions.count', { count: archived.length })}</span>
        </header>
        <p className="dsh-desk-session-section-note">{t('sessions.archivedHint')}</p>
        {archived.length === 0
          ? <p className="dsh-desk-wall-hint">{t('sessions.archivedEmpty')}</p>
          : (
              <div className="dsh-desk-session-group">
                <ul className="dsh-desk-session-list">
                  {archived.map(node => (
                    <SessionRow
                      key={node.session.id}
                      session={node.session}
                      depth={node.depth}
                      t={t}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
              </div>
            )}
      </section>
    </div>
  )
}

