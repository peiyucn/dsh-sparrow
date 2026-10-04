/** dsh-chat-fim host half：POST /api/chat-fim/complete，转发 DeepSeek 对话前缀续写（Beta）。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { EpochHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import { assertCapabilities, assertHostCompatible, unsupportedStoredFormatReason } from './compat.js'
import { isTrustedBrowserRequest, officialTrustedHosts } from './trust.js'
import {
  buildFimPrompt, cleanSuggestion, currentMainRoute, detectDraftLanguage, extractSuggestions, extractUsage, speakerStopSequences,
  hasDegenerateRepeat, isAbortTimeout, isDeepseekMainRoute, isHistoryEcho, isLanguageConsistent,
  mainRouteFromHeader, MAX_UPSTREAM_BODY_BYTES, normalizeConfig, parseCompleteBody, recentHistoryTurns,
  resolveSuggestModel, startsWithHistoryEcho, summarizeUpstreamBody, truncateFirstSentence, upstreamStatusToError,
  type ChatFimConfig, type ChatFimError, type CompleteRequest,
} from './suggest.js'

export type { CompleteRequest } from './suggest.js'

export const name = 'dsh-chat-fim'
export const inject = ['webServer', 'sessions', 'credentials']

export type { ChatFimConfig, ChatFimError }

const ROUTE_PATH = '/api/chat-fim/complete'
/** 候选全被复读/回声护栏过滤时的重试温度：0.5——比 0.3 更易跳出复读循环，比 0.7 噪声小（0.7 实测相关性弱）。 */
const ECHO_RETRY_TEMPERATURE = 0.5
/** 并行请求温度错开步长（suggestionCount > 1 时生效，步长 0.4 实测多样性足够）。 */
const TEMPERATURE_SPREAD_STEP = 0.4
/** 采样温度上限（DeepSeek API 允许范围 0-2）。 */
const MAX_TEMPERATURE = 2

export type DiagnosticKey = 'requests' | 'fulfilled' | 'retries' | 'shown' | 'empty' | 'filteredSpeaker' | 'filteredRepeat' | 'filteredEcho' | 'filteredLanguage' | 'aborted' | 'timeout' | 'upstreamError'

/** 按会话诊断条目上限：host 进程长期存活，bySession 表必须随会话数有界——超限淘汰最早写入条目（FIFO）。 */
export const MAX_DIAGNOSTIC_SESSIONS = 256

/** 一个会话（或全局）的诊断计数行；`elapsed*` 只在全局行维护。 */
type DiagnosticCounts = Record<DiagnosticKey, number>

function emptyCounts(): DiagnosticCounts {
  return {
    requests: 0,
    fulfilled: 0,
    retries: 0,
    shown: 0,
    empty: 0,
    filteredSpeaker: 0,
    filteredRepeat: 0,
    filteredEcho: 0,
    filteredLanguage: 0,
    aborted: 0,
    timeout: 0,
    upstreamError: 0,
  }
}

/**
 * 进程级诊断计数（status 路由带 ?diagnostics=1 时返回；不持久化、不含任何用户内容，
 * bySession 只记会话 id 不记内容）。「转完圈没出卡片」时先查这里，别盲调参数：
 * `aborted` = 客户端作废（还在打字/切会话），`timeout` = 上游超时，`upstreamError` = 上游报错，
 * `elapsedTotalMs / requests` = 平均耗时，`elapsedMaxMs` = 最慢一次。
 */
const diagnostics: DiagnosticCounts & { bySession: Record<string, DiagnosticCounts>; elapsedTotalMs: number; elapsedMaxMs: number } = {
  ...emptyCounts(),
  bySession: {},
  elapsedTotalMs: 0,
  elapsedMaxMs: 0,
}

/** 在按会话诊断表里累加一次计数；新会话条目使表超上限时先淘汰最早写入的会话（对象键插入序 = FIFO）。 */
export function bumpSessionDiagnostics(
  bySession: Record<string, DiagnosticCounts>,
  sessionId: string,
  key: DiagnosticKey,
  maxSessions = MAX_DIAGNOSTIC_SESSIONS,
): void {
  let stats = bySession[sessionId]
  if (stats === undefined) {
    while (Object.keys(bySession).length >= maxSessions) {
      const oldest = Object.keys(bySession)[0]
      if (oldest === undefined) break
      delete bySession[oldest]
    }
    stats = emptyCounts()
    bySession[sessionId] = stats
  }
  stats[key]++
}

/** 累加一个诊断计数（全局 + 按会话分组）。 */
function bumpDiagnostics(key: DiagnosticKey, sessionId: string): void {
  diagnostics[key]++
  bumpSessionDiagnostics(diagnostics.bySession, sessionId, key)
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function sendError(res: ServerResponse, status: number, error: ChatFimError): void {
  sendJson(res, status, { error })
}

/**
 * 是不是本插件自造的 `ChatFimError`。
 *
 * `code` 必须是**字符串**：`DOMException` 同样带 `code` / `message`，但它的 `code` 是数字
 * （`TimeoutError` = 23），且 `JSON.stringify` 对它是 `{}`（枚举属性为空）——形状像
 * ChatFimError，直接塞进 `{error}` 却会把 message 整个丢掉（实测落盘 body 就是 `{"error":{}}`）。
 * 故这里按「两个字段都是字符串」判，非本插件形状的一律走下面的归一分支拿可读 message。
 */
function isChatFimError(value: unknown): value is ChatFimError {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

async function readRequestBody(req: IncomingMessage, maxBodyBytes: number): Promise<{ ok: true; body: string } | { ok: false; error: ChatFimError }> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > maxBodyBytes) {
        return { ok: false, error: { code: 'BAD_BODY', message: `请求体超过 ${maxBodyBytes} 字节上限` } }
      }
      chunks.push(buffer)
    }
  } catch {
    return { ok: false, error: { code: 'BAD_BODY', message: '读取请求体失败' } }
  }
  return { ok: true, body: Buffer.concat(chunks).toString('utf8') }
}

/** 用客户端断开 + 超时共同 abort 上游请求。 */
function requestSignal(res: ServerResponse, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const abort = (reason: Error): void => {
    if (!controller.signal.aborted) controller.abort(reason)
  }
  const onClose = (): void => {
    abort(new Error('client closed request'))
  }
  res.once('close', onClose)
  const timer = setTimeout(() => {
    abort(new DOMException('FIM request timed out', 'TimeoutError'))
  }, timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      res.off('close', onClose)
    },
  }
}

/**
 * 把「本次上游请求为什么被中止」映射成可直接使用的出口动作。
 *
 * **为什么必须有它**：请求是经 `Promise.allSettled` 收口的（多建议要部分失败容错），
 * 于是超时 / 断开的拒绝**不会冒泡**到外层 `catch`，只留在 settled 结果里。若判定只写在
 * catch 里，那两条分支就是死代码——实测超时返回的是 502 + 空错误体、诊断计数恒 0。
 * 故判定必须**同时**放在 settled 结果这一侧（见 absorb 的 rejected 分支）。
 *
 * 语义与 catch 里的兜底分支逐字一致：超时（上游）→ 504；其余中止 → 客户端断开 → destroy。
 * 正常完成的请求 `aborted` 恒为 false，两条都不命中，返回 undefined。
 * @param signal - 本次请求的合并信号（客户端断开 + 超时）。
 * @returns 中止出口；未中止时 undefined。
 */
function abortedOutcome(signal: AbortSignal): 'timeout' | 'aborted' | undefined {
  if (!signal.aborted) return undefined
  return isAbortTimeout(signal) ? 'timeout' : 'aborted'
}

/**
 * 把一个中止出口记进诊断并写出响应。
 * 超时 → 504 + TIMEOUT；客户端断开 → 销毁响应（人已不在，写什么都收不到，但绝不悬挂）。
 * @param res - 响应对象。
 * @param sessionKey - 诊断用的会话键。
 * @param outcome - {@link abortedOutcome} 给出的出口。
 */
function sendAbortOutcome(res: ServerResponse, sessionKey: string, outcome: 'timeout' | 'aborted'): void {
  bumpDiagnostics(outcome, sessionKey)
  if (outcome === 'timeout') {
    sendError(res, 504, { code: 'TIMEOUT', message: 'DeepSeek 续写上游超时' })
    return
  }
  if (!res.headersSent) res.destroy()
}

/** 限量读取上游响应正文：超过 MAX_UPSTREAM_BODY_BYTES 即取消剩余流，防止异常上游超大 body 撑爆内存。 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        break
      }
    }
  } catch {
    // 读取中断：按已读内容处理。
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8').slice(0, maxBytes)
}

/** 宿主真值格式门（请求期）：header 由宿主给出，不受「插件解析到旧版官方包」影响
 *  （常量探针在 link:/peer 副本场景会读到旧值，故以宿主数据为准）。 */
function hostFormatSupported(header: { readonly version?: unknown } | undefined): boolean {
  return header !== undefined && unsupportedStoredFormatReason([header]) === undefined
}

/**
 * 会话实例级能力探测（根 AGENTS 能力门）：`requestHeader` / `deriveMessages` 是 Session 实例方法，
 * 启动期拿不到实例，只能在请求入口按**宿主真实对象**探测——插件自带的官方包副本在这里不可信
 * （link:/peer 副本场景会自证兼容，见 compat.ts 的同类说明）。缺失即视为不支持的 dsh 版本：
 * GET 隐藏功能、POST 明确报错，不在未知契约上带病运行。
 */
function sessionSurfaceSupported(session: unknown): boolean {
  const candidate = session as { requestHeader?: unknown; deriveMessages?: unknown } | null | undefined
  return typeof candidate?.requestHeader === 'function' && typeof candidate.deriveMessages === 'function'
}

/** 会话当前主模型：modelSelection 投影（选中即生效，不依赖历史事件）→ 官方折叠出的
 *  最近请求 header（`session.requestHeader()`，增量折叠）→ 共享默认模型；服务缺失（旧版 dsh）
 *  逐档 fail-soft。模型一换，开关状态立刻追平。 */
function currentSessionModel(
  ctx: Context,
  session: { requestHeader(): EpochHeader | undefined },
): { provider: string; model: string } | undefined {
  let selection: { lastUsed?: { provider: string; model: string } | null; pending?: { provider: string; model: string } | null } | undefined
  try {
    const projections = ctx.get('sessionProjections') as unknown as {
      stateOf(session: unknown, key: string): { lastUsed?: { provider: string; model: string } | null; pending?: { provider: string; model: string } | null } | undefined
    } | undefined
    selection = projections?.stateOf(session, 'modelSelection')
  } catch {
    // 投影注册表缺失（旧版 dsh）：走事件档。
  }
  let defaultModel: { provider: string; model: string } | undefined
  try {
    const service = ctx.get('agentDefaultModel') as {
      currentSelection?: () => { provider: string; model: string } | undefined
    } | undefined
    const selected = service?.currentSelection?.()
    if (selected !== undefined && typeof selected.provider === 'string' && typeof selected.model === 'string') {
      defaultModel = { provider: selected.provider, model: selected.model }
    }
  } catch {
    // 缺服务：跳过默认档。
  }
  return currentMainRoute(selection, mainRouteFromHeader(session.requestHeader()), defaultModel)
}

/**
 * host half 入口：注册路由，所有副作用都挂在 apply 的 effect 上。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ChatFimConfig>> = {}): void {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：能力面与会话格式缺任一即整个停用。
  assertHostCompatible(ctx, name)
  assertCapabilities(ctx, name, [
    { name: 'webServer.register', ok: typeof ctx.webServer?.register === 'function' },
    { name: 'sessions.get', ok: typeof ctx.sessions?.get === 'function' },
    { name: 'credentials.resolve', ok: typeof ctx.credentials?.resolve === 'function' },
  ])
  const settings = normalizeConfig(config)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      // 信任栅栏（先于一切路由分发）：官方那道门只装在它自己的 `/api` 前缀路由上，
      // 本插件的 exact 路由不会经过它（见 trust.ts）。POST 会以服务端 API key 执行
      // **计费**上游请求，GET 会读出会话模型信息，故整条路由一律先过门。
      // 额外信任面复用官方 webRuntime.trustedHosts（LAN 部署与官方同一份口径）。
      if (!isTrustedBrowserRequest(req.headers, officialTrustedHosts(ctx))) {
        sendError(res, 403, { code: 'FORBIDDEN', message: '拒绝非本机同源的请求' })
        return
      }

      if (req.method === 'GET') {
        // 状态查询：主模型是否支持（deepseek 系列）。客户端据此整体隐藏开关。
        const url = new URL(req.url ?? '/', 'http://localhost')
        // 诊断查询：返回护栏丢弃计数（无用户内容），用于「转完圈没出卡片」排查。
        if (url.searchParams.get('diagnostics') === '1') {
          sendJson(res, 200, diagnostics)
          return
        }
        const sessionIdRaw = url.searchParams.get('sessionId') ?? ''
        const session = ctx.sessions.get(SessionId(sessionIdRaw))
        if (session === undefined) {
          sendError(res, 404, {
            code: 'UNKNOWN_SESSION',
            message: '会话不存在或已不在当前进程：请刷新页面后重试',
          })
          return
        }
        // 宿主真值格式门（请求期）：header 由宿主给出，不受插件依赖副本影响。
        if (!hostFormatSupported(session.header)) {
          sendJson(res, 200, { supported: false })
          return
        }
        if (!sessionSurfaceSupported(session)) {
          sendJson(res, 200, { supported: false })
          return
        }
        const main = currentSessionModel(ctx, session)
        sendJson(res, 200, { supported: isDeepseekMainRoute(main) })
        return
      }

      if (req.method !== 'POST') {
        sendError(res, 405, { code: 'BAD_BODY', message: '只接受 POST /api/chat-fim/complete' })
        return
      }

      const read = await readRequestBody(req, settings.maxBodyBytes)
      if (!read.ok) {
        sendError(res, 400, read.error)
        return
      }

      const parsed = parseCompleteBody(read.body, settings.maxBodyBytes, settings.maxPromptChars)
      if ('code' in parsed) {
        sendError(res, 400, parsed)
        return
      }

      const sessionId = SessionId(parsed.sessionId)
      const sessionKey = String(sessionId)
      /** 本次请求起点（诊断耗时用）。 */
      const startedAt = Date.now()
      bumpDiagnostics('requests', sessionKey)
      const session = ctx.sessions.get(sessionId)
      if (session === undefined) {
        sendError(res, 404, {
          code: 'UNKNOWN_SESSION',
          message: '会话不存在或已不在当前进程：请刷新页面后重试',
        })
        return
      }
      // 宿主真值格式门（请求期）：事件语义不认识就不发上游请求。
      if (!hostFormatSupported(session.header)) {
        sendError(res, 501, {
          code: 'UNSUPPORTED_HOST_FORMAT',
          message: '当前 dsh 的会话格式与本插件不兼容，续写功能已停用（升级插件后自动恢复）',
        })
        return
      }

      // 会话实例能力门：缺 requestHeader/deriveMessages 即不支持的 dsh 版本（见 sessionSurfaceSupported）。
      if (!sessionSurfaceSupported(session)) {
        sendError(res, 501, {
          code: 'UNSUPPORTED_HOST',
          message: '当前 dsh 版本缺少续写所需的会话接口，续写功能已停用（升级插件后自动恢复）',
        })
        return
      }

      // 主模型不是 DeepSeek 系列时禁用（FIM 上游为 DeepSeek 官方能力）。
      const main = currentSessionModel(ctx, session)
      if (!isDeepseekMainRoute(main)) {
        sendError(res, 403, {
          code: 'MODEL_UNSUPPORTED',
          message: `当前主模型 ${main?.provider ?? '?'}/${main?.model ?? '?'} 不是 DeepSeek 系列，续写功能已禁用`,
        })
        return
      }

      let credential
      try {
        credential = await ctx.credentials.resolve(credentialRef(settings.apiKeyEnv))
      } catch {
        sendError(res, 500, { code: 'INVALID_CONFIG', message: '续写 apiKeyEnv 配置不是合法的凭据引用' })
        return
      }
      if (credential === undefined) {
        sendError(res, 401, { code: 'MISSING_CREDENTIAL', message: `缺少凭据 ${settings.apiKeyEnv}` })
        return
      }

      // 续写语言跟随草稿内容（草稿英文→英文标签续写，中文→中文），不跟随界面语言（见 suggest.ts detectDraftLanguage）。
      const language = detectDraftLanguage(parsed.prompt)
      const history = session.deriveMessages() as readonly unknown[]
      // FIM 转写体 prompt：最近历史转说话人文本 + 「用户：草稿」结尾（见 suggest.ts buildFimPrompt）。
      const prompt = buildFimPrompt(history, parsed.prompt, language)
      // 回声判定的历史文本集（与 prompt 同一窗口）：
      // 用户消息按「开头 10 字前缀」比对（整段复读用户原话时开头即重叠；中段复用措辞不误杀），
      // 助手消息按「15 字窗口」比对（转述讨论内容如 cleanSuggestion 仍拦得住，正常措辞复用放行）。
      const historyTurns = recentHistoryTurns(history)
      const userEchoTexts = historyTurns.filter(turn => turn.role === 'user').map(turn => turn.text)
      const assistantEchoTexts = historyTurns.filter(turn => turn.role === 'assistant').map(turn => turn.text)
      const stop = speakerStopSequences(language)
      // 补全模型解析：跟随官方主模型，vision / 未知 / 非官方回退配置默认。
      const suggestModel = resolveSuggestModel(main, settings.model)
      const signal = requestSignal(res, settings.requestTimeoutMs)
      try {
        /** 单次上游补全请求；成功返回候选/用量，失败抛 ChatFimError。 */
        const requestOnce = async (temperature: number) => {
          const upstream = await fetch(`${settings.baseURL.replace(/\/$/u, '')}/completions`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${credential.value}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: suggestModel,
              prompt,
              max_tokens: settings.maxTokens,
              stop,
              temperature,
            }),
            signal: signal.signal,
          })
          const upstreamText = await readBoundedText(upstream, MAX_UPSTREAM_BODY_BYTES)
          if (!upstream.ok) {
            throw upstreamStatusToError(upstream.status, upstreamText)
          }
          let data: unknown
          try {
            data = JSON.parse(upstreamText)
          } catch {
            throw { code: 'UPSTREAM_ERROR', message: 'DeepSeek 续写上游返回了非法 JSON' } satisfies ChatFimError
          }
          return { suggestions: extractSuggestions(data), usage: extractUsage(data), temperature }
        }

        const seen = new Set<string>()
        const suggestions: string[] = []
        let totalPromptTokens = 0
        let totalCompletionTokens = 0
        let firstTemperature = settings.temperature
        let firstError: ChatFimError | undefined
        let hadFulfilled = false

        /** 把一批上游结果经护栏清洗进候选列表（说话人标记剥离、复读/回声丢弃、去重）。 */
        const absorb = (results: Array<PromiseSettledResult<Awaited<ReturnType<typeof requestOnce>>>>): void => {
          for (const result of results) {
            if (result.status === 'fulfilled') {
              hadFulfilled = true
              bumpDiagnostics('fulfilled', sessionKey)
              if (suggestions.length === 0) firstTemperature = result.value.temperature
              totalPromptTokens += result.value.usage.promptTokens
              totalCompletionTokens += result.value.usage.completionTokens
              for (const suggestion of result.value.suggestions) {
                // 按说话人标记截断 + 角色切换丢弃（API stop 实测不可靠，见 suggest.ts 注释）。
                const clean = cleanSuggestion(suggestion, language)
                if (clean === null) {
                  bumpDiagnostics('filteredSpeaker', sessionKey)
                  continue
                }
                if (seen.has(clean)) continue
                // 语言一致性：草稿纯拉丁时建议不得含中文（实测 please 后空格模型续中文，见 suggest.ts）。
                if (!isLanguageConsistent(parsed.prompt, clean)) {
                  bumpDiagnostics('filteredLanguage', sessionKey)
                  continue
                }
                // 护栏：同一短语循环复读 → 丢弃；开头复述用户消息（10 字前缀）或
                // 窗口转述助手消息（15 字）→ 丢弃。
                if (hasDegenerateRepeat(clean)) {
                  bumpDiagnostics('filteredRepeat', sessionKey)
                  continue
                }
                if (startsWithHistoryEcho(clean, userEchoTexts, 10) || isHistoryEcho(clean, assistantEchoTexts, 15)) {
                  bumpDiagnostics('filteredEcho', sessionKey)
                  continue
                }
                // 单句截断：续写只给一句，连续续写靠 Tab 链（见 suggest.ts truncateFirstSentence）。
                const short = truncateFirstSentence(clean)
                if (short === '' || seen.has(short)) continue
                seen.add(short)
                suggestions.push(short)
              }
              continue
            }
            const reason = result.reason
            if (firstError !== undefined) continue
            // 中止（超时 / 客户端断开）不是「上游报错」：它的出口是 504 / destroy，
            // 由下面 abortedOutcome 的短路处理，故不当候选错误记（否则会和 502 抢出口）。
            if (abortedOutcome(signal.signal) !== undefined) continue
            firstError = isChatFimError(reason)
              ? reason
              : { code: 'UPSTREAM_ERROR', message: reason instanceof Error ? reason.message : String(reason) }
          }
        }

        // 前缀续写接口没有 n 参数：多建议用并行请求 + 温度错开采样；部分失败保留成功建议。
        absorb(await Promise.allSettled(
          Array.from({ length: settings.suggestionCount }, (_, index) => requestOnce(
            settings.suggestionCount > 1 ? Math.min(MAX_TEMPERATURE, settings.temperature + index * TEMPERATURE_SPREAD_STEP) : settings.temperature,
          )),
        ))

        // 客户端断开（人已不在）：结果没人接收，直接销毁避免悬挂。
        // 刻意与下面的超时出口分开判——断开无需再问「有没有候选」。
        // 这条短路也挡住了断开后的那次「升温度重试」（信号已中止，重试必然白跑）。
        const disconnected = abortedOutcome(signal.signal)
        if (disconnected === 'aborted') {
          sendAbortOutcome(res, sessionKey, 'aborted')
          return
        }

        // 候选全被护栏过滤（复读/回声）：升温度重试一次，多数时候能跳出复读循环；
        // 仍无候选则静默返回空建议（客户端不显示错误、不打扰用户）。
        if (suggestions.length === 0 && hadFulfilled) {
          bumpDiagnostics('retries', sessionKey)
          absorb(await Promise.allSettled([requestOnce(ECHO_RETRY_TEMPERATURE)]))
          // 重试期间客户端断开：结果同样没人要，按断开出口收场。
          if (abortedOutcome(signal.signal) === 'aborted') {
            sendAbortOutcome(res, sessionKey, 'aborted')
            return
          }
        }
        // 只有上游请求全部失败（一个 fulfilled 都没有）才报错。
        if (suggestions.length === 0 && !hadFulfilled) {
          // 「全失败」分两种，靠 firstError 区分（absorb 已把中止类拒绝排除在 firstError 之外）：
          //   · firstError 有值 = 上游**真报错**（429/500/非法 JSON…）→ 502 带那个可操作的原因；
          //   · firstError 为空 + 信号超时 = 单纯超时、无任何可用结果 → 504。
          // 位置很关键：必须在「有候选就照常返回」之后，否则 suggestionCount>1 时
          // 「一个请求超时、另一个已拿到候选」会被误报 504 并丢掉到手候选（实测踩到过）。
          // 为什么不能只靠外层 catch：请求经 allSettled 收口，超时的拒绝不冒泡，
          // 判定若不放在这里就一直不可达（原缺陷：超时返回 502 + 空错误体、诊断恒 0）。
          if (firstError === undefined && abortedOutcome(signal.signal) === 'timeout') {
            sendAbortOutcome(res, sessionKey, 'timeout')
            return
          }
          // 上游真报错（429/500/非法 JSON…）也要记进诊断：这条路同样**不冒泡**到 catch，
          // 不在这里 bump 的话 `upstreamError` 对它恒为 0 —— 与上面 timeout 那条同一类缺陷
          // （诊断口径见文件头：「转完圈没出卡片」时先查这三个计数）。
          if (firstError !== undefined) bumpDiagnostics('upstreamError', sessionKey)
          sendError(res, 502, firstError ?? { code: 'UPSTREAM_ERROR', message: 'DeepSeek 续写上游没有返回可用候选' })
          return
        }
        if (suggestions.length === 0) bumpDiagnostics('empty', sessionKey)
        else bumpDiagnostics('shown', sessionKey)
        sendJson(res, 200, {
          suggestions,
          model: suggestModel,
          temperature: firstTemperature,
          usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
        })
      } catch (error) {
        // 兜底：正常路径的中止已由上面的出口接走，但**非** allSettled 包住的步骤
        // （凭据解析、会话折叠、prompt 构造等）若因中止抛错，仍从这里出水——
        // 故这两条分支保留且可达（区别只是它对中止的覆盖不再是唯一的一道）。
        const outcome = abortedOutcome(signal.signal)
        if (outcome !== undefined) {
          sendAbortOutcome(res, sessionKey, outcome)
        } else if (isChatFimError(error)) {
          bumpDiagnostics('upstreamError', sessionKey)
          sendError(res, 502, error)
        } else {
          bumpDiagnostics('upstreamError', sessionKey)
          const message = error instanceof Error ? error.message : String(error)
          sendError(res, 502, {
            code: 'UPSTREAM_ERROR',
            message: `FIM 上游请求失败：${summarizeUpstreamBody(message)}`,
          })
        }
      } finally {
        // 单次请求耗时（含被作废的）：慢上游是「转完圈没出卡片」的常见原因，记下来别盲调参数。
        const elapsed = Date.now() - startedAt
        diagnostics.elapsedTotalMs += elapsed
        if (elapsed > diagnostics.elapsedMaxMs) diagnostics.elapsedMaxMs = elapsed
        signal.dispose()
      }
    },
  }), 'dsh-chat-fim: /api/chat-fim/complete route')
}
