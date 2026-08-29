/** dsh-prefix-completion host half：POST /api/prefix-completion/complete，转发 DeepSeek 对话前缀续写（Beta）。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import {
  buildChatPrefixMessages, extractSuggestions, isAbortTimeout, normalizeConfig, parseCompleteBody,
  summarizeUpstreamBody, upstreamStatusToError, type CompleteRequest, type PrefixCompletionConfig, type PrefixCompletionError,
} from './prefix-completion.js'

export type { CompleteRequest } from './prefix-completion.js'

export const name = 'dsh-prefix-completion'
export const inject = ['webServer', 'sessions', 'credentials']

export type { PrefixCompletionConfig, PrefixCompletionError }

const ROUTE_PATH = '/api/prefix-completion/complete'

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function sendError(res: ServerResponse, status: number, error: PrefixCompletionError): void {
  sendJson(res, status, { error })
}

async function readRequestBody(req: IncomingMessage, maxBodyBytes: number): Promise<{ ok: true; body: string } | { ok: false; error: PrefixCompletionError }> {
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
    abort(new DOMException('Prefix completion request timed out', 'TimeoutError'))
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
export function apply(ctx: Context, config: Readonly<Partial<PrefixCompletionConfig>> = {}): void {
  const settings = normalizeConfig(config)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendError(res, 405, { code: 'BAD_BODY', message: '只接受 POST /api/prefix-completion/complete' })
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

      const messages = buildChatPrefixMessages(session.deriveMessages() as readonly unknown[], parsed.prompt)
      const upstreamBody = {
        model: settings.model,
        messages,
        max_tokens: settings.maxTokens,
      }
      const signal = requestSignal(res, settings.requestTimeoutMs)
      try {
        const upstream = await fetch(`${settings.baseURL.replace(/\/$/u, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${credential.value}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(upstreamBody),
          signal: signal.signal,
        })
        const upstreamText = await upstream.text()
        if (!upstream.ok) {
          sendError(res, 502, upstreamStatusToError(upstream.status, upstreamText))
          return
        }
        let data: unknown
        try {
          data = JSON.parse(upstreamText)
        } catch {
          sendError(res, 502, { code: 'UPSTREAM_ERROR', message: 'DeepSeek 对话前缀续写上游返回了非法 JSON' })
          return
        }
        const suggestions = extractSuggestions(data)
        if (suggestions.length === 0) {
          sendError(res, 502, { code: 'UPSTREAM_ERROR', message: 'DeepSeek 对话前缀续写上游没有返回可用候选' })
          return
        }
        sendJson(res, 200, { suggestions })
      } catch (error) {
        if (isAbortTimeout(signal.signal)) {
          sendError(res, 504, { code: 'TIMEOUT', message: 'DeepSeek 对话前缀续写上游超时' })
        } else if (signal.signal.aborted) {
          // 客户端已断开；响应写不写都无所谓，但要避免悬挂。
          if (!res.headersSent) res.destroy()
        } else {
          const message = error instanceof Error ? error.message : String(error)
          sendError(res, 502, {
            code: 'UPSTREAM_ERROR',
            message: `对话前缀续写上游请求失败：${summarizeUpstreamBody(message)}`,
          })
        }
      } finally {
        signal.dispose()
      }
    },
  }), 'dsh-prefix-completion: /api/prefix-completion/complete route')
}
