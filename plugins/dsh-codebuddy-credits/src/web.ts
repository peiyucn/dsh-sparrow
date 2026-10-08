/**
 * host HTTP 路由：设置卡片与聊天头部额度卡的状态读取、Key 保存 / 移除、配额查询。
 * Key 只经 ctx.credentials，不进日志与响应；无 Key 零网络行为。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CodeBuddyModelFacts } from './catalog.js'
import type { QuotaStatus } from './quota.js'
import { isTrustedPluginRequest, officialTrustedHosts } from './trust.js'

const PREFIX = '/api/codebuddy-credits'
const MAX_BODY_BYTES = 16 * 1024

/** 账号快照（展示用）；enterpriseUserName / nickname 来自 /v2/accounts。 */
export interface AccountView {
  enterpriseName?: string
  accountType?: string
  enterpriseUserName?: string
  nickname?: string
}

/** 状态接口的模型事实视图（client 头部卡片据此展示当前模型）。 */
export interface ModelFactView {
  id: string
  /** 服务端原始模型名，不含插件附加标记。 */
  name: string
  /** 积分系数短串（"x0.79"）；服务端未声明时缺省。 */
  credits?: string
  /** 原生视觉（supportsImages）。 */
  vision: boolean
  contextWindow: number
  maxTokens: number
  /** 服务端模型描述（descriptionZh ?? descriptionEn）。 */
  description?: string
  /** 思考档位 id（含 off），无推理能力时缺省。 */
  efforts?: string[]
}

/** web.ts 与 index.ts 共享的最小操作面。 */
export interface CodeBuddyCreditsShared {
  keyConfigured(): Promise<boolean>
  saveKey(key: string): Promise<void>
  /** 用已存 Key 幂等重配：重拉模型目录与账号信息。 */
  reapply(): Promise<void>
  /** 清空已保存的 Key（凭据 + 模型目录；profile 保留）。 */
  removeKey(): Promise<void>
  quota(): Promise<QuotaStatus>
  /** 会话累计积分与调用次数（从事件重放；冷会话读持久化事件前缀）。 */
  sessionUsage(sessionId: string): Promise<TurnUsageView>
  /** 单轮积分与调用次数（同样来自事件重放）。 */
  turnUsage(sessionId: string, turn: number): Promise<TurnUsageView>
  /** route 是否注册（状态诊断用）。 */
  active(): boolean
  /** 账号快照（来自 /v2/accounts）。 */
  account(): AccountView
  /** 账号缺失时补拉 /v2/accounts（best-effort）。 */
  ensureAccount(): Promise<void>
  /** 模型目录为空时触发节流后台补拉。 */
  ensureModels(): Promise<void>
  /** 手动重扫模型目录：绕过自动冷却、复用上游单飞，只动本 provider。 */
  refreshModels(): Promise<{ changed: boolean; models: readonly CodeBuddyModelFacts[] }>
  /** 进程内当前生效的模型事实。 */
  models(): readonly CodeBuddyModelFacts[]
  /** Max 模式（推理档位锁）当前状态（设置节）。 */
  maxMode(): boolean
  /** 设置 Max 模式（写设置节）。 */
  setMaxMode(enabled: boolean): Promise<void>
}

/** 积分聚合视图（供轮次 / 会话面板）。 */
export interface TurnUsageView {
  credit: number
  calls: number
  /** 按模型聚合；顺序 = 首次出现。 */
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

export function toModelFactView(model: CodeBuddyModelFacts): ModelFactView {
  return {
    id: model.id,
    name: model.name,
    ...(model.credits === undefined ? {} : { credits: model.credits }),
    vision: model.input.includes('image'),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(model.description === undefined ? {} : { description: model.description }),
    ...(model.reasoning && model.thinkingLevelMap !== undefined
      ? { efforts: Object.keys(model.thinkingLevelMap) }
      : {}),
  }
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

/** 仅接受本机回环来源（DSH 页面与宿主同源）。 */
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
          // 必须在本路由任何分发与读体之前：本前缀比官方 /api 长（「前缀最长者胜」），请求走不到官方栅栏。
          // 信任面在请求期读官方 webRuntime.trustedHosts；localOnly 拦不住 rebinding，两道都留。
          if (!isTrustedPluginRequest(req.headers, officialTrustedHosts(ctx))) {
            sendJson(res, 403, { error: '拒绝跨站来源的请求' })
            return
          }
          if (!localOnly(req)) {
            sendJson(res, 403, { error: '只允许从本机 DSH 页面访问' })
            return
          }
          // 状态接口保持本地毫秒级：不夹带配额请求（额度卡图标依赖它），配额走 /quota。
          if (req.method === 'GET' && pathname === PREFIX + '/status') {
            const keyConfigured = await shared.keyConfigured()
            if (keyConfigured) {
              // 启动补拉失败（网络抖动）时账号 / 模型目录会缺：读取时补一次即自愈。
              await shared.ensureAccount().catch(() => {})
              await shared.ensureModels().catch(() => {})
            }
            sendJson(res, 200, {
              keyConfigured,
              active: shared.active(),
              account: shared.account(),
              models: shared.models().map(model => toModelFactView(model)),
              maxMode: shared.maxMode(),
            })
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/max-mode') {
            const body = await readBody(req)
            if (typeof body.enabled !== 'boolean') {
              sendJson(res, 400, { error: 'enabled 必须是布尔值' })
              return
            }
            await shared.setMaxMode(body.enabled)
            sendJson(res, 200, { ok: true, maxMode: shared.maxMode() })
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/quota') {
            if (!await shared.keyConfigured()) {
              sendJson(res, 400, { error: '未配置 Key' })
              return
            }
            sendJson(res, 200, await shared.quota())
            return
          }
          if (req.method === 'GET' && pathname === PREFIX + '/session-usage') {
            const sessionId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId')
            if (sessionId === null || sessionId === '') {
              sendJson(res, 400, { error: '缺少 sessionId' })
              return
            }
            sendJson(res, 200, await shared.sessionUsage(sessionId))
            return
          }
          if (req.method === 'GET' && pathname === PREFIX + '/turn-usage') {
            const params = new URL(req.url ?? '/', 'http://localhost').searchParams
            const sessionId = params.get('sessionId')
            const rawTurn = params.get('turn')
            if (sessionId === null || sessionId === '' || rawTurn === null || rawTurn === '') {
              sendJson(res, 400, { error: '缺少 sessionId 或 turn' })
              return
            }
            const turn = Number(rawTurn)
            if (!Number.isSafeInteger(turn) || turn < 0) {
              sendJson(res, 400, { error: 'turn 必须是非负整数' })
              return
            }
            sendJson(res, 200, await shared.turnUsage(sessionId, turn))
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/key') {
            const body = await readBody(req)
            const key = typeof body.key === 'string' ? body.key.trim() : ''
            // 空 Key = 幂等重配（不输新 Key 的应用路径）。
            if (key.length === 0) {
              await shared.reapply()
              sendJson(res, 200, { ok: true })
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
          if (req.method === 'POST' && pathname === PREFIX + '/refresh-models') {
            if (!await shared.keyConfigured()) {
              sendJson(res, 400, { error: '未配置 Key' })
              return
            }
            const result = await shared.refreshModels()
            sendJson(res, 200, {
              ok: true,
              changed: result.changed,
              models: result.models.map(model => toModelFactView(model)),
              account: shared.account(),
            })
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/remove-key') {
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
