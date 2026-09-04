import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CodeBuddyAdapter, mapFinish, mapUsage, parseSseLine, toWireMessages, toWireTools } from '../lib/adapter.js'

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
