/**
 * Annotation contracts: file identity, the persisted draft box, baselines, and the review history.
 * Review state itself stays in the conversation; stored objects are:
 *   - note-file: one lazily assigned file identity (workspace root + relative path + content hash)
 *   - note-draft: the unsaved annotations of one file
 *   - note-baseline: this round's baseline body, one per annotation session
 *   - review-record: one submitted review (annotations + file snapshot metadata)
 *   - review-session: the durable marker that one session was opened by the annotation flow
 *
 * The notebook library is gone, but the legacy `notebook-config` record must keep validating: a
 * profile written before the refactor still has one, and an unknown kind at open time would make
 * the whole storage domain fail (and with it every plugin route).
 */

/** Legacy notebook-root record: no longer read or written, kept only for stored-data compatibility. */
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

/** The single linked notes root record (fixed id `notebook_config`). */
export interface DeskNotebookConfig {
  readonly id: string
  readonly kind: 'notebook-config'
  readonly schema: number
  readonly rootPath: string
  /**
   * Legacy field from the removed AI-draft flow: old records may carry it, new ones never write it.
   */
  readonly skillName?: string | null
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
  /** Raw frontmatter block (both fences), empty for text files / files without metadata. */
  readonly frontmatter: string
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

/** One review round's baseline body, stored host-side so clearing browser storage does not lose it. */
export interface NoteBaseline {
  readonly id: string
  readonly kind: 'note-baseline'
  readonly schema: number
  /** Review session this round belongs to (legacy records may omit it). */
  readonly sessionId?: string
  readonly fileId: string
  readonly rootPath: string
  readonly body: string
  /** ISO time when the baseline was taken. */
  readonly at: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** Body + capture time returned to the review tab. */
export interface NoteBaselinePayload {
  readonly body: string
  readonly at: string
  /**
   * File identity the baseline belongs to. A Session can outlive (or be reused past) the note it
   * was opened for, so the client verifies this before treating the stored body as this tab's round
   * baseline; a mismatch must re-baseline instead of showing a cross-note diff.
   */
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
}

export interface NotebookRootRequest {
  readonly rootPath: string
}

export interface NotebookSearchResponse {
  readonly entries: readonly NotebookEntry[]
  readonly truncated: boolean
}

/** One page of the whole library, newest first, with the total for paging. */
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
  /**
   * Optimistic-concurrency guard: the draft-box revision the caller last saw (0 = no record yet).
   * A mismatch is a conflict (another window/pane wrote first) and must not overwrite silently.
   */
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

/** Durable marker: this Session was opened by the review flow (drives the sidebar hint icon). */
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
  /** Durable markers with the note identity, so the client can reopen a file's existing review. */
  readonly sessions?: readonly ReviewSessionInfo[]
}

/** Lightweight durable marker the client keeps to find a note's existing review Session. */
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
