import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildChatPrefixMessages, DEFAULT_MAX_BODY_BYTES, extractSuggestions, isStaleResponse,
  normalizeConfig, parseCompleteBody, summarizeUpstreamBody, upstreamStatusToError, validateCompletePayload,
} from '../lib/prefix-completion.js'

describe('prefix-completion 纯逻辑', () => {
  describe('normalizeConfig', () => {
    it('空配置 应该 返回默认值', () => {
      const config = normalizeConfig(undefined)
      assert.equal(config.baseURL, 'https://api.deepseek.com/beta')
      assert.equal(config.model, 'deepseek-v4-pro')
        assert.equal(config.maxTokens, 96)
      assert.equal(config.apiKeyEnv, 'DEEPSEEK_API_KEY')
    })

    it('非正整数限制 应该 抛错', () => {
      assert.throws(() => normalizeConfig({ maxTokens: 0 }), /maxTokens/)
    })

    it('非 http 的 baseURL 应该 抛错', () => {
      assert.throws(() => normalizeConfig({ baseURL: 'file:///tmp' }), /baseURL/)
    })
  })

  describe('validateCompletePayload', () => {
    it('合法请求 应该 返回 prompt 与 sessionId', () => {
      const value = validateCompletePayload({ sessionId: 'session-1', prompt: '你好' })
      assert.deepEqual(value, { sessionId: 'session-1', prompt: '你好' })
    })

    it('缺 prompt 应该 返回 INVALID_PROMPT', () => {
      const value = validateCompletePayload({ sessionId: 'session-1', prompt: '' })
      assert.equal(value.code, 'INVALID_PROMPT')
    })

    it('超过 maxPromptChars 应该 返回 INVALID_PROMPT', () => {
      const value = validateCompletePayload({ sessionId: 'session-1', prompt: 'abcd' }, 3)
      assert.equal(value.code, 'INVALID_PROMPT')
    })
  })

  describe('parseCompleteBody', () => {
    it('超限请求体 应该 返回 BAD_BODY', () => {
      const body = JSON.stringify({ sessionId: 's', prompt: 'x'.repeat(DEFAULT_MAX_BODY_BYTES) })
      const value = parseCompleteBody(body, 1024)
      assert.equal(value.code, 'BAD_BODY')
    })

    it('非法 JSON 应该 返回 BAD_BODY', () => {
      const value = parseCompleteBody('{bad', 1024)
      assert.equal(value.code, 'BAD_BODY')
    })
  })

  describe('upstreamStatusToError', () => {
    it('401 应该 映射为 MISSING_CREDENTIAL', () => {
      assert.equal(upstreamStatusToError(401, '').code, 'MISSING_CREDENTIAL')
    })

    it('429 应该 映射为 RATE_LIMITED', () => {
      assert.equal(upstreamStatusToError(429, '').code, 'RATE_LIMITED')
    })

    it('500 应该 映射为 UPSTREAM_ERROR 并保留短摘要', () => {
      const error = upstreamStatusToError(500, JSON.stringify({ error: { message: 'boom' } }))
      assert.equal(error.code, 'UPSTREAM_ERROR')
      assert.match(error.message, /boom/u)
    })
  })

  describe('extractSuggestions', () => {
    it('合法 choices 应该 去重返回文本', () => {
      assert.deepEqual(extractSuggestions({ choices: [{ text: 'a' }, { text: 'a' }, { text: 'b' }] }), ['a', 'b'])
    })

    it('无 choices 应该 返回空数组', () => {
      assert.deepEqual(extractSuggestions({}), [])
    })
  })

  describe('buildChatPrefixMessages', () => {
    it('空历史 应该 生成用户角度引导 + assistant prefix', () => {
      const messages = buildChatPrefixMessages([], '我觉得这个功能')
      assert.equal(messages.length, 2)
      assert.equal(messages[0].role, 'user')
      assert.match(messages[0].content, /用户的角度/u)
      assert.match(messages[0].content, /只输出草稿的续写文本/u)
      assert.equal(messages.at(-1).role, 'assistant')
      assert.equal(messages.at(-1).content, '我觉得这个功能')
      assert.equal(messages.at(-1).prefix, true)
    })

    it('带最近对话历史 应该 保留文本，引导在前、草稿 prefix 在最后', () => {
      const history = [
        { role: 'user', content: [{ type: 'text', text: '帮我写周报' }] },
        { role: 'assistant', content: [{ type: 'text', text: '好的，本周完成了……' }] },
      ]
      const messages = buildChatPrefixMessages(history, '下周计划是')
      assert.equal(messages[0].content, '帮我写周报')
      assert.equal(messages[1].content, '好的，本周完成了……')
      assert.equal(messages[2].role, 'user')
      assert.match(messages[2].content, /用户的口吻/u)
      assert.equal(messages.at(-1).content, '下周计划是')
      assert.equal(messages.at(-1).prefix, true)
    })

    it('官方契约 应该 满足：最后一条消息 assistant 且 prefix 为 true', () => {
      const history = [{ role: 'assistant', content: [{ type: 'text', text: '已经写好了。' }] }]
      const messages = buildChatPrefixMessages(history, '另外')
      assert.equal(messages.at(-1).role, 'assistant')
      assert.equal(messages.at(-1).prefix, true)
      assert.equal(messages.at(-2).role, 'user')
    })
  })

  describe('extractSuggestions chat.completions', () => {
    it('message.content 应该 被提取', () => {
      assert.deepEqual(
        extractSuggestions({ choices: [{ message: { content: ' 续写结果 ' } }] }),
        ['续写结果'],
      )
    })
  })

  describe('summarizeUpstreamBody', () => {
    it('超长文本 应该 截断并带省略号', () => {
      const value = summarizeUpstreamBody('x'.repeat(300), 10)
      assert.equal(value.length, 11)
      assert.match(value, /…$/u)
    })
  })

  describe('isStaleResponse', () => {
    it('draftRev 不一致 应该 判定陈旧', () => {
      assert.equal(isStaleResponse(1, 2), true)
    })

    it('draftRev 一致 应该 判定新鲜', () => {
      assert.equal(isStaleResponse(1, 1), false)
    })
  })
})
