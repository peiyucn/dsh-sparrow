/**
 * Notebook page controller: composes the library data (`useNotebookLibrary`), the list view
 * (`useNotebookRows`) and the page's actions (`useNotebookActions`) into the single controller the
 * page body and the panel header share. Keeping the controller here (owned by `DeskOnePage`) is what
 * lets the header own the page's primary actions without the page reaching into the header.
 */

import { useCallback, useState } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { NOTEBOOK_HISTORY_WARN_BYTES } from '../../../constants.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess } from '../workspaces.js'
import type { NotebookMode, NotebookPageController } from '../page-types.js'
import { useNotebookActions } from './useNotebookActions.js'
import { useNotebookLibrary } from './useNotebookLibrary.js'
import { useNotebookRows } from './useNotebookRows.js'

export type { NotebookMode, NotebookPageController, NotebookRow } from '../page-types.js'

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
  const [mode, setModeState] = useState<NotebookMode>('recent')
  const [query, setQueryState] = useState('')
  const [page, setPageState] = useState(1)

  const resetView = useCallback((): void => {
    setModeState('recent')
    setQueryState('')
    setPageState(1)
  }, [])
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

  const library = useNotebookLibrary({ active, notebook, workspaceAccess })
  const actions = useNotebookActions({
    t,
    notebook,
    workspaceAccess,
    library,
    onOpenReview,
    onOpenBrowser,
    onDraftWithAi,
    resetView,
  })
  const rows = useNotebookRows({
    t,
    notebook,
    active,
    state: library.state,
    history: library.history,
    rootPath: library.rootPath,
    mode,
    query,
    page,
    setError: library.setError,
    setPage: setPageState,
    openPage: actions.openPage,
    deleteHistory: actions.deleteHistory,
  })

  const historyBytes = library.state?.historyBytes ?? 0
  return {
    t,
    state: library.state,
    rootPath: library.rootPath,
    workspace: library.workspace,
    workspaces: library.workspaces,
    error: library.error,
    notice: library.notice,
    busy: library.busy,
    choosing: actions.choosing,
    browserOpen: actions.browserOpen,
    mode,
    query,
    searching: rows.searching,
    newOpen: actions.newOpen,
    brief: actions.brief,
    skillName: library.state?.skillName ?? null,
    skills: library.state?.skills ?? [],
    rows: rows.rows,
    page: rows.page,
    pages: rows.pages,
    totalCount: rows.totalCount,
    total: library.state?.stats.total ?? 0,
    summary: rows.summary,
    summaryHint: rows.summaryHint,
    history: library.history,
    historyBytes,
    historyWarn: historyBytes >= NOTEBOOK_HISTORY_WARN_BYTES,
    reload: library.reload,
    ready: library.ready,
    openBrowser: actions.openBrowser,
    toggleChoosing: actions.toggleChoosing,
    chooseRoot: actions.chooseRoot,
    pickNewWorkspace: actions.pickNewWorkspace,
    disconnect: actions.disconnect,
    toggleNew: actions.toggleNew,
    setBrief: actions.setBrief,
    createEmpty: actions.createEmpty,
    draftWithAi: actions.draftWithAi,
    chooseSkill: actions.chooseSkill,
    setMode,
    setQuery,
    setPage,
    openPage: actions.openPage,
    deleteHistory: actions.deleteHistory,
  }
}
