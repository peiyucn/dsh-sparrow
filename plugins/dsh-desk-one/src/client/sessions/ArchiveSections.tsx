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
} from '../../session-admin.js'
import type { DeskTranslator } from '../app/types.js'
import { LoadMore } from '../app/SubPageHeader.js'
import type { SessionsArchiveApi } from './archiveApi.js'
import { formatTokens } from '../app/utils.js'
import { ConfirmButton } from './ConfirmButton.js'
import { FillTitleButton } from './FillTitleButton.js'
import { SessionRowAction } from './SessionRowAction.js'
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
      {hasChildren ? <span className="dsh-desk-archive-badge">{t('sessions.childCount', { count: node.children.length })}</span> : null}
      {node.orphan ? <span className="dsh-desk-archive-badge">{t('sessions.archive.orphan')}</span> : null}
      {!node.backendSupported ? <span className="dsh-desk-archive-badge">{t('sessions.archive.unsupported')}</span> : null}
    </>
  )
  const meta = (
    <>
      {node.turns === undefined ? '' : `${node.turns} ${t('sessions.archive.turns')}`}
      {node.tokens === undefined ? '' : ` · ${formatTokens(node.tokens)}`}
      {node.sizeBytes === undefined ? '' : ` · ${Math.max(1, Math.round(node.sizeBytes / 1024))} KB`}
      {` · ${formatDate(node.updatedAt)}`}
    </>
  )
  const actions = readOnly || depth > 0 ? undefined : (
    <>
      <SessionRowAction kind="unarchive" label={t('sessions.archive.unarchive')} disabled={busy} onClick={() => props.onUnarchive(node.sessionId)} />
      <SessionRowAction
        kind="trash"
        label={t('sessions.archive.toTrash')}
        armed={armedTrash.has(node.sessionId)}
        disabled={busy || !node.backendSupported}
        onClick={() => {
          if (armedTrash.has(node.sessionId)) props.onConfirmTrash(node.sessionId)
          else props.onArmTrash(node.sessionId)
        }}
      />
      <SessionRowAction
        kind="delete"
        label={deleteArmed ? t('sessions.archive.deleteConfirm') : t('sessions.archive.delete')}
        armed={deleteArmed}
        danger
        disabled={busy || !node.backendSupported}
        onClick={() => {
          if (deleteArmed) props.onConfirmDelete(node)
          else props.onArmDelete(node.sessionId)
        }}
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
          <FillTitleButton
            title={node.title}
            label={props.t('today.copyTitle')}
            onFill={() => props.onDeleteDraft(node.sessionId, node.title)}
          />
          <input
            className="dsh-desk-archive-input"
            value={deleteDraft?.text ?? ''}
            placeholder={props.t('sessions.archive.deletePlaceholder')}
            onChange={event => props.onDeleteDraft(node.sessionId, event.target.value)}
          />
          <button
            type="button"
            className="dsh-desk-archive-action"
            data-danger="true"
            disabled={!canDelete || busy}
            onClick={() => props.onConfirmDelete(node)}
          >{props.t('sessions.archive.deleteConfirm')}</button>
        </div>
      ) : null}
      {hasChildren && open ? (
        <ul className="dsh-desk-archive-list dsh-desk-tree-children">
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
/** Trash subagents keep their parent-child display; actions stay on the parent entry. */
function TrashSubagentRows(props: {
  readonly t: DeskTranslator
  readonly parentId: string
  readonly subagents: readonly { readonly sessionId: string; readonly title: string; readonly parentSessionId?: string }[]
  readonly depth: number
}): ReactElement | null {
  const children = props.subagents.filter(child => (child.parentSessionId ?? props.parentId) === props.parentId)
  if (children.length === 0) return null
  return (
    <ul className="dsh-desk-archive-list dsh-desk-tree-children">
      {children.map(child => (
        <li key={child.sessionId}>
          <SessionTreeRow
            variant="archive"
            title={child.title}
            depth={props.depth}
            subagent
            tag={props.t('sessions.subagent')}
            disabled
            expandLabel={props.t('sessions.archive.expand')}
            collapseLabel={props.t('sessions.archive.collapse')}
          />
          <TrashSubagentRows t={props.t} parentId={child.sessionId} subagents={props.subagents} depth={props.depth + 1} />
        </li>
      ))}
    </ul>
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
  const [expandedTrash, setExpandedTrash] = useState<Set<string>>(new Set())

  const reload = useCallback(async (quiet = false): Promise<void> => {
    try {
      const [tree, strays, trash, trashDir] = await Promise.all([
        api.list(), api.strays(), api.trash(), api.trashDir(),
      ])
      setSnapshot({ tree, strays, trash, trashDir })
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [api])

  useEffect(() => { void reload() }, [reload])

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

  /** Remove a subtree by root id from the archived tree, keeping descendants out too. */
  const dropFromTree = (id: string) => (current: ArchiveSnapshot): ArchiveSnapshot => ({
    ...current,
    tree: current.tree.filter(node => node.sessionId !== id),
  })

  const onConfirmDelete = (node: ArchiveTreeNode): void => {
    void run(
      () => api.deleteSession({ sessionId: node.sessionId, confirmTitle: deleteDraft?.text }),
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
                  onUnarchive={(id) => { void run(() => api.unarchive(id), dropFromTree(id)) }}
                  onArmTrash={(id) => setArmedTrash(new Set([id]))}
                  onConfirmTrash={(id) => { void run(() => api.moveToTrash(id), dropFromTree(id)) }}
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
                    meta={[
                      formatDate(item.createdAt),
                      item.turns === undefined ? '' : `${item.turns} ${t('sessions.archive.turns')}`,
                      item.tokens === undefined ? '' : formatTokens(item.tokens),
                      item.backendSupported ? '' : t('sessions.archive.unsupported'),
                    ].filter(Boolean).join(' · ')}
                    expandLabel={t('sessions.archive.expand')}
                    collapseLabel={t('sessions.archive.collapse')}
                    actions={(
                      <>
                        <SessionRowAction kind="archive" label={t('sessions.archive.archive')} disabled={busy} onClick={() => { void run(() => api.archive(item.sessionId), current => ({ ...current, strays: current.strays.filter(row => row.sessionId !== item.sessionId) })) }} />
                        <SessionRowAction
                          kind="trash"
                          label={t('sessions.archive.toTrash')}
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
                          armed={deleteDraft?.id === item.sessionId}
                          danger
                          disabled={busy || !item.backendSupported}
                          onClick={() => {
                            if (deleteDraft?.id !== item.sessionId) { setDeleteDraft({ id: item.sessionId, text: '' }); return }
                            const confirmTitle = deleteDraft.text
                            void run(
                              () => api.deleteSession(
                                item.blank
                                  ? { sessionId: item.sessionId, confirm: true }
                                  : { sessionId: item.sessionId, confirmTitle },
                              ),
                              current => ({ ...current, strays: current.strays.filter(row => row.sessionId !== item.sessionId) }),
                            )
                          }}
                        />
                      </>
                    )}
                  />
                  {deleteDraft?.id === item.sessionId ? (
                    <div className="dsh-desk-archive-deletebox">
                      {item.blank ? <span className="dsh-desk-archive-note">{t('sessions.archive.blankDeleteNote')}</span> : (
                         <>
                           <FillTitleButton
                             title={item.title}
                             label={t('today.copyTitle')}
                             onFill={() => setDeleteDraft({ id: item.sessionId, text: item.title })}
                           />
                           <input
                             className="dsh-desk-archive-input"
                             value={deleteDraft.text}
                             placeholder={t('sessions.archive.deletePlaceholder')}
                             onChange={event => setDeleteDraft({ id: item.sessionId, text: event.target.value })}
                           />
                         </>
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
                          ? <span className="dsh-desk-archive-badge">{t('sessions.childCount', { count: entry.subagents.length })}</span>
                          : null}
                      </>
                    )}
                    meta={formatDate(Date.parse(entry.archivedAt))}
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
                        {entry.legacy ? null : (
                          <SessionRowAction kind="restore" label={t('sessions.archive.restore')} disabled={busy} onClick={() => { void run(() => api.restore(entry.trashId), current => ({ ...current, trash: current.trash.filter(row => row.trashId !== entry.trashId) })) }} />
                        )}
                        <SessionRowAction
                          kind="delete"
                          label={t('sessions.archive.delete')}
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