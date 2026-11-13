/**
 * Official "main panel" entry assembly (mirrors official `ui-plugin-manager` / `ui-schedule` / this repo's other plugins):
 * the `main` keyed slot and the `sidebar.panellist` list slot **share one id**; this module has zero runtime dependencies,
 * so node:test can import it directly. `layout` is not written into inject (a missing service would leave the fiber pending
 * forever and trigger a fatal boot-audit failure); it goes through the optional-dependency fork `ctx.inject(['layout'], cb)`
 * instead: when the service is absent nothing happens and nothing ever throws.
 *
 * `mountMainPanel` returns a disposer because tab entries are pinned/unpinned at runtime; the base entry simply keeps
 * its disposer for the plugin lifetime.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, LocaleNamespaceMap, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

/** The layout actions this module needs once the official service is available. */
export interface LayoutFace {
  selectPanel(panelId: MainPanelId | null): void
  readonly panelInfo: { getSnapshot(): { readonly activePanelId: MainPanelId | null } }
}

/** One main-panel entry: the pieces for each registration plus the shared identity. */
export interface MainPanelEntry<
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

/**
 * Register one main-panel entry when the official layout service is available.
 * @param ctx - client plugin context.
 * @param entry - ids, labels, icon, and the page component.
 * @param onLayout - called with the live layout actions (used to select the base panel before unpinning).
 * @returns a disposer that removes both registrations (no-op when layout is absent).
 */
export function mountMainPanel<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
>(ctx: ClientContext, entry: MainPanelEntry<N, I>, onLayout?: (layout: LayoutFace) => void): () => void {
  let disposeInner: (() => void) | undefined
  ctx.inject(['layout'], (layoutCtx) => {
      const slots = layoutCtx.slots
    // Register through slots.inject: the sidebar declares 'sidebar.panellist' from its own entry,
    // which may load after ours. A direct register() races that declaration and is rejected on some
    // cold loads (the reason the entry randomly vanished after a refresh).
    const disposers = [
      slots.inject('main', () => slots.register({ name: 'main', key: entry.id, locale: entry.locale, inject: entry.inject }, entry.page)),
      slots.inject('sidebar.panellist', () => slots.register({
        name: 'sidebar.panellist',
        id: entry.id,
        order: entry.order,
        locale: entry.locale,
        label: entry.label,
      }, entry.icon)),
    ]
    disposeInner = () => {
      for (const dispose of disposers) dispose()
    }
    onLayout?.(layoutCtx.get('layout') as LayoutFace)
    layoutCtx.effect(() => () => {
      disposeInner?.()
      disposeInner = undefined
    }, `dsh-desk-one: main panel ${entry.id}`)
  })
  return () => {
    disposeInner?.()
    disposeInner = undefined
  }
}
