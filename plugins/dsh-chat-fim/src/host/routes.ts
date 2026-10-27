/**
 * host 路由：信任栅栏 → 方法分发 → GET 支持 / 诊断查询、POST 续写转发与护栏 → 诊断收口。
 * 组合（能力门、配置归一化、effect 注册）在 host.ts；上游请求编排在 host/upstream.ts。
 */

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

/** 会话不在本进程内存里（未激活 / 已关闭）：GET 与 POST 共用同一文案。 */
const UNKNOWN_SESSION_ERROR: ChatFimError = {
  code: 'UNKNOWN_SESSION',
  message: '会话不存在或已不在当前进程：请刷新页面后重试',
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

/**
 * 构造 exact 路由 handler：信任栅栏先于一切分发，再按方法交给 GET / POST 处理。
 * @param ctx - DSH 插件上下文。
 * @param settings - 已归一化的插件配置。
 * @returns 供 `webServer.register` 使用的 handler。
 */
export function createCompleteHandler(
  ctx: Context,
  settings: ChatFimConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    // 信任栅栏（先于一切路由分发）：官方那道门只装在它自己的 `/api` 前缀路由上，
    // 本插件的 exact 路由不会经过它（见 trust.ts）。POST 会以服务端 API key 执行
    // **计费**上游请求，GET 会读出会话模型信息，故整条路由一律先过门。
    // 额外信任面复用官方 webStartup.trustedHosts（rc.2 起；旧宿主回退 webRuntime），LAN 部署与官方同一份口径。
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

/** GET：?diagnostics=1 返回进程内计数；否则按会话回答主模型是否支持（客户端据此整体隐藏开关）。 */
function handleStatusQuery(ctx: Context, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  // 诊断查询：返回护栏丢弃计数（无用户内容），用于「转完圈没出卡片」排查。
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
  // 宿主真值格式门（请求期）：header 由宿主给出，不受插件依赖副本影响。
  // 会话实例能力门：缺 requestHeader/deriveMessages 即不支持的 dsh 版本（见 sessionSurfaceSupported）。
  if (!hostFormatSupported(session.header) || !sessionSurfaceSupported(session)) {
    sendJson(res, 200, { supported: false })
    return
  }
  const main = currentSessionModel(ctx, session)
  sendJson(res, 200, { supported: isDeepseekMainRoute(main) })
}

/** POST：校验 → 会话 / 模型 / 凭据门 → 上游并行请求与护栏 → 200 / 502 / 504 出口。 */
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
  /** 本次请求起点（诊断耗时用）。 */
  const startedAt = Date.now()
  bumpDiagnostics('requests', sessionKey)
  const session = findHostSession(ctx, sessionId)
  if (session === undefined) {
    sendError(res, 404, UNKNOWN_SESSION_ERROR)
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

  // 续写语言跟随草稿内容（草稿英文→英文标签续写，中文→中文），不跟随界面语言（见 prompt.ts detectDraftLanguage）。
  const language = detectDraftLanguage(parsed.prompt)
  const history = session.deriveMessages() as readonly unknown[]
  // FIM 转写体 prompt：最近历史转说话人文本 + 「用户：草稿」结尾（见 prompt.ts buildFimPrompt）。
  const prompt = buildFimPrompt(history, parsed.prompt, language)
  // 回声判定的历史文本集（与 prompt 同一窗口）：
  // 用户消息按「开头 ECHO_USER_PREFIX_CHARS 字前缀」比对（整段复读用户原话时开头即重叠；中段复用措辞不误杀），
  // 助手消息按「ECHO_ASSISTANT_WINDOW_CHARS 字窗口」比对（转述讨论内容如 cleanSuggestion 仍拦得住，正常措辞复用放行）。
  const historyTurns = recentHistoryTurns(history)
  const guards: CandidateGuards = {
    draft: parsed.prompt,
    language,
    userEchoTexts: historyTurns.filter(turn => turn.role === 'user').map(turn => turn.text),
    assistantEchoTexts: historyTurns.filter(turn => turn.role === 'assistant').map(turn => turn.text),
    sessionKey,
  }
  // 补全模型解析：跟随官方主模型，vision / 未知 / 非官方回退配置默认。
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
    // 前缀续写接口没有 n 参数：多建议用并行请求 + 温度错开采样；部分失败保留成功建议。
    absorbResults(state, await Promise.allSettled(temperaturesFor(settings).map(temperature => requestCompletion(plan, temperature))), guards, signal.signal)

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
    if (state.suggestions.length === 0 && state.hadFulfilled) {
      bumpDiagnostics('retries', sessionKey)
      absorbResults(state, await Promise.allSettled([requestCompletion(plan, ECHO_RETRY_TEMPERATURE)]), guards, signal.signal)
      // 重试期间客户端断开：结果同样没人要，按断开出口收场。
      if (abortedOutcome(signal.signal) === 'aborted') {
        sendAbortOutcome(res, sessionKey, 'aborted')
        return
      }
    }
    // 只有上游请求全部失败（一个 fulfilled 都没有）才报错。
    if (state.suggestions.length === 0 && !state.hadFulfilled) {
      // 「全失败」分两种，靠 firstError 区分（absorbResults 已把中止类拒绝排除在 firstError 之外）：
      //   · firstError 有值 = 上游**真报错**（429/500/非法 JSON…）→ 502 带那个可操作的原因；
      //   · firstError 为空 + 信号超时 = 单纯超时、无任何可用结果 → 504。
      // 位置很关键：必须在「有候选就照常返回」之后，否则 suggestionCount>1 时
      // 「一个请求超时、另一个已拿到候选」会被误报 504 并丢掉到手候选（实测踩到过）。
      // 为什么不能只靠外层 catch：请求经 allSettled 收口，超时的拒绝不冒泡，
      // 判定若不放在这里就一直不可达（原缺陷：超时返回 502 + 空错误体、诊断恒 0）。
      if (state.firstError === undefined && abortedOutcome(signal.signal) === 'timeout') {
        sendAbortOutcome(res, sessionKey, 'timeout')
        return
      }
      // 上游真报错（429/500/非法 JSON…）也要记进诊断：这条路同样**不冒泡**到 catch，
      // 不在这里 bump 的话 `upstreamError` 对它恒为 0 —— 与上面 timeout 那条同一类缺陷。
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
    recordElapsed(Date.now() - startedAt)
    signal.dispose()
  }
}
