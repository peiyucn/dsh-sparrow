import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  capabilityReducer, capabilityShown, CAPABILITY_UNKNOWN_RETRIES, initialCapabilityState,
} from '../lib/client/capability-machine.js'

/** 目标地址 ''/'' = host 默认兜底。 */
const T = (provider, model) => ({ provider, model })
const declared = (mode = 'cross-model') => ({ mode, visionModel: 'deepseek-v4-flash-vision-exp', declared: true })
const undeclared = (mode = 'no-vision') => ({ mode, visionModel: 'deepseek-v4-flash-vision-exp', declared: false })

describe('capability-machine 能力解析状态机', () => {
  it('初始 idle：model-changed 进入 resolving（无携带答案）', () => {
    const state = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('deepseek-official', 'deepseek-v4-pro') })
    assert.equal(state.phase, 'resolving')
    assert.equal(state.shown, null)
    assert.equal(state.attempts, 0)
    assert.equal(state.target.model, 'deepseek-v4-pro')
  })

  it('定论答案（declared）直接进入 settled 终态', () => {
    const resolving = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') })
    const settled = capabilityReducer(resolving, { type: 'answered', target: T('a', 'b'), result: declared() })
    assert.equal(settled.phase, 'settled')
    assert.equal(settled.shown.mode, 'cross-model')
  })

  it('未知答案（undeclared）进入 retrying，retry-tick 回到 resolving 且 attempts +1', () => {
    const resolving = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') })
    const retrying = capabilityReducer(resolving, { type: 'answered', target: T('a', 'b'), result: undeclared() })
    assert.equal(retrying.phase, 'retrying')
    assert.equal(retrying.attempts, 1)
    assert.equal(retrying.shown.mode, 'no-vision')
    const again = capabilityReducer(retrying, { type: 'retry-tick', target: T('a', 'b') })
    assert.equal(again.phase, 'resolving')
    assert.equal(again.attempts, 1)
  })

  it('补查耗尽后仍未知 → settled（保持显示该答案，不再重查）', () => {
    let state = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') })
    for (let i = 0; i < CAPABILITY_UNKNOWN_RETRIES; i++) {
      assert.equal(state.phase, 'resolving')
      state = capabilityReducer(state, { type: 'answered', target: T('a', 'b'), result: undeclared() })
      assert.equal(state.phase, 'retrying')
      state = capabilityReducer(state, { type: 'retry-tick', target: T('a', 'b') })
    }
    // 最后一轮：attempts 已耗尽，再收到未知答案直接终态，不再进 retrying。
    assert.equal(state.phase, 'resolving')
    state = capabilityReducer(state, { type: 'answered', target: T('a', 'b'), result: undeclared() })
    assert.equal(state.phase, 'settled')
    assert.equal(state.shown.mode, 'no-vision')
    // 终态后同地址的 answered/retry-tick 一律作废。
    assert.equal(capabilityReducer(state, { type: 'answered', target: T('a', 'b'), result: declared() }).phase, 'settled')
    assert.equal(capabilityReducer(state, { type: 'retry-tick', target: T('a', 'b') }).phase, 'settled')
  })

  it('旧目标地址的事件作废（竞态闸门）——换模型后旧响应不再生效', () => {
    const onA = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') })
    const onB = capabilityReducer(onA, { type: 'model-changed', target: T('c', 'd') })
    const stale = capabilityReducer(onB, { type: 'answered', target: T('a', 'b'), result: declared() })
    assert.equal(stale, onB)
    const staleFailed = capabilityReducer(onB, { type: 'query-failed', target: T('a', 'b') })
    assert.equal(staleFailed, onB)
  })

  it('阶段不符的事件作废——answered/query-failed 只在 resolving 有效', () => {
    const settled = capabilityReducer(
      capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') }),
      { type: 'answered', target: T('a', 'b'), result: declared() },
    )
    assert.equal(capabilityReducer(settled, { type: 'query-failed', target: T('a', 'b') }), settled)
    assert.equal(capabilityReducer(settled, { type: 'retry-tick', target: T('a', 'b') }), settled)
  })

  it('查询失败 → failed（隐藏），换模型才重开且不携带旧答案', () => {
    const resolving = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') })
    const failed = capabilityReducer(resolving, { type: 'query-failed', target: T('a', 'b') })
    assert.equal(failed.phase, 'failed')
    const reopened = capabilityReducer(failed, { type: 'model-changed', target: T('c', 'd') })
    assert.equal(reopened.phase, 'resolving')
    assert.equal(reopened.shown, null)
  })

  it('换模型携带上一答案防闪烁（settled/resolving/retrying 携带，failed 不携带）', () => {
    const settled = capabilityReducer(
      capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') }),
      { type: 'answered', target: T('a', 'b'), result: declared() },
    )
    const carried = capabilityReducer(settled, { type: 'model-changed', target: T('c', 'd') })
    assert.equal(carried.phase, 'resolving')
    assert.equal(carried.shown, settled.shown)
  })

  it('capabilityShown：idle/failed 返回 null，其余返回当前答案', () => {
    assert.equal(capabilityShown(initialCapabilityState), null)
    const failed = capabilityReducer(
      capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') }),
      { type: 'query-failed', target: T('a', 'b') },
    )
    assert.equal(capabilityShown(failed), null)
    const resolved = capabilityReducer(initialCapabilityState, { type: 'model-changed', target: T('a', 'b') })
    assert.equal(capabilityShown(resolved), null) // 首轮无携带
    const settled = capabilityReducer(resolved, { type: 'answered', target: T('a', 'b'), result: declared('native-vision') })
    assert.equal(capabilityShown(settled).mode, 'native-vision')
  })
})
