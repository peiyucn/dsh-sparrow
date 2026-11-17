

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

export const inject = ['llm', 'attachments', 'sessions']

export { Config } from './config.js'
export type { CodeBuddyAccount } from './host/account.js'

export function apply(ctx: Context, config: Config): void {


  assertCapabilities(ctx, name, [
    { name: 'llm.registerAdapter', ok: typeof (ctx.llm as { registerAdapter?: unknown } | undefined)?.registerAdapter === 'function' },
    { name: 'llm.registerConfigurableProviders', ok: typeof (ctx.llm as { registerConfigurableProviders?: unknown } | undefined)?.registerConfigurableProviders === 'function' },
    { name: 'llm.registerModelDiscovery', ok: typeof (ctx.llm as { registerModelDiscovery?: unknown } | undefined)?.registerModelDiscovery === 'function' },
    { name: 'sessions.get', ok: typeof (ctx.sessions as { get?: unknown } | undefined)?.get === 'function' },
  ])

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

  models.bindRoutes(provider.routes)
  credentials.bind({ account, models, routes: provider.routes })
  const ledger = createCreditLedger(ctx)


  provider.start()


  const writeSetting = async (path: 'maxMode' | 'autoAdapt', value: boolean, label: string): Promise<void> => {
    const settings = ctx.get('settings')
    if (settings === undefined) {
      throw LlmError.fromFailure({ message: `${name}: 本组合没有设置服务，无法保存${label}`, code: 'NO_SETTINGS_STORE' })
    }
    await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: [path], value }])
  }



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
      await writeSetting('maxMode', enabled, ' Max 模式')
    },
    autoAdapt: () => config.autoAdapt.get() === true,
    async setAutoAdapt(enabled) {
      await writeSetting('autoAdapt', enabled, '「自适应 API 拦截」开关')
    },
  })




  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      `${name}: settings page policy`,
    )
  })
}
