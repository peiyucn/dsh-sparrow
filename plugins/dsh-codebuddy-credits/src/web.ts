/**
 * dsh-codebuddy-credits 的 host HTTP 路由：给 client 的设置卡片提供
 * 状态读取、Key 保存与移除。Key 只经 ctx.credentials，不进日志、不进响应。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { API_KEY_ENV } from './constants.js'

export const KEY_REF = credentialRef(API_KEY_ENV)
const PREFIX = '/api/codebuddy-credits'
const MAX_BODY_BYTES = 16 * 1024

/** web.ts 与 index.ts 共享的最小操作面。 */
export interface CodeBuddyCreditsShared {
  /** 凭据（凭据库或环境）当前是否可用。 */
  keyConfigured(): Promise<boolean>
  /** 保存 Key 到 DSH 凭据库并立即重评估 route 注册。 */
  saveKey(key: string): Promise<void>
  /** 从 DSH 凭据库移除 Key 并立即重评估 route 注册。 */
  removeKey(): Promise<void>
  /** route 是否已注册（模型选择器可见）。 */
  active(): boolean
  /** 当前生效的模型 id 列表。 */
  modelIds(): readonly string[]
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) {
    raw += String(chunk)
    if (raw.length > MAX_BODY_BYTES) throw new Error('请求体过大')
  }
  if (!raw.trim()) return {}
  const parsed = JSON.parse(raw) as unknown
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

/** 仅接受本机回环来源（设置页与 DSH 同进程，客户端 fetch 同源）。 */
function localOnly(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function installCodeBuddyWeb(ctx: Context, shared: CodeBuddyCreditsShared): void {
  ctx.inject(['webServer'], (webCtx) => {
    ctx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        try {
          if (!localOnly(req)) {
            sendJson(res, 403, { error: '只允许从本机 DSH 页面访问' })
            return
          }
          if (req.method === 'GET' && pathname === `${PREFIX}/status`) {
            sendJson(res, 200, {
              keyConfigured: await shared.keyConfigured(),
              active: shared.active(),
              models: shared.modelIds(),
            })
            return
          }
          if (req.method === 'POST' && pathname === `${PREFIX}/key`) {
            const body = await readBody(req)
            const key = typeof body.key === 'string' ? body.key.trim() : ''
            if (key.length === 0) {
              sendJson(res, 400, { error: '请输入 API Key' })
              return
            }
            if (key.length > 16 * 1024) {
              sendJson(res, 413, { error: 'API Key 长度超出限制' })
              return
            }
            await shared.saveKey(key)
            sendJson(res, 200, { ok: true })
            return
          }
          if (req.method === 'POST' && pathname === `${PREFIX}/remove-key`) {
            await shared.removeKey()
            sendJson(res, 200, { ok: true })
            return
          }
          sendJson(res, 404, { error: '未知路径' })
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : '请求处理失败' })
        }
      },
    }), 'llm-codebuddy-credits: web routes')
  })
}
