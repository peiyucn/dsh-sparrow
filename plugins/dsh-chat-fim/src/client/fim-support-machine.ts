/**
 * FIM 支持状态机：idle → checking ⇄ retrying → supported / unsupported / failed；没有定论就不显示（idle / checking / retrying 都隐藏）。
 * 事件都带地址（sessionId + modelKey），地址不是当前上下文的、或不是当前阶段合法的，一律作废——状态机自身即竞态闸门，不靠 alive 标志。
 * 未知 ≠ 支持：host 对「判不了」与「判为不支持」给两种回答，故未知单独成相并做有界补查，补查耗尽才 fail-open 显示。
 */

export interface FimSupportAddress {
  readonly sessionId: string
  /** 当前选中模型的 provider:model；'' = 模型未解析（默认兜底窗口）。 */
  readonly modelKey: string
}

export type FimSupportPhase = 'idle' | 'checking' | 'retrying' | 'supported' | 'unsupported' | 'failed'

export interface FimSupportState {
  readonly phase: FimSupportPhase
  readonly address: FimSupportAddress
  /** 当前应显示的支持态（换上下文时携带上一答案防闪烁）。 */
  readonly shown: boolean
  /** 已用补查次数（未知答案时递增）；仅在 retrying/failed 有意义。 */
  readonly attempts: number
}

export type FimSupportEvent =
  | { readonly type: 'context-changed'; readonly address: FimSupportAddress }
  | { readonly type: 'checked'; readonly address: FimSupportAddress; readonly supported: boolean }
  | { readonly type: 'unknown'; readonly address: FimSupportAddress }
  | { readonly type: 'retry-tick'; readonly address: FimSupportAddress }

/** 未知答案（host 判不了：会话尚未激活 / 路由不可达）的补查策略：首次间隔取小以便定论尽快到位，其后按倍数退避覆盖大日志会话的慢激活；总次数有界 → 定时器不会无限重排。 */
export const FIM_SUPPORT_UNKNOWN_RETRY_MS = 500
export const FIM_SUPPORT_UNKNOWN_RETRY_FACTOR = 2
export const FIM_SUPPORT_UNKNOWN_RETRIES = 5

/**
 * 第 n 次补查前的等待毫秒（n 从 1 起）：500 / 1000 / 2000 / 4000 / 8000，合计 15.5s。
 * 非有限/非正数一律按第 1 次处理：`setTimeout(NaN)` 会**立即**触发，等于把有界补查退化成忙轮询。
 */
export function fimSupportRetryDelayMs(
  attempt: number,
  baseMs: number = FIM_SUPPORT_UNKNOWN_RETRY_MS,
  factor: number = FIM_SUPPORT_UNKNOWN_RETRY_FACTOR,
): number {
  const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : FIM_SUPPORT_UNKNOWN_RETRY_MS
  const safeFactor = Number.isFinite(factor) && factor > 1 ? factor : FIM_SUPPORT_UNKNOWN_RETRY_FACTOR
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.trunc(attempt)) : 1
  return safeBase * safeFactor ** (safeAttempt - 1)
}

export const initialFimSupportState: FimSupportState = {
  phase: 'idle',
  address: { sessionId: '', modelKey: '' },
  // 首帧/首次查询期间先不显示：此时还没有答案，显示等于凭猜测 fail-open；判不了会走 unknown → retrying，拿到定论即追平。
  shown: false,
  attempts: 0,
}

function sameAddress(left: FimSupportAddress, right: FimSupportAddress): boolean {
  return left.sessionId === right.sessionId && left.modelKey === right.modelKey
}

/** 单次迁移：换会话/换模型 → 进入 checking 并携带上一显示态（不闪）且清零补查计数；其余事件仅地址与阶段都匹配时生效。 */
export function fimSupportReducer(state: FimSupportState, event: FimSupportEvent): FimSupportState {
  if (event.type === 'context-changed') {
    return { phase: 'checking', address: event.address, shown: state.shown, attempts: 0 }
  }
  if (state.phase === 'idle') return state
  if (!sameAddress(state.address, event.address)) return state // 旧地址事件：作废
  if (event.type === 'retry-tick') {
    if (state.phase !== 'retrying') return state
    return { phase: 'checking', address: state.address, shown: state.shown, attempts: state.attempts }
  }
  if (state.phase !== 'checking') return state // checked/unknown 仅在查询中有效
  if (event.type === 'unknown') {
    // 判不了：留出补查预算（携带上一显示态，不闪）；预算用尽才 fail-open 定案。
    return state.attempts >= FIM_SUPPORT_UNKNOWN_RETRIES
      ? { phase: 'failed', address: state.address, shown: true, attempts: state.attempts }
      : { phase: 'retrying', address: state.address, shown: state.shown, attempts: state.attempts + 1 }
  }
  return {
    phase: event.supported ? 'supported' : 'unsupported',
    address: state.address,
    shown: event.supported,
    attempts: state.attempts,
  }
}

export function fimSupportShown(state: FimSupportState): boolean {
  return state.shown
}
