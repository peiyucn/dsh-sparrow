/**
 * 域名收敛守卫。
 *
 * 背景（2026-09-18）：插件里曾同时出现 `copilot.tencent.com` 与 `www.codebuddy.cn`
 * 两个域名。实测二者是**同一套服务的两个入口**（同一组 IP、13 个用例响应深度相等、
 * 共享同一份配额账本），但 `www.codebuddy.cn` 在官方文档中从未出现，属未文档化的
 * 别名。owner 决定收敛到一个规范域名。
 *
 * 本测试把「全插件只有一个域名来源」钉死：任何源码/测试里再硬写另一个域名，
 * 或端点常量偏离 `CODEBUDDY_ORIGIN`，都会在这里失败。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ACCOUNTS_URL,
  BASE_URL,
  CODEBUDDY_ORIGIN,
  CONFIG_URL,
  PROFILE_URL,
  QUOTA_URL,
} from '../lib/constants.js'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(DIR, '..', 'src')

/** 收录源码下所有 .ts/.tsx 文本（含 client 半）。 */
function sourceFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(SRC)
  return out
}

test('规范域名是官方文档使用的国际通用入口 copilot.tencent.com', () => {
  // 两者服务等价（见 constants.ts 的实测依据），选这个是因为官方 CLI 与开放平台文档
  // 用的就是它，且为国际通用入口；www.codebuddy.cn 是国内区域名——
  // 本插件面向所有用户，不钉区域名。
  assert.equal(CODEBUDDY_ORIGIN, 'https://copilot.tencent.com')
})

test('所有端点常量都从 CODEBUDDY_ORIGIN 派生', () => {
  assert.equal(BASE_URL, `${CODEBUDDY_ORIGIN}/v2`)
  assert.equal(CONFIG_URL, `${CODEBUDDY_ORIGIN}/v3/config`)
  assert.equal(ACCOUNTS_URL, `${CODEBUDDY_ORIGIN}/v2/accounts`)
  assert.equal(QUOTA_URL, `${CODEBUDDY_ORIGIN}/v2/billing/meter/get-enterprise-user-usage`)
  assert.equal(PROFILE_URL, `${CODEBUDDY_ORIGIN}/profile/`)
})

test('源码里不再出现区域性别名域名', () => {
  const offenders = []
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    // 注释里可以（且应该）解释两者的关系，故只查代码行。
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
      if (/www\.codebuddy\.cn/.test(line)) offenders.push(`${path.relative(SRC, file)}: ${trimmed.slice(0, 80)}`)
    }
  }
  assert.deepEqual(offenders, [], `以下位置仍在代码里使用区域性别名域名（应改用 CODEBUDDY_ORIGIN）：\n${offenders.join('\n')}`)
})

test('README 的登录入口与 PROFILE_URL 同源（用户看到的入口不分裂）', () => {
  for (const name of ['README.md', 'README.zh-CN.md']) {
    const text = fs.readFileSync(path.join(DIR, '..', name), 'utf8')
    assert.ok(
      text.includes(`${CODEBUDDY_ORIGIN}/profile/`),
      `${name} 的登录入口应为 ${CODEBUDDY_ORIGIN}/profile/，与 PROFILE_URL 保持一致`,
    )
  }
})

test('国际版 codebuddy.ai 不得被当作同源别名', () => {
  // 它是独立后端（不同 IP、模型数不同、账号接口 401），混用会取不到企业上下文。
  const offenders = []
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
      if (/codebuddy\.ai/.test(line)) offenders.push(path.relative(SRC, file))
    }
  }
  assert.deepEqual(offenders, [], 'codebuddy.ai 是独立后端，不得出现在请求路径常量中')
})
