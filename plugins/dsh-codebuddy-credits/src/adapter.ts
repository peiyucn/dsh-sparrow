/**
 * CodeBuddy 自建适配器：不走 pi-ai 协议层，直接按 CodeBuddy 方言发请求。
 * 本文件只做**请求编排**（构造 body / 发请求 / 错误透传 / 空闲超时 / 取消），
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
import { effortName, requestHeaders } from './catalog.js'
import type { CodeBuddyModelFacts } from './catalog.js'
import { BASE_URL, DEFAULT_CONTEXT_WINDOW, DISPLAY_NAME } from './constants.js'
import { effectiveReasoningEffort, streamFrames } from './adapter/stream.js'
import type { CodeBuddyReadImage } from './adapter/wire.js'
import { toWireMessages, toWireTools } from './adapter/wire.js'

export type { CodeBuddyReadImage } from './adapter/wire.js'
export { parseSseLine } from './adapter/sse.js'
export { effectiveReasoningEffort, mapFinish, mapUsage } from './adapter/stream.js'
export { toWireMessages, toWireTools } from './adapter/wire.js'

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
}

/** 非 2xx 响应 → LlmError（服务端 code/msg 原样透传，如 10081 ip whitelist）。 */
async function providerError(response: Response): Promise<never> {
  let detail = ''
  try {
    const body = await response.json() as { code?: unknown; msg?: unknown }
    if (body.msg !== undefined) detail = String(body.msg)
    else if (body.code !== undefined) detail = 'code ' + String(body.code)
  } catch {
    // 非 JSON 错误体：用状态码兜底
  }
  const message = detail.length > 0
    ? 'CodeBuddy 请求被拒（HTTP ' + String(response.status) + '）：' + detail
    : 'CodeBuddy 请求失败（HTTP ' + String(response.status) + '）'
  throw new LlmError(message, 'PROVIDER', { status: response.status })
}

/** CodeBuddy 推理适配器：请求编排、流取消/超时、模型事实投影。 */
export class CodeBuddyAdapter extends LlmAdapter {
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

  private async * request(
    options: GenerateOptions,
    apiKey: string,
    signal: AbortSignal,
    onActivity: () => void,
  ): AsyncIterable<StreamChunk> {
    const account = this.config.account()
    const body: Record<string, unknown> = {
      model: options.model,
      messages: await toWireMessages(options, this.config.readImage),
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

    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        ...requestHeaders(apiKey, account),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) await providerError(response)
    if (response.body === null) throw new LlmError('CodeBuddy 返回了空响应流', 'TRANSPORT')

    yield* streamFrames(response.body, options.model, onActivity)
  }
}
