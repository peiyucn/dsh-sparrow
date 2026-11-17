

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { CodeBuddyModelFacts } from '../catalog.js'


export const IMAGE_REJECTION_HINT = '本次请求包含图片；该模型可能不支持图片输入，请换用支持图片的模型'


export function outboundImageCount(messages: GenerateOptions['messages']): number {
  let count = 0
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const block of message.content) if (block.type === 'image') count += 1
  }
  return count
}


export function assertImageCapable(model: string, facts: CodeBuddyModelFacts | undefined, images: number): void {
  if (images === 0) return
  if (facts === undefined) {
    throw new LlmError(
      `暂时无法确认模型 "${model}" 是否支持图片输入（模型目录尚未加载）；请稍后重试，或切换到支持图片的模型`,
      'UNSUPPORTED_CONTENT',
    )
  }
  if (!facts.input.includes('image')) {
    throw new LlmError(`模型 "${model}" 不支持图片输入，请切换到支持图片的模型`, 'UNSUPPORTED_CONTENT')
  }
}
