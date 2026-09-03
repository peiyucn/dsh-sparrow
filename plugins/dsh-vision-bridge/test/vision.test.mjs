import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractJsonObject, findImageReference, imageRefsInEvents, isDeepseekMainRoute,
  mainRouteFromSession, modelSupportsImages, normalizeAttachmentId, normalizeVisionConfig, parseVisionReport,
  renderVisionReport, resolveVisionOutput, shouldClearInputModalities, visionCacheKey, VisionCache,
} from '../lib/vision.js'

describe('vision-bridge 纯逻辑', () => {
  describe('normalizeVisionConfig', () => {
    it('空配置 应该 使用官方文本路由默认值', () => {
      const config = normalizeVisionConfig(undefined)
      assert.equal(config.visionModel, 'deepseek-v4-flash-vision-exp')
      assert.equal(config.visionProvider, 'deepseek-official')
      assert.equal(config.maxTokens, 8192)
      assert.equal(config.temperature, 0.2)
      assert.equal(config.visionReasoningEffort, 'low')
      assert.equal(config.textRoutes.length, 2)
    })

    it('非法缓存上限 应该 抛错', () => {
      assert.throws(() => normalizeVisionConfig({ cacheMaxEntries: 0 }), /cacheMaxEntries/u)
    })

    it('合法思考力度 应该 保留配置值', () => {
      const config = normalizeVisionConfig({ visionReasoningEffort: 'off' })
      assert.equal(config.visionReasoningEffort, 'off')
    })

    it('非法思考力度 应该 抛错', () => {
      assert.throws(() => normalizeVisionConfig({ visionReasoningEffort: 'ultra' }), /visionReasoningEffort/u)
    })
  })

  describe('resolveVisionOutput', () => {
    it('正文非空 应该 优先返回正文', () => {
      assert.equal(resolveVisionOutput('  {"summary":"ok"}  ', '思考过程'), '{"summary":"ok"}')
    })

    it('只有思考文本 应该 抛截断错误', () => {
      assert.throws(() => resolveVisionOutput('   ', '思考到一半'), /未给出正文/u)
    })

    it('正文与思考都为空 应该 抛上游无文本错误', () => {
      assert.throws(() => resolveVisionOutput('', '  '), /没有返回文本/u)
    })
  })

  describe('visionCacheKey', () => {
    it('同图同提问 应该 生成相同键', () => {
      assert.equal(visionCacheKey('abc', 'q1'), visionCacheKey('abc', 'q1'))
    })

    it('同图不同提问 应该 生成不同键', () => {
      assert.notEqual(visionCacheKey('abc', 'q1'), visionCacheKey('abc', 'q2'))
    })

    it('不同图同提问 应该 生成不同键', () => {
      assert.notEqual(visionCacheKey('abc', 'q1'), visionCacheKey('xyz', 'q1'))
    })
  })

  describe('modelSupportsImages', () => {
    it('显式含 image 应该 判定原生视觉', () => {
      assert.equal(modelSupportsImages(['text', 'image']), true)
    })

    it('undefined 应该 判定非原生视觉', () => {
      assert.equal(modelSupportsImages(undefined), false)
    })

    it('仅 text 应该 判定非原生视觉', () => {
      assert.equal(modelSupportsImages(['text']), false)
    })
  })

  describe('shouldClearInputModalities', () => {
    const routes = [{ provider: 'deepseek-official', model: 'deepseek-v4-pro' }]

    it('命中文本路由且显式不含 image 应该 放行', () => {
      assert.equal(shouldClearInputModalities('deepseek-official', 'deepseek-v4-pro', ['text'], routes), true)
    })

    it('显式含 image 应该 不放行', () => {
      assert.equal(shouldClearInputModalities('deepseek-official', 'deepseek-v4-pro', ['text', 'image'], routes), false)
    })

    it('未命中配置路由 应该 不放行', () => {
      assert.equal(shouldClearInputModalities('deepseek-official', 'vision-model', ['text'], routes), false)
    })

    it('inputModalities 为 undefined 应该 不放行', () => {
      assert.equal(shouldClearInputModalities('deepseek-official', 'deepseek-v4-pro', undefined, routes), false)
    })
  })

  describe('mainRouteFromSession', () => {
    it('最近一条 request/header 应该 取到 provider/model', () => {
      const events = [
        { type: 'user/message', seq: 0, time: 0, data: {} },
        { type: 'request/header', seq: 1, time: 1, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-pro' } } } },
      ]
      assert.deepEqual(mainRouteFromSession(events), { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    })

    it('多条 request/header 应该 取最近一条', () => {
      const events = [
        { type: 'request/header', seq: 0, time: 0, data: { header: { config: { provider: 'a', model: 'm1' } } } },
        { type: 'request/header', seq: 1, time: 1, data: { header: { config: { provider: 'b', model: 'm2' } } } },
      ]
      assert.deepEqual(mainRouteFromSession(events), { provider: 'b', model: 'm2' })
    })

    it('无 request/header 应该 返回 undefined', () => {
      assert.equal(mainRouteFromSession([{ type: 'user/message', seq: 0, time: 0, data: {} }]), undefined)
    })
  })

  describe('isDeepseekMainRoute', () => {
    it('deepseek-official 应该 放行', () => {
      assert.equal(isDeepseekMainRoute({ provider: 'deepseek-official' }), true)
    })

    it('其它 provider 应该 禁用', () => {
      assert.equal(isDeepseekMainRoute({ provider: 'openai' }), false)
    })

    it('未知路由 应该 默认放行', () => {
      assert.equal(isDeepseekMainRoute(undefined), true)
    })
  })

  describe('normalizeAttachmentId', () => {
    it('sha256: 前缀 应该 剥离', () => {
      assert.equal(normalizeAttachmentId('sha256:ABC'), 'abc')
    })

    it('大小写 应该 统一小写', () => {
      assert.equal(normalizeAttachmentId('AbCdEf'), 'abcdef')
    })

    it('空白 应该 去除', () => {
      assert.equal(normalizeAttachmentId('  abc  '), 'abc')
    })
  })

  describe('findImageReference', () => {
    it('user/message 里的图片块 应该 按 attachmentId 反查到 ref', () => {
      const ref = { attachmentId: 'att-1', mediaType: 'image/png' }
      const events = [{
        type: 'user/message',
        seq: 0,
        time: 0,
        data: { message: { role: 'user', content: [{ type: 'image', attachment: ref }] } },
      }]
      const result = findImageReference(events, 'att-1')
      assert.equal(result.ok, true)
      assert.equal(result.ref, ref)
    })

    it('tool-result 嵌套图片 应该 也能反查', () => {
      const ref = { attachmentId: 'att-2', mediaType: 'image/png' }
      const events = [{
        type: 'tool/result',
        seq: 0,
        time: 0,
        data: { content: [{ type: 'tool-result', content: [{ type: 'image', attachment: ref }] }] },
      }]
      const result = findImageReference(events, 'att-2')
      assert.equal(result.ok, true)
      assert.equal(result.ref, ref)
    })

    it('sha256: 前缀与裸哈希 应该 等价精确匹配', () => {
      const ref = { attachmentId: 'sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', mediaType: 'image/png' }
      const events = [{ type: 'user/message', seq: 0, time: 0, data: { content: [{ type: 'image', attachment: ref }] } }]
      const result = findImageReference(events, 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
      assert.equal(result.ok, true)
      assert.equal(result.ref, ref)
    })

    it('截断哈希 应该 唯一前缀匹配', () => {
      const ref = { attachmentId: 'sha256:1f336f80c1fec7c9c080d69e29b529f56c2d17af8bddc935c5aee3229d0e5263', mediaType: 'image/png' }
      const events = [{ type: 'user/message', seq: 0, time: 0, data: { content: [{ type: 'image', attachment: ref }] } }]
      const result = findImageReference(events, '1f336f80')
      assert.equal(result.ok, true)
      assert.equal(result.ref, ref)
    })

    it('前缀命中多个图片 应该 返回 ambiguous 与候选', () => {
      const refs = [
        { attachmentId: 'sha256:1f336f80c1fec7c9c080d69e29b529f56c2d17af8bddc935c5aee3229d0e5263', mediaType: 'image/png' },
        { attachmentId: 'sha256:1f336f80c1fec7c9c080d69e29b529f56c2d17af8bddc935c5aee3229d0e5264', mediaType: 'image/png' },
      ]
      const events = [{ type: 'user/message', seq: 0, time: 0, data: { content: refs.map(ref => ({ type: 'image', attachment: ref })) } }]
      const result = findImageReference(events, '1f336f80')
      assert.equal(result.ok, false)
      assert.equal(result.reason, 'ambiguous')
      assert.equal(result.matches.length, 2)
    })

    it('过短 id 应该 只做精确匹配不做前缀匹配', () => {
      const ref = { attachmentId: 'sha256:1f336f80c1fec7c9c080d69e29b529f56c2d17af8bddc935c5aee3229d0e5263', mediaType: 'image/png' }
      const events = [{ type: 'user/message', seq: 0, time: 0, data: { content: [{ type: 'image', attachment: ref }] } }]
      const result = findImageReference(events, '1f33')
      assert.equal(result.ok, false)
      assert.equal(result.reason, 'not-found')
    })

    it('未知 id 应该 返回 not-found 与现有图片 id', () => {
      assert.equal(findImageReference([], 'nope').ok, false)
      const ref = { attachmentId: 'att-x', mediaType: 'image/png' }
      const events = [{ type: 'user/message', seq: 0, time: 0, data: { content: [{ type: 'image', attachment: ref }] } }]
      const result = findImageReference(events, 'nope')
      assert.equal(result.ok, false)
      assert.deepEqual(result.matches, ['att-x'])
    })
  })

  describe('parseVisionReport', () => {
    it('合法 structured 应该 归一化可选字段', () => {
      const value = parseVisionReport({ summary: ' 一张猫图 ', tables: ['a', 3, 'b'], ocrText: ' 猫 ' })
      assert.equal(value.summary, '一张猫图')
      assert.equal(value.ocrText, '猫')
      assert.deepEqual(value.tables, ['a', 'b'])
    })

    it('无 summary 应该 使用 fallback 文本', () => {
      assert.equal(parseVisionReport(undefined, 'fallback').summary, 'fallback')
    })
  })

  describe('renderVisionReport', () => {
    it('完整报告 应该 包含摘要、OCR、表格', () => {
      const text = renderVisionReport({ summary: 's', ocrText: 'o', tables: ['t'] })
      assert.match(text, /summary: s/u)
      assert.match(text, /ocr:/u)
      assert.match(text, /tables:/u)
    })
  })

  describe('extractJsonObject', () => {
    it('纯 JSON 应该 直接解析', () => {
      assert.deepEqual(extractJsonObject('{"summary":"s"}'), { summary: 's' })
    })

    it('markdown 代码围栏 应该 剥掉围栏解析', () => {
      assert.deepEqual(extractJsonObject('```json\n{"summary":"s"}\n```'), { summary: 's' })
    })

    it('前后杂文 应该 截取首个对象解析', () => {
      assert.deepEqual(extractJsonObject('好的，结果如下：\n{"summary":"s"}\n以上就是。'), { summary: 's' })
    })

    it('非 JSON 应该 返回 undefined', () => {
      assert.equal(extractJsonObject('完全不是 JSON'), undefined)
    })

    it('围栏与 JSON 同行 应该 经花括号回退解析', () => {
      assert.deepEqual(extractJsonObject('```{"summary":"s"}```'), { summary: 's' })
    })

    it('超长栅栏占位（大量制表符）应该 快速判为非法返回 undefined', () => {
      assert.equal(extractJsonObject('```' + '\t'.repeat(10000) + '```'), undefined)
    })
  })

  describe('VisionCache', () => {
    it('重复 get 应该 命中并刷新', () => {
      const cache = new VisionCache(2)
      cache.set('a', { summary: 'a', tables: [] })
      cache.set('b', { summary: 'b', tables: [] })
      assert.equal(cache.get('a')?.summary, 'a')
    })

    it('超过上限 应该 逐出最久未用项', () => {
      const cache = new VisionCache(2)
      cache.set('a', { summary: 'a', tables: [] })
      cache.set('b', { summary: 'b', tables: [] })
      cache.get('a')
      cache.set('c', { summary: 'c', tables: [] })
      assert.equal(cache.get('b'), undefined)
      assert.equal(cache.get('a')?.summary, 'a')
      assert.equal(cache.get('c')?.summary, 'c')
    })
  })

  describe('imageRefsInEvents', () => {
    it('用户消息与工具结果嵌套里的图片 应该 按首次出现顺序去重', () => {
      const imageA = { type: 'image', attachment: { attachmentId: 'sha256:aaaaaaaaaaaaaaaa' } }
      const imageB = { type: 'image', attachment: { attachmentId: 'sha256:bbbbbbbbbbbbbbbb' } }
      const events = [
        { type: 'user/message', data: { content: [imageA, { type: 'text', text: 'x' }] } },
        { type: 'tool/result', data: { content: [{ type: 'tool-result', content: [imageB, imageA] }] } },
      ]
      const refs = imageRefsInEvents(events)
      assert.deepEqual(refs.map(ref => String(ref.attachmentId)), ['sha256:aaaaaaaaaaaaaaaa', 'sha256:bbbbbbbbbbbbbbbb'])
    })

    it('无图事件 应该 返回空数组', () => {
      assert.deepEqual(imageRefsInEvents([{ type: 'user/message', data: { content: [{ type: 'text', text: 'hi' }] } }]), [])
    })
  })

})