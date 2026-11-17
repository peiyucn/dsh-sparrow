

import type { Context } from '@deepseek-ai/cordis'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { CodeBuddyAdapter } from '../adapter.js'
import { discoverCodeBuddyModels } from '../catalog.js'
import { warnRegistrationFailure } from '../compat.js'
import type { Config } from '../config.js'
import {
  DISPLAY_NAME,
  IMAGE_FACTS_WAIT_MS,
  IMAGE_REQUEST_POLICY,
  PROVIDER_ID,
  SETTINGS_NAMESPACE,
  STREAM_IDLE_TIMEOUT_MS,
} from '../constants.js'
import type { AccountStore } from './account.js'
import type { Credentials } from './credentials.js'
import type { ModelFactsStore } from './models.js'

export interface ProviderRoutes {

  ensure(want: boolean): void

  ensureRegistered(): void
  isRegistered(): boolean

  republish(): void
}

export interface ProviderHost {
  routes: ProviderRoutes

  ensureModelsForStatus(): void

  start(): void
}

export interface ProviderDeps {
  models: ModelFactsStore
  account: AccountStore
  credentials: Credentials

  onCatalogRead(): void
}

export function installProvider(ctx: Context, config: Config, deps: ProviderDeps): ProviderHost {
  const adapter = new CodeBuddyAdapter({
    models: () => deps.models.list(),

    awaitModels: () => deps.models.ready(IMAGE_FACTS_WAIT_MS),
    resolveApiKey: deps.credentials.resolveApiKey,
    account: () => deps.account.current(),
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    maxMode: () => config.maxMode.get() === true,
    autoAdapt: () => config.autoAdapt.get() === true,


    onCatalogRead: deps.onCatalogRead,


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

  let registration: AdapterRegistrationHandle | undefined
  let registered = false

  let registrationFailureLogged = false

  function ensure(want: boolean): void {
    if (want === registered) return
    if (want) {
      if (registration === undefined) registration = ctx.llm.registerAdapter([PROVIDER_ID], adapter)
      else registration.replace([PROVIDER_ID])
      registered = true
    } else if (registration !== undefined) {
      registration.replace([])
      registered = false
    }
  }


  try {
    ctx.llm.registerConfigurableProviders([
      { provider: PROVIDER_ID, displayName: DISPLAY_NAME, settingsNs: SETTINGS_NAMESPACE, settingsPath: [] },
    ])
  } catch (error) {
    warnRegistrationFailure(ctx, SETTINGS_NAMESPACE, '设置页 provider 目录', error)
  }


  try {
    ctx.llm.registerModelDiscovery(SETTINGS_NAMESPACE, async (request, signal) => {
      const apiKey = typeof request.apiKey === 'string' && request.apiKey.length > 0
        ? request.apiKey
        : await deps.credentials.resolveApiKey()
      return discoverCodeBuddyModels(apiKey, deps.account.current(), signal)
    })
  } catch (error) {
    warnRegistrationFailure(ctx, SETTINGS_NAMESPACE, '模型发现', error)
  }

  return {
    routes: {
      ensure,
      ensureRegistered: () => ensure(true),
      isRegistered: () => registered,
      republish() {
        if (registered && registration !== undefined) registration.replace([PROVIDER_ID])
      },
    },
    ensureModelsForStatus() {


      deps.models.ensure()
      if (registered) return
      try {
        ensure(true)
        registrationFailureLogged = false
      } catch (error) {

        if (!registrationFailureLogged) {
          registrationFailureLogged = true
          ctx.logger.warn(`${SETTINGS_NAMESPACE}: 状态读取兜底注册失败（本进程只记一次）`)
          ctx.logger.warn(error)
        }
      }
    },
    start() {
      try {
        ensure(deps.credentials.ambientKey())
      } catch (error) {
        warnRegistrationFailure(ctx, SETTINGS_NAMESPACE, 'provider 路由', error)
      }
      void (async () => {
        let key: string
        try {
          key = await deps.credentials.resolveApiKey()
        } catch {
          return
        }

        await deps.credentials.migrateLegacy()
        await deps.account.refresh(key)

        try {
          ensure(true)
        } catch (error) {
          warnRegistrationFailure(ctx, SETTINGS_NAMESPACE, 'provider 路由', error)
        }
        deps.models.kick()
      })()
    },
  }
}
