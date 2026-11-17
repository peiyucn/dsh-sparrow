

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


const NOTICE_MS = 4_000


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

  const revisionRef = useRef<number | undefined>(undefined)

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const loadTickets = useRef(createLoadTickets())
  const recordsTickets = useRef(createLoadTickets())

  const inFlight = useRef(0)

  const visibleRef = useRef(tabVisible)

  const load = useCallback(async (silent = false): Promise<void> => {
    if (path === undefined || fileId === undefined) return

    if (silent && inFlight.current > 0) return
    const ticket = loadTickets.current.take()
    inFlight.current += 1
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {


      const { page: nextPage } = await notebook.openById(fileId)
      const nextText = pageText(nextPage)
      const draft = await notebook.draft(fileId)
      const stored = await notebook.loadBaseline(sessionId)


      if (!loadTickets.current.isLatest(ticket)) return
      setPage(current => current !== null && sameReviewPage(current, nextPage) ? current : nextPage)
      if (!silent) {
        revisionRef.current = draft?.revision ?? 0
        setAnnotations(draft?.drafts ?? [])
      }


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


      if (!silent && loadTickets.current.isLatest(ticket)) setLoading(false)
    }
  }, [fileId, notebook, path, sessionId, t])

  useEffect(() => { void load() }, [load])


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




  useEffect(() => {
    const wasVisible = visibleRef.current
    visibleRef.current = tabVisible
    if (!tabVisible) return
    const refresh = (withRecords: boolean): void => {
      if (document.visibilityState !== 'visible') return
      void load(true)


      if (withRecords) void loadRecords()
    }
    const onVisible = (): void => refresh(true)
    const onTick = (): void => refresh(false)


    if (shouldRefreshOnShow(wasVisible, tabVisible)) onVisible()
    document.addEventListener('visibilitychange', onVisible)


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


          setNotice(t('review.draftConflict'))
          try {
            const latest = await notebook.draft(fileId)
            revisionRef.current = latest?.revision ?? 0
            setAnnotations(latest?.drafts ?? [])
          } catch {

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
