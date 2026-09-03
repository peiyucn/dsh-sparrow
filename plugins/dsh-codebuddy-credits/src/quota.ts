/**
 * 企业周期配额查询：POST www.codebuddy.cn/v2/billing/meter/get-enterprise-user-usage。
 * 实测（2026-09-03）：仅 X-API-Key 即可（无登录态），响应含本期已消耗、
 * 周期额度、周期范围与重置时间。请求形态与官方 CLI 一致（统一请求头规矩）。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import { requestHeaders } from './catalog.js'

/** 配额快照（展示用）。 */
export interface QuotaStatus {
  /** 本期已消耗积分。 */
  used: number
  /** 周期额度上限。 */
  limit: number
  /** 剩余积分（limit - used）。 */
  remaining: number
  /** 周期开始（服务端时区文案）。 */
  cycleStart?: string
  /** 周期结束。 */
  cycleEnd?: string
  /** 下次重置时间。 */
  resetAt?: string
}

const QUOTA_URL = 'https://www.codebuddy.cn/v2/billing/meter/get-enterprise-user-usage'

function numberOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

function textOr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

/** 查询企业周期配额（用户给 Key 后才允许调用）。 */
export async function fetchQuota(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<QuotaStatus> {
  let response: Response
  try {
    response = await fetch(QUOTA_URL, {
      method: 'POST',
      headers: {
        ...requestHeaders(apiKey, account),
        'content-type': 'application/json',
      },
      body: '{}',
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw new LlmError('配额查询已取消', 'ABORTED', { cause: error })
    throw new LlmError('无法连接 CodeBuddy 配额接口', 'TRANSPORT', { cause: error })
  }
  if (!response.ok) throw new LlmError('CodeBuddy 配额接口返回 HTTP ' + String(response.status), 'PROVIDER', { status: response.status })
  const body = await response.json().catch(error => {
    throw new LlmError('CodeBuddy 配额接口返回了无法解析的数据', 'PROVIDER', { cause: error })
  })
  if ((body as { code?: number })?.code !== 0) {
    const detail = body as { msg?: unknown; code?: unknown }
    throw new LlmError('CodeBuddy 配额接口错误：' + String(detail.msg ?? detail.code ?? '未知'), 'PROVIDER')
  }
  const data = (body as { data?: Record<string, unknown> }).data ?? {}
  const used = numberOr(data.credit, 0)
  const limit = numberOr(data.limitNum, 0)
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ...(textOr(data.cycleStartTime) === undefined ? {} : { cycleStart: textOr(data.cycleStartTime) as string }),
    ...(textOr(data.cycleEndTime) === undefined ? {} : { cycleEnd: textOr(data.cycleEndTime) as string }),
    ...(textOr(data.cycleResetTime) === undefined ? {} : { resetAt: textOr(data.cycleResetTime) as string }),
  }
}
