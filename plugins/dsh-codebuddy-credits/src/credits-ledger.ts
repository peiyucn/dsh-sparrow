/**
 * 会话积分账本：从会话事件重放出每轮/每会话消耗，替代重启即清零的进程内记账。
 * 数据源 = 适配器写入的 `replayState.response.usage.credit`（DSH TokenUsage 无该字段）。
 * 条目按事件 `seq` 键控（逐次累加、重复折叠幂等）；别改回 `(turn, step)` last-wins。
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface CreditEntry {
  turn: number
  step: number
  model: string
  credit: number
}

export interface ModelCredits {
  model: string
  credit: number
  calls: number
}

export interface TurnCredits {
  credit: number
  calls: number
  byModel: readonly ModelCredits[]
}

/** 账本读面（对外只给聚合值 + 可增量续算的游标）。 */
export interface CreditLedger {
  readonly credit: number
  readonly calls: number
  readonly byModel: readonly ModelCredits[]
  readonly byTurn: ReadonlyMap<number, TurnCredits>
  /** 已折叠到的最后事件 seq；-1 表示空日志（增量折叠的游标）。 */
  readonly asOfSeq: number
  /** 条目表（键 = 事件 seq；调用方不应依赖其顺序）。 */
  readonly entries: ReadonlyMap<string, CreditEntry>
}

/** 本 provider 的路由 id —— 与 constants.PROVIDER 一致（内联避免循环依赖）。 */
const PROVIDER_ID = 'codebuddy-credits'

/** 事件里 credit 的取数形状（只声明用到的字段，不耦合上游完整类型）。 */
interface SourceLike {
  provider?: unknown
  model?: unknown
  replayState?: { response?: { usage?: { credit?: unknown } } } | null
}

export function emptyLedger(): CreditLedger {
  return { credit: 0, calls: 0, byModel: [], byTurn: new Map(), asOfSeq: -1, entries: new Map() }
}

/** 取本 provider 的样本；缺 credit 时仍计一次调用、credit 记 0（调用次数不丢）。 */
export function creditSampleOf(event: SessionEvent): CreditEntry | undefined {
  if (event.type !== 'assistant/message') return undefined
  const data = (event as { data?: { turn?: unknown; step?: unknown; message?: { source?: SourceLike } } }).data
  const source = data?.message?.source
  if (source === undefined || source === null) return undefined
  // 同一会话可能混有其它 provider 的 assistant 消息。
  if (source.provider !== PROVIDER_ID) return undefined
  const usage = source.replayState?.response?.usage
  // 无 usage 帧 = 无计量样本（如流中断），不计账。
  if (usage === undefined || usage === null || typeof usage !== 'object') return undefined
  const raw = usage.credit
  const credit = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  const turn = data?.turn
  const step = data?.step
  if (typeof turn !== 'number' || typeof step !== 'number') return undefined
  return { turn, step, model: typeof source.model === 'string' ? source.model : '', credit }
}

/** 由条目表聚合出各视图（单趟 O(n)）。 */
function materialize(entries: ReadonlyMap<string, CreditEntry>, asOfSeq: number): CreditLedger {
  let credit = 0
  let calls = 0
  const modelIndex = new Map<string, number>()
  const byModel: { model: string; credit: number; calls: number }[] = []
  const turnAgg = new Map<number, { credit: number; calls: number; byModel: { model: string; credit: number; calls: number }[]; index: Map<string, number> }>()

  for (const entry of entries.values()) {
    credit += entry.credit
    calls += 1

    let slot = modelIndex.get(entry.model)
    if (slot === undefined) {
      slot = byModel.length
      modelIndex.set(entry.model, slot)
      byModel.push({ model: entry.model, credit: 0, calls: 0 })
    }
    byModel[slot].credit += entry.credit
    byModel[slot].calls += 1

    let agg = turnAgg.get(entry.turn)
    if (agg === undefined) {
      agg = { credit: 0, calls: 0, byModel: [], index: new Map() }
      turnAgg.set(entry.turn, agg)
    }
    agg.credit += entry.credit
    agg.calls += 1
    let tslot = agg.index.get(entry.model)
    if (tslot === undefined) {
      tslot = agg.byModel.length
      agg.index.set(entry.model, tslot)
      agg.byModel.push({ model: entry.model, credit: 0, calls: 0 })
    }
    agg.byModel[tslot].credit += entry.credit
    agg.byModel[tslot].calls += 1
  }

  const byTurn = new Map<number, TurnCredits>()
  for (const [turn, agg] of turnAgg) {
    byTurn.set(turn, { credit: agg.credit, calls: agg.calls, byModel: agg.byModel })
  }
  return { credit, calls, byModel, byTurn, asOfSeq, entries }
}

/**
 * 折叠事件为账本：纯函数（不改动 `from`）；增量只折 `seq > from.asOfSeq`。
 */
export function foldSessionCredits(
  events: readonly SessionEvent[],
  from?: CreditLedger,
): CreditLedger {
  const entries = new Map<string, CreditEntry>(from?.entries ?? [])
  let asOfSeq = from?.asOfSeq ?? -1
  let touched = false

  for (const event of events) {
    const seq = (event as { seq?: unknown }).seq
    if (typeof seq === 'number') {
      if (seq <= asOfSeq) continue
      asOfSeq = seq
    }
    const sample = creditSampleOf(event)
    if (sample === undefined) continue
    // 无 seq 的退化键 `t{turn}/{step}`：同一步第二笔会覆盖第一笔 —— 已知取舍（重复计数比少算更危险）。
    const key = typeof seq === 'number' ? `s${seq}` : `t${sample.turn}/${sample.step}`
    entries.set(key, sample)
    touched = true
  }

  if (!touched && from !== undefined && asOfSeq === from.asOfSeq) return from
  return materialize(entries, asOfSeq)
}

/** 两条取数路径的共同形状：live 走 `credits-projection.ts`，冷会话走本模块重放。 */
export interface CreditsView {
  session(): TurnCredits
  /** 单轮视图；无该轮返回零值（`calls=0`）。 */
  turn(turn: number): TurnCredits
}

/** 无该轮时返回零值（`calls=0`）。 */
export function turnViewOf(ledger: CreditLedger, turn: number): TurnCredits {
  return ledger.byTurn.get(turn) ?? { credit: 0, calls: 0, byModel: [] }
}

/** 把账本包成读面（冷会话路径用）。 */
export function viewOfLedger(ledger: CreditLedger): CreditsView {
  return {
    session: () => sessionViewOf(ledger),
    turn: turn => turnViewOf(ledger, turn),
  }
}

export function sessionViewOf(ledger: CreditLedger): TurnCredits {
  return { credit: ledger.credit, calls: ledger.calls, byModel: ledger.byModel }
}
