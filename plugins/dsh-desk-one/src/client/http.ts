/** Shared browser-side JSON transport: every feature talks to this plugin's own REST routes. */

import { REQUEST_TIMEOUT_MS } from '../constants.js'
import type { ApiErrorPayload } from '../contract.js'

/** Transport failure carrying the HTTP status, so callers can special-case opt-in outcomes (409) and timeouts (0). */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Per-call transport tuning; ordinary CRUD calls keep the shared defaults. */
export interface JsonRequestOptions {
  /** Abort after this many milliseconds. Ignored when the caller passes its own `init.signal`. */
  readonly timeoutMs?: number
  /** User-visible timeout text; long-running routes explain what may still be running. */
  readonly timeoutMessage?: string
}

/** Default timeout text: an ordinary request is safe to retry, so it names no background work. */
const DEFAULT_TIMEOUT_MESSAGE = '请求超时：服务器响应过慢，请稍后重试'

/** `AbortSignal.timeout` rejects with a `DOMException`; only a signal this module created may become a timeout. */
function isTimeoutRejection(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/**
 * Fetch one JSON document with a timeout.
 * @param path - route path (this plugin's own prefix).
 * @param init - fetch options; the caller's signal wins over the default timeout.
 * @param options - timeout tuning (see `JsonRequestOptions`).
 * @returns the parsed payload.
 */
export async function fetchJson<T>(path: string, init?: RequestInit, options?: JsonRequestOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
  let response: Response
  try {
    response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    // A caller-supplied signal is never rewritten: its abort stays a plain rejection.
    if (init?.signal === undefined && isTimeoutRejection(error)) {
      throw new HttpError(0, options?.timeoutMessage ?? DEFAULT_TIMEOUT_MESSAGE)
    }
    throw error
  }
  const text = await response.text()
  let payload: T & Partial<ApiErrorPayload>
  try {
    payload = JSON.parse(text) as T & Partial<ApiErrorPayload>
  } catch {
    throw new HttpError(response.status, `请求失败（HTTP ${response.status}）：${text.slice(0, 160) || '响应不是 JSON'}`)
  }
  if (!response.ok) throw new HttpError(response.status, payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

/** POST a JSON body to one route. */
export function postJson<T>(path: string, body: unknown, options?: JsonRequestOptions): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, options)
}

/** DELETE one route. */
export function deleteJson<T>(path: string, body?: unknown, options?: JsonRequestOptions): Promise<T> {
  return fetchJson<T>(path, {
    method: 'DELETE',
    ...body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  }, options)
}
