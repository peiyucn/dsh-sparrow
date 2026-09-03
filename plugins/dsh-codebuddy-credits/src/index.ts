/**
 * dsh-codebuddy-credits：把 CodeBuddy 额度（官方 API Key）接成 DSH 的 LLM provider。
 * 公司发的 WorkBuddy/CodeBuddy 积分，在 DSH 里物尽其用——官方 API Key 直连，
 * 只用模型推理（/v2/chat/completions 流式），不碰令牌逆向、不用它的 agent harness。
 *
 * 装载姿态对齐官方 llm-pi-ai 的 dormant 模式：插件挂载后不注册任何 route，
 * 设置页「添加提供方」里可选 codebuddy-credits；用户添加（settings 出现
 * providers.codebuddy-credits）后 route 生效并出现在模型选择器，删除则消失。
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
import { discoverCodeBuddyModels, resolveModels } from './catalog.js'
import { Config } from './config.js'
import type { ProviderConfig } from './config.js'
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

export const name = 'llm-codebuddy-credits'
export const inject = ['llm']

export { Config } from './config.js'

const EMPTY_PROFILES: ReadonlyMap<string, ResolvedPiAiProviderProfile> = new Map()

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let memoized: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined

  /**
   * 当前配置的 provider 路由集，按 raw 快照身份记忆。settings 里没有
   * providers.codebuddy-credits 时为空 Map（dormant：不注册任何 route）。
   */
  const profiles = (): ReadonlyMap<string, ResolvedPiAiProviderProfile> => {
    const raw = current()
    if (raw === lastRaw && memoized !== undefined) return memoized
    const entry: ProviderConfig | undefined = raw.providers?.[PROVIDER]
    if (entry === undefined) {
      lastRaw = raw
      memoized = EMPTY_PROFILES
      return memoized
    }
    const apiKeyEnv: CredentialRef = credentialRef(entry.apiKeyEnv ?? API_KEY_ENV)
    const profile: ResolvedPiAiProviderProfile = {
      provider: PROVIDER,
      displayName: DISPLAY_NAME,
      apiKeyEnv,
      // x-product 非保留名，可经 profile.headers 注入；user-agent 是保留名，
      // 由 provider 包装层注入官方标识。
      headers: { 'x-product': PRODUCT_HEADER },
      streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
      maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
      requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
      requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
      retryPolicy: resolveRetryPolicy(undefined, `${name}: retryPolicy`),
      configuredMaxTokens: new Map(
        (entry.models ?? []).flatMap(model =>
          Number.isSafeInteger(model.maxTokens) && (model.maxTokens ?? 0) > 0
            ? [[model.id, model.maxTokens as number]] as [string, number][]
            : [],
        ),
      ),
      piProvider: buildCodeBuddyProvider(resolveModels(entry.models ?? [])),
    }
    lastRaw = raw
    memoized = new Map([[PROVIDER, profile]])
    return memoized
  }
  profiles()

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
    profiles,
    resolveApiKey,
    auth: authInjectionFor(ctx),
    resolveAttachments: () => ctx.get('attachments'),
  })

  // 目录条目始终注册（declared：hand-declared route）：设置页「添加提供方」
  // 下拉里可选 codebuddy-credits；settingsPath 指向 providers.codebuddy-credits，
  // 添加/删除由设置页完成。
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: DISPLAY_NAME, settingsNs: NS, settingsPath: ['providers', PROVIDER], declared: true },
  ])

  // route 注册随 settings 增减：dormant（无配置）不注册；添加后注册，删除后撤回。
  let registration: AdapterRegistrationHandle | undefined
  const ensureRoutes = (): void => {
    const routes = [...profiles().keys()]
    if (registration === undefined) {
      if (routes.length === 0) return
      registration = ctx.llm.registerAdapter(routes, adapter)
    } else {
      registration.replace(routes)
    }
  }
  ensureRoutes()

  // 模型发现：draft 请求自带凭据时直接用；否则回退到已配置 route 的凭据。
  ctx.llm.registerModelDiscovery(NS, async (request, signal) => {
    const apiKey = typeof request.apiKey === 'string' && request.apiKey.length > 0
      ? request.apiKey
      : await resolveApiKey(PROVIDER, profiles().get(PROVIDER) as ResolvedPiAiProviderProfile)
    if (apiKey === undefined || apiKey.length === 0) {
      throw new LlmError(
        `${name}: 模型发现需要 API Key（${API_KEY_ENV}）`,
        'MISSING_CREDENTIAL',
      )
    }
    return discoverCodeBuddyModels(apiKey, signal)
  })

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (source) => {
        current = source
      },
      onChange: () => {
        try {
          ensureRoutes()
        } catch (error) {
          ctx.logger.error('llm-codebuddy-credits: keeping the previously registered routes after a refused update')
          ctx.logger.error(error)
        }
      },
    })
  })
}
