// @ts-check
/**
 * Annotation feature contract: workspace-scoped REST surface, the client data facade, and the note
 * record kinds stored in the shared `nodes` table (file identity, drafts, baselines, review records
 * and review-session markers). The notebook library index and its config record are gone.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../lib/host/domain.js'
import { PREFIX, ROUTES } from '../../lib/constants.js'
import { NOTEBOOK_ROUTES } from '../../lib/host/notebook/routes.js'
import { notebookApi } from '../../lib/client/notebook/api.js'

/** Node schema of the unified `nodes` table (validated per record). */
const nodeSchema = /** @type {any} */ (DESK_DOMAIN.tables.nodes.valueSchema)
const STAMP = '2026-01-01T00:00:00.000Z'

/**
 * Legacy notebook-root record: no longer read or written, but it must keep validating so a profile
 * written before the annotation refactor still opens.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function notebookConfigRecord(overrides) {
  return {
    id: 'notebook_config', kind: 'notebook-config', schema: 1, rootPath: '/notes', skillName: null,
    createdAt: STAMP, updatedAt: STAMP, revision: 1, ...overrides,
  }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function noteFileRecord(overrides) {
  return { id: 'file_1', kind: 'note-file', schema: 1, rootPath: '/notes', path: '/notes/a.md', hash: 'hash_1', createdAt: STAMP, updatedAt: STAMP, revision: 1, ...overrides }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function reviewRecord(overrides) {
  return {
    id: 'review_1',
    kind: 'review-record',
    schema: 1,
    sessionId: 'session_1',
    fileId: 'file_1',
    fileTitle: 'a.md',
    pathSnapshot: '/notes/a.md',
    annotations: [],
    bytes: 0,
    createdAt: STAMP,
    ...overrides,
  }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function noteDraftRecord(overrides) {
  return { id: 'draft_1', kind: 'note-draft', schema: 1, path: '/notes/a.md', createdAt: STAMP, updatedAt: STAMP, revision: 1, ...overrides }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function noteBaselineRecord(overrides) {
  return {
    id: 'baseline_1',
    kind: 'note-baseline',
    schema: 1,
    sessionId: 'session_1',
    fileId: 'file_1',
    rootPath: '/notes',
    body: 'body',
    at: STAMP,
    createdAt: STAMP,
    updatedAt: STAMP,
    revision: 1,
    ...overrides,
  }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function reviewSessionRecord(overrides) {
  return { id: 'review_session_1', kind: 'review-session', schema: 1, sessionId: 'session_1', createdAt: STAMP, updatedAt: STAMP, revision: 1, ...overrides }
}

describe('批注契约', () => {
  it('批注 REST 路由应该挂在统一前缀下：打开 / 按身份打开 / 聚合 / 草稿 / 历史 / 审阅会话 / 基线', () => {
    const paths = NOTEBOOK_ROUTES.map(route => route.path)
    assert.deepEqual(paths.filter(path => !path.startsWith(`${PREFIX}/`)), [], '所有路由必须在 /api/desk-one 前缀下')
    for (const required of [
      ROUTES.notebookOpen,
      ROUTES.notebookOpenById,
      ROUTES.notebookSummary,
      ROUTES.notebookDraft,
      ROUTES.notebookBaseline,
      ROUTES.notebookHistory,
      ROUTES.notebookReviewSessions,
    ]) {
      assert.ok(paths.includes(required), `批注路由缺 ${required}`)
    }
    const keys = NOTEBOOK_ROUTES.map(route => `${route.method} ${route.path}`)
    assert.equal(new Set(keys).size, keys.length, '路由表不得有重复的 method + path')
  })

  it('客户端批注数据面应该暴露工作区打开 / 聚合 / 草稿 / 历史 / 审阅编排动作', () => {
    for (const action of [
      'open',
      'openById',
      'summary',
      'draft',
      'saveDraft',
      'listReviewSessions',
      'markReviewSession',
      'history',
      'recordReview',
      'deleteHistory',
      'loadBaseline',
      'saveBaseline',
    ]) {
      assert.equal(typeof notebookApi[/** @type {keyof typeof notebookApi} */ (action)], 'function', `客户端批注 API 缺 ${action}`)
    }
  })

  it('批注记录 kind 应该可解析：文件身份 / 草稿 / 基线 / 审阅记录 / 审阅会话标记；旧库配置记录仍兼容', () => {
    for (const record of [
      noteFileRecord(),
      reviewRecord(),
      noteDraftRecord(),
      noteBaselineRecord(),
      reviewSessionRecord(),
    ]) {
      assert.equal(nodeSchema.safeParse(record).success, true, `批注记录 ${String(record.kind)} 必须可解析`)
    }
    assert.equal(nodeSchema.safeParse(reviewRecord({ annotations: undefined })).success, false, '审阅记录必须带批注列表')
    // The stored config record predates the refactor; rejecting it here is what took the whole
    // domain down on the owner's profile (unknown kind at open time => every route 404).
    assert.equal(
      nodeSchema.safeParse(notebookConfigRecord()).success,
      true,
      '旧笔记库配置记录必须仍可解析',
    )
    assert.equal(
      nodeSchema.safeParse(notebookConfigRecord({ rootPath: '' })).success,
      false,
      '旧记录同样要过基础字段校验',
    )
    assert.equal(DESK_DOMAIN.invalidRecords, 'backup-and-skip', '未知记录必须备份后跳过而不是让整域打不开')

    const draft = /** @type {any} */ (nodeSchema.parse({ ...noteDraftRecord(), drafts: undefined }))
    assert.deepEqual(draft.drafts, [], '草稿箱没有批注时应默认空列表')
  })
})
