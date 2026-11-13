/** One annotation card: the saved draft shown inline under its line range (or in document scope). */

import type { ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DraftAnnotation } from '../../../../notebook-contract.js'
import type { DeskTranslator } from '../../../app/types.js'

/** Render one annotation card. */
export function AnnotationCard(props: {
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
