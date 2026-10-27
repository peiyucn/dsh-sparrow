/**
 * 上游契约：错误码与映射、候选 / usage 解析、模型解析（主路由与补全模型）。
 * 纯逻辑；`fetch` / 超时 / 重试等 host 侧编排见 host/upstream.ts。
 */

import type { EpochHeader } from '@deepseek-ai/dsh-session'

/** 上游响应正文读取上限：防止异常上游超大 body 撑爆内存。 */
export const MAX_UPSTREAM_BODY_BYTES = 64 * 1024

export type ChatFimErrorCode =
  | 'BAD_BODY'
  | 'INVALID_PROMPT'
  | 'UNKNOWN_SESSION'
  | 'MISSING_CREDENTIAL'
  | 'MODEL_UNSUPPORTED'
  | 'UNSUPPORTED_HOST'
  | 'UNSUPPORTED_HOST_FORMAT'
  | 'FORBIDDEN'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_CONFIG'

export interface ChatFimError {
  readonly code: ChatFimErrorCode
  readonly message: string
}

/**
 * 是不是本插件自造的 `ChatFimError`：`code` 必须是**字符串**。
 * `DOMException` 同样带 `code`/`message`，但它的 `code` 是数字（`TimeoutError` = 23）且 `JSON.stringify` 得到 `{}`——形状像 ChatFimError，直接塞进 `{error}` 却会把 message 整个丢掉。
 */
export function isChatFimError(value: unknown): value is ChatFimError {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

/** 把上游 HTTP 状态映射为插件错误码。 */
export function upstreamStatusToError(status: number, bodyText: string): ChatFimError {
  if (status === 401 || status === 403) {
    return { code: 'MISSING_CREDENTIAL', message: 'DeepSeek API 凭据无效或无权访问续写接口（Beta）' }
  }
  if (status === 408 || status === 504) {
    return { code: 'TIMEOUT', message: 'DeepSeek 续写上游超时' }
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'DeepSeek 续写上游限流，请稍后重试' }
  }
  const detail = summarizeUpstreamBody(bodyText)
  return {
    code: 'UPSTREAM_ERROR',
    message: detail === '' ? `DeepSeek 续写上游返回 HTTP ${status}` : `DeepSeek 续写上游错误：${detail}`,
  }
}

/** 只截取上游错误正文的短前缀，避免把上游大段内容带回客户端。 */
export function summarizeUpstreamBody(body: string, maxChars = 200): string {
  const compact = body.replace(/\s+/gu, ' ').trim()
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars)}…`
}

/** 从上游 choices 中提取非空候选文本（兼容 chat.completions 的 message.content 与旧 text 字段）。 */
export function extractSuggestions(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return []
  const suggestions: string[] = []
  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null) continue
    const candidate = choice as { text?: unknown; message?: { content?: unknown } }
    const text = typeof candidate.message?.content === 'string'
      ? candidate.message.content
      : candidate.text
    if (typeof text === 'string' && text.trim() !== '' && !suggestions.includes(text)) {
      suggestions.push(text.trim())
    }
  }
  return suggestions
}

/** FIM 端点上实测可用的模型 id；跟随解析只认在此集合内的主模型。 */
export const SUGGEST_MODEL_IDS = ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-v4-flash'] as const

/** 主模型路由：宿主折叠出的最近一次请求 header 的 provider/model——用官方 `session.requestHeader()`（增量折叠、无 TTL）替代遍历 `snapshotEvents()`，省掉每次请求的 O(总事件数) 快照拷贝。
 *  守卫必须保留：live 追加只校验 header 是对象，provider/model 仅 seed 路径校验，折叠出的 config 可能缺字段。 */
export function mainRouteFromHeader(header: EpochHeader | undefined): { provider: string; model: string } | undefined {
  const config = header?.config
  if (typeof config?.provider === 'string' && typeof config.model === 'string') {
    return { provider: config.provider, model: config.model }
  }
  return undefined
}

/** 主模型是否为 DeepSeek 系列（deepseek-official provider）；未知路由默认放行。 */
export function isDeepseekMainRoute(route: { provider: string } | undefined): boolean {
  return route === undefined || route.provider === 'deepseek-official'
}

/** 会话当前主模型：选中投影（pending ?? lastUsed）→ 官方折叠出的最近请求 header → 共享默认模型；全都没有返回 undefined（调用方按「未知 = 放行」处理）。 */
export function currentMainRoute(
  selection: { pending?: { provider: string; model: string } | null; lastUsed?: { provider: string; model: string } | null } | undefined,
  headerRoute: { provider: string; model: string } | undefined,
  defaultModel: { provider: string; model: string } | undefined,
): { provider: string; model: string } | undefined {
  return selection?.pending ?? selection?.lastUsed ?? headerRoute ?? defaultModel
}

/**
 * 补全模型解析：跟随官方主模型（须在 SUGGEST_MODEL_IDS 内，即 FIM 端点实测可用的 id）；vision / 未知 / 非官方 provider 回退插件配置默认。
 */
export function resolveSuggestModel(main: { provider: string; model: string } | undefined, configuredModel: string): string {
  if (main !== undefined && main.provider === 'deepseek-official' && (SUGGEST_MODEL_IDS as readonly string[]).includes(main.model)) {
    return main.model
  }
  return configuredModel
}

/** 从 FIM 上游响应提取 usage；缺失 / 非法字段回退 0（安全默认值）。 */
export function extractUsage(data: unknown): { promptTokens: number; completionTokens: number } {
  const usage = typeof data === 'object' && data !== null
    ? (data as { usage?: unknown }).usage
    : undefined
  const record = typeof usage === 'object' && usage !== null
    ? usage as Record<string, unknown>
    : undefined
  const num = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  return {
    promptTokens: num(record?.prompt_tokens),
    completionTokens: num(record?.completion_tokens),
  }
}

/** 超时错误是否应映射为 TIMEOUT。 */
export function isAbortTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
}
