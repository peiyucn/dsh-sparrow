/**
 * 进程级诊断计数（GET ?diagnostics=1 返回；不持久化、不含任何用户内容，bySession 只记会话 id 不记内容）。
 * 「转完圈没出卡片」时先查这里，别盲调参数：
 * `aborted` = 客户端作废（还在打字/切会话），`timeout` = 上游超时，`upstreamError` = 上游报错，
 * `elapsedTotalMs / requests` = 平均耗时，`elapsedMaxMs` = 最慢一次。
 */

import { MAX_DIAGNOSTIC_SESSIONS } from '../constants.js'

export type DiagnosticKey = 'requests' | 'fulfilled' | 'retries' | 'shown' | 'empty' | 'filteredSpeaker' | 'filteredRepeat' | 'filteredEcho' | 'filteredLanguage' | 'aborted' | 'timeout' | 'upstreamError'

/** 一个会话（或全局）的诊断计数行；`elapsed*` 只在全局行维护。 */
type DiagnosticCounts = Record<DiagnosticKey, number>

/** 全局行：计数 + 按会话表 + 耗时。 */
type DiagnosticState = DiagnosticCounts & {
  bySession: Record<string, DiagnosticCounts>
  elapsedTotalMs: number
  elapsedMaxMs: number
}

function emptyCounts(): DiagnosticCounts {
  return {
    requests: 0,
    fulfilled: 0,
    retries: 0,
    shown: 0,
    empty: 0,
    filteredSpeaker: 0,
    filteredRepeat: 0,
    filteredEcho: 0,
    filteredLanguage: 0,
    aborted: 0,
    timeout: 0,
    upstreamError: 0,
  }
}

const diagnostics: DiagnosticState = {
  ...emptyCounts(),
  bySession: {},
  elapsedTotalMs: 0,
  elapsedMaxMs: 0,
}

/** 在按会话诊断表里累加一次计数；新会话条目使表超上限时先淘汰最早写入的会话（对象键插入序 = FIFO）。 */
export function bumpSessionDiagnostics(
  bySession: Record<string, DiagnosticCounts>,
  sessionId: string,
  key: DiagnosticKey,
  maxSessions = MAX_DIAGNOSTIC_SESSIONS,
): void {
  let stats = bySession[sessionId]
  if (stats === undefined) {
    while (Object.keys(bySession).length >= maxSessions) {
      const oldest = Object.keys(bySession)[0]
      if (oldest === undefined) break
      delete bySession[oldest]
    }
    stats = emptyCounts()
    bySession[sessionId] = stats
  }
  stats[key]++
}

/** 累加一个诊断计数（全局 + 按会话分组）。 */
export function bumpDiagnostics(key: DiagnosticKey, sessionId: string): void {
  diagnostics[key]++
  bumpSessionDiagnostics(diagnostics.bySession, sessionId, key)
}

/** 记一次请求耗时（含被作废的）：慢上游是「转完圈没出卡片」的常见原因，记下来别盲调参数。 */
export function recordElapsed(elapsedMs: number): void {
  diagnostics.elapsedTotalMs += elapsedMs
  if (elapsedMs > diagnostics.elapsedMaxMs) diagnostics.elapsedMaxMs = elapsedMs
}

/** 读取诊断状态（GET 直接序列化；活对象、只读用途）。 */
export function diagnosticsSnapshot(): DiagnosticState {
  return diagnostics
}
