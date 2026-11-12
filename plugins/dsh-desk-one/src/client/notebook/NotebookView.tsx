/**
 * Notebook page: a library workspace picker, a search-first hero, a folder tree, and the page
 * list / drafts / history panels.
 *
 * The panel only browses and hands a page to the review tab; it never edits files. Choosing a
 * library reuses DSH's own workspace flow, so the AI can always edit inside it. Only markdown
 * and text files are indexed — other files in the same folder stay invisible by design.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type {
  NotebookEntry, NotebookStateResponse, NotebookTreeFolder, NotebookTreeResponse, ReviewHistoryEntry,
} from '../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../constants.js'
import type { NotebookApi } from './api.js'
import type { ReviewOpenInput, ReviewOpenResult } from './review-bridge.js'
import type { WorkspaceAccess } from './workspaces.js'
import { findWorkspaceForRoot } from './workspaces.js'

/** Which content the right panel shows. */
type Mode = 'browse' | 'search' | 'drafts' | 'history'

/** How many files one tree page loads. */
const PAGE_SIZE = 50

/** Folder name of one tree path. */
function folderName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

/** One page row shared by browse / search results. */
function PageRow(props: {
  readonly t: DeskTranslator
  readonly entry: NotebookEntry
  readonly draftCount: number
  readonly onOpen: () => void
}): ReactElement {
  const { t, entry, draftCount, onOpen } = props
  return (
    <button type="button" className="dsh-desk-notebook-page" onClick={onOpen} title={entry.path}>
      <span className="dsh-desk-notebook-page-title">{entry.title}</span>
      <span className="dsh-desk-notebook-page-path">{entry.path}</span>
      {entry.hasFrontmatter ? null : <span className="dsh-desk-notebook-badge">{t('notebook.missingBadge')}</span>}
      {draftCount === 0 ? null : <span className="dsh-desk-notebook-badge">{t('notebook.draftBadge', { count: draftCount })}</span>}
      {entry.date === undefined ? null : <span className="dsh-desk-notebook-page-date">{entry.date}</span>}
    </button>
  )
}

/** Recursive folder branch of the library tree. */
function TreeBranch(props: {
  readonly t: DeskTranslator
  readonly path: string
  readonly name: string
  readonly count: number
  readonly depth: number
  readonly data: NotebookTreeResponse | undefined
  readonly expanded: ReadonlySet<string>
  readonly selected: string
  readonly onToggle: (path: string) => void
  readonly onSelect: (path: string) => void
}): ReactElement {
  const { t, path, name, count, depth, data, expanded, selected, onToggle, onSelect } = props
  const open = expanded.has(path)
  return (
    <div className="dsh-desk-notebook-treebranch">
      <div className="dsh-desk-notebook-treeitem" data-selected={selected === path || undefined} style={{ paddingLeft: 6 + depth * 14 }}>
        <button
          type="button"
          className="dsh-desk-notebook-treetoggle"
          aria-label={open ? t('notebook.collapseFolder') : t('notebook.expandFolder')}
          onClick={() => onToggle(path)}
        >
          <span className="dsh-desk-notebook-treearrow" data-open={open || undefined}>{open ? '▾' : '▸'}</span>
        </button>
        <button type="button" className="dsh-desk-notebook-treelabel" onClick={() => onSelect(path)}>
          <span className="dsh-desk-notebook-treefolder">{name}</span>
          <span className="dsh-desk-notebook-treecount">{count}</span>
        </button>
      </div>
      {open
        ? (data?.folders ?? []).map(folder => (
            <TreeBranch
              key={folder.path}
              t={t}
              path={folder.path}
              name={folder.name}
              count={folder.count}
              depth={depth + 1}
              data={undefined}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
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
  const [mode, setMode] = useState<Mode>('browse')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<readonly NotebookEntry[] | null>(null)
  const [selectedFolder, setSelectedFolder] = useState('')
  const [tree, setTree] = useState<NotebookTreeResponse | null>(null)
  const [treeExpanded, setTreeExpanded] = useState<ReadonlySet<string>>(new Set())
  const [treeKids, setTreeKids] = useState<ReadonlyMap<string, NotebookTreeResponse>>(new Map())
  const [extraFiles, setExtraFiles] = useState<readonly NotebookEntry[]>([])
  const [drafts, setDrafts] = useState<readonly { readonly path: string; readonly count: number }[] | null>(null)
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const rootPath = state?.config?.rootPath
  const workspaces = workspaceAccess.list()
  const workspace = rootPath === undefined ? undefined : findWorkspaceForRoot(workspaces, rootPath)

  /** Reload header state and the current tree level. */
  const load = useCallback(async (folder = selectedFolder): Promise<void> => {
    setError(null)
    try {
      const next = await notebook.state()
      setState(next)
      if (next.config !== null) {
        const level = await notebook.tree(folder, 0, PAGE_SIZE)
        setTree(level)
        setExtraFiles([])
        if (folder === '') setTreeKids(new Map())
      }
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook, selectedFolder])

  useEffect(() => { void load('') }, []) // eslint-disable-line react-hooks/exhaustive-deps -- first mount only

  // Search is a flat query; a cleared query returns to the folder view.
  useEffect(() => {
    if (query.trim() === '') {
      setSearchResults(null)
      if (mode === 'search') setMode('browse')
      return
    }
    setMode('search')
    let cancelled = false
    const timer = setTimeout(() => {
      void notebook.search({ query, limit: 200 }).then(payload => {
        if (!cancelled) setSearchResults(payload.entries)
      }, cause => {
        if (!cancelled) setError(messageOf(cause))
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, notebook, query])

  // Draft / history panels load on demand.
  useEffect(() => {
    if (mode === 'drafts') {
      void notebook.state().then((next) => {
        setDrafts(next.drafts.map(draft => ({ path: draft.path, count: draft.drafts.length })))
      }, cause => setError(messageOf(cause)))
      return
    }
    setDrafts(null)
  }, [mode, notebook])

  useEffect(() => {
    if (mode !== 'history') { setHistory(null); return }
    void notebook.history().then(payload => setHistory(payload.entries), cause => setError(messageOf(cause)))
  }, [mode, notebook])

  const selectFolder = useCallback(async (folder: string): Promise<void> => {
    setSelectedFolder(folder)
    setMode('browse')
    setExtraFiles([])
    try {
      const level = await notebook.tree(folder, 0, PAGE_SIZE)
      setTree(level)
      setQuery('')
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook])

  const toggleFolder = useCallback(async (folder: string): Promise<void> => {
    setTreeExpanded((current) => {
      const next = new Set(current)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
    if (treeKids.has(folder)) return
    try {
      const level = await notebook.tree(folder, 0, PAGE_SIZE)
      setTreeKids(current => new Map(current).set(folder, level))
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [notebook, treeKids])

  const loadMore = useCallback(async (): Promise<void> => {
    if (tree === null) return
    try {
      const next = await notebook.tree(selectedFolder, tree.files.length + extraFiles.length, PAGE_SIZE)
      setExtraFiles(current => [...current, ...next.files])
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [extraFiles.length, notebook, selectedFolder, tree])

  const chooseRoot = useCallback(async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(path))
      setChoosing(false)
      setSelectedFolder('')
      setQuery('')
      setMode('browse')
      const level = await notebook.tree('', 0, PAGE_SIZE)
      setTree(level)
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
      setTree(null)
      setTreeKids(new Map())
      setSelectedFolder('')
      setMode('browse')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const openPage = useCallback(async (path: string): Promise<void> => {
    if (rootPath === undefined) return
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
  }, [notebook, onOpenReview, rootPath, t, workspace])

  const createEmpty = useCallback(async (): Promise<void> => {
    if (newTitle.trim() === '') return
    setBusy(true)
    try {
      const folder = selectedFolder === '' ? undefined : selectedFolder
      const created = await notebook.createNote({ title: newTitle.trim(), ...folder === undefined ? {} : { folder } })
      setNewOpen(false)
      setNewTitle('')
      await load(selectedFolder)
      setNotice(t('notebook.created'))
      void openPage(created.path)
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [load, newTitle, notebook, openPage, selectedFolder, t])

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
      setHistory(entries => entries?.filter(entry => entry.record.id !== id) ?? null)
      await load(selectedFolder)
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [load, notebook, selectedFolder])

  const draftCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const draft of state?.drafts ?? []) map.set(draft.path, draft.drafts.length)
    return map
  }, [state?.drafts])

  /** Root tree node (workspace root). */
  const rootFolders: readonly NotebookTreeFolder[] = tree?.folders ?? []
  const browseFiles = [...(tree?.files ?? []), ...extraFiles]
  const totalFiles = tree?.totalFiles ?? 0

  const historyBytes = state?.historyBytes ?? 0
  const historyWarn = historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES

  /** Right panel title. */
  const panelTitle = mode === 'search'
    ? t('notebook.searchResults', { count: searchResults?.length ?? 0 })
    : mode === 'drafts'
      ? t('notebook.panelDrafts', { count: state?.draftCount ?? 0 })
      : mode === 'history'
        ? t('notebook.panelHistory', { count: state?.historyCount ?? 0 })
        : selectedFolder === ''
          ? t('notebook.rootFolder', { count: totalFiles })
          : t('notebook.folderPages', { name: folderName(selectedFolder), count: totalFiles })

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
                  <button
                    type="button"
                    className="dsh-desk-action dsh-desk-action-primary"
                    disabled={busy}
                    onClick={() => setChoosing(current => !current)}
                  >
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
                              <button
                                key={item.workspaceId}
                                type="button"
                                className="dsh-desk-notebook-pickeritem"
                                disabled={busy}
                                onClick={() => { void chooseRoot(item.path) }}
                              >
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
                    {state?.note2md === true ? <p className="dsh-desk-notebook-fineprint">{t('notebook.note2mdHint')}</p> : null}
                  </div>
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

              <div className="dsh-desk-notebook-layout">
                <aside className="dsh-desk-notebook-side">
                  <div className="dsh-desk-notebook-sidehead">
                    <button type="button" className="dsh-desk-notebook-treelabel" title={rootPath} onClick={() => { void selectFolder('') }}>
                      <span className="dsh-desk-notebook-treefolder">{workspace?.title ?? folderName(rootPath)}</span>
                    </button>
                    <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => { void disconnect() }}>{t('notebook.disconnect')}</button>
                  </div>
                  <div className="dsh-desk-notebook-tree">
                    {rootFolders.length === 0
                      ? <p className="dsh-desk-notebook-hint">{t('notebook.treeEmpty')}</p>
                      : rootFolders.map(folder => (
                          <TreeBranch
                            key={folder.path}
                            t={t}
                            path={folder.path}
                            name={folder.name}
                            count={folder.count}
                            depth={0}
                            data={treeKids.get(folder.path)}
                            expanded={treeExpanded}
                            selected={selectedFolder}
                            onToggle={(path) => { void toggleFolder(path) }}
                            onSelect={(path) => { void selectFolder(path) }}
                          />
                        ))}
                  </div>
                  <div className="dsh-desk-notebook-sidentries">
                    <button type="button" className="dsh-desk-notebook-sideentry" data-active={mode === 'drafts' || undefined} onClick={() => setMode('drafts')}>
                      {t('notebook.entryDrafts', { count: state?.draftCount ?? 0 })}
                    </button>
                    <button type="button" className="dsh-desk-notebook-sideentry" data-active={mode === 'history' || undefined} onClick={() => setMode('history')}>
                      {t('notebook.entryHistory', { count: state?.historyCount ?? 0 })}
                    </button>
                  </div>
                  <p className="dsh-desk-notebook-fineprint">{t('notebook.indexHint')}</p>
                </aside>

                <section className="dsh-desk-notebook-main">
                  <header className="dsh-desk-notebook-mainhead">
                    <h4>{panelTitle}</h4>
                    {mode === 'browse' && tree !== null && tree.files.length + extraFiles.length < tree.totalFiles
                      ? <button type="button" className="dsh-desk-review-mini" onClick={() => { void loadMore() }}>{t('notebook.loadMore')}</button>
                      : null}
                  </header>
                  {mode === 'browse'
                    ? (browseFiles.length === 0
                        ? <p className="dsh-desk-notebook-hint">{t('notebook.emptyFolder')}</p>
                        : (
                            <div className="dsh-desk-notebook-pages">
                              {browseFiles.map(entry => (
                                <PageRow
                                  key={entry.path}
                                  t={t}
                                  entry={entry}
                                  draftCount={draftCounts.get(entry.path) ?? 0}
                                  onOpen={() => { void openPage(entry.path) }}
                                />
                              ))}
                            </div>
                          ))
                    : null}
                  {mode === 'search'
                    ? (searchResults === null
                        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
                        : searchResults.length === 0
                          ? <p className="dsh-desk-notebook-hint">{t('notebook.searchEmpty')}</p>
                          : (
                              <div className="dsh-desk-notebook-pages">
                                {searchResults.map(entry => (
                                  <PageRow
                                    key={entry.path}
                                    t={t}
                                    entry={entry}
                                    draftCount={draftCounts.get(entry.path) ?? 0}
                                    onOpen={() => { void openPage(entry.path) }}
                                  />
                                ))}
                              </div>
                            ))
                    : null}
                  {mode === 'drafts'
                    ? (drafts === null
                        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
                        : drafts.length === 0
                          ? <p className="dsh-desk-notebook-hint">{t('notebook.draftsEmpty')}</p>
                          : (
                              <div className="dsh-desk-notebook-pages">
                                {drafts.map(draft => (
                                  <PageRow
                                    key={draft.path}
                                    t={t}
                                    entry={{ path: draft.path, title: draft.path.split('/').pop() ?? draft.path, tags: [], hasFrontmatter: true, emptyBody: false, bytes: 0, mtime: '' }}
                                    draftCount={draft.count}
                                    onOpen={() => { void openPage(draft.path) }}
                                  />
                                ))}
                              </div>
                            ))
                    : null}
                  {mode === 'history'
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
                </section>
              </div>
            </>
          )}
    </div>
  )
}
