/**
 * Notebook actions: library linking (workspace picker / choose / unlink), review opening, note
 * creation and history deletion. All user-visible busy/notice state lives here; the library data is
 * mutated through the setters the data hook exposes.
 */

import { useCallback, useRef, useState } from 'react'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'
import type { NotebookApi } from '../api.js'
import type { ReviewOpenInput, ReviewOpenResult } from '../review-bridge.js'
import type { WorkspaceAccess } from '../workspaces.js'
import type { NotebookLibrary } from './useNotebookLibrary.js'

/** First non-empty line of the brief, used as the title of an empty note. */
function titleOfBrief(brief: string, fallback: string): string {
  for (const line of brief.split(/\r?\n/u)) {
    const cleaned = line.replace(/^[#>*\-\s]+/u, '').trim()
    if (cleaned !== '') return cleaned.slice(0, 60)
  }
  return fallback
}

/** Everything the page body and header actions can trigger. */
export interface NotebookActions {
  readonly choosing: boolean
  readonly newOpen: boolean
  readonly brief: string
  readonly browserOpen: 'pending' | 'opened' | 'failed' | null
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
  readonly onDraftWithAi: (workspaceId: string, prompt: string) => void
  /** Reset the list view to the initial recent page (after linking / unlinking a root). */
  readonly resetView: () => void
}): NotebookActions {
  const { t, notebook, workspaceAccess, library, onOpenReview, onOpenBrowser, onDraftWithAi, resetView } = input
  const { state, workspace, reload, setState, setHistory, setError, setNotice, setBusy } = library
  const [choosing, setChoosing] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [brief, setBrief] = useState('')
  const [browserOpen, setBrowserOpen] = useState<'pending' | 'opened' | 'failed' | null>(null)

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
  }, [onOpenBrowser, setNotice, t, workspace])

  const chooseRoot = useCallback(async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setState(await notebook.setRoot(path))
      setChoosing(false)
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

  const disconnect = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setState(await notebook.clearRoot())
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
  }, [brief, notebook, openPage, reload, setBusy, setNotice, t])

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
  }, [brief, onDraftWithAi, setNotice, state?.skillName, t, workspace])

  const chooseSkill = useCallback(async (name: string | null): Promise<void> => {
    setBusy(true)
    try {
      setState(await notebook.setSkill(name))
    } catch (cause) {
      setNotice(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, setBusy, setNotice, setState])

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
    newOpen,
    brief,
    browserOpen,
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
    openPage,
    deleteHistory,
  }
}
