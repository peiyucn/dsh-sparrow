/**
 * client half 安装：能力门 → 样式（effect 清理）→ locale 字典 → 官方主面板两处注册。
 * 页面 / 图标 / 字典 / 数据面由 index.ts 注入，本模块不 import React 组件 —— node:test 因此可以
 * 直接驱动安装流程（含能力门与 style 元素的移除），无需在 Node 里加载浏览器侧 UI 依赖。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { InjectFace, LocaleDictOf, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { hasCapability, warnMissingCapabilities } from './compat.js'
import { LOCALE_NAMESPACE, PACKAGE_NAME, PANEL_ID, PANEL_ORDER } from '../constants.js'
import type {
  DeskNote, DeskTask, DeskTaskGroup, CreateTaskRequest, TaskGroupPatchRequest, TaskPatchRequest,
} from '../contract.js'
import { attachMainPanel } from './panel.js'
import { ensureDeskStyles } from './styles.js'

/** 面板的注入面：数据动作由 host REST 路由提供，页面只持有这几个函数。 */
export interface DeskPanelInjected {
  readonly listNotes: (query?: string) => Promise<readonly DeskNote[]>
  readonly createNote: (input: {
    readonly title?: string
    readonly body?: string
    readonly color?: string
    readonly x?: number
    readonly y?: number
    readonly z?: number
  }) => Promise<DeskNote>
  readonly updateNote: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly patch: {
      readonly title?: string
      readonly body?: string
      readonly color?: string
      readonly pinned?: boolean
      readonly trashed?: boolean
      readonly x?: number
      readonly y?: number
      readonly width?: number
      readonly height?: number
      readonly z?: number
    }
  }) => Promise<DeskNote>
  readonly deleteNote: (id: string) => Promise<void>
  readonly listTasks: () => Promise<readonly DeskTask[]>
  readonly createTask: (input: CreateTaskRequest) => Promise<DeskTask>
  readonly updateTask: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly patch: TaskPatchRequest
  }) => Promise<DeskTask>
  readonly deleteTask: (id: string) => Promise<void>
  readonly listGroups: () => Promise<readonly DeskTaskGroup[]>
  readonly createGroup: (input: { readonly name?: string; readonly status?: string; readonly order?: number }) => Promise<DeskTaskGroup>
  readonly updateGroup: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly patch: TaskGroupPatchRequest
  }) => Promise<DeskTaskGroup>
  readonly moveGroup: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly status: string
    readonly order?: number
  }) => Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }>
  readonly deleteGroup: (id: string) => Promise<void>
}

/** 入口注入的浏览器侧件（由 index.ts 提供；测试可传桩）。 */
export interface DeskClientDeps {
  readonly page: SlotComponent<
    PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>
  >
  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
  readonly locales: Record<'zh' | 'en', LocaleDictOf<typeof LOCALE_NAMESPACE>>
  readonly api: DeskPanelInjected
}

/** client 能力门：任一硬依赖缺失即告警并返回 false（不抛错，避免 boot 审计致命失败）。 */
export function passesClientGate(ctx: ClientContext): boolean {
  const c = ctx as unknown as Record<string, unknown>
  const slots = c.slots as { inject?: unknown; register?: unknown } | undefined
  const locale = c.locale as { register?: unknown; bind?: unknown } | undefined
  return warnMissingCapabilities(c, PACKAGE_NAME, [
    { name: 'ctx.slots.inject', ok: hasCapability(() => slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => locale?.bind) },
  ])
}

/**
 * 安装 client half：任何硬依赖缺失只告警并返回，**不抛错**（客户端 boot 审计把非 active 的
 * entry 当致命失败，抛错会让宿主整页只显示 "Failed to load plugins"）。
 */
export function installDeskClient(ctx: ClientContext, deps: DeskClientDeps): void {
  if (!passesClientGate(ctx)) return

  const style = ensureDeskStyles()
  ctx.effect(() => () => { style.remove() }, `${PACKAGE_NAME}: styles`)

  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, deps.locales)
  ctx.effect(() => disposeDictionaries, `${PACKAGE_NAME}: locale dictionaries`)

  // 官方主面板两处注册（`main` 页面 + `sidebar.panellist` 图标行）走可选依赖 fork：
  // 官方布局服务不在位时整条不注册（惰性停用、不抛错），宿主照常启动。
  attachMainPanel(ctx, {
    id: PANEL_ID as MainPanelId,
    order: PANEL_ORDER,
    locale: LOCALE_NAMESPACE,
    label: () => ctx.locale.bind(LOCALE_NAMESPACE)('button.label'),
    inject: () => deps.api,
    page: deps.page,
    icon: deps.icon,
  })
}
