/**
 * Notebook page: the library list, its root setting, new-note entry, drafts and review history.
 *
 * The panel only browses and hands a page to the review tab (or the conversation); it never
 * edits files. Choosing a library reuses DSH's own workspace flow, so the AI can always edit
 * inside it.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotebookEntry, NotebookStateResponse, ReviewHistoryEntry } from '../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../constants.js'
import type { NotebookApi } from './api.js'
import type { ReviewOpenInput, ReviewOpenResult } from './review-bridge.js'
import type { WorkspaceAccess, WorkspacePathView } from './workspaces.js'

type Filter = 'all' | 'drafts' | 'history' | 'missing' | 'empty'

/** Find the workspace that owns the library root. */
function workspaceFor(workspaces: readonly WorkspacePathView[], rootPath: string): WorkspacePathView | undefined {
  const normalized = rootPath.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
  return workspaces.find((workspace) => {
    const path = workspace.path.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
    return normalized === path || normalized.startsWith(`${path}/`)
  })
}

/** One list row: title, path, badges, and the review entry. */
function NotebookRow(props: {
  readonly t: DeskTranslator
  readonly entry: NotebookEntry
  readonly draftCount: number
  readonly onOpen: () => void
}): ReactElement {
  const { t, entry, draftCount, onOpen } = props
  return (
    <div className="dsh-desk-notebook-row" role="listitem">
      <button type="button" className="dsh-desk-notebook-open" onClick={onOpen} title={t('notebook.review')}>
        <span className="dsh-desk-notebook-row-title">{entry.title}</span>
        <span className="dsh-desk-notebook-row-path">{entry.path}</span>
        {entry.hasFrontmatter ? null : <span className="dsh-desk-notebook-badge">{t('notebook.missingBadge')}</span>}
        {draftCount === 0 ? null : <span className="dsh-desk-notebook-badge">{t('notebook.draftBadge', { count: draftCount })}</span>}
        {entry.date === undefined ? null : <span className="dsh-desk-notebook-row-date">{entry.date}</span>}
      </button>
      <span className="dsh-desk-notebook-tags">
        {entry.tags.slice(0, 3).map(tag => <span key={tag} className="dsh-desk-notebook-tag">{tag}</span>)}
      </span>
    </div>
  )
}

/** Notebook library view. */
export function NotebookView(props: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly onOpenReview: (input: ReviewOpenInput) => Promise<ReviewOpenResult>
  readonly onDraftWithAi: (workspaceId: string, prompt: string) => void
}): ReactElement {
  const { t, notebook, workspaceAccess, onOpenReview, onDraftWithAi } = props
  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [entries, setEntries] = useState<readonly NotebookEntry[] | null>(null)
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setState(await notebook.state())
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const narrowed = query.trim() !== '' || filter === 'missing' || filter === 'empty'
    if (!narrowed) { setEntries(null); return }
    let cancelled = false
    void notebook.search({
      ...query.trim() === '' ? {} : { query },
      missingFrontmatter: filter === 'missing',
      emptyBody: filter === 'empty',
      limit: 200,
    }).then(payload => {
      if (!cancelled) setEntries(payload.entries)
    }, cause => {
      if (!cancelled) setError(messageOf(cause))
    })
    return () => { cancelled = true }
  }, [filter, notebook, query])

  useEffect(() => {
    if (filter !== 'history') { setHistory(null); return }
    let cancelled = false
    void notebook.history().then(payload => {
      if (!cancelled) setHistory(payload.entries)
    }, cause => {
      if (!cancelled) setError(messageOf(cause))
    })
    return () => { cancelled = true }
  }, [filter, notebook])

  const chooseRoot = useCallback(async (rootPath: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(rootPath))
      setPicking(false)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const pickNewFolder = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const created = await workspaceAccess.createFromPicker()
      if (created !== null) await chooseRoot(created.path)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [chooseRoot, workspaceAccess])

  const disconnect = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setState(await notebook.clearRoot())
      setFilter('all')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const rootPath = state?.config?.rootPath
  const workspaces = workspaceAccess.list()
  const workspace = rootPath === undefined ? undefined : workspaceFor(workspaces, rootPath)

  const openReview = useCallback(async (entry: NotebookEntry): Promise<void> => {
    if (rootPath === undefined) return
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    setBusy(true)
    try {
      const { file } = await notebook.ensureFile(entry.path)
      const result = await onOpenReview({ path: entry.path, fileId: file.id, workspaceId: workspace.workspaceId })
      if (!result.ok) setNotice(result.message ?? t('review.openFailed'))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, onOpenReview, rootPath, t, workspace])

  const createEmpty = useCallback(async (): Promise<void> => {
    if (newTitle.trim() === '') return
    setBusy(true)
    try {
      await notebook.createNote({ title: newTitle.trim() })
      setNewOpen(false)
      setNewTitle('')
      await load()
      setNotice(t('notebook.created'))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [load, newTitle, notebook, t])

  const draftWithAi = useCallback((): void => {
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    const title = newTitle.trim()
    const prompt = state?.note2md === true
      ? t('notebook.note2mdPrompt', { title })
      : t('notebook.draftPrompt', { title })
    onDraftWithAi(workspace.workspaceId, prompt)
    setNewOpen(false)
    setNewTitle('')
  }, [newTitle, onDraftWithAi, state?.note2md, t, workspace])

  const deleteHistory = useCallback(async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await notebook.deleteHistory(id)
      setHistory(entriesNow => entriesNow?.filter(entry => entry.record.id !== id) ?? null)
      await load()
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [load, notebook])

  const draftCounts = new Map<string, number>()
  for (const draft of state?.drafts ?? []) draftCounts.set(draft.path, draft.drafts.length)

  const rows = entries ?? state?.recent ?? []
  const historyBytes = state?.historyBytes ?? 0
  const historyWarn = historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES
  const draftFiles = state?.drafts ?? []
  const visibleRows = filter === 'drafts'
    ? rows.filter(entry => draftCounts.has(entry.path))
    : rows

  return (
    <div className="dsh-desk-notebookview">
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-notebook-hint">{notice}</p>}
      {rootPath === undefined
        ? (
            <div className="dsh-desk-notebook-empty">
              <h3>{t('notebook.unsetTitle')}</h3>
              <p>{t('notebook.unsetBody')}</p>
              <div className="dsh-desk-notebook-actions">
                <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={busy} onClick={() => setPicking(current => !current)}>
                  {t('notebook.pick')}
                </button>
              </div>
              {picking
                ? (
                    <div className="dsh-desk-notebook-picker">
                      {workspaces.length === 0
                        ? <p className="dsh-desk-notebook-hint">{t('notebook.noWorkspace')}</p>
                        : workspaces.map(item => (
                            <button
                              key={item.workspaceId}
                              type="button"
                              className="dsh-desk-notebook-pickeritem"
                              disabled={busy}
                              onClick={() => { void chooseRoot(item.path) }}
                            >
                              <span>{item.title}</span>
                              <span className="dsh-desk-notebook-row-path">{item.path}</span>
                            </button>
                          ))}
                      <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => { void pickNewFolder() }}>
                        {t('notebook.pickFolder')}
                      </button>
                    </div>
                  )
                : null}
            </div>
          )
        : (
            <>
              <div className="dsh-desk-notebook-toolbar">
                <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={busy} onClick={() => setNewOpen(current => !current)}>
                  {t('notebook.new')}
                </button>
                <input
                  className="dsh-desk-notebook-search"
                  value={query}
                  placeholder={t('notebook.searchPlaceholder')}
                  onChange={event => setQuery(event.target.value)}
                />
                <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => { void disconnect() }}>
                  {t('notebook.disconnect')}
                </button>
              </div>
              {newOpen
                ? (
                    <div className="dsh-desk-notebook-new">
                      <input
                        className="dsh-desk-notebook-search"
                        value={newTitle}
                        placeholder={t('notebook.newTitlePlaceholder')}
                        onChange={event => setNewTitle(event.target.value)}
                        autoFocus
                      />
                      <div className="dsh-desk-notebook-actions">
                        <button type="button" className="dsh-desk-btn" disabled={busy || newTitle.trim() === ''} onClick={() => { void createEmpty() }}>
                          {t('notebook.createEmpty')}
                        </button>
                        <button type="button" className="dsh-desk-btn" disabled={newTitle.trim() === ''} onClick={draftWithAi}>
                          {state?.note2md === true ? t('notebook.note2mdNew') : t('notebook.aiDraft')}
                        </button>
                      </div>
                    </div>
                  )
                : null}
              <div className="dsh-desk-notebook-stats">
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'all'} onClick={() => setFilter('all')}>
                  {t('notebook.statAll', { count: state?.stats.total ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'drafts'} onClick={() => setFilter('drafts')}>
                  {t('notebook.statDrafts', { count: state?.draftCount ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'history'} onClick={() => setFilter('history')}>
                  {t('notebook.statHistory', { count: state?.historyCount ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'missing'} onClick={() => setFilter('missing')}>
                  {t('notebook.statMissing', { count: state?.stats.missingFrontmatter ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-stat" data-active={filter === 'empty'} onClick={() => setFilter('empty')}>
                  {t('notebook.statEmpty', { count: state?.stats.emptyBody ?? 0 })}
                </button>
                <span className="dsh-desk-notebook-root" title={rootPath}>{rootPath}</span>
              </div>
              {filter === 'history'
                ? (
                    <div className="dsh-desk-notebook-history">
                      <div className="dsh-desk-notebook-meters">
                        <span className={historyWarn ? 'dsh-desk-notebook-meter dsh-desk-notebook-meter-warn' : 'dsh-desk-notebook-meter'}>
                          {t('notebook.historyUsage', { size: (historyBytes / 1024).toFixed(1) })}
                        </span>
                        {workspace === undefined ? <span className="dsh-desk-notebook-meter-warn">{t('notebook.noWorkspaceForRoot')}</span> : null}
                      </div>
                      {history === null
                        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
                        : history.length === 0
                          ? <p className="dsh-desk-notebook-hint">{t('notebook.historyEmpty')}</p>
                          : history.map(entry => (
                              <div className="dsh-desk-notebook-historyrow" key={entry.record.id}>
                                <div className="dsh-desk-notebook-historymain">
                                  <span className="dsh-desk-notebook-row-title">{entry.record.fileTitle}</span>
                                  <span className="dsh-desk-notebook-row-path">{entry.resolvedPath ?? entry.record.pathSnapshot}</span>
                                  <span className="dsh-desk-notebook-badge">{t('notebook.historyCount', { count: entry.record.annotations.length })}</span>
                                  <span className="dsh-desk-notebook-badge">
                                    {entry.status === 'linked' ? t('notebook.linkLinked') : entry.status === 'moved' ? t('notebook.linkMoved') : t('notebook.linkDetached')}
                                  </span>
                                  <span className="dsh-desk-notebook-row-date">{new Date(entry.record.createdAt).toLocaleString()}</span>
                                </div>
                                <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => { void deleteHistory(entry.record.id) }}>
                                  {t('review.delete')}
                                </button>
                              </div>
                            ))}
                    </div>
                  )
                : (
                    <>
                      {filter === 'drafts' && draftFiles.length === 0
                        ? <p className="dsh-desk-notebook-hint">{t('notebook.draftsEmpty')}</p>
                        : null}
                      {visibleRows.length === 0
                        ? <p className="dsh-desk-notebook-hint">{t('notebook.empty')}</p>
                        : (
                            <div className="dsh-desk-notebook-rows" role="list">
                              {visibleRows.map(entry => (
                                <NotebookRow
                                  key={entry.path}
                                  t={t}
                                  entry={entry}
                                  draftCount={draftCounts.get(entry.path) ?? 0}
                                  onOpen={() => { void openReview(entry) }}
                                />
                              ))}
                            </div>
                          )}
                    </>
                  )}
            </>
          )}
    </div>
  )
}
