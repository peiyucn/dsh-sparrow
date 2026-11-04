// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LEGACY_1017_TEXT, showsLegacy1017Badge } from '../lib/client/legacy-1017-badge.js'

describe('legacy-1017-badge：旧版目录角标兼容回退', () => {
  it('固定文案是 info 蓝色的 1017', () => {
    assert.equal(LEGACY_1017_TEXT, '1017')
  })

  it('只对旧版相同的条件命中（provider / model id / 固定版本名三条同时）', () => {
    assert.equal(showsLegacy1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), true)
    assert.equal(showsLegacy1017Badge('deepseek-account', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), true)
    assert.equal(showsLegacy1017Badge('codebuddy-credits', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), false)
    assert.equal(showsLegacy1017Badge('deepseek-official', 'deepseek-v4-pro', 'DeepSeek-V4.1-Flash'), false)
    assert.equal(showsLegacy1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek-V4.1-Pro'), false)
    assert.equal(showsLegacy1017Badge('', '', ''), false)
  })
})
