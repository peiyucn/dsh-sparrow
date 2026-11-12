/**
 * Notebook (minimal) contracts: library index, file identity, the persisted draft box, and the
 * review history. Review state itself stays in the conversation; stored objects are:
 *   - notebook-config: the single library root
 *   - note-file: one lazily assigned file identity (path + content hash)
 *   - note-draft: the unsaved annotations of one file
 *   - review-record: one submitted review (annotations + file snapshot metadata)
 */

/** One page in the library index (derived, never written back into the file). */
export interface NotebookEntry {
  /** Path relative to the library root, `/`-separated. */
  readonly path: string
  readonly title: string
  readonly date?: string
  readonly type?: string
  readonly tags: readonly string[]
  readonly hasFrontmatter: boolean
  /** True when the body is blank (frontmatter or whitespace only). */
  readonly emptyBody: boolean
  readonly bytes: number
  /** Last modification instant (ISO-8601). */
  readonly mtime: string
}

/** Header counts for the library. */
export interface NotebookStats {
  readonly total: number
  readonly missingFrontmatter: number
  readonly emptyBody: number
}

/** The single configured notes root record (fixed id `notebook_config`). */
export interface DeskNotebookConfig {
  readonly id: string
  readonly kind: 'notebook-config'
  readonly schema: number
  readonly rootPath: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** One frontmatter field as the review tab shows it. */
export interface NotebookField {
  readonly name: string
  readonly value: string
}

/** One page read for the review tab. */
export interface NotebookPageResponse {
  readonly path: string
  readonly title: string
  readonly kind: 'markdown' | 'text'
  readonly fields: readonly NotebookField[]
  readonly body: string
  readonly bytes: number
}

/** One lazily assigned file identity (survives renames while the content matches). */
export interface NoteFileRef {
  readonly id: string
  readonly kind: 'note-file'
  readonly schema: number
  readonly rootPath: string
  /** Current relative path. */
  readonly path: string
  /** sha256 of the file content at the last assignment/resolution. */
  readonly hash: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** One unsaved annotation. Lines are exact source lines in the code view. */
export interface DraftAnnotation {
  readonly id: string
  readonly quote: string
  readonly text: string
  /** Whole-document annotation: the quote is the title and no line range is attached. */
  readonly scope?: 'document'
  /** First source line (1-based), exact in the code view. */
  readonly startLine?: number
  /** Last source line, inclusive. */
  readonly endLine?: number
  readonly createdAt: string
}

/** The persisted draft box of one file (id derives from the file identity). */
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

/** One submitted review (annotations + the file snapshot metadata at submit time). */
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

/** How one history entry currently relates to the file on disk. */
export type ReviewLinkStatus = 'linked' | 'moved' | 'detached'

/** One history entry with the current link state resolved by the host. */
export interface ReviewHistoryEntry {
  readonly record: ReviewRecord
  readonly status: ReviewLinkStatus
  /** Current path when the file is still reachable. */
  readonly resolvedPath?: string
}

export interface NotebookStateResponse {
  readonly config: DeskNotebookConfig | null
  readonly stats: NotebookStats
  readonly recent: readonly NotebookEntry[]
  /** Files with unsaved annotations. */
  readonly drafts: readonly NoteDraft[]
  readonly draftCount: number
  readonly historyCount: number
  readonly historyBytes: number
  /** True when the library root looks like a note2md-managed workspace. */
  readonly note2md: boolean
}

/** One immediate subfolder of the selected tree node. */
export interface NotebookTreeFolder {
  readonly path: string
  readonly name: string
  /** Number of indexed files anywhere below this folder. */
  readonly count: number
}

/** One level of the library tree. */
export interface NotebookTreeResponse {
  readonly path: string
  readonly folders: readonly NotebookTreeFolder[]
  readonly files: readonly NotebookEntry[]
  readonly totalFiles: number
}

export interface NotebookRootRequest {
  readonly rootPath: string
}

export interface NotebookSearchResponse {
  readonly entries: readonly NotebookEntry[]
  readonly truncated: boolean
}

export interface NotebookFileResponse {
  readonly file: NoteFileRef
}

export interface NoteDraftRequest {
  readonly fileId: string
  readonly drafts: readonly DraftAnnotation[]
}

export interface NoteDraftResponse {
  readonly draft: NoteDraft | null
}

export interface CreateNotebookNoteRequest {
  readonly title: string
  /** Optional subfolder, `/`-separated. */
  readonly folder?: string
}

export interface CreateNoteResponse {
  readonly path: string
}

export interface RecordReviewRequest {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId: string
  readonly annotations: readonly DraftAnnotation[]
}

export interface ReviewHistoryResponse {
  readonly entries: readonly ReviewHistoryEntry[]
  readonly bytes: number
}

export interface DeleteReviewRequest {
  readonly id: string
}
