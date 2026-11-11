/**
 * 图片能力预检：把「模型事实」翻译成用户可读的失败，避免把图片漏给不支持图片的上游。
 *
 * 上游对「带了它不接受的图片」只回通用 400（`the request parameters were rejected by the model
 * provider`），用户看不出是图片的问题；而宿主官方的门禁 / 文本投影都依赖适配器声明的
 * `inputModalities`，适配器一旦漏报（事实为空 / 模型不在目录），图片就会漏出去。
 * 与 `adapter.ts` 拆开是为了让请求编排文件保持在结构守卫的行数上限内。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { CodeBuddyModelFacts } from '../catalog.js'

/** 带图请求被上游 400 拒绝时追加的提示：上游只给通用「参数被拒」，这里点出最可能的原因。 */
export const IMAGE_REJECTION_HINT = '本次请求包含图片；该模型可能不支持图片输入，请换用支持图片的模型'

/** 本次请求会真正发给上游的图片块数：只有 user 消息里的图片会转成 image_url（工具结果图片被丢弃）。 */
export function outboundImageCount(messages: GenerateOptions['messages']): number {
  let count = 0
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const block of message.content) if (block.type === 'image') count += 1
  }
  return count
}

/**
 * 图片能力预检：模型事实明确不支持、或尚未加载时，绝不把图片发给上游。
 *
 * 宿主官方门禁（prompt 准入）与纯文本模型的文本投影都依赖适配器声明的 `inputModalities`；
 * 适配器漏报时图片会漏到 CodeBuddy，上游只回通用 400，用户看不到「模型不支持图片」。
 * @param model - 本次请求的模型 id。
 * @param facts - 该模型当前的事实（未加载时为 undefined）。
 * @param images - 本次请求要发送的图片块数。
 */
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
