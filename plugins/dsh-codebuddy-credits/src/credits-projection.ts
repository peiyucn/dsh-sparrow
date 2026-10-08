/**
 * 会话积分投影单元（官方 `session-projections` 契约）：live 会话逐事件喂入（天然幂等，**别**加 seq 去重），冷会话重放见 `credits-ledger.ts`；
 * `eventAt()` / `snapshotEvents()` / `ownEvents()` 自 0.1.7 废弃、新调用被禁。
 * 硬约束：`init` / `apply` 同步、无关事件返回同一引用（`Object.is` 判变化）；state 须无损 JSON（`Map` / `undefined` / 非有限数致整条缓存落盘失败）；形状一变即 `stateVersion` +1。
 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { creditSampleOf } from './credits-ledger.js'
import type { CreditEntry, CreditsView } from './credits-ledger.js'

/** 按模型聚合的一行；独立于 `credits-ledger.ts` 的 `readonly` 形状——投影 state 必须可 `structuredClone`。 */
export interface CreditsModelRow {
  model: string
  credit: number
  calls: number
}

/** 单轮聚合（同上，可变形状）。 */
export interface CreditsTurnRow {
  credit: number
  calls: number
  byModel: CreditsModelRow[]
}

/** 一行的会话投影状态（全会话合计）。 */
export interface CreditsProjectionState {
  credit: number
  calls: number
  byModel: CreditsModelRow[]
  /** 每轮聚合；键 `String(turn)`——**必须**是字符串键的普通对象（`Map` 过不了投影缓存的无损 JSON 校验）。 */
  byTurn: Record<string, CreditsTurnRow>
}

/** 空状态（也是 `init` 的返回值）。 */
export function emptyCreditsState(): CreditsProjectionState {
  return { credit: 0, calls: 0, byModel: [], byTurn: {} }
}

const modelCreditsSchema = z.object({
  model: z.string(),
  // credit 是小数（CodeBuddy 按小数计费），故 z.number() 而非 .int()；它也拒绝 NaN / Infinity——
  // 非有限数入 state 会让投影缓存整条落盘失败。
  credit: z.number(),
  calls: z.number().int().nonnegative(),
}).strict()

const turnCreditsSchema = z.object({
  credit: z.number(),
  calls: z.number().int().nonnegative(),
  byModel: z.array(modelCreditsSchema),
}).strict()

/** 状态 schema——投影缓存回读时的**输入边界**：严格模式，形状不认识即抛，让该行作废并整段重折（不带病续算）。 */
export const creditsProjectionStateSchema = z.object({
  credit: z.number(),
  calls: z.number().int().nonnegative(),
  byModel: z.array(modelCreditsSchema),
  // `byTurn` 是按 turn key 的字典：必须 `.strict()`，否则带多余字段的脏行会静默通过校验、
  // 把没被理解的旧形状当有效缓存继续用（与「形状不认识就作废该行」的既定口径相反）。
  byTurn: z.record(z.string(), turnCreditsSchema.strict()),
}).strict()

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    codebuddyCredits: CreditsProjectionState
  }
}

/** 返回新数组（不改入参）。 */
function addModelRow(rows: readonly CreditsModelRow[], sample: CreditEntry): CreditsModelRow[] {
  const index = rows.findIndex(row => row.model === sample.model)
  if (index < 0) return [...rows, { model: sample.model, credit: sample.credit, calls: 1 }]
  const next = rows.slice()
  const current = rows[index] as CreditsModelRow
  next[index] = { model: current.model, credit: current.credit + sample.credit, calls: current.calls + 1 }
  return next
}

/** 纯转移：状态 + 一条已提交事件 → 新状态；与本单元无关的事件返回入参本身（同引用）。
 * 重试的每次扣费都累加、不覆盖（与 `credits-ledger.ts` 同口径）；去重由注册表水位保证，本函数不做。 */
export function applyCreditsEvent(state: CreditsProjectionState, event: SessionEvent): CreditsProjectionState {
  const sample = creditSampleOf(event)
  if (sample === undefined) return state
  const key = String(sample.turn)
  const turn = state.byTurn[key] ?? { credit: 0, calls: 0, byModel: [] }
  return {
    credit: state.credit + sample.credit,
    calls: state.calls + 1,
    byModel: addModelRow(state.byModel, sample),
    byTurn: {
      ...state.byTurn,
      [key]: {
        credit: turn.credit + sample.credit,
        calls: turn.calls + 1,
        byModel: addModelRow(turn.byModel, sample),
      },
    },
  }
}

/** 把投影状态包成读面（每次读返回新的视图对象，调用方持有的引用不会被后续事件改写）。 */
export function viewOfCreditsState(state: CreditsProjectionState): CreditsView {
  return {
    session: () => ({ credit: state.credit, calls: state.calls, byModel: state.byModel }),
    turn: turn => state.byTurn[String(turn)] ?? { credit: 0, calls: 0, byModel: [] },
  }
}

/** 注册到 `ctx.sessionProjections` 的单元定义。**host-only**（不带 `wire`）：积分只由本插件自己的 HTTP 路由读，
 * 不给客户端投影表新增跨包契约键；host-only 单元同样会被官方投影缓存 checkpoint。 */
export const codebuddyCreditsProjectionDefinition = {
  key: 'codebuddyCredits',
  stateVersion: 1,
  stateSchema: creditsProjectionStateSchema,
  init: () => emptyCreditsState(),
  apply: applyCreditsEvent,
} satisfies ProjectionDefinition<'codebuddyCredits', CreditsProjectionState>
