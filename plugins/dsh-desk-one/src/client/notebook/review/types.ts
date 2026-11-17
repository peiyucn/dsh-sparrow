

import type { NotebookApi } from '../api.js'
import type { ReviewBridge } from '../review-bridge.js'


export interface NoteReviewInjected {
  readonly notebook: NotebookApi
  readonly bridge: ReviewBridge
  readonly sessionId: string
}


export type OverlayKind = 'annotations' | 'records' | 'diff'


export type ReviewView = 'source' | 'render'


export interface ComposeTarget {
  readonly scope: 'selection' | 'document'
  readonly quote: string
  readonly startLine?: number
  readonly endLine?: number

  readonly editingId?: string
}


export interface SelectionTarget {
  readonly quote: string
  readonly startLine: number
  readonly endLine: number

  readonly rect: { readonly top: number; readonly left: number }
}


export interface ReviewTarget {
  readonly path: string
  readonly fileId: string
  readonly workspaceId: string
}
