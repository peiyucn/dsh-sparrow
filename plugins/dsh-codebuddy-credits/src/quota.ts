/**
 * 企业周期配额查询：POST {CODEBUDDY_ORIGIN}/v2/billing/meter/get-enterprise-user-usage。
 * 仅 X-API-Key 即可（无登录态）。
 * 请求头与官方 CLI 一致（`requestHeaders`）；端点与推理/目录同源，不另立字面量。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import { requestHeaders } from './catalog.js'
import { QUOTA_FETCH_TIMEOUT_MS, QUOTA_URL } from './constants.js'

export interface QuotaStatus {
  used: number
  limit: number
  /** 剩余积分（= limit - used，下限 0）。 */
  remaining: number
  /** 周期开始（服务端时区文案）。 */
  cycleStart?: string
  cycleEnd?: string
  resetAt?: string
}

function numberOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

function textOr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

/** 查询企业周期配额；仅在用户提供 Key 后调用。 */
export async function fetchQuota(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<QuotaStatus> {
  signal?.throwIfAborted()
  const timeout = AbortSignal.timeout(QUOTA_FETCH_TIMEOUT_MS)
  const upstream = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(QUOTA_URL, {
      method: 'POST',
      headers: {
        ...requestHeaders(apiKey, account),
        'content-type': 'application/json',
      },
      body: '{}',
      signal: upstream,
    })
  } catch (error) {
    if (signal?.aborted) throw new LlmError('配额查询已取消', 'ABORTED', { cause: error })
    if (timeout.aborted) throw new LlmError('CodeBuddy 配额接口超时', 'TRANSPORT', { cause: error })
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
