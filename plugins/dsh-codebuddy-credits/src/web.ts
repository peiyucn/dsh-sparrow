

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CodeBuddyModelFacts } from './catalog.js'
import type { QuotaStatus } from './quota.js'
import { API_PREFIX, SETTINGS_NAMESPACE } from './constants.js'
import { isTrustedPluginRequest, officialTrustedHosts } from './trust.js'

const PREFIX = API_PREFIX
const MAX_BODY_BYTES = 16 * 1024


export interface AccountView {
  enterpriseName?: string
  accountType?: string
  enterpriseUserName?: string
  nickname?: string
}


export interface ModelFactView {
  id: string

  name: string

  credits?: string

  vision: boolean
  contextWindow: number

  description?: string

  efforts?: string[]
}


export interface CodeBuddyCreditsShared {
  keyConfigured(): Promise<boolean>
  saveKey(key: string): Promise<void>

  reapply(): Promise<void>

  removeKey(): Promise<void>
  quota(): Promise<QuotaStatus>

  sessionUsage(sessionId: string): Promise<TurnUsageView>

  turnUsage(sessionId: string, turn: number): Promise<TurnUsageView>

  active(): boolean

  account(): AccountView

  ensureAccount(): Promise<void>

  ensureModels(): Promise<void>

  refreshModels(): Promise<{ changed: boolean; models: readonly CodeBuddyModelFacts[] }>

  models(): readonly CodeBuddyModelFacts[]

  maxMode(): boolean

  setMaxMode(enabled: boolean): Promise<void>

  autoAdapt(): boolean

  setAutoAdapt(enabled: boolean): Promise<void>
}


export interface TurnUsageView {
  credit: number
  calls: number

  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

export function toModelFactView(model: CodeBuddyModelFacts): ModelFactView {
  return {
    id: model.id,
    name: model.name,
    ...(model.credits === undefined ? {} : { credits: model.credits }),
    vision: model.input.includes('image'),
    contextWindow: model.contextWindow,
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
  let bytes = 0
  for await (const chunk of req) {
    const text = String(chunk)
    raw += text
    bytes += Buffer.byteLength(text)
    if (bytes > MAX_BODY_BYTES) throw new Error('请求体过大')
  }
  if (!raw.trim()) return {}
  const parsed = JSON.parse(raw) as unknown
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}


async function readEnabled(req: IncomingMessage, res: ServerResponse): Promise<boolean | undefined> {
  const body = await readBody(req)
  if (typeof body.enabled !== 'boolean') {
    sendJson(res, 400, { error: 'enabled 必须是布尔值' })
    return undefined
  }
  return body.enabled
}

export function installCodeBuddyWeb(ctx: Context, shared: CodeBuddyCreditsShared): void {
  ctx.inject(['webServer'], (webCtx) => {
    ctx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        try {



          if (!isTrustedPluginRequest(req.headers, officialTrustedHosts(ctx))) {
            sendJson(res, 403, { error: '拒绝跨站来源的请求' })
            return
          }

          if (req.method === 'GET' && pathname === PREFIX + '/status') {
            const keyConfigured = await shared.keyConfigured()
            if (keyConfigured) {

              await shared.ensureAccount().catch(() => {})
              await shared.ensureModels().catch(() => {})
            }
            sendJson(res, 200, {
              keyConfigured,
              active: shared.active(),
              account: shared.account(),
              models: shared.models().map(model => toModelFactView(model)),
              maxMode: shared.maxMode(),
              autoAdapt: shared.autoAdapt(),
            })
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/max-mode') {
            const enabled = await readEnabled(req, res)
            if (enabled === undefined) return
            await shared.setMaxMode(enabled)
            sendJson(res, 200, { ok: true, maxMode: shared.maxMode() })
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/auto-adapt') {
            const enabled = await readEnabled(req, res)
            if (enabled === undefined) return
            await shared.setAutoAdapt(enabled)
            sendJson(res, 200, { ok: true, autoAdapt: shared.autoAdapt() })
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
    }), `${SETTINGS_NAMESPACE}: web routes`)
  })
}
