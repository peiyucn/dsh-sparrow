/**
 * Notebook home page: the management surface of the linked note workspace.
 *
 * Layout follows the official entry-page pattern (title row with the primary action on the
 * right, a toolbar of page-scoped controls, then rows). Controls are official primitives
 * (`Button` / `Input` / `SegmentedTabs` / `Tag`), so the page reads as part of the host rather
 * than as a self-made widget; only layout and the two-line rows are local CSS.
 *
 * Browsing the whole tree is delegated to the official right-sidebar file page, opened
 * explicitly from the title row — the page itself only creates, searches and manages records.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  Button, IconFolderOpenOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular,
  Input, SegmentedTabs, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotebookEntry, NotebookStateResponse, ReviewHistoryEntry } from '../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../constants.js'
import type { NotebookApi } from './api.js'
import type { ReviewOpenInput, ReviewOpenResult } from './review-bridge.js'
import type { WorkspaceAccess } from './workspaces.js'
import { findWorkspaceForRoot } from './workspaces.js'

/** Which record panel the toolbar shows below the title row. */
type Panel = 'recent' | 'drafts' | 'history'

/** One two-line list row: title above, path below, facts on the trailing edge. */
function PageRow(props: {
  readonly t: DeskTranslator
  readonly title: string
  readonly path: string
  readonly date?: string
  readonly draftCount?: number
  readonly reviewedCount?: number
  readonly missing?: boolean
  readonly action?: ReactNode
  readonly onOpen?: () => void
}): ReactElement {
  const { t, title, path, date, draftCount, reviewedCount, missing, action, onOpen } = props
  const body = (
    <>
      <span className="dsh-desk-notebook-rowmain">
        <span className="dsh-desk-notebook-rowtitle">{title}</span>
        <span className="dsh-desk-notebook-rowpath">{path}</span>
      </span>
      <span className="dsh-desk-notebook-rowmeta">
        {missing === true ? <Tag tone="warning">{t('notebook.missingBadge')}</Tag> : null}
        {reviewedCount === undefined || reviewedCount === 0
          ? null
          : <Tag tone="info">{t('notebook.annotationBadge', { count: reviewedCount })}</Tag>}
        {draftCount === undefined || draftCount === 0
          ? null
          : <Tag tone="neutral">{t('notebook.draftBadge', { count: draftCount })}</Tag>}
        {date === undefined ? null : <span className="dsh-desk-notebook-rowdate">{date}</span>}
      </span>
    </>
  )
  return (
    <div className="dsh-desk-notebook-row">
      {onOpen === undefined
        ? <div className="dsh-desk-notebook-rowbody">{body}</div>
        : (
            <button type="button" className="dsh-desk-notebook-rowbody" title={path} onClick={onOpen}>
              {body}
            </button>
          )}
      {action === undefined ? null : <span className="dsh-desk-notebook-rowaction">{action}</span>}
    </div>
  )
}

/** Notebook home view. */
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
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[]>([])
  const [panel, setPanel] = useState<Panel>('recent')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly NotebookEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [browserOpen, setBrowserOpen] = useState<'pending' | 'opened' | 'failed' | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const [next, entries] = await Promise.all([notebook.state(), notebook.history()])
      setState(next)
      setHistory(entries.entries)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook])

  useEffect(() => { void load() }, [load])

  const rootPath = state?.config?.rootPath
  const workspaces = workspaceAccess.list()
  const workspace = rootPath === undefined ? undefined : findWorkspaceForRoot(workspaces, rootPath)

  /** Explicit browse: start a session in the library workspace and open the official file page. */
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

  // Search is a flat library query; clearing returns to the recent shelf.
  useEffect(() => {
    if (query.trim() === '') { setResults(null); return }
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

  const chooseRoot = useCallback(async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(path))
      setChoosing(false)
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
      setPanel('recent')
      setQuery('')
      setBrowserOpen(null)
    } catch (catchValue) {
      setError(messageOf(catchValue))
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
      setHistory(entries => entries.filter(entry => entry.record.id !== id))
      await load()
    } catch (catchValue) {
      setNotice(messageOf(catchValue))
    } finally {
      setBusy(false)
    }
  }, [load, notebook])

  /** Reviewed files (unique), newest review first. */
  const reviewed = useMemo(() => {
    const map = new Map<string, { count: number; lastAt: string }>()
    for (const entry of history) {
      const path = entry.resolvedPath ?? entry.record.pathSnapshot
      const previous = map.get(path)
      map.set(path, {
        count: (previous?.count ?? 0) + entry.record.annotations.length,
        lastAt: previous === undefined || entry.record.createdAt > previous.lastAt ? entry.record.createdAt : previous.lastAt,
      })
    }
    return map
  }, [history])

  const draftCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const draft of state?.drafts ?? []) map.set(draft.path, draft.drafts.length)
    return map
  }, [state?.drafts])

  /** Recent files: reviewed first (by review time), then unreviewed by modification time. */
  const recent = useMemo(() => {
    const rows = (state?.recent ?? []).map(entry => ({
      entry,
      review: reviewed.get(entry.path),
    }))
    return rows.sort((left, right) => {
      if (left.review !== undefined && right.review !== undefined) return right.review.lastAt.localeCompare(left.review.lastAt)
      if (left.review !== undefined) return -1
      if (right.review !== undefined) return 1
      return right.entry.mtime.localeCompare(left.entry.mtime)
    }).map(row => row.entry)
  }, [reviewed, state?.recent])

  const historyBytes = state?.historyBytes ?? 0
  const historyWarn = historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES
  const searching = query.trim() !== ''
  const listRows = searching ? results ?? [] : recent
  const listTitle = searching
    ? t('notebook.searchResults', { count: results?.length ?? 0 })
    : t('notebook.recentHint')

  const libraryMeta = rootPath === undefined
    ? ''
    : t('notebook.libraryLine', { name: workspace?.title ?? t('notebook.unknownWorkspace'), count: state?.stats.total ?? 0 })

  return (
    <div className="dsh-desk-notebookview">
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-notebook-notice">{notice}</p>}
      {rootPath === undefined
        ? (
            <div className="dsh-desk-notebook-center">
              <div className="dsh-desk-notebook-centerinner">
                <h2 className="dsh-desk-notebook-centertitle">{t('notebook.welcomeTitle')}</h2>
                <p className="dsh-desk-notebook-centertext">{t('notebook.welcomeBody')}</p>
                <div className="dsh-desk-notebook-centeractions">
                  <Button variant="primary" size="md" disabled={busy} onClick={() => setChoosing(current => !current)}>
                    {t('notebook.linkWorkspace')}
                  </Button>
                  <Button variant="outline" size="md" disabled={busy} onClick={() => { void pickNewWorkspace() }}>
                    {t('notebook.createWorkspace')}
                  </Button>
                </div>
                {choosing
                  ? (
                      <div className="dsh-desk-notebook-picker">
                        {workspaces.length === 0
                          ? <p className="dsh-desk-notebook-fineprint">{t('notebook.noWorkspace')}</p>
                          : workspaces.map(item => (
                              <button key={item.workspaceId} type="button" className="dsh-desk-notebook-pickeritem" disabled={busy} onClick={() => { void chooseRoot(item.path) }}>
                                <span className="dsh-desk-notebook-pickertitle">{item.title}</span>
                                <span className="dsh-desk-notebook-rowpath">{item.path}</span>
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
            <div className="dsh-desk-notebook-column">
              <header className="dsh-desk-notebook-head">
                <div className="dsh-desk-notebook-headmain">
                  <h1 className="dsh-desk-notebook-title">{t('notebook.title')}</h1>
                  <p className="dsh-desk-notebook-intro">{t('notebook.heroBody')}</p>
                  <p className="dsh-desk-notebook-meta">
                    <span>{libraryMeta}</span>
                    {state?.note2md === true ? <Tag tone="quiet">{t('notebook.note2mdTag')}</Tag> : null}
                    {state === null || state.stats.missingFrontmatter === 0
                      ? null
                      : <span>{t('notebook.missingSummary', { count: state.stats.missingFrontmatter })}</span>}
                  </p>
                </div>
                <div className="dsh-desk-notebook-headactions">
                  <Button
                    variant="outline"
                    size="md"
                    icon={<IconFolderOpenOutlineRegular />}
                    disabled={busy || browserOpen === 'pending'}
                    onClick={() => { void openBrowser() }}
                  >
                    {browserOpen === 'pending' ? t('notebook.browserOpening') : t('notebook.openBrowser')}
                  </Button>
                  <Button variant="primary" size="md" icon={<IconPlusOutlineRegular />} onClick={() => setNewOpen(current => !current)}>
                    {t('notebook.newNote')}
                  </Button>
                </div>
              </header>

              {newOpen
                ? (
                    <section className="dsh-desk-notebook-new">
                      <div className="dsh-desk-notebook-newrow">
                        <Input
                          className="dsh-desk-notebook-newtitle"
                          value={newTitle}
                          placeholder={t('notebook.newTitlePlaceholder')}
                          onChange={event => setNewTitle(event.target.value)}
                          autoFocus
                        />
                        <Button variant="outline" size="md" disabled={busy || newTitle.trim() === ''} onClick={() => { void createEmpty() }}>
                          {t('notebook.createEmpty')}
                        </Button>
                        <Button variant="outline" size="md" disabled={busy || newTitle.trim() === '' || workspace === undefined} onClick={draftWithAi}>
                          {state?.note2md === true ? t('notebook.note2mdNew') : t('notebook.aiDraft')}
                        </Button>
                      </div>
                      <p className="dsh-desk-notebook-fineprint">
                        {state?.note2md === true ? t('notebook.note2mdHint') : t('notebook.newHint')}
                      </p>
                    </section>
                  )
                : null}

              <div className="dsh-desk-notebook-toolbar">
                <Input
                  className="dsh-desk-notebook-search"
                  icon={<IconSearchOutlineRegular />}
                  value={query}
                  placeholder={t('notebook.searchPlaceholder')}
                  onChange={event => setQuery(event.target.value)}
                />
                <SegmentedTabs
                  className="dsh-desk-notebook-tabs"
                  size="sm"
                  label={t('notebook.panelLabel')}
                  value={panel}
                  onChange={setPanel}
                  items={[
                    { value: 'recent', label: t('notebook.recentTab'), id: 'desk-notebook-tab-recent', panelId: 'desk-notebook-panel' },
                    { value: 'drafts', label: t('notebook.entryDrafts', { count: state?.draftCount ?? 0 }), id: 'desk-notebook-tab-drafts', panelId: 'desk-notebook-panel' },
                    { value: 'history', label: t('notebook.entryHistory', { count: state?.historyCount ?? 0 }), id: 'desk-notebook-tab-history', panelId: 'desk-notebook-panel' },
                  ] as const}
                />
                <button type="button" className="dsh-desk-notebook-disconnect" disabled={busy} onClick={() => { void disconnect() }}>
                  {t('notebook.disconnect')}
                </button>
              </div>

              {panel === 'history'
                ? (
                    <section className="dsh-desk-notebook-section">
                      <div className="dsh-desk-notebook-listhead">
                        <h2>{t('notebook.historyTitle')}</h2>
                        <span>{t('notebook.historyCount', { count: history.length })}</span>
                        <span className={historyWarn ? 'dsh-desk-notebook-usage dsh-desk-notebook-usage-warn' : 'dsh-desk-notebook-usage'}>
                          {t('notebook.historyUsage', { size: (historyBytes / 1024).toFixed(1) })}
                        </span>
                      </div>
                      {history.length === 0
                        ? <p className="dsh-desk-notebook-empty">{t('notebook.historyEmpty')}</p>
                        : (
                            <div className="dsh-desk-notebook-rows">
                              {history.map(entry => (
                                <PageRow
                                  key={entry.record.id}
                                  t={t}
                                  title={entry.record.fileTitle}
                                  path={entry.resolvedPath ?? entry.record.pathSnapshot}
                                  date={new Date(entry.record.createdAt).toLocaleDateString()}
                                  reviewedCount={entry.record.annotations.length}
                                  action={(
                                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void deleteHistory(entry.record.id) }}>
                                      {t('review.delete')}
                                    </Button>
                                  )}
                                />
                              ))}
                            </div>
                          )}
                      {history.length === 0 ? null : (
                        <p className="dsh-desk-notebook-fineprint">
                          {t('notebook.linkState', {
                            linked: history.filter(entry => entry.status === 'linked').length,
                            moved: history.filter(entry => entry.status === 'moved').length,
                            detached: history.filter(entry => entry.status === 'detached').length,
                          })}
                        </p>
                      )}
                    </section>
                  )
                : panel === 'drafts'
                  ? (
                      <section className="dsh-desk-notebook-section">
                        <div className="dsh-desk-notebook-listhead">
                          <h2>{t('notebook.draftsTitle')}</h2>
                          <span>{t('notebook.entryDrafts', { count: state?.draftCount ?? 0 })}</span>
                        </div>
                        {(state?.drafts ?? []).length === 0
                          ? <p className="dsh-desk-notebook-empty">{t('notebook.draftsEmpty')}</p>
                          : (
                              <div className="dsh-desk-notebook-rows">
                                {(state?.drafts ?? []).map(draft => (
                                  <PageRow
                                    key={draft.id}
                                    t={t}
                                    title={draft.path.split('/').pop() ?? draft.path}
                                    path={draft.path}
                                    draftCount={draft.drafts.length}
                                    reviewedCount={reviewed.get(draft.path)?.count}
                                    onOpen={() => { void openPage(draft.path) }}
                                  />
                                ))}
                              </div>
                            )}
                      </section>
                    )
                  : (
                      <section className="dsh-desk-notebook-section">
                        <div className="dsh-desk-notebook-listhead">
                          <h2>{listTitle}</h2>
                          {searching ? null : <span>{t('notebook.totalCount', { count: state?.stats.total ?? recent.length })}</span>}
                        </div>
                        {listRows.length === 0
                          ? <p className="dsh-desk-notebook-empty">{searching ? t('notebook.searchEmpty') : t('notebook.emptyFolder')}</p>
                          : (
                              <div className="dsh-desk-notebook-rows">
                                {listRows.map(entry => (
                                  <PageRow
                                    key={entry.path}
                                    t={t}
                                    title={entry.title}
                                    path={entry.path}
                                    date={entry.date}
                                    missing={!entry.hasFrontmatter}
                                    draftCount={draftCounts.get(entry.path)}
                                    reviewedCount={reviewed.get(entry.path)?.count}
                                    onOpen={() => { void openPage(entry.path) }}
                                  />
                                ))}
                              </div>
                            )}
                      </section>
                    )}
            </div>
          )}
    </div>
  )
}
