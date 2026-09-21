/**
 * 外部链接白名单测试。
 *
 * 用户徽章现在是可点击链接，指向 CodeBuddy 个人主页。风险点是「把 URL 交给
 * `<a href>`」——若 URL 能被改写成 `javascript:` / `data:`，点击就成了注入面。
 * 本插件用固定常量 + 协议白名单挡住，这里把策略钉住。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROFILE_URL, safeExternalHref } from '../lib/client/external-links.js'
import { CODEBUDDY_ORIGIN, PROFILE_URL as HOST_PROFILE_URL } from '../lib/constants.js'

test('PROFILE_URL 是固定的 https 地址', () => {
  assert.equal(PROFILE_URL, 'https://copilot.tencent.com/profile/')
  assert.equal(safeExternalHref(PROFILE_URL), PROFILE_URL, '常量必须通过自己的白名单')
})

test('PROFILE_URL 与 README 的登录地址同源（单一域名来源）', () => {
  // README 的登录入口与徽章点击的入口必须一致，否则用户看到的两处会分叉。
  assert.equal(PROFILE_URL, `${CODEBUDDY_ORIGIN}/profile/`)
  assert.equal(HOST_PROFILE_URL, PROFILE_URL)
})

test('放行 http 与 https', () => {
  assert.equal(safeExternalHref('https://example.com/a'), 'https://example.com/a')
  assert.equal(safeExternalHref('http://example.com/'), 'http://example.com/')
})

test('拒绝伪协议（注入面）', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///C:/Windows/System32/',
    'ftp://example.com/',
  ]) {
    assert.equal(safeExternalHref(bad), undefined, `必须拒绝 ${bad}`)
  }
})

test('拒绝无法解析的输入', () => {
  for (const bad of ['', '   ', 'not a url', 'copilot.tencent.com/profile/', '/profile/', '//evil.com']) {
    assert.equal(safeExternalHref(bad), undefined, `必须拒绝 ${JSON.stringify(bad)}`)
  }
})

test('大小写不同的协议同样按白名单判定', () => {
  assert.equal(safeExternalHref('HTTPS://example.com/'), 'HTTPS://example.com/')
})
