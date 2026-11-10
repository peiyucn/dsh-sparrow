/**
 * Note review tab body: one page + its annotation threads, side by side with the conversation.
 *
 * Reading only renders; choosing text (or a frontmatter field) creates a thread, and
 * "hand to AI" inserts the thread into the composer — it never sends on the user's behalf.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type {
  AnnotationAnchor, AnnotationComment, DeskAnnotation, NotebookPageResponse, NotebookPageField,
} from '../../contract.js'
import type { NotebookApi } from './api.js'
import type { NoteReviewParams, ReviewBridge } from './review-bridge.js'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'

/** What the tab receives from the client entry (the slot injects the session id). */
export interface NoteReviewInjected {
  readonly notebook: NotebookApi
  readonly bridge: ReviewBridge
  readonly sessionId: string
}

type ReviewProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<NoteReviewInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

/** One pending composer: a new thread anchored on the selection or a frontmatter field. */
interface ComposerState {
  readonly anchor: AnnotationAnchor
  readonly label: string
}

/** Rendered text of one body node, used to derive quote anchors. */
const CONTEXT_CHARS = 32
/** Cap a stored quote so one thread stays small. */
const QUOTE_MAX_CHARS = 2_000

/** Build a quote anchor from the selection, plus its surrounding text when findable. */
function quoteAnchorOf(container: HTMLElement, selected: string): AnnotationAnchor {
  const quote = selected.slice(0, QUOTE_MAX_CHARS)
  const full = (container.innerText ?? '').replace(/\r\n/gu, '\n')
  const position = full.indexOf(quote)
  if (position < 0) return { type: 'quote', quote }
  const prefix = full.slice(Math.max(0, position - CONTEXT_CHARS), position)
  const suffix = full.slice(position + quote.length, position + quote.length + CONTEXT_CHARS)
  return {
    type: 'quote',
    quote,
    ...prefix === '' ? {} : { prefix },
    ...suffix === '' ? {} : { suffix },
    position,
  }
}

/** Localized status names (static keys, so the locale union stays checkable). */
const STATUS_KEY: Readonly<Record<DeskAnnotation['status'], 'review.status.open' | 'review.status.answered' | 'review.status.resolved' | 'review.status.orphaned'>> = {
  open: 'review.status.open',
  answered: 'review.status.answered',
  resolved: 'review.status.resolved',
  orphaned: 'review.status.orphaned',
}

/** Short human label for one anchor. */
function anchorLabel(anchor: AnnotationAnchor, t: DeskTranslator): string {
  return anchor.type === 'field'
    ? `${anchor.field} = ${anchor.value === '' ? '—' : anchor.value}`
    : `${t('review.quoteBadge')}「${anchor.quote.slice(0, 40)}${anchor.quote.length > 40 ? '…' : ''}」`
}

/** Whether a quote anchor still resolves in the current body. */
function anchorResolves(anchor: AnnotationAnchor, body: string): boolean {
  return anchor.type === 'field' || body.includes(anchor.quote)
}

/** One message line inside a thread. */
function CommentLine(props: { readonly t: DeskTranslator; readonly comment: AnnotationComment }): ReactElement {
  const ai = props.comment.author === 'ai'
  return (
    <p className={`dsh-desk-review-comment${ai ? ' dsh-desk-review-comment-ai' : ''}`}>
      <b>{ai ? props.t('review.byAi') : props.t('review.byHuman')}</b>
      <span>{props.comment.body}</span>
    </p>
  )
}

/** Notes review tab: frontmatter fields, body, and the annotation threads. */
export function NoteReviewTab(props: ReviewProps): ReactElement {
  const { t, notebook, bridge, sessionId, useTabInfo } = props
  const info = useTabInfo()
  const params = info.tab.navigation.params as NoteReviewParams | undefined
  const path = params?.path
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [page, setPage] = useState<NotebookPageResponse | null>(null)
  const [annotations, setAnnotations] = useState<readonly DeskAnnotation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const labels = useMemo(() => ({
    code: { copyLabel: t('review.copy'), copiedLabel: t('review.copied') },
    footnotes: t('review.footnotes'),
  }), [t])

  const load = useCallback(async (): Promise<void> => {
    if (path === undefined) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [nextPage, threads] = await Promise.all([notebook.page(path), notebook.listAnnotations({ path })])
      setPage(nextPage)
      setAnnotations(threads)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setLoading(false)
    }
  }, [notebook, path])

  useEffect(() => { void load() }, [load])

  const body = page?.body ?? ''

  /** Selection → composer. Selections outside the rendered body are ignored. */
  const handleSelect = useCallback((): void => {
    const container = bodyRef.current
    const selection = window.getSelection()
    if (container === null || selection === null || selection.isCollapsed) return
    const anchorNode = selection.anchorNode
    if (anchorNode === null || !container.contains(anchorNode)) return
    const selected = selection.toString().trim()
    if (selected === '') return
    setComposer({ anchor: quoteAnchorOf(container, selected), label: `「${selected.slice(0, 40)}${selected.length > 40 ? '…' : ''}」` })
    setDraft('')
  }, [])

  const submitComposer = useCallback(async (): Promise<void> => {
    if (path === undefined || composer === null || draft.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const created = await notebook.addAnnotation({
        path,
        anchor: composer.anchor,
        body: draft,
        ...sessionId === undefined ? {} : { linkedSessionId: sessionId },
      })
      setAnnotations(current => [created, ...current])
      setComposer(null)
      setDraft('')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, path, composer, draft, sessionId])

  const refreshThread = useCallback((next: DeskAnnotation): void => {
    setAnnotations(current => current.map(thread => thread.id === next.id ? next : thread))
  }, [])

  const sendReply = useCallback(async (thread: DeskAnnotation): Promise<void> => {
    if (replyText.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      refreshThread(await notebook.replyAnnotation({
        id: thread.id,
        expectedRevision: thread.revision,
        body: replyText,
        author: 'human',
      }))
      setReplyFor(null)
      setReplyText('')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, replyText, refreshThread])

  const setStatus = useCallback(async (thread: DeskAnnotation, status: 'open' | 'resolved'): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      refreshThread(await notebook.updateAnnotationStatus({
        id: thread.id,
        expectedRevision: thread.revision,
        patch: { status },
      }))
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook, refreshThread])

  const acceptAll = useCallback(async (): Promise<void> => {
    const answered = annotations.filter(thread => thread.status === 'answered')
    setBusy(true)
    setError(null)
    try {
      for (const thread of answered) {
        refreshThread(await notebook.updateAnnotationStatus({
          id: thread.id,
          expectedRevision: thread.revision,
          patch: { status: 'resolved' },
        }))
      }
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [annotations, notebook, refreshThread])

  const removeThread = useCallback(async (thread: DeskAnnotation): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await notebook.deleteAnnotation(thread.id)
      setAnnotations(current => current.filter(item => item.id !== thread.id))
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }, [notebook])

  /** Quote text for one thread, handed to the composer (never auto-sent). */
  const handoffText = useCallback((threads: readonly DeskAnnotation[]): string => {
    return threads.map(thread => {
      const anchor = thread.anchor.type === 'field'
        ? `${thread.anchor.field}: ${thread.anchor.value}`
        : `> ${thread.anchor.quote}`
      const first = thread.comments[0]?.body ?? ''
      return `【批注】${thread.path}\n${anchor}\n${first}`
    }).join('\n\n')
  }, [])

  const handoff = useCallback((threads: readonly DeskAnnotation[]): void => {
    if (sessionId === undefined || threads.length === 0) return
    const ok = bridge.sendToAi(sessionId, handoffText(threads))
    setNotice(ok ? t('review.handoffDone') : t('review.handoffFailed'))
  }, [bridge, sessionId, handoffText, t])

  if (path === undefined) {
    return <div className="dsh-desk-review"><p className="dsh-desk-notebook-hint">{t('review.noPath')}</p></div>
  }

  const openThreads = annotations.filter(thread => thread.status === 'open' || thread.status === 'answered')
  const answeredCount = annotations.filter(thread => thread.status === 'answered').length

  return (
    <div className="dsh-desk-review">
      <header className="dsh-desk-review-head">
        <span className="dsh-desk-review-path" title={path}>{path}</span>
        <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => { void load() }}>{t('review.refresh')}</button>
      </header>
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
      {notice === null ? null : <p className="dsh-desk-review-notice">{notice}</p>}
      {loading
        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
        : page === null
          ? (
              <div className="dsh-desk-review-card">
                <p className="dsh-desk-notebook-hint">{t('review.pageUnavailable')}</p>
                <div className="dsh-desk-review-actions">
                  <button type="button" className="dsh-desk-action dsh-desk-action-primary" onClick={() => { void load() }}>
                    {t('review.refresh')}
                  </button>
                </div>
              </div>
            )
          : (
            <div className="dsh-desk-review-scroll">
              <section className="dsh-desk-review-card">
                <h4>{t('review.fields')}</h4>
                {(page?.fields ?? []).length === 0
                  ? <p className="dsh-desk-notebook-hint">{t('review.fieldsEmpty')}</p>
                  : (page?.fields ?? []).map((field: NotebookPageField) => (
                      <div className="dsh-desk-review-field" key={field.name}>
                        <span className="dsh-desk-review-field-name">{field.name}</span>
                        <span className="dsh-desk-review-field-value">{field.value}</span>
                        <button
                          type="button"
                          className="dsh-desk-review-mini"
                          onClick={() => {
                            setComposer({ anchor: { type: 'field', field: field.name, value: field.value }, label: field.name })
                            setDraft('')
                          }}
                        >
                          {t('review.annotate')}
                        </button>
                      </div>
                    ))}
              </section>
              <section className="dsh-desk-review-card">
                <h4>{t('review.body')}</h4>
                <div ref={bodyRef} className="dsh-desk-review-body" onMouseUp={handleSelect}>
                  <MarkdownText text={body} labels={labels} omitHtml />
                </div>
              </section>
              {composer === null ? null : (
                <section className="dsh-desk-review-card dsh-desk-review-composer">
                  <h4>{t('review.composerTitle')} · {composer.label}</h4>
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
                      disabled={busy || draft.trim() === ''}
                      onClick={() => { void submitComposer() }}
                    >
                      {t('review.submit')}
                    </button>
                  </div>
                </section>
              )}
              <section className="dsh-desk-review-card">
                <div className="dsh-desk-review-threadhead">
                  <h4>{t('review.threads')} {annotations.length}</h4>
                  {answeredCount === 0 ? null : (
                    <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => { void acceptAll() }}>
                      {t('review.acceptAll')}
                    </button>
                  )}
                  {openThreads.length === 0 ? null : (
                    <button type="button" className="dsh-desk-btn" disabled={busy} onClick={() => handoff(openThreads)}>
                      {t('review.handoffAll')}
                    </button>
                  )}
                </div>
                {annotations.length === 0
                  ? <p className="dsh-desk-notebook-hint">{t('review.empty')}</p>
                  : annotations.map(thread => (
                      <div className="dsh-desk-review-thread" key={thread.id} data-status={thread.status}>
                        <div className="dsh-desk-review-threadhead">
                          <span className="dsh-desk-review-dot" />
                          <span className="dsh-desk-review-anchor" title={anchorLabel(thread.anchor, t)}>{anchorLabel(thread.anchor, t)}</span>
                          <span className="dsh-desk-review-status">{t(STATUS_KEY[thread.status])}</span>
                        </div>
                        {anchorResolves(thread.anchor, body) ? null : (
                          <p className="dsh-desk-review-orphan">{t('review.missingAnchor')}</p>
                        )}
                        {thread.comments.map((comment, index) => (
                          <CommentLine key={`${thread.id}-${index}`} t={t} comment={comment} />
                        ))}
                        {replyFor === thread.id
                          ? (
                              <div className="dsh-desk-review-replybox">
                                <textarea
                                  className="dsh-desk-review-input"
                                  value={replyText}
                                  placeholder={t('review.replyPlaceholder')}
                                  onChange={event => setReplyText(event.target.value)}
                                />
                                <div className="dsh-desk-review-actions">
                                  <button type="button" className="dsh-desk-btn" onClick={() => { setReplyFor(null); setReplyText('') }}>{t('review.cancel')}</button>
                                  <button
                                    type="button"
                                    className="dsh-desk-action dsh-desk-action-primary"
                                    disabled={busy || replyText.trim() === ''}
                                    onClick={() => { void sendReply(thread) }}
                                  >
                                    {t('review.send')}
                                  </button>
                                </div>
                              </div>
                            )
                          : null}
                        <div className="dsh-desk-review-actions">
                          <button
                            type="button"
                            className="dsh-desk-review-mini"
                            onClick={() => { setReplyFor(thread.id); setReplyText('') }}
                          >
                            {t('review.reply')}
                          </button>
                          {thread.status === 'answered'
                            ? (
                                <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => { void setStatus(thread, 'resolved') }}>
                                  {t('review.accept')}
                                </button>
                              )
                            : null}
                          {thread.status === 'resolved'
                            ? (
                                <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => { void setStatus(thread, 'open') }}>
                                  {t('review.reopen')}
                                </button>
                              )
                            : null}
                          <button type="button" className="dsh-desk-review-mini" disabled={busy} onClick={() => handoff([thread])}>
                            {t('review.handoff')}
                          </button>
                          <button type="button" className="dsh-desk-review-mini dsh-desk-review-danger" disabled={busy} onClick={() => { void removeThread(thread) }}>
                            {t('review.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
              </section>
            </div>
          )}
    </div>
  )
}

/** Tab chip title: the feature name (the chip is too narrow for the page path). */
export function NoteReviewTabTitle(props: PropsLocale<typeof LOCALE_NAMESPACE>): ReactElement {
  return <>{props.t('review.tabTitle')}</>
}
