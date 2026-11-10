/**
 * Official "main panel" entry assembly (mirrors official `ui-plugin-manager` / `ui-schedule` / this repo's dsh-archive-manage):
 * the `main` keyed slot and the `sidebar.panellist` list slot **share one id**; this module has zero runtime dependencies,
 * so node:test can import it directly. `layout` is not written into inject (a missing service would leave the fiber pending
 * forever and trigger a fatal boot-audit failure); it goes through the optional-dependency fork `ctx.inject(['layout'], cb)`
 * instead: when the service is absent nothing happens and nothing ever throws.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, LocaleNamespaceMap, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

/** One main-panel entry: the pieces for each registration plus the shared identity. */
interface MainPanelEntry<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
> {
  /** Entry id — both the `sidebar.panellist` id and the `main` key (the official name is `MainPanelId`). */
  readonly id: MainPanelId
  /** Sidebar row order (official plugins = 0, schedules = 10). */
  readonly order: number
  readonly locale: N
  /** Sidebar row title: pass a thunk so switching language needs no re-registration. */
  readonly label: () => string
  readonly inject: () => I
  readonly page: SlotComponent<PropsRuntime<'main'> & InjectFace<I> & PropsLocale<N>>
  /** Icon component for the sidebar main-panel row (the host passes `size`; color comes from currentColor). */
  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
}

/** Assemble the main-panel entry: attach both registrations once the official layout service is available; when it is missing, register nothing and never throw (lazy disable). */
export function attachMainPanel<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
>(ctx: ClientContext, entry: MainPanelEntry<N, I>): void {
  ctx.inject(['layout'], (layoutCtx) => {
    layoutCtx.slots.inject('main', () => layoutCtx.slots.register({
      name: 'main',
      key: entry.id,
      locale: entry.locale,
      inject: entry.inject,
    }, entry.page))
    layoutCtx.slots.inject('sidebar.panellist', () => layoutCtx.slots.register({
      name: 'sidebar.panellist',
      id: entry.id,
      order: entry.order,
      locale: entry.locale,
      label: entry.label,
    }, entry.icon))
  })
}
