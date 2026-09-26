/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）——纯能力版。
 *
 * ⚠️ **2026-09-21 起本插件会读 dsh 会话数据**（积分改由会话事件重放，见
 * `src/credits-ledger.ts`），所以**没有**会话格式门这件事需要显式记账：
 *
 * * 读的是**只读、可降级**的展示数据（会话/每轮积分）——格式认不出时后果是
 *   「积分显示为 0」，**不是**损坏用户数据。会话格式门要自停用，而本插件自停用
 *   会让用户**整个 lose 掉 LLM provider**（推理也停）——那比积分显示不准严重得多。
 *   故此处**有意不设**「格式不符即自停用」的硬门，改为软降级 + 告警：
 *   见 `src/index.ts` 对 `hostSessionFormatVersion()` 的核对与 `logger.warn`。
 * * **0.1.7 迁移已完成**：live 积分路径不再读会话历史，改读官方**会话投影**
 *   （`src/credits-projection.ts`，经 `ctx.inject(['sessionProjections'], …)` 可选注册）。
 *   投影状态由注册表按已提交事件逐事件驱动，因此**不需要**探 `snapshotEvents()` 这类
 *   类方法——能力门探不到它（根规范《扩展与宿主兼容》里「格式/版本变更往往不改 API 形状，
 *   能力探测发现不了」正是这一类）的历史问题随之消失。运行时兜底仍在
 *   `credits-source.ts` 的 `for()`：投影服务缺失 / 取状态抛错即降级到冷路径，
 *   绝不把异常冒泡进宿主管线。
 * * 冷会话仍走 `sessionController.inspect()` + 一次性重放——那是**官方公开的异步读面**，
 *   不在被废弃的同步读之列（官方对「需要完整历史」的场景明确保留显式存储读）。
 *
 * 下面的能力门是本插件**真正会带病运行**的守卫点（缺了就无法注册 provider）。
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

/**
 * 本插件构建时对齐的 dsh 会话格式版本（与 archive-manage / chat-fim 同一集合）。
 *
 * 积分重放会**逐字段解析**事件里的 `data.message.source.replayState.response.usage.credit`，
 * 会话格式换代可能改变事件布局 —— 认错就是静默读出 0。
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3]

/**
 * 宿主上报的会话格式版本。
 *
 * 用**命名空间访问**而非具名导入：官方若删除/改名该导出，这里只得到 `undefined`
 * （判定为「未知」），而不是 ESM 链接期失败——链接期失败发生在模块加载阶段，
 * 不在插件容器对 `apply` 的异常保护范围内。
 * @returns 宿主 `SESSION_FORMAT_VERSION`，或 undefined。
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}

/**
 * 会话格式是否为已知可安全处理的版本 —— **软判定**，返回原因供调用方**告警而不停用**。
 *
 * 为什么这里是软门而不是像 archive-manage / chat-fim 那样的硬门（抛错自停用）：
 * 那两个插件的**全部功能**都建立在读会话数据上，格式不认识就该整个让位；
 * 而本插件的**主体功能是 LLM provider（推理）**，积分只是展示面。格式不认识时
 * 真实的坏后果是「积分显示为 0」——为此把用户的推理能力一起停掉是**明显过度**的
 * 取舍。故这里只告警，实际读不出来由 `credits-source.ts` 的运行时兜底降级。
 * @param version - 宿主上报的 `SESSION_FORMAT_VERSION`。
 * @param supported - 本插件支持的版本集合。
 * @returns 支持时 `undefined`；否则一句原因文案。
 */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅在 ${supported.map(value => `v${value}`).join(' / ')} 上验证过积分重放`
}

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出/浏览器特性是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/**
 * 缺失的能力名（纯逻辑，供单测）。
 * @param capabilities - 本插件声明的能力。
 * @returns 未满足的能力名，按声明顺序。
 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/**
 * 能力门：任一必需能力缺失即抛错（自停用）。
 *
 * cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，dsh 与其余插件不受影响
 * （已查证 cordis `lib/index.js:1350-1362`）。抛错前先记一条面向用户的告警，
 * 说明「为什么停用、怎么恢复」。
 * @param ctx - 插件上下文（只用到 logger）。
 * @param pluginName - 插件名（日志与错误前缀）。
 * @param capabilities - 本插件声明的能力。
 */
export function assertCapabilities(
  ctx: { logger: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): void {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return
  const reason = `缺少本插件依赖的 ${missing.join('、')}`
  ctx.logger.warn(`${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`)
  throw new Error(`${pluginName}: ${reason}`)
}
