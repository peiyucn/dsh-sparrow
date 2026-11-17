

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { PROVIDER_ID } from './constants.js'

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


export interface CreditLedger {
  readonly credit: number
  readonly calls: number
  readonly byModel: readonly ModelCredits[]
  readonly byTurn: ReadonlyMap<number, TurnCredits>

  readonly asOfSeq: number

  readonly entries: ReadonlyMap<string, CreditEntry>
}


interface SourceLike {
  provider?: unknown
  model?: unknown
  replayState?: { response?: { usage?: { credit?: unknown } } } | null
}

export function emptyLedger(): CreditLedger {
  return { credit: 0, calls: 0, byModel: [], byTurn: new Map(), asOfSeq: -1, entries: new Map() }
}


export function creditSampleOf(event: SessionEvent): CreditEntry | undefined {
  if (event.type !== 'assistant/message') return undefined
  const data = (event as { data?: { turn?: unknown; step?: unknown; message?: { source?: SourceLike } } }).data
  const source = data?.message?.source
  if (source === undefined || source === null) return undefined

  if (source.provider !== PROVIDER_ID) return undefined
  const usage = source.replayState?.response?.usage

  if (usage === undefined || usage === null || typeof usage !== 'object') return undefined
  const raw = usage.credit
  const credit = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  const turn = data?.turn
  const step = data?.step
  if (typeof turn !== 'number' || typeof step !== 'number') return undefined
  return { turn, step, model: typeof source.model === 'string' ? source.model : '', credit }
}


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

    const key = typeof seq === 'number' ? `s${seq}` : `t${sample.turn}/${sample.step}`
    entries.set(key, sample)
    touched = true
  }

  if (!touched && from !== undefined && asOfSeq === from.asOfSeq) return from
  return materialize(entries, asOfSeq)
}


export interface CreditsView {
  session(): TurnCredits

  turn(turn: number): TurnCredits
}


export function turnViewOf(ledger: CreditLedger, turn: number): TurnCredits {
  return ledger.byTurn.get(turn) ?? { credit: 0, calls: 0, byModel: [] }
}


export function viewOfLedger(ledger: CreditLedger): CreditsView {
  return {
    session: () => sessionViewOf(ledger),
    turn: turn => turnViewOf(ledger, turn),
  }
}

export function sessionViewOf(ledger: CreditLedger): TurnCredits {
  return { credit: ledger.credit, calls: ledger.calls, byModel: ledger.byModel }
}
