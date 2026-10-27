/**
 * client half 安装：能力门 → 样式（effect 清理）→ locale 字典 → remote 桥 → 官方主面板两处注册。
 *
 * 页面 / 图标 / 字典由 `index.ts` 注入，本模块不 import React 组件 —— `node:test` 因此可以直接
 * 驱动安装流程（含能力门与 style 元素的移除），而无需在 Node 里加载浏览器侧 UI 依赖。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 类型专用：拉入 ui-renderer 的 SlotRegistry 服务合并（ctx.slots），以及 remote 服务声明。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { InjectFace, LocaleDictOf, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { hasCapability, warnMissingCapabilities } from './compat.js'
import {
  LOCALE_NAMESPACE, PACKAGE_NAME, PANEL_ID, PANEL_ORDER, REQUEST_TIMEOUT_MS, ROUTES, SESSIONS_CHANGED_EVENT,
} from '../constants.js'
import type {
  ArchiveResponse, ArchiveTreeNode, DeleteMutationResponse, DeleteRequest, RestoreRequest, RestoreResponse,
  StraySessionItem, TrashDeleteAllRequest, TrashDeleteAllResponse, TrashDeleteRequest, TrashDeleteResponse,
  TrashDirResponse, TrashEntry, TrashMutationResponse, TrashRequest, TrashRestoreAllRequest, TrashRestoreAllResponse,
  UnarchiveRequest, UnarchiveResponse,
} from '../contract.js'
import type { ArchivePanelInjected } from './ArchivePage.js'
import { attachMainPanel } from './panel.js'
import { ensureArchiveStyles } from './styles.js'

/** 入口注入的浏览器侧件（由 index.ts 提供；测试可传桩）。 */
export interface ArchiveClientDeps {
  readonly page: SlotComponent<
    PropsRuntime<'main'> & InjectFace<ArchivePanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>
  >
  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
  readonly locales: Record<'zh' | 'en', LocaleDictOf<typeof LOCALE_NAMESPACE>>
}

/**
 * client 能力门：任一硬依赖缺失即告警并返回 false。导出给入口在安装前先判一次；
 * `installArchiveClient` 内部也调用它，保证测试 / 其它调用方直接安装时同样惰性停用。
 */
export function passesClientGate(ctx: ClientContext): boolean {
  const c = ctx as unknown as Record<string, any>
  return warnMissingCapabilities(c, PACKAGE_NAME, [
    { name: 'ctx.slots.inject', ok: hasCapability(() => c.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => c.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => c.locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => c.locale?.bind) },
    { name: 'ctx.remote.$on', ok: hasCapability(() => c.remote?.$on) },
  ])
}

/**
 * 安装 client half：任何硬依赖缺失只告警并返回，**不抛错** —— 客户端 boot 审计把非 active 的
 * entry 当致命失败，抛错会让宿主整页只显示 "Failed to load plugins"。
 */
export function installArchiveClient(ctx: ClientContext, deps: ArchiveClientDeps): void {
  const c = ctx as unknown as Record<string, any>
  if (!passesClientGate(ctx)) return

  const style = ensureArchiveStyles()
  ctx.effect(() => () => { style.remove() }, `${PACKAGE_NAME}: styles`)

  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, deps.locales)
  ctx.effect(() => disposeDictionaries, `${PACKAGE_NAME}: locale dictionaries`)

  // 官方「会话离开 live store」（fiber 销毁，session-controller 转发的 api-session/removed）
  // → 广播窗口事件，页面在屏时据此实时刷新 hold 标记。
  const remote = c.remote as { $on(event: string, handler: () => void): () => void }
  const disposeRemoved = remote.$on('api-session/removed', () => {
    window.dispatchEvent(new CustomEvent(SESSIONS_CHANGED_EVENT))
  })
  ctx.effect(() => disposeRemoved, `${PACKAGE_NAME}: live 状态实时刷新`)

  // 官方主面板两处注册（`main` 页面 + `sidebar.panellist` 图标行）走可选依赖 fork：
  // 官方布局服务不在位时整条不注册（惰性停用、不抛错），宿主照常启动。
  attachMainPanel(ctx, {
    id: PANEL_ID as MainPanelId,
    order: PANEL_ORDER,
    locale: LOCALE_NAMESPACE,
    label: () => ctx.locale.bind(LOCALE_NAMESPACE)('button.label'),
    inject: (): ArchivePanelInjected => ({
      listArchived: () => readTree<ArchiveTreeNode>(ROUTES.list),
      listStrays: () => readItems<StraySessionItem>(ROUTES.strays),
      listTrashItems: () => readItems<TrashEntry>(ROUTES.trash),
      trashDirPath: () => readTrashDir(),
      moveToTrash: (sessionId: string) => postApi<TrashMutationResponse>(ROUTES.trash, {
        sessionId, confirm: true,
      } satisfies TrashRequest),
      unarchiveSession: (sessionId: string) => postApi<UnarchiveResponse>(ROUTES.unarchive, {
        sessionId,
      } satisfies UnarchiveRequest),
      archiveSession: (sessionId: string) => postApi<ArchiveResponse>(ROUTES.archive, { sessionId }),
      deleteSession: (sessionId: string, confirmTitle: string, simple: boolean) => postApi<DeleteMutationResponse>(
        ROUTES.delete,
        (simple ? { sessionId, confirm: true } : { sessionId, confirmTitle }) satisfies DeleteRequest,
      ),
      restoreTrashItem: (trashId: string) => postApi<RestoreResponse>(ROUTES.restore, {
        trashId,
      } satisfies RestoreRequest),
      deleteTrashItem: (trashId: string) => postApi<TrashDeleteResponse>(ROUTES.trashDelete, {
        trashId, confirm: true,
      } satisfies TrashDeleteRequest),
      restoreAllTrash: () => postApi<TrashRestoreAllResponse>(ROUTES.trashRestoreAll, {
        confirm: true,
      } satisfies TrashRestoreAllRequest),
      deleteAllTrash: () => postApi<TrashDeleteAllResponse>(ROUTES.trashDeleteAll, {
        confirm: true,
      } satisfies TrashDeleteAllRequest),
    }),
    page: deps.page,
    icon: deps.icon,
  })
}

/** 列表 / 树读取：响应体缺字段时退化为空列表，不让面板因半截响应崩掉。 */
async function readItems<T>(path: string): Promise<T[]> {
  const payload = await fetchJson<{ items?: T[] }>(path)
  return payload.items ?? []
}

async function readTree<T>(path: string): Promise<T[]> {
  const payload = await fetchJson<{ tree?: T[] }>(path)
  return payload.tree ?? []
}

async function readTrashDir(): Promise<TrashDirResponse> {
  const payload = await fetchJson<Partial<TrashDirResponse>>(ROUTES.trashDir)
  return { path: payload.path ?? '', displayPath: payload.displayPath ?? payload.path ?? '' }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
