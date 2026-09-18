/**
 * FIM 支持状态机（「当前会话+模型是否支持续写」的判定管线）。
 *
 * 阶段：idle（未开始）→ checking（查询中）⇄ retrying（答案未知，等补查）
 *       → supported / unsupported（定论）/ failed（补查耗尽，按支持显示）。
 * shown 是当前应显示的支持态：**没有定论就不显示**（idle / checking / retrying 都隐藏），
 * 拿到定论才翻；换上下文时携带上一答案（防「均不支持模型间切换闪出」）。
 * 事件都携带地址（sessionId + modelKey）：地址不是当前上下文的旧事件、或不是当前阶段
 * 合法的事件，一律作废——状态机自身就是唯一竞态闸门（对齐 vision-bridge 的
 * capability-machine，不靠 alive 标志）。
 *
 * **未知 ≠ 支持**（2026-09-17 修）：宿主对「判不了」与「判为不支持」给的是两种回答。
 * 冷启动时客户端会先于宿主激活会话发起查询，host 的 GET 以 404 UNKNOWN_SESSION 回
 * 「现在判不了」；旧实现把任何非 2xx 都当「支持」（fail-open），于是一旦首发命中 404，
 * 开关就与所选模型无关地**常显**，直到整页刷新（此时会话已激活，首发即得真值）——
 * 这正是 owner 报的「启动 dsh 时不管选哪个模型都显示，刷新一下才对」。
 * 现在未知单独成相并做**有界补查**：会话激活后补查拿到定论，开关随模型追平；
 * 补查耗尽才落 failed 并 fail-open 显示（不因探测不可靠而永久隐藏功能）。
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
  /** 已用补查次数（未知答案时递增，落到上限即定案 fail-open）。仅在 retrying/failed 有意义。 */
  readonly attempts: number
}

export type FimSupportEvent =
  | { readonly type: 'context-changed'; readonly address: FimSupportAddress }
  | { readonly type: 'checked'; readonly address: FimSupportAddress; readonly supported: boolean }
  | { readonly type: 'unknown'; readonly address: FimSupportAddress }
  | { readonly type: 'retry-tick'; readonly address: FimSupportAddress }

/**
 * 未知答案（host 判不了：会话尚未激活 / 路由不可达）的补查策略。
 *
 * 首次间隔取小：会话激活通常在**毫秒~百毫秒级**，短间隔让定论尽快到位、开关尽快追平；
 * 其后按 {@link FIM_SUPPORT_UNKNOWN_RETRY_FACTOR} 退避，覆盖大日志会话（本机实测
 * 最大 39 MB）的慢激活。总次数有界 → 定时器不会无限重排。
 */
export const FIM_SUPPORT_UNKNOWN_RETRY_MS = 500
export const FIM_SUPPORT_UNKNOWN_RETRY_FACTOR = 2
export const FIM_SUPPORT_UNKNOWN_RETRIES = 5

/**
 * 第 n 次补查前的等待毫秒（n 从 1 起）：500 / 1000 / 2000 / 4000 / 8000，合计 15.5s。
 * 非有限/非正数一律按第 1 次处理：`setTimeout(NaN)` 会**立即**触发，等于把有界补查
 * 退化成忙轮询，故这里必须给安全默认值而不是把 NaN 传下去。
 * @param attempt - 第几次补查（从 1 起）。
 * @param baseMs - 首次间隔。
 * @param factor - 每次退避倍数。
 * @returns 等待毫秒（恒为有限正数）。
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
  // 首帧/首次查询期间**先不显示**：此时还没有任何答案，显示等于凭猜测 fail-open，
  // 而冷启动的第一次查询正是判不了的那一次——猜「支持」就是 owner 报的
  // 「不管选哪个模型都出现」。判不了不再是定案（见 unknown → retrying），
  // 所以隐藏只是「还没答案」，拿到定论即追平；真判不了到预算耗尽会 fail-open 显示。
  // 与 vision-bridge 的能力机同口径（idle/未定论 → 不显示）。
  shown: false,
  attempts: 0,
}

function sameAddress(left: FimSupportAddress, right: FimSupportAddress): boolean {
  return left.sessionId === right.sessionId && left.modelKey === right.modelKey
}

/** 单次迁移。换会话/换模型 → 进入 checking 并携带上一显示态（不闪）且清零补查计数；
 *  其余事件仅在其地址与阶段都匹配时生效。 */
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

/** 当前应显示的支持态。 */
export function fimSupportShown(state: FimSupportState): boolean {
  return state.shown
}
