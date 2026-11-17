

import { LlmError } from '@deepseek-ai/dsh-llm'


export interface ErrorDetail {
  code?: unknown
  msg?: string
}


export async function readErrorDetail(response: Response): Promise<ErrorDetail> {
  try {
    const body = await response.json() as { code?: unknown; msg?: unknown }
    return {
      ...(body.code === undefined ? {} : { code: body.code }),
      ...(body.msg === undefined ? {} : { msg: String(body.msg) }),
    }
  } catch {

    return {}
  }
}


export function rejectionError(status: number, detail: ErrorDetail, hint?: string): never {
  const text = detail.msg ?? (detail.code === undefined ? '' : 'code ' + String(detail.code))
  const base = text.length > 0
    ? 'CodeBuddy 请求被拒（HTTP ' + String(status) + '）：' + text
    : 'CodeBuddy 请求失败（HTTP ' + String(status) + '）'
  throw LlmError.fromFailure({ message: hint === undefined ? base : base + '（' + hint + '）', code: 'PROVIDER', status })
}
