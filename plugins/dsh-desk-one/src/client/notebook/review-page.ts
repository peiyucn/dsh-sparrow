/**
 * Pure page helpers for the review tab.
 *
 * The code view and "this round's changes" diff the page as one text: for markdown the raw
 * frontmatter block is part of the source, so metadata-only edits are real changes. The store can
 * also hand back a page whose body is unchanged while its frontmatter (or another field) moved, so
 * the tab must compare the whole rendered state, not just the body.
 */

import type { NotebookPageResponse } from '../../notebook-contract.js'

/** Whole file text shown in the code view and diffed against the round baseline. */
export function pageText(page: NotebookPageResponse): string {
  return page.kind === 'markdown' ? `${page.frontmatter}${page.body}` : page.body
}

/**
 * Whether two reads describe the same page state (source text plus every field the tab renders).
 * @param left - the page currently held by the tab, if any.
 * @param right - the freshly read page.
 * @returns true when the tab can keep its current object.
 */
export function sameReviewPage(left: NotebookPageResponse, right: NotebookPageResponse): boolean {
  return left.path === right.path
    && left.kind === right.kind
    && left.title === right.title
    && left.frontmatter === right.frontmatter
    && left.body === right.body
    && left.fields.length === right.fields.length
    && left.fields.every((field, index) => field.name === right.fields[index]?.name && field.value === right.fields[index]?.value)
}
