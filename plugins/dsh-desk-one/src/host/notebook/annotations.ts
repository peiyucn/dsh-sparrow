/**
 * Annotation records: anchors, threads, and the review status machine.
 *
 * A thread never writes into the markdown page — it is a Desk One object keyed by
 * a portable relative path. Anchors are validated here so a malformed selector can
 * never reach the store, and the status machine is the single place that decides
 * which transitions exist.
 */

import { MAX_ANNOTATION_COMMENTS, NOTEBOOK_BASELINE_MAX_CHARS } from '../../constants.js'
import type {
  AnnotationAnchor, AnnotationComment, DeskAnnotation,
} from '../../contract.js'
import { DeskModelError } from '../../model/errors.js'
import { normalizeLibraryPath } from './library.js'

/** A non-empty comment body, capped like the note body cap. */
export function normalizeCommentBody(raw: unknown, label = '批注内容'): string {
  if (typeof raw !== 'string') throw new DeskModelError('INVALID_ANNOTATION', `缺少${label}`)
  const body = raw.trim()
  if (body === '') throw new DeskModelError('INVALID_ANNOTATION', `缺少${label}`)
  if (body.length > 20_000) throw new DeskModelError('INVALID_ANNOTATION', `${label}超过长度上限`)
  return body
}

/** Optional context around a quote (kept short so selector records stay small). */
function contextSlice(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.slice(0, 64)
  return value === '' ? undefined : value
}

/** Validate one anchor; both variants carry the text the reviewer actually selected. */
export function normalizeAnnotationAnchor(raw: unknown): AnnotationAnchor {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DeskModelError('INVALID_ANNOTATION', '缺少批注锚点')
  }
  const anchor = raw as Record<string, unknown>
  if (anchor.type === 'field') {
    const field = typeof anchor.field === 'string' ? anchor.field.trim() : ''
    if (field === '') throw new DeskModelError('INVALID_ANNOTATION', '字段锚缺少字段名')
    const value = typeof anchor.value === 'string' ? anchor.value : ''
    return { type: 'field', field, value }
  }
  if (anchor.type === 'quote') {
    const quote = typeof anchor.quote === 'string' ? anchor.quote.trim() : ''
    if (quote === '') throw new DeskModelError('INVALID_ANNOTATION', '引用锚缺少引文')
    const prefix = contextSlice(anchor.prefix)
    const suffix = contextSlice(anchor.suffix)
    const position = typeof anchor.position === 'number' && Number.isFinite(anchor.position)
      ? Math.max(0, Math.floor(anchor.position))
      : undefined
    return {
      type: 'quote',
      quote,
      ...prefix === undefined ? {} : { prefix },
      ...suffix === undefined ? {} : { suffix },
      ...position === undefined ? {} : { position },
    }
  }
  throw new DeskModelError('INVALID_ANNOTATION', '批注锚点类型必须是 field 或 quote')
}

/** One new thread: the first comment is the human's, and the thread starts `open`. */
export function createAnnotationRecord(
  input: { readonly path?: unknown; readonly anchor?: unknown; readonly body?: unknown },
  options: {
    readonly id: string
    readonly now: string
    readonly schema: number
    readonly linkedSessionId?: string
    /** Page body at creation, when the caller could read it. */
    readonly baselineText?: string
  },
): DeskAnnotation {
  const comment: AnnotationComment = { author: 'human', body: normalizeCommentBody(input.body), at: options.now }
  return {
    id: options.id,
    kind: 'annotation',
    schema: options.schema,
    path: normalizeLibraryPath(input.path),
    anchor: normalizeAnnotationAnchor(input.anchor),
    comments: [comment],
    status: 'open',
    ...options.linkedSessionId === undefined ? {} : { linkedSessionId: options.linkedSessionId },
    ...options.baselineText === undefined ? {} : { baseline: { at: options.now, text: options.baselineText.slice(0, NOTEBOOK_BASELINE_MAX_CHARS) } },
    createdAt: options.now,
    updatedAt: options.now,
    revision: 1,
  }
}

/** Append one message to a thread; the thread is capped so a single record stays bounded. */
export function appendAnnotationComment(
  current: DeskAnnotation,
  input: { readonly body: unknown; readonly author: unknown },
  now: string,
): DeskAnnotation {
  if (input.author !== 'human' && input.author !== 'ai') {
    throw new DeskModelError('INVALID_ANNOTATION', '批注作者必须是 human 或 ai')
  }
  if (current.comments.length >= MAX_ANNOTATION_COMMENTS) {
    throw new DeskModelError('INVALID_ANNOTATION', `一条批注最多 ${MAX_ANNOTATION_COMMENTS} 条消息，请新开一条批注`)
  }
  const comment: AnnotationComment = { author: input.author, body: normalizeCommentBody(input.body), at: now }
  return { ...current, comments: [...current.comments, comment], updatedAt: now, revision: current.revision + 1 }
}

/**
 * The status machine for explicit patches.
 *
 * Replies move the thread on their own (AI reply → `answered`, human reply → `open`),
 * so this map only has to cover accept and anchor loss: accepting is the single
 * `answered → resolved` step, and a resolved thread is terminal here — replying is
 * what reopens a discussion.
 */
const STATUS_TRANSITIONS: Readonly<Record<DeskAnnotation['status'], readonly DeskAnnotation['status'][]>> = {
  open: ['open', 'answered', 'orphaned'],
  answered: ['answered', 'open', 'resolved', 'orphaned'],
  resolved: ['resolved'],
  orphaned: ['orphaned', 'open'],
}

/** Apply one status change; an illegal transition throws instead of silently clamping. */
export function patchAnnotationStatus(
  current: DeskAnnotation,
  rawStatus: unknown,
  now: string,
): DeskAnnotation {
  const status = rawStatus as DeskAnnotation['status']
  const allowed = STATUS_TRANSITIONS[current.status]
  if (allowed === undefined || !allowed.includes(status)) {
    throw new DeskModelError('INVALID_ANNOTATION', `批注状态不能从 ${current.status} 变为 ${String(rawStatus)}`)
  }
  if (status === current.status) return current
  return { ...current, status, updatedAt: now, revision: current.revision + 1 }
}

/**
 * Deleting a thread removes the whole review record; accept it or keep it instead.
 * Accepted threads are the review history, so only unfinished records may be deleted.
 * @param status - current thread status.
 */
export function assertAnnotationDeletable(status: DeskAnnotation['status']): void {
  if (status === 'resolved') throw new DeskModelError('INVALID_ANNOTATION', '已接受的批注不能删除（审阅历史保留）')
}

/** One frontmatter field as the page currently has it. */
export interface CurrentField {
  readonly name: string
  readonly value: string
}

/**
 * Whether an anchor still resolves against the current page.
 *
 * A quote anchor resolves while its exact text exists; a field anchor resolves while the
 * field exists (a changed value is shown as old/new, not treated as stale).
 * @param anchor - stored anchor.
 * @param body - current markdown body.
 * @param fields - current frontmatter fields.
 * @returns true while the anchor can be located.
 */
export function anchorStillValid(
  anchor: AnnotationAnchor,
  body: string,
  fields: readonly CurrentField[],
): boolean {
  if (anchor.type === 'quote') return body.includes(anchor.quote)
  return fields.some(field => field.name === anchor.field)
}

/** Context characters kept on either side of a relocated quote. */
const RELOCATION_CONTEXT_CHARS = 32
/** A relocation candidate longer than this is treated as a mismatch, not a quote. */
const RELOCATION_QUOTE_MAX = 1_000

/** Whitespace-insensitive projection of a string, with a map back to original offsets. */
function projectWithoutWhitespace(text: string): { readonly flat: string; readonly map: readonly number[] } {
  let flat = ''
  const map: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (/\s/u.test(char)) continue
    flat += char
    map.push(index)
  }
  return { flat, map }
}

/**
 * Try to find where a stale quote anchor moved to, without asking the human.
 *
 * Two passes, cheapest first: an exact match after removing whitespace (re-wrapped or
 * re-indented text), then the stored prefix/suffix context (the passage was rewritten but
 * its surroundings survived). Anything ambiguous returns undefined — a wrong relocation is
 * worse than an orphaned thread.
 * @param anchor - stale anchor.
 * @param body - current markdown body.
 * @param fields - current frontmatter fields (field anchors only).
 * @returns the relocated anchor, or undefined when relocation is not reliable.
 */
export function autoRelocateAnchor(
  anchor: AnnotationAnchor,
  body: string,
  fields: readonly CurrentField[],
): AnnotationAnchor | undefined {
  if (anchor.type === 'field') return fields.some(field => field.name === anchor.field) ? anchor : undefined
  if (body.includes(anchor.quote)) return anchor
  // Pass 1: whitespace-insensitive exact match.
  const source = projectWithoutWhitespace(body)
  const needle = projectWithoutWhitespace(anchor.quote).flat
  if (needle !== '') {
    const at = source.flat.indexOf(needle)
    if (at >= 0) {
      const start = source.map[at]
      const end = source.map[at + needle.length - 1] + 1
      return quoteAnchorAt(body, start, end)
    }
  }
  // Pass 2: the surrounding context survived but the passage itself changed.
  const prefix = anchor.prefix?.trim() ?? ''
  const suffix = anchor.suffix?.trim() ?? ''
  if (prefix.length < 8 || suffix.length < 8) return undefined
  const prefixAt = body.indexOf(prefix)
  if (prefixAt < 0 || body.indexOf(prefix, prefixAt + prefix.length) >= 0) return undefined
  const contentStart = prefixAt + prefix.length
  const suffixAt = body.indexOf(suffix, contentStart)
  if (suffixAt < 0 || body.indexOf(suffix, suffixAt + suffix.length) >= 0) return undefined
  const candidate = body.slice(contentStart, suffixAt).trim()
  if (candidate === '' || candidate.length > RELOCATION_QUOTE_MAX) return undefined
  const candidateAt = body.indexOf(candidate, contentStart)
  return candidateAt < 0 ? undefined : quoteAnchorAt(body, candidateAt, candidateAt + candidate.length)
}

/** Build a quote anchor for one body range, with fresh surrounding context. */
function quoteAnchorAt(body: string, start: number, end: number): AnnotationAnchor {
  const prefix = body.slice(Math.max(0, start - RELOCATION_CONTEXT_CHARS), start)
  const suffix = body.slice(end, end + RELOCATION_CONTEXT_CHARS)
  return {
    type: 'quote',
    quote: body.slice(start, end),
    ...prefix === '' ? {} : { prefix },
    ...suffix === '' ? {} : { suffix },
    position: start,
  }
}

/**
 * Whether a stale anchor may mark its thread orphaned.
 *
 * Only an untouched thread can lose its meaning: once the AI has replied, the change that
 * moved the text is usually the AI's own answer to this very thread, so invalidating it would
 * break the accept path. Accepted threads are history and never change state on detection.
 * @param status - current thread status.
 * @param hasAiComment - whether any comment in the thread came from the AI.
 * @returns true when the thread may become orphaned.
 */
export function mayBecomeOrphan(
  status: DeskAnnotation['status'],
  hasAiComment: boolean,
): boolean {
  return status === 'open' && !hasAiComment
}
