

import { useEffect, useState, type ReactElement } from 'react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../../constants.js'
import type { DraftAnnotation } from '../../../notebook-contract.js'
import { DeskTabGlyph } from '../../tabIcons.js'
import { AnnotationCard } from './components/AnnotationCard.js'
import { ReviewCodeView } from './components/ReviewCodeView.js'
import { ReviewDocumentView } from './components/ReviewDocumentView.js'
import { ReviewHeader } from './components/ReviewHeader.js'
import { ReviewLayers } from './components/ReviewLayers.js'
import { ReviewSubmitBar } from './components/ReviewSubmitBar.js'
import { REVIEW_COMMENT_MAX_CHARS, quoteBlock } from './format.js'
import { useReviewDocument } from './hooks/useReviewDocument.js'
import { cancelNeedsConfirmation, useReviewInteraction } from './hooks/useReviewInteraction.js'
import { useReviewSession } from './hooks/useReviewSession.js'
import type { NoteReviewParams } from '../review-bridge.js'
import type { NoteReviewInjected } from './types.js'
import { showReviewTab } from './tab-visibility.js'

type ReviewProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<NoteReviewInjected> & PropsLocale<typeof LOCALE_NAMESPACE>


export function NoteReviewTab(props: ReviewProps): ReactElement {
  const { t, notebook, bridge, sessionId, useTabInfo } = props
  const info = useTabInfo()
  const navigationParams = info.tab.navigation.params as NoteReviewParams | undefined



  useEffect(() => {
    if (!info.tab.visible) return
    return showReviewTab(info.tab.id)
  }, [info.tab.visible, info.tab.id])
  const { target, recovering } = useReviewSession({ notebook, sessionId, navigationParams })
  const data = useReviewDocument({ notebook, sessionId, target, tabVisible: info.tab.visible, t })
  const review = useReviewInteraction({ t, notebook, bridge, sessionId, target, data })
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    setConfirmCancel(false)
  }, [review.comment, review.composer])

  if (target === undefined) {
    return (
      <div className="dsh-desk-review">
        <p className="dsh-desk-notebook-hint">{recovering ? t('state.loading') : t('review.noPath')}</p>
      </div>
    )
  }

  const requestCancel = (): void => {
    if (review.composer === null) return
    if (!cancelNeedsConfirmation(review.comment)) {
      review.cancelSelection()
      return
    }
    if (confirmCancel) {
      review.cancelSelection()
      return
    }
    setConfirmCancel(true)
  }

  const composerCard = (
    <div ref={review.composerRef} className="dsh-desk-review-composer">
      <div className="dsh-desk-review-annohead">
        <span className="dsh-desk-review-annorange">
          {review.composer?.scope === 'document'
            ? t('review.documentScope')
            : t('review.lineHint', { start: review.composer?.startLine ?? 0, end: review.composer?.endLine ?? review.composer?.startLine ?? 0 })}
        </span>
        <span className="dsh-desk-review-annoquote">{t('review.placeholder')}</span>
      </div>
      <p className="dsh-desk-review-quote dsh-desk-review-quote-inline">{quoteBlock(review.composer?.quote ?? '')}</p>
      <textarea
        className="dsh-desk-review-input"
        value={review.comment}
        maxLength={REVIEW_COMMENT_MAX_CHARS}
        placeholder={t('review.placeholder')}
        autoFocus
        onChange={event => review.setComment(event.target.value)}
      />
      <div className="dsh-desk-review-actions">
        <button type="button" className="dsh-desk-btn" data-confirm={confirmCancel ? 'true' : undefined} onClick={requestCancel}>
          {confirmCancel ? t('review.cancelConfirm') : t('review.cancel')}
        </button>
        <button type="button" className="dsh-desk-action dsh-desk-action-primary" disabled={review.comment.trim() === ''} onClick={review.saveAnnotation}>
          {t('review.save')}
        </button>
      </div>
    </div>
  )

  const copyPath = (): void => {


    void writeClipboard(target.path).then(ok => data.setNotice(ok ? t('review.copied') : target.path))
  }

  const recordRounds = data.records?.length ?? 0
  const recordAnnotations = data.records?.reduce((sum, entry) => sum + entry.record.annotations.length, 0) ?? 0
  const pendingLabel = t('review.pendingBar', { count: data.annotations.length })
  const recordsLabel = t('review.recordsBar', { rounds: recordRounds, notes: recordAnnotations })
  const recordsTitle = t('review.recordsTitle', { rounds: recordRounds, notes: recordAnnotations })
  const changesLabel = data.totals === null
    ? t('review.changes')
    : `${t('review.changes')} +${data.totals.added} −${data.totals.removed}`

  const editInline = (annotation: DraftAnnotation): void => review.startCompose({
    scope: 'selection',
    quote: annotation.quote,
    ...annotation.startLine === undefined ? {} : { startLine: annotation.startLine },
    ...annotation.endLine === undefined ? {} : { endLine: annotation.endLine },
    editingId: annotation.id,
  })

  return (
    <div className="dsh-desk-review" ref={review.rootRef}>
      <ReviewHeader
        t={t}
        path={target.path}
        title={data.page?.title}
        loading={data.loading}
        pageReady={data.page !== null}
        view={review.view}
        menuOpen={review.menuOpen}
        onMenuOpenChange={review.setMenuOpen}
        onSelectView={(next) => { review.setMenuOpen(false); review.setView(next) }}
        onCopyPath={copyPath}
        onRefresh={() => { void data.load() }}
        onWholeDocument={() => review.startCompose({ scope: 'document', quote: data.page?.title ?? target.path })}
      />
      {data.error === null ? null : <p className="dsh-desk-notebook-error">{t('state.loadFailed', { message: data.error })}</p>}
      {data.notice === null ? null : <p className="dsh-desk-review-notice">{data.notice}</p>}
      {data.loading && data.page === null
        ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
        : data.page === null
          ? (
              <div className="dsh-desk-review-card">
                <p className="dsh-desk-notebook-hint">{t('review.pageUnavailable')}</p>
                <div className="dsh-desk-review-actions">
                  <button type="button" className="dsh-desk-btn" onClick={() => { void data.load() }}>{t('review.refresh')}</button>
                </div>
              </div>
            )
          : (
              <div className="dsh-desk-review-scroll">
                {review.documentAnnotations.map(annotation => (
                  <AnnotationCard
                    key={annotation.id}
                    t={t}
                    annotation={annotation}
                    onEdit={() => review.startCompose({
                      scope: 'document',
                      quote: annotation.quote,
                      editingId: annotation.id,
                    })}
                    onDelete={() => data.persist(data.annotations.filter(item => item.id !== annotation.id))}
                  />
                ))}
                {review.composer !== null && review.composer.scope === 'document' ? composerCard : null}
                {review.view === 'render'
                  ? <p className="dsh-desk-review-notice">{t('review.renderHint')}</p>
                  : null}
                {review.view === 'render'
                  ? <ReviewDocumentView t={t} page={data.page} markdownLabels={data.markdownLabels} />
                  : (
                      <ReviewCodeView
                        t={t}
                        codeRef={review.codeRef}
                        lines={data.lines}
                        changedLines={data.changedLines}
                        annotationsByLine={review.annotationsByLine}
                        selectedRange={review.selectedRange}
                        composer={review.composer}
                        composerCard={composerCard}
                        onMouseUp={review.handleSelect}
                        onEditAnnotation={editInline}
                        onDeleteAnnotation={(id) => data.persist(data.annotations.filter(item => item.id !== id))}
                      />
                    )}
              </div>
            )}
      {review.selection === null || review.composer !== null || data.page === null
        ? null
        : (
            <button
              ref={review.floatRef}
              type="button"
              className="dsh-desk-action dsh-desk-action-primary dsh-desk-review-float"
              style={review.floatPos}
              onClick={() => review.startCompose({
                scope: 'selection',
                quote: review.selection?.quote ?? '',
                startLine: review.selection?.startLine,
                endLine: review.selection?.endLine,
              })}
            >
              {t('review.annotate')}
            </button>
          )}
      <ReviewLayers
        t={t}
        overlay={review.overlay}
        annotations={data.annotations}
        records={data.records}
        baselineAt={data.baselineAt}
        diff={data.diff}
        totals={data.totals}
        pagePath={data.page?.path ?? target.path}
        diffOpen={review.diffOpen}
        diffLabels={data.diffLabels}
        onToggleDiff={() => review.setDiffOpen(!review.diffOpen)}
        onSubmitAll={review.submitAll}
        onClose={() => review.setOverlay(null)}
      />
      <ReviewSubmitBar
        t={t}
        annotationCount={data.annotations.length}
        overlay={review.overlay}
        pendingLabel={pendingLabel}
        recordsLabel={recordsLabel}
        recordsTitle={recordsTitle}
        changesLabel={changesLabel}
        totals={data.totals}
        onSubmitAll={review.submitAll}
        onToggleOverlay={review.toggleOverlay}
        onOpenOverlay={review.openOverlay}
      />
    </div>
  )
}


export function NoteReviewTabTitle(props: PropsLocale<typeof LOCALE_NAMESPACE>): ReactElement {
  return (
    <>
      <span className="dsh-desk-review-tabicon"><DeskTabGlyph tab="notebook" size={16} /></span>
      {props.t('review.tabTitle')}
    </>
  )
}
