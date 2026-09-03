import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { codeBuddyModel, discoveredToProfile, parseModelConfig, resolveModels } from '../lib/catalog.js'
import { mapFinish, mapUsage, parseSseLine, toWireMessages } from '../lib/adapter.js'

describe('resolveModels', () => {
  it('空配置返回空模型集（无预置目录）', () => {
    assert.deepEqual(resolveModels([]), [])
  })
  it('配置条目解析为模型事实（自带输入模态与推理声明）', () => {
    const [model] = resolveModels([{ id: 'hy3', name: 'Hy3', contextWindow: 192000, maxTokens: 64000 }])
    assert.equal(model.id, 'hy3')
    assert.equal(model.name, 'Hy3')
    assert.equal(model.contextWindow, 192000)
    assert.equal(model.maxTokens, 64000)
    assert.deepEqual(model.input, ['text'])
    assert.equal(model.reasoning, false)
  })
  it('容量缺失的条目以兜底常量补齐', () => {
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
  it('解析实测形状的 /v3/config 响应（系数进名字）', () => {
    const body = {
      code: 0,
      data: {
        agents: [{ name: 'cli', models: ['hy3', 'glm-5.3-flash'] }],
        models: [
          { id: 'hy3', name: 'Hy3', maxInputTokens: 192000, maxOutputTokens: 64000, credits: 'x0.00 credits', supportsImages: true, supportsReasoning: true, reasoning: { canDisableThinking: true, supportedEfforts: ['high'] } },
          { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', maxInputTokens: 1000000, maxOutputTokens: 32000, credits: 'x0.06 credits' },
        ],
      },
    }
    const models = parseModelConfig(body)
    assert.equal(models.length, 2)
    assert.deepEqual(models[0], {
      id: 'hy3',
      name: 'Hy3 · x0.00',
      credits: 'x0.00',
      contextWindow: 192000,
      maxTokens: 64000,
      input: ['text', 'image'],
      reasoningEfforts: { off: null, high: 'high' },
    })
    assert.equal(models[1].name, 'GLM-5.3-Flash · x0.06')
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
  it('发现结果转为设置节条目（缺省字段不写入）', () => {
    const profiles = discoveredToProfile([{ id: 'hy3', name: 'Hy3 · x0.00', contextWindow: 192000, maxTokens: 64000, credits: 'x0.00', input: ['text', 'image'], reasoningEfforts: { off: null, high: 'high' } }])
    assert.deepEqual(profiles, [{
      id: 'hy3',
      name: 'Hy3 · x0.00',
      contextWindow: 192000,
      maxTokens: 64000,
      input: ['text', 'image'],
      reasoningEfforts: { off: null, high: 'high' },
    }])
  })
  it('缺失字段不写进条目', () => {
    const profiles = discoveredToProfile([{ id: 'ghost', name: 'ghost' }])
    assert.deepEqual(profiles, [{ id: 'ghost', name: 'ghost' }])
  })
})

describe('mapUsage', () => {
  it('实测 usage 帧 → DSH TokenUsage + credit', () => {
    const { tokens, credit } = mapUsage({
      prompt_tokens: 2826,
      completion_tokens: 31,
      total_tokens: 2857,
      prompt_cache_hit_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 28 },
      credit: 0.03,
    })
    assert.deepEqual(tokens, {
      inputTokens: 2826,
      outputTokens: 31,
      totalTokens: 2857,
      reasoningTokens: 28,
    })
    assert.equal(credit, 0.03)
  })
  it('缓存命中从输入中扣除', () => {
    const { tokens } = mapUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 400,
    })
    assert.equal(tokens.inputTokens, 600)
    assert.equal(tokens.cacheReadTokens, 400)
  })
})

describe('mapFinish', () => {
  it('服务端结束原因映射', () => {
    assert.deepEqual(mapFinish('stop'), { kind: 'stop' })
    assert.deepEqual(mapFinish('length'), { kind: 'max-tokens' })
    assert.deepEqual(mapFinish('tool_calls'), { kind: 'tool-calls' })
    assert.equal(mapFinish('unknown-reason'), undefined)
  })
})

describe('parseSseLine', () => {
  it('有效 data 帧解析为对象', () => {
    const frame = parseSseLine('data: {"id":"x","choices":[]}')
    assert.deepEqual(frame, { id: 'x', choices: [] })
  })
  it('[DONE] 与空帧返回 undefined', () => {
    assert.equal(parseSseLine('data: [DONE]'), undefined)
    assert.equal(parseSseLine('data:'), undefined)
  })
  it('非 data 行与无效 JSON 返回 undefined', () => {
    assert.equal(parseSseLine(''), undefined)
    assert.equal(parseSseLine('event: message'), undefined)
    assert.equal(parseSseLine('data: {broken'), undefined)
    assert.equal(parseSseLine('data: 123'), undefined)
  })
  it('前缀空白容忍', () => {
    const frame = parseSseLine('  data: {"a":1}')
    assert.deepEqual(frame, { a: 1 })
  })
})

describe('toWireMessages', () => {
  it('system/user/assistant 基础转换', () => {
    const messages = toWireMessages({
      provider: 'codebuddy-credits',
      model: 'hy3',
      system: '你是助手',
      messages: [
        { id: 'm1', role: 'user', content: [{ type: 'text', text: '你好' }], source: { kind: 'user' } },
        { id: 'm2', role: 'assistant', content: [{ type: 'text', text: '你好！' }], source: { kind: 'model', provider: 'codebuddy-credits', model: 'hy3' } },
      ],
    })
    assert.equal(messages.length, 3)
    assert.deepEqual(messages[0], { role: 'system', content: '你是助手' })
    assert.deepEqual(messages[1], { role: 'user', content: '你好' })
    assert.deepEqual(messages[2], { role: 'assistant', content: '你好！', tool_calls: undefined })
  })
  it('assistant 的 tool-call 块转 wire tool_calls，reasoning 块不进历史', () => {
    const messages = toWireMessages({
      provider: 'codebuddy-credits',
      model: 'hy3',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: [
            { type: 'reasoning', text: '思考过程' },
            { type: 'tool-call', id: 'call-1', name: 'Bash', arguments: '{"cmd":"ls"}' },
          ],
          source: { kind: 'model', provider: 'codebuddy-credits', model: 'hy3' },
        },
      ],
    })
    assert.equal(messages.length, 1)
    assert.deepEqual(messages[0], {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'Bash', arguments: '{"cmd":"ls"}' } }],
    })
  })
  it('tool-result 消息转 role=tool', () => {
    const messages = toWireMessages({
      provider: 'codebuddy-credits',
      model: 'hy3',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'ok' }] }],
          source: { kind: 'tool', callId: 'call-1' },
        },
      ],
    })
    assert.equal(messages.length, 1)
    assert.deepEqual(messages[0], { role: 'tool', tool_call_id: 'call-1', content: 'ok' })
  })
})
