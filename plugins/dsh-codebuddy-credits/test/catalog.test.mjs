import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { codeBuddyModel, discoveredToProfile, parseModelConfig, resolveModels } from '../lib/catalog.js'

describe('resolveModels', () => {
  it('空配置返回空模型集（无预置目录）', () => {
    assert.deepEqual(resolveModels([]), [])
  })
  it('配置条目解析为 codebuddy-credits 路由的 openai-completions 模型', () => {
    const [model] = resolveModels([{ id: 'hy3', name: 'Hy3', contextWindow: 192000, maxTokens: 64000 }])
    assert.equal(model.provider, 'codebuddy-credits')
    assert.equal(model.api, 'openai-completions')
    assert.equal(model.contextWindow, 192000)
    assert.equal(model.maxTokens, 64000)
  })
  it('容量缺失的条目以兜底常量补齐', () => {
    const [model] = resolveModels([{ id: 'brand-new-model' }])
    assert.equal(model.contextWindow, 262_144)
    assert.equal(model.maxTokens, 32_768)
    assert.equal(model.name, 'brand-new-model')
  })
})

describe('codeBuddyModel', () => {
  it('显式 reasoningEfforts 展开 thinkingLevelMap 且 off 恒支持', () => {
    const model = codeBuddyModel({ id: 'x', reasoningEfforts: { off: null, high: 'high' } })
    assert.equal(model.reasoning, true)
    assert.deepEqual(model.thinkingLevelMap, { off: null, high: 'high' })
  })
  it('reasoningEfforts: false 禁用推理', () => {
    const model = codeBuddyModel({ id: 'x', reasoningEfforts: false })
    assert.equal(model.reasoning, false)
    assert.equal(model.thinkingLevelMap, undefined)
  })
  it('未声明 reasoningEfforts 时不声明推理能力（不发思考参数）', () => {
    const model = codeBuddyModel({ id: 'x' })
    assert.equal(model.reasoning, false)
    assert.equal(model.thinkingLevelMap, undefined)
  })
})

describe('parseModelConfig', () => {
  it('解析实测形状的 /v3/config 响应', () => {
    const body = {
      code: 0,
      data: {
        agents: [{ name: 'cli', models: ['hy3', 'glm-5.3-flash'] }],
        models: [
          { id: 'hy3', name: 'Hy3', maxInputTokens: 192000, maxOutputTokens: 64000 },
          { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', maxInputTokens: 1000000, maxOutputTokens: 32000 },
        ],
      },
    }
    const models = parseModelConfig(body)
    assert.equal(models.length, 2)
    assert.deepEqual(models[0], { id: 'hy3', name: 'Hy3', contextWindow: 192000, maxTokens: 64000 })
  })
  it('agents 包裹在 data.agent 下时同样解析', () => {
    const body = {
      data: {
        agent: { agents: [{ name: 'cli', models: ['hy3'] }] },
        models: [{ id: 'hy3', maxInputTokens: 192000, maxOutputTokens: 64000 }],
      },
    }
    const models = parseModelConfig(body)
    assert.equal(models.length, 1)
    assert.equal(models[0].id, 'hy3')
  })
  it('容量缺失的模型被丢弃，id 不在目录的模型被丢弃', () => {
    const body = {
      data: {
        agents: [{ name: 'cli', models: ['no-capacity', 'ghost'] }],
        models: [{ id: 'no-capacity' }],
      },
    }
    assert.deepEqual(parseModelConfig(body), [])
  })
  it('非数组输入返回空', () => {
    assert.deepEqual(parseModelConfig(undefined), [])
    assert.deepEqual(parseModelConfig({ data: null }), [])
  })
})

describe('discoveredToProfile', () => {
  it('发现结果转为设置节条目，带默认思考声明', () => {
    const profiles = discoveredToProfile([{ id: 'hy3', name: 'Hy3', contextWindow: 192000, maxTokens: 64000 }])
    assert.deepEqual(profiles, [{
      id: 'hy3',
      name: 'Hy3',
      contextWindow: 192000,
      maxTokens: 64000,
      reasoningEfforts: { off: null },
    }])
  })
  it('缺失字段不写进条目', () => {
    const profiles = discoveredToProfile([{ id: 'ghost' }])
    assert.deepEqual(profiles, [{ id: 'ghost', reasoningEfforts: { off: null } }])
  })
})
