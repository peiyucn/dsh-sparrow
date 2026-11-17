


export interface NotebookEntry {

  readonly path: string
  readonly title: string
  readonly date?: string
  readonly type?: string
  readonly tags: readonly string[]
  readonly hasFrontmatter: boolean

  readonly emptyBody: boolean
  readonly bytes: number

  readonly mtime: string
}


export interface NotebookStats {
  readonly total: number
  readonly missingFrontmatter: number
  readonly emptyBody: number
}


export interface DeskNotebookConfig {
  readonly id: string
  readonly kind: 'notebook-config'
  readonly schema: number
  readonly rootPath: string

  readonly skillName?: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface NotebookField {
  readonly name: string
  readonly value: string
}


export interface NotebookPageResponse {
  readonly path: string
  readonly title: string
  readonly kind: 'markdown' | 'text'
  readonly fields: readonly NotebookField[]

  readonly frontmatter: string
  readonly body: string
  readonly bytes: number
}


export interface NoteFileRef {
  readonly id: string
  readonly kind: 'note-file'
  readonly schema: number
  readonly rootPath: string

  readonly path: string

  readonly hash: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface DraftAnnotation {
  readonly id: string
  readonly quote: string
  readonly text: string

  readonly scope?: 'document'

  readonly startLine?: number

  readonly endLine?: number
  readonly createdAt: string
}


export interface NoteBaseline {
  readonly id: string
  readonly kind: 'note-baseline'
  readonly schema: number

  readonly sessionId?: string
  readonly fileId: string
  readonly rootPath: string
  readonly body: string

  readonly at: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface NoteBaselinePayload {
  readonly body: string
  readonly at: string

  readonly fileId: string
}

export interface NotebookBaselineResponse {
  readonly baseline?: NoteBaselinePayload
}

export interface NoteBaselineRequest {
  readonly sessionId: string
  readonly fileId: string
  readonly body: string
  readonly at: string
}


export interface NoteDraft {
  readonly id: string
  readonly kind: 'note-draft'
  readonly schema: number
  readonly rootPath: string
  readonly path: string
  readonly fileId: string
  readonly drafts: readonly DraftAnnotation[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface ReviewRecord {
  readonly id: string
  readonly kind: 'review-record'
  readonly schema: number
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId: string
  readonly fileTitle: string
  readonly pathSnapshot: string
  readonly annotations: readonly DraftAnnotation[]
  readonly bytes: number
  readonly createdAt: string
}


export type ReviewLinkStatus = 'linked' | 'moved' | 'detached'


export interface ReviewHistoryEntry {
  readonly record: ReviewRecord
  readonly status: ReviewLinkStatus

  readonly resolvedPath?: string
}

export interface NotebookStateResponse {
  readonly config: DeskNotebookConfig | null
  readonly stats: NotebookStats
  readonly recent: readonly NotebookEntry[]

  readonly drafts: readonly NoteDraft[]
  readonly draftCount: number
  readonly historyCount: number
  readonly historyBytes: number
}

export interface NotebookRootRequest {
  readonly rootPath: string
}

export interface NotebookSearchResponse {
  readonly entries: readonly NotebookEntry[]
  readonly truncated: boolean
}


export interface NotebookListResponse {
  readonly entries: readonly NotebookEntry[]
  readonly total: number
}

export interface NotebookFileResponse {
  readonly file: NoteFileRef
}

export interface NoteDraftRequest {
  readonly fileId: string
  readonly drafts: readonly DraftAnnotation[]

  readonly expectedRevision?: number
}

export interface NoteDraftResponse {
  readonly draft: NoteDraft | null
}

export interface RecordReviewRequest {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId: string
  readonly annotations: readonly DraftAnnotation[]
}


export interface ReviewSessionMarker {
  readonly id: string
  readonly kind: 'review-session'
  readonly schema: number
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

export interface MarkReviewSessionRequest {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
}

export interface ReviewSessionListResponse {
  readonly sessionIds: readonly string[]

  readonly sessions?: readonly ReviewSessionInfo[]
}


export interface ReviewSessionInfo {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
  readonly updatedAt: string
}

export interface ReviewHistoryResponse {
  readonly entries: readonly ReviewHistoryEntry[]
  readonly bytes: number
}

export interface DeleteReviewRequest {
  readonly id: string
}
