

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

  resolveApiKey(): Promise<string>

  ambientKey(): boolean
  hasKey(): Promise<boolean>

  migrateLegacy(): Promise<void>

  save(key: string): Promise<void>

  reapply(): Promise<void>

  remove(): Promise<void>
  generation(): number

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

    const credentials = ctx.get('credentials')
    if (credentials === undefined) {
      throw new LlmError(`${name}: 本组合没有凭据服务，无法保存 Key`, 'NO_CREDENTIAL_STORE')
    }
    const settings = ctx.get('settings')
    if (settings === undefined) {
      throw LlmError.fromFailure({ message: `${name}: 本组合没有设置服务，无法记录凭据引用`, code: 'NO_SETTINGS_STORE' })
    }
    const { account, models, routes } = requireDeps()


    await account.refresh(key)
    const entries = await fetchCodeBuddyModels(key, account.current())

    generation += 1
    models.set(entries)
    const [primary, legacyRef] = keyRefs(config.apiKeyEnv.get())
    await credentials.set(credentialRef(primary), key)

    if (legacyRef !== undefined && legacyRef !== primary) {
      const legacy = await credentials.resolve(credentialRef(legacyRef)).catch(() => undefined)
      if (legacy?.value !== undefined) await credentials.unset?.(credentialRef(legacyRef))
    }


    await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['apiKeyEnv'], value: primary }])
    routes.ensure(true)
  }

  async function reapply(): Promise<void> {

    const { account, models, routes } = requireDeps()
    const key = await resolveApiKey()
    await account.refresh(key)
    const entries = await fetchCodeBuddyModels(key, account.current())
    generation += 1
    models.set(entries)
    routes.ensure(true)
  }

  async function remove(): Promise<void> {


    const { account, models, routes } = requireDeps()
    const credentials = ctx.get('credentials')
    const unset = credentials?.unset
    if (credentials !== undefined && typeof unset === 'function') {
      for (const ref of keyRefs(config.apiKeyEnv.get())) {
        try {
          await unset.call(credentials, credentialRef(ref))
        } catch {

        }
      }
    }

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
