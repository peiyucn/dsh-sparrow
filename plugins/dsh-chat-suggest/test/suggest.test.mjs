import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFimPrompt, detectDraftLanguage, isLanguageConsistent, DEFAULT_MAX_BODY_BYTES, extractSuggestions, extractUsage, speakerStopSequences,
  formatTokenCount, hasDegenerateRepeat, isDeepseekMainRoute, isHistoryEcho, mainRouteFromSession,
  normalizeConfig, normalizeSuggestModelMode, normalizeTriggerSensitivity, parseCompleteBody, recentHistoryTurns,
  resolveSuggestModel, shouldTriggerSuggest, cleanSuggestion, startsWithHistoryEcho, summarizeUpstreamBody, truncateFirstSentence,
  upstreamStatusToError, validateCompletePayload,
} from '../lib/suggest.js'

describe('chat-suggest 纯逻辑', () => {
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
      assert.deepEqual(value, { sessionId: 'session-1', prompt: '你好', suggestModelMode: 'auto' })
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

  describe('detectDraftLanguage', () => {
    it('含中文 应该 判定 zh', () => {
      assert.equal(detectDraftLanguage('我觉得这个方案'), 'zh')
    })

    it('纯英文 应该 判定 en', () => {
      assert.equal(detectDraftLanguage('please'), 'en')
    })

    it('英文夹杂中文 应该 判定 zh', () => {
      assert.equal(detectDraftLanguage('hello 你好'), 'zh')
    })
  })

  describe('isLanguageConsistent', () => {
    it('英文草稿 + 英文建议 应该 一致', () => {
      assert.equal(isLanguageConsistent('please', ' fix it'), true)
    })

    it('英文草稿 + 中文建议 应该 不一致', () => {
      assert.equal(isLanguageConsistent('please', '用中文回复'), false)
    })

    it('英文草稿带尾随空格 + 中文建议 应该 不一致', () => {
      assert.equal(isLanguageConsistent('please ', '先看看这个'), false)
    })

    it('中文草稿 + 英文建议 应该 放行（中文草稿常夹英文）', () => {
      assert.equal(isLanguageConsistent('我觉得', 'ok fine'), true)
    })

    it('中文草稿 + 中文建议 应该 一致', () => {
      assert.equal(isLanguageConsistent('我觉得', '可以'), true)
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
      assert.equal(buildFimPrompt(history, '下周计划是'), '用户：帮我写周报\n助手：好的，本周完成了……\n\n用户：下周计划是')
    })

    it('英文语言 应该 使用 User:/Assistant: 说话人标记', () => {
      const history = [
        { role: 'user', content: [{ type: 'text', text: 'Review this change' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Looks good overall.' }] },
      ]
      assert.equal(buildFimPrompt(history, 'Next iteration I want', 'en'), 'User: Review this change\nAssistant: Looks good overall.\n\nUser: Next iteration I want')
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

  describe('speakerStopSequences', () => {
    it('zh 应该 包含中文说话人标记', () => {
      assert.deepEqual(speakerStopSequences('zh'), ['\n用户：', '\n助手：'])
    })

    it('en 应该 包含英文说话人标记', () => {
      assert.deepEqual(speakerStopSequences('en'), ['\nUser: ', '\nAssistant: '])
    })
  })

  describe('cleanSuggestion', () => {
    it('正常续写 应该 原样返回', () => {
      assert.equal(cleanSuggestion('可行性不高'), '可行性不高')
    })

    it('续写带出助手回合 应该 在说话人标记处截断', () => {
      assert.equal(cleanSuggestion('可行性不高\n助手：嗯，我理解你的顾虑。'), '可行性不高')
    })

    it('续写带出新用户回合 应该 在说话人标记处截断', () => {
      assert.equal(cleanSuggestion(' tell me about the history\n用户：换一个话题'), 'tell me about the history')
    })

    it('以助手标记开头 应该 丢弃（角色切换）', () => {
      assert.equal(cleanSuggestion('助手：看起来你的消息好像没发完整呢'), null)
    })

    it('前置换行加助手标记 应该 丢弃', () => {
      assert.equal(cleanSuggestion('\n助手：好的，请讲。\n\n用户：请帮我写一首诗'), null)
    })

    it('以用户标记开头 应该 丢弃', () => {
      assert.equal(cleanSuggestion('用户：我先说两句'), null)
    })

    it('en 以 Assistant 开头 应该 丢弃', () => {
      assert.equal(cleanSuggestion('Assistant: sure thing', 'en'), null)
    })

    it('en 续写带出 Assistant 回合 应该 截断', () => {
      assert.equal(cleanSuggestion(' tell me more\nAssistant: of course!', 'en'), 'tell me more')
    })

    it('纯空白 应该 丢弃', () => {
      assert.equal(cleanSuggestion('  \n '), null)
    })

    it('小写全角冒号变体 assistant：开头 应该 丢弃', () => {
      assert.equal(cleanSuggestion('assistant：好的，我看了下', 'zh'), null)
    })

    it('小写半角冒号变体 user: 开头 应该 丢弃', () => {
      assert.equal(cleanSuggestion('user: 我先说两句', 'zh'), null)
    })

    it('中部小写变体 应该 在标记处截断', () => {
      assert.equal(cleanSuggestion('好的，我们继续\nassistant：我来补充', 'zh'), '好的，我们继续')
    })
  })

  describe('truncateFirstSentence', () => {
    it('中文句号 应该 截断到第一句', () => {
      assert.equal(truncateFirstSentence('可行性不高，我们再看看。接下来'), '可行性不高，我们再看看。')
    })

    it('感叹号 应该 截断', () => {
      assert.equal(truncateFirstSentence('听起来不错！然后我们继续'), '听起来不错！')
    })

    it('问号 应该 截断', () => {
      assert.equal(truncateFirstSentence('什么？真的吗'), '什么？')
    })

    it('英文句点后随空格 应该 截断', () => {
      assert.equal(truncateFirstSentence('se note: this is ChatGPT. Our system'), 'se note: this is ChatGPT.')
    })

    it('无句末标点 应该 原样返回', () => {
      assert.equal(truncateFirstSentence('Let me think'), 'Let me think')
    })

    it('缩写（e.g.）应该 不截断', () => {
      assert.equal(truncateFirstSentence('e.g. consider this'), 'e.g. consider this')
    })

    it('分号 应该 不截断', () => {
      assert.equal(truncateFirstSentence('好的；然后我们继续'), '好的；然后我们继续')
    })

    it('空串 应该 原样返回', () => {
      assert.equal(truncateFirstSentence(''), '')
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

  describe('resolveSuggestModel', () => {
    it('mode=pro 应该 恒用 v4-pro', () => {
      assert.equal(resolveSuggestModel('pro', { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, 'deepseek-v4-pro'), 'deepseek-v4-pro')
    })

    it('mode=flash 应该 恒用 v4-flash', () => {
      assert.equal(resolveSuggestModel('flash', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, 'deepseek-v4-pro'), 'deepseek-v4-flash')
    })

    it('mode=auto 主模型 v4-pro 应该 跟随主模型', () => {
      assert.equal(resolveSuggestModel('auto', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, 'deepseek-v4-pro'), 'deepseek-v4-pro')
    })

    it('mode=auto 主模型 v4-flash 应该 跟随主模型', () => {
      assert.equal(resolveSuggestModel('auto', { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, 'deepseek-v4-pro'), 'deepseek-v4-flash')
    })

    it('mode=auto 主模型 vision-exp 应该 回退配置默认', () => {
      assert.equal(resolveSuggestModel('auto', { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' }, 'deepseek-v4-pro'), 'deepseek-v4-pro')
    })

    it('mode=auto 非官方 provider 应该 回退配置默认', () => {
      assert.equal(resolveSuggestModel('auto', { provider: 'zai', model: 'deepseek-v4-pro' }, 'deepseek-v4-pro'), 'deepseek-v4-pro')
    })

    it('mode=auto 未知主模型 应该 回退配置默认', () => {
      assert.equal(resolveSuggestModel('auto', undefined, 'deepseek-v4-pro'), 'deepseek-v4-pro')
    })
  })

  describe('normalizeSuggestModelMode', () => {
    it('合法三档 应该 原样返回', () => {
      assert.equal(normalizeSuggestModelMode('auto'), 'auto')
      assert.equal(normalizeSuggestModelMode('pro'), 'pro')
      assert.equal(normalizeSuggestModelMode('flash'), 'flash')
    })

    it('非法/缺省 应该 回退 auto', () => {
      assert.equal(normalizeSuggestModelMode(undefined), 'auto')
      assert.equal(normalizeSuggestModelMode('gpt'), 'auto')
      assert.equal(normalizeSuggestModelMode(42), 'auto')
    })
  })

  describe('extractUsage', () => {
    it('合法 usage 应该 提取 prompt/completion', () => {
      assert.deepEqual(extractUsage({ usage: { prompt_tokens: 12, completion_tokens: 34 } }), { promptTokens: 12, completionTokens: 34 })
    })

    it('缺失 usage 应该 回退 0', () => {
      assert.deepEqual(extractUsage({ choices: [] }), { promptTokens: 0, completionTokens: 0 })
    })

    it('非法字段 应该 回退 0', () => {
      assert.deepEqual(extractUsage({ usage: { prompt_tokens: 'x', completion_tokens: -1 } }), { promptTokens: 0, completionTokens: 0 })
    })
  })

  describe('formatTokenCount', () => {
    it('千以内 应该 原样输出', () => {
      assert.equal(formatTokenCount(0), '0')
      assert.equal(formatTokenCount(999), '999')
    })

    it('千以上 应该 加千分位逗号', () => {
      assert.equal(formatTokenCount(1000), '1,000')
      assert.equal(formatTokenCount(1234567), '1,234,567')
    })

    it('非法输入 应该 回退 0', () => {
      assert.equal(formatTokenCount(-5), '0')
      assert.equal(formatTokenCount(Number.NaN), '0')
    })
  })

  describe('shouldTriggerSuggest', () => {
    it('空草稿 应该 不触发（empty）', () => {
      assert.deepEqual(shouldTriggerSuggest('   '), { ok: false, reason: 'empty' })
    })

    it('过短草稿 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('我觉得'), { ok: false, reason: 'too-short' })
    })

    it('句末问号 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerSuggest('还有个问题，fim接口是计费的么？'), { ok: false, reason: 'sentence-end' })
    })

    it('句末句号 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerSuggest('这个方案已经写完了。'), { ok: false, reason: 'sentence-end' })
    })

    it('英文句末句点 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerSuggest('Let me fix it.'), { ok: false, reason: 'sentence-end' })
    })

    it('中文尾随空格 应该 触发（空格分词续写）', () => {
      assert.deepEqual(shouldTriggerSuggest('我觉得这个方案还可以 '), { ok: true })
    })

    it('中文句号后跟空格 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerSuggest('这个方案已经写完了。 '), { ok: false, reason: 'sentence-end' })
    })

    it('高灵敏：句末问号 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('还有个问题，fim接口是计费的么？', 'eager'), { ok: true })
    })

    it('高灵敏：句末句号 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('这个方案已经写完了。', 'eager'), { ok: true })
    })

    it('高灵敏：英文句末句点 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('Let me fix it.', 'eager'), { ok: true })
    })

    it('高灵敏：句号后跟空格 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('这个方案已经写完了。 ', 'eager'), { ok: true })
    })

    it('低灵敏：句末句号 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerSuggest('这个方案我们昨天已经写完了。', 'conservative'), { ok: false, reason: 'sentence-end' })
    })

    it('高灵敏：4 字中文 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('你好啊这', 'eager'), { ok: true })
    })

    it('高灵敏：3 字中文 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('你好啊', 'eager'), { ok: false, reason: 'too-short' })
    })

    it('高灵敏：夹入英文停半词 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('这个 bug 出在 transf', 'eager'), { ok: true })
    })

    it('低灵敏：词后空格 应该 不触发（trailing-space）', () => {
      assert.deepEqual(shouldTriggerSuggest('Let me fix the ', 'conservative'), { ok: false, reason: 'trailing-space' })
    })

    it('低灵敏：不足 12 字中文 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('这个方案还差一点点', 'conservative'), { ok: false, reason: 'too-short' })
    })

    it('标准档（缺省）与显式 standard 应该 行为一致', () => {
      assert.deepEqual(shouldTriggerSuggest('我觉得这个方案的'), shouldTriggerSuggest('我觉得这个方案的', 'standard'))
    })

    describe('normalizeTriggerSensitivity', () => {
      it('合法三档 应该 原样返回', () => {
        assert.equal(normalizeTriggerSensitivity('eager'), 'eager')
        assert.equal(normalizeTriggerSensitivity('standard'), 'standard')
        assert.equal(normalizeTriggerSensitivity('conservative'), 'conservative')
      })

      it('非法/缺省 应该 回退 standard', () => {
        assert.equal(normalizeTriggerSensitivity('ultra'), 'standard')
        assert.equal(normalizeTriggerSensitivity(undefined), 'standard')
      })
    })

    it('中灵敏：夹入英文停半词 应该 不触发（mid-word）', () => {
      assert.deepEqual(shouldTriggerSuggest('这个 bug 出在 transf', 'standard'), { ok: false, reason: 'mid-word' })
    })

    it('低灵敏：夹入英文停半词 应该 不触发（mid-word）', () => {
      assert.deepEqual(shouldTriggerSuggest('这个 bug 出在 transf', 'conservative'), { ok: false, reason: 'mid-word' })
    })

    it('纯英文停在单词中间 应该 触发（补全当前单词）', () => {
      assert.deepEqual(shouldTriggerSuggest('Let me fix the iss'), { ok: true })
    })

    it('纯英文 4 字符 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('Hell'), { ok: true })
    })

    it('纯英文 3 字符 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('Hel'), { ok: false, reason: 'too-short' })
    })

    it('低灵敏：纯英文 7 字符 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('example', 'conservative'), { ok: false, reason: 'too-short' })
    })

    it('纯英文 2 字符 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('He'), { ok: false, reason: 'too-short' })
    })

    it('高灵敏：纯英文 2 字符 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('He', 'eager'), { ok: true })
    })

    it('高灵敏：纯英文 1 字符 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('H', 'eager'), { ok: false, reason: 'too-short' })
    })

    it('纯英文尾随空格 应该 触发（预测下一个词）', () => {
      assert.deepEqual(shouldTriggerSuggest('Let me fix the '), { ok: true })
    })

    it('纯英文句号后跟空格 应该 不触发（sentence-end）', () => {
      assert.deepEqual(shouldTriggerSuggest('Let me fix it. '), { ok: false, reason: 'sentence-end' })
    })

    it('中文未完成句 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('我觉得这个方案可以的'), { ok: true })
    })

    it('逗号结尾 应该 触发', () => {
      assert.deepEqual(shouldTriggerSuggest('我们先看看数据，再看'), { ok: true })
    })

    it('中灵敏：7 字中文 应该 不触发（too-short）', () => {
      assert.deepEqual(shouldTriggerSuggest('我觉得这个方案', 'standard'), { ok: false, reason: 'too-short' })
    })
  })

  describe('hasDegenerateRepeat', () => {
    it('同句循环复读 应该 判定退化', () => {
      assert.equal(hasDegenerateRepeat('请用中文回复。'.repeat(48)), true)
    })

    it('复读被截断（尾部不完整短语）应该 判定退化', () => {
      assert.equal(hasDegenerateRepeat('请用中文回复。'.repeat(10) + '请用中文回'), true)
    })

    it('正常单句 应该 不算退化', () => {
      assert.equal(hasDegenerateRepeat('请用中文回复。'), false)
    })

    it('自然短复读（好的好的好的）应该 不算退化', () => {
      assert.equal(hasDegenerateRepeat('好的好的好的'), false)
    })

    it('空串 应该 不算退化', () => {
      assert.equal(hasDegenerateRepeat(''), false)
    })
  })

  describe('isHistoryEcho', () => {
    it('建议开头复述历史消息 应该 判定回声', () => {
      assert.equal(isHistoryEcho('你看，联想出来的文字内容。我输入的是ple', ['我是说，你看联想出来的文字内容。']), true)
    })

    it('建议是历史消息的截断前缀 应该 判定回声', () => {
      assert.equal(isHistoryEcho('这是一段很长的历史消息开', ['这是一段很长的历史消息开头，后面还有内容']), true)
    })

    it('建议中段含助手消息片段 应该 判定回声（转述实现细节）', () => {
      assert.equal(isHistoryEcho('先想想 cleanSuggestion 按说话人标记处理', ['cleanSuggestion按说话人标记截断，角色切换丢弃']), true)
    })

    it('助手消息 15 字窗口 应该 判定回声（调用方阈值）', () => {
      assert.equal(isHistoryEcho('先想想 cleanSuggestion 按说话人标记处理', ['cleanSuggestion按说话人标记截断，角色切换丢弃'], 15), true)
    })

    it('短于阈值的片段 应该 不算回声', () => {
      assert.equal(isHistoryEcho('这个功能我们先做一版试试', ['这个功能我们先做一版试试效果'], 15), false)
    })

    it('建议与历史仅共词不共段 应该 不算回声', () => {
      assert.equal(isHistoryEcho('这个方案还需要再想想', ['这个方案可以再细化']), false)
    })

    it('建议与历史无重叠 应该 不算回声', () => {
      assert.equal(isHistoryEcho('请继续实现这个功能', ['今天天气不错']), false)
    })

    it('短建议（不足 10 字）应该 不算回声', () => {
      assert.equal(isHistoryEcho('好的', ['好的，我们开始']), false)
    })

    it('历史为空 应该 不算回声', () => {
      assert.equal(isHistoryEcho('你看，联想出来的文字内容', []), false)
    })
  })

  describe('startsWithHistoryEcho', () => {
    it('开头复述用户原话 应该 判定回声', () => {
      assert.equal(startsWithHistoryEcho('你看，联想出来的文字内容。我输入的是ple', ['我是说，你看联想出来的文字内容。']), true)
    })

    it('中段才重叠 应该 不算回声', () => {
      assert.equal(startsWithHistoryEcho('先想想 cleanSuggestion 按说话人标记处理', ['cleanSuggestion按说话人标记截断，角色切换丢弃']), false)
    })

    it('短建议（不足 10 字）应该 不算回声', () => {
      assert.equal(startsWithHistoryEcho('好的', ['好的，我们开始']), false)
    })

    it('历史为空 应该 不算回声', () => {
      assert.equal(startsWithHistoryEcho('你看，联想出来的文字内容', []), false)
    })
  })

  describe('recentHistoryTurns', () => {
    it('空历史 应该 返回空数组', () => {
      assert.deepEqual(recentHistoryTurns([]), [])
    })

    it('非 user/assistant 消息 应该 跳过', () => {
      const turns = recentHistoryTurns([
        { role: 'system', content: [{ type: 'text', text: '你是助手' }] },
        { role: 'user', content: [{ type: 'text', text: '你好' }] },
      ])
      assert.deepEqual(turns, [{ role: 'user', text: '你好' }])
    })
  })
})
