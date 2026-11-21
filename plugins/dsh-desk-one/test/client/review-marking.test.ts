import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('审阅标记时机', () => {
  it('打开审阅 tab 不再无条件标记，只有 markOnOpen 才标记', async () => {
    const source = await readFile(
      new URL('../../src/client/notebook/review/hooks/useReviewSession.ts', import.meta.url),
      'utf8',
    )
    assert.match(source, /if \(params\?\.markOnOpen !== true\) return/u)
    assert.doesNotMatch(source, /\}, \[fileId, notebook, sessionId, workspaceId\]\)/u)
  })

  it('首次保存批注会持久化审阅标记', async () => {
    const source = await readFile(
      new URL('../../src/client/notebook/review/hooks/useReviewInteraction.ts', import.meta.url),
      'utf8',
    )
    assert.match(source, /persistReviewSession\(notebook, \{ sessionId, workspaceId: target\.workspaceId, fileId: target\.fileId \}\)/u)
  })
})
