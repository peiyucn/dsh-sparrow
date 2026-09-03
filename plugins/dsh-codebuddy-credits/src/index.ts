/**
 * dsh-codebuddy-credits：把 CodeBuddy 积分当成一个非标准协议的推理 API 接入 DSH。
 * 公司发的 WorkBuddy/CodeBuddy 积分，在 DSH 里物尽其用——官方 API Key 直连，
 * 只用模型推理，不碰令牌逆向、不用它的 agent harness。
 *
 * 协议层完全自建（src/adapter.ts）：请求构造、SSE 解析、usage.credit 提取、
 * 企业策略错误透传全部显式实现，不依赖 pi-ai。
 * 装载姿态对齐官方 llm-pi-ai 的 dormant 模式：无 Key 时零请求零注册；
 * 用户保存 Key 后拉取模型目录与账号信息、注册 route、模型选择器出现。
 * @module dsh-codebuddy-credits
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { CodeBuddyAdapter } from './adapter.js'
import type { CodeBuddyUsage } from './adapter.js'
import { discoverCodeBuddyModels, discoveredToProfile, fetchCodeBuddyModels, resolveModels } from './catalog.js'
import type { CodeBuddyModelFacts } from './catalog.js'
import { Config } from './config.js'
import {
  API_KEY_ENV,
  DISPLAY_NAME,
  NS,
  PROVIDER,
  STREAM_IDLE_TIMEOUT_MS,
} from './constants.js'
import { fetchQuota } from './quota.js'
import { installCodeBuddyWeb } from './web.js'

export const name = 'llm-codebuddy-credits'
export const inject = ['llm']

export { Config } from './config.js'

/** /v2/accounts 的账号快照（企业上下文头用，与官方 CLI 一致）。 */
export interface CodeBuddyAccount {
  userId?: string
  enterpriseId?: string
  enterpriseName?: string
  accountType?: string
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: readonly CodeBuddyModelFacts[] | undefined

  /** 当前生效模型事实（设置节驱动，按 raw 快照身份记忆）。 */
  const models = (): readonly CodeBuddyModelFacts[] => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    const next = resolveModels(raw.providers?.[PROVIDER]?.models ?? [])
    lastRaw = raw
    lastGood = next
    return next
  }
  models()

  /** 账号上下文缓存（保存 Key 时从 /v2/accounts 拉取；重启后异步恢复）。 */
  let account: CodeBuddyAccount | undefined

  /** 每请求解析凭据：credentials 缝优先，无缝时整个凭据平面就是进程环境。 */
  const resolveApiKey = async (): Promise<string> => {
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(credentialRef(API_KEY_ENV)))?.value
      : launchEnvironmentOf(ctx).get(credentialRef(API_KEY_ENV))?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, name, credentialRef(API_KEY_ENV))
    throw new LlmError(
      `${name}: 没有可用的 API Key（${API_KEY_ENV}）；请在设置页的 CodeBuddy Credits 卡片里保存 Key`,
      'MISSING_CREDENTIAL',
    )
  }

  /** 会话/今日积分统计（进程内累计，展示走设置卡片与状态接口）。 */
  const usageLog: CodeBuddyUsage[] = []

  const adapter = new CodeBuddyAdapter({
    models,
    resolveApiKey,
    account: () => account,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    onUsage: (usage) => {
      usageLog.push(usage)
      if (usageLog.length > 1000) usageLog.splice(0, usageLog.length - 1000)
    },
  })

  // 目录条目始终注册：设置页 provider 行是 Key 的配置入口（client 在行上挂输入卡）。
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: DISPLAY_NAME, settingsNs: NS, settingsPath: [] },
  ])

  // route 条件注册：Key 可用且模型目录已就位才进模型选择器；Key 移除即撤回。
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

  function hasModels(): boolean {
    return models().length > 0
  }

  function ambientKey(): boolean {
    const value = launchEnvironmentOf(ctx).get(credentialRef(API_KEY_ENV))?.value
    return value !== undefined && value.length > 0
  }

  /** 拉取账号上下文（企业头用），best-effort：失败不阻塞注册。 */
  async function refreshAccountWithKey(key: string): Promise<void> {
    try {
      const res = await fetch('https://copilot.tencent.com/v2/accounts', {
        headers: {
          accept: 'application/json',
          'x-api-key': key,
          'user-agent': 'CLI/unknown CodeBuddy/2.137.1',
          'x-product': 'SaaS',
        },
      })
      if (!res.ok) return
      const body = await res.json() as { data?: { accounts?: Array<{ uid?: string; enterpriseId?: string; enterpriseName?: string; type?: string }> } }
      const first = body.data?.accounts?.[0]
      if (first === undefined) return
      account = {
        ...(first.uid === undefined ? {} : { userId: first.uid }),
        ...(first.enterpriseId === undefined ? {} : { enterpriseId: first.enterpriseId }),
        ...(first.enterpriseName === undefined ? {} : { enterpriseName: first.enterpriseName }),
        ...(first.type === undefined ? {} : { accountType: first.type }),
      }
    } catch {
      // 账号信息缺失只影响企业上下文头，不阻塞功能。
    }
  }

  // 启动：环境变量可见且目录已存则立即注册；凭据库的 Key 在异步检查命中后注册。
  ensureRoutes(ambientKey() && hasModels())
  void (async () => {
    try {
      await refreshAccountWithKey(await resolveApiKey())
      ensureRoutes(hasModels())
    } catch {
      // 无凭据属预期姿态（用户还没配 Key），保持未注册即可。
    }
  })()

  // 模型发现：draft 请求自带凭据时直接用；否则回退到已配置的凭据。
  ctx.llm.registerModelDiscovery(NS, async (request, signal) => {
    const apiKey = typeof request.apiKey === 'string' && request.apiKey.length > 0
      ? request.apiKey
      : await resolveApiKey()
    if (apiKey === undefined || apiKey.length === 0) {
      throw new LlmError(`${name}: 模型发现需要 API Key（${API_KEY_ENV}）`, 'MISSING_CREDENTIAL')
    }
    return discoverCodeBuddyModels(apiKey, account, signal)
  })

  // 设置卡片路由：Key 的保存/移除、配额查询、模型目录刷新、状态。
  installCodeBuddyWeb(ctx, {
    async keyConfigured() {
      try {
        await resolveApiKey()
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
      // 用户给 Key 的行为 = 对模型目录与账号信息拉取的授权。
      const entries = await fetchCodeBuddyModels(key, account)
      await refreshAccountWithKey(key)
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法保存模型目录`, 'NO_SETTINGS_STORE')
      }
      await settings.mutate(NS, [{ op: 'set', path: ['providers', PROVIDER, 'models'], value: discoveredToProfile(entries) }])
      await credentials.set(credentialRef(API_KEY_ENV), key)
      ensureRoutes(true)
    },
    async refreshModels() {
      const key = await resolveApiKey()
      const entries = await fetchCodeBuddyModels(key, account)
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法保存模型目录`, 'NO_SETTINGS_STORE')
      }
      const previous = new Set(models().map(model => model.id))
      const next = discoveredToProfile(entries)
      const added = next.map(model => model.id).filter(id => !previous.has(id))
      await settings.mutate(NS, [{ op: 'set', path: ['providers', PROVIDER, 'models'], value: next }])
      ensureRoutes(hasModels())
      return { added, total: next.length }
    },
    async quota() {
      return fetchQuota(await resolveApiKey(), account)
    },
    account: () => ({
      ...(account?.enterpriseName === undefined ? {} : { enterpriseName: account.enterpriseName }),
      ...(account?.accountType === undefined ? {} : { accountType: account.accountType }),
    }),
    async removeKey() {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) return
      await credentials.unset?.(credentialRef(API_KEY_ENV))
      ensureRoutes(ambientKey())
    },
    active: () => registered,
    modelIds: () => models().map(model => model.id),
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
