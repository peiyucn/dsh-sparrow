import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TASK_CARD_STATE_LIMIT, TASK_CARD_STATE_STORAGE_KEY } from '../../lib/constants.js'
import {
  loadTaskCardStates,
  readTaskCardUi,
  setTaskCardUi,
  writeTaskCardUi,
} from '../../lib/client/tasks/taskCardState.js'

function fakeStorage(initial?: string) {
  let value = initial ?? null
  return {
    get length() {
      return value === null ? 0 : 1
    },
    clear() {
      value = null
    },
    getItem() {
      return value
    },
    key(index: number) {
      return index === 0 && value !== null ? TASK_CARD_STATE_STORAGE_KEY : null
    },
    removeItem() {
      value = null
    },
    setItem(_key: string, next: string) {
      value = next
    },
    raw: () => value,
  }
}

describe('任务卡折叠状态', () => {
  it('默认空状态代表整卡展开、描述收起', () => {
    const states = loadTaskCardStates(fakeStorage())
    assert.deepEqual(states, {})
    assert.deepEqual(readTaskCardUi('task_1', fakeStorage()), {})
  })

  it('损坏 JSON / 非对象时回退为空状态', () => {
    assert.deepEqual(loadTaskCardStates(fakeStorage('{')), {})
    assert.deepEqual(loadTaskCardStates(fakeStorage('[]')), {})
    assert.deepEqual(loadTaskCardStates(fakeStorage('null')), {})
    assert.deepEqual(loadTaskCardStates(fakeStorage('"x"')), {})
  })

  it('只接受已知状态值', () => {
    const states = loadTaskCardStates(fakeStorage(JSON.stringify({
      task_1: { card: 'collapsed', body: 'expanded' },
      task_2: { card: 'nope', body: 'nope' },
      task_3: null,
    })))
    assert.deepEqual(states, { task_1: { card: 'collapsed', body: 'expanded' } })
  })

  it('按 task id 独立设置并清理空状态', () => {
    let states = setTaskCardUi({}, 'task_1', { card: 'collapsed' })
    states = setTaskCardUi(states, 'task_2', { body: 'expanded' })
    assert.deepEqual(states, { task_1: { card: 'collapsed' }, task_2: { body: 'expanded' } })
    states = setTaskCardUi(states, 'task_1', {})
    assert.deepEqual(states, { task_2: { body: 'expanded' } })
  })

  it('写回后按 task id 读回', () => {
    const storage = fakeStorage()
    writeTaskCardUi('task_1', { card: 'collapsed', body: 'expanded' }, storage)
    assert.deepEqual(readTaskCardUi('task_1', storage), { card: 'collapsed', body: 'expanded' })
    assert.deepEqual(readTaskCardUi('task_2', storage), {})
    assert.equal(JSON.parse(String(storage.raw())).task_1.card, 'collapsed')
  })

  it('状态数超过上限时淘汰最旧条目', () => {
    let states = {}
    for (let index = 0; index <= TASK_CARD_STATE_LIMIT; index += 1) {
      states = setTaskCardUi(states, `task_${index}`, { body: 'expanded' })
    }
    const keys = Object.keys(states)
    assert.equal(keys.length, TASK_CARD_STATE_LIMIT)
    assert.equal(keys.includes('task_0'), false)
    assert.equal(keys.includes(`task_${TASK_CARD_STATE_LIMIT}`), true)
  })

  it('存储抛错时静默降级', () => {
    const storage = {
      get length(): number {
        throw new Error('blocked')
      },
      clear() {
        throw new Error('blocked')
      },
      getItem() {
        throw new Error('blocked')
      },
      key() {
        throw new Error('blocked')
      },
      removeItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    }
    assert.deepEqual(loadTaskCardStates(storage), {})
    assert.doesNotThrow(() => writeTaskCardUi('task_1', { body: 'expanded' }, storage))
    assert.equal(TASK_CARD_STATE_STORAGE_KEY, 'dsh-desk-one:task-card-state')
  })
})
