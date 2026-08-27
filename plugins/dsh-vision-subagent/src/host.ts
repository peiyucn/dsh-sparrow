/** dsh-vision-subagent host half：门禁放行 + vision_read 工具。 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import {
  contentBlocksToText, findImageReference, normalizeVisionConfig, parseVisionReport,
  renderVisionReport, shouldClearInputModalities, VisionCache, type VisionConfig, type VisionReport,
} from './vision.js'

export const name = 'dsh-vision-subagent'
export const inject = ['llm', 'tools', 'attachments', 'subagents']

export type { VisionConfig, VisionReport }

const TOOL_NAME = 'vision_read'

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

/** 子代理 structured output 的 ObjectJsonSchema（raw JSON Schema 子集）。 */
const VISION_REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: '图片内容的中文一句话摘要' },
    ocrText: { type: 'string', description: '图片中的逐字文本；没有文字时省略' },
    tables: { type: 'array', items: { type: 'string' }, description: '图片中的表格，每表一个字符串；没有表格时省略' },
    layout: { type: 'string', description: '版式分区描述；简单图片可省略' },
  },
  required: ['summary'],
} as const satisfies ObjectJsonSchema

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

  // 2. vision_read 工具：附件引用反查 → 读图校验 → 官方 vision 子代理 → 结构化报告缓存。
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Read an image already attached to this conversation with a vision subagent. Use this tool when the user asks about a pasted image and the main model cannot see images directly. The image stays inside the DeepSeek provider account and is never sent to a third party.',
    parameters: {
      attachmentId: {
        type: 'string',
        required: true,
        description: 'The opaque attachment id shown in the conversation image block placeholder.',
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
      const ref = findImageReference(agent.session.events, attachmentId)
      if (ref === undefined) {
        throw new Error(`vision_read: attachment "${attachmentId}" 不在当前会话中（附件可能已释放）`)
      }

      const cacheKey = String(ref.attachmentId)
      const cached = cache.get(cacheKey)
      if (cached !== undefined) return cached

      // 先走官方附件 seam 确认图片字节可读；只传 ref，不复制内部文件。
      await ctx.attachments.readImage(ref, exec.signal)

      const question = typeof args.question === 'string' && args.question.trim() !== ''
        ? args.question.trim()
        : '请完整阅读这张图片并给出结构化报告。'
      const prompt: ContentBlock[] = [
        {
          type: 'text',
          text: `${question}\n\n输出 JSON 对象：summary（一句话摘要）、ocrText（逐字文本，可选）、tables（表格，可选）、layout（版式，可选）。不要编造图中没有的内容。`,
        },
        { type: 'image', attachment: ref },
      ]

      const run = await ctx.subagents.start(settings.subagentProvider, {
        label: TOOL_NAME,
        prompt,
        parent: agent,
        signal: exec.signal,
        agentOptions: { model: settings.visionModel },
        outputSchema: VISION_REPORT_JSON_SCHEMA,
      })
      try {
        const result = await run.result
        if (result.stopReason !== 'completed') {
          const diagnostic = result.diagnostic === undefined ? result.stopReason : `${result.stopReason}: ${result.diagnostic}`
          throw new Error(`vision_read 子代理未完成：${diagnostic}`)
        }
        const report = parseVisionReport(result.structured, contentBlocksToText(result.output))
        cache.set(cacheKey, report)
        return report
      } finally {
        try {
          await run.dispose()
        } catch {
          // 结果已拿到；释放失败不覆盖工具结果。
        }
      }
    },
  })), 'dsh-vision-subagent: vision_read tool')
}
