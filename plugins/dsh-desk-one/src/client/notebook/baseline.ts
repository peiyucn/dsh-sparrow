/**
 * Persisted review baseline: the page body a review round started from.
 *
 * Without it, reloading the tab rebaselines to the current file, so the round's diff silently
 * disappears. The baseline is kept per file identity and capped so a huge file cannot fill
 * localStorage; "rebaseline" overwrites it with the current body.
 */

import type { StorageLike } from '../pin.js'

/** localStorage key prefix; one entry per file identity. */
const KEY_PREFIX = 'dsh-desk-one.review-baseline.'

/** Bodies above this are not persisted (the diff still works for the current session). */
const MAX_BODY_CHARS = 200_000

/** Persisted baseline record. */
export interface ReviewBaseline {
  readonly body: string
  /** ISO timestamp captured when this baseline was taken. */
  readonly at: string
}

/** Browser storage, or undefined when storage is unavailable (private mode). */
function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * Read the stored baseline for one file.
 * @param fileId - file identity.
 * @param store - storage override (tests).
 * @returns the baseline, or undefined when absent / corrupt / too large.
 */
export function readReviewBaseline(fileId: string, store: StorageLike | undefined = browserStorage()): ReviewBaseline | undefined {
  if (store === undefined) return undefined
  try {
    const raw = store.getItem(KEY_PREFIX + fileId)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const body = (parsed as { body?: unknown }).body
    const at = (parsed as { at?: unknown }).at
    if (typeof body !== 'string' || typeof at !== 'string') return undefined
    return { body, at }
  } catch {
    return undefined
  }
}

/**
 * Store one file's baseline, or clear it when the body is too large.
 * @param fileId - file identity.
 * @param baseline - body + timestamp.
 * @param store - storage override (tests).
 */
export function writeReviewBaseline(fileId: string, baseline: ReviewBaseline, store: StorageLike | undefined = browserStorage()): void {
  if (store === undefined) return
  try {
    if (baseline.body.length > MAX_BODY_CHARS) {
      store.removeItem?.(KEY_PREFIX + fileId)
      return
    }
    store.setItem(KEY_PREFIX + fileId, JSON.stringify(baseline))
  } catch {
    // Quota / private mode: the session still keeps the in-memory baseline.
  }
}
