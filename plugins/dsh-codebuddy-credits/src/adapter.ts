/**
 * CodeBuddy 自建适配器：不走 pi-ai 协议层，直接按 CodeBuddy 方言发请求、解析 SSE。
 * 方言要点全部显式处理（每一条都是实测过的行为）：
 * - 仅流式：stream: true 恒定（非流式服务端 11101）
 * - 官方请求标识：x-api-key + CLI user-agent + x-product + 企业上下文头
 * - SSE delta：content 与 reasoning_content 分离（思考进 reasoning 块）
 * - usage 帧含 credit（积分消耗，DSH 的 TokenUsage 无此字段，走回调 + replayState 持久化）
 * - 企业策略错误（如 10081 ip not in whitelist）原样透传服务端文案
 */

import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  FinishReason,
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  Message,
  PreparedAdapterCall,
  StreamChunk,
  TokenUsage,
  ToolCallBlock,
  ToolResultMessage,
} from '@deepseek-ai/dsh-llm'
import { BASE_URL, effortName, requestHeaders } from './catalog.js'
import { DISPLAY_NAME } from './constants.js'
import type { CodeBuddyModelFacts } from './catalog.js'

/** 单次调用的积分回调：插件侧据此做会话/今日统计（credit 为服务端计费值）。 */
export interface CodeBuddyUsage {
  tokens: TokenUsage
  credit?: number
  model: string
}

export interface CodeBuddyAdapterOptions {
  /** 当前生效的模型事实（设置节驱动，每次调用现读）。 */
  models(): readonly CodeBuddyModelFacts[]
  /** 每请求解析 API Key。 */
  resolveApiKey(): Promise<string>
  /** 企业上下文（uid/enterpriseId 来自 /v2/accounts，与官方 CLI 一致）。 */
  account(): { userId?: string; enterpriseId?: string } | undefined
  /** 流式读取空闲超时（毫秒）。 */
  streamIdleTimeoutMs: number
  /** 每次调用的用量/积分回调（会话统计用）。 */
  onUsage?: (usage: CodeBuddyUsage) => void
  /**
   * 宿主读取本适配器模型目录时的回调（模型选择器建目录触发）。
   * 插件侧在此做节流后台刷新；目录读取本身同步返回当前事实。
   */
  onCatalogRead?: () => void
}

interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | unknown[] | null
  tool_calls?: WireToolCall[]
  tool_call_id?: string
}

/** 文本块合并（tool-result 的嵌套内容一并展平为文本）。 */
function textOf(blocks: readonly ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool-result') text += textOf(block.content)
  }
  return text
}

/** DSH Message → CodeBuddy 线格式（OpenAI 方言）。reasoning 块不进历史。 */
export function toWireMessages(options: GenerateOptions): WireMessage[] {
  const messages: WireMessage[] = []
  if (options.system !== undefined && options.system.length > 0) {
    messages.push({ role: 'system', content: options.system })
  }
  for (const message of options.messages as Message[]) {
    if (message.role === 'system') {
      messages.push({ role: 'system', content: textOf(message.content) })
      continue
    }
    if (message.role === 'user' && message.source.kind === 'tool') {
      const toolResult = message as ToolResultMessage
      messages.push({
        role: 'tool',
        tool_call_id: String(toolResult.source.callId),
        content: textOf(toolResult.content),
      })
      continue
    }
    if (message.role === 'user') {
      // 文本优先；图片块转 OpenAI data URL（附件字节经附件服务读取）。
      const parts: unknown[] = []
      let text = ''
      for (const block of message.content) {
        if (block.type === 'text') text += block.text
        else if (block.type === 'image') parts.push({ type: 'image', attachment: block.attachment })
      }
      if (parts.length === 0) {
        messages.push({ role: 'user', content: text })
      } else {
        messages.push({ role: 'user', content: [{ type: 'text', text }, ...parts] })
      }
      continue
    }
    // assistant：text 合并 + tool-call 块转 wire tool_calls
    const assistant: WireMessage = { role: 'assistant', content: null, tool_calls: [] }
    let text = ''
    for (const block of message.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool-call') {
        const call = block as ToolCallBlock
        assistant.tool_calls?.push({
          id: String(call.id),
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })
      }
    }
    if (text.length > 0) assistant.content = text
    if ((assistant.tool_calls?.length ?? 0) === 0) assistant.tool_calls = undefined
    else if (assistant.content === null) assistant.content = ''
    messages.push(assistant)
  }
  return messages
}

/** 思考档位 → 线格式。wire 拼写按档位名直发（待公司网络实测确认）。 */
function wireReasoningEffort(effort: GenerateOptions['reasoningEffort']): string | undefined {
  return effort === undefined ? undefined : String(effort)
}

/** 服务端 finish_reason → DSH 契约。 */
export function mapFinish(reason: string): FinishReason | undefined {
  switch (reason) {
    case 'stop': return { kind: 'stop' }
    case 'length': return { kind: 'max-tokens' }
    case 'tool_calls':
    case 'function_call': return { kind: 'tool-calls' }
    default: return undefined
  }
}

/** CodeBuddy usage 帧 → DSH TokenUsage（credit 单独提取）。 */
export function mapUsage(raw: Record<string, unknown>): { tokens: TokenUsage; credit?: number } {
  const prompt = typeof raw.prompt_tokens === 'number' ? raw.prompt_tokens : 0
  const completion = typeof raw.completion_tokens === 'number' ? raw.completion_tokens : 0
  const total = typeof raw.total_tokens === 'number' ? raw.total_tokens : undefined
  const cacheHit = typeof raw.prompt_cache_hit_tokens === 'number' ? raw.prompt_cache_hit_tokens : 0
  const details = raw.completion_tokens_details as Record<string, unknown> | undefined
  const reasoning = details !== undefined && typeof details.reasoning_tokens === 'number'
    ? details.reasoning_tokens
    : 0
  const credit = typeof raw.credit === 'number' ? raw.credit : undefined
  return {
    tokens: {
      inputTokens: Math.max(0, prompt - cacheHit),
      outputTokens: completion,
      ...(total === undefined ? {} : { totalTokens: total }),
      ...(cacheHit > 0 ? { cacheReadTokens: cacheHit } : {}),
      ...(reasoning > 0 ? { reasoningTokens: reasoning } : {}),
    },
    ...(credit === undefined ? {} : { credit }),
  }
}

/**
 * SSE 数据行 → 可解析帧（纯函数，供单测）。非 data: 行、[DONE] 与无效 JSON
 * 一律返回 undefined（流解析时跳过，不中断）。
 */
export function parseSseLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return undefined
  const data = trimmed.slice(5).trim()
  if (data.length === 0 || data === '[DONE]') return undefined
  try {
    const parsed = JSON.parse(data) as unknown
    return parsed !== null && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** 非 2xx 响应 → LlmError（服务端 code/msg 原样透传，如 10081 ip whitelist）。 */
async function providerError(response: Response): Promise<never> {
  let detail = ''
  try {
    const body = await response.json() as { code?: unknown; msg?: unknown }
    if (body.msg !== undefined) detail = String(body.msg)
    else if (body.code !== undefined) detail = 'code ' + String(body.code)
  } catch {
    // 非 JSON 错误体：用状态码兜底
  }
  const message = detail.length > 0
    ? 'CodeBuddy 请求被拒（HTTP ' + String(response.status) + '）：' + detail
    : 'CodeBuddy 请求失败（HTTP ' + String(response.status) + '）'
  throw new LlmError(message, 'PROVIDER', { status: response.status })
}

/**
 * CodeBuddy 推理适配器。协议层完全自建：请求构造、SSE 解析、块组装、
 * usage/credit 提取都在这里显式实现。
 */
export class CodeBuddyAdapter extends LlmAdapter {
  constructor(private readonly config: CodeBuddyAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: DISPLAY_NAME }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.config.onCatalogRead?.()
    return Promise.resolve(this.config.models().map(model => ({
      provider,
      id: model.id,
      name: model.name,
      // 显式声明输入模态：text-only 是「明确的负能力」，视觉模型带上 image。
      inputModalities: model.input,
      ...(model.description === undefined ? {} : { description: model.description }),
    })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const facts = this.config.models().find(entry => entry.id === model)
    const info: LlmResolvedModelInfo = {
      provider,
      id: model,
      name: facts?.name ?? model,
      context: { contextWindow: facts?.contextWindow ?? 262_144 },
      ...(facts === undefined ? {} : { inputModalities: facts.input }),
      ...(facts?.description === undefined ? {} : { description: facts.description }),
    }
    if (facts?.reasoning === true && facts.thinkingLevelMap !== undefined) {
      const levels = Object.keys(facts.thinkingLevelMap)
      info.reasoning = {
        efforts: levels.map(level => ({ id: level as never, name: effortName(level) })),
        ...(facts.defaultEffort !== undefined && levels.includes(facts.defaultEffort)
          ? { defaultEffort: facts.defaultEffort as never }
          : {}),
      }
    }
    return Promise.resolve(info)
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return {
      model: await this.resolveModel(provider, model),
      stream: options => this.stream(options),
    }
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithKey(options)
  }

  private async * streamWithKey(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const apiKey = await this.config.resolveApiKey()
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    const timer = setTimeout(() => consumer.abort(new Error('stream idle timeout')), this.config.streamIdleTimeoutMs)
    let exhausted = false
    try {
      const iterator = this.request(options, apiKey, upstream, () => {
        timer.refresh()
      })[Symbol.asyncIterator]()
      while (true) {
        const { done, value } = await iterator.next()
        if (done) {
          exhausted = true
          return
        }
        yield value
      }
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        throw new LlmError('CodeBuddy 请求已被取消', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError('CodeBuddy 推理流失败', 'TRANSPORT', { cause: error })
    } finally {
      clearTimeout(timer)
      consumer.abort('CodeBuddy stream consumer stopped')
    }
  }

  private async * request(
    options: GenerateOptions,
    apiKey: string,
    signal: AbortSignal,
    onActivity: () => void,
  ): AsyncIterable<StreamChunk> {
    const account = this.config.account()
    const body: Record<string, unknown> = {
      model: options.model,
      messages: toWireMessages(options),
      stream: true,
    }
    if (options.tools !== undefined && options.tools.length > 0) body.tools = options.tools
    if (options.temperature !== undefined) body.temperature = options.temperature
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
    if (options.stop !== undefined && options.stop.length > 0) body.stop = options.stop
    const effort = wireReasoningEffort(options.reasoningEffort)
    if (effort !== undefined) body.reasoning_effort = effort

    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        ...requestHeaders(apiKey, account),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) await providerError(response)
    if (response.body === null) throw new LlmError('CodeBuddy 返回了空响应流', 'TRANSPORT')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // 块索引：reasoning=0、text=1、tool 调用从 2 起
    const TOOL_BASE = 2
    const toolIndexById = new Map<string, number>()
    let nextToolIndex = TOOL_BASE
    const opened = new Set<number>()
    const finished = new Set<number>()
    let usageSent = false
    let finishSent = false

    const openBlock = (index: number, blockType: 'reasoning' | 'text' | 'tool-call'): void => {
      if (opened.has(index)) return
      opened.add(index)
      chunks.push({ type: 'block-start', index, blockType })
    }
    const chunks: StreamChunk[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        onActivity()
        buffer += decoder.decode(value, { stream: true })
        let lineEnd
        while ((lineEnd = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, lineEnd)
          buffer = buffer.slice(lineEnd + 1)
          const frame = parseSseLine(line)
          if (frame === undefined) continue
          const choices = Array.isArray(frame.choices) ? frame.choices as Array<Record<string, unknown>> : []
          const choice = choices[0]
          const delta = choice !== undefined && typeof choice.delta === 'object' && choice.delta !== null
            ? choice.delta as Record<string, unknown>
            : undefined
          if (delta !== undefined) {
            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
              openBlock(0, 'reasoning')
              chunks.push({ type: 'reasoning-delta', index: 0, text: delta.reasoning_content })
            }
            if (typeof delta.content === 'string' && delta.content.length > 0) {
              openBlock(1, 'text')
              chunks.push({ type: 'text-delta', index: 1, text: delta.content })
            }
            const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls as Array<Record<string, unknown>> : []
            for (const call of calls) {
              const callId = typeof call.id === 'string' ? call.id : 'call-' + String(call.index ?? '')
              let index = toolIndexById.get(callId)
              if (index === undefined) {
                index = nextToolIndex
                nextToolIndex += 1
                toolIndexById.set(callId, index)
              }
              openBlock(index, 'tool-call')
              const fn = call.function as Record<string, unknown> | undefined
              chunks.push({
                type: 'tool-call-delta',
                index,
                id: callId as never,
                ...(typeof fn?.name === 'string' && fn.name.length > 0 ? { name: fn.name } : {}),
                argumentsDelta: typeof fn?.arguments === 'string' ? fn.arguments : '',
              })
            }
          }
          if (frame.usage !== null && typeof frame.usage === 'object' && frame.usage !== undefined) {
            const { tokens, credit } = mapUsage(frame.usage as Record<string, unknown>)
            if (!usageSent) {
              chunks.push({ type: 'usage', usage: tokens })
              usageSent = true
            }
            this.config.onUsage?.({ tokens, ...(credit === undefined ? {} : { credit }), model: options.model })
          }
          const reason = choice !== undefined && typeof choice.finish_reason === 'string' ? choice.finish_reason : ''
          if (reason.length > 0 && !finishSent) {
            // 终帧：收尾所有已开块
            for (const index of [...opened].filter(i => !finished.has(i))) {
              finished.add(index)
              chunks.push({ type: 'block-end', index, block: blockFor(index, toolIndexById) })
            }
            const finish = mapFinish(reason)
            if (finish === undefined) {
              throw new LlmError('CodeBuddy 返回了未知的结束原因：' + reason, 'PROVIDER')
            }
            chunks.push({
              type: 'finish',
              reason: finish,
              replayState: { response: { model: options.model, usage: frame.usage ?? null } },
            })
            finishSent = true
          }
          for (const chunk of chunks.splice(0)) yield chunk
        }
      }
      if (!finishSent) {
        throw new LlmError('CodeBuddy 流在结束前中断', 'TRANSPORT')
      }
    } finally {
      reader.cancel().catch(() => {})
    }
  }
}

/** 已开块的最终 ContentBlock 组装（block-end 携带）。 */
function blockFor(index: number, toolIndexById: Map<string, number>): ContentBlock {
  if (index === 0) return { type: 'reasoning', text: '' }
  if (index === 1) return { type: 'text', text: '' }
  for (const [id, idx] of toolIndexById) {
    if (idx === index) return { type: 'tool-call', id: id as never, name: '', arguments: '' }
  }
  return { type: 'text', text: '' }
}
