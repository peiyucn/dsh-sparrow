

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import { COMPLETE_ROUTE_PATH } from '../constants.js'
import { isTrustedBrowserRequest, officialTrustedHosts } from '../trust.js'
import {
  buildFimPrompt, detectDraftLanguage, isDeepseekMainRoute, recentHistoryTurns, resolveSuggestModel,
  speakerStopSequences,
} from '../suggest.js'
import type { ChatFimConfig } from '../config.js'
import { isChatFimError, summarizeUpstreamBody, type ChatFimError } from '../upstream.js'
import { bumpDiagnostics, diagnosticsSnapshot, recordElapsed } from './diagnostics.js'
import { abortedOutcome, parseCompleteBody, readRequestBody, requestSignal, sendError, sendJson } from './http.js'
import { currentSessionModel, findHostSession, hostFormatSupported, sessionSurfaceSupported } from './session.js'
import {
  ECHO_RETRY_TEMPERATURE, absorbResults, createCandidateState, requestCompletion, temperaturesFor,
  type CandidateGuards, type CompletionPlan,
} from './upstream.js'


const UNKNOWN_SESSION_ERROR: ChatFimError = {
  code: 'UNKNOWN_SESSION',
  message: '会话不存在或已不在当前进程：请刷新页面后重试',
}


function sendAbortOutcome(res: ServerResponse, sessionKey: string, outcome: 'timeout' | 'aborted'): void {
  bumpDiagnostics(outcome, sessionKey)
  if (outcome === 'timeout') {
    sendError(res, 504, { code: 'TIMEOUT', message: 'DeepSeek 续写上游超时' })
    return
  }
  if (!res.headersSent) res.destroy()
}


export function createCompleteHandler(
  ctx: Context,
  settings: ChatFimConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {




    if (!isTrustedBrowserRequest(req.headers, officialTrustedHosts(ctx))) {
      sendError(res, 403, { code: 'FORBIDDEN', message: '拒绝非本机同源的请求' })
      return
    }

    if (req.method === 'GET') {
      handleStatusQuery(ctx, req, res)
      return
    }
    if (req.method !== 'POST') {
      sendError(res, 405, { code: 'BAD_BODY', message: `只接受 POST ${COMPLETE_ROUTE_PATH}` })
      return
    }
    await handleComplete(ctx, settings, req, res)
  }
}


function handleStatusQuery(ctx: Context, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (url.searchParams.get('diagnostics') === '1') {
    sendJson(res, 200, diagnosticsSnapshot())
    return
  }
  const sessionIdRaw = url.searchParams.get('sessionId') ?? ''
  const session = findHostSession(ctx, SessionId(sessionIdRaw))
  if (session === undefined) {
    sendError(res, 404, UNKNOWN_SESSION_ERROR)
    return
  }


  if (!hostFormatSupported(session.header) || !sessionSurfaceSupported(session)) {
    sendJson(res, 200, { supported: false })
    return
  }
  const main = currentSessionModel(ctx, session)
  sendJson(res, 200, { supported: isDeepseekMainRoute(main) })
}


async function handleComplete(ctx: Context, settings: ChatFimConfig, req: IncomingMessage, res: ServerResponse): Promise<void> {
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

  const startedAt = Date.now()
  bumpDiagnostics('requests', sessionKey)
  const session = findHostSession(ctx, sessionId)
  if (session === undefined) {
    sendError(res, 404, UNKNOWN_SESSION_ERROR)
    return
  }

  if (!hostFormatSupported(session.header)) {
    sendError(res, 501, {
      code: 'UNSUPPORTED_HOST_FORMAT',
      message: '当前 dsh 的会话格式与本插件不兼容，续写功能已停用（升级插件后自动恢复）',
    })
    return
  }

  if (!sessionSurfaceSupported(session)) {
    sendError(res, 501, {
      code: 'UNSUPPORTED_HOST',
      message: '当前 dsh 版本缺少续写所需的会话接口，续写功能已停用（升级插件后自动恢复）',
    })
    return
  }


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


  const language = detectDraftLanguage(parsed.prompt)
  const history = session.deriveMessages() as readonly unknown[]

  const prompt = buildFimPrompt(history, parsed.prompt, language)



  const historyTurns = recentHistoryTurns(history)
  const guards: CandidateGuards = {
    draft: parsed.prompt,
    language,
    userEchoTexts: historyTurns.filter(turn => turn.role === 'user').map(turn => turn.text),
    assistantEchoTexts: historyTurns.filter(turn => turn.role === 'assistant').map(turn => turn.text),
    sessionKey,
  }

  const signal = requestSignal(res, settings.requestTimeoutMs)
  const plan: CompletionPlan = {
    settings,
    credentialValue: credential.value,
    model: resolveSuggestModel(main, settings.model),
    prompt,
    stop: speakerStopSequences(language),
    signal: signal.signal,
  }
  const state = createCandidateState(settings.temperature)
  try {

    absorbResults(state, await Promise.allSettled(temperaturesFor(settings).map(temperature => requestCompletion(plan, temperature))), guards, signal.signal)




    const disconnected = abortedOutcome(signal.signal)
    if (disconnected === 'aborted') {
      sendAbortOutcome(res, sessionKey, 'aborted')
      return
    }



    if (state.suggestions.length === 0 && state.hadFulfilled) {
      bumpDiagnostics('retries', sessionKey)
      absorbResults(state, await Promise.allSettled([requestCompletion(plan, ECHO_RETRY_TEMPERATURE)]), guards, signal.signal)

      if (abortedOutcome(signal.signal) === 'aborted') {
        sendAbortOutcome(res, sessionKey, 'aborted')
        return
      }
    }

    if (state.suggestions.length === 0 && !state.hadFulfilled) {







      if (state.firstError === undefined && abortedOutcome(signal.signal) === 'timeout') {
        sendAbortOutcome(res, sessionKey, 'timeout')
        return
      }


      if (state.firstError !== undefined) bumpDiagnostics('upstreamError', sessionKey)
      sendError(res, 502, state.firstError ?? { code: 'UPSTREAM_ERROR', message: 'DeepSeek 续写上游没有返回可用候选' })
      return
    }
    if (state.suggestions.length === 0) bumpDiagnostics('empty', sessionKey)
    else bumpDiagnostics('shown', sessionKey)
    sendJson(res, 200, {
      suggestions: state.suggestions,
      model: plan.model,
      temperature: state.temperature,
      usage: { promptTokens: state.totalPromptTokens, completionTokens: state.totalCompletionTokens },
    })
  } catch (error) {



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

    recordElapsed(Date.now() - startedAt)
    signal.dispose()
  }
}
