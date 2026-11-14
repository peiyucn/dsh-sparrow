// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerNotebookTools } from '../../../lib/host/notebook/tools.js'

/** Minimal tool-collecting host context. */
function fakeCtx() {
  /** @type {any[]} */
  const tools = []
  return {
    tools,
    ctx: {
      tools: {
        register(/** @type {any} */ tool) {
          tools.push(tool)
        },
      },
      logger: { info() {} },
    },
  }
}

/**
 * Fake notebook face with a fixed root and one page.
 * @param {{ withRoot?: boolean, onSearch?: (input: any) => void }} [options]
 */
function fakeNotebook(options = {}) {
  const { withRoot = true, onSearch } = options
  /** @type {any} */
  let lastInput
  return {
    face: {
      root: () => (withRoot ? 'C:/notes' : undefined),
      async search(/** @type {any} */ input) {
        lastInput = input
        onSearch?.(input)
        return {
          entries: [{
            path: 'Diary/a.md',
            title: 'A',
            date: '2026-11-01',
            type: 'note',
            tags: ['x'],
            hasFrontmatter: true,
            emptyBody: false,
            bytes: 10,
            mtime: '2026-11-01T00:00:00.000Z',
          }],
          truncated: false,
        }
      },
    },
    lastInput: () => lastInput,
  }
}

describe('desk_page_list', () => {
  it('未链接笔记库时返回空结果与提示', async () => {
    const { ctx, tools } = fakeCtx()
    const { face } = fakeNotebook({ withRoot: false })
    registerNotebookTools(/** @type {any} */ (ctx), face)
    assert.equal(tools.length, 1)
    const output = JSON.parse(await tools[0].execute({}, { signal: AbortSignal.timeout(1000) }))
    assert.equal(output.ok, true)
    assert.equal(output.total, 0)
    assert.match(output.summary, /笔记库/u)
  })

  it('返回 root + 相对路径与元信息，默认 limit 50', async () => {
    const { ctx, tools } = fakeCtx()
    const notebook = fakeNotebook()
    registerNotebookTools(/** @type {any} */ (ctx), notebook.face)
    const output = JSON.parse(await tools[0].execute({ query: 'a' }, { signal: AbortSignal.timeout(1000) }))
    assert.equal(output.root, 'C:/notes')
    assert.equal(output.total, 1)
    assert.equal(output.entries[0].path, 'Diary/a.md')
    assert.equal(output.entries[0].hasFrontmatter, true)
    assert.deepEqual(notebook.lastInput(), { query: 'a', limit: 50 })
  })

  it('筛选参数透传，limit 上限 200', async () => {
    const { ctx, tools } = fakeCtx()
    const notebook = fakeNotebook()
    registerNotebookTools(/** @type {any} */ (ctx), notebook.face)
    await tools[0].execute({
      tag: 'x',
      type: 'note',
      missing_frontmatter: true,
      empty_body: true,
      limit: 999,
    }, { signal: AbortSignal.timeout(1000) })
    assert.deepEqual(notebook.lastInput(), {
      tag: 'x',
      type: 'note',
      missingFrontmatter: true,
      emptyBody: true,
      limit: 200,
    })
  })
})
