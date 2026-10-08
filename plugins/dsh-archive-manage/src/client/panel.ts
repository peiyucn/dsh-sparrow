/**
 * 官方「主面板」入口装配（spec 16，对齐 `ui-plugin-manager` / `ui-schedule`）：`main` keyed 槽与
 * `sidebar.panellist` list 槽**共用同一个 id**；本模块零运行时依赖，故 `node:test` 可直接导入。
 * `layout` 不写进 `inject`（缺服务会让 fiber 永远 pending、触发 boot 审计的致命失败），改走
 * `ctx.inject(['layout'], cb)` 的可选依赖 fork：服务不在位就什么都不做，绝不抛错（fork 是子 fiber，
 * 不进审计的 entry 列表）。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, LocaleNamespaceMap, PropsLocale, PropsRuntime, SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：拉入 `sidebar.panellist` 的槽位声明（ui-sidebar）与 `ctx.slots` 服务合并（ui-renderer）。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

/** 一条主面板入口：两处注册各自的件与共用身份。 */
export interface MainPanelEntry<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
> {
  /** 入口 id —— 同时是 `sidebar.panellist` 的 id 与 `main` 的 key（官方称 `MainPanelId`）。 */
  readonly id: MainPanelId
  /** 左栏行序（官方 plugins = 0、schedules = 10）。 */
  readonly order: number
  readonly locale: N
  /** 左栏行标题：传 thunk 让语言切换无需重注册（官方 `() => t('panel')` 同款）。 */
  readonly label: () => string
  readonly inject: () => I
  readonly page: SlotComponent<PropsRuntime<'main'> & InjectFace<I> & PropsLocale<N>>
  /** 左栏主面板行的图标组件（宿主给 `size` / `active`，颜色走 currentColor）。 */
  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
}

/** 装配主面板入口：官方布局服务就位后同时挂上两处注册；缺失时不注册、不抛错（惰性停用）。 */
export function attachMainPanel<
  N extends keyof LocaleNamespaceMap & string,
  I extends object,
>(ctx: ClientContext, entry: MainPanelEntry<N, I>): void {
  ctx.inject(['layout'], (layoutCtx) => {
    // 注册记在 fork 的 fiber 上：entry 卸载（或 layout 服务消失）时两处注册随之回收。
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
