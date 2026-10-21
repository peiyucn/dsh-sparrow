/**
 * 钉的契约：上游内容指纹（HTTP 400 / code 11128）在 system 与 assistant 正文里被删掉，
 * 其余内容逐字保留；user / tool 结果 / tool_calls 参数一律不动。
 *
 * 依据（2026-10-21 公司网络实测，见 TEMP/11128-probe/real-prompt-verification.md）：
 *  - 真实 DSH system 原文 → 400/11128；删掉首句 → 200；
 *  - 首句全小写同样 400（大小写不敏感）；
 *  - assistant 历史正文含该句 → 整轮 400（跟会话走）；
 *  - 句子出现在行中段 / user 内容里 → 放行。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { stripChannelFingerprints } from '../lib/fingerprints.js'
import { toWireMessages } from '../lib/adapter.js'

const FINGERPRINT = 'You are an AI agent powered by DeepSeek Harness.'
const REAL_SYSTEM = [
  FINGERPRINT,
  '',
  'You are a coding agent powered by the deepseek-v4.1-flash model.',
  '',
  'Follow AGENTS.md.',
].join('\n')

describe('stripChannelFingerprints', () => {
  it('删掉行首指纹行，其余行逐字保留', () => {
    assert.equal(
      stripChannelFingerprints(REAL_SYSTEM),
      ['', 'You are a coding agent powered by the deepseek-v4.1-flash model.', '', 'Follow AGENTS.md.'].join('\n'),
    )
  })

  it('忽略大小写（服务端同样忽略），无结尾句号也命中', () => {
    assert.equal(stripChannelFingerprints('you are an ai agent powered by deepseek harness\nnext'), 'next')
    assert.equal(stripChannelFingerprints('YOU ARE AN AI AGENT POWERED BY DEEPSEEK HARNESS.\nnext'), 'next')
  })

  it('行首有空格 / 行尾有空白也命中', () => {
    assert.equal(stripChannelFingerprints(`  ${FINGERPRINT}  \nnext`), 'next')
  })

  it('指纹句在行中段（非行首）不命中——上游是行首锚定', () => {
    const text = `Note: ${FINGERPRINT}\nnext`
    assert.equal(stripChannelFingerprints(text), text)
  })

  it('指纹句后还有正文时只丢指纹句，正文保留', () => {
    assert.equal(stripChannelFingerprints(`${FINGERPRINT} Keep this line.\nnext`), 'Keep this line.\nnext')
  })

  it('未命中原样返回（内容不变）', () => {
    const text = 'You are a helpful assistant.\n'
    assert.equal(stripChannelFingerprints(text), text)
  })

  it('幂等：二次处理不再变化', () => {
    const once = stripChannelFingerprints(REAL_SYSTEM)
    assert.equal(stripChannelFingerprints(once), once)
  })

  it('保留其余行的 CRLF 行尾', () => {
    assert.equal(
      stripChannelFingerprints(`${FINGERPRINT}\r\nline a\r\nline b`),
      'line a\r\nline b',
    )
  })

  it('空串原样返回', () => {
    assert.equal(stripChannelFingerprints(''), '')
  })
})

describe('toWireMessages 的指纹处理范围', () => {
  const base = { provider: 'codebuddy-credits', model: 'hy4-preview' }

  it('options.system 的指纹行被删，其余 system 正文保留', async () => {
    const wire = await toWireMessages({
      ...base,
      system: REAL_SYSTEM,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(wire[0].role, 'system')
    assert.ok(!wire[0].content.includes(FINGERPRINT))
    assert.ok(wire[0].content.includes('You are a coding agent powered by the deepseek-v4.1-flash model.'))
  })

  it('system 角色消息同样处理', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{ id: 's1', role: 'system', content: [{ type: 'text', text: REAL_SYSTEM }] }],
    })
    assert.ok(!String(wire[0].content).includes(FINGERPRINT))
  })

  it('user 内容里的同一句原样保留（不篡改用户原话）', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: `看这句：${FINGERPRINT}` }] }],
    })
    assert.equal(wire[0].content, `看这句：${FINGERPRINT}`)
  })

  it('tool 结果里的同一句原样保留（不破坏证据）', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{
        id: 't1',
        role: 'tool',
        toolCallId: 'call_1',
        content: [{ type: 'text', text: FINGERPRINT }],
      }],
    })
    assert.equal(wire[0].content, FINGERPRINT)
    assert.equal(wire[0].tool_call_id, 'call_1')
  })

  it('assistant 正文的指纹被删，tool_calls 参数逐字保留', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{
        id: 'a1',
        role: 'assistant',
        source: { kind: 'model', model: 'hy4-preview' },
        content: [
          { type: 'text', text: `${FINGERPRINT}\n正文继续` },
          { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"a.txt"}' },
        ],
      }],
    })
    assert.equal(wire[0].content, '正文继续')
    assert.equal(wire[0].tool_calls[0].function.arguments, '{"path":"a.txt"}')
  })

  it('system 只有指纹句时不再发空 system 消息', async () => {
    const wire = await toWireMessages({
      ...base,
      system: FINGERPRINT,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(wire[0].role, 'user')
  })
})
