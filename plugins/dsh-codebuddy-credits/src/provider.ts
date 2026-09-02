/**
 * 构建 CodeBuddy 的 pi-ai Provider。
 * 认证走 harness 自己的 api-key 方法（凭据已由适配层解析，密钥不落 provider 存储）；
 * 官方请求标识（user-agent）在 provider 流式入口包装注入——它是 DSH attribution
 * 的保留名，profile.headers 无法覆盖，而 CodeBuddy 服务端会拒绝非官方标识的请求。
 */

import { createProvider } from '@earendil-works/pi-ai'
import type { Api, ApiKeyAuth, Model, Provider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { BASE_URL, DISPLAY_NAME, OFFICIAL_USER_AGENT, PROVIDER } from './constants.js'

/**
 * Harness 自解析凭据的 api-key 认证方法（与官方 llm-pi-ai 的 harnessApiKeyAuth 同构）。
 * 无 key 时交给协议层按「未配置」处理：路由命名了凭据引用而解析失败时，
 * 适配层已先以 MISSING_CREDENTIAL 拒绝请求。
 */
function harnessApiKeyAuth(): ApiKeyAuth {
  return {
    name: DISPLAY_NAME,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: DISPLAY_NAME,
    }),
  }
}

/**
 * 注入官方请求标识：user-agent 恒为官方 CLI 标识，其余头原样保留。
 * options 类型按协议泛型展开（openai-completions 的 ApiStreamOptions 联合），
 * 此处按结构读写、不做泛型收窄——包装层只改 headers，转发语义不变。
 */
function withOfficialIdentity(options: unknown): unknown {
  const base = (options ?? {}) as Record<string, unknown>
  return {
    ...base,
    headers: { ...((base.headers ?? {}) as Record<string, string>), 'user-agent': OFFICIAL_USER_AGENT },
  }
}

/**
 * 构建 provider 并包装流式入口。包装保持原签名与转发语义，仅改写请求头。
 * @param models - 已解析的模型集。
 */
export function buildCodeBuddyProvider(models: Model<Api>[]): Provider {
  const base = createProvider({
    id: PROVIDER,
    name: DISPLAY_NAME,
    baseUrl: BASE_URL,
    auth: { apiKey: harnessApiKeyAuth() },
    models,
    api: openAICompletionsApi(),
  })
  return {
    ...base,
    // 包装层签名与 base 完全一致（原样转发），仅改写 options.headers；
    // 参数类型随 pi-ai 协议泛型展开，此处不做收窄。
    stream: (model: unknown, context: unknown, options: unknown) =>
      base.stream(model as never, context as never, withOfficialIdentity(options) as never),
    streamSimple: (model: unknown, context: unknown, options: unknown) =>
      base.streamSimple(model as never, context as never, withOfficialIdentity(options) as never),
  } as Provider
}
