// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { watchSkillCatalog } from '../../lib/host/skill-catalog.js'

/** Catalog fixtures: legacy note2md, our guide, an opted-in skill, and non-drafting skills. */
const SKILLS = [
  { name: 'note2md', description: 'note management', source: 'bundled', invocation: { modelInvocable: true, userInvocable: true } },
  { name: 'desk-one', description: 'operate desk one', source: 'bundled', invocation: { modelInvocable: true, userInvocable: true } },
  { name: 'marked-note', description: 'drafting', source: 'user-dsh', invocation: { modelInvocable: true, userInvocable: true } },
  { name: 'internal-agent', description: 'agent helper', source: 'bundled', invocation: { modelInvocable: true, userInvocable: false } },
  { name: 'random-skill', description: 'unrelated', source: 'user-dsh', invocation: { modelInvocable: true, userInvocable: true } },
]
/**
 * Build a fake host context whose optional fork either attaches or stays pending.
 * @param {boolean} attaches - whether the fake skill service becomes available.
 * @param {{ preset?: boolean }} [options] - also expose a preset registry with a scope lease.
 * @returns {any} fake context pieces.
 */
function fakeContext(attaches, options = {}) {
  const effects = []
  let deps
  let leases = 0
  let lastListOptions
  const ctx = {
    inject(/** @type {string[]} */ names, /** @type {(scoped: any) => void} */ callback) {
      deps = names
      if (!attaches) return
      const scoped = {
        get: (/** @type {string} */ name) => {
          if (name === 'skills') {
            return {
              list: async (/** @type {any} */ listOptions) => {
                lastListOptions = listOptions
                return SKILLS
              },
            }
          }
          if (name === 'agentPresets' && options.preset === true) {
            return {
              acquireScope: async () => {
                leases += 1
                return { key: { id: 'preset' }, [Symbol.asyncDispose]: async () => { leases -= 1 } }
              },
            }
          }
          return undefined
        },
        effect(/** @type {() => void} */ register) {
          effects.push(register())
          return () => {}
        },
      }
      callback(scoped)
    },
  }
  return {
    ctx,
    deps: () => deps,
    effects,
    leases: () => leases,
    lastOptions: () => lastListOptions,
  }
}

describe('可选技能目录', () => {
  it('技能服务出现前返回 undefined，不抛错', () => {
    const { ctx, deps } = fakeContext(false)
    const get = watchSkillCatalog(ctx)
    assert.deepEqual(deps(), ['skills'])
    assert.equal(get(), undefined)
  })

  it('只保留声明 note-drafting 协议 / note2md 兼容项，且过滤模型专用技能与自身指南', async () => {
    const { ctx } = fakeContext(true)
    const catalog = watchSkillCatalog(ctx)()
    assert.ok(catalog !== undefined)
    const listed = await catalog.list({ cwd: '/notes' })
    assert.deepEqual(listed.map(skill => skill.name), ['note2md', 'marked-note'])
  })

  it('有预设注册表时用默认预设 scope 读取', async () => {
    const { ctx, leases, lastOptions } = fakeContext(true, { preset: true })
    const catalog = watchSkillCatalog(ctx)()
    assert.ok(catalog !== undefined)
    await catalog.list({ cwd: '/notes' })
    assert.equal(leases(), 0)
    assert.deepEqual(lastOptions()?.scope, { id: 'preset' })
  })

  it('fork 销毁后目录复位', () => {
    const { ctx, effects } = fakeContext(true)
    const get = watchSkillCatalog(ctx)
    assert.ok(get() !== undefined)
    effects[0]?.()
    assert.equal(get(), undefined)
  })
})
