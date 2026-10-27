/**
 * dsh-codebuddy-credits host half 组合根：能力门 → 装配（凭据 / 账号 / 模型事实 / provider / 积分账本）
 * → HTTP 路由。无 Key 时零请求零注册；实现分在 `host/` 子模块，协议层见 `adapter/`。
 * @module dsh-codebuddy-credits
 */

import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { assertCapabilities } from './compat.js'
import { Config } from './config.js'
import { SETTINGS_NAMESPACE } from './constants.js'
import { fetchQuota } from './quota.js'
import { hostSessionFormatVersion, unsupportedSessionFormatReason } from './session-format.js'
import { installCodeBuddyWeb } from './web.js'
import { createAccountStore } from './host/account.js'
import { createCredentials } from './host/credentials.js'
import { createCreditLedger } from './host/ledger.js'
import { createModelFacts } from './host/models.js'
import { installProvider } from './host/provider.js'

export const name = SETTINGS_NAMESPACE
/**
 * 硬依赖服务。`sessions` 是积分账本的数据源；漏在宿主侧声明会让 `ctx.sessions` 直接抛
 * 「cannot get property "sessions" without inject」（cordis 服务须经 inject 绑定到本插件 fiber）。
 */
export const inject = ['llm', 'attachments', 'sessions']

export { Config } from './config.js'
export type { CodeBuddyAccount } from './host/account.js'

export function apply(ctx: Context, config: Config): void {
  // 宿主兼容自检（先于一切注册）：宿主缺这些面即自停用，而不是带病注册半个 provider。
  // 探针只列**实际调用**的方法（registerConfigurableProviders / registerModelDiscovery 都是本插件的必需面）。
  assertCapabilities(ctx, name, [
    { name: 'llm.registerAdapter', ok: typeof (ctx.llm as { registerAdapter?: unknown } | undefined)?.registerAdapter === 'function' },
    { name: 'llm.registerConfigurableProviders', ok: typeof (ctx.llm as { registerConfigurableProviders?: unknown } | undefined)?.registerConfigurableProviders === 'function' },
    { name: 'llm.registerModelDiscovery', ok: typeof (ctx.llm as { registerModelDiscovery?: unknown } | undefined)?.registerModelDiscovery === 'function' },
    { name: 'sessions.get', ok: typeof (ctx.sessions as { get?: unknown } | undefined)?.get === 'function' },
  ])
  // 会话格式**软判定**：认错就是静默读出 0；但积分只是展示面，为此停掉整个 provider 是过度取舍，故只告警。
  const formatReason = unsupportedSessionFormatReason(hostSessionFormatVersion())
  if (formatReason !== undefined) {
    ctx.logger.warn(`${name}: ${formatReason}；积分可能显示为 0（推理不受影响）`)
  }

  const credentials = createCredentials(ctx, name, config)
  const account = createAccountStore({
    resolveApiKey: credentials.resolveApiKey,
    generation: credentials.generation,
  })
  const models = createModelFacts({
    ctx,
    name,
    resolveApiKey: credentials.resolveApiKey,
    generation: credentials.generation,
    account: account.current,
  })
  const provider = installProvider(ctx, config, {
    models,
    account,
    credentials,
    onCatalogRead: () => models.kick(),
  })
  // 晚绑定：models 需要 provider 的 route 控制面，provider 的 adapter 需要 models 的读面。
  models.bindRoutes(provider.routes)
  credentials.bind({ account, models, routes: provider.routes })
  const ledger = createCreditLedger(ctx)

  // 启动：环境变量可见立即注册；凭据库的 Key 在异步检查命中后迁移、补拉账号与模型目录并注册 route。
  provider.start()

  // 设置卡片路由：Key 的保存、配额查询、状态。整节型 provider 的 settingsPath 为空，官方页面本就
  // 不提供「移除」，凭据清理由本插件的「清空 Key」承担（见 /remove-key）。
  installCodeBuddyWeb(ctx, {
    keyConfigured: () => credentials.hasKey(),
    saveKey: key => credentials.save(key),
    reapply: () => credentials.reapply(),
    removeKey: () => credentials.remove(),
    async quota() {
      return fetchQuota(await credentials.resolveApiKey(), account.current())
    },
    sessionUsage: sessionId => ledger.sessionUsage(sessionId),
    turnUsage: (sessionId, turn) => ledger.turnUsage(sessionId, turn),
    account: () => account.view(),
    ensureAccount: () => account.ensure(),
    async ensureModels() {
      provider.ensureModelsForStatus()
    },
    active: () => provider.routes.isRegistered(),
    models: () => models.list(),
    refreshModels: () => models.refreshManually(),
    maxMode: () => config.maxMode.get() === true,
    async setMaxMode(enabled) {
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法保存 Max 模式`, 'NO_SETTINGS_STORE')
      }
      // maxMode 是 Config 里的 volatile 字段（命名空间 = 条目 id SETTINGS_NAMESPACE）；设置写入只认 volatile 路径。
      await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['maxMode'], value: enabled }])
    },
  })

  // 设置面接线：表单由本插件导出的 `Config` 投影；`settings` 仍是**可选服务**——它缺席时这个子级
  // 一直挂着，插件其余部分照常运行（不会让 entry 停在 pending）。本插件自带 Models 页的 provider
  // 卡片，故关掉按 schema 自动生成的配置页，避免同一份值在两个界面里编辑；配置读写不受影响。
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      `${name}: settings page policy`,
    )
  })
}
