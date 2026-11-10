/**
 * Annotation records: anchors, threads, and the review status machine.
 *
 * A thread never writes into the markdown page — it is a Desk One object keyed by
 * a portable relative path. Anchors are validated here so a malformed selector can
 * never reach the store, and the status machine is the single place that decides
 * which transitions exist.
 */

import { MAX_ANNOTATION_COMMENTS } from '../../constants.js'
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
  options: { readonly id: string; readonly now: string; readonly schema: number; readonly linkedSessionId?: string },
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
 * The status machine: every transition keeps a thread reviewable.
 *
 * Accepting closes the CURRENT round only, so `resolved` comes from `answered` alone:
 * a reopened thread (`open`) has no pending AI answer to accept until another round
 * produces one. `resolved` is a human act — the REST surface sets it and the agent
 * tools expose `answered` alone, so the model can never close a thread.
 */
const STATUS_TRANSITIONS: Readonly<Record<DeskAnnotation['status'], readonly DeskAnnotation['status'][]>> = {
  open: ['open', 'answered', 'orphaned'],
  answered: ['answered', 'open', 'resolved', 'orphaned'],
  resolved: ['resolved', 'open', 'orphaned'],
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
