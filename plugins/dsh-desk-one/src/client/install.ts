/**
 * Client-half installation: capability gate → styles (cleaned up by effect) → locale dictionaries → the two
 * official main-panel registrations. Page / icon / dictionaries / data surface are injected by index.ts, and
 * this module imports no React component — so node:test can drive the installation flow directly (including
 * the capability gate and removal of the style element) without loading browser-side UI deps in Node.
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
import type { SessionLinkApi } from './sessions/contract.js'
import type { SessionsArchiveApi } from './sessions/archiveApi.js'
import type { ScheduleApi } from './schedule/api.js'
import { attachMainPanel } from './panel.js'
import { ensureDeskStyles } from './styles.js'

/** Panel injection surface: data actions come from host REST routes, and the page holds only these functions. */
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
  readonly archiveGroup: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly archived: boolean
  }) => Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }>
  readonly deleteGroup: (id: string) => Promise<void>
  /** Session linkage facade (disabled when the host does not expose the optional services). */
  readonly sessionLink: SessionLinkApi
  /** Session archive management (host routes; archive / trash / restore / delete). */
  readonly sessionsArchive: SessionsArchiveApi
  /** Schedule (mirror + connection) facade backed by host REST routes. */
  readonly schedule: ScheduleApi
}

/** Browser-side pieces injected at the entry (supplied by index.ts; tests may pass stubs). */
export interface DeskClientDeps {
  readonly page: SlotComponent<
    PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>
  >
  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
  readonly locales: Record<'zh' | 'en', LocaleDictOf<typeof LOCALE_NAMESPACE>>
  readonly api: DeskPanelInjected
}

/** Client capability gate: any missing hard dependency warns and returns false (never throws, avoiding a fatal boot-audit failure). */
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
 * Install the client half: any missing hard dependency only warns and returns, **never throws** (the client
 * boot audit treats a non-active entry as a fatal failure, and a throw would leave the whole host page
 * showing only "Failed to load plugins").
 */
export function installDeskClient(ctx: ClientContext, deps: DeskClientDeps): void {
  if (!passesClientGate(ctx)) return

  const style = ensureDeskStyles()
  ctx.effect(() => () => { style.remove() }, `${PACKAGE_NAME}: styles`)

  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, deps.locales)
  ctx.effect(() => disposeDictionaries, `${PACKAGE_NAME}: locale dictionaries`)

  // The two official main-panel registrations (`main` page + `sidebar.panellist` icon row) go through an optional-dependency fork:
  // when the official layout service is absent, neither is registered (lazy disable, no throw) and the host still boots.
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
