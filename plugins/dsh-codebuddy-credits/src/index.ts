/**
 * dsh-codebuddy-credits：把 CodeBuddy 额度（官方 API Key）接成 DSH 的 LLM provider。
 * 公司发的 WorkBuddy/CodeBuddy 积分，在 DSH 里物尽其用——官方 API Key 直连，
 * 只用模型推理（/v2/chat/completions 流式），不碰令牌逆向、不用它的 agent harness。
 *
 * 结构对齐官方 llm-deepseek / llm-pi-ai 的正路写法：
 * registerConfigurableProviders + registerAdapter + registerModelDiscovery + installSection。
 * @module dsh-codebuddy-credits
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {} from '@deepseek-ai/dsh-settings'
import { authInjectionFor } from './auth.js'
import { discoverCodeBuddyModels, resolveModels } from './catalog.js'
import { Config } from './config.js'
import {
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

  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: DISPLAY_NAME, settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([PROVIDER], adapter)

  // 模型发现：draft 请求自带凭据时直接用；否则回退到已配置的凭据。
  ctx.llm.registerModelDiscovery(NS, async (request, signal) => {
    const apiKey = typeof request.apiKey === 'string' && request.apiKey.length > 0
      ? request.apiKey
      : await resolveApiKey(PROVIDER, profile())
    if (apiKey === undefined || apiKey.length === 0) {
      throw new LlmError(
        `${name}: 模型发现需要 API Key（CODEBUDDY_API_KEY）`,
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
        // profile 按 raw 快照身份记忆，换源后下一次解析自然失效；
        // 本插件无注册期捕获的易变事实（retry policy 恒定），无需重注册。
      },
    })
  })
}
