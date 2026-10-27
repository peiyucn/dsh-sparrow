/**
 * host half 的 HTTP 收发：写 JSON / 错误响应、读请求体、限量读上游正文、请求级中止信号。
 * `parseCompleteBody` 按字节数校验，依赖 Node 的 `Buffer` —— 它是 client 不可见的 host 模块，
 * 纯逻辑那层（suggest.ts 及其关注点模块）不 re-export 它。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { validateCompletePayload, type CompleteRequest } from '../guards.js'
import { isAbortTimeout, type ChatFimError } from '../upstream.js'

/** 写 JSON 响应；已发出过响应头时不再写（避免 ERR_HTTP_HEADERS_SENT）。 */
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

/** 读请求体并逐块累计上限：超限即停读并返回 BAD_BODY，不把剩余字节读进内存。 */
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

/** 安全解析请求体；超限 / 非法 JSON 返回 BAD_BODY。 */
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

/** 限量读取上游响应正文：超过 MAX_UPSTREAM_BODY_BYTES 即取消剩余流，防止异常上游超大 body 撑爆内存。 */
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
    // 读取中断：按已读内容处理。
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8').slice(0, maxBytes)
}

/** 用客户端断开 + 超时共同 abort 上游请求。 */
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

/**
 * 把「本次上游请求为什么被中止」映射成可直接使用的出口动作。
 * 请求经 `Promise.allSettled` 收口（多建议要部分失败容错），超时 / 断开的拒绝不冒泡到外层 `catch`，故判定必须**同时**放在 settled 结果这一侧（见 host/upstream.ts 的 absorbResults），只写在 catch 里就是死代码。
 * 语义与 catch 里的兜底分支逐字一致：超时（上游）→ 504；其余中止 → 客户端断开 → destroy；正常完成恒返回 undefined。
 */
export function abortedOutcome(signal: AbortSignal): 'timeout' | 'aborted' | undefined {
  if (!signal.aborted) return undefined
  return isAbortTimeout(signal) ? 'timeout' : 'aborted'
}
