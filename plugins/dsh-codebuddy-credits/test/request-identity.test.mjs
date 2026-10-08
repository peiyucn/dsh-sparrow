/**
 * 钉的契约：UA 必须同时含 `CLI/` 记号与 `CodeBuddy/<版本>` 段，`x-ide-name` 如实为本插件名。
 * 缺 `CLI/` 记号时服务端返回 200 却省略 `data.models`（插件侧只表现为模型目录为空）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENT_NAME,
  CLI_UA_MARKER,
  CODEBUDDY_CLI_VERSION,
  REQUEST_USER_AGENT,
} from '../lib/constants.js'
import { requestHeaders } from '../lib/catalog.js'

test('UA 含 CLI/ 记号（否则 /v3/config 静默不返回模型列表）', () => {
  assert.ok(
    REQUEST_USER_AGENT.includes('CLI/'),
    `UA 必须含 "CLI/" 记号，否则服务端返回 200 但省略 data.models（当前：${REQUEST_USER_AGENT}）`,
  )
})

test('UA 含 CodeBuddy/<版本> 段（否则 /v3/config 返回 400 check ua）', () => {
  // 用 `includes`（本意是子串包含）而非 `new RegExp`：手写转义会漏正则元字符（CodeQL
  // js/incomplete-sanitization）；真要模式匹配用现成转义工具，不要手写 `.replace`。
  assert.ok(
    REQUEST_USER_AGENT.includes(`CodeBuddy/${CODEBUDDY_CLI_VERSION}`),
    `UA 必须含可解析的 CodeBuddy/<版本> 段（当前：${REQUEST_USER_AGENT}）`,
  )
})

test('UA 以本插件名开头（如实自报身份，不伪装成官方 CLI）', () => {
  assert.ok(
    REQUEST_USER_AGENT.startsWith(CLIENT_NAME.replace(/ /g, '')),
    `UA 应以本插件名开头（当前：${REQUEST_USER_AGENT}）`,
  )
})

test('UA 不含空格，保持单 token 形态', () => {
  const first = REQUEST_USER_AGENT.split(' ')[0]
  assert.equal(first, CLIENT_NAME.replace(/ /g, ''))
})

test('CLI_UA_MARKER 就是被服务端接受的记号形态', () => {
  assert.equal(CLI_UA_MARKER, 'CLI/unknown')
  assert.ok(REQUEST_USER_AGENT.includes(CLI_UA_MARKER))
})

test('x-ide-name 如实上报本插件名（后台 client 字段的来源）', () => {
  const headers = requestHeaders('dummy-key')
  assert.equal(headers['x-ide-name'], CLIENT_NAME)
  assert.equal(CLIENT_NAME, 'deepseek harness')
})

test('三个端点共用同一出口：企业上下文头按账号有无裁剪', () => {
  const bare = requestHeaders('dummy-key')
  assert.ok(bare['x-ide-name'] !== undefined, '无账号时也应带客户端标识')
  assert.equal(bare['x-enterprise-id'], undefined)
  assert.equal(bare['x-user-id'], undefined)

  const full = requestHeaders('dummy-key', { userId: 'u1', enterpriseId: 'e1' })
  assert.equal(full['x-enterprise-id'], 'e1')
  assert.equal(full['x-tenant-id'], 'e1')
  assert.equal(full['x-user-id'], 'u1')
  assert.equal(full['user-agent'], REQUEST_USER_AGENT)
})
