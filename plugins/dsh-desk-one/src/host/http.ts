

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { MAX_BODY_BYTES } from '../constants.js'
import { DeskModelError } from '../model.js'

type DeskErrorCode =
  | 'BAD_BODY'
  | 'FORBIDDEN'
  | 'INVALID_NOTE'
  | 'REVISION_CONFLICT'
  | 'UNKNOWN_NOTE'
  | 'UNKNOWN_WORKSPACE'
  | 'STORAGE_ERROR'

  | 'INVALID_NOTEBOOK'
  | 'NOTEBOOK_UNAVAILABLE'

  | 'INVALID_SCHEDULE'
  | 'UNKNOWN_CALENDAR'
  | 'SCHEDULE_NOT_CONNECTED'
  | 'SCHEDULE_AUTH_EXPIRED'
  | 'SCHEDULE_UNAVAILABLE'

export class DeskError extends Error {
  constructor(readonly code: DeskErrorCode, message: string, readonly status = 400) {
    super(message)
    this.name = 'DeskError'
  }
}


export interface DeskHttpFailure {
  readonly code: string
  readonly message: string
  readonly status: number
}


function isHttpFailure(error: unknown): error is DeskHttpFailure {
  if (!(error instanceof Error)) return false
  const candidate = error as Partial<DeskHttpFailure>
  return typeof candidate.code === 'string' && typeof candidate.status === 'number'
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}


export function sendError(ctx: Context, res: ServerResponse, error: unknown): void {
  if (error instanceof DeskModelError) {
    const status = error.code === 'REVISION_CONFLICT'
      ? 409
      : error.code === 'UNKNOWN_NOTE' || error.code === 'UNKNOWN_TASK' || error.code === 'UNKNOWN_GROUP'
        || error.code === 'UNKNOWN_CALENDAR' ? 404 : 400
    sendJson(res, status, { error: { code: error.code, message: error.message } })
    return
  }
  if (error instanceof DeskError) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }


  if (isHttpFailure(error)) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  ctx.logger.warn(`dsh-desk-one: 未预期的路由错误：${message}`)
  sendJson(res, 500, { error: { code: 'STORAGE_ERROR', message: '存储或路由内部错误' } })
}


export async function readJsonBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > maxBytes) {
        throw new DeskError('BAD_BODY', `请求体超过 ${maxBytes} 字节上限`)
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


export function bodyObject<T extends object>(value: unknown, message: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeskError('BAD_BODY', message)
  }
  return value as T
}
