/**
 * Notebook list view: the row model, the four view modes' client-side filtering, search and the
 * dual paging strategy (server-paged for the whole library, client-paged for search / drafts /
 * history), plus the count line under the list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { formatDate, messageOf } from '../../app/utils.js'
import type { NotebookEntry, NotebookStateResponse, ReviewHistoryEntry } from '../../../notebook-contract.js'
import type { NotebookApi } from '../api.js'
import { NOTEBOOK_PAGE_SIZE, paginate } from '../paging.js'
import type { NotebookMode, NotebookRow } from '../page-types.js'

/** Row model + paging for the notebook list. */
export interface NotebookRows {
  readonly searching: boolean
  readonly rows: readonly NotebookRow[]
  readonly page: number
  readonly pages: number
  readonly totalCount: number
  readonly summary: string
  readonly summaryHint: string | null
}

/** Build the notebook list rows for the current view. */
export function useNotebookRows(input: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly active: boolean
  readonly state: NotebookStateResponse | null
  readonly history: readonly ReviewHistoryEntry[]
  readonly rootPath: string | undefined
  readonly mode: NotebookMode
  readonly query: string
  readonly page: number
  readonly setError: (error: string | null) => void
  readonly setPage: (page: number) => void
  readonly openPage: (path: string) => Promise<void>
  readonly deleteHistory: (id: string) => Promise<void>
}): NotebookRows {
  const { t, notebook, active, state, history, rootPath, mode, query, page, setError, setPage, openPage, deleteHistory } = input
  const [results, setResults] = useState<readonly NotebookEntry[] | null>(null)
  const [paged, setPaged] = useState<{ readonly entries: readonly NotebookEntry[]; readonly total: number } | null>(null)

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
  }, [notebook, query, setError])

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
  }, [active, mode, notebook, page, rootPath, searching, setError, state?.stats.missingFrontmatter, state?.stats.total])

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
    if (slice.page !== page) setPage(slice.page)
  }, [page, setPage, slice.page])

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
    searching,
    rows: slice.rows,
    page: slice.page,
    pages: slice.pages,
    totalCount,
    summary,
    summaryHint,
  }
}
