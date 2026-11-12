// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { watchSkillCatalog } from '../../lib/host/skill-catalog.js'

/** Skill service slice the notebook page reads. */
const SKILLS = [{ name: 'note2md', description: 'note management', source: 'bundled', invocation: { modelInvocable: true } }]

/**
 * Build a fake host context whose optional fork either attaches or stays pending.
 * @param {boolean} attaches - whether the fake skill service becomes available.
 * @returns {{ ctx: any, deps: () => string[] | undefined, effects: Array<() => void> }} fake context pieces.
 */
function fakeContext(attaches) {
  const effects = []
  let deps
  const ctx = {
    inject(/** @type {string[]} */ names, /** @type {(scoped: any) => void} */ callback) {
      deps = names
      if (!attaches) return
      callback({
        get: (/** @type {string} */ name) => {
          assert.equal(name, 'skills')
          return { list: async () => SKILLS }
        },
        effect(/** @type {() => void} */ register) {
          effects.push(register())
          return () => {}
        },
      })
    },
  }
  return { ctx, deps: () => deps, effects }
}

describe('可选技能目录', () => {
  it('技能服务出现前返回 undefined，不抛错', () => {
    const { ctx, deps } = fakeContext(false)
    const get = watchSkillCatalog(ctx)
    assert.deepEqual(deps(), ['skills'])
    assert.equal(get(), undefined)
  })

  it('技能服务挂上后转发 list', async () => {
    const { ctx } = fakeContext(true)
    const get = watchSkillCatalog(ctx)
    const catalog = get()
    assert.ok(catalog !== undefined)
    assert.deepEqual(await catalog.list({ cwd: '/notes' }), SKILLS)
  })

  it('fork 销毁后目录复位', () => {
    const { ctx, effects } = fakeContext(true)
    const get = watchSkillCatalog(ctx)
    assert.ok(get() !== undefined)
    effects[0]?.()
    assert.equal(get(), undefined)
  })
})
