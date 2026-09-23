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
  foldSessionCredits,
  sessionViewOf,
  turnViewOf,
} from './credits-ledger.js'
import { createLedgerResolver } from './credits-source.js'

export const name = 'llm-codebuddy-credits'
/**
 * 硬依赖服务。`sessions` 是积分账本的数据源（live 会话读内存日志）——本插件本就
 * `import { SessionId } from '@deepseek-ai/dsh-session'`，客户端侧也声明了
 * `ctx.inject(['sessions'], …)`；漏在宿主侧声明会让 `ctx.sessions` 直接抛
 * 「cannot get property "sessions" without inject」（cordis 服务须经 inject 绑定到
 * 本插件 fiber，见 `cordis/lib/index.js:672-694`）。
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
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：本插件向 llm 注册
  // 适配器路由并接管模型目录，宿主缺这些面即自停用，而不是带病注册半个 provider。
  assertCapabilities(ctx, name, [
    { name: 'llm.registerAdapter', ok: typeof (ctx.llm as { registerAdapter?: unknown } | undefined)?.registerAdapter === 'function' },
    { name: 'llm.resolveModelInfo', ok: typeof (ctx.llm as { resolveModelInfo?: unknown } | undefined)?.resolveModelInfo === 'function' },
    { name: 'sessions.get', ok: typeof (ctx.sessions as { get?: unknown } | undefined)?.get === 'function' },
  ])
  // 会话格式**软判定**：积分重放要逐字段读会话事件，格式换了就是静默读出 0。
  // 但它只是展示面 —— 为此把整个 provider（推理）停掉是过度取舍，故这里只告警。
  // 为什么不能只靠上面的能力门：`snapshotEvents()` 是 `Session` 的**类方法**，
  // 能力门探不到；格式换代又往往不改 API 形状。详见 src/compat.ts 的说明。
  const formatReason = unsupportedSessionFormatReason(hostSessionFormatVersion())
  if (formatReason !== undefined) {
    ctx.logger.warn(`${name}: ${formatReason}；积分可能显示为 0（推理不受影响）`)
  }

  /**
   * 当前生效模型事实（进程内，完全由 Key 授权下的 /v3/config 填充）。
   * 不落设置节：设置页不自建模型列表，模型列表随 Key 走、随刷新更新。
   */
  let facts: readonly CodeBuddyModelFacts[] = []
  const models = (): readonly CodeBuddyModelFacts[] => facts
  /**
   * 凭据/授权代际：saveKey / reapply / removeKey 落定前自增；异步目录刷新在发起时捕获，
   * 落定前不一致即丢弃——防止旧 Key 的在飞结果回写新状态（审计 S2/S3）。
   */
  let factsGeneration = 0
  /** 兜底注册失败日志只记一次（每进程）；成功后重置。 */
  let registrationFailureLogged = false

  /** 账号上下文缓存（保存 Key 时从 /v2/accounts 拉取；重启后异步恢复）。 */
  let account: CodeBuddyAccount | undefined

  /**
   * 每请求解析凭据：credentials 缝优先，无缝时整个凭据平面就是进程环境。
   * 引用列表由配置节的 apiKeyEnv 决定（默认对齐官方页面派生名
   * CODEBUDDY_CREDITS_API_KEY），旧引用（CODEBUDDY_API_KEY）兜底——旧版
   * 存过的 Key 不用重配。apiKeyEnv 是 volatile 引用，`.get()` 每次现读最新值。
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
   * 会话积分账本：从**会话事件重放**得到，替代早期的进程内 usageLog（重启清零）。
   * credit 由适配器写进 finish 块的 `replayState.response.usage`（随事件持久化），
   * 故重启后仍可从事件前缀重放；live 会话走内存日志（同步、零 IO），
   * 冷会话（重启后未激活）走 sessionController.inspect 读持久化前缀。
   */
  const ledgers = createLedgerResolver({
    live: (sessionId, cached) => {
      const session = ctx.sessions.get(SessionId(sessionId))
      if (session === undefined) return undefined
      // 增量折叠：只折 cached.asOfSeq 之后的事件（客户端在流式期间高频轮询）。
      return foldSessionCredits(session.snapshotEvents(), cached)
    },
    inspect: async (sessionId) => {
      // sessionController 只随 web-app bundle 加载，故软获取；缺失即降级为
      // 「仅 live 会话准确」。每次调用重新 get：服务是延迟解析的。
      const controller = ctx.get('sessionController') as
        | { inspect(id: unknown): Promise<{ events: readonly SessionEvent[] }> }
        | undefined
      if (controller === undefined) return undefined
      return (await controller.inspect(SessionId(sessionId))).events
    },
  })

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
      // 凭据代际已变化（换/清 Key）：旧账号快照不覆盖新状态（审计 S2）。
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
    // 不再挂 onUsage：记账改由会话事件重放承担（credits-ledger）。适配器把 credit
    // 写进 finish 块的 replayState（随事件持久化），这里再存一份只会重复且重启即失。
    onCatalogRead: () => {
      kickModelRefresh()
    },
    // 图片字节只经官方附件 seam：按官方 CLI 压缩档派生请求版本（总像素预算
    // 2000×2000 + 字节目标，JPEG 质量阶梯由附件服务实现），后端不支持投影时
    // 退回规范化存储字节（协议仍成立，只是跳过缩放）。
    // 0.1.7-rc.1 的 `ImageRequestTarget` 是 { width, height, maxBytes }——像素预算
    // 经官方的 `requestImageDimensions` 换算成保持宽高比的目标尺寸，与官方
    // llm-pi-ai 的用法逐字一致（`packages/llm/llm-pi-ai/src/context.ts:249-251`）。
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
      // 凭据/授权已变化：这次结果属于旧状态，直接丢弃（审计 S2）。
      if (generation !== factsGeneration) return
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

  /**
   * 设置卡「获取可用模型」：手动重扫模型目录。与自动路径**共用上游单飞**，但不受冷却
   * 限制（手动点了就该真的去拉）。只重拉本 provider 的目录并重提自己的 route——registration
   * 由 registerAdapter([PROVIDER]) 创建、replace 只动该 handle 的 owned 集合，不触碰其他 provider。
   */
  async function refreshModelsManually(): Promise<{ changed: boolean; models: readonly CodeBuddyModelFacts[] }> {
    const generation = factsGeneration
    const key = await resolveApiKey()
    const next = await loadFactsOnce(key)
    // 刷新期间凭据被换掉/清空：结果已过期，既不能用它覆盖新状态，也不能据此注册 route（审计 S2/S3）。
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
    // 旧引用 → 主引用迁移（boot 兜底；saveKey 也会做）：官方页面按节根
    // apiKeyEnv join 凭据，迁移后行头圆点即亮绿。每步独立容错——任何一步
    // 失败都不能挡掉后面的 route 注册（此前 unset 可选链/服务解析异常会
    // 整体打断）。
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
    // 官方行头圆点**不再需要**在 boot 期把 apiKeyEnv 物化进 profile：0.1.7 起
    // schema 默认值本身就在官方读取路径上（设置页按节根 apiKeyEnv 解析，
    // `packages/settings/settings/src/index.ts:319` 的 value = 投影后的
    // `plainConfig(entry.fiber.config)`，含 schema 默认），且 provider 行在
    // settingsPath 为空时 `configured` 恒真、`removable` 恒假
    // （`packages/client/ui-settings-models/src/client/store.ts:199-215`）——
    // 物化不改变任何可见状态。旧版遗留的 `providers` 子树也不再清理：rc.1 的
    // 设置写入只接受 volatile 路径，非 schema 字段会直接抛
    // 「Config field "providers" is not volatile」
    // （`packages/settings/settings/src/index.ts:387-389`）；残留键只是普通配置，
    // 不进表单（`packages/settings/settings/src/schema.ts:59-67` 按 schema 投影）。
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

  // 设置卡片路由：Key 的保存、配额查询、状态。删除走官方行头「移除」
  // （整节型 provider 的 settingsPath 为空，官方页面本就不提供「移除」，
  // 凭据清理由本插件的「清空 Key」承担，见 /remove-key）。
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
      // 用户给 Key 的行为 = 对模型目录与账号信息拉取的授权；先验证再落库。
      // 先取账号上下文（best-effort）再拉目录：请求才带对当前 Key 的企业头（审计 S8）。
      await refreshAccountWithKey(key)
      const entries = await fetchCodeBuddyModels(key, account)
      // 作废所有仍用旧 Key 的在飞刷新（审计 S2）。
      factsGeneration += 1
      facts = factsFromEntries(entries)
      const [primary, legacyRef] = keyRefs(config.apiKeyEnv.get())
      await credentials.set(credentialRef(primary), key)
      // 旧引用迁移：老版本存在 CODEBUDDY_API_KEY 下的 Key 挪到主引用并清掉旧值。
      if (legacyRef !== undefined && legacyRef !== primary) {
        const legacy = await credentials.resolve(credentialRef(legacyRef)).catch(() => undefined)
        if (legacy?.value !== undefined) await credentials.unset?.(credentialRef(legacyRef))
      }
      // 官方页面的凭据 join 按节根 apiKeyEnv 解析：把用户当前生效的引用物化到
      // 用户层（apiKeyEnv 是 volatile 字段，rc.1 的设置写入只认 volatile 路径）。
      // 旧版遗留的 providers 子树不再清理——非 schema 字段不可写（同理见 boot 段注释）。
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
      // 清空 Key：所有引用都清掉，模型事实与 route 一并撤回；profile 保留
      // （官方行头圆点转红 = 未配置凭据的官方语义）。被环境遮蔽的引用 unset
      // 会抛错（官方语义：环境提供者优先），逐引用容错。
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
      // 作废所有在飞刷新/账号补拉，防止旧结果回写（审计 S2/S3）。
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
    /** 会话累计积分：从会话事件重放（重启后仍准确）。 */
    async sessionUsage(sessionId) {
      const ledger = await ledgers.for(sessionId)
      return ledger === undefined ? EMPTY_USAGE : sessionViewOf(ledger)
    },
    /** 单轮积分：按事件里的 turn 取用（每轮积分胶囊用）。 */
    async turnUsage(sessionId, turn) {
      const ledger = await ledgers.for(sessionId)
      return ledger === undefined ? EMPTY_USAGE : turnViewOf(ledger, turn)
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
    maxMode: () => config.maxMode.get() === true,
    async setMaxMode(enabled) {
      const settings = ctx.get('settings')
      if (settings === undefined) {
        throw new LlmError(`${name}: 本组合没有设置服务，无法保存 Max 模式`, 'NO_SETTINGS_STORE')
      }
      // maxMode 是 Config 里的 volatile 字段：设置命名空间 = profile 条目 id（NS），
      // 且 rc.1 只接受 volatile 路径的写入（`packages/settings/settings/src/index.ts:387-389`）。
      await settings.mutate(NS, [{ op: 'set', path: ['maxMode'], value: enabled }])
    },
  })

  // 设置面接线（0.1.7 新机制）：表单由本插件导出的 `Config` 投影，`settings` 仍是
  // **可选服务**——`ctx.inject` 起的子级在它缺席时一直挂着，插件其余部分照常运行
  // （不会让 entry 停在 pending，见根 AGENTS《扩展与宿主兼容》）。本插件自带设置
  // 界面（Models 页的 provider 卡片），故关掉按 schema 自动生成的配置页，避免同一
  // 份值在两个界面里编辑（官方 README 原话：
  // `packages/settings/settings/README.zh.md:39`；官方 llm-deepseek 同款写法：
  // `packages/llm/llm-deepseek/src/index.ts:60`）。策略不移除配置读写。
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      `${name}: settings page policy`,
    )
  })
}
