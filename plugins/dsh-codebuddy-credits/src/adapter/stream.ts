

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { parseSseLine } from './sse.js'


function wireReasoningEffort(effort: GenerateOptions['reasoningEffort']): string | undefined {
  return effort === undefined ? undefined : String(effort)
}


export function effectiveReasoningEffort(
  maxMode: boolean,
  modelReasoning: boolean,
  effort: GenerateOptions['reasoningEffort'],
): string | undefined {
  if (maxMode && modelReasoning) return 'max'
  return wireReasoningEffort(effort)
}


export function mapFinish(reason: string): FinishReason | undefined {
  switch (reason) {
    case 'stop': return { kind: 'stop' }
    case 'length': return { kind: 'max-tokens' }
    case 'tool_calls':
    case 'function_call': return { kind: 'tool-calls' }
    default: return undefined
  }
}


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


export function errorFrameMessage(frame: Record<string, unknown>): string | undefined {
  const error = frame.error
  if (typeof error === 'string' && error.length > 0) return error
  if (error !== null && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    return typeof message === 'string' && message.length > 0 ? message : '未知错误'
  }

  if (!Array.isArray(frame.choices)
    && typeof frame.code === 'number' && frame.code !== 0
    && typeof frame.msg === 'string' && frame.msg.length > 0) {
    return frame.msg
  }
  return undefined
}

function blockFor(
  index: number,
  textByIndex: ReadonlyMap<number, string>,
  toolIdByIndex: ReadonlyMap<number, string>,
  toolNameByIndex: ReadonlyMap<number, string>,
  toolArgsByIndex: ReadonlyMap<number, string>,
): ContentBlock {
  if (index === 0) return { type: 'reasoning', text: textByIndex.get(0) ?? '' }
  if (index === 1) return { type: 'text', text: textByIndex.get(1) ?? '' }
  return {
    type: 'tool-call',
    id: (toolIdByIndex.get(index) ?? '') as never,
    name: toolNameByIndex.get(index) ?? '',
    arguments: toolArgsByIndex.get(index) ?? '',
  }
}


export async function* streamFrames(
  body: ReadableStream<Uint8Array>,
  model: string,
  onActivity: () => void,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const TOOL_BASE = 2

  const toolIndexByWire = new Map<number, number>()

  const toolIndexById = new Map<string, number>()
  let nextToolIndex = TOOL_BASE
  const opened = new Set<number>()
  const finished = new Set<number>()

  const textByIndex = new Map<number, string>()
  const toolIdByIndex = new Map<number, string>()
  const toolNameByIndex = new Map<number, string>()
  const toolArgsByIndex = new Map<number, string>()
  let usageSent = false
  let finishSent = false

  const chunks: StreamChunk[] = []
  const openBlock = (index: number, blockType: 'reasoning' | 'text' | 'tool-call'): void => {
    if (opened.has(index)) return
    opened.add(index)
    chunks.push({ type: 'block-start', index, blockType })
  }

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
        const failure = errorFrameMessage(frame)
        if (failure !== undefined) throw LlmError.fromFailure({ message: 'CodeBuddy 上游错误：' + failure, code: 'PROVIDER' })
        const choices = Array.isArray(frame.choices) ? frame.choices as Array<Record<string, unknown>> : []
        const choice = choices[0]
        const delta = choice !== undefined && typeof choice.delta === 'object' && choice.delta !== null
          ? choice.delta as Record<string, unknown>
          : undefined
        if (delta !== undefined) {
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
            openBlock(0, 'reasoning')
            textByIndex.set(0, (textByIndex.get(0) ?? '') + delta.reasoning_content)
            chunks.push({ type: 'reasoning-delta', index: 0, text: delta.reasoning_content })
          }
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            openBlock(1, 'text')
            textByIndex.set(1, (textByIndex.get(1) ?? '') + delta.content)
            chunks.push({ type: 'text-delta', index: 1, text: delta.content })
          }
          const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls as Array<Record<string, unknown>> : []
          for (const call of calls) {


            const wireIndex = typeof call.index === 'number' ? call.index : undefined
            let index: number | undefined
            if (wireIndex !== undefined) {
              index = toolIndexByWire.get(wireIndex)
              if (index === undefined) {
                index = nextToolIndex
                nextToolIndex += 1
                toolIndexByWire.set(wireIndex, index)
              }
            } else {

              let callId = typeof call.id === 'string' ? call.id : ''
              if (callId === '') callId = 'call-unknown'
              index = toolIndexById.get(callId)
              if (index === undefined) {
                index = nextToolIndex
                nextToolIndex += 1
                toolIndexById.set(callId, index)
              }
            }
            const callId = typeof call.id === 'string' ? call.id : ''
            if (callId !== '') toolIdByIndex.set(index, callId)
            else if (!toolIdByIndex.has(index)) toolIdByIndex.set(index, 'call-' + String(index))
            openBlock(index, 'tool-call')
            const fn = call.function as Record<string, unknown> | undefined
            const name = typeof fn?.name === 'string' ? fn.name : ''
            const args = typeof fn?.arguments === 'string' ? fn.arguments : ''
            const firstNamed = name.length > 0 && !toolNameByIndex.has(index)
            if (firstNamed) toolNameByIndex.set(index, name)
            toolArgsByIndex.set(index, (toolArgsByIndex.get(index) ?? '') + args)
            chunks.push({
              type: 'tool-call-delta',
              index,
              id: (toolIdByIndex.get(index) ?? '') as never,
              ...(firstNamed ? { name } : {}),
              argumentsDelta: args,
            })
          }
        }
        const reason = choice !== undefined && typeof choice.finish_reason === 'string' ? choice.finish_reason : ''
        if (reason.length > 0 && !finishSent) {

          for (const index of [...opened].filter(i => !finished.has(i))) {
            finished.add(index)
            chunks.push({
              type: 'block-end',
              index,
              block: blockFor(index, textByIndex, toolIdByIndex, toolNameByIndex, toolArgsByIndex),
            })
          }
          if (frame.usage !== null && typeof frame.usage === 'object' && frame.usage !== undefined) {
            const { tokens } = mapUsage(frame.usage as Record<string, unknown>)
            if (!usageSent) {
              chunks.push({ type: 'usage', usage: tokens })
              usageSent = true
            }
          }
          const finish = mapFinish(reason)
          if (finish === undefined) {
            throw LlmError.fromFailure({ message: 'CodeBuddy 返回了未知的结束原因：' + reason, code: 'PROVIDER' })
          }
          chunks.push({
            type: 'finish',
            reason: finish,
            replayState: { response: { model, usage: frame.usage ?? null } },
          })
          finishSent = true
        } else if (frame.usage !== null && typeof frame.usage === 'object' && frame.usage !== undefined) {


          const { tokens } = mapUsage(frame.usage as Record<string, unknown>)
          if (!usageSent && !finishSent) {
            chunks.push({ type: 'usage', usage: tokens })
            usageSent = true
          }
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
