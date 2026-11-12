/**
 * Notebook page: a thin management surface for a linked note workspace.
 *
 * Browsing is delegated to the official right-sidebar file browser (opened by default in a
 * session of the linked workspace); this page only creates notes, searches the library, and
 * manages submitted / unsubmitted review records.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotebookEntry, NotebookStateResponse, ReviewHistoryEntry } from '../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../constants.js'
import type { NotebookApi } from './api.js'
import type { ReviewOpenInput, ReviewOpenResult } from './review-bridge.js'
import type { WorkspaceAccess } from './workspaces.js'
import { findWorkspaceForRoot } from './workspaces.js'

/** Which list the page shows under the actions. */
type Panel = 'search' | 'drafts' | 'history'

/** One page row in search / draft lists. */
function PageRow(props: {
  readonly t: DeskTranslator
  readonly path: string
  readonly title: string
  readonly draftCount?: number
  /** Frontmatter is missing: flag it so the row still tells the user. */
  readonly missing?: boolean
  readonly onOpen: () => void
}): ReactElement {
  const { t, path, title, draftCount, missing, onOpen } = props
  return (
    <button type="button" className="dsh-desk-notebook-page" onClick={onOpen} title={path}>
      <span className="dsh-desk-notebook-page-title">{title}</span>
      <span className="dsh-desk-notebook-page-path">{path}</span>
      {missing === true ? <span className="dsh-desk-notebook-badge">{t('notebook.missingBadge')}</span> : null}
      {draftCount === undefined || draftCount === 0 ? null : <span className="dsh-desk-notebook-badge">{t('notebook.draftBadge', { count: draftCount })}</span>}
    </button>
  )
}

/** Notebook management view. */
export function NotebookView(props: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly onOpenReview: (input: ReviewOpenInput) => Promise<ReviewOpenResult>
  readonly onOpenBrowser: (workspaceId: string) => Promise<ReviewOpenResult>
  readonly onDraftWithAi: (workspaceId: string, prompt: string) => void
}): ReactElement {
  const { t, notebook, workspaceAccess, onOpenReview, onOpenBrowser, onDraftWithAi } = props

  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly NotebookEntry[] | null>(null)
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [browserOpen, setBrowserOpen] = useState<'pending' | 'opened' | 'failed' | null>(null)
  /** The official browser opens once per page mount, not on every re-render. */
  const browserTried = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setState(await notebook.state())
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook])

  useEffect(() => { void load() }, [load])

  const rootPath = state?.config?.rootPath
  const workspaces = workspaceAccess.list()
  const workspace = rootPath === undefined ? undefined : findWorkspaceForRoot(workspaces, rootPath)

  /** Default action: open the official file browser in a session of the library workspace. */
  const openBrowser = useCallback(async (): Promise<void> => {
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    setBrowserOpen('pending')
    try {
      const result = await onOpenBrowser(workspace.workspaceId)
      setBrowserOpen(result.ok ? 'opened' : 'failed')
      if (!result.ok) setNotice(result.message ?? t('review.openFailed'))
    } catch (cause) {
      setBrowserOpen('failed')
      setNotice(messageOf(cause))
    }
  }, [onOpenBrowser, t, workspace])

  useEffect(() => {
    if (browserTried.current || rootPath === undefined || workspace === undefined) return
    browserTried.current = true
    void openBrowser()
  }, [openBrowser, rootPath, workspace])

  // Search is a flat library query; clearing returns to the management view.
  useEffect(() => {
    if (query.trim() === '') { setResults(null); return }
    setPanel('search')
    let cancelled = false
    const timer = setTimeout(() => {
      void notebook.search({ query, limit: 200 }).then(payload => {
        if (!cancelled) setResults(payload.entries)
      }, cause => {
        if (!cancelled) setError(messageOf(cause))
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [notebook, query])

  useEffect(() => {
    if (panel !== 'history') return
    void notebook.history().then(payload => setHistory(payload.entries), cause => setError(messageOf(cause)))
  }, [notebook, panel])

  const chooseRoot = useCallback(async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(path))
      setChoosing(false)
      browserTried.current = false
      setBrowserOpen(null)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const pickNewWorkspace = useCallback(async (): Promise<void> => {
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
      setPanel(null)
      setQuery('')
      setBrowserOpen(null)
      browserTried.current = false
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const openPage = useCallback(async (path: string): Promise<void> => {
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    setBusy(true)
    try {
      const { file } = await notebook.ensureFile(path)
      const result = await onOpenReview({ path, fileId: file.id, workspaceId: workspace.workspaceId })
      if (!result.ok) setNotice(result.message ?? t('review.openFailed'))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, onOpenReview, t, workspace])

  const createEmpty = useCallback(async (): Promise<void> => {
    if (newTitle.trim() === '') return
    setBusy(true)
    try {
      const created = await notebook.createNote({ title: newTitle.trim() })
      setNewOpen(false)
      setNewTitle('')
      await load()
      setNotice(t('notebook.created'))
      void openPage(created.path)
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [load, newTitle, notebook, openPage, t])

  const draftWithAi = useCallback((): void => {
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    const title = newTitle.trim()
    onDraftWithAi(
      workspace.workspaceId,
      state?.note2md === true ? t('notebook.note2mdPrompt', { title }) : t('notebook.draftPrompt', { title }),
    )
    setNewOpen(false)
    setNewTitle('')
  }, [newTitle, onDraftWithAi, state?.note2md, t, workspace])

  const deleteHistory = useCallback(async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await notebook.deleteHistory(id)
      setHistory(entries => entries?.filter(entry => entry.record.id !== id) ?? null)
      await load()
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [load, notebook])

  const drafts = useMemo(() => state?.drafts ?? [], [state?.drafts])
  const historyBytes = state?.historyBytes ?? 0
  const historyWarn = historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES

  return (
    <div className="dsh-desk-notebookview">
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-notebook-hint">{notice}</p>}
      {rootPath === undefined
        ? (
            <div className="dsh-desk-notebook-center">
              <div className="dsh-desk-notebook-center-card">
                <h3>{t('notebook.welcomeTitle')}</h3>
                <p>{t('notebook.welcomeBody')}</p>
                <div className="dsh-desk-notebook-center-actions">
                  <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={busy} onClick={() => setChoosing(current => !current)}>
                    {t('notebook.linkWorkspace')}
                  </button>
                  <button type="button" className="dsh-desk-action" disabled={busy} onClick={() => { void pickNewWorkspace() }}>
                    {t('notebook.createWorkspace')}
                  </button>
                </div>
                {choosing
                  ? (
                      <div className="dsh-desk-notebook-center-list">
                        {workspaces.length === 0
                          ? <p className="dsh-desk-notebook-hint">{t('notebook.noWorkspace')}</p>
                          : workspaces.map(item => (
                              <button key={item.workspaceId} type="button" className="dsh-desk-notebook-pickeritem" disabled={busy} onClick={() => { void chooseRoot(item.path) }}>
                                <span>{item.title}</span>
                                <span className="dsh-desk-notebook-page-path">{item.path}</span>
                              </button>
                            ))}
                      </div>
                    )
                  : null}
                <p className="dsh-desk-notebook-fineprint">{t('notebook.workspaceHint')}</p>
              </div>
            </div>
          )
        : (
            <>
              <section className="dsh-desk-notebook-hero">
                <div className="dsh-desk-notebook-hero-main">
                  <button
                    type="button"
                    className="dsh-desk-action dsh-desk-action-primary dsh-desk-notebook-newbutton"
                    disabled={busy}
                    onClick={() => setNewOpen(current => !current)}
                  >
                    {t('notebook.new')}
                  </button>
                  <div className="dsh-desk-notebook-hero-copy">
                    <h3>{t('notebook.heroTitle')}</h3>
                    <p>{t('notebook.heroBody')}</p>
                  </div>
                  <button type="button" className="dsh-desk-action" disabled={busy || browserOpen === 'pending'} onClick={() => { void openBrowser() }}>
                    {browserOpen === 'pending' ? t('notebook.browserOpening') : t('notebook.openBrowser')}
                  </button>
                </div>
                <input
                  className="dsh-desk-notebook-searchengine"
                  value={query}
                  placeholder={t('notebook.searchPlaceholder')}
                  onChange={event => setQuery(event.target.value)}
                />
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
                          <button type="button" className="dsh-desk-btn" disabled={newTitle.trim() === '' || workspace === undefined} onClick={draftWithAi}>
                            {state?.note2md === true ? t('notebook.note2mdNew') : t('notebook.aiDraft')}
                          </button>
                        </div>
                        {newTitle.trim() === '' ? <p className="dsh-desk-notebook-fineprint">{t('notebook.newHint')}</p> : null}
                      </div>
                    )
                  : null}
              </section>

              <div className="dsh-desk-notebook-panelbar">
                <button type="button" className="dsh-desk-notebook-paneltab" data-active={panel === 'drafts' || undefined} onClick={() => setPanel(current => current === 'drafts' ? null : 'drafts')}>
                  {t('notebook.entryDrafts', { count: state?.draftCount ?? 0 })}
                </button>
                <button type="button" className="dsh-desk-notebook-paneltab" data-active={panel === 'history' || undefined} onClick={() => setPanel(current => current === 'history' ? null : 'history')}>
                  {t('notebook.entryHistory', { count: state?.historyCount ?? 0 })}
                </button>
                <span className="dsh-desk-notebook-fineprint dsh-desk-notebook-panelhint">
                  {browserOpen === 'opened' ? t('notebook.browserOpened') : browserOpen === 'failed' ? t('notebook.browserFailed') : t('notebook.browserHint')}
                </span>
                <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => { void disconnect() }}>{t('notebook.disconnect')}</button>
              </div>

              {panel === 'search'
                ? (
                    <div className="dsh-desk-notebook-pages">
                      {results === null
                        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
                        : results.length === 0
                          ? <p className="dsh-desk-notebook-hint">{t('notebook.searchEmpty')}</p>
                          : results.map(entry => (
                              <PageRow
                                key={entry.path}
                                t={t}
                                path={entry.path}
                                title={entry.title}
                                missing={!entry.hasFrontmatter}
                                draftCount={state?.drafts.find(draft => draft.path === entry.path)?.drafts.length}
                                onOpen={() => { void openPage(entry.path) }}
                              />
                            ))}
                    </div>
                  )
                : null}
              {panel === 'drafts'
                ? (
                    <div className="dsh-desk-notebook-pages">
                      {drafts.length === 0
                        ? <p className="dsh-desk-notebook-hint">{t('notebook.draftsEmpty')}</p>
                        : drafts.map(draft => (
                            <PageRow
                              key={draft.id}
                              t={t}
                              path={draft.path}
                              title={draft.path.split('/').pop() ?? draft.path}
                              draftCount={draft.drafts.length}
                              onOpen={() => { void openPage(draft.path) }}
                            />
                          ))}
                    </div>
                  )
                : null}
              {panel === 'history'
                ? (
                    <div className="dsh-desk-notebook-history">
                      <div className="dsh-desk-notebook-meters">
                        <span className={historyWarn ? 'dsh-desk-notebook-meter dsh-desk-notebook-meter-warn' : 'dsh-desk-notebook-meter'}>
                          {t('notebook.historyUsage', { size: (historyBytes / 1024).toFixed(1) })}
                        </span>
                      </div>
                      {history === null
                        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
                        : history.length === 0
                          ? <p className="dsh-desk-notebook-hint">{t('notebook.historyEmpty')}</p>
                          : history.map(entry => (
                              <div className="dsh-desk-notebook-historyrow" key={entry.record.id}>
                                <div className="dsh-desk-notebook-historymain">
                                  <span className="dsh-desk-notebook-page-title">{entry.record.fileTitle}</span>
                                  <span className="dsh-desk-notebook-page-path">{entry.resolvedPath ?? entry.record.pathSnapshot}</span>
                                  <span className="dsh-desk-notebook-badge">{t('notebook.historyCount', { count: entry.record.annotations.length })}</span>
                                  <span className="dsh-desk-notebook-badge">
                                    {entry.status === 'linked' ? t('notebook.linkLinked') : entry.status === 'moved' ? t('notebook.linkMoved') : t('notebook.linkDetached')}
                                  </span>
                                  <span className="dsh-desk-notebook-page-date">{new Date(entry.record.createdAt).toLocaleString()}</span>
                                </div>
                                <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => { void deleteHistory(entry.record.id) }}>
                                  {t('review.delete')}
                                </button>
                              </div>
                            ))}
                    </div>
                  )
                : null}
            </>
          )}
    </div>
  )
}
