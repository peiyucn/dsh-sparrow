

import type { IncomingMessage, ServerResponse } from 'node:http'
import { validateCompletePayload, type CompleteRequest } from '../guards.js'
import { isAbortTimeout, type ChatFimError } from '../upstream.js'


export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

export function sendError(res: ServerResponse, status: number, error: ChatFimError): void {
  sendJson(res, status, { error })
}


export async function readRequestBody(req: IncomingMessage, maxBodyBytes: number): Promise<{ ok: true; body: string } | { ok: false; error: ChatFimError }> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > maxBodyBytes) {
        return { ok: false, error: { code: 'BAD_BODY', message: `请求体超过 ${maxBodyBytes} 字节上限` } }
      }
      chunks.push(buffer)
    }
  } catch {
    return { ok: false, error: { code: 'BAD_BODY', message: '读取请求体失败' } }
  }
  return { ok: true, body: Buffer.concat(chunks).toString('utf8') }
}


export function parseCompleteBody(body: string, maxBodyBytes: number, maxPromptChars = Number.MAX_SAFE_INTEGER): CompleteRequest | ChatFimError {
  if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
    return { code: 'BAD_BODY', message: `请求体超过 ${maxBodyBytes} 字节上限` }
  }
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return { code: 'BAD_BODY', message: '请求体不是合法 JSON' }
  }
  return validateCompletePayload(value, maxPromptChars)
}


export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        break
      }
    }
  } catch {

  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8').slice(0, maxBytes)
}


export function requestSignal(res: ServerResponse, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const abort = (reason: Error): void => {
    if (!controller.signal.aborted) controller.abort(reason)
  }
  const onClose = (): void => {
    abort(new Error('client closed request'))
  }
  res.once('close', onClose)
  const timer = setTimeout(() => {
    abort(new DOMException('FIM request timed out', 'TimeoutError'))
  }, timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      res.off('close', onClose)
    },
  }
}


export function abortedOutcome(signal: AbortSignal): 'timeout' | 'aborted' | undefined {
  if (!signal.aborted) return undefined
  return isAbortTimeout(signal) ? 'timeout' : 'aborted'
}
