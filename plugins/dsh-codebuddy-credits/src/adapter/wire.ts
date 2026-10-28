/**
 * DSH 消息 → CodeBuddy wire（OpenAI Chat Completions 方言）。
 *
 * 三条非显然约束：reasoning 块不进历史；工具结果是独立的 `tool` 角色消息
 * （`ToolResultMessage.toolCallId`），不是 user 消息里的 `tool-result` 内容块；
 * `developer` 消息与工具增删块无对应线格式，官方两个适配器同口径拒绝。
 * 上游只认最后一条 user 消息里的图片，故连续 user 必须合并（见 toWireMessages）。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message, ToolCallBlock, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { FALLBACK_SYSTEM_PROMPT } from '../constants.js'
import { neutralizeChannelFingerprints } from '../fingerprints.js'

/** 图片字节读取回调（附件 seam）：返回媒体类型与原始字节，供 data URL 序列化。 */
export type CodeBuddyReadImage = (
  ref: ImageAttachmentRef,
  signal?: AbortSignal,
) => Promise<{ mediaType: string; data: Uint8Array }>

interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface WireTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | unknown[] | null
  tool_calls?: WireToolCall[]
  tool_call_id?: string
}

/** 文本块合并（工具结果是独立的 tool 角色消息，`ContentBlockMap` 里没有
 *  `tool-result` 块，故工具结果不经此函数）。 */
function textOf(blocks: readonly ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
  }
  return text
}

/** 图片附件 → OpenAI 方言 image_url data URL；媒体类型以读取回调返回为准
 *  （附件字节可能被重新编码），不要从 ref 自己推断。 */
async function imageDataUrl(ref: ImageAttachmentRef, readImage: CodeBuddyReadImage, signal?: AbortSignal): Promise<string> {
  const stored = await readImage(ref, signal)
  return `data:${stored.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`
}

/** DSH Message → CodeBuddy 线格式。 */
export async function toWireMessages(
  options: GenerateOptions,
  readImage?: CodeBuddyReadImage,
): Promise<WireMessage[]> {
  const messages: WireMessage[] = []
  const source = options.messages as Message[]
  // 网关要求会话以 system 开头（空 system 会被判成 first message is not system prompt）。
  // 宿主把 system 放在 options.system；万一没有、而 messages 首条就是 system，就把它救回来；
  // 两者都没有才用最小占位。正文只做无损中和。
  let start = 0
  let systemText = options.system ?? ''
  if (systemText.trim().length === 0 && source[0]?.role === 'system') {
    systemText = textOf(source[0].content)
    start = 1
  }
  const system = neutralizeChannelFingerprints(systemText)
  messages.push({
    role: 'system',
    content: system.trim().length === 0 ? FALLBACK_SYSTEM_PROMPT : system,
  })
  for (let index = start; index < source.length; index += 1) {
    const message = source[index] as Message
    if (message.role === 'system') {
      messages.push({ role: 'system', content: neutralizeChannelFingerprints(textOf(message.content)) })
      continue
    }
    // 工具结果 → wire 的 tool 角色，用 `message.toolCallId` 作 tool_call_id。
    if (message.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: String(message.toolCallId),
        content: textOf(message.content),
      })
      continue
    }
    // developer 消息没有 CodeBuddy 线格式可映射：宁可明确失败，也不能落进 assistant
    // 分支变成空 assistant 消息（静默改写历史）。
    if (message.role === 'developer') {
      throw new LlmError('CodeBuddy 适配器无法表示 developer 消息', 'UNSUPPORTED_CONTENT')
    }
    if (message.role === 'user') {
      // 文本优先；图片块经附件 seam 读字节，转 OpenAI 方言 image_url。
      const parts: unknown[] = []
      let text = ''
      for (const block of message.content) {
        if (block.type === 'text') {
          text += block.text
        } else if (block.type === 'image') {
          if (readImage === undefined) {
            throw new LlmError('CodeBuddy 适配器未接入附件服务，无法发送图片', 'UNSUPPORTED_CONTENT')
          }
          let url: string
          try {
            url = await imageDataUrl(block.attachment, readImage, options.signal)
          } catch (error) {
            if (options.signal?.aborted) throw error
            throw new LlmError('CodeBuddy 图片读取失败', 'TRANSPORT', { cause: error })
          }
          parts.push({ type: 'image_url', image_url: { url } })
        }
      }
      // 连续 user 消息必须合并：上游网关只认最后一条 user 消息里的图片，更早的图片会被
      // 静默丢弃；而 DSH 会把 system-reminder / 技能目录等以 user 消息追加在真实用户消息
      // 之后，不合并的话带图消息永远不是最后一条。
      const previous = messages.at(-1)
      if (previous !== undefined && previous.role === 'user') {
        const merged: unknown[] = typeof previous.content === 'string'
          ? (previous.content === '' ? [] : [{ type: 'text', text: previous.content }])
          : [...(previous.content ?? []) as unknown[]]
        if (text !== '') merged.push({ type: 'text', text })
        merged.push(...parts)
        previous.content = merged.length === 0 ? '' : merged
        continue
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
    // 历史里的 assistant 正文若复述过指纹句，同样会被上游整轮拦截（跟会话走，不跟模型走），
    // 故这里也做无损中和（代码块保持原样）；tool_calls 的 arguments 不动。
    if (text.length > 0) assistant.content = neutralizeChannelFingerprints(text)
    if ((assistant.tool_calls?.length ?? 0) === 0) assistant.tool_calls = undefined
    else if (assistant.content === null) assistant.content = ''
    messages.push(assistant)
  }
  return messages
}

/** DSH 工具 schema → CodeBuddy（OpenAI 方言）tools 数组：wire 上必须包 function 信封，
 *  原样直发会被服务端以「Invalid request parameters」拒绝。 */
export function toWireTools(tools: readonly ToolSchema[]): WireTool[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}
