/**
 * 三个槽位组件共用的注入面与共享数据类型（Dock / Switch / Menu / client 入口只此一份）。
 * 只放类型、无运行时代码。
 */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export interface SuggestCompleteResult {
  readonly suggestions: readonly string[]
  readonly model: string
  readonly temperature: number
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
}

/** 官方共享模型目录 store 的最小面（与模型座位同 store：快照 + 订阅）。 */
export interface FimDirectoryStore {
  getSnapshot(): { current: { provider: string; model: string } | null }
  subscribe(listener: () => void): () => void
}

export interface ChatFimDockInjected {
  /** 注入面所属会话（槽工厂按 sessionId 生成）；菜单据此校验建议归属，堵跨会话误采用。 */
  readonly sessionId: SessionId
  /** 官方共享模型目录 store（ctx.modelDirectories）：选中模型与座位同源；目录不可用时 undefined。 */
  readonly directoryFor: (sessionId: SessionId) => FimDirectoryStore | undefined
  /** 查询当前会话主模型是否支持（deepseek 系列）；`null` = 宿主现在判不了（冷启动会话未激活等）。 */
  checkSupport: (sessionId: SessionId) => Promise<boolean | null>
  /** 发起一次 host 路由请求；由调用方负责陈旧响应判定。续写模型由 host 按主模型解析（auto 跟随）。 */
  requestComplete: (
    sessionId: SessionId,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<SuggestCompleteResult>
  /** 通过 scoped bail 事件把建议追加进草稿；返回是否被输入机接受。 */
  adopt: (sessionId: SessionId, text: string, span: TokenSpan) => boolean
}

export type ChatFimDockProps = PropsRuntime<'conversation.input.dock'> & ChatFimDockInjected & {
  t: TranslateNS<'chat-fim'>
  /** 会话标准 hook（ui-session 提供）；旧版 dsh 缺该 prop 时为 undefined。 */
  useProjection?: (key: string) => unknown
}
export type ChatFimSwitchProps = PropsRuntime<'conversation.input.left'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }
export type ChatFimMenuProps = PropsRuntime<'conversation.input.overlay'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }

/** 一条「建议 + 生成它的草稿快照」：菜单视图据此渲染与采用（span CAS）。 */
export interface SuggestionRecord {
  readonly text: string
  readonly sessionId: SessionId
  readonly draft: string
  readonly draftRev: number
  /** 草稿末端在 detect 坐标（TokenSpan 平面）的偏移：@ 元素每个只占 1 字符，
   *  clipboard 展开长度必须扣除（detectEndOfDraft 口径）。 */
  readonly detectEnd: number
  /** host 解析出的实际补全模型 id。 */
  readonly model: string
  /** 本次续写总 token（prompt + completion，跨并行请求求和）。 */
  readonly totalTokens: number
  /** 本次续写实际采样温度。 */
  readonly temperature: number
}
