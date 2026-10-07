/**
 * 在途乐观值归属的回归守卫（owner 真机报「切换不同 tone 时会来回跳」）。
 *
 * 事故形状（本机 dsh 实测轨迹，连点 Default → 40ms 后点 Sakura）：
 *
 * ```text
 * t=29ms   Default   第 1 笔乐观值
 * t=82ms   Sakura    第 2 笔乐观值
 * t=1171ms Default   ← 第 1 笔结算回来，误收掉第 2 笔（就是这一次回跳）
 * t=2444ms Sakura    第 2 笔结算，最终收敛
 * ```
 *
 * 根因：旧实现把「快照 revision 前进过」当结算判据，多笔在途时先发那笔的结算会让
 * revision 前进，于是**更新的那一笔**乐观值被当作废。本模块把所有权按「哪一笔」记账。
 *
 * ⚠️ 本文件测的是**行为**（谁能收谁不能收），不是实现形状 —— 换实现只要语义不变仍应通过。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPendingToneTracker } from '../lib/client/pending.js'

/** 两轴都取款（避免复用一个 id 掩饰字段串味）。 */
const LIGHT = 'sakura'
const DARK = 'forest'

describe('pending.ts · 在途乐观值归属', () => {
  it('单笔：结算后乐观值消失，over 原样返回基线', () => {
    const tracker = createPendingToneTracker()
    const base = { lightTone: 'official', darkTone: 'violet' }
    const write = tracker.begin('darkTone', DARK)
    assert.deepEqual(tracker.over(base), { lightTone: 'official', darkTone: DARK }, '在途时乐观值生效')
    assert.equal(tracker.settle(write), true, '自己那一笔结算应当收回')
    assert.equal(tracker.over(base), base, '收回后应原样返回基线（同一引用）')
  })

  it('⛔ 被顶掉的那一笔无权收回（否则画面回跳到旧选择）', () => {
    // 这就是 owner 报的 bug：两笔在途，先发那笔结算回来时**不得**动乐观值。
    const tracker = createPendingToneTracker()
    const base = { lightTone: 'official', darkTone: 'violet' }
    const first = tracker.begin('lightTone', 'sakura')
    const second = tracker.begin('lightTone', 'green')
    assert.equal(tracker.over(base).lightTone, 'green', '乐观值应是最新那笔')
    assert.equal(tracker.settle(first), false, '先发那笔已过时，无权收回')
    assert.equal(tracker.over(base).lightTone, 'green', '⛔ 被顶掉那笔结算后乐观值必须还在（回跳回归点）')
    assert.equal(tracker.settle(second), true, '最新那笔结算才收回')
    assert.equal(tracker.over(base), base, '两笔都结清后回到基线')
  })

  it('按字段分别记账：切轴选色不顶掉另一轴在途的那一笔', () => {
    // 两轴各写各的字段；用户快速「浅色选一张 → 切深色再选一张」时，浅色那笔仍在途，
    // 深色的写入不该把它顶掉（tokenOverrides 两轴一次给全，浅色那笔同样要算数）。
    const tracker = createPendingToneTracker()
    const base = { lightTone: 'official', darkTone: 'violet' }
    const light = tracker.begin('lightTone', LIGHT)
    const dark = tracker.begin('darkTone', DARK)
    assert.deepEqual(tracker.over(base), { lightTone: LIGHT, darkTone: DARK }, '两轴乐观值同时生效')
    assert.equal(tracker.settle(dark), true, '深色那笔收掉')
    assert.equal(tracker.over(base).lightTone, LIGHT, '浅色那笔不受影响，仍在途')
    assert.equal(tracker.settle(light), true)
    assert.equal(tracker.over(base), base)
  })

  it('过时凭据幂等：同一笔重复结算第二次不再收回任何东西', () => {
    const tracker = createPendingToneTracker()
    const base = { lightTone: 'official', darkTone: 'violet' }
    const write = tracker.begin('darkTone', DARK)
    assert.equal(tracker.settle(write), true)
    assert.equal(tracker.settle(write), false, '第二次结算必须报「没收到」')
    assert.equal(tracker.over(base), base)
  })

  it('结算后再发新一笔：新号接管，旧号彻底失效', () => {
    const tracker = createPendingToneTracker()
    const base = { lightTone: 'official', darkTone: 'violet' }
    const first = tracker.begin('lightTone', 'sakura')
    tracker.settle(first)
    const second = tracker.begin('lightTone', 'green')
    assert.equal(tracker.settle(first), false, '已结清的旧号不得影响新一笔')
    assert.equal(tracker.over(base).lightTone, 'green')
    tracker.settle(second)
  })
})
