/**
 * dsh-fim host half：FIM 转发路由（v1 骨架）。
 *
 * DSH 插件契约：name / inject / apply
 *   name   —— 插件 id（组合行里用）
 *   inject —— 硬依赖：webServer 服务没装好，本插件不启动
 *   apply  —— 入口：DSH 启动时调用，把能力注册到 ctx 上
 *
 * 说明（当前步骤）：
 *   - 只 import type（编译后擦除），零 @deepseek-ai 运行时依赖，
 *     避免与 source 模式宿主的源码实例产生双实例问题；
 *   - 配置与凭据先内联默认值，下一步再加 Config + settings + credentials。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'dsh-fim'

export const inject = ['webServer']

/** ctx.webServer 服务的形状（只声明我们用到的部分） */
interface WebServer {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 按需获取的可选服务（软依赖：拿不到就优雅降级） */
interface CredentialsService {
  resolve(ref: string): Promise<{ value: string } | undefined>
}
interface SessionsService {
  get(id: string): unknown
}

interface FimContext extends Context {
  webServer: WebServer
  get(name: 'credentials'): CredentialsService | undefined
  get(name: 'sessions'): SessionsService | undefined
}

/** 默认配置（下一步移到 Config schema + settings 分节） */
const DEFAULTS = {
  baseURL: 'https://api.deepseek.com/beta',
  model: 'deepseek-v4-pro',
  maxTokens: 128,
  apiKeyEnv: 'DEEPSEEK_API_KEY',
}

const MAX_BODY_BYTES = 64 * 1024
const MAX_PROMPT_CHARS = 32_000
const REQUEST_TIMEOUT_MS = 30_000

export function apply(ctx: FimContext) {
  // ctx.effect 返回的清理函数：插件卸载/更新时自动执行（注销路由）
  const unregister = ctx.webServer.register({
    kind: 'prefix',
    path: '/api/fim',
    handler: (req, res) => {
      void handle(req, res, ctx)
    },
  })
  ctx.effect(() => () => unregister(), 'dsh-fim: fim route')

  ctx.logger?.info('[dsh-fim] host loaded，路由 /api/fim/* 已注册')
}

interface FimRequest {
  sessionId?: string
  prompt?: string
  suffix?: string
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: FimContext,
): Promise<void> {
  // 只受理 POST /api/fim/complete
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method !== 'POST' || url.pathname !== '/api/fim/complete') {
    sendJson(res, 404, { error: { code: 'NOT_FOUND' } })
    return
  }

  // 读请求体（有上限，防滥用）
  let body: FimRequest
  try {
    body = (await readJsonBody(req)) ?? {}
  } catch {
    sendJson(res, 400, { error: { code: 'BAD_BODY' } })
    return
  }

  // 校验 sessionId：sessions 服务存在时必须命中真实会话
  const sessions = ctx.get('sessions')
  if (sessions === undefined) {
    sendJson(res, 503, { error: { code: 'SESSIONS_UNAVAILABLE' } })
    return
  }
  if (typeof body.sessionId !== 'string' || sessions.get(body.sessionId) === undefined) {
    sendJson(res, 403, { error: { code: 'UNKNOWN_SESSION' } })
    return
  }

  const prompt = body.prompt
  if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_PROMPT_CHARS) {
    sendJson(res, 400, { error: { code: 'INVALID_PROMPT' } })
    return
  }

  // 解析 API key：credentials seam 优先，环境变量兜底
  let key: string | undefined
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const hit = await credentials.resolve(DEFAULTS.apiKeyEnv)
    if (hit !== undefined) key = hit.value
  } else if (process.env[DEFAULTS.apiKeyEnv] !== undefined) {
    key = process.env[DEFAULTS.apiKeyEnv]
  }
  if (key === undefined || key.trim() === '') {
    sendJson(res, 401, { error: { code: 'MISSING_CREDENTIAL' } })
    return
  }

  // 转发 FIM 请求（超时 + 客户端断开即取消）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  req.on('close', () => controller.abort())
  let upstream: Response
  try {
    upstream = await fetch(new URL('/completions', DEFAULTS.baseURL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: DEFAULTS.model,
        prompt,
        ...(body.suffix === undefined ? {} : { suffix: body.suffix }),
        max_tokens: DEFAULTS.maxTokens,
      }),
      signal: controller.signal,
    })
  } catch {
    sendJson(res, 502, { error: { code: 'TRANSPORT' } })
    return
  } finally {
    clearTimeout(timer)
  }

  if (!upstream.ok) {
    const code = upstream.status === 401 ? 'AUTH' : upstream.status === 429 ? 'RATE_LIMIT' : 'HTTP_' + upstream.status
    sendJson(res, 502, { error: { code, status: upstream.status } })
    return
  }

  let data: unknown
  try {
    data = await upstream.json()
  } catch {
    sendJson(res, 502, { error: { code: 'MALFORMED_RESPONSE' } })
    return
  }
  const text = readCompletionText(data)
  sendJson(res, 200, { text })
}

async function readJsonBody(req: IncomingMessage): Promise<FimRequest> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as FimRequest
}

function readCompletionText(data: unknown): string {
  if (data === null || typeof data !== 'object') return ''
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0]
  if (first === null || typeof first !== 'object') return ''
  const text = (first as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}