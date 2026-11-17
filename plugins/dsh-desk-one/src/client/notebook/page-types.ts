

import type { DeskTranslator } from '../app/types.js'
import type { NotebookStateResponse, ReviewHistoryEntry } from '../../notebook-contract.js'
import type { WorkspacePathView } from './workspaces.js'


export type NotebookMode = 'recent' | 'drafts' | 'history' | 'missing'


export interface NotebookRow {
  readonly key: string
  readonly title: string
  readonly path: string
  readonly date?: string
  readonly draftCount?: number
  readonly recordCount?: number

  readonly annotationCount?: number
  readonly missing?: boolean

  readonly record?: ReviewHistoryEntry
  readonly onOpen?: () => void
  readonly onDelete?: () => void
}


export interface NotebookPageController {
  readonly t: DeskTranslator
  readonly state: NotebookStateResponse | null
  readonly rootPath: string | undefined
  readonly workspace: WorkspacePathView | undefined
  readonly workspaces: readonly WorkspacePathView[]
  readonly error: string | null
  readonly notice: string | null
  readonly busy: boolean
  readonly mode: NotebookMode
  readonly query: string
  readonly searching: boolean
  readonly rows: readonly NotebookRow[]
  readonly page: number
  readonly pages: number
  readonly totalCount: number
  readonly total: number

  readonly summary: string

  readonly summaryHint: string | null
  readonly history: readonly ReviewHistoryEntry[]
  readonly historyBytes: number
  readonly historyWarn: boolean
  readonly reload: () => Promise<void>

  readonly ready: boolean

  readonly openFolder: () => Promise<void>
  readonly chooseRoot: (path: string) => Promise<void>
  readonly pickNewWorkspace: () => Promise<void>

  readonly switchTo: (workspace: WorkspacePathView) => Promise<void>
  readonly setMode: (mode: NotebookMode) => void
  readonly setQuery: (query: string) => void
  readonly setPage: (page: number) => void
  readonly openPage: (path: string) => Promise<void>
  readonly deleteHistory: (id: string) => Promise<void>
}
