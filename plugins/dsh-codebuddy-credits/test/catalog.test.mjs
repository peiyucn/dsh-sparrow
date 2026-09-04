import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { creditLabel, displayName, effortName, factsFromEntries, parseModelConfig } from '../lib/catalog.js'
import { mapFinish, mapUsage, parseSseLine, toWireMessages } from '../lib/adapter.js'

describe('factsFromEntries', () => {
  it('空目录返回空模型集（无预置目录）', () => {
    assert.deepEqual(factsFromEntries([]), [])
  })
  it('远端条目解析为模型事实（容量/输入模态/展示名）', () => {
    const [model] = factsFromEntries([{ id: 'hy3', name: 'Hy3', contextWindow: 192000, maxTokens: 64000 }])
    assert.equal(model.id, 'hy3')
    assert.equal(model.name, 'Hy3')
    assert.equal(model.contextWindow, 192000)
    assert.equal(model.maxTokens, 64000)
    assert.deepEqual(model.input, ['text'])
    assert.equal(model.reasoning, false)
  })
  it('服务端描述透传（缺省时不携带该字段）', () => {
    const [withDesc] = factsFromEntries([{ id: 'hy3', name: 'Hy3', description: '旗舰模型' }])
    assert.equal(withDesc.description, '旗舰模型')
    const [without] = factsFromEntries([{ id: 'hy3', name: 'Hy3' }])
    assert.equal(without.description, undefined)
  })
  it('容量缺失的条目以兜底常量补齐', () => {
    const [model] = factsFromEntries([{ id: 'brand-new-model', name: 'Brand New Model' }])
    assert.equal(model.contextWindow, 262_144)
    assert.equal(model.maxTokens, 32_768)
  })
  it('显式 reasoningEfforts 展开 thinkingLevelMap 且 off 恒支持', () => {
    const [model] = factsFromEntries([{ id: 'x', name: 'X', reasoningEfforts: { off: null, high: 'high' } }])
    assert.equal(model.reasoning, true)
    assert.deepEqual(model.thinkingLevelMap, { off: null, high: 'high' })
  })
  it('档位表透传 declaredEfforts 结论，不强行塞 off（hy4 不可关思考/固定档位只有一档）', () => {
    const [model] = factsFromEntries([{ id: 'hy4', name: 'Hy4', reasoningEfforts: { high: 'high' }, defaultEffort: 'high' }])
    assert.deepEqual(model.thinkingLevelMap, { high: 'high' })
    assert.equal(model.defaultEffort, 'high')
  })
  it('服务端默认档位透传（仅推理模型携带）', () => {
    const [model] = factsFromEntries([{ id: 'x', name: 'X', reasoningEfforts: { high: 'high' }, defaultEffort: 'high' }])
    assert.equal(model.defaultEffort, 'high')
    const [plain] = factsFromEntries([{ id: 'y', name: 'Y' }])
    assert.equal(plain.defaultEffort, undefined)
  })
  it('reasoningEfforts: false 禁用推理', () => {
    const [model] = factsFromEntries([{ id: 'x', name: 'X', reasoningEfforts: false }])
    assert.equal(model.reasoning, false)
    assert.equal(model.thinkingLevelMap, undefined)
  })
  it('未声明 reasoningEfforts 时不声明推理能力（不发思考参数）', () => {
    const [model] = factsFromEntries([{ id: 'x', name: 'X' }])
    assert.equal(model.reasoning, false)
    assert.equal(model.thinkingLevelMap, undefined)
  })
})

describe('creditLabel', () => {
  it('普通系数取短串', () => {
    assert.equal(creditLabel('x0.79 credits'), 'x0.79')
    assert.equal(creditLabel('x1.62'), 'x1.62')
  })
  it('零系数显示 free（x0.00 → free）', () => {
    assert.equal(creditLabel('x0.00 credits'), 'free')
    assert.equal(creditLabel('x0'), 'free')
  })
  it('非字符串与无系数返回 undefined', () => {
    assert.equal(creditLabel(undefined), undefined)
    assert.equal(creditLabel('free credits'), undefined)
    assert.equal(creditLabel(0.79), undefined)
  })
})

describe('displayName', () => {
  it('系数以两空格附加，视觉标记不进名字（能力走 inputModalities + 卡片）', () => {
    assert.equal(displayName({ name: 'GLM-5.3', credits: 'x0.79', input: ['text', 'image'] }), 'GLM-5.3  x0.79')
    assert.equal(displayName({ name: 'Hy3', credits: 'x0.00', input: ['text', 'image'] }), 'Hy3  free')
    assert.equal(displayName({ name: 'GLM-5.3', credits: 'x0.79' }), 'GLM-5.3  x0.79')
  })
  it('无系数时保持原始名', () => {
    assert.equal(displayName({ name: 'Kimi K2' }), 'Kimi K2')
  })
})

describe('effortName', () => {
  it('官方档位 id 映射为可读展示名', () => {
    assert.equal(effortName('off'), 'Off')
    assert.equal(effortName('minimal'), 'Minimal')
    assert.equal(effortName('low'), 'Low')
    assert.equal(effortName('medium'), 'Medium')
    assert.equal(effortName('high'), 'High')
    assert.equal(effortName('xhigh'), 'Extra high')
    assert.equal(effortName('max'), 'Max')
  })
  it('未知档位 id 原样返回', () => {
    assert.equal(effortName('turbo'), 'turbo')
  })
})

describe('parseModelConfig', () => {
  it('解析实测形状：可选档位 + 固定档位两种 reasoning 形态 + 视觉判定', () => {
    const body = {
      code: 0,
      data: {
        agents: [{ name: 'cli', models: ['deepseek-v4-pro', 'glm-5.3-flash', 'hy4-preview'] }],
        models: [
          {
            id: 'deepseek-v4-pro',
            name: 'Deepseek-V4-Pro',
            descriptionZh: 'DeepSeek 旗舰模型，支持 1M 上下文窗口',
            maxInputTokens: 1000000,
            maxOutputTokens: 50000,
            credits: 'x0.51 credits',
            supportsImages: true,
            supportsReasoning: true,
            reasoning: { effort: 'high', summary: 'auto' },
          },
          {
            id: 'glm-5.3-flash',
            name: 'GLM-5.3-Flash',
            descriptionZh: '原生多模态，擅长处理复杂的长程自主任务。',
            maxInputTokens: 1000000,
            maxOutputTokens: 32000,
            credits: 'x0.06 credits',
            supportsImages: true,
            supportsReasoning: true,
            reasoning: { canDisableThinking: true, defaultEffort: 'high', summary: 'auto', supportedEfforts: ['low', 'high', 'max'] },
          },
          {
            id: 'hy4-preview',
            name: 'Hy4 preview',
            disabledMultimodal: false,
            maxInputTokens: 1000000,
            maxOutputTokens: 64000,
            credits: 'x0.00 credits',
            supportsImages: true,
            supportsReasoning: true,
            reasoning: { canDisableThinking: false, defaultEffort: 'high', summary: 'auto', supportedEfforts: ['high'] },
          },
        ],
      },
    }
    const models = parseModelConfig(body)
    assert.equal(models.length, 3)
    // 纯文本：supportsImages=true 但无多模态声明（实测 deepseek-v4-pro/flash 就是这种）
    assert.deepEqual(models[0], {
      id: 'deepseek-v4-pro',
      name: 'Deepseek-V4-Pro',
      description: 'DeepSeek 旗舰模型，支持 1M 上下文窗口',
      credits: 'x0.51',
      contextWindow: 1000000,
      maxTokens: 50000,
      input: ['text'],
      reasoningEfforts: { high: 'high' },
      defaultEffort: 'high',
    })
    // 原生多模态：描述声明
    assert.deepEqual(models[1], {
      id: 'glm-5.3-flash',
      name: 'GLM-5.3-Flash',
      description: '原生多模态，擅长处理复杂的长程自主任务。',
      credits: 'x0.06',
      contextWindow: 1000000,
      maxTokens: 32000,
      input: ['text', 'image'],
      reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
      defaultEffort: 'high',
    })
    // disabledMultimodal=false 且不可关思考（无描述字段 → 不携带）
    assert.deepEqual(models[2], {
      id: 'hy4-preview',
      name: 'Hy4 preview',
      credits: 'x0.00',
      contextWindow: 1000000,
      maxTokens: 64000,
      input: ['text', 'image'],
      reasoningEfforts: { high: 'high' },
      defaultEffort: 'high',
    })
  })
  it('agents 包裹在 data.agent 下时同样解析（descriptionEn 兜底）', () => {
    const body = {
      data: {
        agent: { agents: [{ name: 'cli', models: ['hy3'] }] },
        models: [{ id: 'hy3', descriptionEn: 'Model description fallback', maxInputTokens: 192000, maxOutputTokens: 64000 }],
      },
    }
    const models = parseModelConfig(body)
    assert.equal(models.length, 1)
    assert.equal(models[0].id, 'hy3')
    assert.equal(models[0].description, 'Model description fallback')
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
