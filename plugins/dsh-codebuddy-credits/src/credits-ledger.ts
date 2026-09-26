/**
 * 会话积分账本：从**会话事件重放**出每轮/每会话的积分消耗，替代早期的进程内
 * usageLog（重启即清零）。
 *
 * 数据来源：适配器在 finish 块写入 `replayState: { response: { model, usage } }`，
 * 其中 `usage` 是 CodeBuddy 原始 usage 帧、含 credit（DSH 的 TokenUsage 无该字段）。
 * 该字段随会话事件持久化，故重启后仍可从事件前缀重放出来。
 *
 * 实测（2026-09-18，真实会话 1447 事件）credit 的行内路径：
 *   - `data.message.source.replayState.response.usage.credit`（每条事件恰一份）
 *   - `data.stream[].chunk.replayState.response.usage.credit`（同一份数据）
 * 取前者：无需展开数组；且 `data.message.source` 带 provider，可精确判别归属。
 *
 * 记账口径：**每一次真实扣费都计入**（按事件 `seq` 键控去重，见下）。
 *
 * ## 为什么不再是「同 (turn, step) 只取最后一次」
 *
 * owner 口径（2026-09-21）：「**真实表达，不能真花了我们又给藏起来**」。
 * 原先按 `(turn, step)` last-wins，重试时新样本会**覆盖**旧样本 —— 若两次尝试
 * 都被服务端计费，被覆盖的那次就**从账面上消失了**。
 *
 * 官方 `token-meter` 同样**不覆盖**：收到 `llm/retry-started` 时它把 `last` 槽清空
 * （`usage-projection.ts:123-127`），使重试样本走 `addReplacing`（:34-40）时
 * `previous` 为 undefined → **两次消耗都留在总数里**。故本插件改为**逐次累加**，
 * 与官方口径一致，且不会有任何一次扣费被隐藏。
 *
 * ## 幂等怎么保证（不能因为改成累加就重复计数）
 *
 * 条目表按**事件自身的 `seq`** 键控，而不是 `(turn, step)`：
 * * 不同事件 → 不同 seq → 不同条目 → **各自累加**（重试两次就是两笔）；
 * * 同一事件被重复折叠（客户端流式期间按去抖反复拉全量前缀）→ 同一个 seq →
 *   `Map.set` 覆盖同一个键 → **值不变**，天然幂等。
 *
 * 另有 `seq <= asOfSeq` 的增量跳过作为第二道闸门。两者叠加：既如实、又可重复调用。
 * （实测 2026-09-21：21 个真实会话 / 9331 份 credit，`(turn,step)` **全部唯一**，
 * 即「覆盖」这条分支在既有数据里从未生效 —— 本次改动是消除**潜在**的隐藏风险，
 * 不改变任何既有会话的现有数字。）
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** 单次调用的记账条目。 */
export interface CreditEntry {
  turn: number
  step: number
  model: string
  credit: number
}

/** 模型维度的聚合行。 */
export interface ModelCredits {
  model: string
  credit: number
  calls: number
}

/** 一轮的积分视图。 */
export interface TurnCredits {
  credit: number
  calls: number
  byModel: readonly ModelCredits[]
}

/**
 * 账本读面（对外只给聚合值 + 可增量续算的游标）。
 * `entries` 按**事件 seq** 键控，是聚合的唯一真源。
 */
export interface CreditLedger {
  readonly credit: number
  readonly calls: number
  readonly byModel: readonly ModelCredits[]
  readonly byTurn: ReadonlyMap<number, TurnCredits>
  /** 已折叠到的最后事件 seq；-1 表示空日志（增量折叠的游标）。 */
  readonly asOfSeq: number
  /** 条目表（键 = 事件 seq；内部用于增量续算与幂等，调用方不应依赖其顺序）。 */
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

/** 空账本。 */
export function emptyLedger(): CreditLedger {
  return { credit: 0, calls: 0, byModel: [], byTurn: new Map(), asOfSeq: -1, entries: new Map() }
}

/**
 * 从一条事件取出本 provider 的样本。非本 provider / 无 usage 帧时返回 undefined。
 *
 * 有 usage 帧但缺 credit（免费模型未返回该字段）时**仍计一次调用、credit 记 0**——
 * 与改前的进程内记账口径一致（调用次数不因缺 credit 而丢失）。
 *
 * @param event - 会话事件。
 * @returns 样本，或 undefined（该事件不计账）。
 */
export function creditSampleOf(event: SessionEvent): CreditEntry | undefined {
  if (event.type !== 'assistant/message') return undefined
  const data = (event as { data?: { turn?: unknown; step?: unknown; message?: { source?: SourceLike } } }).data
  const source = data?.message?.source
  if (source === undefined || source === null) return undefined
  // 只认本 provider 的样本：同一会话可能混有其它 provider 的 assistant 消息。
  if (source.provider !== PROVIDER_ID) return undefined
  const usage = source.replayState?.response?.usage
  // 无 usage 帧 = 这次调用没有产生计量样本（如流中断），不计账。
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
 * 折叠一串事件。
 *
 * 纯函数：不改动入参 `from`（内部复制条目表后再写入）。
 *
 * @param events - 会话事件序列（按 seq 升序）。
 * @param from - 既有账本，做增量折叠（只折 `seq > from.asOfSeq` 的事件）。
 * @returns 折叠后的新账本。
 */
export function foldSessionCredits(
  events: readonly SessionEvent[],
  from?: CreditLedger,
): CreditLedger {
  // 复制一份条目表：写入落在副本上，不碰入参（纯函数）。
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
    // 键的选择决定「重试是否被隐藏」与「重复折叠是否翻倍」，两者都要成立：
    //
    // * **有数字 seq**（真实日志恒有）：按 seq 键控 → 不同事件各占一条（每次真实扣费
    //   都保留，重试不互相覆盖）；同一事件被重复折叠时命中同一个键 → 覆盖同值 → 幂等。
    // * **没有数字 seq**（防御上游形状变化）：退化为 `(turn, step)` 键控。同一步的
    //   第二笔会覆盖第一笔 —— 这是**已知且有意**的取舍：无 seq 时无法区分「同一事件
    //   被折两次」与「同一步真扣了两笔」，而**重复计数**比**少算**更危险（前者会让
    //   用户以为花了更多钱）。有 seq 的主路径不受影响。
    const key = typeof seq === 'number' ? `s${seq}` : `t${sample.turn}/${sample.step}`
    entries.set(key, sample)
    touched = true
  }

  if (!touched && from !== undefined && asOfSeq === from.asOfSeq) return from
  return materialize(entries, asOfSeq)
}

/**
 * 账本读面 —— **两条取数路径共同的对外形状**。
 *
 * live 会话由官方投影单元（`credits-projection.ts`）提供，冷会话由本模块的
 * `foldSessionCredits()` 重放提供；两者都归约成这个接口，上层的 HTTP 路由与
 * 视图层因此对「数据从哪条路来」完全无感。
 */
export interface CreditsView {
  /** 会话累计视图（全会话合计）。 */
  session(): TurnCredits
  /** 单轮视图；无该轮的返回零值（`calls=0`，供上层判空不渲染）。 */
  turn(turn: number): TurnCredits
}

/** 取某轮的积分视图；无该轮返回零值（`calls=0`，供上层判空不渲染）。 */
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

/** 会话视图（全会话合计）。 */
export function sessionViewOf(ledger: CreditLedger): TurnCredits {
  return { credit: ledger.credit, calls: ledger.calls, byModel: ledger.byModel }
}
