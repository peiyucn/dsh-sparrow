/** Shared types for the review tab (data + UI). */

import type { NotebookApi } from '../api.js'
import type { ReviewBridge } from '../review-bridge.js'

/** What the tab receives from the client entry. */
export interface NoteReviewInjected {
  readonly notebook: NotebookApi
  readonly bridge: ReviewBridge
  readonly sessionId: string
}

/** Which bottom overlay is open. */
export type OverlayKind = 'annotations' | 'records' | 'diff'

/** Source view (exact lines, annotations) or read-only rendered view. */
export type ReviewView = 'source' | 'render'

/** Composer target: a selected line range or the whole document. */
export interface ComposeTarget {
  readonly scope: 'selection' | 'document'
  readonly quote: string
  readonly startLine?: number
  readonly endLine?: number
  /** Editing an existing annotation instead of adding one. */
  readonly editingId?: string
}

/** One pending line selection in the code view. */
export interface SelectionTarget {
  readonly quote: string
  readonly startLine: number
  readonly endLine: number
  /** Viewport position of the selection, used to place the floating annotate button. */
  readonly rect: { readonly top: number; readonly left: number }
}

/** The note identity one review tab is bound to. */
export interface ReviewTarget {
  readonly path: string
  readonly fileId: string
  readonly workspaceId: string
}
