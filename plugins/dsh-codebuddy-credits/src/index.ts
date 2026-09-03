/**
 * dsh-codebuddy-credits：把 CodeBuddy 额度（官方 API Key）接成 DSH 的 LLM provider。
 * 公司发的 WorkBuddy/CodeBuddy 积分，在 DSH 里物尽其用——官方 API Key 直连，
 * 只用模型推理（/v2/chat/completions 流式），不碰令牌逆向、不用它的 agent harness。
 *
 * 结构对齐官方 llm-deepseek / llm-pi-ai 的正路写法：
 * registerConfigurableProviders + registerAdapter + registerModelDiscovery + installSection。
 *
 * route 注册条件化：Key 已配置（设置页保存的凭据库值或环境变量）才注册 adapter，
 * 模型选择器才出现本 provider；Key 移除后 route 随即撤回。
 * @module dsh-codebuddy-credits
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {} from '@deepseek-ai/dsh-settings'
import { authInjectionFor } from './auth.js'
import { discoverCodeBuddyModels, discoveredToProfile, resolveModels } from './catalog.js'
import { Config } from './config.js'
import {
  API_KEY_ENV,
  DISPLAY_NAME,
  MAX_REQUEST_IMAGE_BYTES,
  NS,
  PRODUCT_HEADER,
  PROVIDER,
  REQUEST_IMAGE_MAX_BYTES,
  REQUEST_IMAGE_PIXEL_BUDGET,
  STREAM_IDLE_TIMEOUT_MS,
} from './constants.js'
import { buildCodeBuddyProvider } from './provider.js'
import { installCodeBuddyWeb } from './web.js'

export const name = 'llm-codebuddy-credits'
export const inject = ['llm']

export { Config } from './config.js'

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedPiAiProviderProfile | undefined

  /**
   * 当前配置的解析结果，按 raw 快照身份记忆。设置节换源后自然失效；
   * 请求在途时持有旧快照，下一请求取新值。
   */
  const profile = (): ResolvedPiAiProviderProfile => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    const models = resolveModels(raw.models ?? [])
    const apiKeyEnv: CredentialRef | undefined = raw.apiKeyEnv === undefined ? undefined : credentialRef(raw.apiKeyEnv)
    const next: ResolvedPiAiProviderProfile = {
      provider: PROVIDER,
      displayName: DISPLAY_NAME,
      ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
      // x-product 非保留名，可经 profile.headers 注入；user-agent 是保留名，
      // 由 provider 包装层注入官方标识。
      headers: { 'x-product': PRODUCT_HEADER },
      streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
      maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
      requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
      requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
      retryPolicy: resolveRetryPolicy(undefined, `${name}: retryPolicy`),
      configuredMaxTokens: new Map(
        (raw.models ?? []).flatMap(entry =>
          Number.isSafeInteger(entry.maxTokens) && (entry.maxTokens ?? 0) > 0
            ? [[entry.id, entry.maxTokens as number]] as [string, number][]
            : [],
        ),
      ),
      piProvider: buildCodeBuddyProvider(models),
    }
    lastRaw = raw
    lastGood = next
    return next
  }
  profile()

  /** 每请求解析凭据：credentials 缝优先，无缝时整个凭据平面就是进程环境。 */
  const resolveApiKey = async (
    provider: string,
    prof: ResolvedPiAiProviderProfile,
  ): Promise<string | undefined> => {
    const ref = prof.apiKeyEnv
    if (ref === undefined) return undefined
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(ref))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, name, ref)
    throw new LlmError(
      `${name}: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not`
      + ` set — store ${ref} through the credentials service (the web Models page writes it) or export it`,
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new PiAiAdapter({
    profiles: () => new Map([[PROVIDER, profile()]]),
    resolveApiKey,
    auth: authInjectionFor(ctx),
    resolveAttachments: () => ctx.get('attachments'),
  })

  // 目录条目始终注册：设置页 provider 行是 Key 的配置入口（client 在行上挂输入卡）。
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: DISPLAY_NAME, settingsNs: NS, settingsPath: [] },
  ])

  // route 条件注册：Key 可用且模型目录已就位才进模型选择器；Key 移除即撤回。
  // want 由调用方显式给出（凭据库是异步面，由保存/移除接口驱动）。
  let registration: AdapterRegistrationHandle | undefined
  let registered = false
  const ensureRoutes = (want: boolean): void => {
    if (want === registered) return
    if (want) {
      if (registration === undefined) registration = ctx.llm.registerAdapter([PROVIDER], adapter)
      else registration.replace([PROVIDER])
      registered = true
    } else {
      if (registration !== undefined) {
        registration.replace([])
        registered = false
      }
    }
  }

  /** 模型目录是否已就位（用户给 Key 时拉取并写入设置节）。 */
  function hasModels(): boolean {
    return (current().models ?? []).length > 0
  }

  /** 启动环境里的 Key（同步判定，凭据库另走异步检查）。 */
  function ambientKey(): boolean {
    const ref = profile().apiKeyEnv
    if (ref === undefined) return false
    const value = launchEnvironmentOf(ctx).get(ref)?.value
    return value !== undefined && value.length > 0
  }

  // 启动：环境变量可见且目录已存则立即注册；凭据库的 Key 在异步检查命中后注册。
  ensureRoutes(ambientKey() && hasModels())
  void (async () => {
    try {
      await resolveApiKey(PROVIDER, profile())
      ensureRoutes(hasModels())
    } catch {
      // 无凭据属预期姿态（用户还没配 Key），保持未注册即可。
    }
  })()

  // 模型发现：draft 请求自带凭据时直接用；否则回退到已配置的凭据。
  ctx.llm.registerModelDiscovery(NS, async (request, signal) => {
    const apiKey = typeof request.apiKey === 'string' && request.apiKey.length > 0
      ? request.apiKey
      : await resolveApiKey(PROVIDER, profile())
    if (apiKey === undefined || apiKey.length === 0) {
      throw new LlmError(
        `${name}: 模型发现需要 API Key（${API_KEY_ENV}）`,
        'MISSING_CREDENTIAL',
      )
    }
    return discoverCodeBuddyModels(apiKey, signal)
  })

  // 设置卡片路由：Key 的保存/移除/状态。
  installCodeBuddyWeb(ctx, {
    async keyConfigured() {
      try {
        await resolveApiKey(PROVIDER, profile())
        return true
      } catch {
        return false
      }
    },
    async saveKey(key) {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        throw new LlmError(`${name}: 本组合没有凭据服务，无法保存 Key`, 'NO_CREDENTIAL_STORE')
      }
      // 用户给 Key 的行为 = 对这次模型目录拉取的授权：保存 Key 后用该 Key
      // 拉 /v3/config（按该 Key 的账号权限返回模型），成功才写入设置节并注册 route。
      const models = await discoverCodeBuddyModels(key)
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法保存模型目录`, 'NO_SETTINGS_STORE')
      }
      await settings.mutate(NS, [{ op: 'set', path: ['models'], value: discoveredToProfile(models) }])
      await credentials.set(credentialRef(API_KEY_ENV), key)
      ensureRoutes(true)
    },
    async removeKey() {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) return
      await credentials.unset?.(credentialRef(API_KEY_ENV))
      ensureRoutes(ambientKey())
    },
    active: () => registered,
    modelIds: () => resolveModels(current().models ?? []).map(model => model.id),
  })

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (source) => {
        current = source
      },
      onChange: () => {
        // profile 按 raw 快照身份记忆，换源后下一次解析自然失效；
        // 本插件无注册期捕获的易变事实（retry policy 恒定），无需重注册。
      },
    })
  })
}
