/**
 * The three bottom overlays (pending annotations / this round's diff / submitted records). One
 * component renders whichever kind is open, with a shared official menu-surface shell.
 */

import type { ReactElement } from 'react'
import {
  Button, DiffBlock, DisclosureRow, IconChevronDownOutlineRegular, IconClockOutlineRegular,
  IconInspectOutlineRegular, IconListPenOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DraftAnnotation, ReviewHistoryEntry } from '../../../../notebook-contract.js'
import type { DeskTranslator } from '../../../app/types.js'
import { formatDateTime, formatTime } from '../../../app/utils.js'
import { quoteBlock } from '../format.js'
import type { OverlayKind } from '../types.js'

/** Delay before the overlay tooltips appear. */
const TOOLTIP_DELAY_MS = 400

/** One overlay's captured data + callbacks. */
export interface ReviewLayersProps {
  readonly t: DeskTranslator
  readonly overlay: OverlayKind | null
  readonly annotations: readonly DraftAnnotation[]
  readonly records: readonly ReviewHistoryEntry[] | null
  readonly baselineAt: string | null
  readonly diff: { readonly oldText: string; readonly newText: string } | null
  readonly totals: { readonly added: number; readonly removed: number } | null
  readonly pagePath: string
  readonly diffOpen: boolean
  readonly diffLabels: DiffBlockLabels
  readonly onToggleDiff: () => void
  readonly onSubmitAll: () => void
  readonly onClose: () => void
}

/** Shared header row of one overlay. */
function LayerHead(props: {
  readonly t: DeskTranslator
  readonly icon: ReactElement
  readonly title: ReactElement
  readonly onClose: () => void
  readonly children?: ReactElement | null
}): ReactElement {
  return (
    <div className="dsh-desk-review-layerhead">
      <span className="dsh-desk-review-layericon" aria-hidden="true">{props.icon}</span>
      <h4>{props.title}</h4>
      {props.children ?? null}
      <Tooltip label={props.t('review.hideOverlay')} side="bottom" delayMs={TOOLTIP_DELAY_MS}>
        <Button variant="ghost" size="sm" icon={<IconChevronDownOutlineRegular />} aria-label={props.t('review.hideOverlay')} onClick={props.onClose} />
      </Tooltip>
    </div>
  )
}

/** Render the overlay that is currently open (or nothing). */
export function ReviewLayers(props: ReviewLayersProps): ReactElement | null {
  const {
    t, overlay, annotations, records, baselineAt, diff, totals, pagePath, diffOpen, diffLabels,
    onToggleDiff, onSubmitAll, onClose,
  } = props
  if (overlay === null) return null
  return (
    <div className="dsh-desk-review-layer">
      {overlay === 'annotations' ? (
        <>
          <LayerHead t={t}
            icon={<IconListPenOutlineRegular />}
            title={<>{t('review.pendingTitle', { count: annotations.length })}</>}
            onClose={onClose}
          >
            <Button variant="primary" size="sm" disabled={annotations.length === 0} onClick={onSubmitAll}>
              {t('review.submitAll')}
            </Button>
          </LayerHead>
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
        </>
      ) : null}
      {overlay === 'diff' ? (
        <>
          <LayerHead t={t}
            icon={<IconInspectOutlineRegular />}
            title={<>{t('review.changes')}</>}
            onClose={onClose}
          >
            {baselineAt === null
              ? null
              : <span className="dsh-desk-review-baseline">{t('review.baselineHint', { time: formatTime(baselineAt) })}</span>}
          </LayerHead>
          <div className="dsh-desk-review-layerbody">
            {diff === null || totals === null ? (
              <p className="dsh-desk-notebook-hint">{t('review.diffEmpty')}</p>
            ) : (
              <DisclosureRow
                icon={<IconInspectOutlineRegular />}
                title={t('review.changes')}
                open={diffOpen}
                expandable
                expandOnRowClick
                previewChevron
                onToggle={onToggleDiff}
                collapsedContent={(
                  <span className="dsh-desk-review-difftags">
                    <span className="dsh-desk-review-difftag dsh-desk-review-difftag-plus">{`+${totals.added}`}</span>
                    <span className="dsh-desk-review-difftag dsh-desk-review-difftag-minus">{`−${totals.removed}`}</span>
                  </span>
                )}
              >
                <DiffBlock
                  diffs={[{ path: pagePath, oldText: diff.oldText, newText: diff.newText }]}
                  labels={diffLabels}
                  maxLines={200}
                />
              </DisclosureRow>
            )}
          </div>
        </>
      ) : null}
      {overlay === 'records' ? (
        <>
          <LayerHead t={t}
            icon={<IconClockOutlineRegular />}
            title={<>{t('review.recordsTitle', { rounds: records?.length ?? 0, notes: records?.reduce((sum, entry) => sum + entry.record.annotations.length, 0) ?? 0 })}</>}
            onClose={onClose}
          />
          <div className="dsh-desk-review-layerbody">
            {records === null
              ? <p className="dsh-desk-notebook-hint">{t('state.loading')}</p>
              : records.length === 0
                ? <p className="dsh-desk-notebook-hint">{t('review.recordsEmpty')}</p>
                : records.map(entry => (
                    <div className="dsh-desk-review-record" key={entry.record.id}>
                      <div className="dsh-desk-review-recordehead">
                        <span>{formatDateTime(entry.record.createdAt)}</span>
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
        </>
      ) : null}
    </div>
  )
}
