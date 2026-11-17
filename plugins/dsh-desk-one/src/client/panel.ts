

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, LocaleNamespaceMap, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'


export interface LayoutFace {
  selectPanel(panelId: MainPanelId | null): void
  readonly panelInfo: { getSnapshot(): { readonly activePanelId: MainPanelId | null } }
}


export interface MainPanelEntry<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
> {

  readonly id: MainPanelId

  readonly order: number
  readonly locale: N

  readonly label: () => string
  readonly inject: () => I
  readonly page: SlotComponent<PropsRuntime<'main'> & InjectFace<I> & PropsLocale<N>>

  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
}


export function mountMainPanel<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
>(ctx: ClientContext, entry: MainPanelEntry<N, I>, onLayout?: (layout: LayoutFace) => void): () => void {
  let disposeInner: (() => void) | undefined
  ctx.inject(['layout'], (layoutCtx) => {
      const slots = layoutCtx.slots



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
