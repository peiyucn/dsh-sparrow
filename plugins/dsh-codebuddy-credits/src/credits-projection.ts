/**
 * 会话积分投影单元（官方 `session-projections` 契约）——**替代被废弃的同步历史读**。
 *
 * ## 为什么要有这个文件
 *
 * 本插件原先的 live 路径是 `ctx.sessions.get(id).snapshotEvents()`（同步读整段事件日志）。
 * 官方自 0.1.7 起把 `Session.eventAt()` / `snapshotEvents()` / `ownEvents()` 标为
 * `@deprecated`，原话是「Existing logic may remain unmigrated for now, but **new calls are
 * prohibited**」（`.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md`），
 * 并给出替代方向：**把领域状态折成一个 session projection，恢复期重建、此后只吃新提交的事件**
 * ——「After resume, ordinary logic reads the projection or processes the delivered current event
 * instead of looking back through historical events.」
 *
 * 本文件就是那个投影单元。迁完之后插件**不再调用任何被废弃的读接口**。
 *
 * ## 契约要点（逐条对齐官方 `packages/session/session-projection/src/index.ts`）
 *
 * * **纯同步**：`init` / `apply` 必须同步（异步单元会撕裂载体的「一致性切面」）。
 * * **`apply` 无兴趣时必须返回同一个引用**：注册表用 `Object.is` 判断变化——
 *   返回同引用即零下游工作（`drive()` 的 `changed` 分支）。非本 provider 的事件、没有
 *   usage 帧的事件都走这条。
 * * **state 必须是**「无损 JSON」（可 `structuredClone`、可 round-trip）：
 *   官方投影缓存会 `snapshotJsonValue()` 校验后落盘，**出现 `Map` / `undefined` / 非有限数
 *   即整条记录写盘失败**（`snapshotJsonValue` 返回 undefined → 抛 TypeError）。
 *   故本单元的 turn 表用 `Record<string, …>`（键 `String(turn)`）而非 `Map`。
 * * **可持久化即需版本**：`stateVersion` 变更会让旧缓存行作废并整段重折
 *   （`restore()` 按 `ver` 判可用）。折叠语义或字段形状一变就要 +1。
 *
 * ## 与 `credits-ledger.ts` 的分工（两者都不重复）
 *
 * * 本文件 = **live 会话**的状态机（注册表逐事件驱动，天然只吃新事件、天然幂等，
 *   因此**不需要**按 seq 键控去重，也不需要增量游标）。
 * * `credits-ledger.ts` = **冷会话**（重启后未激活）的一次性重放，仍走
 *   `sessionController.inspect()` + `foldSessionCredits()`；其 `seq` 键控去重
 *   服务于「同一批事件被反复全量折叠」这条路径。
 *
 * 两条路径共用同一个「取样本」函数 `creditSampleOf()`，所以口径不会分叉。
 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { creditSampleOf } from './credits-ledger.js'
import type { CreditEntry, CreditsView, ModelCredits } from './credits-ledger.js'

/**
 * 按模型聚合的一行（**可变数组**：投影状态必须是可 `structuredClone` 的普通 JSON，
 * 而 `credits-ledger.ts` 的 `TurnCredits.byModel` 是 `readonly`，不能直接复用）。
 */
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
  /**
   * 每轮聚合。键是 `String(turn)`——**必须**是字符串键的普通对象，
   * 才能通过投影缓存的「无损 JSON」校验（`Map` 会被拒）。
   */
  byTurn: Record<string, CreditsTurnRow>
}

/** 空状态（也是 `init` 的返回值）。 */
export function emptyCreditsState(): CreditsProjectionState {
  return { credit: 0, calls: 0, byModel: [], byTurn: {} }
}

const modelCreditsSchema = z.object({
  model: z.string(),
  // credit 是浮点数（CodeBuddy 按小数计费），故用 z.number() 而非 .int()。
  // zod 的 z.number() 默认拒绝 NaN / Infinity —— 正是我们要的：非有限数一旦入 state，
  // 投影缓存的落盘校验会整条拒绝。
  credit: z.number(),
  calls: z.number().int().nonnegative(),
}).strict()

const turnCreditsSchema = z.object({
  credit: z.number(),
  calls: z.number().int().nonnegative(),
  byModel: z.array(modelCreditsSchema),
}).strict()

/**
 * 状态 schema —— 投影缓存落盘后回读时的**输入边界**（`def.stateSchema.parse(row.val)`）。
 * 严格模式：字段形状不认识就抛，让那一行作废并整段重折，而不是带病续算。
 */
export const creditsProjectionStateSchema = z.object({
  credit: z.number(),
  calls: z.number().int().nonnegative(),
  byModel: z.array(modelCreditsSchema),
  byTurn: z.record(z.string(), turnCreditsSchema),
}).strict()

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    codebuddyCredits: CreditsProjectionState
  }
}

/** 把一条样本并入按模型分组的行（返回新数组，不改入参）。 */
function addModelRow(rows: readonly CreditsModelRow[], sample: CreditEntry): CreditsModelRow[] {
  const index = rows.findIndex(row => row.model === sample.model)
  if (index < 0) return [...rows, { model: sample.model, credit: sample.credit, calls: 1 }]
  const next = rows.slice()
  const current = rows[index] as CreditsModelRow
  next[index] = { model: current.model, credit: current.credit + sample.credit, calls: current.calls + 1 }
  return next
}

/**
 * 纯转移：状态 + 一条已提交事件 → 新状态。
 *
 * 非本 provider / 无 usage 帧的事件**原样返回**（同引用 ⇒ 注册表判定零变化）。
 * 其余事件各计一笔——与 `credits-ledger.ts` 的口径一致（owner 2026-09-21：
 * 「真实表达，不能真花了我们又给藏起来」，所以重试的每一次扣费都累加、不覆盖）。
 * 去重由注册表的水位（`observedSeq`）保证：每条事件只被喂进 `apply` 一次。
 *
 * @param state - 覆盖此前全部事件的状态。
 * @param event - 下一条已提交事件。
 * @returns 新状态；事件与本单元无关时返回入参本身。
 */
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

/**
 * 注册到 `ctx.sessionProjections` 的单元定义。
 *
 * **host-only**（不带 `wire` 块）：积分只由本插件自己的 HTTP 路由（`/session-usage`、
 * `/turn-usage`）读，不需要给客户端投影表新增键——少一个键就少一处跨包契约面。
 * host-only 单元同样会被官方投影缓存 checkpoint（这是它的设计），
 * 代价是每次落盘多一段本单元的状态；状态规模与轮次数同阶，可接受。
 */
export const codebuddyCreditsProjectionDefinition = {
  key: 'codebuddyCredits',
  stateVersion: 1,
  stateSchema: creditsProjectionStateSchema,
  init: () => emptyCreditsState(),
  apply: applyCreditsEvent,
} satisfies ProjectionDefinition<'codebuddyCredits', CreditsProjectionState>
