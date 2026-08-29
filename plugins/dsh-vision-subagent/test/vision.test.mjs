import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  contentBlocksToText, findImageReference, normalizeVisionConfig, parseVisionReport,
  renderVisionReport, shouldClearInputModalities, VisionCache,
} from '../lib/vision.js'

describe('vision-subagent 纯逻辑', () => {
  describe('normalizeVisionConfig', () => {
    it('空配置 应该 使用官方文本路由默认值', () => {
      const config = normalizeVisionConfig(undefined)
      assert.equal(config.visionModel, 'deepseek-v4-flash-vision-exp')
      assert.equal(config.textRoutes.length, 2)
    })

    it('非法缓存上限 应该 抛错', () => {
      assert.throws(() => normalizeVisionConfig({ cacheMaxEntries: 0 }), /cacheMaxEntries/u)
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

  describe('contentBlocksToText', () => {
    it('混合内容块 应该 只拼接文本', () => {
      const text = contentBlocksToText([
        { type: 'text', text: 'a' },
        { type: 'image', attachment: { attachmentId: 'x', mediaType: 'image/png' } },
        { type: 'text', text: 'b' },
      ])
      assert.equal(text, 'a\nb')
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
})
