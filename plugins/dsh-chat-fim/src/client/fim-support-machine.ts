/**
 * FIM 支持状态机（「当前会话+模型是否支持续写」的判定管线）。
 *
 * 阶段：idle（未开始）→ checking（查询中）→
 *       supported / unsupported（定论）/ failed（查询失败，按支持显示——与历史行为一致）。
 * shown 是当前应显示的支持态：换上下文时携带上一答案（防「均不支持模型间切换闪出」），
 * 等新判定到达才翻。事件都携带地址（sessionId + modelKey）：地址不是当前上下文的
 * 旧事件、或不是 checking 阶段的 checked/check-failed，一律作废——状态机自身就是
 * 唯一竞态闸门（对齐 vision-bridge 的 capability-machine，不靠 alive 标志）。
 */

export interface FimSupportAddress {
  readonly sessionId: string
  /** 当前选中模型的 provider:model；'' = 模型未解析（默认兜底窗口）。 */
  readonly modelKey: string
}

export type FimSupportPhase = 'idle' | 'checking' | 'supported' | 'unsupported' | 'failed'

export interface FimSupportState {
  readonly phase: FimSupportPhase
  readonly address: FimSupportAddress
  /** 当前应显示的支持态（换上下文时携带上一答案防闪烁）。 */
  readonly shown: boolean
}

export type FimSupportEvent =
  | { readonly type: 'context-changed'; readonly address: FimSupportAddress }
  | { readonly type: 'checked'; readonly address: FimSupportAddress; readonly supported: boolean }
  | { readonly type: 'check-failed'; readonly address: FimSupportAddress }

export const initialFimSupportState: FimSupportState = {
  phase: 'idle',
  address: { sessionId: '', modelKey: '' },
  shown: true,
}

function sameAddress(left: FimSupportAddress, right: FimSupportAddress): boolean {
  return left.sessionId === right.sessionId && left.modelKey === right.modelKey
}

/** 单次迁移。换会话/换模型 → 进入 checking 并携带上一显示态（不闪）；其余事件
 *  仅在其地址与阶段都匹配时生效。 */
export function fimSupportReducer(state: FimSupportState, event: FimSupportEvent): FimSupportState {
  if (event.type === 'context-changed') {
    return { phase: 'checking', address: event.address, shown: state.shown }
  }
  if (state.phase === 'idle') return state
  if (!sameAddress(state.address, event.address)) return state // 旧地址事件：作废
  if (state.phase !== 'checking') return state // checked/check-failed 仅在查询中有效
  if (event.type === 'check-failed') {
    return { phase: 'failed', address: state.address, shown: true }
  }
  return {
    phase: event.supported ? 'supported' : 'unsupported',
    address: state.address,
    shown: event.supported,
  }
}

/** 当前应显示的支持态。 */
export function fimSupportShown(state: FimSupportState): boolean {
  return state.shown
}
