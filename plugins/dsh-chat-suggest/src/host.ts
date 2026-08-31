/** dsh-chat-suggest host half：POST /api/chat-suggest/complete，转发 DeepSeek 对话前缀续写（Beta）。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import {
  buildFimPrompt, cleanSuggestion, extractSuggestions, extractUsage, speakerStopSequences,
  hasDegenerateRepeat, isAbortTimeout, isDeepseekMainRoute, isHistoryEcho, mainRouteFromSession,
  MAX_UPSTREAM_BODY_BYTES, normalizeConfig, parseCompleteBody, recentHistoryTurns, resolveSuggestModel,
  startsWithHistoryEcho, summarizeUpstreamBody, truncateFirstSentence, upstreamStatusToError,
  type ChatSuggestConfig, type ChatSuggestError, type CompleteRequest,
} from './suggest.js'

export type { CompleteRequest } from './suggest.js'

export const name = 'dsh-chat-suggest'
export const inject = ['webServer', 'sessions', 'credentials']

export type { ChatSuggestConfig, ChatSuggestError }

const ROUTE_PATH = '/api/chat-suggest/complete'
/** 候选全被复读/回声护栏过滤时的重试温度：0.5——比 0.3 更易跳出复读循环，比 0.7 噪声小（0.7 实测相关性弱）。 */
const ECHO_RETRY_TEMPERATURE = 0.5

type DiagnosticKey = 'requests' | 'fulfilled' | 'retries' | 'shown' | 'empty' | 'filteredSpeaker' | 'filteredRepeat' | 'filteredEcho'

/**
 * 进程级诊断计数（status 路由带 ?diagnostics=1 时返回；不持久化、不含任何用户内容，
 * bySession 只记会话 id 不记内容）。「转完圈没出卡片」时先查这里，别盲调参数。
 */
const diagnostics: Record<DiagnosticKey, number> & { bySession: Record<string, Record<DiagnosticKey, number>> } = {
  requests: 0,
  fulfilled: 0,
  retries: 0,
  shown: 0,
  empty: 0,
  filteredSpeaker: 0,
  filteredRepeat: 0,
  filteredEcho: 0,
  bySession: {},
}

/** 累加一个诊断计数（全局 + 按会话分组）。 */
function bumpDiagnostics(key: DiagnosticKey, sessionId: string): void {
  diagnostics[key]++
  let stats = diagnostics.bySession[sessionId]
  if (stats === undefined) {
    stats = { requests: 0, fulfilled: 0, retries: 0, shown: 0, empty: 0, filteredSpeaker: 0, filteredRepeat: 0, filteredEcho: 0 }
    diagnostics.bySession[sessionId] = stats
  }
  stats[key]++
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function sendError(res: ServerResponse, status: number, error: ChatSuggestError): void {
  sendJson(res, status, { error })
}

async function readRequestBody(req: IncomingMessage, maxBodyBytes: number): Promise<{ ok: true; body: string } | { ok: false; error: ChatSuggestError }> {
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

/**
 * host half 入口：注册路由，所有副作用都挂在 apply 的 effect 上。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ChatSuggestConfig>> = {}): void {
  const settings = normalizeConfig(config)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
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
        const main = mainRouteFromSession(session.events)
        sendJson(res, 200, { supported: isDeepseekMainRoute(main) })
        return
      }

      if (req.method !== 'POST') {
        sendError(res, 405, { code: 'BAD_BODY', message: '只接受 POST /api/chat-suggest/complete' })
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
      bumpDiagnostics('requests', sessionKey)
      const session = ctx.sessions.get(sessionId)
      if (session === undefined) {
        sendError(res, 404, {
          code: 'UNKNOWN_SESSION',
          message: '会话不存在或已不在当前进程：请刷新页面后重试',
        })
        return
      }

      // 主模型不是 DeepSeek 系列时禁用（FIM 上游为 DeepSeek 官方能力）。
      const main = mainRouteFromSession(session.events)
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

      const language = parsed.locale === 'en' ? 'en' : 'zh'
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
      // 补全模型三档解析：pro / flash / auto（跟随官方主模型，vision/未知回退配置默认）。
      const suggestModel = resolveSuggestModel(parsed.suggestModelMode, main, settings.model)
      const signal = requestSignal(res, settings.requestTimeoutMs)
      try {
        /** 单次上游补全请求；成功返回候选/用量，失败抛 ChatSuggestError。 */
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
            throw { code: 'UPSTREAM_ERROR', message: 'DeepSeek 续写上游返回了非法 JSON' } satisfies ChatSuggestError
          }
          return { suggestions: extractSuggestions(data), usage: extractUsage(data), temperature }
        }

        const seen = new Set<string>()
        const suggestions: string[] = []
        let totalPromptTokens = 0
        let totalCompletionTokens = 0
        let firstTemperature = settings.temperature
        let firstError: ChatSuggestError | undefined
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
            firstError = typeof reason === 'object' && reason !== null && 'code' in reason && 'message' in reason
              ? reason as ChatSuggestError
              : { code: 'UPSTREAM_ERROR', message: reason instanceof Error ? reason.message : String(reason) }
          }
        }

        // 前缀续写接口没有 n 参数：多建议用并行请求 + 温度错开采样；部分失败保留成功建议。
        absorb(await Promise.allSettled(
          Array.from({ length: settings.suggestionCount }, (_, index) => requestOnce(
            settings.suggestionCount > 1 ? Math.min(2, settings.temperature + index * 0.4) : settings.temperature,
          )),
        ))

        // 候选全被护栏过滤（复读/回声）：升温度重试一次，多数时候能跳出复读循环；
        // 仍无候选则静默返回空建议（客户端不显示错误、不打扰用户）。
        if (suggestions.length === 0 && hadFulfilled) {
          bumpDiagnostics('retries', sessionKey)
          absorb(await Promise.allSettled([requestOnce(ECHO_RETRY_TEMPERATURE)]))
        }
        // 只有上游请求全部失败才报 502。
        if (suggestions.length === 0 && !hadFulfilled) {
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
        if (isAbortTimeout(signal.signal)) {
          sendError(res, 504, { code: 'TIMEOUT', message: 'DeepSeek 续写上游超时' })
        } else if (signal.signal.aborted) {
          // 客户端已断开；响应写不写都无所谓，但要避免悬挂。
          if (!res.headersSent) res.destroy()
        } else if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
          sendError(res, 502, error as ChatSuggestError)
        } else {
          const message = error instanceof Error ? error.message : String(error)
          sendError(res, 502, {
            code: 'UPSTREAM_ERROR',
            message: `FIM 上游请求失败：${summarizeUpstreamBody(message)}`,
          })
        }
      } finally {
        signal.dispose()
      }
    },
  }), 'dsh-chat-suggest: /api/chat-suggest/complete route')
}
