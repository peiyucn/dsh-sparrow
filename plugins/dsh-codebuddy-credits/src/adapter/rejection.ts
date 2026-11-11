/**
 * 上游错误体 → LlmError：非 2xx 的 `code` / `msg` 原样透传（11128 判定与用户可见错误共用这一份）。
 * 与 `adapter.ts` 拆开是为了让请求编排文件保持在结构守卫的行数上限内。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'

/** 服务端错误体解析结果：code 供 11128 判定，msg 供错误透传。 */
export interface ErrorDetail {
  code?: unknown
  msg?: string
}

/** 错误体只解析一次：code 供 11128 判定，msg 供错误透传（避免二次读体）。 */
export async function readErrorDetail(response: Response): Promise<ErrorDetail> {
  try {
    const body = await response.json() as { code?: unknown; msg?: unknown }
    return {
      ...(body.code === undefined ? {} : { code: body.code }),
      ...(body.msg === undefined ? {} : { msg: String(body.msg) }),
    }
  } catch {
    // 非 JSON 错误体：交给状态码兜底
    return {}
  }
}

/** 非 2xx 响应 → LlmError（服务端 code/msg 原样透传，如 10081 ip whitelist）。 */
export function rejectionError(status: number, detail: ErrorDetail, hint?: string): never {
  const text = detail.msg ?? (detail.code === undefined ? '' : 'code ' + String(detail.code))
  const base = text.length > 0
    ? 'CodeBuddy 请求被拒（HTTP ' + String(status) + '）：' + text
    : 'CodeBuddy 请求失败（HTTP ' + String(status) + '）'
  throw new LlmError(hint === undefined ? base : base + '（' + hint + '）', 'PROVIDER', { status })
}
