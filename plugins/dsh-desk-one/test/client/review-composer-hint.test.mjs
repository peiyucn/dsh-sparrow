// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReviewComposerHint } from '../../lib/client/notebook/ReviewPromptDock.js'
import { rememberReviewSession } from '../../lib/client/notebook/review/sessions.js'
import { showReviewTab } from '../../lib/client/notebook/review/tab-visibility.js'

/** Render the placeholder hint; `useSession` mimics the slot's session-snapshot selector. */
const renderHint = (/** @type {Record<string, unknown>} */ props) =>
  renderToStaticMarkup(createElement(
    /** @type {any} */ (ReviewComposerHint),
    { t: () => 'REVIEW-GUIDANCE', ...props },
  ))

describe('审阅输入框引导', () => {
  it('审阅视图在屏时显示引导', () => {
    rememberReviewSession('review-started-session')
    const release = showReviewTab('tab-under-test')
    try {
      const html = renderHint({ sessionId: 'review-started-session', useSession: () => false })
      assert.match(html, /dsh-desk-review-composer-hint/u)
      assert.match(html, /REVIEW-GUIDANCE/u)
    } finally {
      release()
    }
  })

  it('审阅视图不在屏（右侧栏换成官方文件浏览）时不显示引导', () => {
    rememberReviewSession('review-hidden-session')
    assert.equal(renderHint({ sessionId: 'review-hidden-session' }), '')
  })

  it('普通会话不显示引导', () => {
    assert.equal(renderHint({ sessionId: 'plain-session' }), '')
  })

  it('没有 sessionId 时不显示', () => {
    assert.equal(renderHint({}), '')
  })

  it('输入文字（官方 placeholder 消失）时由样式隐藏引导', async () => {
    const css = await readFile(new URL('../../src/client/notebook/review-styles.ts', import.meta.url), 'utf8')
    assert.match(css, /body:has\(\.dsh-desk-review-composer-hint\) \[data-composer-placeholder\]/u,
      '引导存在时隐藏官方 placeholder')
    assert.match(css, /body:not\(:has\(\[data-composer-placeholder\]\)\) \.dsh-desk-review-composer-hint/u,
      '官方 placeholder 消失（用户已输入）时隐藏引导')
  })
})
