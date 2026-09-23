/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）—— 纯能力版。
 *
 * 本插件不读 dsh 会话数据，因此没有会话格式门；守卫点是**运行环境特性**
 * （`:has()` 与 container query，见 `src/nav-pin.ts` 的 `REQUIRED_CSS_FEATURES`）。
 * 判定与文案是纯逻辑，供单测。
 *
 * **本插件的门只装在 client half，且必须走「不抛错」的 {@link warnMissingCapabilities}**：
 * 客户端 boot 审计把「任一 entry 非 active」当**致命**失败（`dsh 0.1.7-alpha.1`
 * `packages/client/web/src/boot-client.ts:63-82`），插件的 `apply` 一抛错，宿主整个
 * Web UI 就停在 "Failed to load plugins" —— 那正是「插件拖垮 dsh 启动」。
 * host half 无功能、无必需服务（`src/host.ts`），故不需要门。
 */

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务 / 方法 / 导出 / 浏览器特性是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/**
 * 停用理由（与 dsh-theme-tone 的同名 helper 同一句，避免文案漂移）。
 * @param missing - 未满足的能力名。
 * @returns 「缺少本插件依赖的 X、Y」。
 */
function missingReason(missing: readonly string[]): string {
  return `缺少本插件依赖的 ${missing.join('、')}`
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
 * 面向用户的告警：cordis logger（结构化、进宿主自己的日志面）+ `console.warn`。
 *
 * 为什么两条都要写：客户端 `ctx.logger` 默认只装了一个**环形缓冲** exporter
 * （cordis `vendor/cordis/src/logger.ts:213-221`），浏览器侧没有任何 console 通道 ——
 * 只写 logger 的话，用户在页面上**永远看不到**插件为什么停了（AGENTS《鲁棒性》要求
 * 失败路径用户可见）；只写 console 又丢掉结构化日志（宿主 inspect 面用得到）。
 * 只在停用这种一次性节点上写，不进热路径。
 * @param ctx - 插件上下文（只用到 logger）。
 * @param message - 面向用户的一句话（说清「为什么停用、怎么恢复」）。
 */
export function warnUser(
  ctx: { logger?: { warn(message: string): void } },
  message: string,
): void {
  // logger 缺失也要能告警：console 是无条件的那条通道。
  ctx.logger?.warn(message)
  console.warn(message)
}

/**
 * 客户端侧能力门：任一必需能力缺失即**惰性停用** —— 记一条面向用户的告警并返回 false，
 * **绝不抛错**，由调用方直接 `return`（不注入样式 / 不注册监听）。
 *
 * 为什么客户端不能像 host half 那样抛错：客户端 boot 审计要求**每个** entry 都 active，
 * 非 active（`failed` 抛错与 `pending` 缺服务同样算）都会让 `bootClient` 抛
 * `web boot: N entry did not activate`，`AppWebEntry.run` 捕获后只渲染失败页 ——
 * **宿主整个 Web UI 起不来**（`dsh 0.1.7-alpha.1`：`packages/client/web/src/boot-client.ts:63-82`）。
 * @param ctx - 插件上下文（只用到 logger）。
 * @param pluginName - 插件名（日志前缀）。
 * @param capabilities - 本插件声明的能力。
 * @returns 能力齐备为 true；缺失则已告警，返回 false（调用方应立即 return）。
 */
export function warnMissingCapabilities(
  ctx: { logger?: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): boolean {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return true
  warnUser(ctx, `${pluginName}: ${missingReason(missing)}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`)
  return false
}

/**
 * 浏览器 CSS 特性探针。无 `CSS.supports`（非浏览器运行 / 老引擎）时返回 false —— 视为缺能力。
 * @param probe - 交给 `CSS.supports` 的特性字符串。
 * @returns 该特性是否受支持。
 */
export function cssSupports(probe: string): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  try {
    return CSS.supports(probe)
  } catch {
    return false
  }
}
