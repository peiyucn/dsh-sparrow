/** dsh-file-session host half：DeepSeek Files API 云端文件清单 REST 路由（复用官方 DeepSeekFilesClient）。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { DeepSeekFileId, DeepSeekFilesClient } from '@deepseek-ai/dsh-llm-deepseek'
import { classifyUpstreamError, COUNT_PAGE_TIMEOUT_MS, formatBytes, MAX_COUNT_PAGES, normalizePageQuery, toFileRow } from './files.js'

export const name = 'dsh-file-session'
export const inject = ['webServer', 'credentials', 'settings']

const PREFIX = '/api/file-session'
/** 官方 adapter 同款回退：设置节缺省时依次回退环境变量与公共端点。 */
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
const LLM_DEEPSEEK_NS = 'llm-deepseek'

/** 插件自身错误（面板可读的 code / message + HTTP 状态）。 */
class FileSessionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'FileSessionError'
  }
}

/**
 * 只读官方 llm-deepseek 设置节（ctx.settings.describe 的已解析值：schema 默认 + 组合 base + 用户层）。
 * 本插件只用 baseURL / apiKeyEnv 两个字段；字段缺失回退官方默认。
 */
function readLlmDeepseekSection(ctx: Context): { baseURL?: string; apiKeyEnv?: string } {
  const descriptor = ctx.settings.describe().find(item => item.ns === LLM_DEEPSEEK_NS)
  const value = descriptor?.value as { baseURL?: unknown; apiKeyEnv?: unknown } | undefined
  return {
    ...typeof value?.baseURL === 'string' && value.baseURL !== '' ? { baseURL: value.baseURL } : {},
    ...typeof value?.apiKeyEnv === 'string' && value.apiKeyEnv !== '' ? { apiKeyEnv: value.apiKeyEnv } : {},
  }
}

interface Connection {
  baseURL: string
  apiKey: string
}

/** 每请求解析连接事实（与官方 adapter 同路径）：设置节 → ctx.credentials 解析 → 环境回退。 */
async function resolveConnection(ctx: Context): Promise<Connection> {
  const section = readLlmDeepseekSection(ctx)
  const baseURL = section.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL
  const apiKeyEnv = section.apiKeyEnv ?? DEFAULT_API_KEY_ENV
  let credential
  try {
    credential = await ctx.credentials.resolve(credentialRef(apiKeyEnv))
  } catch {
    throw new FileSessionError('INVALID_CONFIG', `apiKeyEnv 配置不是合法的凭据引用：${apiKeyEnv}`, 500)
  }
  if (credential === undefined) {
    throw new FileSessionError('MISSING_CREDENTIAL', `缺少凭据 ${apiKeyEnv}：请在 dsh 中配置 DeepSeek API key 后重试`, 401)
  }
  return { baseURL, apiKey: credential.value }
}

function isFileSessionError(error: unknown): error is FileSessionError {
  return error instanceof FileSessionError
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function sendError(res: ServerResponse, error: FileSessionError): void {
  sendJson(res, error.status, { error: { code: error.code, message: error.message } })
}

function sendUpstreamError(res: ServerResponse, error: unknown): void {
  const info = classifyUpstreamError(error)
  sendJson(res, info.status, { error: { code: info.code, message: info.message } })
}

/**
 * host half 入口：注册 prefix 路由（list / 单条删除），全部副作用挂在 apply 的 effect 上。
 * @param ctx - DSH 插件上下文。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = url.pathname
      try {
        if (req.method === 'GET' && pathname === `${PREFIX}/list`) {
          const query = normalizePageQuery({
            after: url.searchParams.get('after') ?? undefined,
            limit: url.searchParams.get('limit') ?? undefined,
            order: url.searchParams.get('order') ?? undefined,
          })
          const connection = await resolveConnection(ctx)
          const client = new DeepSeekFilesClient({ baseURL: connection.baseURL, apiKey: connection.apiKey })
          const page = await client.list({
            ...query.after === undefined ? {} : { after: DeepSeekFileId(query.after) },
            limit: query.limit,
            order: query.order,
          })
          sendJson(res, 200, {
            items: page.data.map(toFileRow),
            hasMore: page.hasMore,
            ...page.lastId === undefined ? {} : { lastId: page.lastId },
          })
          return
        }
        if (req.method === 'GET' && pathname === `${PREFIX}/count`) {
          // 官方 list 无总数字段：翻到底累计（每页 1000，配额内最多 10 页，MAX_COUNT_PAGES 兜底）。
          const connection = await resolveConnection(ctx)
          const client = new DeepSeekFilesClient({ baseURL: connection.baseURL, apiKey: connection.apiKey })
          let count = 0
          let totalBytes = 0
          let after: DeepSeekFileId | undefined
          for (let page = 0; page < MAX_COUNT_PAGES; page++) {
            const result = await client.list({
              ...after === undefined ? {} : { after },
              limit: 1000,
              order: 'desc',
              signal: AbortSignal.timeout(COUNT_PAGE_TIMEOUT_MS),
            })
            count += result.data.length
            for (const file of result.data) totalBytes += file.bytes
            if (!result.hasMore || result.lastId === undefined) break
            after = result.lastId
          }
          sendJson(res, 200, { count, totalBytesLabel: formatBytes(totalBytes) })
          return
        }
        if (req.method === 'DELETE' && pathname === `${PREFIX}/files`) {
          const id = decodeURIComponent(url.searchParams.get('id') ?? '')
          if (id === '') {
            sendError(res, new FileSessionError('BAD_REQUEST', '缺少文件 id', 400))
            return
          }
          const connection = await resolveConnection(ctx)
          const client = new DeepSeekFilesClient({ baseURL: connection.baseURL, apiKey: connection.apiKey })
          await client.delete(DeepSeekFileId(id))
          sendJson(res, 200, { deleted: true, id })
          return
        }
        sendError(res, new FileSessionError('NOT_FOUND', '未知路由', 404))
      } catch (error: unknown) {
        if (isFileSessionError(error)) sendError(res, error)
        else sendUpstreamError(res, error)
      }
    },
  }))
}
