/**
 * The only HTML page this plugin renders: the Microsoft OAuth redirect lands as a top-level
 * navigation outside the app shell (router.ts bypasses the trust fence for this path), so the page
 * must stand on its own.
 *
 * Every string it shows can come from that navigation's query string (`error_description`), i.e.
 * from whoever opened the URL. Text is therefore escaped and the inline script is pinned by a
 * per-response CSP nonce — this page must never become a script-injection surface on the DSH web
 * origin, which is same-origin with every other panel and route.
 */

import { randomUUID } from 'node:crypto'

const HTML_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})

/** Escape one value for an HTML text node or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, char => HTML_ESCAPES[char] ?? char)
}

/** One rendered callback page: the body plus the CSP that only allows its own script. */
export interface OutlookCallbackPage {
  readonly body: string
  readonly contentSecurityPolicy: string
}

/** Fixed page heading per outcome (user-facing Chinese, matching the panel copy). */
function titleOf(ok: boolean): string {
  return ok ? 'Outlook 已连接' : 'Outlook 连接失败'
}

/**
 * Render the callback result page.
 *
 * On success the popup closes itself (falling back to the app root when the flow replaced the tab
 * instead of opening one); the panel still polls the flow and closes the popup by itself, so this
 * is only the fast path. Nothing is posted to the opener — the panel does not listen for messages.
 * @param view - outcome plus the user-facing message; both are untrusted for HTML purposes.
 */
export function renderOutlookCallbackPage(view: { readonly ok: boolean; readonly message: string }): OutlookCallbackPage {
  const nonce = randomUUID()
  const title = titleOf(view.ok)
  const script = view.ok
    ? `<script nonce="${nonce}">setTimeout(function(){if(window.opener){window.close()}else{window.location.href='/'}},600)</script>`
    : ''
  const body = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><body style="font-family:system-ui;padding:32px"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(view.message)}</p>${script}</body></html>`
  const contentSecurityPolicy = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  return { body, contentSecurityPolicy }
}
