/**
 * Review tab body: the reviewed file, a compose popup, and a bottom overlay for the
 * pending annotation batch and this round's diff.
 *
 * All annotation state is tab-local (never persisted): a directive belongs to the
 * review conversation. The tab is kept mounted, and closing it with unsaved
 * annotations asks for confirmation instead of silently dropping them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  DiffBlock, DisclosureRow, IconInspectOutlineRegular, MarkdownText, diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { DeskReview, ReviewDraft, ReviewPageResponse } from '../../contract.js'
import type { ReviewApi } from './review-api.js'
import { messageOf } from '../app/utils.js'
import type { NoteReviewParams, ReviewBridge } from './review-bridge.js'

/** What the tab receives from the client entry. */
export interface NoteReviewInjected {
  readonly reviewApi: ReviewApi
  readonly bridge: ReviewBridge
  readonly sessionId: string
}

type ReviewProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<NoteReviewInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

/** One unsaved annotation (the persisted draft shape). */
type PendingAnnotation = ReviewDraft

/** Which bottom overlay is open. */
type OverlayKind = 'pending' | 'diff'

/** Cap one quote so a batch message stays readable. */
const QUOTE_MAX_CHARS = 2_000

/** Quote one passage as a markdown blockquote. */
function quoteBlock(quote: string): string {
  return quote.split('\n').map(line => `> ${line}`).join('\n')
}

/** Notes review tab: read, annotate, submit the batch. */
export function NoteReviewTab(props: ReviewProps): ReactElement {
  const { t, reviewApi, bridge, sessionId, useTabInfo } = props
  const info = useTabInfo()
  const params = info.tab.navigation.params as NoteReviewParams | undefined
  const reviewId = params?.reviewId
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const [review, setReview] = useState<DeskReview | null>(null)
  const [page, setPage] = useState<ReviewPageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** Body snapshot when this tab (or the last baseline move) started. */
  const [baseline, setBaseline] = useState<string | null>(null)
  const [pending, setPending] = useState<readonly PendingAnnotation[]>([])
  const [composer, setComposer] = useState<{ readonly quote: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [overlay, setOverlay] = useState<OverlayKind | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Re-attach panel: new target path typed by the user. */
  const [reanchor, setReanchor] = useState<string | null>(null)

  const labels = useMemo(() => ({
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

  const load = useCallback(async (): Promise<void> => {
    if (reviewId === undefined) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [nextReview, nextPage] = await Promise.all([reviewApi.get(reviewId), reviewApi.page(reviewId)])
      setReview(nextReview)
      setPage(nextPage)
      setPending(nextReview.drafts)
      setBaseline(current => current ?? nextPage.body)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setLoading(false)
    }
  }, [reviewApi, reviewId])

  useEffect(() => { void load() }, [load])

  /** Write the draft list back to the review record; drafts are the user's intent, so they persist. */
  const persistDrafts = useCallback((next: readonly ReviewDraft[]): void => {
    const current = review
    if (current === undefined || current === null) return
    setPending(next)
    void reviewApi.updateDrafts({ id: current.id, expectedRevision: current.revision, drafts: next })
      .then((updated) => { setReview(updated) })
      .catch((cause: unknown) => { setNotice(t('review.draftSaveFailed', { message: messageOf(cause) })) })
  }, [review, reviewApi, t])

  /** Selection → compose popup (the document itself keeps its size). */
  const handleSelect = useCallback((): void => {
    const container = bodyRef.current
    const selection = window.getSelection()
    if (container === null || selection === null || selection.isCollapsed) return
    const anchorNode = selection.anchorNode
    if (anchorNode === null || !container.contains(anchorNode)) return
    const quote = selection.toString().trim().slice(0, QUOTE_MAX_CHARS)
    if (quote === '') return
    setComposer({ quote })
    setDraft('')
    setNotice(null)
  }, [])

  const addPending = useCallback((): void => {
    if (composer === null || draft.trim() === '') return
    persistDrafts([...pending, {
      id: `${Date.now()}-${pending.length}`,
      quote: composer.quote,
      text: draft.trim(),
      createdAt: new Date().toISOString(),
    }])
    setComposer(null)
    setDraft('')
  }, [composer, draft, pending, persistDrafts])

  /** Submit the whole batch as one numbered message in the composer (never sends). */
  const submitAll = useCallback((): void => {
    if (pending.length === 0) return
    const text = pending
      .map((item, index) => `【批注 ${index + 1}】\n${quoteBlock(item.quote)}\n${item.text}`)
      .join('\n\n')
    const accepted = bridge.sendQuote(sessionId, text)
    if (accepted) {
      persistDrafts([])
      setOverlay(null)
      setNotice(t('review.submitted'))
    } else {
      setNotice(t('review.submitFailed'))
    }
  }, [bridge, pending, sessionId, t])

  // A transient status line should not accumulate in the tab.
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 4_000)
    return () => clearTimeout(timer)
  }, [notice])

  const diff = baseline !== null && page !== null && baseline !== page.body
    ? { oldText: baseline, newText: page.body }
    : null
  const totals = diff === null ? null : diffTotals([{ path: page?.path ?? '', oldText: diff.oldText, newText: diff.newText }])

  if (reviewId === undefined) {
    return <div className="dsh-desk-review"><p className="dsh-desk-notebook-hint">{t('review.noPath')}</p></div>
  }

  const title = review?.target.title ?? page?.title ?? review?.target.path ?? ''

  return (
    <div className="dsh-desk-review">
      <header className="dsh-desk-review-head">
        <span className="dsh-desk-review-path" title={review?.target.path ?? page?.path ?? ''}>{title}</span>
        {page === null ? null : <span className="dsh-desk-review-kind">{page.kind === 'markdown' ? 'MD' : 'TXT'}</span>}
        {review === null
          ? null
          : (
              <button
                type="button"
                className="dsh-desk-review-mini"
                title={review.sessionId}
                onClick={() => { void bridge.reveal(review.sessionId) }}
              >
                {t('review.openSession')}
              </button>
            )}
        <button type="button" className="dsh-desk-btn" disabled={loading} onClick={() => { void load() }}>
          {t('review.refresh')}
        </button>
      </header>
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-review-notice">{notice}</p>}
      {loading
        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
        : page === null
          ? (
              <div className="dsh-desk-review-card">
                <p className="dsh-desk-notebook-hint">{t('review.pageUnavailable')}</p>
                {review === null
                  ? null
                  : (
                      <p className="dsh-desk-notebook-hint">
                        {t('review.targetHint', { title: review.target.title, path: review.target.path })}
                      </p>
                    )}
                <div className="dsh-desk-review-actions">
                  <button type="button" className="dsh-desk-btn" onClick={() => { void load() }}>
                    {t('review.refresh')}
                  </button>
                  <button
                    type="button"
                    className="dsh-desk-action dsh-desk-action-primary"
                    disabled={review === null}
                    onClick={() => setReanchor(review?.target.path ?? '')}
                  >
                    {t('review.reanchor')}
                  </button>
                </div>
              </div>
            )
          : (
              <div className="dsh-desk-review-scroll">
                {page.fields.length === 0
                  ? null
                  : (
                      <section className="dsh-desk-review-card">
                        <h4>{t('review.fields')}</h4>
                        {page.fields.map(field => (
                          <div className="dsh-desk-review-field" key={field.name}>
                            <span className="dsh-desk-review-field-name">{field.name}</span>
                            <span className="dsh-desk-review-field-value">{field.value}</span>
                          </div>
                        ))}
                      </section>
                    )}
                <div ref={bodyRef} className="dsh-desk-review-body" onMouseUp={handleSelect}>
                  {page.kind === 'markdown'
                    ? <MarkdownText text={page.body} labels={labels} omitHtml />
                    : <pre className="dsh-desk-review-text">{page.body}</pre>}
                </div>
              </div>
            )}
      {reanchor === null || review === null
        ? null
        : (
            <div className="dsh-desk-review-composer">
              <p className="dsh-desk-notebook-hint">{t('review.reanchorHint')}</p>
              <input
                className="dsh-desk-review-input"
                value={reanchor}
                placeholder={review.target.path}
                onChange={event => setReanchor(event.target.value)}
              />
              <div className="dsh-desk-review-actions">
                <button type="button" className="dsh-desk-btn" onClick={() => setReanchor(null)}>{t('review.cancel')}</button>
                <button
                  type="button"
                  className="dsh-desk-action dsh-desk-action-primary"
                  disabled={reanchor.trim() === ''}
                  onClick={() => {
                    const nextPath = reanchor.trim()
                    void reviewApi
                      .updateTarget({ id: review.id, expectedRevision: review.revision, cwd: review.target.cwd, path: nextPath })
                      .then(() => { setReanchor(null); setBaseline(null); void load() })
                      .catch((cause: unknown) => setNotice(t('review.reanchorFailed', { message: messageOf(cause) })))
                  }}
                >
                  {t('review.reanchorConfirm')}
                </button>
              </div>
            </div>
          )}
      {composer === null ? null : (
        <div className="dsh-desk-review-composer">
          <p className="dsh-desk-review-quote">{quoteBlock(composer.quote)}</p>
          <textarea
            className="dsh-desk-review-input"
            value={draft}
            placeholder={t('review.placeholder')}
            onChange={event => setDraft(event.target.value)}
          />
          <div className="dsh-desk-review-actions">
            <button type="button" className="dsh-desk-btn" onClick={() => setComposer(null)}>{t('review.cancel')}</button>
            <button
              type="button"
              className="dsh-desk-action dsh-desk-action-primary"
              disabled={draft.trim() === ''}
              onClick={addPending}
            >
              {t('review.addToPending')}
            </button>
          </div>
        </div>
      )}
      {overlay === 'pending'
        ? (
            <div className="dsh-desk-review-layer">
              <div className="dsh-desk-review-layerhead">
                <h4>{t('review.pendingTitle', { count: pending.length })}</h4>
                <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={pending.length === 0} onClick={submitAll}>
                  {t('review.submitAll')}
                </button>
                <button type="button" className="dsh-desk-review-mini" onClick={() => setOverlay(null)}>{t('review.hideOverlay')}</button>
              </div>
              {pending.length === 0
                ? <p className="dsh-desk-notebook-hint">{t('review.pendingEmpty')}</p>
                : pending.map((item, index) => (
                    <div className="dsh-desk-review-pending" key={item.id}>
                      <span className="dsh-desk-review-pending-no">{index + 1}</span>
                      <div className="dsh-desk-review-pending-main">
                        <p className="dsh-desk-review-quote dsh-desk-review-quote-inline">{quoteBlock(item.quote)}</p>
                        <p className="dsh-desk-review-pending-text">{item.text}</p>
                      </div>
                      <button
                        type="button"
                        className="dsh-desk-review-mini"
                        onClick={() => persistDrafts(pending.filter(entry => entry.id !== item.id))}
                      >
                        {t('review.delete')}
                      </button>
                    </div>
                  ))}
            </div>
          )
        : null}
      {overlay === 'diff'
        ? (
            <div className="dsh-desk-review-layer">
              <div className="dsh-desk-review-layerhead">
                <h4>{t('review.changes')}</h4>
                <button type="button" className="dsh-desk-review-mini" disabled={page === null} onClick={() => setBaseline(page?.body ?? null)}>
                  {t('review.rebaseline')}
                </button>
                <button type="button" className="dsh-desk-review-mini" onClick={() => setOverlay(null)}>{t('review.hideOverlay')}</button>
              </div>
              {diff === null || totals === null
                ? <p className="dsh-desk-notebook-hint">{t('review.diffEmpty')}</p>
                : (
                    <DisclosureRow
                      icon={<IconInspectOutlineRegular />}
                      title={t('review.changes')}
                      open
                      expandable={false}
                      onToggle={() => undefined}
                      collapsedContent={(
                        <>
                          <span className="dsh-desk-review-diffadded">{` +${totals.added}`}</span>
                          <span className="dsh-desk-review-diffremoved">{` -${totals.removed}`}</span>
                        </>
                      )}
                    >
                      <DiffBlock
                        diffs={[{ path: page?.path ?? '', oldText: diff.oldText, newText: diff.newText }]}
                        labels={diffLabels}
                        maxLines={200}
                      />
                    </DisclosureRow>
                  )}
            </div>
          )
        : null}
      <div className="dsh-desk-review-bar">
        <button
          type="button"
          className="dsh-desk-review-baritem"
          data-active={overlay === 'pending'}
          onClick={() => setOverlay(current => current === 'pending' ? null : 'pending')}
        >
          {t('review.pendingBar', { count: pending.length })}
        </button>
        <button
          type="button"
          className="dsh-desk-review-baritem"
          data-active={overlay === 'diff'}
          onClick={() => setOverlay(current => current === 'diff' ? null : 'diff')}
        >
          {t('review.changes')}{' '}
          {totals === null
            ? '—'
            : (
                <>
                  <span className="dsh-desk-review-diffadded">{`+${totals.added}`}</span>
                  <span className="dsh-desk-review-diffremoved">{` -${totals.removed}`}</span>
                </>
              )}
        </button>
      </div>
    </div>
  )
}

/** Tab chip title: the feature name (the chip is too narrow for the page path). */
export function NoteReviewTabTitle(props: PropsLocale<typeof LOCALE_NAMESPACE>): ReactElement {
  return <>{props.t('review.tabTitle')}</>
}
