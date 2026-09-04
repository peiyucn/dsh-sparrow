import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fimSupportReducer, fimSupportShown, initialFimSupportState,
} from '../lib/client/fim-support-machine.js'

const A = (sessionId = 's1', modelKey = 'deepseek-official:deepseek-v4-pro') => ({ sessionId, modelKey })

describe('fim-support-machine FIM 支持状态机', () => {
  it('初始 idle：context-changed 进入 checking', () => {
    const state = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    assert.equal(state.phase, 'checking')
    assert.deepEqual(state.address, A())
    assert.equal(fimSupportShown(state), true) // 查询中先按支持显示
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

  it('check-failed 进入 failed；shown=true（查询失败默认显示）', () => {
    const checking = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() })
    const state = fimSupportReducer(checking, { type: 'check-failed', address: A() })
    assert.equal(state.phase, 'failed')
    assert.equal(fimSupportShown(state), true)
  })

  it('旧地址事件作废（竞态闸门）——换会话/换模型后旧响应不再生效', () => {
    const onA = fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A('s1') })
    const onB = fimSupportReducer(onA, { type: 'context-changed', address: A('s1', 'zai:glm-5.3-flash') })
    assert.equal(fimSupportReducer(onB, { type: 'checked', address: A('s1'), supported: false }), onB)
    assert.equal(fimSupportReducer(onB, { type: 'check-failed', address: A('s2') }), onB)
  })

  it('阶段不符事件作废——checked/check-failed 只在 checking 有效', () => {
    const supported = fimSupportReducer(
      fimSupportReducer(initialFimSupportState, { type: 'context-changed', address: A() }),
      { type: 'checked', address: A(), supported: true },
    )
    assert.equal(fimSupportReducer(supported, { type: 'checked', address: A(), supported: false }), supported)
    assert.equal(fimSupportReducer(supported, { type: 'check-failed', address: A() }), supported)
  })

  it('idle 阶段的 checked 事件作废', () => {
    assert.equal(
      fimSupportReducer(initialFimSupportState, { type: 'checked', address: A(), supported: true }),
      initialFimSupportState,
    )
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
