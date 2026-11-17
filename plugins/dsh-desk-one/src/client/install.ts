

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { InjectFace, LocaleDictOf, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { hasCapability, warnMissingCapabilities } from './compat.js'
import { LOCALE_NAMESPACE, PACKAGE_NAME, PANEL_ID, PANEL_IDS, PANEL_ORDER } from '../constants.js'
import { DESK_TABS } from './app/tabs.js'
import type { Tab } from './app/types.js'
import type {
  DeskNote, DeskTask, DeskTaskGroup, CreateTaskRequest, TaskGroupPatchRequest, TaskPatchRequest,
} from '../contract.js'
import type { SessionLinkApi } from './sessions/contract.js'
import type { SessionsArchiveApi } from './sessions/archiveApi.js'
import type { ScheduleApi } from './schedule/api.js'
import type { NotebookApi } from './notebook/api.js'
import type { ReviewOpenResult } from './notebook/review-bridge.js'
import type { WorkspaceAccess } from './notebook/workspaces.js'
import { mountMainPanel, type LayoutFace } from './panel.js'
import { readPinnedTabs, writePinnedTabs, type DeskPinApi } from './pin.js'
import { PANEL_TAB_ATTRIBUTE, requestPanelReset } from './app/panelReset.js'
import { ensureDeskStyles } from './styles.js'


export interface DeskPanelInjected {

  readonly initialTab?: Tab

  readonly pin: DeskPinApi

  readonly notebook: NotebookApi

  readonly workspaceAccess: WorkspaceAccess

  readonly openReview: (input: import('./notebook/review-bridge.js').ReviewOpenInput) => Promise<ReviewOpenResult>

  readonly openBrowser: (workspaceId: string) => Promise<import('./notebook/review-bridge.js').ReviewOpenResult>

  readonly startWithPrompt: (prompt: string) => void
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

  readonly sessionLink: SessionLinkApi

  readonly sessionsArchive: SessionsArchiveApi

  readonly schedule: ScheduleApi
}


interface DeskClientDeps {
  readonly page: SlotComponent<
    PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>
  >

  readonly baseIcon: SlotComponent<PropsRuntime<'sidebar.panellist'>>

  readonly icons: Readonly<Record<Tab, SlotComponent<PropsRuntime<'sidebar.panellist'>>>>
  readonly locales: Record<'zh' | 'en', LocaleDictOf<typeof LOCALE_NAMESPACE>>
  readonly api: Omit<DeskPanelInjected, 'pin'>
}


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


export function installDeskClient(ctx: ClientContext, deps: DeskClientDeps): void {
  if (!passesClientGate(ctx)) return

  const style = ensureDeskStyles()
  ctx.effect(() => () => { style.remove() }, `${PACKAGE_NAME}: styles`)






  const isDeskTab = (value: string | null): value is Tab => DESK_TABS.some(entry => entry.tab === value)
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    const onPanelClick = (event: MouseEvent): void => {
      const target = event.target

      if (typeof Element === 'undefined' || !(target instanceof Element)) return
      const row = target.closest('button')
      if (row === null) return
      const marker = row.querySelector(`[${PANEL_TAB_ATTRIBUTE}]`)
      const tab = marker?.getAttribute(PANEL_TAB_ATTRIBUTE) ?? null
      if (isDeskTab(tab)) requestPanelReset(tab)
    }
    document.addEventListener('click', onPanelClick, true)
    ctx.effect(() => () => { document.removeEventListener('click', onPanelClick, true) }, `${PACKAGE_NAME}: panel entry capture`)
  }

  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, deps.locales)
  ctx.effect(() => disposeDictionaries, `${PACKAGE_NAME}: locale dictionaries`)

  const pinned = new Set<Tab>(readPinnedTabs())
  const mounted = new Map<Tab, () => void>()
  let layout: LayoutFace | undefined
  const captureLayout = (next: LayoutFace): void => { layout = next }
  const labelFor = (tab: Tab): string => {
    const entry = DESK_TABS.find(candidate => candidate.tab === tab)
    return entry === undefined ? tab : ctx.locale.bind(LOCALE_NAMESPACE)(entry.labelKey)
  }
  const mountTab = (tab: Tab): void => {
    if (mounted.has(tab)) return
    const index = DESK_TABS.findIndex(entry => entry.tab === tab)
    mounted.set(tab, mountMainPanel(ctx, {
      id: PANEL_IDS[tab] as MainPanelId,
      order: PANEL_ORDER + 1 + index,
      locale: LOCALE_NAMESPACE,
      label: () => labelFor(tab),
      inject: () => ({ ...deps.api, initialTab: tab, pin: pinApi }),
      page: deps.page,
      icon: deps.icons[tab],
    }, captureLayout))
  }
  const pinApi: DeskPinApi = {
    isPinned: tab => pinned.has(tab),
    setPinned: (tab, next) => {
      if (next === pinned.has(tab)) return
      if (next) {
        pinned.add(tab)
        mountTab(tab)
      } else {
        const panelId = PANEL_IDS[tab] as MainPanelId

        if (layout?.panelInfo.getSnapshot().activePanelId === panelId) layout.selectPanel(PANEL_ID as MainPanelId)
        mounted.get(tab)?.()
        mounted.delete(tab)
        pinned.delete(tab)
      }
      writePinnedTabs([...pinned])
    },
  }

  mountMainPanel(ctx, {
    id: PANEL_ID as MainPanelId,
    order: PANEL_ORDER,
    locale: LOCALE_NAMESPACE,
    label: () => ctx.locale.bind(LOCALE_NAMESPACE)('button.label'),
    inject: () => ({ ...deps.api, pin: pinApi }),
    page: deps.page,
    icon: deps.baseIcon,
  }, captureLayout)

  for (const tab of pinned) mountTab(tab)
}
