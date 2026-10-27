/**
 * 12 条 REST 路由的请求校验与分发：信任栅栏 → 表驱动匹配 → 请求层校验 → 域模块执行 → 统一错误收口。
 * 业务实现在 host/ 各域模块；本文件只关心 HTTP 形状与 contract.ts 的请求 / 响应 DTO。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  isDeleteConfirmationSufficient, straySessionIds, type ArchiveConfig, type HeaderFactsStore,
} from '../archive.js'
import { ROUTES } from '../constants.js'
import type {
  ArchiveRequest, ArchiveResponse, DeleteMutationResponse, DeleteRequest, ListResponse, RestoreRequest, RestoreResponse,
  StraysResponse, TrashDeleteAllRequest, TrashDeleteAllResponse, TrashDeleteRequest, TrashDeleteResponse,
  TrashDirResponse, TrashListResponse, TrashMutationResponse, TrashRequest, TrashRestoreAllRequest, TrashRestoreAllResponse,
  UnarchiveRequest, UnarchiveResponse,
} from '../contract.js'
import { isTrustedPluginRequest, officialTrustedHosts } from '../trust.js'
import {
  alignChildArchives, archiveSessionSubtree, readArchivedIds, unarchiveSession, workspaceIndexFor,
} from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import { assertSessionLocationApi } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { ArchiveError, bodyObject, readJsonBody, sendError, sendJson } from './http.js'
import { readStrayBlankness } from './projection.js'
import {
  assertHeaderFormatSupported, deleteSessionTree, ensureSessionNotLive, listSubagentTargets, moveSessionToTrash,
  sessionDirectoryFor,
} from './session-files.js'
import type { StartupScans } from './startup.js'
import {
  deleteAllTrashItems, deleteTrashEntry, listTrashPayload, resolveTrashDir, restoreAllTrashItems, restoreTrashDir,
  trashDirPayload,
} from './trash.js'
import { readTitle } from './titles.js'
import { archiveTreePayload, strayItemsPayload } from './views.js'

/** 一次请求可用的 host 装配件。 */
export interface ArchiveRouteContext {
  readonly ctx: Context
  readonly settings: ArchiveConfig
  readonly surface: RegistryMutationSurface
  readonly headerFacts: HeaderFactsStore<HeaderFacts>
  readonly startup: StartupScans
}

type RouteHandler = (route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse) => Promise<void>

/** 请求体里的 id 字段：非空字符串，否则 400。保留原值（是否 trim 由各路由自己决定）。 */
function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ArchiveError('BAD_BODY', message)
  return value
}

/** 组装前缀 handler：栅栏 → 精确匹配 → 处理；所有异常按 {@link sendError} 收口。 */
export function createArchiveRequestHandler(route: ArchiveRouteContext): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    try {
      // 信任栅栏（先于一切路由，含只读路由）：本插件的 `/api/archive-manage` 前缀比
      // 官方 `/api` 长 ⇒ 官方那道栅栏与鉴权都不会执行（见 trust.ts）。
      // 本插件含移动 / 删除会话文件的不可逆路由，故整条前缀一律先过门。
      // 额外信任面直接复用官方 webStartup.trustedHosts（rc.2 起；旧宿主回退 webRuntime），LAN 部署与官方同一份口径。
      if (!isTrustedPluginRequest(req.headers, officialTrustedHosts(route.ctx))) {
        sendError(route.ctx, res, new ArchiveError('FORBIDDEN', '拒绝非本机同源的请求', 403))
        return
      }
      const match = ROUTE_TABLE.find(entry => entry.method === req.method && entry.path === pathname)
      if (match === undefined) {
        sendJson(res, 404, { error: { code: 'BAD_BODY', message: `未知的 archive-manage 路由：${pathname}` } })
        return
      }
      // 请求体读取只发生在 handler 内：栅栏必须先于任何 body 读取（见 trust.test 的接线守卫）。
      await match.handle(route, req, res)
    } catch (error) {
      sendError(route.ctx, res, error)
    }
  }
}

async function listRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  // /list 是「用户打开面板」的信号：先补跑启动三项扫描，再做惰性父子对齐，保证首屏是清扫后的结果。
  route.startup.run()
  await alignChildArchives(route.ctx, route.surface, route.headerFacts)
  const body = await archiveTreePayload(route.ctx, route.headerFacts)
  sendJson(res, 200, body satisfies ListResponse)
}

async function straysRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await strayItemsPayload(route.ctx, route.headerFacts)
  sendJson(res, 200, body satisfies StraysResponse)
}

async function trashListRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await listTrashPayload(route.settings.trashRoot)
  sendJson(res, 200, body satisfies TrashListResponse)
}

async function trashDirRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, trashDirPayload(route.settings.trashRoot) satisfies TrashDirResponse)
}

async function unarchiveRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  // 取消归档：只动归档集、不碰文件——live 会话（被 dsh hold）同样可取消归档；幂等。
  const parsed = bodyObject<UnarchiveRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const sessionId = SessionId(requireNonEmptyString(parsed.sessionId, 'sessionId 必须是非空字符串'))
  const body = await unarchiveSession(route.ctx, route.surface, route.headerFacts, sessionId)
  sendJson(res, 200, body satisfies UnarchiveResponse)
}

async function archiveRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  // 归档以父为单位——父 + 全部有父的子会话一并进归档集（单写链原子）。
  // 只服务游离/孤儿子会话（官方菜单覆盖不到）；官方归档的父由 domain/changed 对齐补子。
  const parsed = bodyObject<ArchiveRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const rootId = requireNonEmptyString(parsed.sessionId, 'sessionId 必须是非空字符串').trim()
  const body = await archiveSessionSubtree(route.surface, route.headerFacts, rootId)
  sendJson(res, 200, body satisfies ArchiveResponse)
}

async function sessionTrashOrDeleteRoute(
  route: ArchiveRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  isDelete: boolean,
): Promise<void> {
  const { ctx, surface, headerFacts } = route
  const parsed = bodyObject<TrashRequest & DeleteRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const sessionId = SessionId(requireNonEmptyString(parsed.sessionId, 'sessionId 必须是非空字符串'))
  const archivedIds = await readArchivedIds(ctx)
  const headers = (await headerFacts.get()).headers
  const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
  const strayIds = straySessionIds(headers.map(header => String(header.id)), archivedIds.map(id => String(id)), attachedIds)
  const isArchived = archivedIds.some(id => String(id) === String(sessionId))
  const isStray = strayIds.includes(String(sessionId))
  if (!isArchived && !isStray) {
    throw new ArchiveError('NOT_ARCHIVED', '只有已归档或游离会话才能移入回收站或删除')
  }
  const live = ctx.sessions.get(sessionId)
  const header = live?.header ?? headers.find(candidate => String(candidate.id) === String(sessionId))
  if (header === undefined) {
    throw new ArchiveError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
  }
  // 宿主真值格式门（请求期，先于任何文件操作）。
  assertHeaderFormatSupported(header)
  const title = await readTitle(ctx, header, header.id)
  const strayBlank = isStray && readStrayBlankness(ctx, String(sessionId))
  if (isDelete) {
    if (strayBlank) {
      if (parsed.confirm !== true) {
        throw new ArchiveError('CONFIRMATION_FAILED', '删除空白游离会话需要确认')
      }
    } else if (!isDeleteConfirmationSufficient(title, parsed.confirmTitle)) {
      throw new ArchiveError('CONFIRMATION_FAILED', '删除确认失败：请输入完整会话标题')
    }
  } else if (parsed.confirm !== true) {
    throw new ArchiveError('CONFIRMATION_FAILED', '移入回收站需要二次确认')
  }

  const workspaces = workspaceIndexFor(ctx.workspaceRegistry.list()).get(String(sessionId)) ?? []
  ensureSessionNotLive(ctx, sessionId)
  const location = assertSessionLocationApi(ctx.sessionPersistence).locate(header)
  const sessionDir = location === undefined ? undefined : sessionDirectoryFor(location)
  if (sessionDir === undefined) {
    throw new ArchiveError('BACKEND_UNSUPPORTED', '当前会话持久化后端不提供已知的单会话目录，无法移入回收站/删除', 501)
  }

  const subagents = await listSubagentTargets(ctx, sessionId, headerFacts)
  if (isDelete) {
    const body = await deleteSessionTree(ctx, surface, { sessionId, sessionDir, subagents, workspaceIds: workspaces })
    sendJson(res, 200, body satisfies DeleteMutationResponse)
    return
  }
  const body = await moveSessionToTrash(ctx, surface, route.settings.trashRoot, {
    sessionId, sessionDir, title, subagents, workspaceIds: workspaces,
  })
  sendJson(res, 200, body satisfies TrashMutationResponse)
}

async function trashDeleteRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<TrashDeleteRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const trashId = requireNonEmptyString(parsed.trashId, 'trashId 必须是非空字符串')
  if (parsed.confirm !== true) {
    throw new ArchiveError('CONFIRMATION_FAILED', '彻底删除回收站条目需要二次确认')
  }
  const body = await deleteTrashEntry(route.settings.trashRoot, trashId)
  sendJson(res, 200, body satisfies TrashDeleteResponse)
}

async function restoreRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<RestoreRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const trashId = requireNonEmptyString(parsed.trashId, 'trashId 必须是非空字符串')
  const trashDir = resolveTrashDir(route.settings.trashRoot, trashId)
  const sidecar = await restoreTrashDir(route.ctx, route.surface, trashDir)
  // 还原把会话目录移回持久化：立即失效 header 缓存（restore 不发 added 事件，写穿靠这里）。
  route.headerFacts.invalidate()
  sendJson(res, 200, { ok: true, sessionId: sidecar.sessionId, workspaceIds: sidecar.workspaceIds } satisfies RestoreResponse)
}

async function restoreAllRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<TrashRestoreAllRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  if (parsed.confirm !== true) {
    throw new ArchiveError('CONFIRMATION_FAILED', '还原全部回收站条目需要二次确认')
  }
  const body = await restoreAllTrashItems(route.ctx, route.surface, route.settings.trashRoot)
  route.headerFacts.invalidate()
  sendJson(res, 200, body satisfies TrashRestoreAllResponse)
}

async function deleteAllRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<TrashDeleteAllRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  if (parsed.confirm !== true) {
    throw new ArchiveError('CONFIRMATION_FAILED', '彻底删除全部回收站条目需要二次确认')
  }
  const body = await deleteAllTrashItems(route.settings.trashRoot)
  sendJson(res, 200, body satisfies TrashDeleteAllResponse)
}

/** 路由表：method + 精确路径 → 处理器（`/trash` 同时承载 GET 列表与 POST 移入）。 */
const ROUTE_TABLE: readonly { readonly method: string; readonly path: string; readonly handle: RouteHandler }[] = [
  { method: 'GET', path: ROUTES.list, handle: listRoute },
  { method: 'GET', path: ROUTES.strays, handle: straysRoute },
  { method: 'GET', path: ROUTES.trash, handle: trashListRoute },
  { method: 'GET', path: ROUTES.trashDir, handle: trashDirRoute },
  { method: 'POST', path: ROUTES.unarchive, handle: unarchiveRoute },
  { method: 'POST', path: ROUTES.archive, handle: archiveRoute },
  { method: 'POST', path: ROUTES.trash, handle: (route, req, res) => sessionTrashOrDeleteRoute(route, req, res, false) },
  { method: 'POST', path: ROUTES.delete, handle: (route, req, res) => sessionTrashOrDeleteRoute(route, req, res, true) },
  { method: 'POST', path: ROUTES.trashDelete, handle: trashDeleteRoute },
  { method: 'POST', path: ROUTES.restore, handle: restoreRoute },
  { method: 'POST', path: ROUTES.trashRestoreAll, handle: restoreAllRoute },
  { method: 'POST', path: ROUTES.trashDeleteAll, handle: deleteAllRoute },
]

