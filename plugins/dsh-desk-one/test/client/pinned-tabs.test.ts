
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PINNED_TABS_STORAGE_KEY, readPinnedTabs, writePinnedTabs } from '../../lib/client/pin.js'

type FakeStorage = Storage & { get: (key: string) => string | undefined }


function fakeStorage(initial?: Record<string, string>): FakeStorage {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    get length() { return values.size },
    clear: () => { values.clear() },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
    get: (key: string) => values.get(key),
  }
}

describe('左栏固定状态持久化', () => {
  it('没有记录 / 坏 JSON 时返回空', () => {
    assert.deepEqual(readPinnedTabs(fakeStorage()), [])
    assert.deepEqual(readPinnedTabs(fakeStorage({ [PINNED_TABS_STORAGE_KEY]: '{oops' })), [])
    assert.deepEqual(readPinnedTabs(fakeStorage({ [PINNED_TABS_STORAGE_KEY]: '"tasks"' })), [])
  })

  it('只认已知 tab、去重，并按 tab 顺序返回', () => {
    const store = fakeStorage({ [PINNED_TABS_STORAGE_KEY]: JSON.stringify(['tasks', 'notes', 'nope', 'tasks']) })
    assert.deepEqual(readPinnedTabs(store), ['notes', 'tasks'])
  })

  it('写入按 tab 顺序去重，可被读回', () => {
    const store = fakeStorage()
    writePinnedTabs( (['sessions', 'notes', 'notes']), store)
    assert.deepEqual(JSON.parse(store.get(PINNED_TABS_STORAGE_KEY) ?? '[]'), ['notes', 'sessions'])
    assert.deepEqual(readPinnedTabs(store), ['notes', 'sessions'])
    writePinnedTabs([], store)
    assert.deepEqual(readPinnedTabs(store), [])
  })

  it('storage 不可用时静默降级', () => {
    assert.deepEqual(readPinnedTabs(undefined), [])
    assert.doesNotThrow(() => writePinnedTabs(['notes'], undefined))
    assert.doesNotThrow(() => writePinnedTabs(['notes'], {
      get length() { return 0 },
      key: () => null,
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
      removeItem: () => {},
      clear: () => {},
    }))
  })
})
