import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TASK_CAPTURE_PROMPT, installTaskCapturePrompt } from '../../lib/host/prompt.js'

type Section = {
  readonly name: string
  readonly order: number
  readonly text: string
}

function fakeContext(options: { readonly service: boolean }) {
  const sections: Section[] = []
  let effects = 0
  const scoped = {
    get(name: string) {
      if (name !== 'systemPrompt' || !options.service) return undefined
      return {
        section(section: Section) {
          sections.push(section)
          return () => {}
        },
      }
    },
    effect(callback: () => () => void) {
      effects += 1
      callback()
    },
  }
  const ctx = {
    inject(services: readonly string[], callback: (scope: unknown) => void) {
      assert.deepEqual([...services], ['systemPrompt'])
      callback(scoped)
    },
  }
  return { ctx, sections, effectsOf: () => effects }
}

describe('任务捕获 system prompt', () => {
  it('注册固定 name / order / 关键规则文本', () => {
    const { ctx, sections, effectsOf } = fakeContext({ service: true })
    installTaskCapturePrompt(ctx as never)
    assert.equal(effectsOf(), 1)
    assert.equal(sections.length, 1)
    assert.equal(sections[0].name, 'desk-one:task-capture')
    assert.equal(sections[0].order, 9500)
    assert.match(sections[0].text, /task nature/u)
    assert.match(sections[0].text, /first substantive user request/u)
    assert.match(sections[0].text, /file, code, config, data or document changes/u)
    assert.match(sections[0].text, /linked_to_current_session=true/u)
    assert.match(sections[0].text, /desk_task_update with link_current_session=true/u)
    assert.match(sections[0].text, /Never create a task or change a link without the user's explicit consent/u)
  })

  it('宿主没有 systemPrompt 服务时静默跳过', () => {
    const { ctx, sections, effectsOf } = fakeContext({ service: false })
    installTaskCapturePrompt(ctx as never)
    assert.equal(sections.length, 0)
    assert.equal(effectsOf(), 0)
  })

  it('Context 没有 inject 时不报错', () => {
    assert.doesNotThrow(() => installTaskCapturePrompt({} as never))
  })

  it('导出的 prompt 常量仍是稳定契约', () => {
    assert.equal(TASK_CAPTURE_PROMPT.name, 'desk-one:task-capture')
    assert.equal(TASK_CAPTURE_PROMPT.order, 9500)
  })
})
