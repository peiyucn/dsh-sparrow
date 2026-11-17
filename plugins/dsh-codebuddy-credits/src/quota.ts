

import { LlmError } from '@deepseek-ai/dsh-llm'
import { requestHeaders } from './catalog.js'
import { QUOTA_FETCH_TIMEOUT_MS, QUOTA_URL } from './constants.js'

export interface QuotaStatus {
  used: number
  limit: number

  remaining: number

  resetAt?: string
}

function numberOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

function textOr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}


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
  if (!response.ok) throw LlmError.fromFailure({ message: 'CodeBuddy 配额接口返回 HTTP ' + String(response.status), code: 'PROVIDER', status: response.status })
  const body = await response.json().catch(error => {
    throw LlmError.fromFailure({ message: 'CodeBuddy 配额接口返回了无法解析的数据', code: 'PROVIDER' }, { cause: error })
  })
  if ((body as { code?: number })?.code !== 0) {
    const detail = body as { msg?: unknown; code?: unknown }
    throw LlmError.fromFailure({ message: 'CodeBuddy 配额接口错误：' + String(detail.msg ?? detail.code ?? '未知'), code: 'PROVIDER' })
  }
  const data = (body as { data?: Record<string, unknown> }).data ?? {}
  const used = numberOr(data.credit, 0)
  const limit = numberOr(data.limitNum, 0)
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ...(textOr(data.cycleResetTime) === undefined ? {} : { resetAt: textOr(data.cycleResetTime) as string }),
  }
}
