import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { cancelNeedsConfirmation } from '../../lib/client/notebook/review/hooks/useReviewInteraction.js'

describe('批注输入框关闭与取消确认', () => {
  it('只有有内容时才需要取消确认', () => {
    assert.equal(cancelNeedsConfirmation('写了一半的批注'), true)
    assert.equal(cancelNeedsConfirmation('  半句  '), true)
    assert.equal(cancelNeedsConfirmation(''), false)
    assert.equal(cancelNeedsConfirmation('   '), false)
  })

  it('输入框没有任何全局关闭监听：外部点击 / Esc 不再关闭', async () => {
    const source = await readFile(
      new URL('../../src/client/notebook/review/hooks/useReviewInteraction.ts', import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(source, /composerDismissable/u)
    assert.doesNotMatch(source, /if \(!composerDismissable\(comment\)\) return/u)
    assert.doesNotMatch(source, /event\.key === 'Escape' && composerDismissable\(comment\)/u)
  })

  it('取消按钮有内容时二次确认，无内容一次关闭', async () => {
    const source = await readFile(
      new URL('../../src/client/notebook/review/ReviewTab.tsx', import.meta.url),
      'utf8',
    )
    assert.match(source, /cancelNeedsConfirmation\(review\.comment\)/u)
    assert.match(source, /setConfirmCancel\(true\)/u)
    assert.match(source, /t\('review\.cancelConfirm'\)/u)
  })

  it('已有输入框时打开另一处批注不会替换草稿，先提示取消', async () => {
    const source = await readFile(
      new URL('../../src/client/notebook/review/hooks/useReviewInteraction.ts', import.meta.url),
      'utf8',
    )
    assert.match(source, /if \(composer !== null\) \{\n {6}setNotice\(t\('review\.finishCurrentFirst'\)\)/u)
  })
})
