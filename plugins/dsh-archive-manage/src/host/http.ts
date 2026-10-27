/** host half 的 HTTP 基础件：JSON 收发、请求体读取、统一错误类型。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { maskHomePath } from '../archive.js'
import { MAX_BODY_BYTES } from '../constants.js'

export type ArchiveErrorCode =
  | 'BAD_BODY'
  | 'NOT_ARCHIVED'
  | 'UNKNOWN_SESSION'
  | 'UNKNOWN_TRASH'
  | 'SESSION_LIVE'
  | 'BACKEND_UNSUPPORTED'
  | 'CONFIRMATION_FAILED'
  | 'TARGET_EXISTS'
  | 'FORBIDDEN'
  | 'IO_ERROR'

export class ArchiveError extends Error {
  constructor(readonly code: ArchiveErrorCode, message: string, readonly status = 400) {
    super(message)
    this.name = 'ArchiveError'
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

export function sendError(ctx: Context, res: ServerResponse, error: unknown): void {
  if (error instanceof ArchiveError) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }
  // 500 是没有专门归类的意外路径：留一条 warn 供宿主日志定位，响应仍掩码 home 前缀
  // （原生 fs 错误消息可能含绝对路径，与 /trash-dir 的展示口径一致）。
  const raw = error instanceof Error ? error.message : String(error)
  ctx.logger.warn(`dsh-archive-manage: 未预期的路由错误：${raw}`)
  sendJson(res, 500, { error: { code: 'IO_ERROR', message: maskHomePath(raw, homedir()) } })
}

/** 读并解析 JSON 请求体；超限 / 读取失败 / 非法 JSON 一律抛 {@link ArchiveError}，由路由的 catch 收口。 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_BODY_BYTES) {
        throw new ArchiveError('BAD_BODY', `请求体超过 ${MAX_BODY_BYTES} 字节上限`)
      }
      chunks.push(buffer)
    }
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    throw new ArchiveError('BAD_BODY', '读取请求体失败')
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new ArchiveError('BAD_BODY', '请求体不是合法 JSON')
  }
}

/** 断言请求体是 JSON 对象；具体字段由各路由按 contract.ts 的请求类型读取。 */
export function bodyObject<T extends object>(value: unknown, message: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ArchiveError('BAD_BODY', message)
  }
  return value as T
}
