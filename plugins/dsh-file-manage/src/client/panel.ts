/**
 * 官方「主面板」入口装配（spec 03，形态对齐 `ui-plugin-manager` / `ui-schedule`）：
 * `main` keyed 槽（页面渲染在中央列）与 `sidebar.panellist` list 槽（左栏上面的图标行）
 * **共用同一个 id**。
 *
 * ## 为什么单独一个模块
 *
 * 本模块**零运行时依赖**（下面全是类型导入，编译后 `lib/client/panel.js` 不 import 任何东西），
 * 因此 `node:test` 能直接导入它 —— 「官方布局服务缺失 ⇒ 整条不注册」的**惰性停用接线用例**
 * 就建在这个文件上（本插件没有 client 侧 DOM 测试环境，接线只能在纯模块层验）。
 *
 * ## ⚠️ `layout` 为什么不写进 `inject`
 *
 * client half 的 `inject` 里缺服务时 fiber 会**永远 pending**，而 DSH Web 的客户端 boot 审计
 * 把任何非 active 的 entry 当**致命**失败（`packages/client/web/src/boot-client.ts:63-82`，
 * 宿主整页只渲染 "Failed to load plugins"）。故 `layout` 走
 * `ctx.inject(['layout'], cb)` 起的**可选依赖 fork**：服务在位才装这两处注册，
 * 这条宿主线没有该服务就什么都不做（惰性停用），**绝不抛错**。
 *
 * fork 是本 entry 的**子 fiber**，不进 boot 审计的 entry 列表，故它挂着不会拖垮宿主启动。
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
  /** 左栏行序（官方 plugins = 0、schedules = 10；本插件沿用原 footer 的号段）。 */
  readonly order: number
  /** 本入口的 locale 命名空间（左栏行标题与页面文案共用）。 */
  readonly locale: N
  /** 左栏行标题：传 thunk 让语言切换无需重注册（官方 `() => t('panel')` 同款）。 */
  readonly label: () => string
  /** 页面组件的注入面（业务动作，注册时构造）。 */
  readonly inject: () => I
  /** 中央列的页面组件。 */
  readonly page: SlotComponent<PropsRuntime<'main'> & InjectFace<I> & PropsLocale<N>>
  /** 左栏主面板行的图标组件（宿主给 `size` / `active`，颜色走 currentColor）。 */
  readonly icon: SlotComponent<PropsRuntime<'sidebar.panellist'>>
}

/**
 * 装配主面板入口：官方布局服务就位后，把 `main` 与 `sidebar.panellist` 两处注册同时挂上。
 *
 * 服务缺失时本函数**不注册任何东西、不抛错**：fork 一直挂着，本插件在这条宿主线
 * 等于不存在（惰性停用）。
 * @param ctx - client half 的根上下文。
 * @param entry - 入口件（id / order / locale / label / inject / page / icon）。
 */
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
