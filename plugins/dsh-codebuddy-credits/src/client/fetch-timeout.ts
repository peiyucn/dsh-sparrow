/** 客户端本地/同源请求的超时兜底（根 AGENTS 安全热点：fetch 带超时）：宿主线程卡住时按钮与状态不永久悬挂。 */

/** 状态/查询类请求：本机 DSH 进程内本地内存读，或宿主已带 5–10s 内部超时。 */
export const CLIENT_FETCH_TIMEOUT_MS = 15_000
/** 动作类请求（保存 Key / 手动重扫）：host 需再访问上游，最坏约 20s。 */
export const CLIENT_ACTION_TIMEOUT_MS = 30_000

/** fetch + 超时兜底；调用方自带 signal 时尊重其语义（不覆盖）。 */
export function fetchLocal(input: string, init?: RequestInit, timeoutMs: number = CLIENT_FETCH_TIMEOUT_MS): Promise<Response> {
  if (init?.signal != null) return fetch(input, init)
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}
