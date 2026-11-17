/**
 * Session archive management sections (A2): archived tree, stray sessions and trash.
 *
 * Every destructive action is armed in place first (two-step confirm). Permanent delete no longer
 * asks the user to retype the title: the row's own title is submitted automatically on the second
 * click, and the host-side exact-title check still guards the route. The trust fence and file
 * validation live on the host; this file only renders state and confirms intent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { SESSION_STREAM_PAGE_SIZE } from '../../constants.js'
import type {
  ArchiveTreeNode, StraySessionItem, TrashEntry, TrashDirResponse,
} from '../../session-admin.js'
import type { DeskTranslator } from '../app/types.js'
import { LoadMore } from '../app/SubPageHeader.js'
import { useCopyFeedback } from '../app/useCopyFeedback.js'
import type { SessionsArchiveApi } from './archiveApi.js'
import { formatShortDateTime, formatTokens } from '../app/utils.js'
import { ArchiveTreeNodeRow, countTree, TrashSubagentRows } from './archive-rows.js'
import { ConfirmButton } from './ConfirmButton.js'
import { knownSessionIds, type KnownSessions } from './known.js'
import { SessionCopyActions } from './SessionCopyActions.js'
import { SessionRowAction } from './SessionRowAction.js'
import { SessionTreeRow } from './SessionTreeRow.js'

/** How long the trash-path button shows "copied" (the previous inline feedback also used 2s). */
const TRASH_DIR_COPY_FEEDBACK_MS = 2_000

interface ArchiveSnapshot {
  readonly tree: readonly ArchiveTreeNode[]
  readonly strays: readonly StraySessionItem[]
  readonly trash: readonly TrashEntry[]
  readonly trashDir: TrashDirResponse | null
}

interface ArchiveSectionsProps {
  readonly t: DeskTranslator
  readonly api: SessionsArchiveApi
  readonly onOpen: (sessionId: string) => void
  /** Report every id these sections display, so the active catalog can drop stale rows. */
  readonly onKnownChange?: (known: KnownSessions) => void
  /** Parent bump: an active session was archived and the archived pane must reload to show it. */
  readonly refreshToken: number
}


export function ArchiveSections({ t, api, onOpen, onKnownChange, refreshToken }: ArchiveSectionsProps): ReactElement {
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [armedTrash, setArmedTrash] = useState<Set<string>>(new Set())
  const [armedDelete, setArmedDelete] = useState<string | null>(null)
  const [armedTrashDelete, setArmedTrashDelete] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<null | 'restoreAll' | 'deleteAll'>(null)
  /** Feedback for the trash-directory copy: the path button flips to "copied" for 2s. */
  const trashDirCopy = useCopyFeedback({ feedbackMs: TRASH_DIR_COPY_FEEDBACK_MS })
  const [visible, setVisible] = useState({ archived: SESSION_STREAM_PAGE_SIZE, strays: SESSION_STREAM_PAGE_SIZE, trash: SESSION_STREAM_PAGE_SIZE })
  const [expandedTrash, setExpandedTrash] = useState<Set<string>>(new Set())
  /** Monotonic request id: an older reload must never overwrite a newer snapshot. */
  const reloadSeq = useRef(0)

  const reload = useCallback(async (quiet = false): Promise<void> => {
    const seq = ++reloadSeq.current
    try {
      const [tree, strays, trash, trashDir] = await Promise.all([
        api.list(), api.strays(), api.trash(), api.trashDir(),
      ])
      if (seq !== reloadSeq.current) return
      setSnapshot({ tree, strays, trash, trashDir })
      setError(null)
    } catch (reason) {
      if (seq !== reloadSeq.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (seq === reloadSeq.current && !quiet) setLoading(false)
    }
  }, [api])

  useEffect(() => { void reload() }, [reload, refreshToken])

  /** Keep the report stable for the parent even when its setState identity changes per render. */
  const onKnownChangeRef = useRef(onKnownChange)
  onKnownChangeRef.current = onKnownChange
  useEffect(() => {
    if (snapshot === null) return
    onKnownChangeRef.current?.(knownSessionIds(snapshot.tree, snapshot.trash))
  }, [snapshot])

  /**
   * Optimistically drop a row before the background refresh: the host has already committed the
   * mutation, so replacing the whole list in one paint is what makes rows "blink".
   */
  const run = useCallback(async (task: () => Promise<unknown>, onDone?: (current: ArchiveSnapshot) => ArchiveSnapshot): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await task()
      if (onDone !== undefined) setSnapshot(current => current === null ? current : onDone(current))
      await reload(true)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    } finally {
      setBusy(false)
      setArmedTrash(new Set())
      setArmedDelete(null)
      setArmedTrashDelete(new Set())
      setBulk(null)
    }
  }, [reload])

  const archivedCount = useMemo(() => countTree(snapshot?.tree ?? []), [snapshot?.tree])
  const strays = snapshot?.strays ?? []
  const trash = snapshot?.trash ?? []

  const copyTrashPath = (): void => {
    void trashDirCopy.copy(snapshot?.trashDir?.displayPath ?? '')
  }

  /** Remove a subtree by root id from the archived tree, keeping descendants out too. */
  const dropFromTree = (id: string) => (current: ArchiveSnapshot): ArchiveSnapshot => ({
    ...current,
    tree: current.tree.filter(node => node.sessionId !== id),
  })

  const onConfirmDelete = (node: ArchiveTreeNode): void => {
    void run(
      () => api.deleteSession({ sessionId: node.sessionId, confirmTitle: node.title }),
      dropFromTree(node.sessionId),
    )
  }

  return (
    <>
      {error === null ? null : <p className="dsh-desk-archive-error">{error}</p>}
      <section className="dsh-desk-session-section">
        <header className="dsh-desk-session-section-head">
          <h2 className="dsh-desk-session-section-title">{t('sessions.archived')}</h2>
          <span className="dsh-desk-session-section-count">{t('sessions.count', { count: archivedCount })}</span>
        </header>
        <p className="dsh-desk-session-section-note">{t('sessions.archive.hint')}</p>
        {loading ? <p className="dsh-desk-page-hint">{t('state.loading')}</p> : archivedCount === 0 ? (
          <p className="dsh-desk-page-hint">{t('sessions.archivedEmpty')}</p>
        ) : (
          <div className="dsh-desk-session-group">
            <ul className="dsh-desk-archive-list">
              {(snapshot?.tree ?? []).slice(0, visible.archived).map(node => (
                <ArchiveTreeNodeRow
                  key={node.sessionId}
                  node={node}
                  depth={0}
                  readOnly={false}
                  t={t}
                  expanded={expanded}
                  armedTrash={armedTrash}
                  deleteArmed={armedDelete === node.sessionId}
                  busy={busy}
                  onToggleExpand={(id) => setExpanded(previous => {
                    const next = new Set(previous)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })}
                  onOpen={onOpen}
                  onUnarchive={(id) => { void run(() => api.unarchive(id), dropFromTree(id)) }}
                  onArmTrash={(id) => setArmedTrash(new Set([id]))}
                  onConfirmTrash={(id) => { void run(() => api.moveToTrash(id), dropFromTree(id)) }}
                  onArmDelete={(id) => setArmedDelete(id)}
                  onConfirmDelete={onConfirmDelete}
                />
              ))}
            </ul>
            <LoadMore
              more={(snapshot?.tree.length ?? 0) > visible.archived}
              label={t('action.loadMore')}
              onClick={() => setVisible(previous => ({ ...previous, archived: previous.archived + SESSION_STREAM_PAGE_SIZE }))}
            />
          </div>
        )}
      </section>

      {strays.length === 0 ? null : (
        <section className="dsh-desk-session-section">
          <header className="dsh-desk-session-section-head">
            <h2 className="dsh-desk-session-section-title">{t('sessions.archive.strays')}</h2>
            <span className="dsh-desk-session-section-count">{t('sessions.count', { count: strays.length })}</span>
          </header>
          <p className="dsh-desk-session-section-note">{t('sessions.archive.straysHint')}</p>
          <div className="dsh-desk-session-group">
            <ul className="dsh-desk-archive-list">
              {strays.slice(0, visible.strays).map(item => (
                <li key={item.sessionId}>
                  <SessionTreeRow
                    variant="archive"
                    title={item.title}
                    depth={0}
                    disabled={false}
                    onOpen={() => onOpen(item.sessionId)}
                    badges={(
                      <>
                        {item.blank ? <span className="dsh-desk-archive-badge">{t('sessions.archive.blank')}</span> : null}
                        {item.orphan ? <span className="dsh-desk-archive-badge">{t('sessions.archive.orphan')}</span> : null}
                      </>
                    )}
                    meta={[
                      formatShortDateTime(item.lastActiveAt ?? item.createdAt),
                      item.turns === undefined ? '' : `${item.turns} ${t('sessions.archive.turns')}`,
                      item.tokens === undefined ? '' : formatTokens(item.tokens),
                      item.backendSupported ? '' : t('sessions.archive.unsupported'),
                    ].filter(Boolean).join(' · ')}
                    expandLabel={t('sessions.archive.expand')}
                    collapseLabel={t('sessions.archive.collapse')}
                    actions={(
                      <>
                        <SessionCopyActions title={item.title} sessionId={item.sessionId} t={t} />
                        <SessionRowAction kind="archive" label={t('sessions.archive.archive')} disabled={busy} onClick={() => { void run(() => api.archive(item.sessionId), current => ({ ...current, strays: current.strays.filter(row => row.sessionId !== item.sessionId) })) }} />
                        <SessionRowAction
                          kind="trash"
                          label={t('sessions.archive.toTrash')}
                          confirmLabel={t('sessions.archive.toTrashConfirm')}
                          armed={armedTrash.has(item.sessionId)}
                          disabled={busy || !item.backendSupported}
                          onClick={() => {
                            if (armedTrash.has(item.sessionId)) { void run(() => api.moveToTrash(item.sessionId), current => ({ ...current, strays: current.strays.filter(row => row.sessionId !== item.sessionId) })) }
                            else setArmedTrash(new Set([item.sessionId]))
                          }}
                        />
                        <SessionRowAction
                          kind="delete"
                          label={t('sessions.archive.delete')}
                          confirmLabel={t('sessions.archive.deleteConfirm')}
                          armed={armedDelete === item.sessionId}
                          danger
                          disabled={busy || !item.backendSupported}
                          onClick={() => {
                            if (armedDelete !== item.sessionId) { setArmedDelete(item.sessionId); return }
                            void run(
                              () => api.deleteSession(
                                item.blank
                                  ? { sessionId: item.sessionId, confirm: true }
                                  : { sessionId: item.sessionId, confirmTitle: item.title },
                              ),
                              current => ({ ...current, strays: current.strays.filter(row => row.sessionId !== item.sessionId) }),
                            )
                          }}
                        />
                      </>
                    )}
                  />
                </li>
              ))}
            </ul>
            <LoadMore
              more={strays.length > visible.strays}
              label={t('action.loadMore')}
              onClick={() => setVisible(previous => ({ ...previous, strays: previous.strays + SESSION_STREAM_PAGE_SIZE }))}
            />
          </div>
        </section>
      )}

      <section className="dsh-desk-session-section">
        <header className="dsh-desk-session-section-head">
          <h2 className="dsh-desk-session-section-title">{t('sessions.archive.trash')}</h2>
          <span className="dsh-desk-session-section-count">{t('sessions.count', { count: trash.length })}</span>
          <div className="dsh-desk-archive-bulk">
            <ConfirmButton
              label={t('sessions.archive.restoreAll')}
              confirmLabel={t('sessions.archive.restoreAllConfirm')}
              armed={bulk === 'restoreAll'}
              disabled={busy || trash.length === 0}
              onArm={() => setBulk('restoreAll')}
              onConfirm={() => { void run(() => api.restoreAll()) }}
            />
            <ConfirmButton
              label={t('sessions.archive.deleteAll')}
              confirmLabel={t('sessions.archive.deleteAllConfirm')}
              armed={bulk === 'deleteAll'}
              danger
              disabled={busy || trash.length === 0}
              onArm={() => setBulk('deleteAll')}
              onConfirm={() => { void run(() => api.deleteAllTrash()) }}
            />
          </div>
        </header>
        {snapshot?.trashDir === null || snapshot?.trashDir === undefined ? null : (
          <button type="button" className="dsh-desk-archive-trashdir" onClick={copyTrashPath} title={t('sessions.archive.copyPath')}>
            {trashDirCopy.state === 'copied' ? t('sessions.archive.copied') : snapshot.trashDir.displayPath}
          </button>
        )}
        {trash.length === 0 ? <p className="dsh-desk-page-hint">{t('sessions.archive.trashEmpty')}</p> : (
          <div className="dsh-desk-session-group">
            <ul className="dsh-desk-archive-list">
              {trash.slice(0, visible.trash).map(entry => (
                <li key={entry.trashId}>
                  <SessionTreeRow
                    variant="archive"
                    title={entry.title}
                    depth={0}
                    disabled
                    expandLabel={t('sessions.archive.expand')}
                    collapseLabel={t('sessions.archive.collapse')}
                    badges={(
                      <>
                        {entry.legacy ? <span className="dsh-desk-archive-badge">{t('sessions.archive.legacy')}</span> : null}
                        {!entry.legacy && entry.subagents.length > 0
                          ? <span className="dsh-desk-archive-badge">{t('sessions.childCount', { count: entry.subagents.length })}</span>
                          : null}
                      </>
                    )}
                    meta={formatShortDateTime(Date.parse(entry.archivedAt))}
                    hasChildren={!entry.legacy && entry.subagents.length > 0}
                    expanded={expandedTrash.has(entry.trashId)}
                    onToggleExpand={() => setExpandedTrash(previous => {
                      const next = new Set(previous)
                      if (next.has(entry.trashId)) next.delete(entry.trashId)
                      else next.add(entry.trashId)
                      return next
                    })}
                    actions={(
                      <>
                        <SessionCopyActions title={entry.title} sessionId={entry.sessionId} t={t} />
                        {entry.legacy ? null : (
                          <SessionRowAction kind="restore" label={t('sessions.archive.restore')} disabled={busy} onClick={() => { void run(() => api.restore(entry.trashId), current => ({ ...current, trash: current.trash.filter(row => row.trashId !== entry.trashId) })) }} />
                        )}
                        <SessionRowAction
                          kind="delete"
                          label={t('sessions.archive.delete')}
                          confirmLabel={t('sessions.archive.deleteConfirm')}
                          armed={armedTrashDelete.has(entry.trashId)}
                          danger
                          disabled={busy}
                          onClick={() => {
                            if (armedTrashDelete.has(entry.trashId)) { void run(() => api.deleteTrashEntry(entry.trashId), current => ({ ...current, trash: current.trash.filter(row => row.trashId !== entry.trashId) })) }
                            else setArmedTrashDelete(new Set([entry.trashId]))
                          }}
                        />
                      </>
                    )}
                  />
                  {entry.legacy || !expandedTrash.has(entry.trashId) ? null : (
                    <TrashSubagentRows t={t} parentId={entry.sessionId} subagents={entry.subagents} depth={1} />
                  )}
                </li>
              ))}
            </ul>
            <LoadMore
              more={trash.length > visible.trash}
              label={t('action.loadMore')}
              onClick={() => setVisible(previous => ({ ...previous, trash: previous.trash + SESSION_STREAM_PAGE_SIZE }))}
            />
          </div>
        )}
        {trash.length === 0 ? null : <p className="dsh-desk-session-section-note">{t('sessions.archive.uninstallHint')}</p>}
      </section>
    </>
  )
}
