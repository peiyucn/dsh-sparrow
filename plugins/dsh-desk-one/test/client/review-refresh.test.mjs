// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  REVIEW_REFRESH_INTERVAL_MS, shouldRefreshOnShow,
} from '../../lib/client/notebook/review/refresh.js'

describe('审阅静默刷新策略', () => {
  it('从隐藏回到可见时立即刷新', () => {
    assert.equal(shouldRefreshOnShow(false, true), true)
  })

  it('保持可见或离开可见时不额外刷新', () => {
    assert.equal(shouldRefreshOnShow(true, true), false)
    assert.equal(shouldRefreshOnShow(true, false), false)
    assert.equal(shouldRefreshOnShow(false, false), false)
  })

  it('可见时的轮询间隔应足够短，不让「本轮改动」长时间停在旧内容', () => {
    assert.ok(
      REVIEW_REFRESH_INTERVAL_MS <= 5_000,
      `静默刷新间隔 ${REVIEW_REFRESH_INTERVAL_MS}ms 超过 5s；改文件后「本轮改动」会长时间不更新`,
    )
  })
})
