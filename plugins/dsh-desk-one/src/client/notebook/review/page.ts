

import type { NotebookPageResponse } from '../../../notebook-contract.js'


export function pageText(page: NotebookPageResponse): string {
  return page.kind === 'markdown' ? `${page.frontmatter}${page.body}` : page.body
}


export function sameReviewPage(left: NotebookPageResponse, right: NotebookPageResponse): boolean {
  return left.path === right.path
    && left.kind === right.kind
    && left.title === right.title
    && left.frontmatter === right.frontmatter
    && left.body === right.body
    && left.fields.length === right.fields.length
    && left.fields.every((field, index) => field.name === right.fields[index]?.name && field.value === right.fields[index]?.value)
}
