/**
 * Browser-side review data surface: review links, their page reads, and re-attaching.
 *
 * The review state itself lives in the DSH session; this module only carries the
 * association record's JSON over the plugin's own REST routes.
 */

import { ROUTES } from '../../constants.js'
import type {
  CreateReviewRequest, DeskReview, ReviewListResponse, ReviewMutationResponse, ReviewPageResponse,
  UpdateReviewDraftsRequest, UpdateReviewTargetRequest,
} from '../../contract.js'
import { fetchJson, postJson } from '../http.js'

/** Review links, optionally narrowed to a session, workspace root, or file path. */
export function listReviews(filter?: {
  readonly sessionId?: string
  readonly cwd?: string
  readonly path?: string
}): Promise<readonly DeskReview[]> {
  const params = new URLSearchParams()
  if (filter?.sessionId !== undefined && filter.sessionId !== '') params.set('sessionId', filter.sessionId)
  if (filter?.cwd !== undefined && filter.cwd !== '') params.set('cwd', filter.cwd)
  if (filter?.path !== undefined && filter.path !== '') params.set('path', filter.path)
  const suffix = params.size === 0 ? '' : `?${params.toString()}`
  return fetchJson<ReviewListResponse>(`${ROUTES.reviewList}${suffix}`).then(payload => payload.reviews)
}

/** One review link by id. */
export function getReview(id: string): Promise<DeskReview> {
  return fetchJson<ReviewMutationResponse>(`${ROUTES.reviewGet}?id=${encodeURIComponent(id)}`).then(payload => payload.review)
}

/** Create the link between a freshly created review session and its target file. */
export function createReview(input: CreateReviewRequest): Promise<DeskReview> {
  return postJson<ReviewMutationResponse>(ROUTES.reviewCreate, input).then(payload => payload.review)
}

/** Re-point one review at another file (manual re-attach). */
export function updateReviewTarget(input: UpdateReviewTargetRequest): Promise<DeskReview> {
  return postJson<ReviewMutationResponse>(ROUTES.reviewUpdateTarget, input).then(payload => payload.review)
}

/** Replace one review's unsaved drafts (survives closing the tab and restarting DSH). */
export function updateReviewDrafts(input: UpdateReviewDraftsRequest): Promise<DeskReview> {
  return postJson<ReviewMutationResponse>(ROUTES.reviewUpdateDrafts, input).then(payload => payload.review)
}

/** Read a file straight from a target, without creating a review record. */
export function reviewTargetPage(input: { readonly cwd: string; readonly path: string }): Promise<ReviewPageResponse> {
  const params = new URLSearchParams({ cwd: input.cwd, path: input.path })
  return fetchJson<ReviewPageResponse>(`${ROUTES.reviewTargetPage}?${params.toString()}`)
}

/** Read the reviewed file as the tab renders it. */
export function reviewPage(reviewId: string): Promise<ReviewPageResponse> {
  return fetchJson<ReviewPageResponse>(`${ROUTES.reviewPage}?reviewId=${encodeURIComponent(reviewId)}`)
}

/** The injected facade shape the notebook and review tab receive. */
export interface ReviewApi {
  readonly list: typeof listReviews
  readonly get: typeof getReview
  readonly create: typeof createReview
  readonly updateTarget: typeof updateReviewTarget
  readonly updateDrafts: typeof updateReviewDrafts
  readonly page: typeof reviewPage
  readonly pageByTarget: typeof reviewTargetPage
}

/** One facade object handed to the page through `DeskPanelInjected`. */
export const reviewApi: ReviewApi = {
  list: listReviews,
  get: getReview,
  create: createReview,
  updateTarget: updateReviewTarget,
  updateDrafts: updateReviewDrafts,
  page: reviewPage,
  pageByTarget: reviewTargetPage,
}
