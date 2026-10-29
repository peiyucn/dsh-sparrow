/**
 * CodeBuddy 自建适配器：不走 pi-ai 协议层，直接按 CodeBuddy 方言发请求。
 * 本文件只做**请求编排**（构造 body / 发请求 / 错误透传 / 空闲超时 / 取消 / 11128 有界降级），
 * 消息转 wire 见 `adapter/wire.ts`，SSE 解析见 `adapter/sse.ts`，流状态机与 usage 见 `adapter/stream.ts`。
 * 别改的方言行为：stream: true 恒定（非流式服务端 11101）；usage 帧含 credit
 * （DSH 无此字段，随 replayState 持久化）；企业策略错误（如 10081 ip not in whitelist）原样透传服务端文案。
 */

import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { chatHeaders, effortName } from './catalog.js'
import type { CodeBuddyModelFacts } from './catalog.js'
import { BASE_URL, DEFAULT_CONTEXT_WINDOW, DISPLAY_NAME } from './constants.js'
import {
  NEUTRALIZER_MARKERS,
  neutralizeChannelFingerprints,
  neutralizeWithMarker,
  stripChannelFingerprints,
} from './fingerprints.js'
import { effectiveReasoningEffort, streamFrames } from './adapter/stream.js'
import type { CodeBuddyReadImage, NeutralizeText } from './adapter/wire.js'
import { toWireMessages, toWireTools } from './adapter/wire.js'

export type { CodeBuddyReadImage } from './adapter/wire.js'
export { parseSseLine } from './adapter/sse.js'
export { effectiveReasoningEffort, mapFinish, mapUsage } from './adapter/stream.js'
export { toWireMessages, toWireTools } from './adapter/wire.js'

/** 自适应阶梯的一格：id 只用于诊断，transform 是正文变换。 */
export interface AdaptiveRung {
  id: string
  transform: NeutralizeText
}

/**
 * 阶梯单一来源（顺序见 `docs/spec/01-runtime-adaptation.md`）：
 * 默认 CGJ → 候选池其余字符 → 整行删除兜底。上游归一化收掉一格就前进一格；
 * 全部用尽即报错等发版（不做二分探测，避免在账号上刷探测流量）。
 */
export const ADAPTIVE_RUNGS: readonly AdaptiveRung[] = [
  { id: 'cgj', transform: neutralizeChannelFingerprints },
  ...NEUTRALIZER_MARKERS.slice(1).map((marker, index) => ({
    id: `marker-${String(index + 2)}`,
    transform: neutralizeWithMarker(marker),
  })),
  { id: 'strip', transform: stripChannelFingerprints },
]

/** 阶梯用尽时的用户可见提示（追加在服务端文案之后）。 */
const ADAPT_EXHAUSTED_HINT = '已尝试自动降级，仍被拒；需升级插件'

export interface CodeBuddyAdapterOptions {
  /** 当前生效的模型事实（设置节驱动，每次调用现读）。 */
  models(): readonly CodeBuddyModelFacts[]
  resolveApiKey(): Promise<string>
  /** 企业上下文（uid/enterpriseId 出自 /v2/accounts）。 */
  account(): { userId?: string; enterpriseId?: string } | undefined
  /** 流式读取空闲超时（毫秒）。 */
  streamIdleTimeoutMs: number
  /** 宿主读取本适配器模型目录时的回调（模型选择器建目录触发），插件侧在此做节流后台刷新。 */
  onCatalogRead?: () => void
  /** 图片字节读取（官方附件 seam）；未配置时带图请求以明确错误失败。 */
  readImage?: CodeBuddyReadImage
  maxMode?: () => boolean
  /** 「自适应 API 拦截」开关（设置节驱动，缺省开）。 */
  autoAdapt?: () => boolean
}

/** 400 错误体只解析一次：code 供 11128 判定，msg 供错误透传（避免二次读体）。 */
async function readErrorDetail(response: Response): Promise<{ code?: unknown; msg?: string }> {
  try {
    const body = await response.json() as { code?: unknown; msg?: unknown }
    return {
      ...(body.code === undefined ? {} : { code: body.code }),
      ...(body.msg === undefined ? {} : { msg: String(body.msg) }),
    }
  } catch {
    // 非 JSON 错误体：交给状态码兜底
    return {}
  }
}

/** 非 2xx 响应 → LlmError（服务端 code/msg 原样透传，如 10081 ip whitelist）。 */
function rejectionError(status: number, detail: { code?: unknown; msg?: string }, hint?: string): never {
  const text = detail.msg ?? (detail.code === undefined ? '' : 'code ' + String(detail.code))
  const base = text.length > 0
    ? 'CodeBuddy 请求被拒（HTTP ' + String(status) + '）：' + text
    : 'CodeBuddy 请求失败（HTTP ' + String(status) + '）'
  throw new LlmError(hint === undefined ? base : base + '（' + hint + '）', 'PROVIDER', { status })
}

/** CodeBuddy 推理适配器：请求编排、流取消/超时、模型事实投影、11128 有界降级。 */
export class CodeBuddyAdapter extends LlmAdapter {
  /** 当前生效的阶梯位置（进程内；失败前进、成功记住）。见 `docs/spec/01-runtime-adaptation.md`。 */
  private rungIndex = 0

  constructor(private readonly config: CodeBuddyAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: DISPLAY_NAME }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.config.onCatalogRead?.()
    return Promise.resolve(this.config.models().map(model => ({
      provider,
      id: model.id,
      name: model.name,
      // 显式声明输入模态：text-only 是「明确的负能力」，视觉模型才带 image。
      inputModalities: model.input,
      ...(model.description === undefined ? {} : { description: model.description }),
    })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const facts = this.config.models().find(entry => entry.id === model)
    const info: LlmResolvedModelInfo = {
      provider,
      id: model,
      name: facts?.name ?? model,
      context: { contextWindow: facts?.contextWindow ?? DEFAULT_CONTEXT_WINDOW },
      ...(facts === undefined ? {} : { inputModalities: facts.input }),
      ...(facts?.description === undefined ? {} : { description: facts.description }),
    }
    if (facts?.reasoning === true && facts.thinkingLevelMap !== undefined) {
      const levels = Object.keys(facts.thinkingLevelMap)
      info.reasoning = {
        efforts: levels.map(level => ({ id: level as never, name: effortName(level) })),
        ...(facts.defaultEffort !== undefined && levels.includes(facts.defaultEffort)
          ? { defaultEffort: facts.defaultEffort as never }
          : {}),
      }
    }
    return Promise.resolve(info)
  }

  // 与官方基类同款命名（`_signal`）：本适配器不消费 prepare 期的取消信号
  // （取消在 stream 期经 options.signal 处理），下划线前缀即表达「有意未用」。
  override async prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return {
      model: await this.resolveModel(provider, model),
      stream: options => this.stream(options),
    }
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithKey(options)
  }

  private async * streamWithKey(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const apiKey = await this.config.resolveApiKey()
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    const timer = setTimeout(() => consumer.abort(new Error('stream idle timeout')), this.config.streamIdleTimeoutMs)
    try {
      const iterator = this.request(options, apiKey, upstream, () => {
        timer.refresh()
      })[Symbol.asyncIterator]()
      while (true) {
        const { done, value } = await iterator.next()
        if (done) return
        yield value
      }
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        throw new LlmError('CodeBuddy 请求已被取消', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError('CodeBuddy 推理流失败', 'TRANSPORT', { cause: error })
    } finally {
      clearTimeout(timer)
      consumer.abort('CodeBuddy stream consumer stopped')
    }
  }

  /** 按指定正文变换构造请求体：阶梯每一格都从 options 重建，内容一致、只换变换。 */
  private async buildBody(options: GenerateOptions, neutralize: NeutralizeText): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: await toWireMessages(options, this.config.readImage, neutralize),
      stream: true,
    }
    if (options.tools !== undefined && options.tools.length > 0) body.tools = toWireTools(options.tools)
    if (options.temperature !== undefined) body.temperature = options.temperature
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
    if (options.stop !== undefined && options.stop.length > 0) body.stop = options.stop
    // Max 模式（档位锁）开且模型有推理能力时强制 max，覆盖调用方档位。
    const facts = this.config.models().find(entry => entry.id === options.model)
    const effort = effectiveReasoningEffort(
      this.config.maxMode?.() ?? false,
      facts?.reasoning === true,
      options.reasoningEffort,
    )
    if (effort !== undefined) body.reasoning_effort = effort
    return body
  }

  private async * request(
    options: GenerateOptions,
    apiKey: string,
    signal: AbortSignal,
    onActivity: () => void,
  ): AsyncIterable<StreamChunk> {
    const account = this.config.account()
    const adaptEnabled = this.config.autoAdapt?.() !== false
    const rungs = adaptEnabled ? ADAPTIVE_RUNGS : ADAPTIVE_RUNGS.slice(0, 1)
    // 记住的成功位置可能超出本次可用阶梯（开关被关过）：夹到范围内。
    const start = Math.min(this.rungIndex, rungs.length - 1)
    let exhausted: { status: number; detail: { code?: unknown; msg?: string } } | undefined
    for (let index = start; index < rungs.length; index += 1) {
      const rung = rungs[index] as AdaptiveRung
      const body = await this.buildBody(options, rung.transform)
      const response = await fetch(BASE_URL + '/chat/completions', {
        method: 'POST',
        headers: {
          ...chatHeaders(apiKey, account),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      })
      if (!response.ok) {
        const detail = await readErrorDetail(response)
        // 只有渠道校验拒绝（400/11128）才降级；鉴权 / IP 白名单 / 参数错误重试无意义，原样透传。
        if (adaptEnabled && response.status === 400 && detail.code === 11128) {
          exhausted = { status: response.status, detail }
          // 并发流可能重复前进一格：只是多一次同格重试，可接受（不做锁）。
          this.rungIndex = Math.min(index + 1, rungs.length - 1)
          continue
        }
        rejectionError(response.status, detail)
      }
      if (response.body === null) throw new LlmError('CodeBuddy 返回了空响应流', 'TRANSPORT')
      // 该格可用：记住位置，后续请求直接从它开始。
      this.rungIndex = index
      yield* streamFrames(response.body, options.model, onActivity)
      return
    }
    if (exhausted !== undefined) rejectionError(exhausted.status, exhausted.detail, ADAPT_EXHAUSTED_HINT)
    // 理论上不可达（rungs 至少一格，非 11128 分支已抛错）；防御性兜底。
    throw new LlmError('CodeBuddy 上游渠道校验拒绝', 'PROVIDER', { status: 400 })
  }
}
