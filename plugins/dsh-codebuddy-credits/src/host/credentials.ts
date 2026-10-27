/**
 * 凭据面：Key 的解析（credentials 缝优先，无缝时回退进程环境）、旧引用迁移、保存 / 重配 / 清空。
 * 凭据**只**经 `ctx.credentials` 落库；本模块只持有引用名，绝不把 Key 写进设置节、日志或响应。
 * 代际（generation）是换 / 清 Key 的唯一信号：异步刷新发起时捕获，落定前不一致即丢弃。
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import { fetchCodeBuddyModels } from '../catalog.js'
import { keyRefs } from '../config.js'
import type { Config } from '../config.js'
import { SETTINGS_NAMESPACE } from '../constants.js'
import type { AccountStore } from './account.js'
import type { ModelFactsStore } from './models.js'
import type { ProviderRoutes } from './provider.js'

export interface CredentialDeps {
  account: AccountStore
  models: ModelFactsStore
  routes: ProviderRoutes
}

export interface Credentials {
  /** 每请求解析：主引用 + 旧引用兜底；`.get()` 每次现读最新值。 */
  resolveApiKey(): Promise<string>
  /** 进程环境里是否已有任一引用（无凭据库时的启动判据）。 */
  ambientKey(): boolean
  hasKey(): Promise<boolean>
  /** boot 兜底迁移：旧引用有值、主引用为空时挪到主引用并清旧值。每步独立容错。 */
  migrateLegacy(): Promise<void>
  /** 保存 Key：先预检服务、先拉目录，失败即不落库（避免存了 Key 却没模型）。 */
  save(key: string): Promise<void>
  /** 幂等重配：用已存 Key 重拉模型目录与账号信息（不写凭据、不写设置）。 */
  reapply(): Promise<void>
  /** 清空 Key：所有引用、模型事实、route 一并撤回；profile 保留。 */
  remove(): Promise<void>
  generation(): number
  /**
   * 晚绑定装配（account / models / routes 依赖本模块的 key 解析与代际，构造期会成环）。
   * 只在 apply 装配阶段调用一次，之后所有操作才可执行。
   */
  bind(deps: CredentialDeps): void
}

export function createCredentials(ctx: Context, name: string, config: Config): Credentials {
  let generation = 0
  let deps: CredentialDeps | undefined

  const requireDeps = (): CredentialDeps => {
    if (deps === undefined) throw new Error(`${name}: 凭据面尚未完成装配`)
    return deps
  }

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

  async function migrateLegacy(): Promise<void> {
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
  }

  async function save(key: string): Promise<void> {
    // 预检两个服务（先于任何写入）：避免 Key 已落库后才因缺服务报错的部分失败。
    const credentials = ctx.get('credentials')
    if (credentials === undefined) {
      throw new LlmError(`${name}: 本组合没有凭据服务，无法保存 Key`, 'NO_CREDENTIAL_STORE')
    }
    const settings = ctx.get('settings')
    if (settings === undefined) {
      throw new LlmError(`${name}: 本组合没有设置服务，无法记录凭据引用`, 'NO_SETTINGS_STORE')
    }
    const { account, models, routes } = requireDeps()
    // 用户给 Key = 对模型目录与账号信息拉取的授权；先取账号上下文（best-effort）再拉目录，
    // 请求才带对当前 Key 的企业头。
    await account.refresh(key)
    const entries = await fetchCodeBuddyModels(key, account.current())
    // 作废所有仍用旧 Key 的在飞刷新。
    generation += 1
    models.set(entries)
    const [primary, legacyRef] = keyRefs(config.apiKeyEnv.get())
    await credentials.set(credentialRef(primary), key)
    // 旧引用迁移：老版本存在 CODEBUDDY_API_KEY 下的 Key 挪到主引用并清掉旧值。
    if (legacyRef !== undefined && legacyRef !== primary) {
      const legacy = await credentials.resolve(credentialRef(legacyRef)).catch(() => undefined)
      if (legacy?.value !== undefined) await credentials.unset?.(credentialRef(legacyRef))
    }
    // 官方页面的凭据 join 按节根 apiKeyEnv 解析：把用户当前生效的引用物化到用户层
    // （apiKeyEnv 是 volatile 字段，设置写入只认 volatile 路径）。旧版遗留的 providers 子树不清理（见 boot 段）。
    await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['apiKeyEnv'], value: primary }])
    routes.ensure(true)
  }

  async function reapply(): Promise<void> {
    // 幂等重配：用已存 Key 重拉模型目录与账号信息（不写凭据、不写设置）。
    const { account, models, routes } = requireDeps()
    const key = await resolveApiKey()
    await account.refresh(key)
    const entries = await fetchCodeBuddyModels(key, account.current())
    generation += 1
    models.set(entries)
    routes.ensure(true)
  }

  async function remove(): Promise<void> {
    // 清空 Key：所有引用都清掉，模型事实与 route 一并撤回；profile 保留（官方行头圆点转红 = 未配置）。
    // 被环境遮蔽的引用 unset 会抛错（官方语义：环境提供者优先），逐引用容错。
    const { account, models, routes } = requireDeps()
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
    generation += 1
    account.reset()
    models.reset()
    routes.ensure(ambientKey())
  }

  return {
    resolveApiKey,
    ambientKey,
    hasKey,
    migrateLegacy,
    save,
    reapply,
    remove,
    generation: () => generation,
    bind(next) { deps = next },
  }
}
