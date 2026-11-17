

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PANEL_TAB_ATTRIBUTE, requestPanelReset, subscribePanelReset,
} from '../../lib/client/app/panelReset.js'

describe('边栏快捷入口 → 面板重置桥', () => {
  it('订阅者应该 只收到自己订阅期间的通知', () => {
    const seen: string[] = []
    const unsubscribe = subscribePanelReset(tab => { seen.push(tab) })
    requestPanelReset('sessions')
    unsubscribe()
    requestPanelReset('notes')
    assert.deepEqual(seen, ['sessions'], '退订后不得再收到通知')
  })

  it('多个订阅者应该 都收到同一个 tab', () => {
    const first: string[] = []
    const second: string[] = []
    const offFirst = subscribePanelReset(tab => { first.push(tab) })
    const offSecond = subscribePanelReset(tab => { second.push(tab) })
    requestPanelReset('notebook')
    offFirst()
    offSecond()
    assert.deepEqual(first, ['notebook'])
    assert.deepEqual(second, ['notebook'])
  })

  it('重复退订应该 幂等，不抛错也不影响其他订阅者', () => {
    const seen: string[] = []
    const offKept = subscribePanelReset(tab => { seen.push(tab) })
    const offRepeated = subscribePanelReset(() => {})
    offRepeated()
    assert.doesNotThrow(() => { offRepeated() })
    requestPanelReset('tasks')
    offKept()
    assert.deepEqual(seen, ['tasks'])
  })

  it('DOM 标记属性名应该 是稳定的 data 属性（图标与 install 共用）', () => {
    assert.equal(PANEL_TAB_ATTRIBUTE, 'data-dsh-desk-panel-tab')
  })
})
