

import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NotebookStateResponse, ReviewHistoryEntry } from '../../../notebook-contract.js'
import { messageOf } from '../../app/utils.js'
import type { NotebookApi } from '../api.js'
import type { WorkspaceAccess, WorkspacePathView } from '../workspaces.js'
import { findWorkspaceForPath } from '../workspaces.js'


export interface NotebookLibrary {
  readonly state: NotebookStateResponse | null
  readonly history: readonly ReviewHistoryEntry[]
  readonly error: string | null
  readonly notice: string | null
  readonly busy: boolean
  readonly ready: boolean
  readonly rootPath: string | undefined
  readonly workspace: WorkspacePathView | undefined
  readonly workspaces: readonly WorkspacePathView[]
  readonly reload: () => Promise<void>
  readonly setState: Dispatch<SetStateAction<NotebookStateResponse | null>>
  readonly setHistory: Dispatch<SetStateAction<readonly ReviewHistoryEntry[]>>
  readonly setError: Dispatch<SetStateAction<string | null>>
  readonly setNotice: Dispatch<SetStateAction<string | null>>
  readonly setBusy: Dispatch<SetStateAction<boolean>>
}


export function useNotebookLibrary(input: {
  readonly active: boolean
  readonly notebook: NotebookApi
  readonly workspaceAccess: WorkspaceAccess
}): NotebookLibrary {
  const { active, notebook, workspaceAccess } = input
  const [state, setState] = useState<NotebookStateResponse | null>(null)
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

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


  useEffect(() => {
    if (active) void reload()
  }, [active, reload])

  const rootPath = state?.config?.rootPath
  const workspaces = workspaceAccess.list()
  const workspace = rootPath === undefined ? undefined : findWorkspaceForPath(workspaces, rootPath)

  return {
    state,
    history,
    error,
    notice,
    busy,
    ready,
    rootPath,
    workspace,
    workspaces,
    reload,
    setState,
    setHistory,
    setError,
    setNotice,
    setBusy,
  }
}
