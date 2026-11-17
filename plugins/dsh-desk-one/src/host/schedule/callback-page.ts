

import { randomUUID } from 'node:crypto'

const HTML_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})


export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, char => HTML_ESCAPES[char] ?? char)
}


export interface OutlookCallbackPage {
  readonly body: string
  readonly contentSecurityPolicy: string
}


function titleOf(ok: boolean): string {
  return ok ? 'Outlook 已连接' : 'Outlook 连接失败'
}


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
