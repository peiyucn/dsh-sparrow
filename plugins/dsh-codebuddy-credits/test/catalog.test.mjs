import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILTIN_MODELS, codeBuddyModel, parseModelConfig, resolveModels } from '../lib/catalog.js'

describe('BUILTIN_MODELS', () => {
  it('内置目录非空且 id 唯一', () => {
    assert.ok(BUILTIN_MODELS.length > 0)
    const ids = new Set(BUILTIN_MODELS.map(model => model.id))
    assert.equal(ids.size, BUILTIN_MODELS.length)
  })
  it('内置条目均有正数容量与推理声明', () => {
    for (const model of BUILTIN_MODELS) {
      assert.ok(model.contextWindow > 0)
      assert.ok(model.maxTokens > 0)
      assert.ok(model.reasoningEfforts !== false)
    }
  })
})

describe('resolveModels', () => {
  it('空配置返回内置目录', () => {
    const models = resolveModels([])
    assert.equal(models.length, BUILTIN_MODELS.length)
    for (const model of models) {
      assert.equal(model.provider, 'codebuddy-credits')
      assert.equal(model.api, 'openai-completions')
    }
  })
  it('配置条目继承内置同名模型的未声明字段', () => {
    const [builtin] = BUILTIN_MODELS
    const models = resolveModels([{ id: builtin.id, name: '自定义名' }])
    assert.equal(models.length, 1)
    const [model] = models
    assert.equal(model.name, '自定义名')
    assert.equal(model.contextWindow, builtin.contextWindow)
    assert.equal(model.maxTokens, builtin.maxTokens)
  })
  it('reasoningEfforts: false 禁用推理', () => {
    const [builtin] = BUILTIN_MODELS
    const [model] = resolveModels([{ id: builtin.id, reasoningEfforts: false }])
    assert.equal(model.reasoning, false)
    assert.equal(model.thinkingLevelMap, undefined)
  })
  it('未知 id 的条目以兜底常量补齐容量', () => {
    const [model] = resolveModels([{ id: 'brand-new-model' }])
    assert.equal(model.contextWindow, 262_144)
    assert.equal(model.maxTokens, 32_768)
  })
})

describe('codeBuddyModel', () => {
  it('显式 reasoningEfforts 展开 thinkingLevelMap 且 off 恒支持', () => {
    const model = codeBuddyModel({ id: 'x', reasoningEfforts: { off: null, high: 'high' } })
    assert.equal(model.reasoning, true)
    assert.deepEqual(model.thinkingLevelMap, { off: null, high: 'high' })
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
