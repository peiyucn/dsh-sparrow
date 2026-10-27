/** REST 路由：信任栅栏 → list / count / delete 分发 → JSON 收口（含上游错误分类）。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { DeepSeekFileId } from '@deepseek-ai/dsh-llm-deepseek'
import {
  COUNT_PAGE_LIMIT,
  COUNT_TOTAL_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  ROUTES,
} from './constants.js'
import { resolveConnection, type Connection } from './connection.js'
import { countPageBudget, decodeFileIdParam, formatBytes, normalizePageQuery, toFileRow, authHeaders } from './files.js'
import { FileManageError, isFileManageError, sendError, sendJson, sendUpstreamError } from './http.js'
import { deepSeekSurface, type DeepSeekSurface } from './surface.js'
import { isTrustedPluginRequest, officialTrustedHosts } from './trust.js'

function createClient(surface: DeepSeekSurface, connection: Connection): InstanceType<DeepSeekSurface['DeepSeekFilesClient']> {
  return new surface.DeepSeekFilesClient({ baseURL: connection.baseURL, headers: authHeaders(connection.apiKey) })
}

/** 建 prefix 路由 handler；信任面与凭据都在请求期读取。 */
export function createRouteHandler(ctx: Context): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      // 官方栅栏挂在 /api 前缀上，而本路由更长，「前缀最长者胜」使请求走不到官方那道检查，必须自己判。
      if (!isTrustedPluginRequest(req.headers, officialTrustedHosts(ctx))) {
        sendError(res, new FileManageError('FORBIDDEN', '拒绝跨站来源的请求', 403))
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const surface = await deepSeekSurface()

      if (req.method === 'GET' && url.pathname === ROUTES.list) {
        const query = normalizePageQuery({
          after: url.searchParams.get('after') ?? undefined,
          limit: url.searchParams.get('limit') ?? undefined,
        })
        const client = createClient(surface, await resolveConnection(ctx, surface))
        const page = await client.list({
          ...query.after === undefined ? {} : { after: surface.DeepSeekFileId(query.after) },
          limit: query.limit,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        sendJson(res, 200, {
          items: page.data.map(toFileRow),
          hasMore: page.hasMore,
          ...page.lastId === undefined ? {} : { lastId: page.lastId },
        })
        return
      }

      if (req.method === 'GET' && url.pathname === ROUTES.count) {
        sendJson(res, 200, await countFiles(ctx, surface, () => res.destroyed))
        return
      }

      if (req.method === 'DELETE' && url.pathname === ROUTES.files) {
        const id = decodeFileIdParam(url.searchParams.get('id') ?? '')
        if (id === '') {
          sendError(res, new FileManageError('BAD_REQUEST', '缺少文件 id', 400))
          return
        }
        const client = createClient(surface, await resolveConnection(ctx, surface))
        await client.delete(surface.DeepSeekFileId(id), AbortSignal.timeout(REQUEST_TIMEOUT_MS))
        sendJson(res, 200, { deleted: true, id })
        return
      }

      sendError(res, new FileManageError('NOT_FOUND', '未知路由', 404))
    } catch (error: unknown) {
      if (isFileManageError(error)) sendError(res, error)
      else sendUpstreamError(res, error)
    }
  }
}

/** 官方 list 无总数字段：翻到底累计；整次扫描共享一个总预算，页数按官方配额派生。 */
async function countFiles(
  ctx: Context,
  surface: DeepSeekSurface,
  isDisconnected: () => boolean,
): Promise<Record<string, unknown>> {
  const client = createClient(surface, await resolveConnection(ctx, surface))
  const deadline = AbortSignal.timeout(COUNT_TOTAL_TIMEOUT_MS)
  const maxPages = countPageBudget(surface.MAX_STORED_FILE_COUNT)
  let count = 0
  let totalBytes = 0
  let after: DeepSeekFileId | undefined
  for (let page = 0; page < maxPages; page++) {
    // 客户端已断开（超时 / 关面板）时停止翻页：剩余页数没有接收方，白烧官方 API 配额。
    if (isDisconnected()) break
    const result = await client.list({
      ...after === undefined ? {} : { after },
      limit: COUNT_PAGE_LIMIT,
      signal: deadline,
    })
    count += result.data.length
    for (const file of result.data) totalBytes += file.bytes
    if (!result.hasMore || result.lastId === undefined) break
    after = result.lastId
  }
  return {
    count,
    totalBytes,
    totalBytesLabel: formatBytes(totalBytes),
    quotaBytes: surface.MAX_STORED_FILE_BYTES,
    quotaBytesLabel: formatBytes(surface.MAX_STORED_FILE_BYTES),
    quotaCount: surface.MAX_STORED_FILE_COUNT,
  }
}
