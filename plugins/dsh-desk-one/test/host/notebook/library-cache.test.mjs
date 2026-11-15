// @ts-check
/**
 * Notebook scan cache: root-keyed TTL + single flight.
 *
 * The regression this guards: the linked root can change while a scan of the previous root is in
 * flight, and the old shared-slot cache handed the previous root's entries to the new root.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLibraryCache } from '../../../lib/host/notebook/cache.js'

/** A promise plus its resolve function, so a test can hold the injected scan open. */
/** @returns {{ promise: Promise<string[]>, resolve: (value: string[]) => void }} */
function deferredEntries() {
  /** @type {((value: string[]) => void) | undefined} */
  let resolve
  /** @type {Promise<string[]>} */
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve: (value) => { resolve?.(value) } }
}

describe('笔记库扫描缓存（root 键 → TTL + 单飞）', () => {
  it('同一 root 的并发请求应该共享一次扫描', async () => {
    let scans = 0
    const cache = createLibraryCache(async () => {
      scans += 1
      return ['entry']
    }, 60_000)
    const [first, second] = await Promise.all([cache.get('root-a'), cache.get('root-a')])
    assert.deepEqual([...first], ['entry'])
    assert.deepEqual([...second], ['entry'])
    assert.equal(scans, 1, '两个并发请求只应扫描一次')
  })

  it('root 切换时不得把上一个 root 的条目交给新 root', async () => {
    const gate = deferredEntries()
    /** @type {string[]} */
    const scannedRoots = []
    const cache = createLibraryCache(async (root) => {
      scannedRoots.push(root)
      if (root === 'root-a') return await gate.promise
      return ['b-entry']
    }, 60_000)
    const oldRoot = cache.get('root-a')
    const newRoot = cache.get('root-b')
    gate.resolve(['a-entry'])
    assert.deepEqual(await oldRoot, ['a-entry'])
    assert.deepEqual(await newRoot, ['b-entry'], '新 root 必须拿到自己的扫描结果，而不是旧 root 的')
    assert.deepEqual(scannedRoots, ['root-a', 'root-b'])
  })

  it('invalidate 之后，旧扫描不得回填缓存', async () => {
    const gate = deferredEntries()
    let scans = 0
    const cache = createLibraryCache(async () => {
      scans += 1
      return scans === 1 ? await gate.promise : ['new-entry']
    }, 60_000)
    const stale = cache.get('root-a')
    cache.invalidate()
    gate.resolve(['stale-entry'])
    assert.deepEqual(await stale, ['stale-entry'], 'in-flight 的调用方仍按快照语义拿到结果')
    assert.deepEqual(await cache.get('root-a'), ['new-entry'], '失效后必须重扫，不能被旧扫描回填')
    assert.equal(scans, 2)
  })

  it('TTL 内复用扫描结果，过期后重扫', async () => {
    let clock = 0
    let scans = 0
    const cache = createLibraryCache(async () => {
      scans += 1
      return [`scan-${scans}`]
    }, 1_000, () => clock)
    assert.deepEqual(await cache.get('root-a'), ['scan-1'])
    assert.deepEqual(await cache.get('root-a'), ['scan-1'])
    assert.equal(scans, 1, 'TTL 内不应重扫')
    clock = 1_001
    assert.deepEqual(await cache.get('root-a'), ['scan-2'])
    assert.equal(scans, 2, 'TTL 过期后应重扫')
  })

  it('扫描失败后不留悬挂的 in-flight 槽位，下一次可以重试', async () => {
    let scans = 0
    const cache = createLibraryCache(async () => {
      scans += 1
      if (scans === 1) throw new Error('boom')
      return ['ok']
    }, 60_000)
    await assert.rejects(cache.get('root-a'), /boom/u)
    assert.deepEqual(await cache.get('root-a'), ['ok'])
    assert.equal(scans, 2)
  })
})
