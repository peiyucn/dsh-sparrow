

import type { ReactElement } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NotebookPageResponse } from '../../../../notebook-contract.js'
import type { DeskTranslator } from '../../../app/types.js'


export function ReviewDocumentView(props: {
  readonly t: DeskTranslator
  readonly page: NotebookPageResponse
  readonly markdownLabels: MarkdownLabels
}): ReactElement {
  const { t, page, markdownLabels } = props
  return (
    <div className="dsh-desk-review-rendered">
      {page.fields.length === 0 ? null : (
        <dl className="dsh-desk-review-frontmatter" aria-label={t('review.frontmatter')}>
          {page.fields.map(field => (
            <div key={field.name} className="dsh-desk-review-field">
              <dt>{field.name}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <MarkdownText text={page.body} labels={markdownLabels} omitHtml />
    </div>
  )
}
