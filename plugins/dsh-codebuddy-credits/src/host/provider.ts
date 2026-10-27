/**
 * provider 注册面：设置页目录、适配器 route、模型发现三处官方注册。
 * 三处都按 DUPLICATE_* 语义只告警跳过本次注册，**不清理其他插件**；其余失败也不裸抛——
 * apply 不能因为一次注册失败就整体停用（provider 与积分面仍可工作）。
 */

import type { Context } from '@deepseek-ai/cordis'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { CodeBuddyAdapter } from '../adapter.js'
import { discoverCodeBuddyModels } from '../catalog.js'
import { warnRegistrationFailure } from '../compat.js'
import type { Config } from '../config.js'
import {
  DISPLAY_NAME,
  IMAGE_REQUEST_POLICY,
  PROVIDER_ID,
  SETTINGS_NAMESPACE,
  STREAM_IDLE_TIMEOUT_MS,
} from '../constants.js'
import type { AccountStore } from './account.js'
import type { Credentials } from './credentials.js'
import type { ModelFactsStore } from './models.js'

export interface ProviderRoutes {
  /** Key 可用即注册 route（模型目录可后补）；Key 移除即撤回。 */
  ensure(want: boolean): void
  /** 无条件补注册（手动重扫后 route 曾被 boot 异常漏掉时用）。 */
  ensureRegistered(): void
  isRegistered(): boolean
  /** 同一 route 集重提交（事实变化时通知宿主重建目录）。 */
  republish(): void
}

export interface ProviderHost {
  routes: ProviderRoutes
  /** /status 的 ensureModels：目录为空补拉 + route 兜底注册（失败本进程只记一次）。 */
  ensureModelsForStatus(): void
  /** 启动：环境 Key 可见即注册；凭据库的 Key 异步检查后迁移、补账号、注册 route（best-effort）。 */
  start(): void
}

export interface ProviderDeps {
  models: ModelFactsStore
  account: AccountStore
  credentials: Credentials
  /** 宿主读取本适配器模型目录时（选择器建目录）触发节流后台刷新。 */
  onCatalogRead(): void
}

export function installProvider(ctx: Context, config: Config, deps: ProviderDeps): ProviderHost {
  const adapter = new CodeBuddyAdapter({
    models: () => deps.models.list(),
    resolveApiKey: deps.credentials.resolveApiKey,
    account: () => deps.account.current(),
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    maxMode: () => config.maxMode.get() === true,
    // 不在这里记账：credit 由适配器写进 finish 块的 replayState，积分从会话事件重放
    // （credits-ledger）；这里再存一份只会重复且重启即失。
    onCatalogRead: deps.onCatalogRead,
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

  let registration: AdapterRegistrationHandle | undefined
  let registered = false
  /** 兜底注册失败日志只记一次（每进程）；成功后重置。 */
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

  // 目录条目始终注册：设置页 provider 行是 Key 的配置入口（client 在行上挂输入卡）。
  try {
    ctx.llm.registerConfigurableProviders([
      { provider: PROVIDER_ID, displayName: DISPLAY_NAME, settingsNs: SETTINGS_NAMESPACE, settingsPath: [] },
    ])
  } catch (error) {
    warnRegistrationFailure(ctx, SETTINGS_NAMESPACE, '设置页 provider 目录', error)
  }

  // 模型发现：draft 请求自带凭据时直接用；否则回退到已配置的凭据。
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
      // 状态读取是自愈入口：目录为空补拉、route 未注册（boot 异常被打断过）则补注册——
      // 此处只在 keyConfigured 时被调用，注册安全。
      deps.models.ensure()
      if (registered) return
      try {
        ensure(true)
        registrationFailureLogged = false
      } catch (error) {
        // 日志防刷：同一失败每进程只记一次；成功后再失败会重新记（状态接口的 active 字段供诊断）。
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
        // 旧引用 → 主引用迁移（boot 兜底；save 也会做）：迁移后官方行头圆点即亮绿。
        await deps.credentials.migrateLegacy()
        await deps.account.refresh(key)
        // Key 可用即注册 route——模型目录可后补（选择器建目录/状态读取会补拉）。
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
