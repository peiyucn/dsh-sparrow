

import { useCallback, useRef } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess, WorkspacePathView } from '../workspaces.js'
import type { NotebookLibrary } from './useNotebookLibrary.js'


export interface NotebookActions {

  readonly openFolder: () => Promise<void>
  readonly chooseRoot: (path: string) => Promise<void>

  readonly switchTo: (workspace: WorkspacePathView) => Promise<void>
  readonly pickNewWorkspace: () => Promise<void>
  readonly openPage: (path: string) => Promise<void>
  readonly deleteHistory: (id: string) => Promise<void>
}


export function useNotebookActions(input: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly library: NotebookLibrary
  readonly onOpenReview: (input: ReviewOpenInput) => Promise<ReviewOpenResult>
  readonly onOpenBrowser: (workspaceId: string) => Promise<ReviewOpenResult>

  readonly resetView: () => void
}): NotebookActions {
  const { t, notebook, workspaceAccess, library, onOpenReview, onOpenBrowser, resetView } = input
  const { workspace, reload, setState, setHistory, setError, setNotice, setBusy } = library


  const openFolder = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const target = workspace ?? workspaceAccess.list()[0]
      if (target === undefined) {
        const created = await workspaceAccess.createFromPicker()
        if (created === null) return
        const createdResult = await onOpenBrowser(created.workspaceId)
        if (!createdResult.ok) setNotice(createdResult.message ?? t('review.openFailed'))
        return
      }
      const result = await onOpenBrowser(target.workspaceId)
      if (!result.ok) setNotice(result.message ?? t('review.openFailed'))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [onOpenBrowser, setBusy, setError, setNotice, t, workspace, workspaceAccess])

  const chooseRoot = useCallback(async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(path))
      resetView()
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, resetView, setBusy, setError, setState])

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
  }, [chooseRoot, setBusy, setError, workspaceAccess])


  const switchTo = useCallback(async (next: WorkspacePathView): Promise<void> => {
    await chooseRoot(next.path)
  }, [chooseRoot])


  const openingRef = useRef(false)
  const openPage = useCallback(async (path: string): Promise<void> => {
    if (workspace === undefined) {
      setNotice(t('notebook.noWorkspaceForRoot'))
      return
    }
    if (openingRef.current) return
    openingRef.current = true
    setBusy(true)
    try {
      const { file } = await notebook.ensureFile(path)
      const result = await onOpenReview({ path, fileId: file.id, workspaceId: workspace.workspaceId })
      if (!result.ok) setNotice(result.message ?? t('review.openFailed'))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      openingRef.current = false
      setBusy(false)
    }
  }, [notebook, onOpenReview, setBusy, setNotice, t, workspace])

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
  }, [notebook, reload, setBusy, setHistory, setNotice])

  return {
    openFolder,
    chooseRoot,
    switchTo,
    pickNewWorkspace,
    openPage,
    deleteHistory,
  }
}
