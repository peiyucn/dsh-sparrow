
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HttpError } from '../../lib/client/http.js'
import { isExpiredLoginFlow } from '../../lib/client/schedule/sources/status.js'

describe('Outlook 登录轮询的终态识别', () => {
  it('宿主已丢弃登录流（409 SCHEDULE_AUTH_EXPIRED）→ 终止轮询', () => {
    assert.equal(isExpiredLoginFlow(new HttpError(409, '登录已过期，请重新发起', 'SCHEDULE_AUTH_EXPIRED')), true)
  })

  it('网络 / 超时 / 5xx 仍按可重试处理', () => {
    assert.equal(isExpiredLoginFlow(new HttpError(0, '请求超时')), false)
    assert.equal(isExpiredLoginFlow(new HttpError(503, '服务不可用')), false)
    assert.equal(isExpiredLoginFlow(new Error('Failed to fetch')), false)
    assert.equal(isExpiredLoginFlow('boom'), false)
  })

  it('同状态的其它冲突（409 REVISION_CONFLICT）不算登录过期', () => {
    assert.equal(isExpiredLoginFlow(new HttpError(409, '修订冲突', 'REVISION_CONFLICT')), false)
  })
})
