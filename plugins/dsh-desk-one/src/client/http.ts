/** Shared browser-side JSON transport: every feature talks to this plugin's own REST routes. */

import { REQUEST_TIMEOUT_MS } from '../constants.js'
import type { ApiErrorPayload } from '../contract.js'

/**
 * Fetch one JSON document with a timeout.
 * @param path - route path (this plugin's own prefix).
 * @param init - fetch options; the caller's signal wins over the default timeout.
 * @returns the parsed payload.
 */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const text = await response.text()
  let payload: T & Partial<ApiErrorPayload>
  try {
    payload = JSON.parse(text) as T & Partial<ApiErrorPayload>
  } catch {
    throw new Error(`请求失败（HTTP ${response.status}）：${text.slice(0, 160) || '响应不是 JSON'}`)
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

/** POST a JSON body to one route. */
export function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** DELETE one route. */
export function deleteJson<T>(path: string): Promise<T> {
  return fetchJson<T>(path, { method: 'DELETE' })
}
