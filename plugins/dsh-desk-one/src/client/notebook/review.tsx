/**
 * Review tab: source-code view with exact line numbers, inline annotations, and this tab's changes.
 *
 * The code view (not rendered markdown) is deliberate: selecting lines maps directly to source
 * lines, so annotations anchor exactly, inline cards sit under their line range, and the batch
 * sent to the AI carries exact `Lines:` information. Review state lives in the conversation; the
 * stored objects are the per-file draft box and submitted history records.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button, DiffBlock, DisclosureRow, FileTypeIcon, IconChevronDownOutlineRegular, IconClockOutlineRegular, IconCopyOutlineRegular,
  IconInfoOutlineRegular, IconInspectOutlineRegular, IconListPenOutlineRegular, IconRefreshOutlineRegular,
  MarkdownText, SegmentedTabs, Tooltip, diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { persistReviewSession } from '../reviewSessions.js'
import type { DraftAnnotation, NotebookPageResponse, ReviewHistoryEntry } from '../../notebook-contract.js'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotebookApi } from './api.js'
import type { NoteReviewParams, ReviewBridge } from './review-bridge.js'

/** What the tab receives from the client entry. */
export interface NoteReviewInjected {
  readonly notebook: NotebookApi
  readonly bridge: ReviewBridge
  readonly sessionId: string
}

type ReviewProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<NoteReviewInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

/** Which bottom overlay is open. */
type OverlayKind = 'annotations' | 'records' | 'diff'

/** Composer target: a selected line range or the whole document. */
interface ComposeTarget {
  readonly scope: 'selection' | 'document'
  readonly quote: string
  readonly startLine?: number
  readonly endLine?: number
  /** Editing an existing annotation instead of adding one. */
  readonly editingId?: string
  /** Viewport position of the floating input (falls back to the tab bottom). */
  readonly rect?: { readonly top: number; readonly left: number }
}

/** Comment text cap. */
const TEXT_MAX_CHARS = 4_000

/** Quote one passage as a markdown blockquote. */
function quoteBlock(quote: string): string {
  return quote.split('\n').map(line => `> ${line}`).join('\n')
}

/** Render one annotation card (inline under its line range, or in the document scope). */
function AnnotationCard(props: {
  readonly t: DeskTranslator
  readonly annotation: DraftAnnotation
  readonly onEdit: () => void
  readonly onDelete: () => void
}): ReactElement {
  const { t, annotation, onEdit, onDelete } = props
  const range = annotation.startLine === undefined
    ? t('review.documentScope')
    : annotation.endLine === undefined || annotation.endLine === annotation.startLine
      ? t('review.lineHint', { start: annotation.startLine, end: annotation.startLine })
      : t('review.lineHint', { start: annotation.startLine, end: annotation.endLine })
  return (
    <div className="dsh-desk-review-anno">
      <div className="dsh-desk-review-annohead">
        <span className="dsh-desk-review-annorange">{range}</span>
        {annotation.quote === '' ? null : <span className="dsh-desk-review-annoquote">{annotation.quote.split('\n')[0]?.slice(0, 80)}</span>}
        <Button variant="ghost" size="sm" onClick={onEdit}>{t('review.edit')}</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>{t('review.delete')}</Button>
      </div>
      <p className="dsh-desk-review-annotext">{annotation.text}</p>
    </div>
  )
}

/** Notes review tab. */
export function NoteReviewTab(props: ReviewProps): ReactElement {
  const { t, notebook, bridge, sessionId, useTabInfo } = props
  const info = useTabInfo()
  const params = info.tab.navigation.params as NoteReviewParams | undefined
  const path = params?.path
  const fileId = params?.fileId
  const workspaceId = params?.workspaceId
  // Any session showing the review tab counts as a review session, including ones opened before
  // this build. Marking is durable so the sidebar icon survives a restart.
  useEffect(() => {
    persistReviewSession(notebook, {
      sessionId,
      ...workspaceId === undefined ? {} : { workspaceId },
      ...fileId === undefined ? {} : { fileId },
    })
  }, [fileId, notebook, sessionId, workspaceId])
  const codeRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const floatRef = useRef<HTMLButtonElement | null>(null)

  const [page, setPage] = useState<NotebookPageResponse | null>(null)
  const [annotations, setAnnotations] = useState<readonly DraftAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [baselineAt, setBaselineAt] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ readonly quote: string; readonly startLine: number; readonly endLine: number; readonly rect: { readonly top: number; readonly left: number } } | null>(null)
  const [composer, setComposer] = useState<ComposeTarget | null>(null)
  const [comment, setComment] = useState('')
  const [overlay, setOverlay] = useState<OverlayKind | null>(null)
  /** Submitted records for this file (null while the first fetch runs). */
  const [records, setRecords] = useState<readonly ReviewHistoryEntry[] | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  /** Source view (exact lines, annotations) or read-only rendered view. */
  const [view, setView] = useState<'source' | 'render'>('source')
  /** Frontmatter stays collapsed so the body owns the pane by default. */
  const [fieldsOpen, setFieldsOpen] = useState(false)

  const lines = useMemo(() => (page === null ? [] : page.body.split('\n')), [page])
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

  const load = useCallback(async (silent = false): Promise<void> => {
    if (path === undefined || fileId === undefined) return
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      await notebook.state()
      const nextPage = await notebook.page(path)
      const draft = await notebook.draft(fileId)
      const stored = await notebook.loadBaseline(fileId)
      setPage(current => current !== null && current.body === nextPage.body ? current : nextPage)
      if (!silent) setAnnotations(draft?.drafts ?? [])
      if (stored.baseline !== undefined) {
        setBaseline(stored.baseline.body)
        setBaselineAt(stored.baseline.at)
      } else if (!silent) {
        const at = new Date().toISOString()
        setBaseline(nextPage.body)
        setBaselineAt(at)
        void notebook.saveBaseline({ fileId, body: nextPage.body, at })
      }
    } catch (cause) {
      if (!silent) setError(messageOf(cause))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [fileId, notebook, path])

  useEffect(() => { void load() }, [load])

  /** Records are per file: filter the submitted history by the tab's fileId (or its resolved path). */
  const loadRecords = useCallback(async (): Promise<void> => {
    if (fileId === undefined) {
      setRecords([])
      return
    }
    try {
      const payload = await notebook.history()
      setRecords(payload.entries.filter(entry => entry.record.fileId === fileId
        || (path !== undefined && entry.resolvedPath === path)))
    } catch {
      setRecords([])
    }
  }, [fileId, notebook, path])

  useEffect(() => { void loadRecords() }, [loadRecords])

  // Quiet refresh while visible; a hidden tab does no work.
  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState !== 'visible') return
      void load(true)
      void loadRecords()
    }
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [load, loadRecords])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 4_000)
    return () => clearTimeout(timer)
  }, [notice])

  /** Drop the pending selection (state, float button and the browser's own highlight). */
  const cancelSelection = useCallback((): void => {
    setComposer(null)
    setComment('')
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  // Escape or a click outside the inline composer cancels the pending annotation.
  useEffect(() => {
    if (composer === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelSelection()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const composerElement = composerRef.current
      if (composerElement !== null && event.target instanceof Node && composerElement.contains(event.target)) return
      cancelSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [cancelSelection, composer])

  // Clicking anywhere but the float "annotate" button drops the pending selection, so the
  // highlight never gets stuck without a way out.
  useEffect(() => {
    if (selection === null || composer !== null) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (floatRef.current?.contains(target) === true) return
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [composer, selection])

  /** Persist the draft box (per file identity). */
  const persist = useCallback((next: readonly DraftAnnotation[]): void => {
    setAnnotations(next)
    if (fileId === undefined) return
    void notebook.saveDraft({ fileId, drafts: next })
      .catch((cause: unknown) => setNotice(t('review.draftSaveFailed', { message: messageOf(cause) })))
  }, [fileId, notebook, t])

  /** Line-based selection: exact source lines, quote as the selected text. */
  const handleSelect = useCallback((): void => {
    const container = codeRef.current
    const sel = window.getSelection()
    if (container === null || sel === null || sel.isCollapsed) return
    const lineOf = (node: Node | null): number | undefined => {
      let element = node instanceof Element ? node : node?.parentElement ?? null
      while (element !== null && !container.contains(element)) element = element.parentElement
      const holder = element?.closest('[data-line]')
      if (holder === null || holder === undefined) return undefined
      return Number(holder.getAttribute('data-line'))
    }
    const anchorLine = lineOf(sel.anchorNode)
    const focusLine = lineOf(sel.focusNode)
    if (anchorLine === undefined || focusLine === undefined) return
    const quote = sel.toString().replace(/\n+$/u, '').trim()
    if (quote === '') return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setSelection({
      quote,
      startLine: Math.min(anchorLine, focusLine),
      endLine: Math.max(anchorLine, focusLine),
      rect: { top: rect.top, left: rect.left },
    })
  }, [])

  const startCompose = (target: ComposeTarget): void => {
    setComposer(target)
    setComment('')
  }

  const saveAnnotation = useCallback((): void => {
    if (composer === null) return
    const text = comment.trim()
    if (text === '') return
    const next: DraftAnnotation = {
      id: composer.editingId ?? `${Date.now()}-${annotations.length}`,
      quote: composer.quote,
      text,
      ...composer.scope === 'document' ? { scope: 'document' as const } : {
        ...composer.startLine === undefined ? {} : { startLine: composer.startLine },
        ...composer.endLine === undefined ? {} : { endLine: composer.endLine },
      },
      createdAt: new Date().toISOString(),
    }
    persist(composer.editingId === undefined
      ? [...annotations, next]
      : annotations.map(item => item.id === composer.editingId ? next : item))
    setComposer(null)
    setComment('')
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [annotations, comment, composer, persist])

  /** Submit the whole batch into the new review session's composer (never sends). */
  const submitAll = useCallback((): void => {
    if (annotations.length === 0 || path === undefined || fileId === undefined) return
    const text = annotations
      .map((annotation, index) => {
        const header = `【批注 ${index + 1}】文件：${path}`
        if (annotation.scope === 'document') {
          return `${header}\n范围：整篇笔记\n${quoteBlock(annotation.quote)}\n意见：${annotation.text}`
        }
        const range = annotation.startLine === undefined
          ? ''
          : `行号：${annotation.endLine !== undefined && annotation.endLine !== annotation.startLine ? `${annotation.startLine}-${annotation.endLine}` : annotation.startLine}\n`
        return `${header}\n${range}${quoteBlock(annotation.quote)}\n意见：${annotation.text}`
      })
      .join('\n\n')
    if (!bridge.sendQuote(sessionId, text)) {
      setNotice(t('review.submitFailed'))
      return
    }
    const record = {
      sessionId,
      ...workspaceId === undefined ? {} : { workspaceId },
      fileId,
      annotations,
    }
    void notebook.recordReview(record)
      .then(() => { void loadRecords() })
      .catch((cause: unknown) => setNotice(t('review.historySaveFailed', { message: messageOf(cause) })))
    persist([])
    setOverlay(null)
    setNotice(t('review.submitted'))
  }, [annotations, bridge, fileId, loadRecords, notebook, path, persist, sessionId, t, workspaceId])

  // One record = one submitted round; the pill reports both rounds and annotation items.
  const recordRounds = records?.length ?? 0
  const recordAnnotations = records?.reduce((sum, entry) => sum + entry.record.annotations.length, 0) ?? 0

  const diff = baseline !== null && page !== null && baseline !== page.body
    ? { oldText: baseline, newText: page.body }
    : null
  const totals = diff === null || page === null
    ? null
    : diffTotals([{ path: page.path, oldText: diff.oldText, newText: diff.newText }])

  if (path === undefined || fileId === undefined) {
    return <div className="dsh-desk-review"><p className="dsh-desk-notebook-hint">{t('review.noPath')}</p></div>
  }

  const composerCard = (
    <div ref={composerRef} className="dsh-desk-review-composer">
      <div className="dsh-desk-review-annohead">
        <span className="dsh-desk-review-annorange">
          {composer?.scope === 'document'
            ? t('review.documentScope')
            : t('review.lineHint', { start: composer?.startLine ?? 0, end: composer?.endLine ?? composer?.startLine ?? 0 })}
        </span>
        <span className="dsh-desk-review-annoquote">{t('review.placeholder')}</span>
      </div>
      <p className="dsh-desk-review-quote dsh-desk-review-quote-inline">{quoteBlock(composer?.quote ?? '')}</p>
      <textarea
        className="dsh-desk-review-input"
        value={comment}
        maxLength={TEXT_MAX_CHARS}
        placeholder={t('review.placeholder')}
        autoFocus
        onChange={event => setComment(event.target.value)}
      />
      <div className="dsh-desk-review-actions">
        <button type="button" className="dsh-desk-btn" onClick={cancelSelection}>{t('review.cancel')}</button>
        <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={comment.trim() === ''} onClick={saveAnnotation}>
          {t('review.save')}
        </button>
      </div>
    </div>
  )
  const selectedRange = composer !== null && composer.scope === 'selection'
    ? { start: composer.startLine ?? 0, end: composer.endLine ?? composer.startLine ?? 0 }
    : selection === null
      ? undefined
      : { start: selection.startLine, end: selection.endLine }
  const documentAnnotations = annotations.filter(annotation => annotation.scope === 'document')
  const lineAnnotations = new Map<number, DraftAnnotation[]>()
  for (const annotation of annotations) {
    if (annotation.scope === 'document' || annotation.endLine === undefined) continue
    for (let line = annotation.startLine ?? annotation.endLine; line <= annotation.endLine; line += 1) {
      const list = lineAnnotations.get(line) ?? []
      list.push(annotation)
      lineAnnotations.set(line, list)
    }
  }

  const copyPath = (): void => {
    void navigator.clipboard.writeText(path).then(
      () => setNotice(t('review.copied')),
      () => setNotice(path),
    )
  }

  const rootRect = rootRef.current?.getBoundingClientRect()
  const floatPos = selection === null || rootRect === undefined
    ? undefined
    : { top: Math.max(selection.rect.top - rootRect.top - 34, 8), left: Math.max(selection.rect.left - rootRect.left, 8) }

  return (
    <div className="dsh-desk-review" ref={rootRef}>
      <header className="dsh-desk-review-head">
        <span className="dsh-desk-review-path" title={path}>{page?.title ?? path}</span>
        <SegmentedTabs
          className="dsh-desk-review-viewtoggle"
          size="sm"
          label={t('review.viewLabel')}
          value={view}
          onChange={setView}
          items={[
            { value: 'render', label: t('review.viewRender'), id: 'desk-review-view-md', panelId: 'desk-review-panel' },
            { value: 'source', label: t('review.viewSource'), id: 'desk-review-view-code', panelId: 'desk-review-panel' },
          ] as const}
        />
        <Tooltip label={t('review.copyPath')} side="bottom" delayMs={400}>
          <Button variant="ghost" size="sm" icon={<IconCopyOutlineRegular />} aria-label={t('review.copyPath')} onClick={copyPath} />
        </Tooltip>
        <Tooltip label={t('review.refresh')} side="bottom" delayMs={400}>
          <Button variant="ghost" size="sm" icon={<IconRefreshOutlineRegular />} aria-label={t('review.refresh')} disabled={loading} onClick={() => { void load() }} />
        </Tooltip>
        <Button variant="outline" size="sm" disabled={page === null} onClick={() => startCompose({ scope: 'document', quote: page?.title ?? path })}>
          {t('review.wholeDoc')}
        </Button>
      </header>
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-review-notice">{notice}</p>}
      {loading && page === null
        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
        : page === null
          ? (
              <div className="dsh-desk-review-card">
                <p className="dsh-desk-notebook-hint">{t('review.pageUnavailable')}</p>
                <div className="dsh-desk-review-actions">
                  <button type="button" className="dsh-desk-btn" onClick={() => { void load() }}>{t('review.refresh')}</button>
                </div>
              </div>
            )
          : (
              <div className="dsh-desk-review-scroll">
                {page.fields.length === 0 ? null : (
                  <DisclosureRow
                    icon={<IconInfoOutlineRegular />}
                    title={t('review.frontmatter')}
                    open={fieldsOpen}
                    expandable
                    expandOnRowClick
                    previewChevron
                    onToggle={() => setFieldsOpen(current => !current)}
                    collapsedContent={(
                      <span className="dsh-desk-review-fieldcount">{t('review.frontmatterCount', { count: page.fields.length })}</span>
                    )}
                  >
                    <dl className="dsh-desk-review-frontmatter" aria-label={t('review.frontmatter')}>
                      {page.fields.map(field => (
                        <div key={field.name} className="dsh-desk-review-field">
                          <dt>{field.name}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </DisclosureRow>
                )}
                {documentAnnotations.map(annotation => (
                  <AnnotationCard
                    key={annotation.id}
                    t={t}
                    annotation={annotation}
                    onEdit={() => startCompose({
                      scope: 'document',
                      quote: annotation.quote,
                      editingId: annotation.id,
                    })}
                    onDelete={() => persist(annotations.filter(item => item.id !== annotation.id))}
                  />
                ))}
                {composer !== null && composer.scope === 'document' ? composerCard : null}
                {view === 'render'
                  ? <p className="dsh-desk-review-notice">{t('review.renderHint')}</p>
                  : null}
                {view === 'render'
                  ? <div className="dsh-desk-review-rendered"><MarkdownText text={page.body} labels={markdownLabels} omitHtml /></div>
                  : <div ref={codeRef} className="dsh-desk-review-code" onMouseUp={handleSelect}>
                  {lines.map((text, index) => {
                    const line = index + 1
                    const marked = lineAnnotations.has(line)
                    const own = (lineAnnotations.get(line) ?? []).filter(annotation => annotation.endLine === line)
                    const selected = selectedRange !== undefined && line >= selectedRange.start && line <= selectedRange.end
                    const composeHere = composer !== null && composer.scope === 'selection'
                      && (composer.endLine ?? composer.startLine ?? 0) === line
                    return (
                      <Fragment key={line}>
                        <div className="dsh-desk-review-line" data-line={line} data-marked={marked || undefined} data-selected={selected || undefined}>
                          <span className="dsh-desk-review-lineno">{line}</span>
                          <span className="dsh-desk-review-source">{text === '' ? '\u00a0' : text}</span>
                        </div>
                        {own.map(annotation => (
                          <AnnotationCard
                            key={`${annotation.id}-inline`}
                            t={t}
                            annotation={annotation}
                            onEdit={() => startCompose({
                              scope: 'selection',
                              quote: annotation.quote,
                              ...annotation.startLine === undefined ? {} : { startLine: annotation.startLine },
                              ...annotation.endLine === undefined ? {} : { endLine: annotation.endLine },
                              editingId: annotation.id,
                            })}
                            onDelete={() => persist(annotations.filter(item => item.id !== annotation.id))}
                          />
                        ))}
                        {composeHere ? composerCard : null}
                      </Fragment>
                    )
                  })}
                </div>}
              </div>
            )}
      {selection === null || composer !== null || page === null
        ? null
        : (
            <button
              ref={floatRef}
              type="button"
              className="dsh-desk-action dsh-desk-action-primary dsh-desk-review-float"
              style={floatPos}
              onClick={() => startCompose({
                scope: 'selection',
                quote: selection.quote,
                startLine: selection.startLine,
                endLine: selection.endLine,
                rect: selection.rect,
              })}
            >
              {t('review.annotate')}
            </button>
          )}
      {overlay === 'annotations'
        ? (
            <div className="dsh-desk-review-layer">
              <div className="dsh-desk-review-layerhead">
                <span className="dsh-desk-review-layericon" aria-hidden="true"><IconListPenOutlineRegular /></span>
                <h4>{t('review.pendingTitle', { count: annotations.length })}</h4>
                <Button variant="primary" size="sm" disabled={annotations.length === 0} onClick={submitAll}>
                  {t('review.submitAll')}
                </Button>
                <Tooltip label={t('review.hideOverlay')} side="bottom" delayMs={400}>
                  <Button variant="ghost" size="sm" icon={<IconChevronDownOutlineRegular />} aria-label={t('review.hideOverlay')} onClick={() => setOverlay(null)} />
                </Tooltip>
              </div>
              <div className="dsh-desk-review-layerbody">
                {annotations.length === 0
                  ? <p className="dsh-desk-notebook-hint">{t('review.pendingEmpty')}</p>
                  : annotations.map((annotation, index) => (
                      <div className="dsh-desk-review-pending" key={annotation.id}>
                        <span className="dsh-desk-review-pending-no">{index + 1}</span>
                        <div className="dsh-desk-review-pending-main">
                          <p className="dsh-desk-review-quote dsh-desk-review-quote-inline">{quoteBlock(annotation.quote)}</p>
                          <p className="dsh-desk-review-pending-text">{annotation.text}</p>
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          )
        : null}
      {overlay === 'diff'
        ? (
            <div className="dsh-desk-review-layer">
              <div className="dsh-desk-review-layerhead">
                <span className="dsh-desk-review-layericon" aria-hidden="true"><IconInspectOutlineRegular /></span>
                <h4>{t('review.changes')}</h4>
                {baselineAt === null
                  ? null
                  : <span className="dsh-desk-review-baseline">{t('review.baselineHint', { time: new Date(baselineAt).toLocaleTimeString() })}</span>}
                <Button variant="ghost" size="sm" disabled={page === null} onClick={() => {
                  const body = page?.body ?? null
                  const at = new Date().toISOString()
                  setBaseline(body)
                  setBaselineAt(at)
                  if (fileId !== undefined && body !== null) void notebook.saveBaseline({ fileId, body, at })
                }}>
                  {t('review.rebaseline')}
                </Button>
                <Tooltip label={t('review.hideOverlay')} side="bottom" delayMs={400}>
                  <Button variant="ghost" size="sm" icon={<IconChevronDownOutlineRegular />} aria-label={t('review.hideOverlay')} onClick={() => setOverlay(null)} />
                </Tooltip>
              </div>
              <div className="dsh-desk-review-layerbody">
                {diff === null || totals === null || page === null
                  ? <p className="dsh-desk-notebook-hint">{t('review.diffEmpty')}</p>
                  : (
                      <DisclosureRow
                      icon={<IconInspectOutlineRegular />}
                      title={t('review.changes')}
                      open={diffOpen}
                      expandable
                      expandOnRowClick
                      previewChevron
                      onToggle={() => setDiffOpen(current => !current)}
                      collapsedContent={(
                        <>
                          <span className="dsh-desk-review-difftag dsh-desk-review-difftag-plus">{`+${totals.added}`}</span>
                          <span className="dsh-desk-review-difftag dsh-desk-review-difftag-minus">{`−${totals.removed}`}</span>
                        </>
                      )}
                    >
                        <DiffBlock
                          diffs={[{ path: page.path, oldText: diff.oldText, newText: diff.newText }]}
                          labels={diffLabels}
                          maxLines={200}
                        />
                      </DisclosureRow>
                    )}
              </div>
            </div>
          )
        : null}
      {overlay === 'records'
        ? (
            <div className="dsh-desk-review-layer">
              <div className="dsh-desk-review-layerhead">
                <span className="dsh-desk-review-layericon" aria-hidden="true"><IconClockOutlineRegular /></span>
                <h4>{t('review.recordsTitle', { rounds: recordRounds, notes: recordAnnotations })}</h4>
                <Tooltip label={t('review.hideOverlay')} side="bottom" delayMs={400}>
                  <Button variant="ghost" size="sm" icon={<IconChevronDownOutlineRegular />} aria-label={t('review.hideOverlay')} onClick={() => setOverlay(null)} />
                </Tooltip>
              </div>
              <div className="dsh-desk-review-layerbody">
                {records === null
                  ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
                  : records.length === 0
                    ? <p className="dsh-desk-notebook-hint">{t('review.recordsEmpty')}</p>
                    : records.map(entry => (
                        <div className="dsh-desk-review-record" key={entry.record.id}>
                          <div className="dsh-desk-review-recordehead">
                            <span>{new Date(entry.record.createdAt).toLocaleString()}</span>
                            <span className="dsh-desk-review-fieldcount">
                              {t('review.recordAnnotations', { count: entry.record.annotations.length })}
                            </span>
                          </div>
                          {entry.record.annotations.map(annotation => (
                            <div className="dsh-desk-review-pending" key={annotation.id}>
                              <div className="dsh-desk-review-pending-main">
                                <p className="dsh-desk-review-quote dsh-desk-review-quote-inline">{quoteBlock(annotation.quote)}</p>
                                <p className="dsh-desk-review-pending-text">{annotation.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
              </div>
            </div>
          )
        : null}
      <div className="dsh-desk-review-bar">
        <button
          type="button"
          className="dsh-desk-review-pill"
          data-active={overlay === 'annotations'}
          aria-expanded={overlay === 'annotations'}
          onClick={() => setOverlay(current => current === 'annotations' ? null : 'annotations')}
        >
          <span className="dsh-desk-review-pillicon"><IconListPenOutlineRegular /></span>
          <span className="dsh-desk-review-pill-label">{t('review.pendingBar', { count: annotations.length })}</span>
        </button>
        <button
          type="button"
          className="dsh-desk-review-pill"
          data-active={overlay === 'records'}
          aria-expanded={overlay === 'records'}
          onClick={() => setOverlay(current => current === 'records' ? null : 'records')}
        >
          <span className="dsh-desk-review-pillicon"><IconClockOutlineRegular /></span>
          <span className="dsh-desk-review-pill-label">{t('review.recordsBar', { rounds: recordRounds, notes: recordAnnotations })}</span>
        </button>
        <button
          type="button"
          className="dsh-desk-review-pill"
          data-active={overlay === 'diff'}
          aria-expanded={overlay === 'diff'}
          onClick={() => setOverlay(current => current === 'diff' ? null : 'diff')}
        >
          <span className="dsh-desk-review-pillicon"><IconInspectOutlineRegular /></span>
          <span className="dsh-desk-review-pill-label">{t('review.changes')}</span>
          {totals === null
            ? <span>{t('review.noChange')}</span>
            : (
                <>
                  <span className="dsh-desk-review-difftag dsh-desk-review-difftag-plus">{`+${totals.added}`}</span>
                  <span className="dsh-desk-review-difftag dsh-desk-review-difftag-minus">{`−${totals.removed}`}</span>
                </>
              )}
        </button>
      </div>
    </div>
  )
}

/** Tab chip title. */
export function NoteReviewTabTitle(props: PropsLocale<typeof LOCALE_NAMESPACE>): ReactElement {
  return (
    <>
      <FileTypeIcon kind="markdown" size={16} className="dsh-desk-review-tabicon" />
      {props.t('review.tabTitle')}
    </>
  )
}
