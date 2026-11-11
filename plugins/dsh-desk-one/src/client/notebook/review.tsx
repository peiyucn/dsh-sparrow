/**
 * Review tab body (stage 3, document reading only).
 *
 * This tab renders the file being reviewed. A review directive belongs to the review
 * conversation, not to the stateless file; the quoting/session flow arrives with the
 * review-session work that follows.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { DeskReview, ReviewPageResponse } from '../../contract.js'
import type { ReviewApi } from './review-api.js'
import type { NoteReviewParams } from './review-bridge.js'

/** What the tab receives from the client entry. */
export interface NoteReviewInjected {
  readonly reviewApi: ReviewApi
}

type ReviewProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<NoteReviewInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

/** Notes review tab: the page under review. */
export function NoteReviewTab(props: ReviewProps): ReactElement {
  const { t, reviewApi, useTabInfo } = props
  const info = useTabInfo()
  const params = info.tab.navigation.params as NoteReviewParams | undefined
  const reviewId = params?.reviewId
  const [review, setReview] = useState<DeskReview | null>(null)
  const [page, setPage] = useState<ReviewPageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const labels = {
    code: { copyLabel: t('review.copy'), copiedLabel: t('review.copied') },
    footnotes: t('review.footnotes'),
  }

  const load = useCallback(async (): Promise<void> => {
    if (reviewId === undefined) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      setReview(await reviewApi.get(reviewId))
      setPage(await reviewApi.page(reviewId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [reviewApi, reviewId])

  useEffect(() => { void load() }, [load])

  if (reviewId === undefined) {
    return <div className="dsh-desk-review"><p className="dsh-desk-notebook-hint">{t('review.noPath')}</p></div>
  }

  return (
    <div className="dsh-desk-review">
      <header className="dsh-desk-review-head">
        <span className="dsh-desk-review-path" title={review?.target.path ?? page?.path ?? ''}>{review?.target.path ?? page?.path ?? ''}</span>
        {page === null ? null : <span className="dsh-desk-review-kind">{page.kind === 'markdown' ? 'MD' : 'TXT'}</span>}
        <button type="button" className="dsh-desk-btn" disabled={loading} onClick={() => { void load() }}>
          {t('review.refresh')}
        </button>
      </header>
      {error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: error })}</p>}
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
                <section className="dsh-desk-review-card">
                  <h4>{t('review.body')}</h4>
                  <div className="dsh-desk-review-body">
                    {page.kind === 'markdown'
                      ? <MarkdownText text={page.body} labels={labels} omitHtml />
                      : <pre className="dsh-desk-review-text">{page.body}</pre>}
                  </div>
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
