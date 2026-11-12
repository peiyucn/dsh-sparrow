/** Review REST routes: handlers only; mounting and the trust fence live in host/router.ts. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { ROUTES } from '../../constants.js'
import type {
  CreateReviewRequest, ReviewListResponse, ReviewMutationResponse, ReviewPageResponse, ReviewDraft,
  UpdateReviewDraftsRequest, UpdateReviewTargetRequest,
} from '../../contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'
import { readReviewPage, resolveReviewTarget } from './review-target.js'

/** Cap on one list response; a review list is a history view, not an export. */
const MAX_REVIEW_ROWS = 100

async function listReviewsRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sessionId = url.searchParams.get('sessionId') ?? undefined
  const cwd = url.searchParams.get('cwd') ?? undefined
  const path = url.searchParams.get('path') ?? undefined
  const reviews = route.store.listReviews({
    ...sessionId === null || sessionId === '' ? {} : { sessionId },
    ...cwd === null || cwd === '' ? {} : { cwd },
    ...path === null || path === '' ? {} : { path },
  }).slice(0, MAX_REVIEW_ROWS)
  sendJson(res, 200, { reviews } satisfies ReviewListResponse)
}

async function createReviewRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<CreateReviewRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.sessionId !== 'string' || body.sessionId.trim() === '') {
    throw new DeskError('BAD_BODY', '缺少审阅会话 id')
  }
  const target = await resolveReviewTarget({ cwd: String(body.cwd ?? ''), path: String(body.path ?? '') })
  const review = await route.store.createReview({ sessionId: body.sessionId.trim(), target })
  sendJson(res, 201, { review } satisfies ReviewMutationResponse)
}

async function updateReviewDraftsRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<UpdateReviewDraftsRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少审阅记录 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  if (!Array.isArray(body.drafts)) throw new DeskError('BAD_BODY', 'drafts 必须是数组')
  const drafts: ReviewDraft[] = body.drafts.map((draft) => ({
    id: String(draft?.id ?? ''),
    quote: String(draft?.quote ?? ''),
    text: String(draft?.text ?? ''),
    createdAt: String(draft?.createdAt ?? new Date().toISOString()),
  }))
  const review = await route.store.updateReviewDrafts(body.id, body.expectedRevision, drafts)
  sendJson(res, 200, { review } satisfies ReviewMutationResponse)
}

async function updateReviewTargetRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<UpdateReviewTargetRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少审阅记录 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const target = await resolveReviewTarget({ cwd: String(body.cwd ?? ''), path: String(body.path ?? '') })
  const review = await route.store.updateReviewTarget(body.id, body.expectedRevision, target)
  sendJson(res, 200, { review } satisfies ReviewMutationResponse)
}

async function getReviewRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const id = url.searchParams.get('id') ?? ''
  if (id === '') throw new DeskError('BAD_BODY', '缺少审阅记录 id')
  const review = route.store.getReview(id)
  if (review === undefined) throw new DeskError('UNKNOWN_REVIEW', '审阅记录不存在', 404)
  sendJson(res, 200, { review } satisfies ReviewMutationResponse)
}

async function reviewPageRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const reviewId = url.searchParams.get('reviewId') ?? ''
  if (reviewId === '') throw new DeskError('BAD_BODY', '缺少审阅记录 id')
  const review = route.store.getReview(reviewId)
  if (review === undefined) throw new DeskError('UNKNOWN_REVIEW', '审阅记录不存在', 404)
  sendJson(res, 200, await readReviewPage(review.target) satisfies ReviewPageResponse)
}
export const REVIEW_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.reviewList, handle: listReviewsRoute },
  { method: 'GET', path: ROUTES.reviewGet, handle: getReviewRoute },
  { method: 'GET', path: ROUTES.reviewPage, handle: reviewPageRoute },
  { method: 'POST', path: ROUTES.reviewCreate, handle: createReviewRoute },
  { method: 'POST', path: ROUTES.reviewUpdateTarget, handle: updateReviewTargetRoute },
  { method: 'POST', path: ROUTES.reviewUpdateDrafts, handle: updateReviewDraftsRoute },
]
