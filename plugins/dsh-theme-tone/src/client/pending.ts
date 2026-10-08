/**
 * 「用户刚点、还没等到宿主回话」的那几笔色调 —— 乐观值的**归属**跟踪（纯逻辑，供单测）。⚠️ **不能按「快照 `revision` 前进过 = 有结论」判**：`ConfigForm.set()` 是跨宿主往返（真机 1.5–4s），期间能再点第二张色卡 ⇒ 两笔同时在途，先发那笔的结算同样让 revision 前进、更新的那笔被误当作废（画面来回跳）。
 * 归属规则：所有权**跟它自己那一笔写入走**（`begin` 发号、`settle` 只认最新一号；宿主接受与拒绝都算结算，故不必猜「值有没有变」）。
 * 按**字段**分别记账 —— 浅色与深色两轴各写各的字段，切轴选色不该顶掉另一轴在途的那一笔。
 */

import type { DarkToneId, LightToneId, ThemeToneSettings, ToneId } from '../tones.js'

/** 色调设置的两个字段（明暗轴各一）。 */
export type ToneField = 'lightTone' | 'darkTone'

/** 一笔在途写入 —— 乐观值的所有权凭据，`settle` 时原样回传。 */
export interface PendingToneWrite {
  readonly field: ToneField
  readonly id: ToneId
  /** 发号（单调递增，只用于判「还是最新那一笔吗」）。 */
  readonly seq: number
}

/** 在途乐观值的记账面。 */
export interface PendingToneTracker {
  /** 记下一笔刚发出的写入，返回所有权凭据（结算时回传给 {@link PendingToneTracker.settle}）。 */
  begin(field: ToneField, id: ToneId): PendingToneWrite
  /** 结算一笔写入。⚠️ **被更新的点击顶掉过的那一笔无权收掉乐观值** —— 这正是本模块存在的理由。 */
  settle(write: PendingToneWrite): boolean
  /** 把在途的乐观值盖到一份设置节上（未在途的字段原样透传）。 */
  over(base: ThemeToneSettings): ThemeToneSettings
}

export function createPendingToneTracker(): PendingToneTracker {
  /** 每个字段各自的最新一笔；两个字段互不顶替。 */
  const latest = new Map<ToneField, PendingToneWrite>()
  let seq = 0

  return {
    begin(field, id) {
      const write: PendingToneWrite = { field, id, seq: ++seq }
      latest.set(field, write)
      return write
    },

    settle(write) {
      const current = latest.get(write.field)
      // 已被同字段更新的一笔取代（或本来就不在册）→ 无权收，乐观值继续生效。
      if (current === undefined || current.seq !== write.seq) return false
      latest.delete(write.field)
      return true
    },

    over(base) {
      if (latest.size === 0) return base
      let merged = base
      for (const write of latest.values()) {
        // 调用方按轴发号（`toneFieldFor(scheme)` + 该轴可用 id），故 id 必然合法；这里只补类型收窄。
        merged = write.field === 'darkTone'
          ? { ...merged, darkTone: write.id as DarkToneId }
          : { ...merged, lightTone: write.id as LightToneId }
      }
      return merged
    },
  }
}
