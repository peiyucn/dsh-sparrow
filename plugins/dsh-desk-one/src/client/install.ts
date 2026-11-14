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

/** Panel injection surface: data actions come from host REST routes, and the page holds only these functions. */
export interface DeskPanelInjected {
  /** Tab this left-rail entry opens (pinned tab entries only); absent = last visited tab. */
  readonly initialTab?: Tab
  /** Pin / unpin this tab's optional left-rail entry (dynamic, persisted). */
  readonly pin: DeskPinApi
  /** Notebook library data surface. */
  readonly notebook: NotebookApi
  /** DSH workspace flow behind the library action. */
  readonly workspaceAccess: WorkspaceAccess
  /** Start a review in a new session of the library workspace and open the review tab. */
  readonly openReview: (input: import('./notebook/review-bridge.js').ReviewOpenInput) => Promise<ReviewOpenResult>
  /** Start a session in the library workspace and open the official file browser. */
  readonly openBrowser: (workspaceId: string) => Promise<import('./notebook/review-bridge.js').ReviewOpenResult>
  /** Start a new session with a prefilled prompt (new-note drafting). */
  readonly draftWithAi: (workspaceId: string, prompt: string) => void
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
interface DeskClientDeps {
  readonly page: SlotComponent<
    PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>
  >
  /** Base "Desk One" left-rail icon. */
  readonly baseIcon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
  /** Left-rail icon per tab (used by optional pinned entries). */
  readonly icons: Readonly<Record<Tab, SlotComponent<PropsRuntime<'sidebar.panellist'>>>>
  readonly locales: Record<'zh' | 'en', LocaleDictOf<typeof LOCALE_NAMESPACE>>
  readonly api: Omit<DeskPanelInjected, 'pin'>
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

  // Click capture for pinned left-rail entries: clicking a row (glyph or label) must also return
  // its panel to the tab that entry owns. The official row has no click hook and re-selecting the
  // already active panel produces no store notification, so the reset signal travels out-of-band
  // (app/panelReset.ts). Capture phase so the panel state is reset before the official row handler
  // re-selects the same panel; guarded because node:test runs this installer with a minimal document.
  const isDeskTab = (value: string | null): value is Tab => DESK_TABS.some(entry => entry.tab === value)
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    const onPanelClick = (event: MouseEvent): void => {
      const target = event.target
      // `Element` is absent in node test runs; the guard keeps the capture listener inert there.
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
        // Unpinning the row we are standing on: move to the base entry before removing it.
        if (layout?.panelInfo.getSnapshot().activePanelId === panelId) layout.selectPanel(PANEL_ID as MainPanelId)
        mounted.get(tab)?.()
        mounted.delete(tab)
        pinned.delete(tab)
      }
      writePinnedTabs([...pinned])
    },
  }
  // Base entry: always present, opens the last visited tab.
  mountMainPanel(ctx, {
    id: PANEL_ID as MainPanelId,
    order: PANEL_ORDER,
    locale: LOCALE_NAMESPACE,
    label: () => ctx.locale.bind(LOCALE_NAMESPACE)('button.label'),
    inject: () => ({ ...deps.api, pin: pinApi }),
    page: deps.page,
    icon: deps.baseIcon,
  }, captureLayout)
  // Restore the user's pinned tab entries (dynamic: pin/unpin registers/removes them while running).
  for (const tab of pinned) mountTab(tab)
}