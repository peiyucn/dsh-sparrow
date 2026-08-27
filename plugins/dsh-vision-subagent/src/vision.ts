/** dsh-vision-subagent 纯逻辑：配置、门禁判定、图片反查、报告解析与缓存。 */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export const DEFAULT_SUBAGENT_PROVIDER = 'spawn'
export const DEFAULT_VISION_MODEL = 'deepseek-v4-flash-vision-exp'
export const DEFAULT_CACHE_MAX_ENTRIES = 64
export const DEFAULT_TEXT_ROUTES: readonly TextRoute[] = [
  { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
]

export interface TextRoute {
  readonly provider: string
  readonly model: string
}

export interface VisionConfig {
  readonly subagentProvider: string
  readonly visionModel: string
  readonly cacheMaxEntries: number
  readonly textRoutes: readonly TextRoute[]
}

export interface VisionReport {
  readonly summary: string
  readonly ocrText?: string
  readonly tables: string[]
  readonly layout?: string
}

/** 规范化配置；文本路由为空时插件不做门禁放行（工具仍可用）。 */
export function normalizeVisionConfig(input: Readonly<Partial<VisionConfig>> | undefined): VisionConfig {
  const config: VisionConfig = {
    subagentProvider: input?.subagentProvider?.trim() || DEFAULT_SUBAGENT_PROVIDER,
    visionModel: input?.visionModel?.trim() || DEFAULT_VISION_MODEL,
    cacheMaxEntries: input?.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
    textRoutes: input?.textRoutes ?? DEFAULT_TEXT_ROUTES,
  }
  if (config.subagentProvider === '' || config.visionModel === '') {
    throw new Error('dsh-vision-subagent: subagentProvider/visionModel 不能为空')
  }
  if (!Number.isSafeInteger(config.cacheMaxEntries) || config.cacheMaxEntries <= 0) {
    throw new Error('dsh-vision-subagent: cacheMaxEntries 必须是正整数')
  }
  for (const route of config.textRoutes) {
    if (route.provider === '' || route.model === '') {
      throw new Error('dsh-vision-subagent: textRoutes 中 provider/model 不能为空')
    }
  }
  return config
}

/**
 * 门禁放行判定：仅当解析结果命中配置的文本路由，且显式 inputModalities 不含 image 时，
 * 抹除 inputModalities（undefined 表示负能力，RPC 门禁放行）。
 */
export function shouldClearInputModalities(
  provider: string,
  model: string,
  inputModalities: readonly string[] | undefined,
  routes: readonly TextRoute[],
): boolean {
  if (inputModalities === undefined) return false
  if (inputModalities.includes('image')) return false
  return routes.some(route => route.provider === provider && route.model === model)
}

/** 从会话事件中反查首个匹配 attachmentId 的图片引用（仿 api-proxy.referencedImage 的纯逻辑版）。 */
export function findImageReference(events: readonly SessionEvent[], attachmentId: string): ImageAttachmentRef | undefined {
  for (const event of events) {
    const data = event.data as {
      content?: unknown
      message?: { content?: unknown }
      inserted?: Array<{ content?: unknown }>
      chunk?: { type?: unknown; block?: unknown }
    }
    const direct = imageInContent(data.content, attachmentId)
    if (direct !== undefined) return direct
    const wrapped = data.message === undefined ? undefined : imageInContent(data.message.content, attachmentId)
    if (wrapped !== undefined) return wrapped
    if (data.inserted !== undefined) {
      for (const message of data.inserted) {
        const inserted = imageInContent(message.content, attachmentId)
        if (inserted !== undefined) return inserted
      }
    }
    if (event.type === 'assistant/chunk' && data.chunk?.type === 'block-end') {
      const chunked = imageInContent([data.chunk.block], attachmentId)
      if (chunked !== undefined) return chunked
    }
  }
  return undefined
}

function imageInContent(content: unknown, attachmentId: string): ImageAttachmentRef | undefined {
  if (!Array.isArray(content)) return undefined
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value as { type?: unknown; attachment?: unknown; content?: unknown }
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment as ImageAttachmentRef
      if (String(ref.attachmentId) === attachmentId) return ref
    }
    if (block.type === 'tool-result') {
      const nested = imageInContent(block.content, attachmentId)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** 把子代理文本输出块拼成字符串（失败兜底报告用）。 */
export function contentBlocksToText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

/** 从子代理 structured/文本结果解析结构化报告；异常输入返回安全默认值。 */
export function parseVisionReport(value: unknown, fallbackText = ''): VisionReport {
  if (typeof value === 'object' && value !== null) {
    const report = value as Record<string, unknown>
    if (typeof report.summary === 'string' && report.summary.trim() !== '') {
      return {
        summary: report.summary.trim(),
        ...typeof report.ocrText === 'string' && report.ocrText.trim() !== ''
          ? { ocrText: report.ocrText.trim() }
          : {},
        tables: Array.isArray(report.tables)
          ? report.tables.filter((row): row is string => typeof row === 'string').map(row => row.trim()).filter(row => row !== '')
          : [],
        ...typeof report.layout === 'string' && report.layout.trim() !== ''
          ? { layout: report.layout.trim() }
          : {},
      }
    }
  }
  const text = typeof value === 'string' && value.trim() !== '' ? value.trim() : fallbackText
  return {
    summary: text === '' ? '(vision_read 未返回可读内容)' : text,
    tables: [],
  }
}

/** 渲染为回传主模型的文本块文本；只保留结构化报告，不夹带图片字节。 */
export function renderVisionReport(report: VisionReport): string {
  const lines = [`[vision_read]\nsummary: ${report.summary}`]
  if (report.ocrText !== undefined) lines.push(`ocr:\n${report.ocrText}`)
  if (report.layout !== undefined) lines.push(`layout: ${report.layout}`)
  if (report.tables.length > 0) lines.push(`tables:\n${report.tables.map(table => `- ${table}`).join('\n')}`)
  return lines.join('\n')
}

/** 进程内 LRU 缓存。 */
export class VisionCache {
  private readonly entries = new Map<string, VisionReport>()

  /**
   * @param maxEntries - 上限；由配置校验保证为正整数。
   */
  constructor(readonly maxEntries: number) {
  }

  get(key: string): VisionReport | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    // 刷新为最近使用。
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: VisionReport): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  get size(): number {
    return this.entries.size
  }
}
