/**
 * dsh-file-manage client half：官方「主面板」入口（左栏上面的图标行 + 中央列的页面）。
 *
 * 两处槽位共用同一个 id（`main` keyed + `sidebar.panellist`）；`layout` 走可选依赖 fork，缺失即整条不注册。
 * 请求封装见 api.ts、样式见 styles.ts、视图见 CloudFilesPage.tsx；客户端不直接碰任何文件或凭据。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 官方 0.1.7 起 `Context.slots` 的声明在 ui-renderer（纯类型空导入，无运行时代码）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { hasCapability, warnMissingCapabilities } from '../compat.js'
import { LOCALE_NAMESPACE, PACKAGE_NAME, PANEL_ID, PANEL_ORDER } from '../constants.js'
import { countApi, deleteApi, listApi } from './api.js'
import { CloudFilesPanel } from './CloudFilesPage.js'
import { CloudFilesPanelIcon } from './CloudFilesPanelIcon.js'
import { LOCALE_DICTS } from './locales.js'
import { attachMainPanel } from './panel.js'
import { ensureFileManageStyles } from './styles.js'

// ⚠️ `layout` **不在这里** —— client half 的 inject 缺服务会让 entry 永远 pending，
// 而客户端 boot 审计把非 active 的 entry 当致命失败；它走 panel.ts 里的可选依赖 fork。
export const inject = ['slots', 'locale']

/**
 * client half 入口：先跑不抛错的能力门（缺失只告警并惰性停用），再装样式 / 文案 / 两处槽位。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const c = ctx as unknown as Record<string, any>
  if (!warnMissingCapabilities(c, PACKAGE_NAME, [
    { name: 'ctx.slots.inject', ok: hasCapability(() => c.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => c.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => c.locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => c.locale?.bind) },
  ])) return

  const style = ensureFileManageStyles()
  ctx.effect(() => () => { style.remove() }, `${PACKAGE_NAME}: styles`)
  const disposeDictionaries = ctx.locale.register(LOCALE_NAMESPACE, { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, `${PACKAGE_NAME}: locale dictionaries`)
  // 官方主面板两处注册（`main` 页面 + `sidebar.panellist` 图标行）走可选依赖 fork：
  // 官方布局服务不在位时整条不注册（惰性停用、不抛错），宿主照常启动。
  attachMainPanel(ctx, {
    id: PANEL_ID as MainPanelId,
    order: PANEL_ORDER,
    locale: LOCALE_NAMESPACE,
    label: () => ctx.locale.bind(LOCALE_NAMESPACE)('button.label'),
    inject: () => ({
      listFiles: listApi,
      deleteFile: deleteApi,
      countFiles: countApi,
    }),
    page: CloudFilesPanel,
    icon: CloudFilesPanelIcon,
  })
}
