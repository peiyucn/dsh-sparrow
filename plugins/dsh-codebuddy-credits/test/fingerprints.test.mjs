// @ts-check
/**
 * 钉的契约：上游内容指纹（HTTP 400 / code 11128）在 system 与 assistant 正文里被**无损中和**
 * （零宽空格），可见文案与语义不变；围栏 / 行内代码逐字保留；user / tool 结果 / tool_calls 参数不动。
 * 另外：wire 的第一条永远是 system（缺省用最小占位），否则网关直接 11128。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { neutralizeChannelFingerprints, visibleText } from '../lib/fingerprints.js'
import { FALLBACK_SYSTEM_PROMPT } from '../lib/constants.js'
import { toWireMessages } from '../lib/adapter.js'

const FINGERPRINT = 'You are an AI agent powered by DeepSeek Harness.'
const REAL_SYSTEM = [
  FINGERPRINT,
  '',
  'You are a coding agent powered by the deepseek-v4.1-flash model.',
  '',
  'Follow AGENTS.md.',
].join('\n')

const WEB_GUI_FINGERPRINT = 'You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names.'
const WEB_GUI_LINE = [
  WEB_GUI_FINGERPRINT,
  'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI.',
  'Do not start a replacement server unless the user asks.',
].join(' ')

const MAIN_BRANCH = 'Main branch (you will usually use this for PRs)'
const CLAUDE_CODE = "You are Claude Code, Anthropic's official CLI for Claude"

/**
 * DSH 0.2.1-rc.3 Web 的 system prompt 原段（实测 2026-10-28：与下一句相邻时上游 400 / 11128；
 * 把 `@` 换掉后同样的文字放行）。这里保留完整原文，钉住「不删字、只插零宽空格」的契约。
 */
const AT_PATH_PARAGRAPH = [
  'Tokens prefixed with @ are paths the user explicitly referenced.',
  'Relative paths resolve from the workspace root; absolute paths identify files or directories on the host.',
  'A trailing slash marks a directory: list it when its contents matter.',
  'Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading.',
  '@"..." quotes a path containing spaces.',
].join(' ')

describe('neutralizeChannelFingerprints（无损中和）', () => {
  it('身份句可见内容不变，但不再含原始串', () => {
    const out = neutralizeChannelFingerprints(REAL_SYSTEM)
    assert.equal(visibleText(out), REAL_SYSTEM)
    assert.ok(!out.includes('DeepSeek Harness'))
    assert.ok(!out.includes('You are an AI agent'))
    assert.ok(visibleText(out).includes('You are a coding agent powered by the deepseek-v4.1-flash model.'))
    assert.ok(out.includes('Follow AGENTS.md.'))
  })

  it('Web GUI 行只中和首句，其余指令逐字保留', () => {
    const out = neutralizeChannelFingerprints(WEB_GUI_LINE)
    assert.equal(visibleText(out), WEB_GUI_LINE)
    assert.ok(!out.includes(WEB_GUI_FINGERPRINT))
    assert.ok(out.includes('Do not start a replacement server'))
  })

  it('Main branch 与 Claude Code 同样被中和', () => {
    const text = [MAIN_BRANCH, CLAUDE_CODE].join('\n')
    const out = neutralizeChannelFingerprints(text)
    assert.equal(visibleText(out), text)
    assert.ok(!out.includes(MAIN_BRANCH))
    assert.ok(!out.includes('Claude Code'))
    assert.ok(!out.includes("Anthropic's official CLI"))
  })

  it('@ 路径引用段落：每个 @ 后插零宽空格，可见文字不变', () => {
    const out = neutralizeChannelFingerprints(AT_PATH_PARAGRAPH)
    assert.equal(visibleText(out), AT_PATH_PARAGRAPH)
    assert.ok(out.includes('@\u200B'), '@ 之后应插入零宽空格')
    assert.ok(!/(@)(?!\u200B)/u.test(out), '原文的每个 @ 都被处理')
    // 逐字符位置校验：去掉零宽空格必须回到原文（不删字、不加可见字符）。
    assert.equal(out.split('').filter(c => c !== '\u200B').join(''), AT_PATH_PARAGRAPH)
  })

  it('代码里的 @ 原样保留（不能污染用户代码）', () => {
    const text = [
      '正文说明：Tokens prefixed with @ are paths.',
      '`--flag @file` 在行内代码里原样。',
      '```sh',
      'curl -H "x" @payload.json',
      '```',
    ].join('\n')
    const out = neutralizeChannelFingerprints(text)
    assert.ok(out.includes('`--flag @file`'), '行内代码不动')
    assert.ok(out.includes('curl -H "x" @payload.json'), '围栏代码不动')
    assert.ok(out.includes('Tokens prefixed with @\u200B'), '正文被中和')
    assert.equal(visibleText(out), text)
  })

  it('@ 段落二次处理不再变化（幂等）', () => {
    const once = neutralizeChannelFingerprints(AT_PATH_PARAGRAPH)
    assert.equal(neutralizeChannelFingerprints(once), once)
  })

  it('围栏代码块与行内代码原样保留（不能污染用户代码）', () => {
    const text = [
      '`DeepSeek Harness` 在行内代码里原样。',
      '```ts',
      'const name = "DeepSeek Harness"',
      '```',
      '正文里的 DeepSeek Harness 要被中和。',
    ].join('\n')
    const out = neutralizeChannelFingerprints(text)
    assert.ok(out.includes('`DeepSeek Harness`'), '行内代码不动')
    assert.ok(out.includes('const name = "DeepSeek Harness"'), '围栏代码不动')
    assert.ok(!out.includes('正文里的 DeepSeek Harness'), '正文被中和')
  })

  it('幂等：二次处理不再变化', () => {
    const once = neutralizeChannelFingerprints(REAL_SYSTEM)
    assert.equal(neutralizeChannelFingerprints(once), once)
  })

  it('未命中原样返回', () => {
    const text = 'You are a helpful assistant.\n'
    assert.equal(neutralizeChannelFingerprints(text), text)
  })

  it('空串原样返回', () => {
    assert.equal(neutralizeChannelFingerprints(''), '')
  })

  it('保留 CRLF 行尾', () => {
    const out = neutralizeChannelFingerprints(`${FINGERPRINT}\r\nline a\r\nline b`)
    assert.ok(out.includes('\r\nline a\r\nline b'))
    assert.equal(visibleText(out), `${FINGERPRINT}\r\nline a\r\nline b`)
  })
})

describe('toWireMessages 的指纹处理范围与 system 头', () => {
  const base = { provider: 'codebuddy-credits', model: 'hy4-preview' }

  it('没有 system 时首条补最小占位，不会以 user 开头', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(wire[0]?.role, 'system')
    assert.equal(wire[0]?.content, FALLBACK_SYSTEM_PROMPT)
    assert.equal(wire[1]?.role, 'user')
  })

  it('options.system 为空但 messages 首条是 system：救回且不重复', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{ id: 's1', role: 'system', content: [{ type: 'text', text: REAL_SYSTEM }] }],
    })
    assert.equal(wire[0]?.role, 'system')
    assert.ok(String(wire[0]?.content).includes('You are a coding agent powered by the deepseek-v4.1-flash model.'))
    assert.equal(wire.length, 1, '只有一条 system')
  })

  it('options.system 的指纹被中和、正文保留', async () => {
    const wire = await toWireMessages({
      ...base,
      system: REAL_SYSTEM,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(wire[0]?.role, 'system')
    const system = String(wire[0]?.content)
    assert.ok(!system.includes('DeepSeek Harness'))
    assert.ok(system.includes('You are a coding agent powered by the deepseek-v4.1-flash model.'))
  })

  it('user 内容里的同一句原样保留（不篡改用户原话）', async () => {
    const wire = await toWireMessages({
      ...base,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: `看这句：${FINGERPRINT}` }] }],
    })
    assert.equal(wire[1]?.content, `看这句：${FINGERPRINT}`)
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
    const tool = wire[1]
    assert.equal(tool?.content, FINGERPRINT)
    assert.equal(/** @type {any} */ (tool).tool_call_id, 'call_1')
  })

  it('assistant 正文被中和，tool_calls 参数逐字保留', async () => {
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
    const assistant = wire[1]
    assert.ok(!String(assistant?.content).includes('DeepSeek Harness'))
    assert.ok(String(assistant?.content).includes('正文继续'))
    assert.equal(/** @type {any} */ (assistant).tool_calls[0].function.arguments, '{"path":"a.txt"}')
  })

  it('系统提示里的 @ 段落被中和，其余正文逐字保留', async () => {
    const system = `${REAL_SYSTEM}\n\n${AT_PATH_PARAGRAPH}\n\nKeep this line verbatim.`
    const wire = await toWireMessages({
      ...base,
      system,
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    const sent = String(wire[0]?.content)
    assert.equal(visibleText(sent), system)
    assert.ok(!/(@)(?!\u200B)/u.test(sent), '发给上游的 system 里不再有裸 @')
    assert.ok(sent.includes('Keep this line verbatim.'))
  })
})
