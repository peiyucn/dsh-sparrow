/**
 * Sessions (Agent会话) view: active catalog (Phase 1, client snapshot) + archive management
 * (Phase 3/A2, host routes). The active list stays read-only; archived / stray / trash operations
 * live in ArchiveSections and go through the host's validated routes.
 */

import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import type { SessionChipInfo, SessionLinkSnapshot } from './contract.js'
import type { SessionsArchiveApi } from './archiveApi.js'
import { activeSessionGroups } from './catalog.js'
import { ArchiveSections } from './ArchiveSections.js'

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

export function SessionsView({ snapshot, t, onOpen, archive }: SessionsViewProps): ReactElement {
  const groups = activeSessionGroups(snapshot.sessions, snapshot.workspaces)
  const activeCount = groups.reduce((sum, group) => sum + group.sessions.length, 0)
  return (
    <div className="dsh-desk-sessionsview">
      {snapshot.enabled ? (
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
      ) : <p className="dsh-desk-wall-hint">{t('sessions.disabled')}</p>}
      <ArchiveSections t={t} api={archive} onOpen={onOpen} />
    </div>
  )
}
