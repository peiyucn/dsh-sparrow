/**
 * Review tab: the page under review, a compose popup, the persisted draft box, and this tab's
 * changes since it opened.
 *
 * Review state lives in the conversation; the only stored thing is the user's unsaved draft box
 * (keyed by the file), so closing the tab or restarting DSH never loses written annotations.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  DiffBlock, DisclosureRow, IconInspectOutlineRegular, MarkdownText, diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { DraftAnnotation, NotebookPageResponse } from '../../notebook-contract.js'
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
type OverlayKind = 'pending' | 'diff'

/** Cap one quote so a batch message stays readable. */
const QUOTE_MAX_CHARS = 2_000

/** Quote one passage as a markdown blockquote. */
function quoteBlock(quote: string): string {
  return quote.split('\n').map(line => `> ${line}`).join('\n')
}

/** Locate a quote in the source body and return an approximate line range. */
function locateQuote(body: string, quote: string): { readonly line: number; readonly endLine: number } | undefined {
  const direct = body.indexOf(quote)
  if (direct >= 0) {
    const startLine = body.slice(0, direct).split('\n').length
    return { line: startLine, endLine: startLine + quote.split('\n').length - 1 }
  }
  const normalized = body.replace(/[ \t]+/gu, ' ')
  const target = quote.replace(/[ \t]+/gu, ' ').trim()
  const loose = normalized.indexOf(target)
  if (loose < 0) return undefined
  const startLine = normalized.slice(0, loose).split('\n').length
  return { line: startLine, endLine: startLine + target.split('\n').length - 1 }
}

/** Notes review tab. */
export function NoteReviewTab(props: ReviewProps): ReactElement {
  const { t, notebook, bridge, sessionId, useTabInfo } = props
  const info = useTabInfo()
  const params = info.tab.navigation.params as NoteReviewParams | undefined
  const path = params?.path
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const [page, setPage] = useState<NotebookPageResponse | null>(null)
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<readonly DraftAnnotation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [baselineAt, setBaselineAt] = useState<string | null>(null)
  const [composer, setComposer] = useState<{ readonly quote: string; readonly line?: number; readonly endLine?: number } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [overlay, setOverlay] = useState<OverlayKind | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  const load = useCallback(async (silent = false): Promise<void> => {
    if (path === undefined) return
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const state = await notebook.state()
      const root = state.config?.rootPath
      if (root === undefined) {
        setError(t('review.noLibrary'))
        return
      }
      setRootPath(root)
      const nextPage = await notebook.page(path)
      const nextDrafts = await notebook.draft(root, path)
      setPage(current => current !== null && current.body === nextPage.body ? current : nextPage)
      if (!silent) setDrafts(nextDrafts?.drafts ?? [])
      setBaseline(current => current ?? nextPage.body)
      setBaselineAt(current => current ?? new Date().toISOString())
    } catch (cause) {
      if (!silent) setError(messageOf(cause))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [notebook, path, t])

  useEffect(() => { void load() }, [load])

  // Quiet refresh while visible; a hidden tab does no work.
  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [load])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 4_000)
    return () => clearTimeout(timer)
  }, [notice])

  /** Persist the draft box; the file is the draft box's key. */
  const persistDrafts = useCallback((next: readonly DraftAnnotation[]): void => {
    setDrafts(next)
    if (rootPath === null || path === undefined) return
    void notebook.saveDraft({ cwd: rootPath, path, drafts: next })
      .catch((cause: unknown) => setNotice(t('review.draftSaveFailed', { message: messageOf(cause) })))
  }, [notebook, path, rootPath, t])

  /** Selection → composer popup (approximate line range from the source body). */
  const handleSelect = useCallback((): void => {
    const container = bodyRef.current
    const selection = window.getSelection()
    if (container === null || selection === null || selection.isCollapsed) return
    const anchorNode = selection.anchorNode
    if (anchorNode === null || !container.contains(anchorNode)) return
    const quote = selection.toString().trim().slice(0, QUOTE_MAX_CHARS)
    if (quote === '') return
    const located = page === null ? undefined : locateQuote(page.body, quote)
    setComposer({ quote, ...located === undefined ? {} : { line: located.line, endLine: located.endLine } })
    setDraftText('')
    setNotice(null)
  }, [page])

  const addDraft = useCallback((): void => {
    if (composer === null || draftText.trim() === '') return
    persistDrafts([...drafts, {
      id: `${Date.now()}-${drafts.length}`,
      quote: composer.quote,
      text: draftText.trim(),
      ...composer.line === undefined ? {} : { line: composer.line },
      ...composer.endLine === undefined ? {} : { endLine: composer.endLine },
      createdAt: new Date().toISOString(),
    }])
    setComposer(null)
    setDraftText('')
  }, [composer, draftText, drafts, persistDrafts])

  /** Submit the whole batch as one numbered message in the composer (never sends). */
  const submitAll = useCallback((): void => {
    if (drafts.length === 0) return
    const text = drafts
      .map((item, index) => {
        const lines = item.line === undefined
          ? ''
          : `行号：${item.endLine !== undefined && item.endLine !== item.line ? `${item.line}-${item.endLine}` : item.line}\n`
        return `【审阅 ${index + 1}】文件：${path ?? ''}\n${lines}${quoteBlock(item.quote)}\n意见：${item.text}`
      })
      .join('\n\n')
    if (bridge.sendQuote(sessionId, text)) {
      persistDrafts([])
      setOverlay(null)
      setNotice(t('review.submitted'))
    } else {
      setNotice(t('review.submitFailed'))
    }
  }, [bridge, drafts, path, persistDrafts, sessionId, t])

  const diff = baseline !== null && page !== null && baseline !== page.body
    ? { oldText: baseline, newText: page.body }
    : null
  const totals = diff === null || page === null
    ? null
    : diffTotals([{ path: page.path, oldText: diff.oldText, newText: diff.newText }])

  if (path === undefined) {
    return <div className="dsh-desk-review"><p className="dsh-desk-notebook-hint">{t('review.noPath')}</p></div>
  }

  const copyPath = (): void => {
    void navigator.clipboard.writeText(path).then(
      () => setNotice(t('review.copied')),
      () => setNotice(path),
    )
  }

  return (
    <div className="dsh-desk-review">
      <header className="dsh-desk-review-head">
        <span className="dsh-desk-review-path" title={path}>{page?.title ?? path}</span>
        {page === null ? null : <span className="dsh-desk-review-kind">{page.kind === 'markdown' ? 'MD' : 'TXT'}</span>}
        <button type="button" className="dsh-desk-review-mini" title={path} onClick={copyPath}>{t('review.copyPath')}</button>
        <button type="button" className="dsh-desk-review-mini" disabled={loading} onClick={() => { void load() }}>{t('review.refresh')}</button>
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
                  <button type="button" className="dsh-desk-btn" onClick={() => { void load() }}>{t('review.refresh')}</button>
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
      {composer === null ? null : (
        <div className="dsh-desk-review-composer">
          <p className="dsh-desk-review-quote">{quoteBlock(composer.quote)}</p>
          {composer.line === undefined
            ? null
            : <p className="dsh-desk-review-lines">{t('review.lineHint', { line: composer.line, endLine: composer.endLine ?? composer.line })}</p>}
          <textarea
            className="dsh-desk-review-input"
            value={draftText}
            placeholder={t('review.placeholder')}
            onChange={event => setDraftText(event.target.value)}
          />
          <div className="dsh-desk-review-actions">
            <button type="button" className="dsh-desk-btn" onClick={() => setComposer(null)}>{t('review.cancel')}</button>
            <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={draftText.trim() === ''} onClick={addDraft}>
              {t('review.addToPending')}
            </button>
          </div>
        </div>
      )}
      {overlay === 'pending'
        ? (
            <div className="dsh-desk-review-layer">
              <div className="dsh-desk-review-layerhead">
                <h4>{t('review.pendingTitle', { count: drafts.length })}</h4>
                <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={drafts.length === 0} onClick={submitAll}>
                  {t('review.submitAll')}
                </button>
                <button type="button" className="dsh-desk-review-mini" onClick={() => setOverlay(null)}>{t('review.hideOverlay')}</button>
              </div>
              {drafts.length === 0
                ? <p className="dsh-desk-notebook-hint">{t('review.pendingEmpty')}</p>
                : drafts.map((item, index) => (
                    <div className="dsh-desk-review-pending" key={item.id}>
                      <span className="dsh-desk-review-pending-no">{index + 1}</span>
                      <div className="dsh-desk-review-pending-main">
                        <p className="dsh-desk-review-quote dsh-desk-review-quote-inline">{quoteBlock(item.quote)}</p>
                        <p className="dsh-desk-review-pending-text">{item.text}</p>
                      </div>
                      <button
                        type="button"
                        className="dsh-desk-review-mini"
                        onClick={() => persistDrafts(drafts.filter(entry => entry.id !== item.id))}
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
                {baselineAt === null
                  ? null
                  : <span className="dsh-desk-review-baseline">{t('review.baselineHint', { time: new Date(baselineAt).toLocaleTimeString() })}</span>}
                <button type="button" className="dsh-desk-review-mini" disabled={page === null} onClick={() => { setBaseline(page?.body ?? null); setBaselineAt(new Date().toISOString()) }}>
                  {t('review.rebaseline')}
                </button>
                <button type="button" className="dsh-desk-review-mini" onClick={() => setOverlay(null)}>{t('review.hideOverlay')}</button>
              </div>
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
                          <span className="dsh-desk-review-diffadded">{` +${totals.added}`}</span>
                          <span className="dsh-desk-review-diffremoved">{` -${totals.removed}`}</span>
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
          )
        : null}
      <div className="dsh-desk-review-bar">
        <button
          type="button"
          className="dsh-desk-review-baritem"
          data-active={overlay === 'pending'}
          onClick={() => setOverlay(current => current === 'pending' ? null : 'pending')}
        >
          {t('review.pendingBar', { count: drafts.length })}
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

/** Tab chip title. */
export function NoteReviewTabTitle(props: PropsLocale<typeof LOCALE_NAMESPACE>): ReactElement {
  return <>{props.t('review.tabTitle')}</>
}
