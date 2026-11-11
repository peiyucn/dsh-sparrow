/**
 * Session-row badge: marks a Session as a review session.
 *
 * The list slot renders once per Session row, so the review links are fetched once into a
 * module cache instead of one request per row.
 */

import { useEffect, useState, type ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only import: loads the official SlotMap augmentation that declares the row seat.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { ReviewApi } from './review-api.js'

/** Review-api handle, configured once at client start. */
let api: ReviewApi | undefined
/** Review session id → reviewed file title; `null` until the first load resolves. */
let cache: Map<string, string> | null = null
/** In-flight load (one fetch at a time). */
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

/** Wire the badge to the review data surface. */
export function configureReviewBadges(reviewApi: ReviewApi): void {
  api = reviewApi
}

/** Drop the cached set; the next badge render reloads it. */
export function invalidateReviewBadges(): void {
  cache = null
  loading = null
  for (const listener of listeners) listener()
}

function ensureLoaded(): void {
  if (api === undefined || cache !== null || loading !== null) return
  loading = api.list()
    .then((reviews) => {
      cache = new Map(reviews.map(review => [review.sessionId, review.target.title]))
      for (const listener of listeners) listener()
    }, () => undefined)
    .finally(() => { loading = null })
}

/** Review badge for one Session row (renders nothing for ordinary Sessions). */
export function SessionReviewBadge(
  props: { readonly sessionId: string } & PropsLocale<typeof LOCALE_NAMESPACE>,
): ReactElement | null {
  const [, force] = useState(0)
  useEffect(() => {
    ensureLoaded()
    listeners.add(() => force(value => value + 1))
  }, [])
  const title = cache?.get(props.sessionId)
  if (title === undefined) return null
  return (
    <span
      className="dsh-desk-session-review-badge"
      title={props.t('review.badgeTitle', { title })}
    >
      {props.t('review.badge')}
    </span>
  )
}
