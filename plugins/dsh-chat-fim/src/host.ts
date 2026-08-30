/** dsh-chat-fim host half：POST /api/chat-fim/complete，转发 DeepSeek FIM 补全（Beta）。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import {
  buildFimPrompt, extractSuggestions, fimStopSequences, isAbortTimeout, isDeepseekMainRoute,
  mainRouteFromSession, normalizeConfig, parseCompleteBody, resolveFimModel, summarizeUpstreamBody,
  upstreamStatusToError, type ChatFimConfig, type ChatFimError, type CompleteRequest,
} from './chat-fim.js'

export type { CompleteRequest } from './chat-fim.js'

export const name = 'dsh-chat-fim'
export const inject = ['webServer', 'sessions', 'credentials']

export type { ChatFimConfig, ChatFimError }

const ROUTE_PATH = '/api/chat-fim/complete'

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
 * host half 入口：注册路由，所有副作用都挂在 apply 的 effect 上。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ChatFimConfig>> = {}): void {
  const settings = normalizeConfig(config)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (req.method === 'GET') {
        // 状态查询：主模型是否支持（deepseek 系列）。客户端据此整体隐藏开关。
        const url = new URL(req.url ?? '/', 'http://localhost')
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
        const status = parsed.code === 'INVALID_PROMPT' ? 400 : 400
        sendError(res, status, parsed)
        return
      }

      const sessionId = SessionId(parsed.sessionId)
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
      const prompt = buildFimPrompt(session.deriveMessages() as readonly unknown[], parsed.prompt, language)
      const stop = fimStopSequences(language)
      // 补全模型跟随主模型（pro/flash），vision 或未知主模型回退配置默认。
      const fimModel = resolveFimModel(main, settings.model)
      const signal = requestSignal(res, settings.requestTimeoutMs)
      try {
        // FIM 接口没有 n 参数：多建议用并行请求 + 温度错开采样；部分失败保留成功建议。
        const results = await Promise.allSettled(
          Array.from({ length: settings.suggestionCount }, async (_, index) => {
            const temperature = settings.suggestionCount > 1
              ? Math.min(2, settings.temperature + index * 0.4)
              : settings.temperature
            const upstream = await fetch(`${settings.baseURL.replace(/\/$/u, '')}/completions`, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${credential.value}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: fimModel,
                prompt,
                max_tokens: settings.maxTokens,
                stop,
                temperature,
              }),
              signal: signal.signal,
            })
            const upstreamText = await upstream.text()
            if (!upstream.ok) {
              throw upstreamStatusToError(upstream.status, upstreamText)
            }
            let data: unknown
            try {
              data = JSON.parse(upstreamText)
            } catch {
              throw { code: 'UPSTREAM_ERROR', message: 'DeepSeek FIM 上游返回了非法 JSON' } satisfies ChatFimError
            }
            return extractSuggestions(data)
          }),
        )
        const seen = new Set<string>()
        const suggestions: string[] = []
        let firstError: ChatFimError | undefined
        for (const result of results) {
          if (result.status === 'fulfilled') {
            for (const suggestion of result.value) {
              if (!seen.has(suggestion)) {
                seen.add(suggestion)
                suggestions.push(suggestion)
              }
            }
            continue
          }
          const reason = result.reason
          if (firstError !== undefined) continue
          firstError = typeof reason === 'object' && reason !== null && 'code' in reason && 'message' in reason
            ? reason as ChatFimError
            : { code: 'UPSTREAM_ERROR', message: reason instanceof Error ? reason.message : String(reason) }
        }
        if (suggestions.length === 0) {
          sendError(res, 502, firstError ?? { code: 'UPSTREAM_ERROR', message: 'DeepSeek FIM 上游没有返回可用候选' })
          return
        }
        sendJson(res, 200, { suggestions })
      } catch (error) {
        if (isAbortTimeout(signal.signal)) {
          sendError(res, 504, { code: 'TIMEOUT', message: 'DeepSeek FIM 上游超时' })
        } else if (signal.signal.aborted) {
          // 客户端已断开；响应写不写都无所谓，但要避免悬挂。
          if (!res.headersSent) res.destroy()
        } else if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
          sendError(res, 502, error as ChatFimError)
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
  }), 'dsh-chat-fim: /api/chat-fim/complete route')
}
