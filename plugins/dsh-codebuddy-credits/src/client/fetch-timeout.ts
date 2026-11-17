


export const CLIENT_FETCH_TIMEOUT_MS = 15_000

export const CLIENT_ACTION_TIMEOUT_MS = 30_000


export function fetchLocal(input: string, init?: RequestInit, timeoutMs: number = CLIENT_FETCH_TIMEOUT_MS): Promise<Response> {
  if (init?.signal != null) return fetch(input, init)
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}
