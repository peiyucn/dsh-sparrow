/** host half 的 HTTP 基础件：JSON 收发、请求体读取、统一错误类型。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { MAX_BODY_BYTES } from '../constants.js'
import { DeskModelError } from '../model.js'

export type DeskErrorCode =
  | 'BAD_BODY'
  | 'FORBIDDEN'
  | 'INVALID_NOTE'
  | 'REVISION_CONFLICT'
  | 'UNKNOWN_NOTE'
  | 'STORAGE_ERROR'

export class DeskError extends Error {
  constructor(readonly code: DeskErrorCode, message: string, readonly status = 400) {
    super(message)
    this.name = 'DeskError'
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

/** 统一错误收口：模型错误按语义映射状态码；未知错误记日志并回 500（不把内部细节透给前端）。 */
export function sendError(ctx: Context, res: ServerResponse, error: unknown): void {
  if (error instanceof DeskModelError) {
    const status = error.code === 'REVISION_CONFLICT'
      ? 409
      : error.code === 'UNKNOWN_NOTE' || error.code === 'UNKNOWN_TASK' ? 404 : 400
    sendJson(res, status, { error: { code: error.code, message: error.message } })
    return
  }
  if (error instanceof DeskError) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  ctx.logger.warn(`dsh-desk-one: 未预期的路由错误：${message}`)
  sendJson(res, 500, { error: { code: 'STORAGE_ERROR', message: '存储或路由内部错误' } })
}

/** 读并解析 JSON 请求体；超限 / 读取失败 / 非法 JSON 一律抛 {@link DeskError}。 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_BODY_BYTES) {
        throw new DeskError('BAD_BODY', `请求体超过 ${MAX_BODY_BYTES} 字节上限`)
      }
      chunks.push(buffer)
    }
  } catch (error) {
    if (error instanceof DeskError) throw error
    throw new DeskError('BAD_BODY', '读取请求体失败')
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new DeskError('BAD_BODY', '请求体不是合法 JSON')
  }
}

/** 断言请求体是 JSON 对象；具体字段由各路由按 contract.ts 的请求类型读取。 */
export function bodyObject<T extends object>(value: unknown, message: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeskError('BAD_BODY', message)
  }
  return value as T
}
