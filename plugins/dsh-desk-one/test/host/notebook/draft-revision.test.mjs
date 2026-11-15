// @ts-check
/**
 * Draft-box optimistic concurrency.
 *
 * Regression this guards: the revision guard was checked only against the snapshot read before the
 * write, so two windows saving the same file both passed and the later write silently overwrote the
 * earlier one. The guard must be re-evaluated inside the (asynchronous) serialized write callback.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DomainError } from '@deepseek-ai/dsh-storage-domain'
import { DeskStore } from '../../../lib/host/store.js'

/**
 * Official KV domain stub: `update` yields a microtask before its read-transform-write step, like
 * the real asynchronous serialized write chain — that yield is what lets two concurrent saves read
 * the same snapshot and exposes the race.
 */
function fakeDomain() {
  /** @type {Map<string, Map<string, unknown>>} */
  const tables = new Map()
  /** @param {string} tableName */
  const tableOf = (tableName) => {
    let records = tables.get(tableName)
    if (records === undefined) {
      records = new Map()
      tables.set(tableName, records)
    }
    const store = records
    return {
      /** @param {string} key */
      get: key => store.get(key),
      entries: () => [...store.entries()][Symbol.iterator](),
      keys: () => [...store.keys()][Symbol.iterator](),
      get size() { return store.size },
      /** @param {string} key @param {unknown} value */
      put: async (key, value) => { store.set(key, value) },
      /** @param {string} key */
      delete: async key => store.delete(key),
      /**
       * @param {string} key
       * @param {(current: any) => any} transform
       */
      update: async (key, transform) => {
        await Promise.resolve()
        if (!store.has(key)) throw new DomainError('missing-key', `no record '${key}'`)
        const next = transform(store.get(key))
        store.set(key, next)
        return next
      },
    }
  }
  return { name: 'desk_one', table: tableOf, close: async () => {} }
}

/** Minimal host context: DeskStore.open only needs the storage domain and a logger. */
function fakeCtx() {
  return {
    logger: { warn: () => {}, info: () => {} },
    storageDomain: { open: async () => fakeDomain() },
  }
}

/** @returns {{ id: string, quote: string, text: string, createdAt: string }} */
function draftOf(/** @type {string} */ id) {
  return { id, quote: '原文', text: '批注', createdAt: '2026-01-01T00:00:00.000Z' }
}

/** Open a store with one file identity already assigned. */
async function openStore() {
  const store = await DeskStore.open(/** @type {any} */ (fakeCtx()))
  const file = await store.ensureNoteFile({ rootPath: '/notes', path: 'a.md', hash: 'h1' })
  return { store, file }
}

describe('批注草稿的乐观并发', () => {
  it('两个窗口用同一 revision 并发保存时，后写入者应该收到 REVISION_CONFLICT', async () => {
    const { store, file } = await openStore()
    await store.saveNoteDraft({
      rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('first')], expectedRevision: 0,
    })
    const results = await Promise.allSettled([
      store.saveNoteDraft({
        rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('window-a')], expectedRevision: 1,
      }),
      store.saveNoteDraft({
        rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('window-b')], expectedRevision: 1,
      }),
    ])
    assert.equal(results[0].status, 'fulfilled', '先写入的窗口应该成功')
    assert.equal(results[1].status, 'rejected', '后写入的窗口必须收到冲突而不是静默覆盖')
    const failure = /** @type {PromiseRejectedResult} */ (results[1]).reason
    assert.equal(failure.name, 'DeskModelError')
    assert.equal(failure.code, 'REVISION_CONFLICT')
    const final = store.getNoteDraft(file.id)
    assert.equal(final?.revision, 2, '只应有一次写入生效')
    assert.deepEqual(final?.drafts.map(entry => entry.id), ['window-a'], '冲突方的草稿不得覆盖已写入的草稿')
  })

  it('用过期 revision 清空草稿应该被拒绝且不删除草稿箱', async () => {
    const { store, file } = await openStore()
    await store.saveNoteDraft({
      rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('kept')], expectedRevision: 0,
    })
    await assert.rejects(
      store.saveNoteDraft({ rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [], expectedRevision: 5 }),
      (error) => /** @type {any} */ (error).code === 'REVISION_CONFLICT',
    )
    assert.deepEqual(store.getNoteDraft(file.id)?.drafts.map(entry => entry.id), ['kept'])
  })

  it('文件还没有草稿但调用方按旧 revision 保存时应该冲突，且不创建草稿箱', async () => {
    const { store, file } = await openStore()
    await assert.rejects(
      store.saveNoteDraft({
        rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('stale')], expectedRevision: 3,
      }),
      (error) => /** @type {any} */ (error).code === 'REVISION_CONFLICT',
    )
    assert.equal(store.getNoteDraft(file.id), undefined)
  })

  it('不传 expectedRevision 时保持“最后写入者胜”的既有行为', async () => {
    const { store, file } = await openStore()
    await store.saveNoteDraft({ rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('one')] })
    const updated = await store.saveNoteDraft({
      rootPath: '/notes', path: 'a.md', fileId: file.id, drafts: [draftOf('two')],
    })
    assert.equal(updated?.revision, 2)
    assert.deepEqual(store.getNoteDraft(file.id)?.drafts.map(entry => entry.id), ['two'])
  })
})
