import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CodeBuddyAdapter, effectiveReasoningEffort, mapFinish, mapUsage, parseSseLine, toWireMessages, toWireTools } from '../lib/adapter.js'

describe('toWireTools', () => {
  it('DSH 工具 schema 包成 OpenAI function 信封（name/description/parameters 原位）', () => {
    const wire = toWireTools([{
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    }])
    assert.deepEqual(wire, [{
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      },
    }])
  })

  it('空工具集返回空数组', () => {
    assert.deepEqual(toWireTools([]), [])
  })
})

describe('toWireMessages', () => {
  it('assistant 工具调用回放保留 name 与 arguments', async () => {
    const wire = await toWireMessages({
      provider: 'codebuddy-credits',
      model: 'hy4-preview',
      messages: [{
        id: 'm1',
        role: 'assistant',
        source: { kind: 'model', model: 'hy4-preview' },
        content: [{ type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"a.txt"}' }],
      }],
    })
    assert.deepEqual(wire, [{
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }],
    }])
  })

  it('用户图片块经附件 seam 序列化为 image_url data URL', async () => {
    const ref = { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 4, width: 2, height: 2 }
    const wire = await toWireMessages({
      provider: 'codebuddy-credits',
      model: 'glm-5.3-flash',
      messages: [{
        id: 'm1',
        role: 'user',
        source: { kind: 'user' },
        content: [
          { type: 'text', text: '看这张图' },
          { type: 'image', attachment: ref },
        ],
      }],
    }, async (got) => {
      assert.equal(got.attachmentId, 'sha256:abc')
      return { mediaType: 'image/png', data: new Uint8Array([1, 2, 3, 4]) }
    })
    assert.deepEqual(wire, [{
      role: 'user',
      content: [
        { type: 'text', text: '看这张图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AQIDBA==' } },
      ],
    }])
  })

  it('未接入附件服务时带图请求以明确错误失败', async () => {
    await assert.rejects(
      toWireMessages({
        provider: 'codebuddy-credits',
        model: 'glm-5.3-flash',
        messages: [{
          id: 'm1',
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }],
        }],
      }),
      /未接入附件服务/,
    )
  })

  // spec 04（2026-09-08 实测）：上游只认最后一条 user 消息里的图片，
  // DSH 又把 system-reminder 等作为 user 消息追加在真实用户消息之后。
  it('连续 user 消息应该 合并为一条（文本顺序保持）', async () => {
    const wire = await toWireMessages({
      provider: 'codebuddy-credits',
      model: 'deepseek-v4-flash',
      messages: [
        { id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '这是啥？' }] },
        { id: 'm2', role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: '<system-reminder>工作区规范</system-reminder>' }] },
      ],
    })
    assert.deepEqual(wire, [{
      role: 'user',
      content: [
        { type: 'text', text: '这是啥？' },
        { type: 'text', text: '<system-reminder>工作区规范</system-reminder>' },
      ],
    }])
  })

  it('图片后跟其它 user 消息 应该 合并后图片落在最后一条消息里', async () => {
    const wire = await toWireMessages({
      provider: 'codebuddy-credits',
      model: 'deepseek-v4-flash',
      messages: [
        {
          id: 'm1',
          role: 'user',
          source: { kind: 'user' },
          content: [
            { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } },
            { type: 'text', text: '这是啥？' },
          ],
        },
        { id: 'm2', role: 'user', source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '技能目录' }] },
      ],
    }, async () => ({ mediaType: 'image/png', data: new Uint8Array([1, 2, 3, 4]) }))
    assert.equal(wire.length, 1)
    assert.equal(wire[0].role, 'user')
    assert.deepEqual(wire[0].content, [
      { type: 'text', text: '这是啥？' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AQIDBA==' } },
      { type: 'text', text: '技能目录' },
    ])
  })

  it('工具结果消息 应该 不参与合并（user/tool 交替保持）', async () => {
    const wire = await toWireMessages({
      provider: 'codebuddy-credits',
      model: 'deepseek-v4-flash',
      messages: [
        { id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '跑一下' }] },
        {
          id: 'm2',
          role: 'user',
          source: { kind: 'tool', callId: 'call_1' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: '结果' }] }],
        },
        { id: 'm3', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '继续' }] },
      ],
    })
    assert.deepEqual(wire, [
      { role: 'user', content: '跑一下' },
      { role: 'tool', tool_call_id: 'call_1', content: '结果' },
      { role: 'user', content: '继续' },
    ])
  })

  it('被 assistant 隔开的 user 消息 应该 不合并', async () => {
    const wire = await toWireMessages({
      provider: 'codebuddy-credits',
      model: 'deepseek-v4-flash',
      messages: [
        { id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第一问' }] },
        { id: 'm2', role: 'assistant', source: { kind: 'model', model: 'deepseek-v4-flash' }, content: [{ type: 'text', text: '第一答' }] },
        { id: 'm3', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第二问' }] },
      ],
    })
    assert.deepEqual(wire, [
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答', tool_calls: undefined },
      { role: 'user', content: '第二问' },
    ])
  })
})

describe('CodeBuddyAdapter.stream', () => {
  it('块终态携带累计全量内容（正文/工具名/参数）+ 请求体工具包信封', async () => {
    const frames = [
      { choices: [{ delta: { role: 'assistant', content: 'Hello' } }] },
      { choices: [{ delta: { content: ' world' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{"p' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ath":"a.txt"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, credit: 0.01 } },
    ]
    const sse = frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n'

    let requestBody
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://copilot.tencent.com/v2/chat/completions')
      requestBody = JSON.parse(init.body)
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }

    const adapter = new CodeBuddyAdapter({
      models: () => [],
      resolveApiKey: async () => 'test-key',
      account: () => undefined,
      streamIdleTimeoutMs: 10_000,
    })
    const chunks = []
    try {
      for await (const chunk of adapter.stream({
        provider: 'codebuddy-credits',
        model: 'hy4-preview',
        messages: [],
        tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }],
      })) {
        chunks.push(chunk)
      }
    } finally {
      globalThis.fetch = undefined
    }

    // 请求体：工具包成 function 信封，且工具名/描述/参数都在。
    assert.deepEqual(requestBody.tools, [{
      type: 'function',
      function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object' } },
    }])

    // 正文增量照发；终块带全文。
    const textDeltas = chunks.filter(c => c.type === 'text-delta').map(c => c.text)
    assert.deepEqual(textDeltas, ['Hello', ' world'])
    const textEnd = chunks.find(c => c.type === 'block-end' && c.index === 1)
    assert.deepEqual(textEnd.block, { type: 'text', text: 'Hello world' })

    // 工具增量：name 只在首帧出现，参数增量累计；终块带全名与全参数。
    const toolDeltas = chunks.filter(c => c.type === 'tool-call-delta')
    assert.equal(toolDeltas.length, 2)
    assert.equal(toolDeltas[0].name, 'read_file')
    assert.equal(toolDeltas[0].argumentsDelta, '{"p')
    assert.equal('name' in toolDeltas[1], false)
    assert.equal(toolDeltas[1].argumentsDelta, 'ath":"a.txt"}')
    const toolEnd = chunks.find(c => c.type === 'block-end' && c.index === 2)
    assert.deepEqual(toolEnd.block, { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"a.txt"}' })

    // usage 与 finish 正常收尾。
    const usage = chunks.find(c => c.type === 'usage')
    assert.equal(usage.usage.inputTokens, 10)
    assert.equal(usage.usage.outputTokens, 5)
    const finish = chunks.find(c => c.type === 'finish')
    assert.deepEqual(finish.reason, { kind: 'tool-calls' })
  })

  it('usage 帧先于终帧单独到达、终帧重复携带 usage 时，usage 块与记账回调都只发一次', async () => {
    const frames = [
      { choices: [{ delta: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, credit: 0.01 } },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, credit: 0.01 } },
    ]
    const sse = frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n'
    const usages = []
    globalThis.fetch = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    const adapter = new CodeBuddyAdapter({
      models: () => [],
      resolveApiKey: async () => 'test-key',
      account: () => undefined,
      streamIdleTimeoutMs: 10_000,
      onUsage: usage => { usages.push(usage) },
    })
    const chunks = []
    try {
      for await (const chunk of adapter.stream({
        provider: 'codebuddy-credits',
        model: 'hy4-preview',
        messages: [],
        sessionId: 's1',
      })) {
        chunks.push(chunk)
      }
    } finally {
      globalThis.fetch = undefined
    }
    assert.equal(usages.length, 1)
    assert.equal(usages[0].credit, 0.01)
    assert.equal(usages[0].sessionId, 's1')
    assert.equal(chunks.filter(c => c.type === 'usage').length, 1)
  })

  it('终帧之后到达的尾随 usage 帧 应该 只补记账、不再补发 usage 块', async () => {
    const frames = [
      { choices: [{ delta: { content: 'ok' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, credit: 0.02 } },
    ]
    const sse = frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n'
    const usages = []
    globalThis.fetch = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    const adapter = new CodeBuddyAdapter({
      models: () => [],
      resolveApiKey: async () => 'test-key',
      account: () => undefined,
      streamIdleTimeoutMs: 10_000,
      onUsage: usage => { usages.push(usage) },
    })
    const chunks = []
    try {
      for await (const chunk of adapter.stream({
        provider: 'codebuddy-credits',
        model: 'hy4-preview',
        messages: [],
        sessionId: 's1',
      })) {
        chunks.push(chunk)
      }
    } finally {
      globalThis.fetch = undefined
    }
    assert.equal(usages.length, 1)
    assert.equal(usages[0].credit, 0.02)
    // finish 之后不允许再向流里推块（消费端契约）。
    assert.equal(chunks.filter(c => c.type === 'usage').length, 0)
    assert.equal(chunks.findIndex(c => c.type === 'finish'), chunks.length - 1)
  })
})

describe('effectiveReasoningEffort（Max 模式档位锁）', () => {
  it('锁开 + 推理模型 → 强制 max（覆盖调用方档位）', () => {
    assert.equal(effectiveReasoningEffort(true, true, 'low'), 'max')
    assert.equal(effectiveReasoningEffort(true, true, undefined), 'max')
    assert.equal(effectiveReasoningEffort(true, true, 'high'), 'max')
  })

  it('锁开 + 非推理模型 → 不发参数（锁对无推理能力模型无影响）', () => {
    assert.equal(effectiveReasoningEffort(true, false, 'low'), 'low')
    assert.equal(effectiveReasoningEffort(true, false, undefined), undefined)
  })

  it('锁关 → 透传调用方档位', () => {
    assert.equal(effectiveReasoningEffort(false, true, 'low'), 'low')
    assert.equal(effectiveReasoningEffort(false, true, 'high'), 'high')
    assert.equal(effectiveReasoningEffort(false, true, undefined), undefined)
    assert.equal(effectiveReasoningEffort(false, false, undefined), undefined)
  })
})

describe('CodeBuddyAdapter Max 模式请求构造', () => {
  const sse = [
    'data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) + '\n\n',
    'data: [DONE]\n\n',
  ].join('')

  async function captureBody({ maxMode, modelReasoning, effort }) {
    let requestBody
    globalThis.fetch = async (url, init) => {
      requestBody = JSON.parse(init.body)
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    const adapter = new CodeBuddyAdapter({
      models: () => [{
        id: 'm1', name: 'M1', contextWindow: 1000, maxTokens: 100,
        input: ['text'], reasoning: modelReasoning,
      }],
      resolveApiKey: async () => 'test-key',
      account: () => undefined,
      streamIdleTimeoutMs: 10_000,
      maxMode: () => maxMode,
    })
    try {
      for await (const chunk of adapter.stream({
        provider: 'codebuddy-credits',
        model: 'm1',
        messages: [],
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
      })) {
        void chunk
      }
    } finally {
      globalThis.fetch = undefined
    }
    return requestBody
  }

  it('锁开 + 推理模型：请求体 reasoning_effort 强制 max（覆盖 low）', async () => {
    const body = await captureBody({ maxMode: true, modelReasoning: true, effort: 'low' })
    assert.equal(body.reasoning_effort, 'max')
  })

  it('锁开 + 非推理模型：不带 reasoning_effort', async () => {
    const body = await captureBody({ maxMode: true, modelReasoning: false, effort: undefined })
    assert.equal('reasoning_effort' in body, false)
  })

  it('锁关：透传调用方档位；未给档位不带参数', async () => {
    const body = await captureBody({ maxMode: false, modelReasoning: true, effort: 'high' })
    assert.equal(body.reasoning_effort, 'high')
    const bare = await captureBody({ maxMode: false, modelReasoning: true, effort: undefined })
    assert.equal('reasoning_effort' in bare, false)
  })
})

describe('parseSseLine / mapFinish / mapUsage', () => {
  it('parseSseLine 跳过注释与非 data 行，[DONE] 返回 undefined', () => {
    assert.equal(parseSseLine(''), undefined)
    assert.equal(parseSseLine('data: [DONE]'), undefined)
    assert.equal(parseSseLine('{bad json'), undefined)
    assert.deepEqual(parseSseLine('data: {"a":1}'), { a: 1 })
  })

  it('mapFinish 识别 tool_calls 与 stop', () => {
    assert.deepEqual(mapFinish('tool_calls'), { kind: 'tool-calls' })
    assert.deepEqual(mapFinish('stop'), { kind: 'stop' })
    assert.equal(mapFinish('bogus'), undefined)
  })

  it('mapUsage 缓存命中从 input 剔除并提取 credit', () => {
    const { tokens, credit } = mapUsage({ prompt_tokens: 100, completion_tokens: 40, prompt_cache_hit_tokens: 30, credit: 0.5 })
    assert.equal(tokens.inputTokens, 70)
    assert.equal(tokens.outputTokens, 40)
    assert.equal(tokens.cacheReadTokens, 30)
    assert.equal(credit, 0.5)
  })
})
