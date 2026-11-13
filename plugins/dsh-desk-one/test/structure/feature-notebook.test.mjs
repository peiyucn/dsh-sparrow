// @ts-check
/**
 * Notebook / review feature contract: library REST surface, client data facade, agent tool, and the
 * notebook record kinds stored in the shared `nodes` table (library config, file identity, drafts,
 * baselines, review records and review-session markers).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../lib/host/domain.js'
import { PREFIX, ROUTES } from '../../lib/constants.js'
import { NOTEBOOK_ROUTES } from '../../lib/host/notebook/routes.js'
import { registerNotebookTools } from '../../lib/host/notebook/tools.js'
import { notebookApi } from '../../lib/client/notebook/api.js'
import { collectToolNames } from './helpers.mjs'

/** Node schema of the unified `nodes` table (validated per record). */
const nodeSchema = /** @type {any} */ (DESK_DOMAIN.tables.nodes.valueSchema)
const STAMP = '2026-01-01T00:00:00.000Z'

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function notebookConfigRecord(overrides) {
  return { id: 'notebook_config', kind: 'notebook-config', schema: 1, rootPath: '/notes', createdAt: STAMP, updatedAt: STAMP, revision: 1, ...overrides }
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

describe('笔记 / 审阅契约', () => {
  it('笔记 REST 路由应该全部挂在统一前缀下，覆盖搜索 / 列表 / 页面 / 草稿 / 历史 / 审阅会话 / 基线', () => {
    const paths = NOTEBOOK_ROUTES.map(route => route.path)
    assert.deepEqual(paths.filter(path => !path.startsWith(`${PREFIX}/`)), [], '所有路由必须在 /api/desk-one 前缀下')
    for (const required of [
      ROUTES.notebookState,
      ROUTES.notebookRoot,
      ROUTES.notebookSkill,
      ROUTES.notebookSearch,
      ROUTES.notebookList,
      ROUTES.notebookPage,
      ROUTES.notebookFile,
      ROUTES.notebookCreate,
      ROUTES.notebookDraft,
      ROUTES.notebookBaseline,
      ROUTES.notebookHistory,
      ROUTES.notebookReviewSessions,
    ]) {
      assert.ok(paths.includes(required), `笔记路由缺 ${required}`)
    }
    const keys = NOTEBOOK_ROUTES.map(route => `${route.method} ${route.path}`)
    assert.equal(new Set(keys).size, keys.length, '路由表不得有重复的 method + path')
  })

  it('客户端笔记库数据面应该暴露库状态 / 列表 / 页面 / 草稿 / 历史 / 审阅编排动作', () => {
    for (const action of [
      'state',
      'setRoot',
      'clearRoot',
      'setSkill',
      'search',
      'list',
      'page',
      'ensureFile',
      'createNote',
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
      assert.equal(typeof notebookApi[action], 'function', `客户端笔记库 API 缺 ${action}`)
    }
  })

  it('笔记 agent 工具应该齐全', () => {
    assert.deepEqual(collectToolNames(registerNotebookTools, {}), ['desk_page_list'])
  })

  it('笔记库记录 kind 应该可解析：库配置 / 文件身份 / 草稿 / 基线 / 审阅记录 / 审阅会话标记', () => {
    for (const record of [
      notebookConfigRecord(),
      noteFileRecord(),
      reviewRecord(),
      noteDraftRecord(),
      noteBaselineRecord(),
      reviewSessionRecord(),
    ]) {
      assert.equal(nodeSchema.safeParse(record).success, true, `笔记库记录 ${String(record.kind)} 必须可解析`)
    }
    assert.equal(nodeSchema.safeParse(notebookConfigRecord({ rootPath: '' })).success, false, '库根路径不能为空')
    assert.equal(nodeSchema.safeParse(reviewRecord({ annotations: undefined })).success, false, '审阅记录必须带批注列表')

    const draft = /** @type {any} */ (nodeSchema.parse({ ...noteDraftRecord(), drafts: undefined }))
    assert.deepEqual(draft.drafts, [], '草稿箱没有批注时应默认空列表')
    const config = /** @type {any} */ (nodeSchema.parse(notebookConfigRecord()))
    assert.equal(config.skillName, undefined, '库配置的技能是可选字段（旧记录没有 skillName）')
  })
})
