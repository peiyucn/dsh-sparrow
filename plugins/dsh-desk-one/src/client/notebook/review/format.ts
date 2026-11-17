

import type { DraftAnnotation } from '../../../notebook-contract.js'


export const REVIEW_COMMENT_MAX_CHARS = 4_000


export function quoteBlock(quote: string): string {
  return quote.split('\n').map(line => `> ${line}`).join('\n')
}


export interface LineRange {
  readonly start: number
  readonly end: number
}


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
