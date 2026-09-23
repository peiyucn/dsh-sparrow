import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DeepSeekFilesClient, PUBLIC_BASE_URL } from '@deepseek-ai/dsh-llm-deepseek'
import { resolveBaseURL } from '../lib/files.js'

/**
 * 端点契约：本插件把「llm-deepseek 设置节 → $DEEPSEEK_BASE_URL → 官方 PUBLIC_BASE_URL」
 * 解析出的**根**交给官方 DeepSeekFilesClient，由官方在构造时自己补 `/v1`
 * （rc.1 packages/llm/llm-deepseek/src/messages-api.ts:11-14；client 见 files-api.ts:145）。
 *
 * 官方 client 无默认超时也不自带测试 transport，但构造函数收 `fetch`——这里用 stub fetch
 * **捕获真实请求 URL**，全程不发任何网络请求（owner 的账号凭据不进测试）。
 */
function capture(baseURL) {
  const urls = []
  const json = body => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  const client = new DeepSeekFilesClient({
    baseURL,
    apiKey: 'test-key-not-used',
    fetch: async (url, init) => {
      const method = init?.method ?? 'GET'
      urls.push(`${method} ${String(url)}`)
      if (method === 'DELETE') {
        return json({ id: decodeURIComponent(String(url).split('/').pop()), type: 'file_deleted' })
      }
      return json({ data: [], has_more: false })
    },
  })
  return { client, urls }
}

describe('dsh-file-manage 端点（我方构造 + 官方归一化）', () => {
  it('官方公共端点 应该 是 /anthropic 根（rc.1 起，旧值 https://api.deepseek.com）', () => {
    assert.equal(PUBLIC_BASE_URL, 'https://api.deepseek.com/anthropic')
  })

  it('未配置任何 baseURL 应该 回退官方公共端点，最终请求 /anthropic/v1/files', async () => {
    const baseURL = resolveBaseURL(undefined, undefined, PUBLIC_BASE_URL)
    assert.equal(baseURL, PUBLIC_BASE_URL)
    const { client, urls } = capture(baseURL)
    await client.list({ limit: 20 })
    await client.delete('file-api-x')
    assert.deepEqual(urls, [
      'GET https://api.deepseek.com/anthropic/v1/files?limit=20',
      'DELETE https://api.deepseek.com/anthropic/v1/files/file-api-x',
    ])
  })

  it('设置节 baseURL 应该 优先于 $DEEPSEEK_BASE_URL 与官方公共端点', () => {
    assert.equal(
      resolveBaseURL('https://gw.example/anthropic', 'https://env.example', PUBLIC_BASE_URL),
      'https://gw.example/anthropic',
    )
    assert.equal(resolveBaseURL(undefined, 'https://env.example', PUBLIC_BASE_URL), 'https://env.example')
  })

  it('尾斜杠 / 已带 /v1 的根 应该 由官方归一化（不出现双斜杠、不重复 /v1）', async () => {
    const trailing = capture('https://gw.example/anthropic/')
    await trailing.client.list({ limit: 1 })
    assert.deepEqual(trailing.urls, ['GET https://gw.example/anthropic/v1/files?limit=1'])

    const versioned = capture('https://gw.example/anthropic/v1')
    await versioned.client.list({ limit: 1 })
    assert.deepEqual(versioned.urls, ['GET https://gw.example/anthropic/v1/files?limit=1'])
  })

  it('我方构造的 baseURL 应该 不含 /v1（自己拼会得到 /v1/v1/files）', () => {
    // resolveBaseURL 只做回退选择、不做路径拼接：官方 client 才是唯一的归一化点。
    const baseURL = resolveBaseURL(undefined, undefined, PUBLIC_BASE_URL)
    assert.equal(baseURL.endsWith('/v1'), false)
  })

  it('旧硬编码根 https://api.deepseek.com 会少一层 /anthropic（本插件已不再使用）', async () => {
    const { client, urls } = capture('https://api.deepseek.com')
    await client.list({ limit: 1 })
    assert.deepEqual(urls, ['GET https://api.deepseek.com/v1/files?limit=1'])
  })
})
