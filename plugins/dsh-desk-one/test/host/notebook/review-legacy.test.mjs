// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../../lib/domain.js'
import { NODES_TABLE } from '../../../lib/constants.js'

/**
 * Legacy annotation record written by desk-one <= 0.2.2-rc.1 (pre-review-session design).
 * Kept as a fixture so the upgrade contract stays covered: the storage domain rejects the
 * whole open on one invalid record, so this kind must keep parsing (and then be purged).
 */
const LEGACY_ANNOTATION = {
  id: 'annotation_fixture',
  kind: 'annotation',
  schema: 1,
  path: 'Diary/example.md',
  anchor: { type: 'quote', quote: '50GB vs 200GB', prefix: '定档位：', suffix: ' ', position: 12 },
  comments: [
    { author: 'human', body: '先 50 就行', at: '2026-11-11T00:00:00.000Z' },
    { author: 'ai', body: '已改为 50GB', at: '2026-11-11T00:01:00.000Z' },
  ],
  status: 'answered',
  baseline: { at: '2026-11-11T00:00:00.000Z', text: '# 标题\n正文' },
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:01:00.000Z',
  revision: 2,
}

/** Review record written by the review-session design (what the schema must accept). */
const REVIEW = {
  id: 'review_fixture',
  kind: 'review',
  schema: 1,
  sessionId: 'session-fixture',
  target: {
    cwd: '/workspace',
    path: 'Diary/example.md',
    title: '示例',
    kind: 'markdown',
    hash: 'a'.repeat(64),
  },
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
  revision: 1,
}

/** @returns {import('zod').ZodTypeAny} */
function nodesSchema() {
  return /** @type {any} */ (DESK_DOMAIN).tables[NODES_TABLE].valueSchema
}

describe('legacy annotation tolerance', () => {
  it('旧批注记录仍能通过 domain schema（升级不崩的前提），且启动后会被清理', () => {
    const parsed = nodesSchema().safeParse(LEGACY_ANNOTATION)
    assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues))
    assert.equal(parsed.success ? /** @type {{ kind?: string }} */ (parsed.data).kind : undefined, 'annotation')
  })

  it('审阅会话记录（review）通过 domain schema', () => {
    const parsed = nodesSchema().safeParse(REVIEW)
    assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues))
  })
})
