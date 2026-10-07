/**
 * 「用户刚点、还没等到宿主回话」的那几笔色调 —— 乐观值的**归属**跟踪（纯逻辑，供单测）。
 *
 * ## 为什么需要一层归属
 *
 * 官方的 `ConfigForm.set()` 是**跨宿主的一趟往返**。真机实测一次 `settings/mutate`
 * 要 **1.5–4s**（宿主写 profile patch 会走整轮 reconcile：`ConfigEditor.edit` →
 * `reconcileProfilePatches` → `settings/write` → `describe`）。这段时间里用户完全可能
 * 再点第二张色卡 —— 于是**两笔写入同时在途**，各自带着自己的结算。
 *
 * 旧判据是「快照 `revision` 前进过 = 宿主已就我那笔写入给出结论」。它在**单笔**在途时
 * 成立，多笔在途时**是错的**：先发那笔的结算（或被它触发的 `describe` 回读）同样会让
 * revision 前进，于是**更新的那一笔**的乐观值被误当作废 —— 画面从「第二张卡」跳回
 * 「第一张卡」，等第二笔的响应到达再跳回去。owner 报的「切换不同 tone 时会来回跳」
 * 就是这个形状；实测轨迹见 `docs/spec/01-design.md` §5。
 *
 * ## 归属规则
 *
 * 乐观值的所有权**跟它自己那一笔写入走**：`begin` 发号，`settle` 只认最新一号。
 * 先发那笔结算回来时发现号已被顶掉 → 什么都不做；**最新**那一笔结算才收掉乐观值。
 * 宿主接受与拒绝都算结算（`ConfigForm` 契约：`set()` 在 recovery 读之后 resolve
 * `true` / `false`），故不必再猜「值有没有变」—— 那正是旧判据要绕开的坑
 * （写入刚发出时快照还是旧值，按「值不等于乐观值」判就会当场把乐观值抹掉）。
 *
 * 按**字段**分别记账（不共用一个槽位）：浅色与深色两轴各写各的字段；切轴后给另一轴
 * 选色不该顶掉这一轴的在途乐观值（`tokenOverrides` 两轴一次给全，那一笔同样要算数）。
 */

import type { DarkToneId, LightToneId, ThemeToneSettings, ToneId } from '../tones.js'

/** 色调设置的两个字段（明暗轴各一）。 */
export type ToneField = 'lightTone' | 'darkTone'

/** 一笔在途写入 —— 乐观值的所有权凭据，`settle` 时原样回传。 */
export interface PendingToneWrite {
  /** 这笔写入落在哪个字段。 */
  readonly field: ToneField
  /** 乐观值（用户点中的色调 id）。 */
  readonly id: ToneId
  /** 发号（单调递增，只用于判「还是最新那一笔吗」）。 */
  readonly seq: number
}

/** 在途乐观值的记账面。 */
export interface PendingToneTracker {
  /**
   * 记下一笔刚发出的写入。
   * @param field - 该轴对应的设置字段。
   * @param id - 用户点中的色调 id（调用方按轴取，保证属于该字段的合法集合）。
   * @returns 所有权凭据，结算时回传给 {@link PendingToneTracker.settle}。
   */
  begin(field: ToneField, id: ToneId): PendingToneWrite
  /**
   * 结算一笔写入。
   *
   * ⚠️ **被更新的点击顶掉过的那一笔无权收掉乐观值** —— 这是本模块存在的理由
   * （旧判据按 revision 收，会让先发那笔的结算把后发那笔的乐观值抹掉 → 来回跳）。
   * @param write - {@link PendingToneTracker.begin} 发出的凭据。
   * @returns 真的收掉了乐观值（= 这一笔仍是该字段最新的一笔）为 true。
   */
  settle(write: PendingToneWrite): boolean
  /**
   * 把在途的乐观值盖到一份设置节上（未在途的字段原样透传）。
   * @param base - 宿主快照或进程内兜底值。
   * @returns 覆盖后的设置节（无在途写入时原样返回 `base`）。
   */
  over(base: ThemeToneSettings): ThemeToneSettings
}

/**
 * 建一个在途乐观值记账器。
 * @returns 记账面（`begin` / `settle` / `over`）。
 */
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
        // 调用方按轴发号（`toneFieldFor(scheme)` + 该轴的 `availableToneIds`），
        // 故 id 必然属于该字段的合法集合；这里只补类型收窄。
        merged = write.field === 'darkTone'
          ? { ...merged, darkTone: write.id as DarkToneId }
          : { ...merged, lightTone: write.id as LightToneId }
      }
      return merged
    },
  }
}
