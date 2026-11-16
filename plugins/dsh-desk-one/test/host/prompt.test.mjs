// @ts-check
/**
 * New-conversation task capture: the prompt section is the trigger (a skill alone is not loaded on
 * every new conversation), while the skill and desk_task_add own the playbook and the session link.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DESK_ONE_PROMPT, DESK_ONE_PROMPT_NAME, installDeskPrompt,
} from '../../lib/host/prompt.js'

describe('Desk One 新会话任务捕获提示', () => {
  it('名称 / 顺序 / 文案覆盖触发边界', () => {
    assert.equal(DESK_ONE_PROMPT.name, DESK_ONE_PROMPT_NAME)
    assert.ok(Number.isFinite(DESK_ONE_PROMPT.order))
    for (const token of ['first user message', 'subagent', 'ask once', 'todo', 'link_current_session', 'decline']) {
      assert.ok(DESK_ONE_PROMPT.text.includes(token), `任务捕获文案缺少 ${token}`)
    }
  })

  it('通过可选 systemPrompt 服务注册，并随插件销毁', () => {
    /** @type {any[]} */
    const sections = []
    /** @type {Array<() => void>} */
    const effects = []
    let disposed = false
    /** @type {any} */
    const ctx = {
      inject(/** @type {string[]} */ names, /** @type {(scoped: any) => void} */ callback) {
        assert.deepEqual(names, ['systemPrompt'])
        callback({
          get: (/** @type {string} */ name) => {
            assert.equal(name, 'systemPrompt')
            return {
              section(/** @type {any} */ section) {
                sections.push(section)
                return () => { disposed = true }
              },
            }
          },
          effect(/** @type {() => () => void} */ factory) {
            effects.push(factory())
            return () => {}
          },
        })
      },
    }
    installDeskPrompt(ctx)
    assert.equal(sections.length, 1)
    assert.equal(sections[0]?.name, DESK_ONE_PROMPT_NAME)
    assert.equal(disposed, false)
    effects[0]?.()
    assert.equal(disposed, true)
  })

  it('没有 systemPrompt 服务 / 没有 inject fork 时不抛错', () => {
    assert.doesNotThrow(() => installDeskPrompt(/** @type {any} */ ({})))
    assert.doesNotThrow(() => installDeskPrompt(/** @type {any} */ ({
      inject: (/** @type {string[]} */ _names, /** @type {(scoped: any) => void} */ callback) => {
        callback({ get: () => undefined, effect: () => () => {} })
      },
    })))
  })
})
