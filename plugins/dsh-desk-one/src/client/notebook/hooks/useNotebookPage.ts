/**
 * Notebook page controller: library data, list-view and pagination state, and every action the
 * page body and the panel header share. Keeping it here (owned by `DeskOnePage`) is what lets the
 * header own the page's primary actions without the page reaching into the header.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { formatDate, messageOf } from '../../app/utils.js'
import type { NotebookEntry, NotebookSkill, NotebookStateResponse, ReviewHistoryEntry } from '../../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../../constants.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess, WorkspacePathView } from '../workspaces.js'
import { findWorkspaceForRoot } from '../workspaces.js'
import { NOTEBOOK_PAGE_SIZE, paginate } from '../paging.js'

/** The four list views the toolbar switches between. */
export type NotebookMode = 'recent' | 'drafts' | 'history' | 'missing'

/** One rendered list row; the view stays presentational. */
export interface NotebookRow {
  readonly key: string
  readonly title: string
  readonly path: string
  readonly date?: string
  readonly draftCount?: number
  readonly recordCount?: number
  /** Submitted annotations inside a history record. */
  readonly annotationCount?: number
  readonly missing?: boolean
  /** The submitted record a history row stands for (opens the read-only detail). */
  readonly record?: ReviewHistoryEntry
  readonly onOpen?: () => void
  readonly onDelete?: () => void
}

/** Everything the page body and the header actions need. */
export interface NotebookPageController {
  readonly t: DeskTranslator
  readonly state: NotebookStateResponse | null
  readonly rootPath: string | undefined
  readonly workspace: WorkspacePathView | undefined
  readonly workspaces: readonly WorkspacePathView[]
  readonly error: string | null
  readonly notice: string | null
  readonly busy: boolean
  readonly choosing: boolean
  readonly browserOpen: 'pending' | 'opened' | 'failed' | null
  readonly mode: NotebookMode
  readonly query: string
  readonly searching: boolean
  readonly newOpen: boolean
  readonly brief: string
  readonly skillName: string | null
  readonly skills: readonly NotebookSkill[]
  readonly rows: readonly NotebookRow[]
  readonly page: number
  readonly pages: number
  readonly totalCount: number
  readonly total: number
  /** Count line of the active view, shown next to the list. */
  readonly summary: string
  /** One-line explanation under the count (currently used by the missing-metadata view). */
  readonly summaryHint: string | null
  readonly history: readonly ReviewHistoryEntry[]
  readonly historyBytes: number
  readonly historyWarn: boolean
  readonly reload: () => Promise<void>
  /** True once the first state fetch settled; the page must not flash the unlinked offer before it. */
  readonly ready: boolean
  readonly openBrowser: () => Promise<void>
  readonly toggleChoosing: () => void
  readonly chooseRoot: (path: string) => Promise<void>
  readonly pickNewWorkspace: () => Promise<void>
  readonly disconnect: () => Promise<void>
  readonly toggleNew: () => void
  readonly setBrief: (brief: string) => void
  readonly createEmpty: () => Promise<void>
  readonly draftWithAi: () => void
  readonly chooseSkill: (name: string | null) => Promise<void>
  readonly setMode: (mode: NotebookMode) => void
  readonly setQuery: (query: string) => void
  readonly setPage: (page: number) => void
  readonly openPage: (path: string) => Promise<void>
  readonly deleteHistory: (id: string) => Promise<void>
}

/** First non-empty line of the brief, used as the title of an empty note. */
function titleOfBrief(brief: string, fallback: string): string {
  for (const line of brief.split(/\r?\n/u)) {
    const cleaned = line.replace(/^[#>*\-\s]+/u, '').trim()
    if (cleaned !== '') return cleaned.slice(0, 60)
  }
  return fallback
}


/**
 * Create the notebook page controller.
 * @param input - translator, whether the notebook tab is on screen, the notebook API, workspace access,
 *   and the review / browser / draft bridges.
 * @returns controller consumed by `NotebookView` and `NotebookHeaderActions`.
 */
export function useNotebookPage(input: {
  readonly t: DeskTranslator
  readonly active: boolean
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly onOpenReview: (input: ReviewOpenInput) => Promise<ReviewOpenResult>
  readonly onOpenBrowser: (workspaceId: string) => Promise<ReviewOpenResult>
  readonly onDraftWithAi: (workspaceId: string, prompt: string) => void
}): NotebookPageController {
  const { t, active, notebook, workspaceAccess, onOpenReview, onOpenBrowser, onDraftWithAi } = input

  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[]>([])
  const [mode, setModeState] = useState<NotebookMode>('recent')
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState<readonly NotebookEntry[] | null>(null)
  const [page, setPageState] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [brief, setBrief] = useState('')
  const [browserOpen, setBrowserOpen] = useState<'pending' | 'opened' | 'failed' | null>(null)
  const [paged, setPaged] = useState<{ readonly entries: readonly NotebookEntry[]; readonly total: number } | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const [next, entries] = await Promise.all([notebook.state(), notebook.history()])
      setState(next)
      setHistory(entries.entries)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setReady(true)
    }
  }, [notebook])

  // Load when the tab becomes visible; a fresh scan is cheap (the host caches it for 30s).
  useEffect(() => {
    if (active) void reload()
  }, [active, reload])

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
      void notebook.search({ query, limit: 200 }).then((payload) => {
        if (!cancelled) setResults(payload.entries)
      }, (cause) => {
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
      setPageState(1)
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
      setModeState('recent')
      setQueryState('')
      setResults(null)
      setPageState(1)
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
    const title = titleOfBrief(brief, t('notebook.untitled'))
    setBusy(true)
    try {
      const created = await notebook.createNote({ title })
      setNewOpen(false)
      setBrief('')
      await reload()
      setNotice(t('notebook.created'))
      void openPage(created.path)
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [brief, notebook, openPage, reload, t])

  const draftWithAi = useCallback((): void => {
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    const text = brief.trim()
    const prompt = state?.skillName == null
      ? t('notebook.draftPrompt', { brief: text })
      : t('notebook.skillDraftPrompt', { skill: state.skillName, brief: text })
    onDraftWithAi(workspace.workspaceId, prompt)
    setNewOpen(false)
    setBrief('')
  }, [brief, onDraftWithAi, state?.skillName, t, workspace])


  const chooseSkill = useCallback(async (name: string | null): Promise<void> => {
    setBusy(true)
    try {
      setState(await notebook.setSkill(name))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  const deleteHistory = useCallback(async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await notebook.deleteHistory(id)
      setHistory(entries => entries.filter(entry => entry.record.id !== id))
      await reload()
    } catch (catchValue) {
      setNotice(messageOf(catchValue))
    } finally {
      setBusy(false)
    }
  }, [notebook, reload])

  const setMode = useCallback((next: NotebookMode): void => {
    setModeState(next)
    setPageState(1)
  }, [])

  const setQuery = useCallback((next: string): void => {
    setQueryState(next)
    setPageState(1)
  }, [])

  const setPage = useCallback((next: number): void => {
    setPageState(next)
  }, [])

  const searching = query.trim() !== ''
  const needle = query.trim().toLowerCase()
  const matchesQuery = useCallback((...values: readonly string[]): boolean => (
    needle === '' || values.some(value => value.toLowerCase().includes(needle))
  ), [needle])

  /** How many submitted records each file has (row badges). */
  const recordCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of history) {
      const path = entry.resolvedPath ?? entry.record.pathSnapshot
      map.set(path, (map.get(path) ?? 0) + 1)
    }
    return map
  }, [history])

  /** Unsaved annotation count per file path. */
  const draftCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const draft of state?.drafts ?? []) map.set(draft.path, draft.drafts.length)
    return map
  }, [state?.drafts])

  // Whole-library views page on the server: the list is the library, so its rows and its count
  // always describe the same set (no "30 recent vs 104 total" mismatch).
  const serverPaged = !searching && (mode === 'recent' || mode === 'missing')
  useEffect(() => {
    if (!active || rootPath === undefined || searching) return
    if (mode !== 'recent' && mode !== 'missing') return
    let cancelled = false
    void notebook.list({
      offset: (page - 1) * NOTEBOOK_PAGE_SIZE,
      limit: NOTEBOOK_PAGE_SIZE,
      ...(mode === 'missing' ? { missingFrontmatter: true } : {}),
    }).then((payload) => {
      if (!cancelled) setPaged(payload)
    }, (cause) => {
      if (!cancelled) setError(messageOf(cause))
    })
    return () => { cancelled = true }
  }, [active, mode, notebook, page, rootPath, searching, state?.stats.missingFrontmatter, state?.stats.total])

  const entryRow = useCallback((entry: NotebookEntry): NotebookRow => ({
    key: entry.path,
    title: entry.title,
    path: entry.path,
    ...entry.date === undefined ? {} : { date: entry.date },
    draftCount: draftCounts.get(entry.path),
    recordCount: recordCounts.get(entry.path),
    ...entry.hasFrontmatter ? {} : { missing: true },
    onOpen: () => { void openPage(entry.path) },
  }), [draftCounts, openPage, recordCounts])

  /** All matching rows (client-paged for search / drafts / history; one server page otherwise). */
  const allRows = useMemo<readonly NotebookRow[]>(() => {
    if (mode === 'history') {
      return history
        .filter(entry => matchesQuery(entry.record.fileTitle, entry.resolvedPath ?? entry.record.pathSnapshot))
        .map(entry => ({
          key: entry.record.id,
          title: entry.record.fileTitle,
          path: entry.resolvedPath ?? entry.record.pathSnapshot,
          date: formatDate(entry.record.createdAt),
          annotationCount: entry.record.annotations.length,
          record: entry,
          onDelete: () => { void deleteHistory(entry.record.id) },
        }))
    }
    if (mode === 'drafts') {
      return (state?.drafts ?? [])
        .filter(draft => matchesQuery(draft.path))
        .map(draft => ({
          key: draft.id,
          title: draft.path.split('/').pop() ?? draft.path,
          path: draft.path,
          draftCount: draft.drafts.length,
          recordCount: recordCounts.get(draft.path),
          onOpen: () => { void openPage(draft.path) },
        }))
    }
    if (searching) {
      const entries = (results ?? []).filter(entry => mode !== 'missing' || !entry.hasFrontmatter)
      return entries.map(entryRow)
    }
    return (paged?.entries ?? []).map(entryRow)
  }, [deleteHistory, entryRow, matchesQuery, mode, openPage, paged, recordCounts, results, searching, state?.drafts])

  const totalCount = serverPaged ? paged?.total ?? 0 : allRows.length
  const pages = Math.max(1, Math.ceil(totalCount / NOTEBOOK_PAGE_SIZE))
  const slice = serverPaged
    ? { rows: allRows, page: Math.min(page, pages), pages }
    : paginate(allRows, page)

  // Keep the stored page in sync with the clamped one (deleting the last row of a page, filtering).
  useEffect(() => {
    if (slice.page !== page) setPageState(slice.page)
  }, [page, slice.page])

  const historyBytes = state?.historyBytes ?? 0
  const summary = searching
    ? t('notebook.searchResults', { count: totalCount })
    : mode === 'history'
      ? t('notebook.summaryHistory', { count: totalCount })
      : mode === 'drafts'
        ? t('notebook.summaryDrafts', { count: totalCount })
        : mode === 'missing'
          ? t('notebook.summaryMissing', { count: totalCount })
          : t('notebook.summaryRecent', { count: totalCount })
  const summaryHint = mode === 'missing' ? t('notebook.missingHint') : null

  return {
    t,
    state,
    rootPath,
    workspace,
    workspaces,
    error,
    notice,
    busy,
    choosing,
    browserOpen,
    mode,
    query,
    searching,
    newOpen,
    brief,
    skillName: state?.skillName ?? null,
    skills: state?.skills ?? [],
    rows: slice.rows,
    page: slice.page,
    pages: slice.pages,
    totalCount,
    total: state?.stats.total ?? 0,
    summary,
    summaryHint,
    history,
    historyBytes,
    historyWarn: historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES,
    reload,
    ready,
    openBrowser,
    toggleChoosing: () => setChoosing(current => !current),
    chooseRoot,
    pickNewWorkspace,
    disconnect,
    toggleNew: () => setNewOpen(current => !current),
    setBrief,
    createEmpty,
    draftWithAi,
    chooseSkill,
    setMode,
    setQuery,
    setPage,
    openPage,
    deleteHistory,
  }
}
