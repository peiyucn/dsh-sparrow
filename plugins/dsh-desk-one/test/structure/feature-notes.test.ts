

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_DOMAIN } from '../../lib/host/domain.js'
import { MAX_ACTIVE_NOTES, MAX_TRASH_NOTES, NOTE_COLORS, PREFIX, ROUTES, TRASH_PAGE_SIZE } from '../../lib/constants.js'
import { DeskModelError } from '../../lib/model.js'
import { DeskStore } from '../../lib/host/store.js'
import { NOTE_ROUTES } from '../../lib/host/notes/routes.js'
import { registerDeskTools } from '../../lib/host/notes/tools.js'
import * as notesApi from '../../lib/client/notes/api.js'
import { collectToolNames, collectTools } from './helpers.ts'


const nodeSchema = DESK_DOMAIN.tables.nodes.valueSchema

function noteRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'note_1',
    kind: 'note',
    schema: 1,
    title: 'note',
    body: '',
    tags: [],
    color: 'default',
    pinned: false,
    trashed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}


function fakeStorageDomain() {
  const tables = new Map()
  const tableOf = ( tableName) => {
    if (!tables.has(tableName)) tables.set(tableName, new Map())
    const records = tables.get(tableName)
    return {
      get: ( key) => records.get(key),
      entries: () => [...records.entries()][Symbol.iterator](),
      keys: () => [...records.keys()][Symbol.iterator](),
      get size() { return records.size },
      put: async ( key,  value) => { records.set(key, value) },
      delete: async ( key) => records.delete(key),
      update: async ( key,  transform) => {
        if (!records.has(key)) throw new Error(`no record '${key}'`)
        const next = transform(records.get(key))
        records.set(key, next)
        return next
      },
    }
  }
  return { name: 'desk_one', table: tableOf, close: async () => {} }
}


async function openStore() {
  return await DeskStore.open( ({
    storageDomain: { open: async () => fakeStorageDomain() },
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
  }))
}

describe('便签 / 统一对象存储契约', () => {
  it('存储域应该声明 nodes / edges 两张表，布局是 per-record', () => {
    assert.equal(DESK_DOMAIN.name, 'desk_one')
    assert.match(DESK_DOMAIN.name, /^[a-z][a-z0-9_]*$/u, 'storage domain 名必须符合官方 UNIT_NAME_RE')
    assert.equal(DESK_DOMAIN.layout, 'per-record')
    assert.deepEqual(Object.keys(DESK_DOMAIN.tables).sort(), ['edges', 'nodes'], '已发布的存储域不得再增删表')
    assert.ok(Number.isInteger(DESK_DOMAIN.version) && DESK_DOMAIN.version >= 1, '存储域要有整数版本号')
  })

  it('nodes 表按 kind 判别：便签可解析，未知 kind / 非法颜色被拒绝，旧记录字段有默认值', () => {
    assert.equal(nodeSchema.safeParse(noteRecord()).success, true)
    assert.equal(nodeSchema.safeParse(noteRecord({ kind: 'unknown-kind' })).success, false, '未知 kind 必须被拒绝')
    assert.equal(nodeSchema.safeParse(noteRecord({ color: 'purple' })).success, false, '颜色必须是共享色板里的值')
    assert.equal(nodeSchema.safeParse(noteRecord({ title: undefined })).success, false, '便签必须有标题字段')

    const legacy = noteRecord()
    delete legacy.trashed
    const parsed = nodeSchema.parse(legacy) as { trashed: boolean }
    assert.equal(parsed.trashed, false, '旧记录没有 trashed 字段时应默认 false（无需迁移）')
  })

  it('便签 REST 路由应该全部挂在统一前缀下，覆盖列表 / 新建 / 更新 / 删除', () => {
    const paths = NOTE_ROUTES.map(route => route.path)
    assert.deepEqual(paths.filter(path => !path.startsWith(`${PREFIX}/`)), [], '所有路由必须在 /api/desk-one 前缀下（plugin 自做信任校验）')
    for (const required of [ROUTES.notes, ROUTES.noteUpdate, ROUTES.noteDelete]) {
      assert.ok(paths.includes(required), `便签路由缺 ${required}`)
    }
    const keys = NOTE_ROUTES.map(route => `${route.method} ${route.path}`)
    assert.equal(new Set(keys).size, keys.length, '路由表不得有重复的 method + path')
    for (const route of NOTE_ROUTES) {
      assert.equal(typeof route.handle, 'function', `${route.method} ${route.path} 缺 handler`)
    }
  })

  it('便签 agent 工具应该齐全（与 REST 共用同一 store）', () => {
    const names = collectToolNames(registerDeskTools, {})
    assert.deepEqual(names, ['desk_note_add', 'desk_note_delete', 'desk_note_list', 'desk_note_update'])
  })

  it('客户端便签数据面应该暴露与 host 路由对应的四个动作', () => {
    for (const action of ['listNotes', 'createNote', 'updateNote', 'deleteNote']) {
      assert.equal(typeof notesApi[action], 'function', `客户端便签 API 缺 ${action}`)
    }
  })

  it('产品容量上限是单一真相（便签墙 / 垃圾桶）', () => {
    assert.equal(MAX_ACTIVE_NOTES, 100, '便签墙上限 100')
    assert.equal(MAX_TRASH_NOTES, 200, '垃圾桶上限 200')
    assert.ok(Number.isInteger(TRASH_PAGE_SIZE) && TRASH_PAGE_SIZE > 0, '垃圾桶分页大小必须是正整数')
    assert.deepEqual([...NOTE_COLORS], ['default', 'yellow', 'green', 'blue', 'pink'], '颜色是客户端色板与存储校验的共享真值')
  })

  it('便签容量上限在 host store 侧强制执行（客户端与 agent 工具都绕不过）', async () => {
    const store = await openStore()
    for (let index = 0; index < MAX_ACTIVE_NOTES; index += 1) {
      await store.createNote({ title: `note ${index}` })
    }
    await assert.rejects(
      store.createNote({ title: 'overflow' }),
      ( error) => error instanceof DeskModelError && error.code === 'NOTE_LIMIT',
      '超出便签墙上限必须被 host 拒绝',
    )


    const active = await store.listNotes()
    for (const note of active) await store.updateNote(note.id, note.revision, { trashed: true })
    for (let index = 0; index < MAX_TRASH_NOTES - active.length; index += 1) {
      const note = await store.createNote({ title: `trash ${index}` })
      await store.updateNote(note.id, note.revision, { trashed: true })
    }
    const last = await store.createNote({ title: 'trash overflow' })
    await assert.rejects(
      store.updateNote(last.id, last.revision, { trashed: true }),
      ( error) => error instanceof DeskModelError && error.code === 'TRASH_FULL',
      '超出垃圾桶上限必须被 host 拒绝',
    )
  })

  it('desk_note_list 默认限 50 条、默认不含垃圾桶、limit 生效', async () => {

    const manyNotes = Array.from({ length: 60 }, (_, index) => ({ id: `note_${index}`, title: `n${index}`, trashed: false }))
    const listToolOf = (store) =>
      collectTools(registerDeskTools, store).find(tool => tool.name === 'desk_note_list')!

    const defaultPage = JSON.parse(await listToolOf({ listNotes: () => manyNotes }).execute({}))
    assert.equal(defaultPage.notes.length, 50, '列表工具默认限 50 条')
    const limited = JSON.parse(await listToolOf({ listNotes: () => manyNotes }).execute({ limit: 3 }))
    assert.equal(limited.notes.length, 3, 'limit 参数生效')

    const mixedStore = { listNotes: () => [{ id: 'a', trashed: false }, { id: 'b', trashed: true }] }
    assert.equal(JSON.parse(await listToolOf(mixedStore).execute({})).notes.length, 1, '默认不含垃圾桶')
    assert.equal(JSON.parse(await listToolOf(mixedStore).execute({ include_trashed: true })).notes.length, 2, 'include_trashed 可选包含')
  })
})
