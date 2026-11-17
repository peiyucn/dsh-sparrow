

import { Fragment } from 'react'
import type { ReactElement, RefObject } from 'react'
import type { DraftAnnotation } from '../../../../notebook-contract.js'
import type { DeskTranslator } from '../../../app/types.js'
import type { LineRange } from '../format.js'
import type { ComposeTarget } from '../types.js'
import { AnnotationCard } from './AnnotationCard.js'


export function ReviewCodeView(props: {
  readonly t: DeskTranslator
  readonly codeRef: RefObject<HTMLDivElement>
  readonly lines: readonly string[]
  readonly changedLines: ReadonlySet<number>
  readonly annotationsByLine: ReadonlyMap<number, readonly DraftAnnotation[]>
  readonly selectedRange: LineRange | undefined
  readonly composer: ComposeTarget | null

  readonly composerCard: ReactElement | null
  readonly onMouseUp: () => void
  readonly onEditAnnotation: (annotation: DraftAnnotation) => void
  readonly onDeleteAnnotation: (id: string) => void
}): ReactElement {
  const {
    t, codeRef, lines, changedLines, annotationsByLine, selectedRange, composer, composerCard,
    onMouseUp, onEditAnnotation, onDeleteAnnotation,
  } = props
  return (
    <div ref={codeRef} className="dsh-desk-review-code" onMouseUp={onMouseUp}>
      {lines.map((text, index) => {
        const line = index + 1
        const marked = annotationsByLine.has(line)
        const changed = changedLines.has(line)
        const own = (annotationsByLine.get(line) ?? []).filter(annotation => annotation.endLine === line)
        const selected = selectedRange !== undefined && line >= selectedRange.start && line <= selectedRange.end
        const composeHere = composer !== null && composer.scope === 'selection'
          && (composer.endLine ?? composer.startLine ?? 0) === line
        return (
          <Fragment key={line}>
            <div className="dsh-desk-review-line" data-line={line} data-changed={changed || undefined} data-marked={marked || undefined} data-selected={selected || undefined}>
              <span className="dsh-desk-review-lineno">{line}</span>
              <span className="dsh-desk-review-source">{text === '' ? '\u00a0' : text}</span>
            </div>
            {own.map(annotation => (
              <AnnotationCard
                key={`${annotation.id}-inline`}
                t={t}
                annotation={annotation}
                onEdit={() => onEditAnnotation(annotation)}
                onDelete={() => onDeleteAnnotation(annotation.id)}
              />
            ))}
            {composeHere ? composerCard : null}
          </Fragment>
        )
      })}
    </div>
  )
}
