import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TASK_CARD_CSS } from '../../lib/client/tasks/styles/card.js'
import { TASK_ARCHIVE_CSS } from '../../lib/client/tasks/styles/archive.js'
import { hasRunningSession } from '../../lib/client/tasks/components/taskCardUtils.js'
import { en, zh } from '../../lib/client/i18n/tasks.js'
import type { SessionChipInfo } from '../../lib/types/client/sessions/contract.js'

function chip(overrides: Partial<SessionChipInfo> = {}): SessionChipInfo {
  return {
    id: 'session-1',
    title: '会话',
    running: false,
    availability: 'available',
    updatedAt: 0,
    subagent: false,
    ...overrides,
  }
}

describe('任务卡 running 判定', () => {
  it('任一可用会话 running 即为 true', () => {
    assert.equal(hasRunningSession([
      chip({ running: false }),
      chip({ id: 'session-2', running: true }),
    ]), true)
  })

  it('全部 idle / 不可用 / 空列表为 false', () => {
    assert.equal(hasRunningSession([chip({ running: false })]), false)
    assert.equal(hasRunningSession([chip({ running: true, availability: 'archived' })]), false)
    assert.equal(hasRunningSession([chip({ running: true, availability: 'unavailable' })]), false)
    assert.equal(hasRunningSession([]), false)
  })
})

describe('任务卡折叠与 running 视觉契约', () => {
  it('卡片样式包含折叠、描述收起与 running orbit 入口', () => {
    assert.match(TASK_CARD_CSS, /data-card-collapsed='true'/u)
    assert.match(TASK_CARD_CSS, /dsh-task-body-toggle/u)
    assert.match(TASK_CARD_CSS, /data-running='true'/u)
    assert.doesNotMatch(TASK_CARD_CSS, /prefers-reduced-motion/u)
    assert.match(TASK_CARD_CSS, /animation: dsh-task-card-orbit 3s linear infinite/u)
    assert.match(TASK_CARD_CSS, /dsh-task-compact-sessions/u)
    for (const color of ['default', 'yellow', 'green', 'blue', 'pink']) {
      assert.match(TASK_CARD_CSS, new RegExp(`data-color='${color}'`, 'u'))
    }
  })

  it('归档样式包含同色 running ring，且 running 环不被 reduced-motion 停转', () => {
    assert.match(TASK_ARCHIVE_CSS, /dsh-task-archive-row\[data-running='true'\]/u)
    assert.match(TASK_ARCHIVE_CSS, /dsh-task-running-accent/u)
    assert.match(TASK_ARCHIVE_CSS, /animation: dsh-task-card-orbit 3s linear infinite/u)
    assert.doesNotMatch(TASK_ARCHIVE_CSS, /dsh-task-archive-row\[data-running='true'\]::after\s*\{[^}]*animation:\s*none/u)
  })

  it('折叠 / running 相关中英文案齐全', () => {
    for (const key of ['task.body.collapse', 'task.body.expand', 'task.card.collapse', 'task.card.expand', 'task.session.count'] as const) {
      assert.ok(key in zh)
      assert.ok(key in en)
    }
  })
})
