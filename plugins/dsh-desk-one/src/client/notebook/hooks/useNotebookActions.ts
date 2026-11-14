/**
 * Notebook actions: workspace linking / switching (registered workspaces, create, clear), review
 * opening, browser opening and history deletion. All user-visible busy/notice state lives here; the
 * library data is mutated through the setters the data hook exposes.
 */

import { useCallback, useRef, useState } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess, WorkspacePathView } from '../workspaces.js'
import { findWorkspaceForPath } from '../workspaces.js'
import type { NotebookLibrary } from './useNotebookLibrary.js'

/** Everything the page body and header actions can trigger. */
export interface NotebookActions {
  readonly choosing: boolean
  readonly switching: boolean
  readonly browserOpen: 'pending' | 'opened' | 'failed' | null
  readonly openBrowser: () => Promise<void>
  /** Inline picker in the unlinked state. */
  readonly toggleChoosing: () => void
  /** Switcher popover in the linked state. */
  readonly toggleSwitching: () => void
  readonly chooseRoot: (path: string) => Promise<void>
  /** Switch to another registered workspace without unlinking first. */
  readonly switchTo: (workspace: WorkspacePathView) => Promise<void>
  readonly pickNewWorkspace: () => Promise<void>
  /** Link an arbitrary folder (typically a subfolder of a registered workspace). */
  readonly chooseFolder: () => Promise<void>
  readonly forgetWorkspace: () => Promise<void>
  readonly openPage: (path: string) => Promise<void>
  readonly deleteHistory: (id: string) => Promise<void>
}

/** Bind the notebook page's actions. */
export function useNotebookActions(input: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
  readonly library: NotebookLibrary
  readonly onOpenReview: (input: ReviewOpenInput) => Promise<ReviewOpenResult>
  readonly onOpenBrowser: (workspaceId: string) => Promise<ReviewOpenResult>
  /** Reset the list view to the initial recent page (after linking / unlinking a root). */
  readonly resetView: () => void
}): NotebookActions {
  const { t, notebook, workspaceAccess, library, onOpenReview, onOpenBrowser, resetView } = input
  const { workspace, reload, setState, setHistory, setError, setNotice, setBusy } = library
  const [choosing, setChoosing] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [browserOpen, setBrowserOpen] = useState<'pending' | 'opened' | 'failed' | null>(null)

  /** Explicit browse: start a session in the linked workspace and open the official file page. */
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
  }, [onOpenBrowser, setNotice, t, workspace])

  const chooseRoot = useCallback(async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(path))
      setChoosing(false)
      setSwitching(false)
      setBrowserOpen(null)
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

  /** Switch without a separate "unlink" step: the UI's whole point of the loose link. */
  const switchTo = useCallback(async (next: WorkspacePathView): Promise<void> => {
    await chooseRoot(next.path)
  }, [chooseRoot])

  /** Pick a folder directly: the old library root was often a subfolder, not a workspace root. */
  const chooseFolder = useCallback(async (): Promise<void> => {
    const path = await workspaceAccess.pickDirectory()
    if (path === null) return
    if (findWorkspaceForPath(workspaceAccess.list(), path) === undefined) {
      setNotice(t('notebook.folderNotInWorkspace'))
      return
    }
    await chooseRoot(path)
  }, [chooseRoot, setNotice, t, workspaceAccess])

  const forgetWorkspace = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setState(await notebook.clearRoot())
      setSwitching(false)
      resetView()
      setBrowserOpen(null)
    } catch (catchValue) {
      setError(messageOf(catchValue))
    } finally {
      setBusy(false)
    }
  }, [notebook, resetView, setBusy, setError, setState])

  /** One review-open request at a time: double-click / double-tap must not start two opens. */
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
    choosing,
    switching,
    browserOpen,
    openBrowser,
    toggleChoosing: () => setChoosing(current => !current),
    toggleSwitching: () => setSwitching(current => !current),
    chooseRoot,
    switchTo,
    pickNewWorkspace,
    chooseFolder,
    forgetWorkspace,
    openPage,
    deleteHistory,
  }
}
