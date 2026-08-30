import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFimPrompt, DEFAULT_MAX_BODY_BYTES, extractSuggestions, fimStopSequences, isDeepseekMainRoute,
  isStaleResponse, mainRouteFromSession, normalizeConfig, parseCompleteBody, shouldTriggerFim,
  summarizeUpstreamBody, upstreamStatusToError, validateCompletePayload,
} from '../lib/chat-fim.js'

describe('chat-fim 纯逻辑', () => {
  describe('normalizeConfig', () => {
    it('空配置 应该 返回默认值', () => {
      const config = normalizeConfig(undefined)
      assert.equal(config.baseURL, 'https://api.deepseek.com/beta')
      assert.equal(config.model, 'deepseek-v4-pro')
        assert.equal(config.maxTokens, 96)
      assert.equal(config.apiKeyEnv, 'DEEPSEEK_API_KEY')
      assert.equal(config.suggestionCount, 1)
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

  describe('buildFimPrompt', () => {
    it('空历史 应该 只输出「用户：草稿」', () => {
      assert.equal(buildFimPrompt([], '我觉得这个功能'), '用户：我觉得这个功能')
    })

    it('带最近对话历史 应该 转成说话人文本，草稿在最后', () => {
      const history = [
        { role: 'user', content: [{ type: 'text', text: '帮我写周报' }] },
        { role: 'assistant', content: [{ type: 'text', text: '好的，本周完成了……' }] },
      ]
      const prompt = buildFimPrompt(history, '下周计划是')
      assert.match(prompt, /^用户：帮我写周报\n助手：好的，本周完成了……\n\n用户：下周计划是$/u)
    })

    it('英文语言 应该 使用 User:/Assistant: 说话人标记', () => {
      const history = [
        { role: 'user', content: [{ type: 'text', text: 'Review this change' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Looks good overall.' }] },
      ]
      const prompt = buildFimPrompt(history, 'Next iteration I want', 'en')
      assert.equal(prompt, 'User: Review this change\nAssistant: Looks good overall.\n\nUser: Next iteration I want')
    })

    it('历史裁剪 应该 受 maxMessages/maxChars 限制', () => {
      const history = [
        { role: 'user', content: [{ type: 'text', text: '第一条' }] },
        { role: 'user', content: [{ type: 'text', text: '第二条' }] },
        { role: 'user', content: [{ type: 'text', text: '第三条' }] },
      ]
      const prompt = buildFimPrompt(history, '草稿', 'zh', 2, 1000)
      assert.doesNotMatch(prompt, /第一条/u)
      assert.match(prompt, /用户：第二条\n用户：第三条\n\n用户：草稿$/u)
    })
  })

  describe('fimStopSequences', () => {
    it('zh 应该 包含中文说话人标记', () => {
      assert.deepEqual(fimStopSequences('zh'), ['\n用户：', '\n助手：'])
    })

    it('en 应该 包含英文说话人标记', () => {
      assert.deepEqual(fimStopSequences('en'), ['\nUser: ', '\nAssistant: '])
    })
  })

  describe('extractSuggestions completions', () => {
    it('message.content 应该 被提取', () => {
      assert.deepEqual(
        extractSuggestions({ choices: [{ message: { content: ' 续写结果 ' } }] }),
        ['续写结果'],
      )
    })

    it('FIM 的 text 字段 应该 被提取', () => {
      assert.deepEqual(
        extractSuggestions({ choices: [{ text: ' 续写结果 ' }] }),
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

  describe('mainRouteFromSession', () => {
    it('最近一条 request/header 应该 取到 provider/model', () => {
      const events = [
        { type: 'user/message', seq: 1, time: 1, data: {} },
        { type: 'request/header', seq: 2, time: 2, data: { header: { config: { provider: 'zai', model: 'glm-5.3-flash' } } } },
        { type: 'request/header', seq: 3, time: 3, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-pro' } } } },
      ]
      assert.deepEqual(mainRouteFromSession(events), { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    })

    it('无 request/header 应该 返回 undefined', () => {
      assert.equal(mainRouteFromSession([{ type: 'user/message', seq: 1, time: 1, data: {} }]), undefined)
    })
  })

  describe('isDeepseekMainRoute', () => {
    it('deepseek-official 应该 放行', () => {
      assert.equal(isDeepseekMainRoute({ provider: 'deepseek-official' }), true)
    })

    it('其它 provider 应该 禁用', () => {
      assert.equal(isDeepseekMainRoute({ provider: 'zai' }), false)
    })

    it('未知路由 应该 默认放行', () => {
      assert.equal(isDeepseekMainRoute(undefined), true)
    })
  })

  describe('shouldTriggerFim', () => {
    it('空草稿 应该 不触发（empty）', () => {
      assert.deepEqual(shouldTriggerFim('   '), { ok: false, reason: 'empty' })
    })

    it('过短草稿 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerFim('我觉得'), { ok: false, reason: 'too-short' })
    })

    it('句末问号 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerFim('还有个问题，fim接口是计费的么？'), { ok: false, reason: 'sentence-end' })
    })

    it('句末句号 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerFim('这个方案已经写完了。'), { ok: false, reason: 'sentence-end' })
    })

    it('英文句末句点 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerFim('Let me fix it.'), { ok: false, reason: 'sentence-end' })
    })

    it('尾随空格 应该 不触发（trailing-space）', () => {
      assert.deepEqual(shouldTriggerFim('我觉得这个方案还 '), { ok: false, reason: 'trailing-space' })
    })

    it('停在英文单词中间 应该 不触发（mid-word）', () => {
      assert.deepEqual(shouldTriggerFim('Let me fix the iss'), { ok: false, reason: 'mid-word' })
    })

    it('中文未完成句 应该 触发', () => {
      assert.deepEqual(shouldTriggerFim('我觉得这个方案的'), { ok: true })
    })

    it('逗号结尾 应该 触发', () => {
      assert.deepEqual(shouldTriggerFim('我们先看看数据，再'), { ok: true })
    })
  })
})
