/**
 * Pure formatting / grouping helpers for the review tab.
 *
 * Keeping these out of the React component makes the user-visible pieces (the annotation batch
 * inserted into the composer, the highlighted line range, the inline-card anchors) testable without
 * a DOM. The batch text is a product contract: `docs/spec/07-notebook.md` documents the exact shape.
 */

import type { DraftAnnotation } from '../../../notebook-contract.js'

/** Comment text cap (mirrors the annotation input's maxLength). */
export const REVIEW_COMMENT_MAX_CHARS = 4_000

/** Quote one passage as a markdown blockquote. */
export function quoteBlock(quote: string): string {
  return quote.split('\n').map(line => `> ${line}`).join('\n')
}

/** One contiguous source-line range, 1-based and inclusive. */
export interface LineRange {
  readonly start: number
  readonly end: number
}

/** The range the code view highlights: the pending composer target wins over the live selection. */
export function selectedRangeOf(
  composer: { readonly scope: 'selection' | 'document'; readonly startLine?: number; readonly endLine?: number } | null,
  selection: { readonly startLine: number; readonly endLine: number } | null,
): LineRange | undefined {
  if (composer !== null && composer.scope === 'selection') {
    const start = composer.startLine ?? 0
    return { start, end: composer.endLine ?? composer.startLine ?? 0 }
  }
  return selection === null ? undefined : { start: selection.startLine, end: selection.endLine }
}

/**
 * Group the draft annotations by the source lines they cover. Every covered line is marked in the
 * code view; the inline card itself is rendered on the range's last line (see the code view).
 * @param annotations - the file's draft annotations.
 * @returns line number -> annotations covering that line.
 */
export function annotationsByLine(annotations: readonly DraftAnnotation[]): Map<number, DraftAnnotation[]> {
  const byLine = new Map<number, DraftAnnotation[]>()
  for (const annotation of annotations) {
    if (annotation.scope === 'document' || annotation.endLine === undefined) continue
    for (let line = annotation.startLine ?? annotation.endLine; line <= annotation.endLine; line += 1) {
      const list = byLine.get(line) ?? []
      list.push(annotation)
      byLine.set(line, list)
    }
  }
  return byLine
}

/** One batch message inserted into the composer: one numbered block per annotation. */
export function annotationMessage(path: string, annotations: readonly DraftAnnotation[]): string {
  return annotations
    .map((annotation, index) => {
      const header = `【批注 ${index + 1}】文件：${path}`
      if (annotation.scope === 'document') {
        return `${header}\n范围：整篇笔记\n${quoteBlock(annotation.quote)}\n意见：${annotation.text}`
      }
      const range = annotation.startLine === undefined
        ? ''
        : `行号：${annotation.endLine !== undefined && annotation.endLine !== annotation.startLine ? `${annotation.startLine}-${annotation.endLine}` : annotation.startLine}\n`
      return `${header}\n${range}${quoteBlock(annotation.quote)}\n意见：${annotation.text}`
    })
    .join('\n\n')
}
