/**
 * Notebook (minimal) contracts: library library index, single-page reads, and the persisted
 * draft box. Review state itself stays in the conversation; only the user's unsaved
 * annotations are stored, keyed by the file they belong to.
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

/** One unsaved annotation (the persisted draft shape). */
export interface DraftAnnotation {
  readonly id: string
  readonly quote: string
  readonly text: string
  /** Approximate first source line of the quote (1-based). */
  readonly line?: number
  /** Approximate last source line of the quote. */
  readonly endLine?: number
  readonly createdAt: string
}

/** The persisted draft box of one file (id is derived from cwd + path). */
export interface NoteDraft {
  readonly id: string
  readonly kind: 'note-draft'
  readonly schema: number
  readonly cwd: string
  readonly path: string
  readonly drafts: readonly DraftAnnotation[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

export interface NotebookStateResponse {
  readonly config: DeskNotebookConfig | null
  readonly stats: NotebookStats
  readonly recent: readonly NotebookEntry[]
}

export interface NotebookRootRequest {
  readonly rootPath: string
  /** True when the root was deliberately re-pointed; false/absent keeps drafts of other files. */
  readonly keepDrafts?: boolean
}

export interface NotebookSearchResponse {
  readonly entries: readonly NotebookEntry[]
  readonly truncated: boolean
}

export interface NoteDraftRequest {
  readonly cwd: string
  readonly path: string
  readonly drafts: readonly DraftAnnotation[]
}

export interface NoteDraftResponse {
  readonly draft: NoteDraft | null
}

/** A changed window the review tab shows above the document. */
export interface ReviewDiffResponse {
  readonly path: string
  readonly oldText: string
  readonly newText: string
}
