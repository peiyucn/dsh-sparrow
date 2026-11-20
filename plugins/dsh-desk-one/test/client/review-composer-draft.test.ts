import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { composerDismissable } from '../../lib/client/notebook/review/hooks/useReviewInteraction.js'

describe('批注输入框草稿保护', () => {
  it('有内容时外部点击 / Esc 不得关闭输入框', () => {
    assert.equal(composerDismissable('写了一半的批注'), false)
    assert.equal(composerDismissable('  半句  '), false)
  })

  it('空内容仍可按旧行为关闭', () => {
    assert.equal(composerDismissable(''), true)
    assert.equal(composerDismissable('   '), true)
  })

  it('输入框的全局关闭监听必须先检查草稿是否为空', async () => {
    const source = await readFile(
      new URL('../../src/client/notebook/review/hooks/useReviewInteraction.ts', import.meta.url),
      'utf8',
    )
    assert.match(source, /if \(!composerDismissable\(comment\)\) return/u)
    assert.match(source, /event\.key === 'Escape' && composerDismissable\(comment\)/u)
  })
})
