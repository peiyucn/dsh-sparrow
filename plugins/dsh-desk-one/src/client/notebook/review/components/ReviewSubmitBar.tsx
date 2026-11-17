

import type { ReactElement } from 'react'
import {
  IconClockOutlineRegular, IconInspectOutlineRegular, IconListPenOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../../../app/types.js'
import type { OverlayKind } from '../types.js'


const TOOLTIP_DELAY_MS = 400


export function ReviewSubmitBar(props: {
  readonly t: DeskTranslator
  readonly annotationCount: number
  readonly overlay: OverlayKind | null
  readonly pendingLabel: string
  readonly recordsLabel: string
  readonly recordsTitle: string
  readonly changesLabel: string
  readonly totals: { readonly added: number; readonly removed: number } | null
  readonly onSubmitAll: () => void
  readonly onToggleOverlay: (kind: OverlayKind) => void
  readonly onOpenOverlay: (kind: OverlayKind) => void
}): ReactElement {
  const {
    t, annotationCount, overlay, pendingLabel, recordsLabel, recordsTitle, changesLabel, totals,
    onSubmitAll, onToggleOverlay, onOpenOverlay,
  } = props
  return (
    <div className="dsh-desk-review-bar">
      <span className="dsh-desk-review-split" role="group" aria-label={t('review.submitAll')}>
        <button
          type="button"
          className="dsh-desk-review-split-main"
          disabled={annotationCount === 0}
          title={annotationCount === 0 ? t('review.submitDisabled') : pendingLabel}
          aria-label={t('review.submitAll')}
          onClick={onSubmitAll}
        >
          <span className="dsh-desk-review-split-icon"><IconListPenOutlineRegular /></span>
          <span className="dsh-desk-review-split-label">{t('review.submitAll')}</span>
          {annotationCount === 0 ? null : <span className="dsh-desk-review-split-count">{annotationCount}</span>}
        </button>
        <Tooltip label={pendingLabel} side="top" delayMs={TOOLTIP_DELAY_MS}>
          <button
            type="button"
            className="dsh-desk-review-split-arrow"
            aria-label={t('review.pendingTitle', { count: annotationCount })}
            aria-expanded={overlay === 'annotations'}
            onClick={() => onToggleOverlay('annotations')}
          >
            <IconListPenOutlineRegular size={14} />
          </button>
        </Tooltip>
      </span>
      <span className="dsh-desk-review-split" role="group" aria-label={changesLabel}>
        <button
          type="button"
          className="dsh-desk-review-split-main"
          title={changesLabel}
          aria-label={changesLabel}
          onClick={() => onOpenOverlay('diff')}
        >
          <span className="dsh-desk-review-split-icon"><IconInspectOutlineRegular /></span>
          <span className="dsh-desk-review-split-label">{t('review.changes')}</span>
          {totals === null
            ? null
            : (
                <>
                  <span className="dsh-desk-review-difftag dsh-desk-review-difftag-plus">{`+${totals.added}`}</span>
                  <span className="dsh-desk-review-difftag dsh-desk-review-difftag-minus">{`−${totals.removed}`}</span>
                </>
              )}
        </button>
        <Tooltip label={recordsLabel} side="top" delayMs={TOOLTIP_DELAY_MS}>
          <button
            type="button"
            className="dsh-desk-review-split-arrow"
            aria-label={recordsTitle}
            aria-expanded={overlay === 'records'}
            onClick={() => onToggleOverlay('records')}
          >
            <IconClockOutlineRegular size={14} />
          </button>
        </Tooltip>
      </span>
    </div>
  )
}
