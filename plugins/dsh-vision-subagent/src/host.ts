/** dsh-vision-subagent host half：门禁放行 + vision_read 工具（直连 ctx.llm 视觉模型）。 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import {
  extractJsonObject, findImageReference, isDeepseekMainRoute, mainRouteFromSession, normalizeVisionConfig,
  parseVisionReport, renderVisionReport, shouldClearInputModalities, VisionCache, type VisionConfig, type VisionReport,
} from './vision.js'

export const name = 'dsh-vision-subagent'
export const inject = ['llm', 'tools', 'attachments']

export type { VisionConfig, VisionReport }

const TOOL_NAME = 'vision_read'

/** 把超长的 sha256 附件 id 截短展示（错误消息里列候选用）。 */
function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 18)}…` : id
}

/** defineTool 输出 schema（ValueSchemaSpec DSL）：工具回传主模型的契约。 */
const VISION_REPORT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', required: true, description: '图片内容的中文一句话摘要' },
    ocrText: { type: 'string', description: '图片中的逐字文本；没有文字时省略' },
    tables: { type: 'array', items: { type: 'string' }, description: '图片中的表格，每表一个字符串；没有表格时省略' },
    layout: { type: 'string', description: '版式分区描述；简单图片可省略' },
  },
} as const

/**
 * host half 入口：包装 resolveModelInfo 放行文本路由，并注册 vision_read。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<VisionConfig>> = {}): void {
  const settings = normalizeVisionConfig(config)
  const cache = new VisionCache(settings.cacheMaxEntries)

  // 1. 门禁放行：可逆包装，只影响配置的文本路由。
  const llm = ctx.llm
  const originalResolveModelInfo = llm.resolveModelInfo.bind(llm) as typeof llm.resolveModelInfo
  llm.resolveModelInfo = (async (provider, model, signal) => {
    const info = await originalResolveModelInfo(provider, model, signal)
    if (shouldClearInputModalities(info.provider, info.id, info.inputModalities, settings.textRoutes)) {
      return { ...info, inputModalities: undefined }
    }
    return info
  }) as typeof llm.resolveModelInfo
  ctx.effect(() => () => {
    llm.resolveModelInfo = originalResolveModelInfo
  }, 'dsh-vision-subagent: restore resolveModelInfo')

  // 2. vision_read 工具：附件引用反查 → 读图校验 → 直连 ctx.llm 视觉模型 → 结构化报告缓存。
  //    实测结论：走 subagents 时单次看图约 46s（子代理 agent 循环 + 系统提示 + 思考），
  //    直连视觉模型约 2.2s，因此不再起子代理。
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Read an image already attached to this conversation with a vision subagent. Use this tool when the user asks about a pasted image and the main model cannot see images directly. The image stays inside the DeepSeek provider account and is never sent to a third party.',
    parameters: {
      attachmentId: {
        type: 'string',
        required: true,
        description: 'The opaque attachment id shown in the conversation image block placeholder. 会话图片的 attachmentId 形如 sha256:<64位哈希>；界面占位符里只露出短哈希时直接传短哈希即可，插件会按唯一前缀解析。',
      },
      question: {
        type: 'string',
        description: 'Optional question to focus the visual analysis.',
      },
    },
    output: {
      schema: VISION_REPORT_OUTPUT_SCHEMA,
      render: (_args, value: VisionReport) => [{
        type: 'text',
        text: renderVisionReport(value),
      }],
    },
    isConcurrencySafe: () => true,
    timeoutMs: 120_000,
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) {
        throw new Error('vision_read requires a calling agent (exec.agent was undefined)')
      }
      const attachmentId = args.attachmentId as string
      const lookup = findImageReference(agent.session.events, attachmentId)
      if (!lookup.ok) {
        const ids = lookup.matches.length > 0
          ? lookup.matches.map(id => shortId(id)).join(', ')
          : '（会话中没有任何图片附件）'
        if (lookup.reason === 'ambiguous') {
          throw new Error(`vision_read: attachment "${attachmentId}" 前缀匹配到多个图片，请提供更完整的 id：${ids}`)
        }
        throw new Error(`vision_read: attachment "${attachmentId}" 不在当前会话中（附件可能已释放）。会话中的图片 id：${ids}`)
      }
      const ref = lookup.ref

      // 主模型不是 DeepSeek 系列时禁用（用户在非 deepseek 模型会话中无视觉功能）。
      const main = mainRouteFromSession(agent.session.events)
      if (!isDeepseekMainRoute(main)) {
        throw new Error(`vision_read: 当前主模型 ${main?.provider ?? '?'}/${main?.model ?? '?'} 不是 DeepSeek 系列，视觉功能已禁用`)
      }

      const cacheKey = String(ref.attachmentId)
      const cached = cache.get(cacheKey)
      if (cached !== undefined) return cached

      // 先走官方附件 seam 确认图片字节可读；只传 ref，不复制内部文件。
      await ctx.attachments.readImage(ref, exec.signal)

      const question = typeof args.question === 'string' && args.question.trim() !== ''
        ? args.question.trim()
        : '请完整阅读这张图片并给出结构化报告。'
      const promptText = `${question}\n\n输出 JSON 对象：summary（一句话摘要）、ocrText（逐字文本，可选）、tables（表格，可选）、layout（版式，可选）。只输出 JSON 本体，不要输出解释或代码围栏。不要编造图中没有的内容。`

      const prepared = await ctx.llm.prepareCall({
        provider: settings.visionProvider,
        model: settings.visionModel,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      }, exec.signal)
      let text = ''
      let reasoning = ''
      for await (const chunk of prepared.stream({
        ...prepared.config,
        messages: [createUserMessage({
          content: [
            { type: 'text', text: promptText },
            { type: 'image', attachment: ref },
          ],
          source: { kind: 'user' },
        })],
        signal: exec.signal,
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        if (chunk.type === 'reasoning-delta') reasoning += chunk.text
      }
      // 思考型模型可能把输出全部花在 reasoning 上、正文为空：用思考文本兜底。
      const raw = text.trim() === '' ? reasoning.trim() : text.trim()
      if (raw === '') {
        throw new Error('vision_read 上游没有返回文本')
      }
      const report = parseVisionReport(extractJsonObject(raw), raw)
      cache.set(cacheKey, report)
      return report
    },
  })), 'dsh-vision-subagent: vision_read tool')
}
