

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message, ToolCallBlock, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { FALLBACK_SYSTEM_PROMPT } from '../constants.js'
import { neutralizeChannelFingerprints } from '../fingerprints.js'


export type CodeBuddyReadImage = (
  ref: ImageAttachmentRef,
  signal?: AbortSignal,
) => Promise<{ mediaType: string; data: Uint8Array }>


export type NeutralizeText = (text: string) => string

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


function textOf(blocks: readonly ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
  }
  return text
}


async function imageDataUrl(ref: ImageAttachmentRef, readImage: CodeBuddyReadImage, signal?: AbortSignal): Promise<string> {
  const stored = await readImage(ref, signal)
  return `data:${stored.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`
}


export async function toWireMessages(
  options: GenerateOptions,
  readImage?: CodeBuddyReadImage,
  neutralize: NeutralizeText = neutralizeChannelFingerprints,
): Promise<WireMessage[]> {
  const messages: WireMessage[] = []
  const source = options.messages as Message[]



  let start = 0
  let systemText = options.system ?? ''
  if (systemText.trim().length === 0 && source[0]?.role === 'system') {
    systemText = textOf(source[0].content)
    start = 1
  }
  const system = neutralize(systemText)
  messages.push({
    role: 'system',
    content: system.trim().length === 0 ? FALLBACK_SYSTEM_PROMPT : system,
  })
  for (let index = start; index < source.length; index += 1) {
    const message = source[index] as Message
    if (message.role === 'system') {
      messages.push({ role: 'system', content: neutralize(textOf(message.content)) })
      continue
    }

    if (message.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: String(message.toolCallId),
        content: textOf(message.content),
      })
      continue
    }


    if (message.role === 'developer') {
      throw new LlmError('CodeBuddy 适配器无法表示 developer 消息', 'UNSUPPORTED_CONTENT')
    }
    if (message.role === 'user') {

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


    if (text.length > 0) assistant.content = neutralize(text)
    if ((assistant.tool_calls?.length ?? 0) === 0) assistant.tool_calls = undefined
    else if (assistant.content === null) assistant.content = ''
    messages.push(assistant)
  }
  return messages
}


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
