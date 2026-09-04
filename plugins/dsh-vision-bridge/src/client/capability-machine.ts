/**
 * 视觉能力解析状态机（小眼睛图标的能力查询管线）。
 *
 * 阶段：idle（未开始）→ resolving（查询中）⇄ retrying（未知答案，等待补查）
 *       → settled（终态：定论或补查耗尽）/ failed（查询失败，隐藏图标）。
 * 事件都携带目标地址（provider:model，''/'' = host 共享默认模型兜底）：
 * 地址不是当前解析目标的旧事件、或不是当前阶段合法的事件，一律作废——
 * 状态机自身就是唯一竞态闸门，不需要 alive 标志之类的旁路确认。
 */

/** 图标状态：cross-model=可跨模型读图（蓝紫点亮）；native-vision=原生视觉（灰显）；no-vision=无视觉能力（带斜线）。 */
export type VisionStatusMode = 'cross-model' | 'native-vision' | 'no-vision'

export interface VisionStatusResult {
  readonly mode: VisionStatusMode
  /** host 实际配置的视觉模型 id（cross-model 弹窗里明示发往哪个模型）。 */
  readonly visionModel: string
  /** host 是否给出定论（模型事实已装载）；false = 能力未知，会短时补查自愈。 */
  readonly declared: boolean
}

/** 能力未知（declared:false）时的补查间隔与次数上限——provider 目录启动期
 *  未就绪的假阴性会在几秒内被纠正，不把图标锁在错误状态。 */
export const CAPABILITY_UNKNOWN_RETRY_MS = 2_500
export const CAPABILITY_UNKNOWN_RETRIES = 4

/** host 能力查询的超时上限：路由走本地回环、正常毫秒级；超时按查询失败
 *  （图标隐藏，fail-soft）处理，不把图标悬挂在永不 settle 的请求上。 */
export const CAPABILITY_QUERY_TIMEOUT_MS = 10_000

/** 解析目标：provider:model；两者皆空 = host 共享默认模型兜底。 */
export interface CapabilityTarget {
  readonly provider: string
  readonly model: string
}

export type CapabilityPhase = 'idle' | 'resolving' | 'retrying' | 'settled' | 'failed'

/**
 * 统一形状的机器状态：槽位固定、语义由 phase 决定。
 * - shown：当前仍应显示的答案（换模型时携带防闪烁）；idle/failed 恒为 null。
 * - attempts：已用补查次数，仅在 resolving/retrying 之间演进。
 */
export interface CapabilityState {
  readonly phase: CapabilityPhase
  readonly target: CapabilityTarget
  readonly shown: VisionStatusResult | null
  readonly attempts: number
}

export type CapabilityEvent =
  | { readonly type: 'model-changed'; readonly target: CapabilityTarget }
  | { readonly type: 'answered'; readonly target: CapabilityTarget; readonly result: VisionStatusResult }
  | { readonly type: 'query-failed'; readonly target: CapabilityTarget }
  | { readonly type: 'retry-tick'; readonly target: CapabilityTarget }

export const initialCapabilityState: CapabilityState = {
  phase: 'idle',
  target: { provider: '', model: '' },
  shown: null,
  attempts: 0,
}

function sameTarget(left: CapabilityTarget, right: CapabilityTarget): boolean {
  return left.provider === right.provider && left.model === right.model
}

/** 单次迁移。换模型在任何阶段都重开一轮解析（携带上一答案防闪烁，
 *  failed/idle 不携带）；其余事件仅在其目标与阶段都匹配时生效。 */
export function capabilityReducer(state: CapabilityState, event: CapabilityEvent): CapabilityState {
  if (event.type === 'model-changed') {
    return {
      phase: 'resolving',
      target: event.target,
      shown: state.phase === 'resolving' || state.phase === 'retrying' || state.phase === 'settled'
        ? state.shown
        : null,
      attempts: 0,
    }
  }
  if (state.phase === 'idle') return state
  if (!sameTarget(state.target, event.target)) return state // 旧地址事件：作废
  if (event.type === 'retry-tick') {
    if (state.phase !== 'retrying') return state
    return { ...state, phase: 'resolving' }
  }
  if (state.phase !== 'resolving') return state // answered/query-failed 仅在解析中有效
  if (event.type === 'query-failed') {
    return { phase: 'failed', target: state.target, shown: null, attempts: state.attempts }
  }
  // answered：定论或补查耗尽 → 终态；未知且有余量 → 等待补查。
  if (event.result.declared || state.attempts >= CAPABILITY_UNKNOWN_RETRIES) {
    return { phase: 'settled', target: state.target, shown: event.result, attempts: state.attempts }
  }
  return { phase: 'retrying', target: state.target, shown: event.result, attempts: state.attempts + 1 }
}

/** 当前应显示的能力答案：idle/failed 隐藏，其余显示已携带/最新答案。 */
export function capabilityShown(state: CapabilityState): VisionStatusResult | null {
  return state.phase === 'resolving' || state.phase === 'retrying' || state.phase === 'settled'
    ? state.shown
    : null
}
