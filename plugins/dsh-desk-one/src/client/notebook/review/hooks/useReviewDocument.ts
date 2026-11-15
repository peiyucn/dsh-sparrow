/**
 * Review document data controller: the page read, the per-file draft box (with its revision queue),
 * the round baseline and the submitted records — plus the visibility-gated quiet refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DraftAnnotation, NotebookPageResponse, ReviewHistoryEntry } from '../../../../notebook-contract.js'
import type { DiffBlockLabels, MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../../../app/types.js'
import { createLoadTickets, messageOf } from '../../../app/utils.js'
import { HttpError } from '../../../http.js'
import type { NotebookApi } from '../../api.js'
import { lineChanges } from '../changes.js'
import { pageText, sameReviewPage } from '../page.js'
import { REVIEW_REFRESH_INTERVAL_MS, shouldRefreshOnShow } from '../refresh.js'
import type { ReviewTarget } from '../types.js'

/** How long a transient notice stays on screen. */
const NOTICE_MS = 4_000

/** Everything the review view needs from the host data. */
export interface ReviewDocumentController {
  readonly page: NotebookPageResponse | null
  readonly loading: boolean
  readonly error: string | null
  readonly notice: string | null
  readonly baselineAt: string | null
  readonly records: readonly ReviewHistoryEntry[] | null
  readonly annotations: readonly DraftAnnotation[]
  readonly lines: readonly string[]
  readonly currentText: string
  readonly changes: ReturnType<typeof lineChanges>
  readonly changedLines: ReadonlySet<number>
  readonly diff: { readonly oldText: string; readonly newText: string } | null
  readonly totals: { readonly added: number; readonly removed: number } | null
  readonly markdownLabels: MarkdownLabels
  readonly diffLabels: DiffBlockLabels
  readonly load: () => Promise<void>
  readonly loadRecords: () => Promise<void>
  readonly persist: (next: readonly DraftAnnotation[]) => void
  readonly setNotice: (notice: string | null) => void
}

/** Load and keep one review tab's document state. */
export function useReviewDocument(input: {
  readonly notebook: NotebookApi
  readonly sessionId: string
  readonly target: ReviewTarget | undefined
  readonly tabVisible: boolean
  readonly t: DeskTranslator
}): ReviewDocumentController {
  const { notebook, sessionId, target, tabVisible, t } = input
  const path = target?.path
  const fileId = target?.fileId
  const [page, setPage] = useState<NotebookPageResponse | null>(null)
  const [annotations, setAnnotations] = useState<readonly DraftAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [baselineAt, setBaselineAt] = useState<string | null>(null)
  const [records, setRecords] = useState<readonly ReviewHistoryEntry[] | null>(null)
  /** Revision of the persisted draft box last adopted from / written to the host (0 = none yet). */
  const revisionRef = useRef<number | undefined>(undefined)
  /** Draft-box writes run in edit order; concurrent PUTs must not reorder a delete and an add. */
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  /** Latest-request-wins tickets: a quiet poll or a manual refresh must not overwrite a newer read. */
  const loadTickets = useRef(createLoadTickets())
  const recordsTickets = useRef(createLoadTickets())
  /** Loads in flight; a quiet tick skips instead of queueing behind a slow read. */
  const inFlight = useRef(0)
  /** Previous tab visibility, so returning on screen refreshes without waiting for the next tick. */
  const visibleRef = useRef(tabVisible)

  const load = useCallback(async (silent = false): Promise<void> => {
    if (path === undefined || fileId === undefined) return
    // A quiet tick must not pile up behind a slow read; the next tick runs after this one settles.
    if (silent && inFlight.current > 0) return
    const ticket = loadTickets.current.take()
    inFlight.current += 1
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      // The file identity remembers its own workspace root, so a review no longer depends on a
      // single global notebook library.
      const { page: nextPage } = await notebook.openById(fileId)
      const nextText = pageText(nextPage)
      const draft = await notebook.draft(fileId)
      const stored = await notebook.loadBaseline(sessionId)
      // A previous read may still be in flight when a manual refresh starts; only the newest ticket
      // may write state, otherwise the older response lands last and the diff jumps back.
      if (!loadTickets.current.isLatest(ticket)) return
      setPage(current => current !== null && sameReviewPage(current, nextPage) ? current : nextPage)
      if (!silent) {
        revisionRef.current = draft?.revision ?? 0
        setAnnotations(draft?.drafts ?? [])
      }
      // A Session can be reused past the note it was opened for; only the baseline bound to this
      // tab's note is this round's baseline, otherwise the diff would compare two different notes.
      const usableBaseline = stored.baseline !== undefined && stored.baseline.fileId === fileId
      if (usableBaseline) {
        setBaseline(stored.baseline.body)
        setBaselineAt(stored.baseline.at)
      } else if (!silent) {
        const at = new Date().toISOString()
        setBaseline(nextText)
        setBaselineAt(at)
        void notebook.saveBaseline({ sessionId, fileId, body: nextText, at })
          .then((saved) => {
            if (!loadTickets.current.isLatest(ticket)) return
            if (saved.baseline === undefined) setNotice(t('review.baselineMemoryOnly'))
          })
          .catch((cause: unknown) => {
            if (!loadTickets.current.isLatest(ticket)) return
            setNotice(t('review.baselineSaveFailed', { message: messageOf(cause) }))
          })
      }
    } catch (cause) {
      if (!loadTickets.current.isLatest(ticket)) return
      if (!silent) setError(messageOf(cause))
    } finally {
      inFlight.current = Math.max(0, inFlight.current - 1)
      // Only the newest manual load owns the spinner. A silent load never turns it on, and a
      // superseded manual load must not hide the spinner of the load that replaced it.
      if (!silent && loadTickets.current.isLatest(ticket)) setLoading(false)
    }
  }, [fileId, notebook, path, sessionId, t])

  useEffect(() => { void load() }, [load])

  /** Records are per file: filter the submitted history by the tab's fileId (or its resolved path). */
  const loadRecords = useCallback(async (): Promise<void> => {
    const ticket = recordsTickets.current.take()
    if (fileId === undefined) {
      setRecords([])
      return
    }
    try {
      const payload = await notebook.history()
      if (!recordsTickets.current.isLatest(ticket)) return
      setRecords(payload.entries.filter(entry => entry.record.fileId === fileId
        || (path !== undefined && entry.resolvedPath === path)))
    } catch {
      if (recordsTickets.current.isLatest(ticket)) setRecords([])
    }
  }, [fileId, notebook, path])

  useEffect(() => { void loadRecords() }, [loadRecords])

  // Quiet refresh only while this tab is actually on screen. `keepMounted` bodies stay alive for
  // hidden tabs / other panes, and the browser tab visibility alone does not cover that; the
  // official tab info's `visible` is the authoritative "foreground Session shows this tab" signal.
  useEffect(() => {
    const wasVisible = visibleRef.current
    visibleRef.current = tabVisible
    if (!tabVisible) return
    const refresh = (withRecords: boolean): void => {
      if (document.visibilityState !== 'visible') return
      void load(true)
      // Submitted records only change on submit (which reloads them) or through another window;
      // the 5 s tick exists for the document diff, so it must not re-read the whole history.
      if (withRecords) void loadRecords()
    }
    const onVisible = (): void => refresh(true)
    const onTick = (): void => refresh(false)
    // A kept-mounted tab is not remounted when it returns; without this immediate read the user
    // waits for the next poll to see edits made while the tab was hidden.
    if (shouldRefreshOnShow(wasVisible, tabVisible)) onVisible()
    document.addEventListener('visibilitychange', onVisible)
    // Returning from another application does not fire `visibilitychange`; a focused window is the
    // same "the document may have changed while I was away" moment.
    window.addEventListener('focus', onVisible)
    const timer = setInterval(onTick, REVIEW_REFRESH_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(timer)
    }
  }, [load, loadRecords, tabVisible])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  /** Persist the draft box (per file identity); queued so host writes keep the edit order. */
  const persist = useCallback((next: readonly DraftAnnotation[]): void => {
    setAnnotations(next)
    if (fileId === undefined) return
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      try {
        const expectedRevision = revisionRef.current
        const saved = await notebook.saveDraft({
          fileId,
          drafts: next,
          ...expectedRevision === undefined ? {} : { expectedRevision },
        })
        revisionRef.current = saved?.revision ?? 0
      } catch (cause) {
        if (cause instanceof HttpError && cause.status === 409) {
          // Another window / pane wrote first. Re-read the authoritative box (revision included) so
          // the next edit starts from a valid revision; the user stays informed.
          setNotice(t('review.draftConflict'))
          try {
            const latest = await notebook.draft(fileId)
            revisionRef.current = latest?.revision ?? 0
            setAnnotations(latest?.drafts ?? [])
          } catch {
            // Re-read failed too: keep the local list, the next save retries from scratch.
          }
          return
        }
        setNotice(t('review.draftSaveFailed', { message: messageOf(cause) }))
      }
    })
  }, [fileId, notebook, t])

  const lines = useMemo(() => (page === null ? [] : pageText(page).split('\n')), [page])
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('review.copy'), copiedLabel: t('review.copied') },
    footnotes: t('review.footnotes'),
  }), [t])
  const diffLabels = useMemo<DiffBlockLabels>(() => ({
    codeLabel: t('review.text'),
    wrapLabel: t('review.wrap'),
    unwrapLabel: t('review.unwrap'),
    copy: t('review.copy'),
    copied: t('review.copied'),
    collapseAria: t('review.collapse'),
    expandAria: (hidden: number) => t('review.expand', { hidden }),
    collapse: t('review.collapse'),
    expand: (hidden: number) => t('review.expand', { hidden }),
  }), [t])
  const currentText = page === null ? '' : pageText(page)
  // One line-level script drives both the in-place highlight and the ± counts in the bottom bar,
  // so the code view and "this round's changes" can never disagree.
  const changes = useMemo(
    () => baseline === null || page === null ? null : lineChanges(baseline, currentText),
    [baseline, currentText, page],
  )
  const changedLines = useMemo(() => new Set(changes?.addedLines ?? []), [changes])
  const diff = changes === null || baseline === null ? null : { oldText: baseline, newText: currentText }
  const totals = changes === null ? null : { added: changes.addedLines.length, removed: changes.removed }

  return {
    page,
    loading,
    error,
    notice,
    baselineAt,
    records,
    annotations,
    lines,
    currentText,
    changes,
    changedLines,
    diff,
    totals,
    markdownLabels,
    diffLabels,
    load,
    loadRecords,
    persist,
    setNotice,
  }
}
