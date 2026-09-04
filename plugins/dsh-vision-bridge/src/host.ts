/** dsh-vision-bridge host half：门禁放行 + vision_read 工具（直连 ctx.llm 视觉模型）+ 能力路由（无会话依赖）。 */

import type { ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  extractJsonObject, findImageReference, isDeepseekMainRoute, mainRouteFromSession, modelSupportsImages,
  normalizeVisionConfig, parseVisionReport, renderVisionReport, resolveVisionOutput, shouldClearInputModalities,
  visionCacheKey, visionModeForRoute, VisionCache, type VisionConfig, type VisionReport,
} from './vision.js'

export const name = 'dsh-vision-bridge'
export const inject = ['llm', 'tools', 'attachments', 'webServer']

export type { VisionConfig, VisionReport }

const TOOL_NAME = 'vision_read'
const CAPABILITY_ROUTE_PATH = '/api/vision-bridge/capability'
/** vision_read 工具默认提问。 */
const DEFAULT_VISION_QUESTION = '请完整阅读这张图片并给出结构化报告。'
/** vision_read 工具超时上限（官方工具运行器据此 abort 调用信号）。 */
const VISION_READ_TIMEOUT_MS = 120_000
/** 错误消息里展示的附件 id 截断长度（超长 sha256 只露头部）。 */
const MAX_DISPLAY_ID_CHARS = 18

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

/** 把超长的 sha256 附件 id 截短展示（错误消息里列候选用）。 */
function shortId(id: string): string {
  return id.length > MAX_DISPLAY_ID_CHARS ? `${id.slice(0, MAX_DISPLAY_ID_CHARS)}…` : id
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

/** 模型能力缓存：provider:model → 是否支持图片。能力与 session 无关，
 *  进程内解析一次即可；图标高频查询（切模型/重挂载即查）不再重复解析。
 *  只缓存正结果：负结果可能是模型事实尚未装载（如启动预热早于 provider
 *  目录刷新）的假阴性，缓存会把图标永久锁在错误状态。 */
const capabilityCache = new Map<string, boolean>()

/** 解析（或读缓存）一个模型是否支持图片；解析失败按无视觉能力处理（保守）。
 *  必须用「未包装」的 resolveModelInfo：门禁包装会把文本路由的 inputModalities
 *  抹成 undefined，能力路由需要模型事实的原生声明。
 *  declared=false 表示 inputModalities 未显式声明（模型事实尚未装载，如启动
 *  预热期 provider 目录未就绪）——调用方不得当定论，客户端据 declared 补查自愈。 */
async function resolveSupportsImages(
  resolver: (provider: string, model: string, signal?: AbortSignal) => Promise<{ inputModalities?: readonly string[] }>,
  provider: string,
  model: string,
): Promise<{ supports: boolean; declared: boolean }> {
  const key = `${provider}:${model}`
  const hit = capabilityCache.get(key)
  if (hit !== undefined) return { supports: hit, declared: true }
  let supports = false
  let declared = false
  try {
    const info = await resolver(provider, model)
    declared = info.inputModalities !== undefined
    supports = modelSupportsImages(info.inputModalities)
  } catch {
    // 能力解析失败：按无视觉能力处理（保守），不缓存。
  }
  if (supports) capabilityCache.set(key, true)
  return { supports, declared }
}

/** 读共享默认模型（agentDefaultModel.currentSelection，与 composer 座位兜底同源）；
 *  服务缺失 / 读取失败返回 undefined。 */
function readDefaultModel(ctx: Context): { provider: string; model: string } | undefined {
  try {
    const service = ctx.get('agentDefaultModel') as {
      currentSelection?: () => { provider: string; model: string } | undefined
    } | undefined
    const selected = service?.currentSelection?.()
    if (selected !== undefined && typeof selected.provider === 'string' && typeof selected.model === 'string') {
      return { provider: selected.provider, model: selected.model }
    }
  } catch {
    // 服务缺失（旧版 dsh）：返回 undefined。
  }
  return undefined
}

/**
 * 读一张图并返回结构化报告（vision_read 工具与自动档共用）：
 * 缓存/在途去重 → 附件 seam 校验 → 直连官方视觉模型 → 结构化报告落缓存。
 */
async function describeImage(
  ctx: Context,
  settings: VisionConfig,
  cache: VisionCache,
  inflight: Map<string, Promise<VisionReport>>,
  ref: ImageAttachmentRef,
  question: string,
  signal: AbortSignal | undefined,
): Promise<VisionReport> {
  const cacheKey = visionCacheKey(String(ref.attachmentId), question)
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached
  // isConcurrencySafe 下同 key 可能并发：in-flight Promise 去重，避免重复视觉调用。
  const pending = inflight.get(cacheKey)
  if (pending !== undefined) return pending
  const task = (async (): Promise<VisionReport> => {
    // 已中止的信号（工具超时/回合取消）立即失败：不给已作废的调用开视觉请求。
    signal?.throwIfAborted()
    // 先走官方附件 seam 确认图片字节可读；只传 ref，不复制内部文件。
    await ctx.attachments.readImage(ref, signal)

    const promptText = `${question}

输出 JSON 对象：summary（一句话摘要）、ocrText（逐字文本，可选）、tables（表格，可选）、layout（版式，可选）。只输出 JSON 本体，不要输出解释或代码围栏。不要编造图中没有的内容。`

    const prepared = await ctx.llm.prepareCall({
      provider: settings.visionProvider,
      model: settings.visionModel,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      // 低思考力度：结构化读图不需要烧大量 reasoning，避免 maxTokens 截断。
      reasoningEffort: ReasoningEffortId(settings.visionReasoningEffort),
    }, signal)
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
      signal,
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
      if (chunk.type === 'reasoning-delta') reasoning += chunk.text
    }
    // 正文优先；只有思考文本时视为截断/异常，抛明确错误而不是把思考当报告。
    const raw = resolveVisionOutput(text, reasoning)
    const report = parseVisionReport(extractJsonObject(raw), raw)
    cache.set(cacheKey, report)
    return report
  })().finally(() => {
    inflight.delete(cacheKey)
  })
  inflight.set(cacheKey, task)
  return task
}

/**
 * host half 入口：包装 resolveModelInfo 放行文本路由，并注册 vision_read。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<VisionConfig>> = {}): void {
  const settings = normalizeVisionConfig(config)
  const cache = new VisionCache(settings.cacheMaxEntries)
  // 同 cacheKey 的 in-flight 视觉调用（isConcurrencySafe 下并发 execute 去重）。
  const inflight = new Map<string, Promise<VisionReport>>()

  // 先取原始解析器再包装：能力路由与预热要读模型事实的原生声明，
  // 不能经过文本路由抹除 inputModalities 的包装。
  const llm = ctx.llm
  const originalResolveModelInfo = llm.resolveModelInfo.bind(llm) as typeof llm.resolveModelInfo

  // 预热共享默认模型的能力：会话历史未装载时图标按默认模型显示，能力查询命中缓存、
  // 毫秒级返回，不把冷 resolveModelInfo 摊到页面首帧关键路径上。
  void (async () => {
    const selected = readDefaultModel(ctx)
    if (selected !== undefined) {
      await resolveSupportsImages(originalResolveModelInfo, selected.provider, selected.model)
    }
  })()

  // 1. 门禁放行：可逆包装，只影响配置的文本路由。
  llm.resolveModelInfo = (async (provider, model, signal) => {
    const info = await originalResolveModelInfo(provider, model, signal)
    if (shouldClearInputModalities(info.provider, info.id, info.inputModalities, settings.textRoutes)) {
      return { ...info, inputModalities: undefined }
    }
    return info
  }) as typeof llm.resolveModelInfo
  ctx.effect(() => () => {
    llm.resolveModelInfo = originalResolveModelInfo
  }, 'dsh-vision-bridge: restore resolveModelInfo')

  // 1.5 按 agent 屏蔽 vision_read（像没有这个工具）：
  //     非 deepseek 主模型；或主模型本身原生看图（图片直达主模型，转文字反而有损）。
  const restrictions = new Map<unknown, () => void>()
  const releaseRestriction = (agent: unknown): void => {
    restrictions.get(agent)?.()
    restrictions.delete(agent)
  }
  ctx.on('agent/disposed', ({ agent }) => {
    // agent 卸载时剪枝：否则 Map 无限增长并持有已死 agent 的引用。
    releaseRestriction(agent)
  })
  ctx.effect(() => () => {
    // 插件卸载时释放全部限制层；重装后才不会残留无法解除的旧 deny。
    for (const agent of [...restrictions.keys()]) releaseRestriction(agent)
  }, 'dsh-vision-bridge: release restrictions')
  ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    const agent = payload.agent
    let hide = config.provider !== 'deepseek-official'
    if (config.provider === 'deepseek-official') {
      try {
        const info = await ctx.llm.resolveModelInfo(config.provider, config.model)
        hide = modelSupportsImages(info.inputModalities)
      } catch {
        hide = false // 能力解析失败：保守启用
      }
    }
    if (hide) {
      if (!restrictions.has(agent)) {
        try {
          restrictions.set(agent, agent.ctx.tools.restrict({ deny: [TOOL_NAME] }))
        } catch {
          // 工具尚未注册或已限制：忽略，下次请求再试。
        }
      }
    } else {
      releaseRestriction(agent)
    }
    return config
  })

  // 2. vision_read 工具：附件引用反查 → 读图校验 → 直连 ctx.llm 视觉模型 → 结构化报告缓存。
  //    实测结论：走 subagents 时单次看图约 46s（子代理 agent 循环 + 系统提示 + 思考），
  //    直连视觉模型约 2.2s，因此不再起子代理。
  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Read an image already attached to this conversation with a vision model. Use this tool when the user asks about a pasted image and the main model cannot see images directly. The image stays inside the DeepSeek provider account and is never sent to a third party.',
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
    timeoutMs: VISION_READ_TIMEOUT_MS,
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) {
        throw new Error('vision_read requires a calling agent (exec.agent was undefined)')
      }
      const attachmentId = args.attachmentId as string
      const lookup = findImageReference(agent.session.snapshotEvents(), attachmentId)
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
      const main = mainRouteFromSession(agent.session.snapshotEvents())
      if (!isDeepseekMainRoute(main)) {
        throw new Error(`vision_read: 当前主模型 ${main?.provider ?? '?'}/${main?.model ?? '?'} 不是 DeepSeek 系列，视觉功能已禁用`)
      }
      // 防御二次检查：主模型本身原生看图时，图片直达主模型，转文字反而有损。
      if (main !== undefined) {
        let info: { inputModalities?: readonly string[] } | undefined
        try {
          info = await ctx.llm.resolveModelInfo(main.provider, main.model)
        } catch {
          info = undefined // 能力解析失败：继续按文本模型处理
        }
        if (info !== undefined && modelSupportsImages(info.inputModalities)) {
          throw new Error('vision_read: 当前主模型本身支持直接看图，无需视觉通道')
        }
      }

      const question = typeof args.question === 'string' && args.question.trim() !== ''
        ? args.question.trim()
        : DEFAULT_VISION_QUESTION
      return describeImage(ctx, settings, cache, inflight, ref, question, exec.signal)
    },
  })), 'dsh-vision-bridge: vision_read tool')

  // 3. 能力路由：客户端状态图标据此判定。与 session 无关——当前选中模型在客户端
  //    走官方 modelDirectories 共享目录（与模型座位同 store），这里只回答
  //    「这个 provider/model 能不能看图」。未指定模型（空白会话/历史未装载窗口）时
  //    按共享默认模型回答——该窗口内 composer 实际生效的就是默认模型（与座位兜底
  //    同源）；默认模型都读不到（旧版 dsh 缺服务）才 400。
  //    命中门禁放行文本路由的 DeepSeek 文本模型 → cross-model（vision_read 可用）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CAPABILITY_ROUTE_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { mode: 'no-vision', visionModel: settings.visionModel, declared: false })
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      let provider = url.searchParams.get('provider') ?? ''
      let model = url.searchParams.get('model') ?? ''
      if (provider === '' || model === '') {
        const selected = readDefaultModel(ctx)
        if (selected === undefined) {
          sendJson(res, 400, { mode: 'no-vision', visionModel: settings.visionModel, declared: false })
          return
        }
        provider = selected.provider
        model = selected.model
      }
      const { supports: supportsImages, declared } = await resolveSupportsImages(originalResolveModelInfo, provider, model)
      // 能力模式判定（全靠模型自身 inputModalities 属性 + 门禁放行的文本路由，不靠名字）：
      //   具备视觉能力 → native-vision（灰显）；命中文本路由的 DeepSeek 文本模型 → cross-model（点亮）；
      //   其它无视觉能力（含未配置门禁放行的 DeepSeek 文本模型）→ no-vision（带斜线，降级提示）。
      // declared 告知客户端答案是否为定论：目录未就绪时客户端据它有限补查自愈。
      sendJson(res, 200, { mode: visionModeForRoute(provider, model, supportsImages, settings.textRoutes), visionModel: settings.visionModel, declared })
    },
  }), 'dsh-vision-bridge: capability route')

  // 适配器重注册 / 凭据更新 → 清能力缓存：模型事实刷新后（如 codebuddy 目录
  // 就绪），旧的解析结果（尤其启动预热期按无视觉处理的假阴性）不能再误导图标。
  // 负结果本来就不入缓存，这里只负责清掉已缓存的正结果与可能的旧事实。
  const clearCapabilityCache = (): void => { capabilityCache.clear() }
  ctx.on('llm/adapters-updated', clearCapabilityCache)
  ctx.on('credentials/reference-updated', clearCapabilityCache)
}

