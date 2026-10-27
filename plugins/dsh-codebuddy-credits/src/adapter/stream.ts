/**
 * CodeBuddy 流状态机：SSE 帧 → DSH StreamChunk（块索引映射、终块组装、usage / finish）。
 *
 * 别改的方言行为：SSE delta 的 content 与 reasoning_content 分离；usage 帧含 credit
 * （DSH 无此字段，随 replayState 持久化给积分重放）；终帧必须按官方顺序
 * 收尾已开块（携带累计全量）→ usage → finish；finish 之后不再向流里补块。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { parseSseLine } from './sse.js'

/** 思考档位 → 线格式。wire 拼写按档位名直发（待公司网络实测确认）。 */
function wireReasoningEffort(effort: GenerateOptions['reasoningEffort']): string | undefined {
  return effort === undefined ? undefined : String(effort)
}

/** Max 模式（推理档位锁）的最终生效档位（纯函数，供单测）：锁开且模型有推理能力即强制
 *  "max"，服务端宽容接受未声明的 max，别改成先校验档位白名单。 */
export function effectiveReasoningEffort(
  maxMode: boolean,
  modelReasoning: boolean,
  effort: GenerateOptions['reasoningEffort'],
): string | undefined {
  if (maxMode && modelReasoning) return 'max'
  return wireReasoningEffort(effort)
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

/** 已开块的最终 ContentBlock 组装（block-end 携带）——必须带累计的完整内容：空内容终块
 *  会让流式过程可见、结果消失，工具调用变成「unknown tool ""」。 */
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

/** 消费上游 SSE 响应体，按帧产出 DSH 流块；`onActivity` 在每次读到数据后调用（刷新空闲计时）。 */
export async function* streamFrames(
  body: ReadableStream<Uint8Array>,
  model: string,
  onActivity: () => void,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // 块索引：reasoning=0、text=1、tool 调用从 2 起
  const TOOL_BASE = 2
  /** wire 工具 index（0 起）→ 块索引（≥TOOL_BASE）。 */
  const toolIndexByWire = new Map<number, number>()
  /** 无 wire index 的方言：工具 id → 块索引。 */
  const toolIndexById = new Map<string, number>()
  let nextToolIndex = TOOL_BASE
  const opened = new Set<number>()
  const finished = new Set<number>()
  // block-end 必须带累计全量（DSH 以终块组装最终消息）。
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
            // wire 工具 index 是 0 起（同消息内编号），块索引空间是 0=reasoning、
            // 1=text、工具 ≥TOOL_BASE——必须映射，不能直用。
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
              // 无 index 的方言：按 id 兜底映射。
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
          // 终帧：按官方顺序先收尾所有已开块（携带累计全量内容）→ usage → finish。
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
            throw new LlmError('CodeBuddy 返回了未知的结束原因：' + reason, 'PROVIDER')
          }
          chunks.push({
            type: 'finish',
            reason: finish,
            replayState: { response: { model, usage: frame.usage ?? null } },
          })
          finishSent = true
        } else if (frame.usage !== null && typeof frame.usage === 'object' && frame.usage !== undefined) {
          // 尾随 usage 帧（终帧之后到达）：块已收尾，不再向流里补发 usage 块——
          // finish 之后再推块违反消费端契约。
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
