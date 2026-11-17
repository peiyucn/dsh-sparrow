

import { REQUEST_TIMEOUT_MS } from '../constants.js'
import type { ApiErrorPayload } from '../contract.js'


export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message)
    this.name = 'HttpError'
  }
}


export interface JsonRequestOptions {

  readonly timeoutMs?: number

  readonly timeoutMessage?: string
}


const DEFAULT_TIMEOUT_MESSAGE = '请求超时：服务器响应过慢，请稍后重试'


function isTimeoutRejection(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
}


export async function fetchJson<T>(path: string, init?: RequestInit, options?: JsonRequestOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
  let response: Response
  try {
    response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (error) {

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
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload.error?.message ?? `请求失败（HTTP ${response.status}）`,
      payload.error?.code,
    )
  }
  return payload
}


export function postJson<T>(path: string, body: unknown, options?: JsonRequestOptions): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, options)
}


export function deleteJson<T>(path: string, body?: unknown, options?: JsonRequestOptions): Promise<T> {
  return fetchJson<T>(path, {
    method: 'DELETE',
    ...body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  }, options)
}
