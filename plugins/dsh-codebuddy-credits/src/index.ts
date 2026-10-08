/**
 * dsh-codebuddy-credits：把 CodeBuddy 的额度接成 DSH 的一个推理 provider——官方 API Key 直连，
 * 只用模型推理（不碰令牌逆向、不用它的 agent harness）；协议层完全自建（src/adapter.ts）。
 * 装载姿态对齐官方 llm-pi-ai 的 dormant 模式：无 Key 时零请求零注册；保存 Key 后拉取模型目录与
 * 账号信息、注册 route、模型选择器出现；目录变化推 adapters-updated。
 * @module dsh-codebuddy-credits
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-agent'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { CodeBuddyAdapter } from './adapter.js'
import { discoverCodeBuddyModels, factsFromEntries, fetchCodeBuddyModels, requestHeaders } from './catalog.js'
import type { CodeBuddyModelFacts } from './catalog.js'
import { assertCapabilities, hostSessionFormatVersion, unsupportedSessionFormatReason } from './compat.js'
import { Config, keyRefs } from './config.js'
import {
  ACCOUNT_FETCH_TIMEOUT_MS,
  ACCOUNTS_URL,
  DISPLAY_NAME,
  IMAGE_REQUEST_POLICY,
  MODEL_REFRESH_COOLDOWN_MS,
  NS,
  PROVIDER,
  STREAM_IDLE_TIMEOUT_MS,
} from './constants.js'
import { fetchQuota } from './quota.js'
import { installCodeBuddyWeb } from './web.js'
import type { TurnUsageView } from './web.js'
import {
  codebuddyCreditsProjectionDefinition,
  viewOfCreditsState,
} from './credits-projection.js'
import type { CreditsProjectionState } from './credits-projection.js'
import { createLedgerResolver } from './credits-source.js'

export const name = 'llm-codebuddy-credits'
/**
 * 硬依赖服务。`sessions` 是积分账本的数据源；漏在宿主侧声明会让 `ctx.sessions` 直接抛
 * 「cannot get property "sessions" without inject」（cordis 服务须经 inject 绑定到本插件 fiber）。
 */
export const inject = ['llm', 'attachments', 'sessions']

/** 无账本时的空视图（会话不存在 / 冷读失败且无缓存）。 */
const EMPTY_USAGE: TurnUsageView = { credit: 0, calls: 0, byModel: [] }

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
  // 宿主兼容自检（先于一切注册）：宿主缺这些面即自停用，而不是带病注册半个 provider。
  assertCapabilities(ctx, name, [
    { name: 'llm.registerAdapter', ok: typeof (ctx.llm as { registerAdapter?: unknown } | undefined)?.registerAdapter === 'function' },
    { name: 'llm.resolveModelInfo', ok: typeof (ctx.llm as { resolveModelInfo?: unknown } | undefined)?.resolveModelInfo === 'function' },
    { name: 'sessions.get', ok: typeof (ctx.sessions as { get?: unknown } | undefined)?.get === 'function' },
  ])
  // 会话格式**软判定**：这是数据格式门而不是能力门（格式换代不改 API 形状，能力探测发现不了），
  // 认错就是静默读出 0；但积分只是展示面，为此停掉整个 provider 是过度取舍，故只告警。详见 src/compat.ts。
  const formatReason = unsupportedSessionFormatReason(hostSessionFormatVersion())
  if (formatReason !== undefined) {
    ctx.logger.warn(`${name}: ${formatReason}；积分可能显示为 0（推理不受影响）`)
  }

  /** 当前生效模型事实（进程内，完全由 Key 授权下的 /v3/config 填充）；不落设置节。 */
  let facts: readonly CodeBuddyModelFacts[] = []
  const models = (): readonly CodeBuddyModelFacts[] => facts
  /**
   * 凭据/授权代际：saveKey / reapply / removeKey 落定前自增；异步刷新在发起时捕获，落定前不一致即丢弃。
   */
  let factsGeneration = 0
  /** 兜底注册失败日志只记一次（每进程）；成功后重置。 */
  let registrationFailureLogged = false

  /** 账号上下文缓存（保存 Key 时从 /v2/accounts 拉取；重启后异步恢复）。 */
  let account: CodeBuddyAccount | undefined

  /**
   * 每请求解析凭据：credentials 缝优先，无缝时整个凭据平面就是进程环境；引用列表由 keyRefs 给出
   * （主引用 + 旧引用兜底，旧版存过的 Key 不用重配）；`.get()` 每次现读最新值。
   */
  const resolveApiKey = async (): Promise<string> => {
    const credentials = ctx.get('credentials')
    const refs = keyRefs(config.apiKeyEnv.get())
    for (const ref of refs) {
      const hit = credentials !== undefined
        ? (await credentials.resolve(credentialRef(ref)))?.value
        : launchEnvironmentOf(ctx).get(credentialRef(ref))?.value
      if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, name, credentialRef(ref))
    }
    throw new LlmError(
      `${name}: 没有可用的 API Key（${refs.join(' / ')}）；请在设置页的 CodeBuddy Credits 卡片里保存 Key`,
      'MISSING_CREDENTIAL',
    )
  }

  /**
   * 会话积分账本：从**会话事件重放**得到——credit 由适配器写进 finish 块的
   * `replayState.response.usage`，随事件持久化。
   *
   * live 路径 = `credits-projection.ts` 的官方投影（注册表逐事件驱动，读状态 O(1)、天然幂等）；
   * 冷会话 = `sessionController.inspect()` + 一次性重放。**不再调用官方已废弃的同步历史读**
   * （`snapshotEvents` / `eventAt` / `ownEvents`）。投影走 `ctx.inject(['sessionProjections'], …)`
   * 可选注册：服务缺席时积分降级为「仅冷路径」，provider 照常工作——积分是展示面，不该因它停掉推理。
   */
  const ledgers = createLedgerResolver({
    live: (sessionId) => {
      // 软获取：服务缺失即降级（用 `ctx.get`——未 inject 时 `ctx.sessionProjections` 会抛）。
      const registry = ctx.get('sessionProjections') as
        | { stateOf(session: unknown, key: string): unknown }
        | undefined
      if (registry === undefined) return undefined
      const session = ctx.sessions.get(SessionId(sessionId))
      if (session === undefined) return undefined
      const state = registry.stateOf(session, 'codebuddyCredits')
      // 未注册（或状态类型不认识）时降级：交给冷路径。
      if (state === undefined || state === null || typeof state !== 'object') return undefined
      return viewOfCreditsState(state as CreditsProjectionState)
    },
    inspect: async (sessionId) => {
      // sessionController 只随 web-app bundle 加载，故软获取；缺失即降级为「仅 live 会话准确」。
      const controller = ctx.get('sessionController') as
        | { inspect(id: unknown): Promise<{ events: readonly SessionEvent[] }> }
        | undefined
      if (controller === undefined) return undefined
      return (await controller.inspect(SessionId(sessionId))).events
    },
  })

  // 投影单元注册：可选依赖 fork——服务出现才注册（fork 是 entry 的子 fiber，不进 boot audit 的
  // entry 列表）；注册随 fiber 释放，disposer 由 effect 托管。
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(codebuddyCreditsProjectionDefinition)
  })

  // route 条件注册：Key 可用即注册（模型目录可后补——选择器建目录会触发后台刷新）；Key 移除即撤回。
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
    const environment = launchEnvironmentOf(ctx)
    for (const ref of keyRefs(config.apiKeyEnv.get())) {
      const value = environment.get(credentialRef(ref))?.value
      if (value !== undefined && value.length > 0) return true
    }
    return false
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
    const generation = factsGeneration
    try {
      const res = await fetch(ACCOUNTS_URL, {
        headers: requestHeaders(key),
        // /status 会触发补拉：加超时避免把状态接口挂住。
        signal: AbortSignal.timeout(ACCOUNT_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return
      const body = await res.json() as { data?: { accounts?: Array<{ uid?: string; enterpriseId?: string; enterpriseName?: string; type?: string; nickname?: string; enterpriseUserName?: string }> } }
      const first = body.data?.accounts?.[0]
      if (first === undefined) return
      // 凭据代际已变化（换/清 Key）：旧账号快照不覆盖新状态。
      if (generation !== factsGeneration) return
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
    maxMode: () => config.maxMode.get() === true,
    // 不挂 onUsage：记账改由会话事件重放承担（credits-ledger）——适配器已把 credit 写进 finish 块，
    // 这里再存一份只会重复且重启即失。
    onCatalogRead: () => {
      kickModelRefresh()
    },
    // 图片字节只经官方附件 seam：按官方 CLI 压缩档派生请求版本（像素预算经官方
    // `requestImageDimensions` 换算成保宽高比的目标尺寸）；后端不支持投影时退回规范化存储字节。
    readImage: async (ref, signal) => {
      try {
        const request = await ctx.attachments.readImageRequest(ref, {
          ...requestImageDimensions(ref.width, ref.height, IMAGE_REQUEST_POLICY.maxPixels),
          maxBytes: IMAGE_REQUEST_POLICY.maxBytes,
        }, signal)
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

  /** 上游拉取的单飞：自动与手动两条路径共用，避免并发重复拉 /v3/config。 */
  let factsInFlight: Promise<readonly CodeBuddyModelFacts[]> | undefined
  function loadFactsOnce(key: string): Promise<readonly CodeBuddyModelFacts[]> {
    if (factsInFlight === undefined) {
      factsInFlight = refreshFactsWithKey(key).finally(() => { factsInFlight = undefined })
    }
    return factsInFlight
  }

  /** 节流后台刷新：失败保持现状（下次建目录再试），成功且有变化即通知选择器。 */
  async function refreshFactsInBackground(): Promise<void> {
    const generation = factsGeneration
    let key: string
    try {
      key = await resolveApiKey()
    } catch {
      return
    }
    try {
      const next = await loadFactsOnce(key)
      // 凭据/授权已变化：这次结果属于旧状态，直接丢弃。
      if (generation !== factsGeneration) return
      const changed = !sameFacts(facts, next)
      facts = next
      if (changed && registered && registration !== undefined) {
        // 同一 route 集重提交 = 一次 llm/adapters-updated：宿主重建模型目录、打开中的选择器拿到新列表。
        registration.replace([PROVIDER])
      }
    } catch (error) {
      ctx.logger.warn(`${name}: 后台模型目录刷新失败`)
      ctx.logger.warn(error)
    }
  }

  /**
   * 设置卡「获取可用模型」：手动重扫模型目录——与自动路径共用上游单飞，但**不受冷却限制**
   * （手动点了就该真的去拉）；registration.replace 只动本插件 handle 的 owned 集合，不触碰其他 provider。
   */
  async function refreshModelsManually(): Promise<{ changed: boolean; models: readonly CodeBuddyModelFacts[] }> {
    const generation = factsGeneration
    const key = await resolveApiKey()
    const next = await loadFactsOnce(key)
    // 刷新期间凭据被换掉/清空：结果已过期，既不能覆盖新状态，也不能据此注册 route。
    if (generation !== factsGeneration) {
      throw new LlmError(`${name}: 凭据在刷新期间发生变化，请稍后重试`, 'REFRESH_SUPERSEDED')
    }
    const changed = !sameFacts(facts, next)
    facts = next
    lastRefreshAttemptAt = Date.now()
    if (changed && registered && registration !== undefined) registration.replace([PROVIDER])
    if (!registered) ensureRoutes(true)
    return { changed, models: next }
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

  // 启动：环境变量可见立即注册；凭据库的 Key 在异步检查命中后注册，并补拉账号与模型目录（best-effort）。
  ensureRoutes(ambientKey())
  void (async () => {
    let key: string
    try {
      key = await resolveApiKey()
    } catch {
      return
    }
    // 旧引用 → 主引用迁移（boot 兜底；saveKey 也会做）：迁移后官方行头圆点即亮绿。
    // 每步独立容错——任何一步失败都不能挡掉后面的 route 注册。
    try {
      const credentials = ctx.get('credentials')
      const [primary, legacyRef] = keyRefs(config.apiKeyEnv.get())
      if (credentials !== undefined && legacyRef !== undefined && legacyRef !== primary) {
        const fresh = await credentials.resolve(credentialRef(primary)).catch(() => undefined)
        const storedLegacy = await credentials.resolve(credentialRef(legacyRef)).catch(() => undefined)
        if (fresh?.value === undefined && storedLegacy?.value !== undefined) {
          await credentials.set(credentialRef(primary), storedLegacy.value).catch(() => {})
          const unset = credentials.unset
          if (typeof unset === 'function') {
            await unset.call(credentials, credentialRef(legacyRef)).catch(() => {})
          }
        }
      }
    } catch (error) {
      ctx.logger.warn(`${name}: boot 凭据迁移失败（不阻塞注册）`)
      ctx.logger.warn(error)
    }
    // 官方行头圆点不需要在 boot 期把 apiKeyEnv 物化进 profile：0.1.7 起 schema 默认值本身就在
    // 官方读取路径上，物化不改变任何可见状态。旧版遗留的 `providers` 子树也不再清理——非 schema
    // 字段不可写（会抛 "Config field \"providers\" is not volatile"），残留键只是普通配置、不进表单。
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
    return discoverCodeBuddyModels(apiKey, account, signal)
  })

  // 设置卡片路由：Key 的保存、配额查询、状态。整节型 provider 的 settingsPath 为空，官方页面本就
  // 不提供「移除」，凭据清理由本插件的「清空 Key」承担（见 /remove-key）。
  installCodeBuddyWeb(ctx, {
    async keyConfigured() {
      return hasKey()
    },
    async saveKey(key) {
      // 预检两个服务（先于任何写入）：避免 Key 已落库后才因缺服务报错的部分失败。
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        throw new LlmError(`${name}: 本组合没有凭据服务，无法保存 Key`, 'NO_CREDENTIAL_STORE')
      }
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法记录凭据引用`, 'NO_SETTINGS_STORE')
      }
      // 用户给 Key = 对模型目录与账号信息拉取的授权；先取账号上下文（best-effort）再拉目录，
      // 请求才带对当前 Key 的企业头。
      await refreshAccountWithKey(key)
      const entries = await fetchCodeBuddyModels(key, account)
      // 作废所有仍用旧 Key 的在飞刷新。
      factsGeneration += 1
      facts = factsFromEntries(entries)
      const [primary, legacyRef] = keyRefs(config.apiKeyEnv.get())
      await credentials.set(credentialRef(primary), key)
      // 旧引用迁移：老版本存在 CODEBUDDY_API_KEY 下的 Key 挪到主引用并清掉旧值。
      if (legacyRef !== undefined && legacyRef !== primary) {
        const legacy = await credentials.resolve(credentialRef(legacyRef)).catch(() => undefined)
        if (legacy?.value !== undefined) await credentials.unset?.(credentialRef(legacyRef))
      }
      // 官方页面的凭据 join 按节根 apiKeyEnv 解析：把用户当前生效的引用物化到用户层
      // （apiKeyEnv 是 volatile 字段，设置写入只认 volatile 路径）。旧版遗留的 providers 子树不清理（见 boot 段）。
      await settings.mutate(NS, [{ op: 'set', path: ['apiKeyEnv'], value: primary }])
      ensureRoutes(true)
    },
    async reapply() {
      // 幂等重配：用已存 Key 重拉模型目录与账号信息（不写凭据、不写设置）。
      const key = await resolveApiKey()
      await refreshAccountWithKey(key)
      const entries = await fetchCodeBuddyModels(key, account)
      factsGeneration += 1
      facts = factsFromEntries(entries)
      ensureRoutes(true)
    },
    async removeKey() {
      // 清空 Key：所有引用都清掉，模型事实与 route 一并撤回；profile 保留（官方行头圆点转红 = 未配置）。
      // 被环境遮蔽的引用 unset 会抛错（官方语义：环境提供者优先），逐引用容错。
      const credentials = ctx.get('credentials')
      const unset = credentials?.unset
      if (credentials !== undefined && typeof unset === 'function') {
        for (const ref of keyRefs(config.apiKeyEnv.get())) {
          try {
            await unset.call(credentials, credentialRef(ref))
          } catch {
            // 环境遮蔽等拒绝：静默（环境里的 Key 仍生效，清空不覆盖环境）。
          }
        }
      }
      // 作废所有在飞刷新/账号补拉，防止旧结果回写。
      factsGeneration += 1
      account = undefined
      facts = []
      ensureRoutes(ambientKey())
    },
    async quota() {
      return fetchQuota(await resolveApiKey(), account)
    },
    async refreshModels() {
      return refreshModelsManually()
    },
    /** 会话累计积分：live 走官方投影状态，冷会话走持久化重放（重启后仍准确）。 */
    async sessionUsage(sessionId) {
      const view = await ledgers.for(sessionId)
      return view === undefined ? EMPTY_USAGE : view.session()
    },
    /** 单轮积分：按事件里的 turn 取用（每轮积分胶囊用）。 */
    async turnUsage(sessionId, turn) {
      const view = await ledgers.for(sessionId)
      return view === undefined ? EMPTY_USAGE : view.turn(turn)
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
      // 状态读取是自愈入口：目录为空补拉、route 未注册（boot 异常被打断过）则补注册——
      // 此处只在 keyConfigured 时被调用，注册安全。
      if (models().length === 0) kickModelRefresh()
      if (!registered) {
        try {
          ensureRoutes(true)
          registrationFailureLogged = false
        } catch (error) {
          // 日志防刷：同一失败每进程只记一次；成功后再失败会重新记（状态接口的 active 字段供诊断）。
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
    maxMode: () => config.maxMode.get() === true,
    async setMaxMode(enabled) {
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法保存 Max 模式`, 'NO_SETTINGS_STORE')
      }
      // maxMode 是 Config 里的 volatile 字段（命名空间 = 条目 id NS）；设置写入只认 volatile 路径。
      await settings.mutate(NS, [{ op: 'set', path: ['maxMode'], value: enabled }])
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
