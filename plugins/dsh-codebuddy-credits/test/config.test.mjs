import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { keyRefs } from '../lib/config.js'

describe('keyRefs', () => {
  it('默认配置：官方派生名优先，旧引用兜底', () => {
    assert.deepEqual(keyRefs({}), ['CODEBUDDY_CREDITS_API_KEY', 'CODEBUDDY_API_KEY'])
  })

  it('自定义 apiKeyEnv 生效，旧引用仍兜底', () => {
    assert.deepEqual(keyRefs({ apiKeyEnv: 'MY_OWN_KEY' }), ['MY_OWN_KEY', 'CODEBUDDY_API_KEY'])
  })

  it('apiKeyEnv 配成旧引用时去重（同引用不重复尝试/迁移）', () => {
    assert.deepEqual(keyRefs({ apiKeyEnv: 'CODEBUDDY_API_KEY' }), ['CODEBUDDY_API_KEY'])
  })
})
