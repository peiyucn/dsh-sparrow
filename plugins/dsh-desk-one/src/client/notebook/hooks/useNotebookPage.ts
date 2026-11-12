/**
 * Notebook page controller: library data, list-view and pagination state, and every action the
 * page body and the panel header share. Keeping it here (owned by `DeskOnePage`) is what lets the
 * header own the page's primary actions without the page reaching into the header.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'
import type { NotebookEntry, NotebookSkill, NotebookStateResponse, ReviewHistoryEntry } from '../../../notebook-contract.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../../constants.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess, WorkspacePathView } from '../workspaces.js'
import { findWorkspaceForRoot } from '../workspaces.js'
import { paginate, type PageSlice } from '../paging.js'

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
  readonly slice: PageSlice<NotebookRow>
  readonly total: number
  /** How the history records currently relate to the files on disk. */
  readonly linkState: { readonly linked: number; readonly moved: number; readonly detached: number }
  readonly historyBytes: number
  readonly historyWarn: boolean
  readonly reload: () => Promise<void>
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

/** One file's review facts: submitted-record count and the newest record time. */
interface FileReviewFacts {
  readonly records: number
  readonly lastAt: string
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
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [brief, setBrief] = useState('')
  const [browserOpen, setBrowserOpen] = useState<'pending' | 'opened' | 'failed' | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const [next, entries] = await Promise.all([notebook.state(), notebook.history()])
      setState(next)
      setHistory(entries.entries)
    } catch (cause) {
      setError(messageOf(cause))
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

  /** Submitted reviews per file: record count plus newest time (drives ordering and badges). */
  const reviewFacts = useMemo(() => {
    const map = new Map<string, FileReviewFacts>()
    for (const entry of history) {
      const path = entry.resolvedPath ?? entry.record.pathSnapshot
      const previous = map.get(path)
      map.set(path, {
        records: (previous?.records ?? 0) + 1,
        lastAt: previous === undefined || entry.record.createdAt > previous.lastAt ? entry.record.createdAt : previous.lastAt,
      })
    }
    return map
  }, [history])

  /** Unsaved annotation count per file path. */
  const draftCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const draft of state?.drafts ?? []) map.set(draft.path, draft.drafts.length)
    return map
  }, [state?.drafts])

  /** Recent files: reviewed first (newest review), then unreviewed by modification time. */
  const recent = useMemo(() => {
    const rows = (state?.recent ?? []).map(entry => ({ entry, facts: reviewFacts.get(entry.path) }))
    return rows.sort((left, right) => {
      if (left.facts !== undefined && right.facts !== undefined) return right.facts.lastAt.localeCompare(left.facts.lastAt)
      if (left.facts !== undefined) return -1
      if (right.facts !== undefined) return 1
      return right.entry.mtime.localeCompare(left.entry.mtime)
    }).map(row => row.entry)
  }, [reviewFacts, state?.recent])

  const searching = query.trim() !== ''
  const sourceEntries = searching ? results ?? [] : recent
  const needle = query.trim().toLowerCase()
  const matchesQuery = useCallback((...values: readonly string[]): boolean => (
    needle === '' || values.some(value => value.toLowerCase().includes(needle))
  ), [needle])

  const rows = useMemo<readonly NotebookRow[]>(() => {
    if (mode === 'history') {
      return history
        .filter(entry => matchesQuery(entry.record.fileTitle, entry.resolvedPath ?? entry.record.pathSnapshot))
        .map(entry => ({
          key: entry.record.id,
          title: entry.record.fileTitle,
          path: entry.resolvedPath ?? entry.record.pathSnapshot,
          date: new Date(entry.record.createdAt).toLocaleDateString(),
          annotationCount: entry.record.annotations.length,
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
          recordCount: reviewFacts.get(draft.path)?.records,
          onOpen: () => { void openPage(draft.path) },
        }))
    }
    const entries = mode === 'missing' ? sourceEntries.filter(entry => !entry.hasFrontmatter) : sourceEntries
    return entries.map(entry => ({
      key: entry.path,
      title: entry.title,
      path: entry.path,
      ...entry.date === undefined ? {} : { date: entry.date },
      draftCount: draftCounts.get(entry.path),
      recordCount: reviewFacts.get(entry.path)?.records,
      ...entry.hasFrontmatter ? {} : { missing: true },
      onOpen: () => { void openPage(entry.path) },
    }))
  }, [deleteHistory, draftCounts, matchesQuery, mode, openPage, reviewFacts, sourceEntries, state?.drafts])

  const slice = useMemo(() => paginate(rows, page), [page, rows])

  // Keep the stored page in sync with the clamped one (deleting the last row of a page, filtering).
  useEffect(() => {
    if (slice.page !== page) setPageState(slice.page)
  }, [page, slice.page])

  const historyBytes = state?.historyBytes ?? 0

  const linkState = useMemo(() => ({
    linked: history.filter(entry => entry.status === 'linked').length,
    moved: history.filter(entry => entry.status === 'moved').length,
    detached: history.filter(entry => entry.status === 'detached').length,
  }), [history])

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
    slice,
    total: state?.stats.total ?? 0,
    linkState,
    historyBytes,
    historyWarn: historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES,
    reload,
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
