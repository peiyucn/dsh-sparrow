// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_ONE_SKILL, installDeskSkill } from '../../lib/host/skill.js'

describe('Desk One 操作指南 skill', () => {
  it('名称 / 来源 / 双端可调用，正文覆盖对象与关键规则', () => {
    assert.equal(DESK_ONE_SKILL.name, 'desk-one')
    assert.equal(DESK_ONE_SKILL.source, 'bundled')
    assert.deepEqual(DESK_ONE_SKILL.invocation, { modelInvocable: true, userInvocable: true })
    for (const token of ['desk_note_add', 'desk_note_update', 'desk_task_update', 'desk_group_move', 'desk_schedule_list', 'desk_page_list', 'expected_revision', '只读']) {
      assert.ok(DESK_ONE_SKILL.content.includes(token), `指南缺少 ${token}`)
    }
  })

  it('通过可选 skills 服务注册，并随插件销毁', () => {
    /** @type {any[]} */
    const registered = []
    /** @type {Array<() => void>} */
    const effects = []
    let disposed = false
    const ctx = {
      inject(/** @type {string[]} */ names, /** @type {(scoped: any) => void} */ callback) {
        assert.deepEqual(names, ['skills'])
        callback({
          get: (/** @type {string} */ name) => {
            assert.equal(name, 'skills')
            return {
              register(/** @type {any} */ skill) {
                registered.push(skill)
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
    installDeskSkill(ctx)
    assert.equal(registered.length, 1)
    assert.equal(registered[0]?.name, 'desk-one')
    assert.equal(disposed, false)
    effects[0]?.()
    assert.equal(disposed, true)
  })

  it('没有 skills 服务 / 没有 inject fork 时不抛错（工具照常可用）', () => {
    assert.doesNotThrow(() => installDeskSkill(/** @type {any} */ ({})))
    assert.doesNotThrow(() => installDeskSkill(/** @type {any} */ ({
      inject: (/** @type {string[]} */ _names, /** @type {(scoped: any) => void} */ callback) => {
        callback({ get: () => undefined, effect: () => () => {} })
      },
    })))
  })
})
