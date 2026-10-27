/** host half 的 HTTP 收口：插件错误类型、JSON 收发与上游错误分类。 */

import type { ServerResponse } from 'node:http'
import { classifyUpstreamError } from './files.js'

/** 插件自身错误（面板可读的 code / message + HTTP 状态）。 */
export class FileManageError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'FileManageError'
  }
}

export function isFileManageError(error: unknown): error is FileManageError {
  return error instanceof FileManageError
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

export function sendError(res: ServerResponse, error: FileManageError): void {
  sendJson(res, error.status, { error: { code: error.code, message: error.message } })
}

export function sendUpstreamError(res: ServerResponse, error: unknown): void {
  const info = classifyUpstreamError(error)
  sendJson(res, info.status, { error: { code: info.code, message: info.message } })
}
