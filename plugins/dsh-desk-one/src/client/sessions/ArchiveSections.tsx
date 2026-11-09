/**
 * Session archive management sections (A2): archived tree, stray sessions and trash.
 *
 * Every destructive action is armed in place first (two-step confirm); permanent delete also
 * requires typing the exact title, matching the archived plugin's safety contract. The trust fence
 * and file validation live on the host; this file only renders state and confirms intent.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { SESSION_STREAM_PAGE_SIZE } from '../../constants.js'
import type {
  ArchiveTreeNode, StraySessionItem, TrashEntry, TrashDirResponse,
} from '../../host/sessions/contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { SessionsArchiveApi } from './archiveApi.js'
import { SessionTreeRow } from './SessionTreeRow.js'

export interface ArchiveSnapshot {
  readonly tree: readonly ArchiveTreeNode[]
  readonly strays: readonly StraySessionItem[]
  readonly trash: readonly TrashEntry[]
  readonly trashDir: TrashDirResponse | null
}

interface ArchiveSectionsProps {
  readonly t: DeskTranslator
  readonly api: SessionsArchiveApi
  readonly onOpen: (sessionId: string) => void
}

function countTree(nodes: readonly ArchiveTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countTree(node.children), 0)
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Two-step confirm button: first click arms, second click runs. */
function ConfirmButton(props: {
  readonly t: DeskTranslator
  readonly label: string
  readonly confirmLabel: string
  readonly armed: boolean
  readonly danger?: boolean
  readonly disabled?: boolean
  readonly onArm: () => void
  readonly onConfirm: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className="dsh-desk-archive-action"
      data-danger={props.danger === true ? 'true' : undefined}
      disabled={props.disabled === true}
      onClick={() => { if (props.armed) props.onConfirm(); else props.onArm() }}
    >
      {props.armed ? props.confirmLabel : props.label}
    </button>
  )
}

/** One-section pagination footer: the host returns the full list, the UI reveals it in pages. */
function LoadMore(props: { readonly more: boolean; readonly label: string; readonly onClick: () => void }): ReactElement | null {
  if (!props.more) return null
  return <button type="button" className="dsh-desk-archive-loadmore" onClick={props.onClick}>{props.label}</button>
}

/** One archived subtree: shared tree row + archive-only actions/confirmation; children recurse. */
function ArchiveTreeNodeRow(props: {
  readonly node: ArchiveTreeNode
  readonly depth: number
  /** Subagent rows are read-only: every operation is parent-scoped, exactly like the old plugin. */
  readonly readOnly: boolean
  readonly t: DeskTranslator
  readonly expanded: Set<string>
  readonly armedTrash: Set<string>
  readonly deleteDraft: { readonly id: string; readonly text: string } | null
  readonly busy: boolean
  readonly onToggleExpand: (id: string) => void
  readonly onOpen: (id: string) => void
  readonly onUnarchive: (id: string) => void
  readonly onArmTrash: (id: string) => void
  readonly onConfirmTrash: (id: string) => void
  readonly onArmDelete: (id: string) => void
  readonly onDeleteDraft: (id: string, text: string) => void
  readonly onConfirmDelete: (node: ArchiveTreeNode) => void
}): ReactElement {
  const { node, depth, t, readOnly, expanded, armedTrash, deleteDraft, busy } = props
  const hasChildren = node.children.length > 0
  const open = expanded.has(node.sessionId)
  const deleteArmed = deleteDraft?.id === node.sessionId
  // Archived rows always require the exact title: the host only waives confirmation for blank
  // stray sessions, never for anything reached through the archived tree.
  const canDelete = deleteArmed && deleteDraft !== null
    && deleteDraft.text.trim() === node.title.trim() && node.title.trim() !== ''
  const badges = (
    <>
      {hasChildren ? <span className="dsh-desk-archive-badge">{node.children.length}</span> : null}
      {node.orphan ? <span className="dsh-desk-archive-badge">{t('sessions.archive.orphan')}</span> : null}
      {!node.backendSupported ? <span className="dsh-desk-archive-badge">{t('sessions.archive.unsupported')}</span> : null}
    </>
  )
  const meta = (
    <>
      {node.turns === undefined ? '' : `${node.turns} ${t('sessions.archive.turns')}`}
      {node.sizeBytes === undefined ? '' : ` · ${Math.max(1, Math.round(node.sizeBytes / 1024))} KB`}
      {` · ${formatDate(node.updatedAt)}`}
    </>
  )
  const actions = readOnly ? undefined : (
    <>
      <button type="button" className="dsh-desk-archive-action" disabled={busy} onClick={() => props.onUnarchive(node.sessionId)}>{t('sessions.archive.unarchive')}</button>
      <ConfirmButton
        t={t}
        label={t('sessions.archive.toTrash')}
        confirmLabel={t('sessions.archive.toTrashConfirm')}
        armed={armedTrash.has(node.sessionId)}
        disabled={busy || !node.backendSupported}
        onArm={() => props.onArmTrash(node.sessionId)}
        onConfirm={() => props.onConfirmTrash(node.sessionId)}
      />
      <ConfirmButton
        t={t}
        label={t('sessions.archive.delete')}
        confirmLabel={deleteArmed ? t('sessions.archive.deleteConfirm') : t('sessions.archive.delete')}
        armed={deleteArmed}
        danger
        disabled={busy || !node.backendSupported}
        onArm={() => props.onArmDelete(node.sessionId)}
        onConfirm={() => props.onConfirmDelete(node)}
      />
    </>
  )
  return (
    <li>
      <SessionTreeRow
        variant="archive"
        title={node.title}
        depth={depth}
        live={node.live}
        disabled={readOnly}
        onOpen={() => props.onOpen(node.sessionId)}
        hasChildren={hasChildren}
        expanded={open}
        onToggleExpand={() => props.onToggleExpand(node.sessionId)}
        expandLabel={t('sessions.archive.expand')}
        collapseLabel={t('sessions.archive.collapse')}
        liveHint={t('sessions.archive.liveHint')}
        badges={badges}
        meta={meta}
        {...(actions === undefined ? {} : { actions })}
      />
      {deleteArmed ? (
        <div className="dsh-desk-archive-deletebox" style={{ marginLeft: `calc(12px + ${depth} * 16px)` }}>
          <input
            className="dsh-desk-archive-input"
            value={deleteDraft?.text ?? ''}
            placeholder={t('sessions.archive.deletePlaceholder')}
            onChange={event => props.onDeleteDraft(node.sessionId, event.target.value)}
          />
          <button
            type="button"
            className="dsh-desk-archive-action"
            data-danger="true"
            disabled={!canDelete || busy}
            onClick={() => props.onConfirmDelete(node)}
          >{t('sessions.archive.deleteConfirm')}</button>
        </div>
      ) : null}
      {hasChildren && open ? (
        <ul className="dsh-desk-archive-list">
          {node.children.map(child => (
            <ArchiveTreeNodeRow
              key={child.sessionId}
              node={child}
              depth={depth + 1}
              readOnly
              t={t}
              expanded={expanded}
              armedTrash={armedTrash}
              deleteDraft={deleteDraft}
              busy={busy}
              onToggleExpand={props.onToggleExpand}
              onOpen={props.onOpen}
              onUnarchive={props.onUnarchive}
              onArmTrash={props.onArmTrash}
              onConfirmTrash={props.onConfirmTrash}
              onArmDelete={props.onArmDelete}
              onDeleteDraft={props.onDeleteDraft}
              onConfirmDelete={props.onConfirmDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
export function ArchiveSections({ t, api, onOpen }: ArchiveSectionsProps): ReactElement {
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [armedTrash, setArmedTrash] = useState<Set<string>>(new Set())
  const [deleteDraft, setDeleteDraft] = useState<{ id: string; text: string } | null>(null)
  const [armedTrashDelete, setArmedTrashDelete] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<null | 'restoreAll' | 'deleteAll'>(null)
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState({ archived: SESSION_STREAM_PAGE_SIZE, strays: SESSION_STREAM_PAGE_SIZE, trash: SESSION_STREAM_PAGE_SIZE })

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [tree, strays, trash, trashDir] = await Promise.all([
        api.list(), api.strays(), api.trash(), api.trashDir(),
      ])
      setSnapshot({ tree, strays, trash, trashDir })
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void reload() }, [reload])

  const run = useCallback(async (task: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await task()
      await reload()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    } finally {
      setBusy(false)
      setArmedTrash(new Set())
      setDeleteDraft(null)
      setArmedTrashDelete(new Set())
      setBulk(null)
    }
  }, [reload])

  const archivedCount = useMemo(() => countTree(snapshot?.tree ?? []), [snapshot?.tree])
  const strays = snapshot?.strays ?? []
  const trash = snapshot?.trash ?? []

  const copyTrashPath = async (): Promise<void> => {
    const display = snapshot?.trashDir?.displayPath ?? ''
    try {
      await navigator.clipboard.writeText(display)
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 2000)
    } catch {
      setCopied(false)
    }
  }

  const onConfirmDelete = (node: ArchiveTreeNode): void => {
    void run(() => api.deleteSession({ sessionId: node.sessionId, confirmTitle: deleteDraft?.text }))
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
        {loading ? <p className="dsh-desk-wall-hint">{t('state.loading')}</p> : archivedCount === 0 ? (
          <p className="dsh-desk-wall-hint">{t('sessions.archivedEmpty')}</p>
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
                  deleteDraft={deleteDraft}
                  busy={busy}
                  onToggleExpand={(id) => setExpanded(previous => {
                    const next = new Set(previous)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })}
                  onOpen={onOpen}
                  onUnarchive={(id) => { void run(() => api.unarchive(id)) }}
                  onArmTrash={(id) => setArmedTrash(new Set([id]))}
                  onConfirmTrash={(id) => { void run(() => api.moveToTrash(id)) }}
                  onArmDelete={(id) => setDeleteDraft({ id, text: '' })}
                  onDeleteDraft={(id, text) => setDeleteDraft({ id, text })}
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
                    meta={`${formatDate(item.createdAt)}${item.backendSupported ? '' : ` · ${t('sessions.archive.unsupported')}`}`}
                    expandLabel={t('sessions.archive.expand')}
                    collapseLabel={t('sessions.archive.collapse')}
                    actions={(
                      <>
                        <button type="button" className="dsh-desk-archive-action" disabled={busy} onClick={() => { void run(() => api.archive(item.sessionId)) }}>{t('sessions.archive.archive')}</button>
                        <ConfirmButton
                          t={t}
                          label={t('sessions.archive.toTrash')}
                          confirmLabel={t('sessions.archive.toTrashConfirm')}
                          armed={armedTrash.has(item.sessionId)}
                          disabled={busy || !item.backendSupported}
                          onArm={() => setArmedTrash(new Set([item.sessionId]))}
                          onConfirm={() => { void run(() => api.moveToTrash(item.sessionId)) }}
                        />
                        <ConfirmButton
                          t={t}
                          label={t('sessions.archive.delete')}
                          confirmLabel={t('sessions.archive.deleteConfirm')}
                          armed={deleteDraft?.id === item.sessionId}
                          danger
                          disabled={busy || !item.backendSupported}
                          onArm={() => setDeleteDraft({ id: item.sessionId, text: '' })}
                          onConfirm={() => {
                            const confirmTitle = deleteDraft?.text
                            void run(() => api.deleteSession(
                              item.blank
                                ? { sessionId: item.sessionId, confirm: true }
                                : { sessionId: item.sessionId, confirmTitle },
                            ))
                          }}
                        />
                      </>
                    )}
                  />
                  {deleteDraft?.id === item.sessionId ? (
                    <div className="dsh-desk-archive-deletebox">
                      {item.blank ? <span className="dsh-desk-archive-note">{t('sessions.archive.blankDeleteNote')}</span> : (
                        <input
                          className="dsh-desk-archive-input"
                          value={deleteDraft.text}
                          placeholder={t('sessions.archive.deletePlaceholder')}
                          onChange={event => setDeleteDraft({ id: item.sessionId, text: event.target.value })}
                        />
                      )}
                    </div>
                  ) : null}
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
              t={t}
              label={t('sessions.archive.restoreAll')}
              confirmLabel={t('sessions.archive.restoreAllConfirm')}
              armed={bulk === 'restoreAll'}
              disabled={busy || trash.length === 0}
              onArm={() => setBulk('restoreAll')}
              onConfirm={() => { void run(() => api.restoreAll()) }}
            />
            <ConfirmButton
              t={t}
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
          <button type="button" className="dsh-desk-archive-trashdir" onClick={() => { void copyTrashPath() }} title={t('sessions.archive.copyPath')}>
            {copied ? t('sessions.archive.copied') : snapshot.trashDir.displayPath}
          </button>
        )}
        {trash.length === 0 ? <p className="dsh-desk-wall-hint">{t('sessions.archive.trashEmpty')}</p> : (
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
                          ? <span className="dsh-desk-archive-badge">{entry.subagents.length} {t('sessions.archive.subagents')}</span>
                          : null}
                      </>
                    )}
                    meta={formatDate(Date.parse(entry.archivedAt))}
                    actions={(
                      <>
                        {entry.legacy ? null : (
                          <button type="button" className="dsh-desk-archive-action" disabled={busy} onClick={() => { void run(() => api.restore(entry.trashId)) }}>{t('sessions.archive.restore')}</button>
                        )}
                        <ConfirmButton
                          t={t}
                          label={t('sessions.archive.delete')}
                          confirmLabel={t('sessions.archive.deleteConfirm')}
                          armed={armedTrashDelete.has(entry.trashId)}
                          danger
                          disabled={busy}
                          onArm={() => setArmedTrashDelete(new Set([entry.trashId]))}
                          onConfirm={() => { void run(() => api.deleteTrashEntry(entry.trashId)) }}
                        />
                      </>
                    )}
                  />
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
