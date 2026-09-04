import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseJsonOrNull } from '../lib/client/parse.js'

describe('parseJsonOrNull 响应解析安全默认值', () => {
  it('合法 JSON 应该 返回解析对象', () => {
    assert.deepEqual(parseJsonOrNull('{"supported":true}'), { supported: true })
  })

  it('非法 JSON 应该 返回 null', () => {
    assert.equal(parseJsonOrNull('<html>502 Bad Gateway</html>'), null)
  })

  it('空串 应该 返回 null', () => {
    assert.equal(parseJsonOrNull(''), null)
  })

  it('JSON 标量 应该 原样返回', () => {
    assert.equal(parseJsonOrNull('42'), 42)
    assert.equal(parseJsonOrNull('"x"'), 'x')
    assert.equal(parseJsonOrNull('null'), null)
  })
})
