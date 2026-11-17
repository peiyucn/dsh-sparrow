
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createKeyGuard } from '../../lib/client/app/utils.js'

describe('createKeyGuard 逐键在途守卫', () => {
  it('同一 key 的并发调用只执行一次', async () => {
    const guard = createKeyGuard()
    let calls = 0

    let release = () => {}
    const gate = new Promise((resolve) => { release = () => { resolve(undefined) } })
    const first = guard.run('calendar', async () => {
      calls += 1
      await gate
    })

    await guard.run('calendar', async () => { calls += 1 })
    assert.equal(calls, 1)
    release()
    await first

    await guard.run('calendar', async () => { calls += 1 })
    assert.equal(calls, 2)
  })

  it('不同 key 互不阻塞', async () => {
    const guard = createKeyGuard()
    const done: string[] = []
    await Promise.all([
      guard.run('c1', async () => { done.push('c1') }),
      guard.run('c2', async () => { done.push('c2') }),
    ])
    assert.deepEqual(done.sort(), ['c1', 'c2'])
  })

  it('任务失败后释放 key，下一次点击照常执行', async () => {
    const guard = createKeyGuard()
    await assert.rejects(guard.run('c1', async () => { throw new Error('boom') }), /boom/u)
    let ran = false
    await guard.run('c1', async () => { ran = true })
    assert.equal(ran, true)
  })
})
