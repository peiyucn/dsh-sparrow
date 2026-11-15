/** Types shared by the notebook page controller and the presenter components. */

import type { DeskTranslator } from '../app/types.js'
import type { NotebookStateResponse, ReviewHistoryEntry } from '../../notebook-contract.js'
import type { WorkspacePathView } from './workspaces.js'

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
  readonly mode: NotebookMode
  readonly query: string
  readonly searching: boolean
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
  /** Open the official workspace files page (the top-row button). */
  readonly openFolder: () => Promise<void>
  readonly chooseRoot: (path: string) => Promise<void>
  readonly pickNewWorkspace: () => Promise<void>
  /** Switch the linked workspace without unlinking first (header selector). */
  readonly switchTo: (workspace: WorkspacePathView) => Promise<void>
  readonly setMode: (mode: NotebookMode) => void
  readonly setQuery: (query: string) => void
  readonly setPage: (page: number) => void
  readonly openPage: (path: string) => Promise<void>
  readonly deleteHistory: (id: string) => Promise<void>
}
