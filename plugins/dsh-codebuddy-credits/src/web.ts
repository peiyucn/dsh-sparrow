/**
 * dsh-codebuddy-credits 的 host HTTP 路由：给 client 的设置卡片与聊天头部
 * 额度卡提供状态读取、Key 保存/移除、配额查询。
 * Key 只经 ctx.credentials，不进日志、不进响应；所有云端请求仅在用户
 * 给 Key 后发生（无 Key 零网络行为）。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CodeBuddyModelFacts } from './catalog.js'
import { API_KEY_ENV } from './constants.js'
import type { QuotaStatus } from './quota.js'

export const KEY_REF = credentialRef(API_KEY_ENV)
const PREFIX = '/api/codebuddy-credits'
const MAX_BODY_BYTES = 16 * 1024

/** 账号快照（展示用）。 */
export interface AccountView {
  enterpriseName?: string
  accountType?: string
  /** 企业内姓名（/v2/accounts 的 enterpriseUserName）。 */
  enterpriseUserName?: string
  /** 账号昵称（/v2/accounts 的 nickname）。 */
  nickname?: string
}

/** 状态接口里的模型事实视图（client 头部卡片据此展示当前模型信息）。 */
export interface ModelFactView {
  id: string
  /** 展示名（已含系数）。 */
  name: string
  /** 积分系数短串（"x0.79"），服务端未声明时缺省——消耗速度行用。 */
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
  /** 用已存 Key 幂等重配：重拉模型目录与账号信息（应用时不输新 Key 的路径）。 */
  reapply(): Promise<void>
  /** 清空已保存的 Key（凭据 + 模型目录；profile 保留）。 */
  removeKey(): Promise<void>
  /** 查询企业周期配额。 */
  quota(): Promise<QuotaStatus>
  /** 会话累计积分与调用次数（进程内 usage 记账），附按模型聚合的调用明细。 */
  sessionUsage(sessionId: string): TurnUsageView
  /** 单轮积分与调用次数（每轮积分胶囊弹窗用）。 */
  turnUsage(sessionId: string, turn: number): TurnUsageView
  /** route 是否注册（状态接口诊断用）。 */
  active(): boolean
  /** 账号快照（来自 /v2/accounts）。 */
  account(): AccountView
  /** 账号缺失时补拉 /v2/accounts（best-effort，状态接口在给 Key 后调用）。 */
  ensureAccount(): Promise<void>
  /** 模型目录为空时触发节流后台补拉（状态接口在给 Key 后调用）。 */
  ensureModels(): Promise<void>
  /** 当前生效模型事实（进程内，Key 驱动的目录）。 */
  models(): readonly CodeBuddyModelFacts[]
}

/** usage 记账条目的最小面（turnUsageOf 的输入）。 */
export interface UsageEntryLike {
  sessionId?: string
  turn?: number
  credit?: number
  model?: string
}

/** 积分聚合视图：合计 + 调用次数 + 按模型聚合的明细（供轮次/会话面板）。 */
export interface TurnUsageView {
  credit: number
  calls: number
  /** 按模型聚合：每模型合计积分 + 调用次数（顺序 = 首次出现）。 */
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

/**
 * usage 记账聚合（纯函数）：按会话（+可选轮次）合计积分与调用次数，
 * 并按模型聚合明细（同一模型多次调用合并成一行，避免重复条目刷屏）。
 */
export function turnUsageOf(
  entries: readonly UsageEntryLike[],
  sessionId: string,
  turn: number | undefined,
): TurnUsageView {
  let credit = 0
  let calls = 0
  const byModel: { model: string; credit: number; calls: number }[] = []
  const index = new Map<string, number>()
  for (const usage of entries) {
    if (usage.sessionId !== sessionId) continue
    if (turn !== undefined && usage.turn !== turn) continue
    calls += 1
    if (usage.credit !== undefined) credit += usage.credit
    const model = usage.model ?? ''
    let slot = index.get(model)
    if (slot === undefined) {
      slot = byModel.length
      index.set(model, slot)
      byModel.push({ model, credit: 0, calls: 0 })
    }
    const bucket = byModel[slot]
    bucket.calls += 1
    if (usage.credit !== undefined) bucket.credit += usage.credit
  }
  return { credit, calls, byModel }
}

/** 模型事实 → 状态接口视图。 */
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
          // 状态接口保持「本地毫秒级」：不夹带配额网络请求（额度卡图标
          // 的出现依赖它，慢查询会让图标迟迟不出现）。配额走 /quota。
          if (req.method === 'GET' && pathname === PREFIX + '/status') {
            const keyConfigured = await shared.keyConfigured()
            if (keyConfigured) {
              // 账号信息在启动补拉失败（网络抖动）时会缺失：状态读取时补一次。
              await shared.ensureAccount().catch(() => {})
              // 模型目录为空时同样补拉：配置卡/额度卡读取即自愈。
              await shared.ensureModels().catch(() => {})
            }
            sendJson(res, 200, {
              keyConfigured,
              active: shared.active(),
              account: shared.account(),
              models: shared.models().map(model => toModelFactView(model)),
            })
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
            sendJson(res, 200, shared.sessionUsage(sessionId))
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
            sendJson(res, 200, shared.turnUsage(sessionId, turn))
            return
          }
          if (req.method === 'POST' && pathname === PREFIX + '/key') {
            const body = await readBody(req)
            const key = typeof body.key === 'string' ? body.key.trim() : ''
            // 空 Key = 幂等重配：用已存 Key 重拉模型目录与账号信息（已配置时
            // 直接点应用、不输新 Key 的路径）。
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
