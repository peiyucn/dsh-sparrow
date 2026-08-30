/** dsh-vision-access 纯逻辑：配置、门禁判定、图片反查、报告解析与缓存。 */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export const DEFAULT_VISION_PROVIDER = 'deepseek-official'
export const DEFAULT_VISION_MODEL = 'deepseek-v4-flash-vision-exp'
export const DEFAULT_MAX_TOKENS = 8192
export const DEFAULT_TEMPERATURE = 0.2
export const DEFAULT_CACHE_MAX_ENTRIES = 64
/** 视觉模型思考力度；low 足够结构化读图，避免把 maxTokens 全烧在思考上。 */
export const DEFAULT_VISION_REASONING_EFFORT = 'low'
export const VISION_REASONING_EFFORTS = ['off', 'low', 'high', 'max'] as const
export type VisionReasoningEffort = (typeof VISION_REASONING_EFFORTS)[number]
export const DEFAULT_TEXT_ROUTES: readonly TextRoute[] = [
  { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
]

export interface TextRoute {
  readonly provider: string
  readonly model: string
}

export interface VisionConfig {
  readonly visionProvider: string
  readonly visionModel: string
  readonly maxTokens: number
  readonly temperature: number
  readonly visionReasoningEffort: VisionReasoningEffort
  readonly cacheMaxEntries: number
  readonly textRoutes: readonly TextRoute[]
}

export interface VisionReport {
  readonly summary: string
  readonly ocrText?: string
  readonly tables?: string[]
  readonly layout?: string
}

/** 规范化配置；文本路由为空时插件不做门禁放行（工具仍可用）。 */
export function normalizeVisionConfig(input: Readonly<Partial<VisionConfig>> | undefined): VisionConfig {
  let visionReasoningEffort: VisionReasoningEffort = DEFAULT_VISION_REASONING_EFFORT
  if (input?.visionReasoningEffort !== undefined) {
    const candidate = input.visionReasoningEffort.trim() as VisionReasoningEffort
    if (!VISION_REASONING_EFFORTS.includes(candidate)) {
      throw new Error(`dsh-vision-access: visionReasoningEffort 必须是 ${VISION_REASONING_EFFORTS.join('/')}`)
    }
    visionReasoningEffort = candidate
  }
  const config: VisionConfig = {
    visionProvider: input?.visionProvider?.trim() || DEFAULT_VISION_PROVIDER,
    visionModel: input?.visionModel?.trim() || DEFAULT_VISION_MODEL,
    maxTokens: input?.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: input?.temperature ?? DEFAULT_TEMPERATURE,
    visionReasoningEffort,
    cacheMaxEntries: input?.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
    textRoutes: input?.textRoutes ?? DEFAULT_TEXT_ROUTES,
  }
  if (config.visionProvider === '' || config.visionModel === '') {
    throw new Error('dsh-vision-access: visionProvider/visionModel 不能为空')
  }
  for (const [name, value] of Object.entries({ maxTokens: config.maxTokens, cacheMaxEntries: config.cacheMaxEntries })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`dsh-vision-access: ${name} 必须是正整数`)
    }
  }
  if (typeof config.temperature !== 'number' || !Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) {
    throw new Error('dsh-vision-access: temperature 必须是 0-2 之间的数字')
  }
  for (const route of config.textRoutes) {
    if (route.provider === '' || route.model === '') {
      throw new Error('dsh-vision-access: textRoutes 中 provider/model 不能为空')
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

/** 主模型路由：会话事件里最近一条 request/header 的 provider/model。 */
export function mainRouteFromSession(events: readonly SessionEvent[]): { provider: string; model: string } | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'request/header') continue
    const config = (event.data as { header?: { config?: { provider?: unknown; model?: unknown } } }).header?.config
    if (typeof config?.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model }
    }
  }
  return undefined
}

/** 主模型是否为 DeepSeek 系列（deepseek-official provider）；未知路由默认放行。 */
export function isDeepseekMainRoute(route: { provider: string } | undefined): boolean {
  return route === undefined || route.provider === 'deepseek-official'
}

/** 主模型本身能否直接看图：显式声明 image 能力即原生视觉（vision_read 反而有损，应隐藏）。 */
export function modelSupportsImages(inputModalities: readonly string[] | undefined): boolean {
  return inputModalities !== undefined && inputModalities.includes('image')
}

/** 唯一前缀匹配的最短查询长度；更短的 id 只做精确匹配，避免误命中。 */
export const MIN_PREFIX_MATCH_CHARS = 8

export type ImageLookupResult =
  | { readonly ok: true; readonly ref: ImageAttachmentRef }
  | { readonly ok: false; readonly reason: 'not-found' | 'ambiguous'; readonly matches: readonly string[] }

/** 归一化附件 id：去空白、剥掉 `sha256:` 前缀、统一小写。 */
export function normalizeAttachmentId(id: string): string {
  const trimmed = id.trim().toLowerCase()
  return trimmed.startsWith('sha256:') ? trimmed.slice('sha256:'.length) : trimmed
}

/**
 * 从会话事件中反查图片引用（仿 api-proxy.referencedImage 的纯逻辑版）。
 * 兼容占位符里只露出截断哈希的场景：先精确匹配，再唯一前缀匹配；歧义时返回全部候选。
 */
export function findImageReference(events: readonly SessionEvent[], attachmentId: string): ImageLookupResult {
  const refs: ImageAttachmentRef[] = []
  for (const event of events) {
    const data = event.data as {
      content?: unknown
      message?: { content?: unknown }
      inserted?: Array<{ content?: unknown }>
      chunk?: { type?: unknown; block?: unknown }
    }
    collectImageRefs(data.content, refs)
    if (data.message !== undefined) collectImageRefs(data.message.content, refs)
    if (data.inserted !== undefined) {
      for (const message of data.inserted) collectImageRefs(message.content, refs)
    }
    if (event.type === 'assistant/chunk' && data.chunk?.type === 'block-end') {
      collectImageRefs([data.chunk.block], refs)
    }
  }

  const allIds = refs.map(ref => String(ref.attachmentId))
  const query = normalizeAttachmentId(attachmentId)
  if (query === '') return { ok: false, reason: 'not-found', matches: allIds }
  for (const ref of refs) {
    if (normalizeAttachmentId(String(ref.attachmentId)) === query) return { ok: true, ref }
  }
  if (query.length >= MIN_PREFIX_MATCH_CHARS) {
    const prefixMatches = refs.filter(ref => normalizeAttachmentId(String(ref.attachmentId)).startsWith(query))
    if (prefixMatches.length === 1 && prefixMatches[0] !== undefined) {
      return { ok: true, ref: prefixMatches[0] }
    }
    if (prefixMatches.length > 1) {
      return { ok: false, reason: 'ambiguous', matches: prefixMatches.map(ref => String(ref.attachmentId)) }
    }
  }
  return { ok: false, reason: 'not-found', matches: allIds }
}

function collectImageRefs(content: unknown, refs: ImageAttachmentRef[]): void {
  if (!Array.isArray(content)) return
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value as { type?: unknown; attachment?: unknown; content?: unknown }
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment as ImageAttachmentRef
      if (!refs.some(existing => String(existing.attachmentId) === String(ref.attachmentId))) {
        refs.push(ref)
      }
    }
    if (block.type === 'tool-result') {
      collectImageRefs(block.content, refs)
    }
  }
}

/** 从模型文本输出里尽量提取 JSON 对象：容忍 markdown 代码围栏与前后杂文。 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const fences = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed)
  const candidate = fences?.[1] ?? trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return undefined
      }
    }
    return undefined
  }
}

/**
 * 选择模型输出正文：正文优先。只有思考文本、没有正文时，视为上游把 maxTokens
 * 全烧在思考上（输出被截断）或模型异常——抛明确错误，而不是把「内心独白」
 * 当报告回传（2026-08-30 实测：2048 上限 + 默认 high 思考 → 输出停在思考中途、
 * 无 JSON，旧逻辑把整段思考文本兜底成了报告并缓存）。
 */
export function resolveVisionOutput(text: string, reasoning: string): string {
  const trimmed = text.trim()
  if (trimmed !== '') return trimmed
  if (reasoning.trim() === '') {
    throw new Error('vision_read 上游没有返回文本')
  }
  throw new Error('vision_read: 视觉模型只输出了思考过程、未给出正文（可能被 maxTokens 截断）')
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
  if (report.tables !== undefined && report.tables.length > 0) lines.push(`tables:\n${report.tables.map(table => `- ${table}`).join('\n')}`)
  return lines.join('\n')
}

/** 缓存键：报告是提问相关的，同一图片换提问必须各自缓存（2026-08-30 实测：旧键只按图片 id，换提问命中旧报告）。 */
export function visionCacheKey(attachmentId: string, question: string): string {
  return `${attachmentId}\u0000${question}`
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
