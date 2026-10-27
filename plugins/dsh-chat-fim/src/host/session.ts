/** 会话面：按 id 取会话、请求期宿主真值门、会话实例能力探测、当前主模型解析。 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { EpochHeader, Session } from '@deepseek-ai/dsh-session'
import { unsupportedStoredFormatReason } from '../compat.js'
import { currentMainRoute, mainRouteFromHeader } from '../upstream.js'

/** 按 id 取本进程内存里的会话；宿主没有该会话返回 undefined（调用方回 404）。 */
export function findHostSession(ctx: Context, sessionId: SessionId): Session | undefined {
  return ctx.sessions.get(sessionId)
}

/** 宿主真值格式门（请求期）：header 由宿主给出，不受「插件解析到旧版官方包」影响
 *  （常量探针在 link:/peer 副本场景会读到旧值，故以宿主数据为准）。 */
export function hostFormatSupported(header: { readonly version?: unknown } | undefined): boolean {
  return header !== undefined && unsupportedStoredFormatReason([header]) === undefined
}

/**
 * 会话实例级能力探测（根 AGENTS 能力门）：`requestHeader` / `deriveMessages` 是 Session 实例方法，
 * 启动期拿不到实例，只能在请求入口按**宿主真实对象**探测——插件自带的官方包副本在这里不可信
 * （link:/peer 副本场景会自证兼容，见 compat.ts 的同类说明）。缺失即视为不支持的 dsh 版本：
 * GET 隐藏功能、POST 明确报错，不在未知契约上带病运行。
 */
export function sessionSurfaceSupported(session: unknown): boolean {
  const candidate = session as { requestHeader?: unknown; deriveMessages?: unknown } | null | undefined
  return typeof candidate?.requestHeader === 'function' && typeof candidate.deriveMessages === 'function'
}

/** 会话当前主模型：modelSelection 投影（选中即生效，不依赖历史事件）→ 官方折叠出的
 *  最近请求 header（`session.requestHeader()`，增量折叠）→ 共享默认模型；服务缺失（旧版 dsh）
 *  逐档 fail-soft。模型一换，开关状态立刻追平。 */
export function currentSessionModel(
  ctx: Context,
  session: { requestHeader(): EpochHeader | undefined },
): { provider: string; model: string } | undefined {
  let selection: { lastUsed?: { provider: string; model: string } | null; pending?: { provider: string; model: string } | null } | undefined
  try {
    const projections = ctx.get('sessionProjections') as unknown as {
      stateOf(session: unknown, key: string): { lastUsed?: { provider: string; model: string } | null; pending?: { provider: string; model: string } | null } | undefined
    } | undefined
    selection = projections?.stateOf(session, 'modelSelection')
  } catch {
    // 投影注册表缺失（旧版 dsh）：走事件档。
  }
  let defaultModel: { provider: string; model: string } | undefined
  try {
    const service = ctx.get('agentDefaultModel') as {
      currentSelection?: () => { provider: string; model: string } | undefined
    } | undefined
    const selected = service?.currentSelection?.()
    if (selected !== undefined && typeof selected.provider === 'string' && typeof selected.model === 'string') {
      defaultModel = { provider: selected.provider, model: selected.model }
    }
  } catch {
    // 缺服务：跳过默认档。
  }
  return currentMainRoute(selection, mainRouteFromHeader(session.requestHeader()), defaultModel)
}
