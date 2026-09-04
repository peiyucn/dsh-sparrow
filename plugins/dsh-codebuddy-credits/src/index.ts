/**
 * dsh-codebuddy-credits：把 CodeBuddy 积分当成一个非标准协议的推理 API 接入 DSH。
 * 公司发的 WorkBuddy/CodeBuddy 积分，在 DSH 里物尽其用——官方 API Key 直连，
 * 只用模型推理，不碰令牌逆向、不用它的 agent harness。
 *
 * 协议层完全自建（src/adapter.ts）：请求构造、SSE 解析、usage.credit 提取、
 * 企业策略错误透传全部显式实现，不依赖 pi-ai。
 * 装载姿态对齐官方 llm-pi-ai 的 dormant 模式：无 Key 时零请求零注册；
 * 用户保存 Key 后拉取模型目录与账号信息、注册 route、模型选择器出现。
 * 模型目录完全由 Key 驱动：事实只存进程内，宿主重建模型目录时（模型选择
 * 器建目录、适配器/凭据/设置事件）节流后台刷新，有变化即推 adapters-updated。
 * @module dsh-codebuddy-credits
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-attachment'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { CodeBuddyAdapter } from './adapter.js'
import type { CodeBuddyUsage } from './adapter.js'
import { discoverCodeBuddyModels, factsFromEntries, fetchCodeBuddyModels } from './catalog.js'
import type { CodeBuddyModelFacts } from './catalog.js'
import { Config } from './config.js'
import {
  ACCOUNT_FETCH_TIMEOUT_MS,
  API_KEY_ENV,
  DISPLAY_NAME,
  IMAGE_REQUEST_POLICY,
  LEGACY_API_KEY_ENV,
  MODEL_REFRESH_COOLDOWN_MS,
  NS,
  PROVIDER,
  STREAM_IDLE_TIMEOUT_MS,
} from './constants.js'
import { fetchQuota } from './quota.js'
import { installCodeBuddyWeb } from './web.js'

export const name = 'llm-codebuddy-credits'
export const inject = ['llm', 'attachments']

export { Config } from './config.js'

/** /v2/accounts 的账号快照（企业上下文头用，与官方 CLI 一致）。 */
export interface CodeBuddyAccount {
  userId?: string
  enterpriseId?: string
  enterpriseName?: string
  accountType?: string
  /** 账号昵称（/v2/accounts 的 nickname）。 */
  nickname?: string
  /** 企业内姓名（/v2/accounts 的 enterpriseUserName）。 */
  enterpriseUserName?: string
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config

  /**
   * 当前生效模型事实（进程内，完全由 Key 授权下的 /v3/config 填充）。
   * 不落设置节：设置页不自建模型列表，模型列表随 Key 走、随刷新更新。
   */
  let facts: readonly CodeBuddyModelFacts[] = []
  const models = (): readonly CodeBuddyModelFacts[] => facts
  /** 兜底注册失败日志只记一次（每进程）；成功后重置。 */
  let registrationFailureLogged = false

  /** 账号上下文缓存（保存 Key 时从 /v2/accounts 拉取；重启后异步恢复）。 */
  let account: CodeBuddyAccount | undefined

  /**
   * 每请求解析凭据：credentials 缝优先，无缝时整个凭据平面就是进程环境。
   * 新引用（CODEBUDDY_CREDITS_API_KEY，对齐官方页面派生名）优先，
   * 旧引用（CODEBUDDY_API_KEY）兜底——旧版存过的 Key 不用重配。
   */
  const resolveApiKey = async (): Promise<string> => {
    const credentials = ctx.get('credentials')
    for (const ref of [API_KEY_ENV, LEGACY_API_KEY_ENV]) {
      const hit = credentials !== undefined
        ? (await credentials.resolve(credentialRef(ref)))?.value
        : launchEnvironmentOf(ctx).get(credentialRef(ref))?.value
      if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, name, credentialRef(ref))
    }
    throw new LlmError(
      `${name}: 没有可用的 API Key（${API_KEY_ENV}）；请在设置页的 CodeBuddy Credits 卡片里保存 Key`,
      'MISSING_CREDENTIAL',
    )
  }

  /** 会话/今日积分统计（进程内累计，展示走状态接口）。 */
  const usageLog: CodeBuddyUsage[] = []

  // route 条件注册：Key 可用即注册（模型目录可能还是空的——首次打开选择器时
  // 建目录会触发后台刷新补上）；Key 移除即撤回。
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

  function ambientKey(): boolean {
    const value = launchEnvironmentOf(ctx).get(credentialRef(API_KEY_ENV))?.value
    return value !== undefined && value.length > 0
  }

  async function hasKey(): Promise<boolean> {
    try {
      await resolveApiKey()
      return true
    } catch {
      return false
    }
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
        // /status 会触发补拉：加超时避免把状态接口挂住。
        signal: AbortSignal.timeout(ACCOUNT_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return
      const body = await res.json() as { data?: { accounts?: Array<{ uid?: string; enterpriseId?: string; enterpriseName?: string; type?: string; nickname?: string; enterpriseUserName?: string }> } }
      const first = body.data?.accounts?.[0]
      if (first === undefined) return
      account = {
        ...(first.uid === undefined ? {} : { userId: first.uid }),
        ...(first.enterpriseId === undefined ? {} : { enterpriseId: first.enterpriseId }),
        ...(first.enterpriseName === undefined ? {} : { enterpriseName: first.enterpriseName }),
        ...(first.type === undefined ? {} : { accountType: first.type }),
        ...(first.nickname === undefined ? {} : { nickname: first.nickname }),
        ...(first.enterpriseUserName === undefined ? {} : { enterpriseUserName: first.enterpriseUserName }),
      }
    } catch {
      // 账号信息缺失只影响企业上下文头，不阻塞功能。
    }
  }

  const adapter = new CodeBuddyAdapter({
    models,
    resolveApiKey,
    account: () => account,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    onUsage: (usage) => {
      usageLog.push(usage)
      if (usageLog.length > 1000) usageLog.splice(0, usageLog.length - 1000)
    },
    onCatalogRead: () => {
      kickModelRefresh()
    },
    // 图片字节只经官方附件 seam：按官方 CLI 压缩档派生请求版本（最长边
    // 2000px + 字节目标，JPEG 质量阶梯由附件服务实现），后端不支持投影时
    // 退回规范化存储字节（协议仍成立，只是跳过缩放）。
    readImage: async (ref, signal) => {
      try {
        const request = await ctx.attachments.readImageRequest(ref, IMAGE_REQUEST_POLICY, signal)
        return { mediaType: request.mediaType, data: request.data }
      } catch {
        const stored = await ctx.attachments.readImage(ref, signal)
        return { mediaType: ref.mediaType, data: stored.data }
      }
    },
  })

  // —— 模型目录后台刷新（内存事实 + 节流；有变化推 adapters-updated）——
  let lastRefreshAttemptAt = 0
  let refreshInFlight: Promise<void> | undefined

  /** 两代事实是否等价（模型 id/展示名/输入模态/思考档位）。 */
  function sameFacts(prev: readonly CodeBuddyModelFacts[], next: readonly CodeBuddyModelFacts[]): boolean {
    if (prev.length !== next.length) return false
    return prev.every((entry, index) => {
      const other = next[index]
      return other !== undefined
        && entry.id === other.id
        && entry.name === other.name
        && entry.input.join(',') === other.input.join(',')
        && JSON.stringify(entry.thinkingLevelMap ?? null) === JSON.stringify(other.thinkingLevelMap ?? null)
    })
  }

  async function refreshFactsWithKey(key: string): Promise<readonly CodeBuddyModelFacts[]> {
    return factsFromEntries(await fetchCodeBuddyModels(key, account))
  }

  /** 节流后台刷新：失败保持现状（下次建目录再试），成功且有变化即通知选择器。 */
  async function refreshFactsInBackground(): Promise<void> {
    let key: string
    try {
      key = await resolveApiKey()
    } catch {
      return
    }
    try {
      const next = await refreshFactsWithKey(key)
      const changed = !sameFacts(facts, next)
      facts = next
      if (changed && registered && registration !== undefined) {
        // 同一 route 集重提交 = 一次 llm/adapters-updated：宿主重建模型目录，
        // 打开中的选择器实时拿到新列表（change 比较挡住节流窗口内的回环）。
        registration.replace([PROVIDER])
      }
    } catch (error) {
      ctx.logger.warn(`${name}: 后台模型目录刷新失败`)
      ctx.logger.warn(error)
    }
  }

  function kickModelRefresh(): void {
    if (refreshInFlight !== undefined) return
    const now = Date.now()
    if (now - lastRefreshAttemptAt < MODEL_REFRESH_COOLDOWN_MS) return
    lastRefreshAttemptAt = now
    refreshInFlight = refreshFactsInBackground().finally(() => {
      refreshInFlight = undefined
    })
  }

  // 目录条目始终注册：设置页 provider 行是 Key 的配置入口（client 在行上挂输入卡）。
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: DISPLAY_NAME, settingsNs: NS, settingsPath: [] },
  ])

  // 启动：环境变量可见立即注册；凭据库的 Key 在异步检查命中后注册，并补拉
  // 账号与模型目录（best-effort，失败留给选择器建目录时的后台刷新）。
  ensureRoutes(ambientKey())
  void (async () => {
    let key: string
    try {
      key = await resolveApiKey()
    } catch {
      return
    }
    // 旧引用 → 新引用迁移（boot 兜底；saveKey 也会做）：官方页面按新引用
    // join 凭据，迁移后行头圆点即亮绿。每步独立容错——任何一步失败都不能
    // 挡掉后面的 route 注册（此前 unset 可选链/服务解析异常会整体打断）。
    try {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) {
        const fresh = await credentials.resolve(credentialRef(API_KEY_ENV)).catch(() => undefined)
        const legacy = await credentials.resolve(credentialRef(LEGACY_API_KEY_ENV)).catch(() => undefined)
        if (fresh?.value === undefined && legacy?.value !== undefined) {
          await credentials.set(credentialRef(API_KEY_ENV), legacy.value).catch(() => {})
          const unset = credentials.unset
          if (typeof unset === 'function') {
            await unset.call(credentials, credentialRef(LEGACY_API_KEY_ENV)).catch(() => {})
          }
        }
      }
    } catch (error) {
      ctx.logger.warn(`${name}: boot 凭据迁移失败（不阻塞注册）`)
      ctx.logger.warn(error)
    }
    // 官方行头圆点读整节根部 apiKeyEnv：Key 已存在时补写（旧版本存的
    // profile 是 providers 子树，一并清掉——整节型 schema 已不再有该层）。
    try {
      const settingsBoot = ctx.get('settings')
      if (settingsBoot !== undefined) {
        await settingsBoot.mutate(NS, [
          { op: 'set', path: ['apiKeyEnv'], value: API_KEY_ENV },
          { op: 'unset', path: ['providers'] },
        ]).catch(() => {})
      }
    } catch (error) {
      ctx.logger.warn(`${name}: boot 设置补写失败（不阻塞注册）`)
      ctx.logger.warn(error)
    }
    await refreshAccountWithKey(key)
    // Key 可用即注册 route——模型目录可后补（选择器建目录/状态读取会补拉）。
    try {
      ensureRoutes(true)
    } catch (error) {
      ctx.logger.warn(`${name}: route 注册失败`)
      ctx.logger.warn(error)
    }
    void kickModelRefresh()
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

  // 设置卡片路由：Key 的保存、配额查询、状态。删除走官方行头「移除」
  // （引用对齐后官方流程会连带清凭据与 profile，installSection onChange 收尾）。
  installCodeBuddyWeb(ctx, {
    async keyConfigured() {
      return hasKey()
    },
    async saveKey(key) {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        throw new LlmError(`${name}: 本组合没有凭据服务，无法保存 Key`, 'NO_CREDENTIAL_STORE')
      }
      // 用户给 Key 的行为 = 对模型目录与账号信息拉取的授权；先验证再落库。
      const entries = await fetchCodeBuddyModels(key, account)
      await refreshAccountWithKey(key)
      facts = factsFromEntries(entries)
      await credentials.set(credentialRef(API_KEY_ENV), key)
      // 旧引用迁移：老版本存在 CODEBUDDY_API_KEY 下的 Key 挪到新引用并清掉旧值。
      const legacy = await credentials.resolve(credentialRef(LEGACY_API_KEY_ENV)).catch(() => undefined)
      if (legacy?.value !== undefined) await credentials.unset?.(credentialRef(LEGACY_API_KEY_ENV))
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法记录凭据引用`, 'NO_SETTINGS_STORE')
      }
      // 官方页面的凭据 join 读 profile.apiKeyEnv：物化到用户层，行头圆点才会
      // 亮绿；顺带清掉旧版遗留的 models 键（模型列表已不落设置节）。
      await settings.mutate(NS, [
        { op: 'set', path: ['apiKeyEnv'], value: API_KEY_ENV },
        { op: 'unset', path: ['providers'] },
      ])
      ensureRoutes(true)
    },
    async reapply() {
      // 幂等重配：用已存 Key 重拉模型目录与账号信息（不写凭据、不写设置）。
      const key = await resolveApiKey()
      const entries = await fetchCodeBuddyModels(key, account)
      await refreshAccountWithKey(key)
      facts = factsFromEntries(entries)
      ensureRoutes(true)
    },
    async removeKey() {
      // 清空 Key：两个引用都清掉，模型事实与 route 一并撤回；profile 保留
      // （官方行头圆点转红 = 未配置凭据的官方语义）。被环境遮蔽的引用 unset
      // 会抛错（官方语义：环境提供者优先），逐引用容错。
      const credentials = ctx.get('credentials')
      const unset = credentials?.unset
      if (credentials !== undefined && typeof unset === 'function') {
        for (const ref of [API_KEY_ENV, LEGACY_API_KEY_ENV]) {
          try {
            await unset.call(credentials, credentialRef(ref))
          } catch {
            // 环境遮蔽等拒绝：静默（环境里的 Key 仍生效，清空不覆盖环境）。
          }
        }
      }
      account = undefined
      facts = []
      ensureRoutes(ambientKey())
    },
    async quota() {
      return fetchQuota(await resolveApiKey(), account)
    },
    /** 会话累计积分：usage 回调按 sessionId 记账（进程内，重启清零）。 */
    sessionUsage(sessionId) {
      let credit = 0
      let calls = 0
      for (const usage of usageLog) {
        if (usage.sessionId !== sessionId) continue
        calls += 1
        if (usage.credit !== undefined) credit += usage.credit
      }
      return { credit, calls }
    },
    account: () => ({
      ...(account?.enterpriseName === undefined ? {} : { enterpriseName: account.enterpriseName }),
      ...(account?.accountType === undefined ? {} : { accountType: account.accountType }),
      ...(account?.enterpriseUserName === undefined ? {} : { enterpriseUserName: account.enterpriseUserName }),
      ...(account?.nickname === undefined ? {} : { nickname: account.nickname }),
    }),
    async ensureAccount() {
      // 启动期补拉失败的兜底：状态接口触发一次（成功即缓存进内存）。
      if (account !== undefined) return
      try {
        await refreshAccountWithKey(await resolveApiKey())
      } catch {
        // best-effort：账号信息缺失不阻塞状态接口。
      }
    },
    async ensureModels() {
      // 状态读取是自愈入口：目录为空补拉；route 未注册（boot 异常被打断过）
      // 则补注册——此处只在 keyConfigured 时被调用，注册安全。
      if (models().length === 0) kickModelRefresh()
      if (!registered) {
        try {
          ensureRoutes(true)
          registrationFailureLogged = false
        } catch (error) {
          // 日志防刷：同一失败只记一次（每进程），后续静默；状态接口的
          // active 字段供诊断。成功后再失败会重新记。
          if (!registrationFailureLogged) {
            registrationFailureLogged = true
            ctx.logger.warn(`${name}: 状态读取兜底注册失败（本进程只记一次）`)
            ctx.logger.warn(error)
          }
        }
      }
    },
    active: () => registered,
    models: () => models(),
  })

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (source) => {
        current = source
      },
      onChange: () => {
        // 整节型 provider（settingsPath 为空）官方页面不提供「移除」，凭据
        // 清理由我们的「清空 Key」承担（/remove-key）；设置变化无需收尾。
      },
    })
  })
}
