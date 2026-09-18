import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FIM_SUPPORT_UNKNOWN_RETRIES, fimSupportReducer, fimSupportRetryDelayMs, fimSupportShown,
  initialFimSupportState,
} from '../lib/client/fim-support-machine.js'

const A = (sessionId = 's1', modelKey = 'deepseek-official:deepseek-v4-pro') => ({ sessionId, modelKey })

/** 跑「context-changed → 连续 unknown n 次」并返回末态（中间穿插 retry-tick，与组件接线同序）。 */
function afterUnknown(address, times) {
  let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address })
  for (let index = 0; index < times; index++) {
    state = fimSupportReducer(state, { type: 'unknown', address })
    if (state.phase === 'retrying') state = fimSupportReducer(state, { type: 'retry-tick', address })
  }
  return state
}

describe('fim-support-machine FIM 支持状态机', () => {
  it('初始 idle：context-changed 进入 checking，且未定论前不显示（不凭猜 fail-open）', () => {
    const state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    assert.equal(state.phase, 'checking')
    assert.deepEqual(state.address, A())
    assert.equal(fimSupportShown(state), false)
  })

  it('首发 unknown（冷启动判不了）后补查拿到 supported=true 应该 显示', () => {
    const state = fimSupportReducer(afterUnknown(A(), 1), { type: 'checked', address: A(), supported: true })
    assert.equal(state.phase, 'supported')
    assert.equal(fimSupportShown(state), true)
  })

  it('checked(supported=true) 进入 supported；shown=true', () => {
    const checking = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    const state = fimSupportReducer(checking, { type: 'checked', address: A(), supported: true })
    assert.equal(state.phase, 'supported')
    assert.equal(fimSupportShown(state), true)
  })

  it('checked(supported=false) 进入 unsupported；shown=false（整体隐藏）', () => {
    const checking = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    const state = fimSupportReducer(checking, { type: 'checked', address: A(), supported: false })
    assert.equal(state.phase, 'unsupported')
    assert.equal(fimSupportShown(state), false)
  })

  // 回归（2026-09-17 owner 报）：冷启动第一发查询命中的是「宿主还没激活该会话」，
  // 旧实现把非 2xx 一律当「支持」→ 开关与所选模型无关地常显，刷新才恢复。
  it('unknown 应该 进入 retrying 并保留上一显示态（不当作 supported 定案）', () => {
    const checking = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    const state = fimSupportReducer(checking, { type: 'unknown', address: A() })
    assert.equal(state.phase, 'retrying')
    assert.equal(state.attempts, 1)
  })

  it('unknown 后补查 tick 应该 回到 checking 重发查询（同一地址）', () => {
    const retrying = afterUnknown(A(), 1)
    assert.equal(retrying.phase, 'checking')
    assert.deepEqual(retrying.address, A())
    assert.equal(retrying.attempts, 1)
  })

  it('冷启动：unknown 后补查拿到定论 应该 立即追平为 unsupported/隐藏', () => {
    const state = fimSupportReducer(afterUnknown(A(), 1), { type: 'checked', address: A(), supported: false })
    assert.equal(state.phase, 'unsupported')
    assert.equal(fimSupportShown(state), false)
  })

  it('补查耗尽（连续 unknown 达上限）才落 failed 并按支持显示（fail-open）', () => {
    const address = A()
    let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address })
    // 首发 + FIM_SUPPORT_UNKNOWN_RETRIES 次补查都判不了 → 落 failed。
    let rounds = 0
    while (state.phase !== 'failed' && rounds < 20) {
      state = fimSupportReducer(state, { type: 'unknown', address })
      if (state.phase === 'retrying') state = fimSupportReducer(state, { type: 'retry-tick', address })
      rounds++
    }
    assert.equal(state.phase, 'failed')
    // 首发 1 次 + 补查 5 次 = 6 轮，不多不少（定时器有限）。
    assert.equal(rounds, FIM_SUPPORT_UNKNOWN_RETRIES + 1)
    assert.equal(fimSupportShown(state), true)
    // failed 是终态：再来的 unknown / retry-tick 不得重开（定时器不会无限重排）。
    assert.equal(fimSupportReducer(state, { type: 'unknown', address }), state)
    assert.equal(fimSupportReducer(state, { type: 'retry-tick', address }), state)
  })

  it('常显回归守卫：unknown 不得把「不支持」翻成显示', () => {
    // 先拿到不支持定论，再收到 unknown（同一地址的新一轮查询）——仍不得显示。
    let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    state = fimSupportReducer(state, { type: 'checked', address: A(), supported: false })
    assert.equal(fimSupportShown(state), false)
    // 同地址 unknown 只在 checking 有效；supported/unsupported 阶段作废（不会被翻成显示）。
    assert.equal(fimSupportReducer(state, { type: 'unknown', address: A() }), state)
  })

  it('旧地址事件作废（竞态闸门）——换会话/换模型后旧响应不再生效', () => {
    const onA = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A('s1') })
    const onB = fimSupportReducer(onA, { type: 'context-changed', address: A('s1', 'zai:glm-5.3-flash') })
    assert.equal(fimSupportReducer(onB, { type: 'checked', address: A('s1'), supported: false }), onB)
    assert.equal(fimSupportReducer(onB, { type: 'unknown', address: A('s2') }), onB)
    assert.equal(fimSupportReducer(onB, { type: 'retry-tick', address: A('s2') }), onB)
  })

  it('阶段不符事件作废——checked/unknown/retry-tick 只在合法阶段有效', () => {
    const supported = fimSupportReducer(
      fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() }),
      { type: 'checked', address: A(), supported: true },
    )
    assert.equal(fimSupportReducer(supported, { type: 'checked', address: A(), supported: false }), supported)
    assert.equal(fimSupportReducer(supported, { type: 'unknown', address: A() }), supported)
    // retry-tick 只在 retrying 有效：checking 阶段的 tick 作废。
    const checking = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    assert.equal(fimSupportReducer(checking, { type: 'retry-tick', address: A() }), checking)
  })

  it('idle 阶段的 checked/unknown 事件作废', () => {
    assert.equal(
      fimSupportReducer(initialFimSupportState, { type: 'checked', address: A(), supported: true }),
      initialFimSupportState,
    )
    assert.equal(
      fimSupportReducer(initialFimSupportState, { type: 'unknown', address: A() }),
      initialFimSupportState,
    )
  })

  it('换上下文应该 清零补查计数（新地址有新预算）', () => {
    const retrying = afterUnknown(A('s1'), 2)
    assert.equal(retrying.attempts, 2)
    const changed = fimSupportReducer(retrying, { type: 'context-changed', address: A('s2') })
    assert.equal(changed.phase, 'checking')
    assert.equal(changed.attempts, 0)
  })

  it('换上下文后再次查询：unsupported → checking → checked(false) 追平', () => {
    let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A('s1') })
    state = fimSupportReducer(state, { type: 'checked', address: A('s1'), supported: false })
    assert.equal(fimSupportShown(state), false)
    state = fimSupportReducer(state, { type: 'context-changed', address: A('s1', 'zai:glm-5.3-flash') })
    assert.equal(state.phase, 'checking')
    state = fimSupportReducer(state, { type: 'checked', address: A('s1', 'zai:glm-5.3-flash'), supported: false })
    assert.equal(state.phase, 'unsupported')
  })

  it('均不支持模型间切换不闪出——checking 携带上一隐藏态，直到新判定到达', () => {
    let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A('s1', 'zai:glm-5.3-flash') })
    state = fimSupportReducer(state, { type: 'checked', address: A('s1', 'zai:glm-5.3-flash'), supported: false })
    assert.equal(fimSupportShown(state), false)
    // 切到另一个同样不支持的模型：查询窗口内仍保持隐藏，不闪出。
    state = fimSupportReducer(state, { type: 'context-changed', address: A('s1', 'codebuddy-credits:hy4-preview') })
    assert.equal(state.phase, 'checking')
    assert.equal(fimSupportShown(state), false)
    state = fimSupportReducer(state, { type: 'checked', address: A('s1', 'codebuddy-credits:hy4-preview'), supported: false })
    assert.equal(fimSupportShown(state), false)
  })

  it('不支持模型切换遇 unknown 补查：保持隐藏（不因判不了而闪出）', () => {
    let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A('s1') })
    state = fimSupportReducer(state, { type: 'checked', address: A('s1'), supported: false })
    state = fimSupportReducer(state, { type: 'context-changed', address: A('s1', 'codebuddy-credits:hy4-preview') })
    state = fimSupportReducer(state, { type: 'unknown', address: A('s1', 'codebuddy-credits:hy4-preview') })
    assert.equal(state.phase, 'retrying')
    assert.equal(fimSupportShown(state), false) // 携带上一「隐藏」态
  })

  it('支持→不支持切换：checking 携带上一「显示」态，查完才隐藏（不提前闪没）', () => {
    let state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A('s1') })
    state = fimSupportReducer(state, { type: 'checked', address: A('s1'), supported: true })
    assert.equal(fimSupportShown(state), true)
    state = fimSupportReducer(state, { type: 'context-changed', address: A('s1', 'zai:glm-5.3-flash') })
    assert.equal(fimSupportShown(state), true) // 查询中仍显示
    state = fimSupportReducer(state, { type: 'checked', address: A('s1', 'zai:glm-5.3-flash'), supported: false })
    assert.equal(fimSupportShown(state), false)
  })
})

describe('fimSupportRetryDelayMs 未知答案补查退避', () => {
  it('应该 按倍数退避（500 / 1000 / 2000 / 4000 / 8000）', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map(attempt => fimSupportRetryDelayMs(attempt)),
      [500, 1000, 2000, 4000, 8000],
    )
  })

  it('总补查窗口 应该 覆盖冷启动会话激活（≥ 15s）', () => {
    let total = 0
    for (let attempt = 1; attempt <= FIM_SUPPORT_UNKNOWN_RETRIES; attempt++) total += fimSupportRetryDelayMs(attempt)
    assert.ok(total >= 15_000, `补查窗口 ${total}ms 应 ≥ 15s`)
  })

  it('非法 attempt 应该 按第 1 次处理（不产生 NaN / 负延迟）', () => {
    assert.equal(fimSupportRetryDelayMs(0), 500)
    assert.equal(fimSupportRetryDelayMs(-3), 500)
    // NaN 必须被兜住：setTimeout(NaN) 会立即触发 → 有界补查退化成忙轮询。
    assert.equal(fimSupportRetryDelayMs(Number.NaN), 500)
    assert.equal(fimSupportRetryDelayMs(Number.POSITIVE_INFINITY), 500)
    for (const attempt of [Number.NaN, -1, 0, 1, 3]) {
      assert.ok(Number.isFinite(fimSupportRetryDelayMs(attempt)) && fimSupportRetryDelayMs(attempt) > 0)
    }
  })
})
